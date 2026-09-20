import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../../src/main/db/database';
import { WorkspaceManager } from '../../src/main/workspace/workspaceManager';
import { ProviderRegistry } from '../../src/main/providers/registry';
import { SecureKeyStore } from '../../src/main/security/keyStore';
import { BudgetGuard } from '../../src/main/limits/budgetGuard';
import { CompanyOrchestrator } from '../../src/main/agents/orchestrator';
import { IProviderAdapter, ProviderChatMessage, ProviderChatResult, ProviderTool } from '../../src/main/providers/types';
import path from 'path';
import fs from 'fs';

// Mock Provider Adapter for testing complete autonomous orchestration
class MockAutonomousAdapter implements IProviderAdapter {
  public providerType = 'mock';
  private callCount = 0;

  async chat(messages: ProviderChatMessage[], tools: ProviderTool[]): Promise<ProviderChatResult> {
    this.callCount++;

    const lastMsg = messages[messages.length - 1];
    const isCeo = messages[0].content.includes('executive CEO');

    if (isCeo) {
      if (this.callCount === 1) {
        // Step 1: CEO creates task
        return {
          text: 'I will create the initial research task.',
          toolCalls: [{
            id: 'tc_1',
            name: 'create_task',
            args: {
              title: 'Market Research for AI Newsletter',
              description: 'Analyze audience personas and top topics',
            },
          }],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        };
      } else if (this.callCount === 2) {
        // Step 2: CEO hires researcher
        return {
          text: 'Now I will hire a Research Analyst.',
          toolCalls: [{
            id: 'tc_2',
            name: 'hire_agent',
            args: {
              role: 'Research Analyst',
              prompt: 'You conduct deep market research and write notes.',
              tools: ['read_file', 'write_file', 'report_result'],
            },
          }],
          usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
        };
      } else if (this.callCount === 4) {
        // Step 4 (after worker): CEO reviews and accepts result
        return {
          text: 'The deliverable looks comprehensive and well structured. Accepting.',
          toolCalls: [{
            id: 'tc_4',
            name: 'review_result',
            args: {
              taskId: 'task_mock_1',
              decision: 'accept',
              feedback: 'Outstanding research depth and clear audience analysis.',
            },
          }],
          usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200 },
        };
      } else {
        // Final: Finish
        return {
          text: 'Primary goal achieved. Newsletter launch plan deliverable ready.',
          toolCalls: [{
            id: 'tc_final',
            name: 'finish',
            args: {
              summary: 'Market research completed and saved in deliverables/market_research.md',
            },
          }],
          usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
        };
      }
    } else {
      // Worker turn
      return {
        text: 'I have completed the market research report and saved it to deliverables.',
        toolCalls: [{
          id: 'tc_worker',
          name: 'report_result',
          args: {
            taskId: 'task_mock_1',
            summary: 'Completed competitive analysis and target persona breakdown',
            deliverablePath: 'deliverables/market_research.md',
            deliverableContent: '# AI Newsletter Market Research\n\nTarget audience: AI founders and developers.',
          },
        }],
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      };
    }
  }

  async testConnection(): Promise<{ success: boolean }> {
    return { success: true };
  }
}

describe('Autonomous Company Orchestrator End-to-End', () => {
  let db: AppDatabase;
  let workspace: WorkspaceManager;
  let keyStore: SecureKeyStore;
  let registry: ProviderRegistry;
  let budgetGuard: BudgetGuard;
  let orchestrator: CompanyOrchestrator;
  const testDir = path.join(process.cwd(), 'test-e2e-data');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    db = new AppDatabase(path.join(testDir, 'orchestrator.db'));
    workspace = new WorkspaceManager(path.join(testDir, 'workspaces'));
    keyStore = new SecureKeyStore(path.join(testDir, 'keys.enc'));
    registry = new ProviderRegistry(keyStore, db);
    budgetGuard = new BudgetGuard(db);

    // Swap adapter for model with Mock adapter
    const mockAdapter = new MockAutonomousAdapter();
    registry.getAdapterForModel = () => mockAdapter;

    orchestrator = new CompanyOrchestrator(db, workspace, registry, budgetGuard);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('runs company goal from decomposition to worker deliverable review and completion', async () => {
    const company = db.createCompany({
      name: 'Nexus Media Corp',
      description: 'Autonomous content production agency',
      goal: 'Launch tech newsletter',
      template: 'content_studio',
      budgetPerRun: 5.0,
      budgetMonthly: 50.0,
      ceoModel: 'mock-ceo',
      workerModel: 'mock-worker',
    });

    const events: string[] = [];
    orchestrator.subscribe((event) => {
      events.push(event.type);
    });

    const run = await orchestrator.startRun(company.id, { maxStepsPerAgent: 10 });
    expect(run.id).toBeDefined();

    // Wait briefly for asynchronous execution of company loop
    await new Promise(res => setTimeout(res, 800));

    // Verify company tasks were created
    const tasks = db.listTasks(company.id);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].title).toBe('Market Research for AI Newsletter');

    // Verify agents were hired
    const agents = db.listAgents(company.id);
    expect(agents.length).toBeGreaterThanOrEqual(2); // CEO + Research Analyst
    const researcher = agents.find(a => a.role === 'Research Analyst');
    expect(researcher).toBeDefined();

    // Verify run completed and recorded token spend
    const completedRun = db.getRun(run.id);
    expect(completedRun?.status).toBe('completed');
    expect(completedRun?.totalTokens).toBeGreaterThan(0);

    // Verify events were emitted to the UI channel
    expect(events).toContain('run_status_change');
    expect(events).toContain('task_status_change');
    expect(events).toContain('agent_status_change');
  });

  it('stops running agent immediately when stopRun is triggered', async () => {
    const company = db.createCompany({
      name: 'Stop Corp',
      goal: 'Long running task',
      template: 'startup',
    });

    const run = await orchestrator.startRun(company.id);
    const stopped = orchestrator.stopRun(run.id);
    expect(stopped).toBe(true);

    const updatedRun = db.getRun(run.id);
    expect(updatedRun?.status).toBe('cancelled');
  });
});
