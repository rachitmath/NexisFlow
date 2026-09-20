import { AppDatabase } from '../db/database';
import { WorkspaceManager } from '../workspace/workspaceManager';
import { ProviderRegistry } from '../providers/registry';
import { ProviderChatMessage, ProviderTool, ProviderChatResult } from '../providers/types';
import { MODEL_PRICING } from '../../shared/constants';
import { RunEvent, Agent } from '../../shared/types';
import { BudgetGuard } from '../limits/budgetGuard';

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  if (err.status === 429 || err.statusCode === 429) return true;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('resource exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('overloaded')
  );
}

function getRetryAfterDelayMs(err: any, attempt: number): number {
  const retryAfter = err?.headers?.['retry-after'] ||
    err?.response?.headers?.get?.('retry-after') ||
    err?.retryAfter;

  if (retryAfter !== undefined && retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60000);
    }
    const dateMs = Date.parse(String(retryAfter));
    if (!isNaN(dateMs)) {
      const diff = dateMs - Date.now();
      if (diff > 0) return Math.min(diff, 60000);
    }
  }

  const isTest = process.env.NODE_ENV === 'test';
  const base = isTest ? 30 : 1000;
  const jitter = isTest ? Math.random() * 10 : Math.random() * 500;
  return Math.min(base * Math.pow(2, attempt) + jitter, 30000);
}

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
  private budgetGuard: BudgetGuard;

  constructor(db: AppDatabase, workspace: WorkspaceManager, registry: ProviderRegistry, budgetGuard?: BudgetGuard) {
    this.db = db;
    this.workspace = workspace;
    this.registry = registry;
    this.budgetGuard = budgetGuard || new BudgetGuard(db);
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

      // Concurrency-safe budget reservation
      const estimatedCost = this.budgetGuard.estimateCost(agent.model, messages, 2000);
      const reserveResult = await this.budgetGuard.reserve({
        companyId,
        runId,
        estimatedCost,
        agentId: agent.id,
      });

      if (!reserveResult.allowed) {
        this.db.updateRun(runId, { status: 'paused' });
        onEvent({
          runId,
          companyId,
          type: 'run_status_change',
          timestamp: new Date().toISOString(),
          data: { status: 'paused' },
        });

        const approval = this.budgetGuard.raiseBudgetApproval(
          companyId,
          runId,
          agent.id,
          `Execution paused due to budget limit: ${reserveResult.error}`,
          {
            estimatedCost,
            limitType: reserveResult.limitType,
            agentId: agent.id,
            agentRole: agent.role,
            model: agent.model,
          }
        );

        onEvent({
          runId,
          companyId,
          type: 'approval_needed',
          timestamp: new Date().toISOString(),
          data: { approval },
        });

        return { finished: false, reason: 'budget_limit_exceeded', lastResponse: reserveResult.error };
      }

      try {
        const adapter = this.registry.getAdapterForModel(agent.model);

        let stepText = '';
        let streamedTokens = 0;
        const stepToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        let result: ProviderChatResult;

        try {
        const MAX_RATE_LIMIT_RETRIES = 3;
        let attempt = 0;

        while (true) {
          try {
            result = await adapter.chat(messages, tools, {
              model: agent.model,
              abortSignal,
              onToken: (token) => {
                streamedTokens++;
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
            break;
          } catch (err: any) {
            if (abortSignal.aborted) throw err;
            if (isRateLimitError(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
              attempt++;
              const delayMs = getRetryAfterDelayMs(err, attempt);
              console.warn(`[AgentLoop] Rate limit (429) encountered. Retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES})...`);
              await new Promise<void>((res, rej) => {
                const timeout = setTimeout(res, delayMs);
                const onAbort = () => {
                  clearTimeout(timeout);
                  rej(new Error('aborted'));
                };
                abortSignal.addEventListener('abort', onAbort, { once: true });
              });
              continue;
            }
            if (isRateLimitError(err) && attempt >= MAX_RATE_LIMIT_RETRIES) {
              throw new Error(`Rate limit (429) exceeded after ${MAX_RATE_LIMIT_RETRIES} retries: ${err?.message || 'Provider rate limit'}`);
            }
            throw err;
          }
        }

        // Compute cost from actual usage
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
      } catch (err: any) {
        // Aborted streams record partial usage if tokens were generated
        if (streamedTokens > 0) {
          const rate = MODEL_PRICING[agent.model] || { promptPerM: 1.0, completionPerM: 3.0 };
          const partialCost = (streamedTokens / 1_000_000) * rate.completionPerM;
          this.db.recordUsage({
            companyId,
            runId,
            agentId: agent.id,
            model: agent.model,
            promptTokens: 0,
            completionTokens: streamedTokens,
            totalTokens: streamedTokens,
            estimatedCost: partialCost,
          });
          onEvent({
            runId,
            companyId,
            type: 'usage_update',
            timestamp: new Date().toISOString(),
            data: {
              usage: {
                promptTokens: 0,
                completionTokens: streamedTokens,
                totalTokens: streamedTokens,
                cost: partialCost,
              },
            },
          });
        }
        throw err;
      } finally {
        await this.budgetGuard.release(reserveResult.reservationId);
      }

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
