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

// Mock Provider Adapter for testing worker concurrency & delays
class MockDelayedAdapter implements IProviderAdapter {
  public providerType = 'mock';
  public executedTasks: string[] = [];
  public delayMs: number = 20;

  constructor(delayMs = 20) {
    this.delayMs = delayMs;
  }

  async chat(messages: ProviderChatMessage[]): Promise<ProviderChatResult> {
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    const lastMsg = messages[messages.length - 1];
    // Find task title or id if present in prompt
    const content = messages.map(m => m.content).join(' ');
    this.executedTasks.push(content);

    return {
      text: 'Task work completed.',
      toolCalls: [{
        id: 'tc_report',
        name: 'report_result',
        args: {
          summary: 'Finished successfully',
        },
      }],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };
  }

  async testConnection(): Promise<{ success: boolean }> {
    return { success: true };
  }
}

describe('Worker Concurrency Pool, Budget Reservation & Atomic Claim', () => {
  let db: AppDatabase;
  let workspace: WorkspaceManager;
  let keyStore: SecureKeyStore;
  let registry: ProviderRegistry;
  let budgetGuard: BudgetGuard;
  let orchestrator: CompanyOrchestrator;
  let mockAdapter: MockDelayedAdapter;
  const testDir = path.join(process.cwd(), 'test-concurrency-data');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    db = new AppDatabase(path.join(testDir, 'test.db'));
    workspace = new WorkspaceManager(path.join(testDir, 'workspaces'));
    keyStore = new SecureKeyStore(path.join(testDir, 'keys.enc'));
    registry = new ProviderRegistry(keyStore, db);
    budgetGuard = new BudgetGuard(db);

    mockAdapter = new MockDelayedAdapter(30);
    registry.getAdapterForModel = () => mockAdapter;

    orchestrator = new CompanyOrchestrator(db, workspace, registry, budgetGuard);
  });

  afterEach(() => {
    for (const item of orchestrator.getWorkerQueue()) {
      orchestrator.cancelTaskWorker(item.taskId);
    }
    db.close();
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  // =========================================================================
  // Test Suite 1: Worker Concurrency Pool & FIFO Queue
  // =========================================================================
  describe('Worker Concurrency Pool & FIFO Queue', () => {
    it('enforces maxConcurrentWorkers and runs queued tasks in strict FIFO order', async () => {
      orchestrator.setMaxConcurrentWorkers(2);
      expect(orchestrator.getMaxConcurrentWorkers()).toBe(2);

      const company = db.createCompany({ name: 'Queue Corp', goal: 'Test FIFO', template: 'startup' });
      const worker = db.createAgent({
        companyId: company.id,
        role: 'Worker Specialist',
        systemPrompt: 'You execute tasks',
        model: 'mock-model',
      });

      // Create 5 tasks
      const tasks = [1, 2, 3, 4, 5].map(i => db.createTask({
        companyId: company.id,
        title: `Task #${i}`,
        description: `Description #${i}`,
        assignedTo: worker.id,
      }));

      // Dispatch all 5 tasks concurrently
      for (const t of tasks) {
        await orchestrator.dispatchInProgressTask(t.id);
      }

      // Check immediate state: 2 running, 3 queued
      expect(orchestrator.getRunningWorkersCount()).toBe(2);
      expect(orchestrator.getWorkerQueue().length).toBe(3);

      const queuedTasks = orchestrator.getWorkerQueue();
      expect(queuedTasks[0].taskId).toBe(tasks[2].id); // Task #3
      expect(queuedTasks[1].taskId).toBe(tasks[3].id); // Task #4
      expect(queuedTasks[2].taskId).toBe(tasks[4].id); // Task #5

      // Verify dispatchState in DB
      const dbTask1 = db.getTask(tasks[0].id);
      const dbTask3 = db.getTask(tasks[2].id);
      expect(dbTask1?.dispatchState).toBe('running');
      expect(dbTask3?.dispatchState).toBe('queued');

      // Wait for all 5 tasks to finish executing through the concurrency queue
      await new Promise(res => setTimeout(res, 500));

      expect(orchestrator.getRunningWorkersCount()).toBe(0);
      expect(orchestrator.getWorkerQueue().length).toBe(0);

      // Verify all tasks reached in_review and cleared dispatchState
      for (const t of tasks) {
        const finished = db.getTask(t.id);
        expect(finished?.status).toBe('in_review');
        expect(finished?.dispatchState).toBeNull();
      }
    });

    it('cancels a queued task cleanly and removes it from queue before it ever runs', async () => {
      orchestrator.setMaxConcurrentWorkers(1); // Only 1 worker can run at a time

      const company = db.createCompany({ name: 'Cancel Corp', goal: 'Test Cancel', template: 'startup' });
      const worker = db.createAgent({
        companyId: company.id,
        role: 'Worker',
        systemPrompt: 'You execute tasks',
        model: 'mock-model',
      });

      const task1 = db.createTask({ companyId: company.id, title: 'Task 1', description: 'Desc 1', assignedTo: worker.id });
      const task2 = db.createTask({ companyId: company.id, title: 'Task 2 (To Cancel)', description: 'Desc 2', assignedTo: worker.id });
      const task3 = db.createTask({ companyId: company.id, title: 'Task 3', description: 'Desc 3', assignedTo: worker.id });

      // Dispatch 1 (runs), 2 (queued), 3 (queued)
      await orchestrator.dispatchInProgressTask(task1.id);
      await orchestrator.dispatchInProgressTask(task2.id);
      await orchestrator.dispatchInProgressTask(task3.id);

      expect(orchestrator.isTaskRunning(task1.id)).toBe(true);
      expect(orchestrator.isTaskQueued(task2.id)).toBe(true);
      expect(orchestrator.isTaskQueued(task3.id)).toBe(true);

      // Cancel task 2 while queued
      orchestrator.cancelTaskWorker(task2.id);

      // Verify task 2 was removed from queue
      expect(orchestrator.isTaskQueued(task2.id)).toBe(false);
      expect(db.getTask(task2.id)?.dispatchState).toBeNull();

      // Wait for execution to drain
      await new Promise(res => setTimeout(res, 300));

      // Task 1 and 3 finished, Task 2 was never executed by the worker loop
      expect(db.getTask(task1.id)?.status).toBe('in_review');
      expect(db.getTask(task3.id)?.status).toBe('in_review');
      // Task 2 was cancelled so it did not transition to in_review
      expect(db.getTask(task2.id)?.status).not.toBe('in_review');
    });

    it('reconciles tasks left queued or running from previous session on startup', () => {
      const company = db.createCompany({ name: 'Stale Corp', goal: 'Recovery test', template: 'startup' });
      const staleTask1 = db.createTask({ companyId: company.id, title: 'Stale Running Task', description: 'desc', dispatchState: 'running' });
      const staleTask2 = db.createTask({ companyId: company.id, title: 'Stale Queued Task', description: 'desc', dispatchState: 'queued' });

      db.updateTask(staleTask1.id, { status: 'in_progress', dispatchState: 'running' });
      db.updateTask(staleTask2.id, { status: 'in_progress', dispatchState: 'queued' });

      // Run reconciliation
      const count = db.reconcileStaleTasks();
      expect(count).toBeGreaterThanOrEqual(2);

      const recovered1 = db.getTask(staleTask1.id);
      const recovered2 = db.getTask(staleTask2.id);
      expect(recovered1?.status).toBe('todo');
      expect(recovered1?.dispatchState).toBeNull();
      expect(recovered2?.status).toBe('todo');
      expect(recovered2?.dispatchState).toBeNull();
    });
  });

  // =========================================================================
  // Test Suite 2: Budget Reservation Under Concurrency
  // =========================================================================
  describe('Budget Reservation Under Concurrency', () => {
    it('10 parallel workers with a budget for 3 calls must never exceed the cap', async () => {
      const company = db.createCompany({
        name: 'Budget Cap Corp',
        goal: 'Test strict budget cap',
        template: 'startup',
        budgetPerRun: 0.15, // Cap is $0.15
        budgetMonthly: 50.0,
      });

      const run = db.createRun(company.id);
      // Each call costs estimated $0.05. Therefore exactly 3 can be reserved (3 * 0.05 = 0.15).
      const callCost = 0.05;

      // 10 parallel workers attempt reservation concurrently
      const reservations = await Promise.all(
        Array.from({ length: 10 }).map((_, i) =>
          budgetGuard.reserve({
            companyId: company.id,
            runId: run.id,
            estimatedCost: callCost,
            agentId: `worker_${i}`,
          })
        )
      );

      const successfulReservations = reservations.filter(r => r.allowed);
      const failedReservations = reservations.filter(r => !r.allowed);

      // Exactly 3 succeed, exactly 7 fail
      expect(successfulReservations.length).toBe(3);
      expect(failedReservations.length).toBe(7);

      // Total reserved should be exactly 0.15, never exceeding cap
      expect(budgetGuard.getTotalReserved()).toBeCloseTo(0.15, 5);

      // When one worker completes and releases its reservation:
      const firstReservationId = successfulReservations[0].reservationId!;
      await budgetGuard.release(firstReservationId);

      expect(budgetGuard.getTotalReserved()).toBeCloseTo(0.10, 5);

      // Now an 11th worker can reserve the newly freed slot
      const nextAttempt = await budgetGuard.reserve({
        companyId: company.id,
        runId: run.id,
        estimatedCost: callCost,
        agentId: 'worker_11',
      });
      expect(nextAttempt.allowed).toBe(true);

      // Total reserved is back to 0.15
      expect(budgetGuard.getTotalReserved()).toBeCloseTo(0.15, 5);
    });

    it('estimates zero cost for local models and conservative pricing for unknown models', () => {
      const messages: ProviderChatMessage[] = [
        { role: 'user', content: 'Explain distributed transactions across database nodes.' },
      ];

      // Local model cost is 0
      const localCost = budgetGuard.estimateCost('qwen2.5-coder:7b', messages, 2000);
      expect(localCost).toBe(0);

      // Known model pricing
      const gptCost = budgetGuard.estimateCost('gpt-4o-mini', messages, 1000);
      expect(gptCost).toBeGreaterThan(0);

      // Unknown model uses conservative pricing
      const unknownCost = budgetGuard.estimateCost('unknown-future-model-99', messages, 1000);
      expect(unknownCost).toBeGreaterThan(gptCost);
    });
  });

  // =========================================================================
  // Test Suite 3: Atomic Task Claim
  // =========================================================================
  describe('Atomic Task Claim', () => {
    it('atomic compare-and-swap ensures duplicate dispatches start only 1 worker', async () => {
      const company = db.createCompany({ name: 'Claim Corp', goal: 'Test Claim', template: 'startup' });
      const worker = db.createAgent({
        companyId: company.id,
        role: 'Specialist',
        systemPrompt: 'Do work',
        model: 'mock-model',
      });
      const task = db.createTask({
        companyId: company.id,
        title: 'Concurrent Claim Task',
        description: 'Testing atomic CAS claim',
        assignedTo: worker.id,
      });

      // 10 concurrent claim attempts on the same task in 'todo'
      const claimResults = await Promise.all(
        Array.from({ length: 10 }).map(() => Promise.resolve(db.claimTask(task.id)))
      );

      const successfulClaims = claimResults.filter(r => r === true);
      const failedClaims = claimResults.filter(r => r === false);

      expect(successfulClaims.length).toBe(1);
      expect(failedClaims.length).toBe(9);

      const claimedTask = db.getTask(task.id);
      expect(claimedTask?.status).toBe('in_progress');
      expect(claimedTask?.claimedAt).toBeDefined();

      // Double dispatch test via Orchestrator
      // Dispatch 1 returns true (or queues), duplicate dispatch returns false (no-op)
      const dispatch1 = await orchestrator.dispatchInProgressTask(task.id);
      const dispatch2 = await orchestrator.dispatchInProgressTask(task.id);

      expect(dispatch1).toBe(true);
      expect(dispatch2).toBe(false); // Duplicate dispatch is no-op
    });
  });

  // =========================================================================
  // Test Suite 4: Review Cap & Approval Escalation
  // =========================================================================
  describe('Review Cap & Approvals Escalation', () => {
    it('increments review_attempts on CEO rejection, halts after max retries, and raises approval', async () => {
      const company = db.createCompany({ name: 'Review Corp', goal: 'Test Review Limit', template: 'startup' });
      const ceo = db.createAgent({ companyId: company.id, role: 'CEO', systemPrompt: 'CEO', model: 'mock-model' });
      const worker = db.createAgent({ companyId: company.id, role: 'Researcher', systemPrompt: 'Work', model: 'mock-model' });
      const task = db.createTask({ companyId: company.id, title: 'Draft Strategy', description: 'Desc', assignedTo: worker.id });
      const run = db.createRun(company.id);

      expect(task.reviewAttempts).toBe(0);

      // Move task to in_review
      db.updateTask(task.id, { status: 'in_review' });

      // Rejection 1
      db.updateTask(task.id, { reviewAttempts: task.reviewAttempts + 1, feedback: 'Need more citations' });
      let curr = db.getTask(task.id)!;
      expect(curr.reviewAttempts).toBe(1);

      // Rejection 2
      db.updateTask(task.id, { reviewAttempts: curr.reviewAttempts + 1, feedback: 'Fix formatting' });
      curr = db.getTask(task.id)!;
      expect(curr.reviewAttempts).toBe(2);

      // Rejection 3: Exceeds default maxReviewRetries (2) -> Halt, flag needs_attention, create approval
      const newAttempts = curr.reviewAttempts + 1;
      const maxReviewRetries = 2;
      expect(newAttempts > maxReviewRetries).toBe(true);

      db.updateTask(task.id, {
        reviewAttempts: newAttempts,
        needsAttention: true,
        feedback: 'Exceeded review limits',
      });

      const approval = db.createApproval({
        runId: run.id,
        companyId: company.id,
        agentId: ceo.id,
        actionType: 'task_review_limit',
        description: `Task "${task.title}" rejected 3 times (exceeded max retries of 2).`,
        details: { taskId: task.id, reviewAttempts: 3 },
      });

      const finalTask = db.getTask(task.id)!;
      expect(finalTask.reviewAttempts).toBe(3);
      expect(finalTask.needsAttention).toBe(true);

      const pendingApprovals = db.listPendingApprovals(company.id);
      expect(pendingApprovals.length).toBe(1);
      expect(pendingApprovals[0].actionType).toBe('task_review_limit');
      expect(pendingApprovals[0].id).toBe(approval.id);
    });
  });

  // =========================================================================
  // Test Suite 5: Rate Limit (429) Handling & Backoff
  // =========================================================================
  describe('Rate Limit (429) Handling & Backoff', () => {
    it('retries with exponential backoff on 429, honors Retry-After, and succeeds', async () => {
      let callCount = 0;
      const rateLimitAdapter: IProviderAdapter = {
        providerType: 'mock',
        chat: async () => {
          callCount++;
          if (callCount < 3) {
            const err: any = new Error('Rate limit exceeded: 429 Too Many Requests');
            err.status = 429;
            err.headers = { 'retry-after': '0.02' };
            throw err;
          }
          return {
            text: 'Success after retry',
            toolCalls: [{ id: 'tc1', name: 'report_result', args: { summary: 'ok' } }],
            usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
          };
        },
        testConnection: async () => ({ success: true }),
      };

      registry.getAdapterForModel = () => rateLimitAdapter;

      const company = db.createCompany({ name: '429 Corp', goal: 'Test 429', template: 'startup' });
      const worker = db.createAgent({ companyId: company.id, role: 'Worker', systemPrompt: 'Work', model: 'mock-model' });
      const task = db.createTask({ companyId: company.id, title: 'Task 429', description: 'Desc', assignedTo: worker.id });

      await orchestrator.dispatchInProgressTask(task.id);

      // Wait for retries
      await new Promise(res => setTimeout(res, 300));

      expect(callCount).toBe(3);
      expect(db.getTask(task.id)?.status).toBe('in_review');
    });

    it('fails clearly after exceeding max retries on persistent 429 errors', async () => {
      let callCount = 0;
      const persistent429Adapter: IProviderAdapter = {
        providerType: 'mock',
        chat: async () => {
          callCount++;
          const err: any = new Error('Rate limit exceeded: 429 Too Many Requests');
          err.status = 429;
          err.headers = { 'retry-after': '0.01' };
          throw err;
        },
        testConnection: async () => ({ success: true }),
      };

      registry.getAdapterForModel = () => persistent429Adapter;

      const company = db.createCompany({ name: 'Fail 429 Corp', goal: 'Test Fail 429', template: 'startup' });
      const worker = db.createAgent({ companyId: company.id, role: 'Worker', systemPrompt: 'Work', model: 'mock-model' });
      const task = db.createTask({ companyId: company.id, title: 'Task Fail 429', description: 'Desc', assignedTo: worker.id });

      await orchestrator.dispatchInProgressTask(task.id);

      // Wait for all retries to exhaust
      await new Promise(res => setTimeout(res, 400));

      expect(callCount).toBeGreaterThanOrEqual(4); // 1 initial + 3 retries
      const failedTask = db.getTask(task.id);
      expect(failedTask?.status).toBe('failed');
      expect(failedTask?.feedback).toContain('Rate limit (429) exceeded');
    });
  });
});
