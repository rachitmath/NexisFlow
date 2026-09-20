import { AppDatabase } from '../db/database';
import { WorkspaceManager } from '../workspace/workspaceManager';
import { ProviderRegistry } from '../providers/registry';
import { ProviderChatMessage, ProviderTool } from '../providers/types';
import { MODEL_PRICING } from '../../shared/constants';
import { RunEvent, Agent } from '../../shared/types';

export interface AgentLoopOptions {
  companyId: string;
  runId: string;
  agent: Agent;
  tools: ProviderTool[];
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
  abortSignal: AbortSignal;
  onEvent: (event: RunEvent) => void;
  systemPromptAddendum?: string;
  initialMessage?: string;
}

export class AgentLoop {
  private db: AppDatabase;
  private workspace: WorkspaceManager;
  private registry: ProviderRegistry;

  constructor(db: AppDatabase, workspace: WorkspaceManager, registry: ProviderRegistry) {
    this.db = db;
    this.workspace = workspace;
    this.registry = registry;
  }

  public async run(options: AgentLoopOptions): Promise<{ finished: boolean; reason?: string; lastResponse?: string }> {
    const { companyId, runId, agent, tools, toolExecutor, maxSteps = 25, abortSignal, onEvent } = options;

    let systemPrompt = agent.systemPrompt;
    if (options.systemPromptAddendum) {
      systemPrompt += '\n\n' + options.systemPromptAddendum;
    }

    // Prepare message history
    const messages: ProviderChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Load recent memory notes for context
    const notes = this.db.listMemoryNotes(companyId);
    if (notes.length > 0) {
      const summary = notes.slice(0, 5).map(n => `### ${n.title}\n${n.content}`).join('\n\n');
      messages.push({
        role: 'system',
        content: `[Company Knowledge / Memory Notes]:\n${summary}`,
      });
    }

    // Kickoff user instruction so LLM has a prompt to execute
    const kickoffContent = options.initialMessage || (
      agent.role === 'CEO'
        ? 'Begin execution now. Check status, decompose the company goal into tasks, hire specialists if needed, and assign tasks.'
        : 'Please execute your assigned task and report the deliverable result.'
    );

    messages.push({
      role: 'user',
      content: kickoffContent,
    });

    let step = 0;
    let consecutiveNoToolCalls = 0;

    while (step < maxSteps) {
      if (abortSignal.aborted) {
        return { finished: false, reason: 'aborted' };
      }
      if (step > 0 && process.env.NODE_ENV !== 'test') {
        // Modest delay between consecutive tool steps to respect free-tier per-minute rate limits
        await new Promise(r => setTimeout(r, 1000));
      }
      step++;

      const adapter = this.registry.getAdapterForModel(agent.model);

      let stepText = '';
      const stepToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

      try {
        const result = await adapter.chat(messages, tools, {
          model: agent.model,
          abortSignal,
          onToken: (token) => {
            stepText += token;
            onEvent({
              runId,
              companyId,
              type: 'token',
              timestamp: new Date().toISOString(),
              data: {
                agentId: agent.id,
                agentRole: agent.role,
                token,
              },
            });
          },
          onToolCall: (tc) => {
            stepToolCalls.push(tc);
            onEvent({
              runId,
              companyId,
              type: 'tool_call',
              timestamp: new Date().toISOString(),
              data: {
                agentId: agent.id,
                agentRole: agent.role,
                toolName: tc.name,
                toolArgs: tc.args,
              },
            });
          },
        });

        // Compute cost
        const rate = MODEL_PRICING[agent.model] || { promptPerM: 1.0, completionPerM: 3.0 };
        const cost = (result.usage.promptTokens / 1_000_000) * rate.promptPerM +
                     (result.usage.completionTokens / 1_000_000) * rate.completionPerM;

        // Record usage
        this.db.recordUsage({
          companyId,
          runId,
          agentId: agent.id,
          model: agent.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          estimatedCost: cost,
        });

        onEvent({
          runId,
          companyId,
          type: 'usage_update',
          timestamp: new Date().toISOString(),
          data: {
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
              cost,
            },
          },
        });

        // Save assistant message to DB
        this.db.addMessage({
          runId,
          companyId,
          agentId: agent.id,
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        });

        messages.push({
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        });

        if (result.text) {
          onEvent({
            runId,
            companyId,
            type: 'agent_message',
            timestamp: new Date().toISOString(),
            data: {
              agentId: agent.id,
              agentRole: agent.role,
              content: result.text,
            },
          });
        }

        // If no tool calls, check if agent needs to be nudged to execute tools rather than stopping prematurely
        if (result.toolCalls.length === 0) {
          consecutiveNoToolCalls++;

          // Autonomous agents (especially the CEO) frequently formulate a plan in text first.
          // Nudge them up to 3 times to actually invoke their tools instead of shutting down the entire run.
          if (consecutiveNoToolCalls <= 3) {
            let nudge: string;
            if (agent.role === 'CEO') {
              const currentTasks = this.db.listTasks(companyId);
              if (currentTasks.length === 0) {
                nudge = 'You have established departments and hired specialists, but NO tasks have been created or assigned yet. You MUST now invoke create_task with detailed requirements and deliverables, and assign_task to put your specialists to work. Do not output text without calling tools.';
              } else {
                nudge = 'Great progress. Now continue execution by invoking the appropriate tools: create_task to add required deliverables, assign_task to start worker execution, and review_result to evaluate work. If all company goals and deliverables are completely finished, call finish(summary).';
              }
            } else {
              nudge = 'Please proceed with your task by invoking your tools (e.g. read_file, write_file, report_result). Do not merely discuss it in text.';
            }

            messages.push({
              role: 'user',
              content: nudge,
            });
            continue;
          }

          return { finished: true, lastResponse: result.text };
        }

        consecutiveNoToolCalls = 0;

        // Execute tool calls sequentially
        for (const tc of result.toolCalls) {
          if (abortSignal.aborted) {
            return { finished: false, reason: 'aborted' };
          }

          let toolOutput: unknown;
          try {
            toolOutput = await toolExecutor(tc.name, tc.args);
          } catch (err: any) {
            toolOutput = { error: err?.message || 'Tool execution failed' };
          }

          onEvent({
            runId,
            companyId,
            type: 'tool_result',
            timestamp: new Date().toISOString(),
            data: {
              agentId: agent.id,
              agentRole: agent.role,
              toolName: tc.name,
              toolResult: toolOutput,
            },
          });

          // Add tool result to message history
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput),
          });

          // Special termination tools
          if (tc.name === 'finish' || tc.name === 'report_result') {
            return { finished: true, reason: tc.name, lastResponse: JSON.stringify(toolOutput) };
          }
        }
      } catch (err: any) {
        if (abortSignal.aborted) {
          return { finished: false, reason: 'aborted' };
        }
        onEvent({
          runId,
          companyId,
          type: 'error',
          timestamp: new Date().toISOString(),
          data: {
            agentId: agent.id,
            agentRole: agent.role,
            error: err?.message || 'Error during agent execution step',
          },
        });
        throw err;
      }
    }

    return { finished: false, reason: 'max_steps_exceeded' };
  }
}
