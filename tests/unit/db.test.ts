import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../../src/main/db/database';
import path from 'path';
import fs from 'fs';

describe('AppDatabase (better-sqlite3)', () => {
  let db: AppDatabase;
  const testDbPath = path.join(process.cwd(), 'test-nexisflow.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = new AppDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('creates a company with primary goal and retrieves it', () => {
    const comp = db.createCompany({
      name: 'Alpha Newsletter',
      description: 'AI newsletter agency',
      goal: 'Launch a 3-part newsletter series',
      template: 'content_studio',
      budgetPerRun: 5.0,
      budgetMonthly: 50.0,
      ceoModel: 'gpt-4o',
      workerModel: 'gpt-4o-mini',
    });

    expect(comp.id).toBeDefined();
    expect(comp.name).toBe('Alpha Newsletter');
    expect(comp.goal).toBe('Launch a 3-part newsletter series');
    expect(comp.totalSpent).toBe(0);

    const fetched = db.getCompany(comp.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Alpha Newsletter');
  });

  it('handles agent roster creation and deduplication lookup', () => {
    const comp = db.createCompany({ name: 'Test Corp', goal: 'Test Goal', template: 'startup' });

    const agent1 = db.createAgent({
      companyId: comp.id,
      role: 'Researcher',
      systemPrompt: 'You research market trends',
      model: 'gpt-4o-mini',
      allowedTools: ['read_file', 'report_result'],
      status: 'active',
      createdBy: 'ceo',
    });

    expect(agent1.id).toBeDefined();
    expect(agent1.role).toBe('Researcher');

    const found = db.findAgentByRole(comp.id, 'researcher');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(agent1.id);

    const notFound = db.findAgentByRole(comp.id, 'Engineer');
    expect(notFound).toBeNull();
  });

  it('handles task board lifecycle and retry tracking', () => {
    const comp = db.createCompany({ name: 'Task Corp', goal: 'Build App', template: 'startup' });

    const task = db.createTask({
      companyId: comp.id,
      title: 'Draft landing page copy',
      description: 'Clear value proposition and CTA',
      dependencies: ['task_prior'],
    });

    expect(task.status).toBe('todo');
    expect(task.retryCount).toBe(0);
    expect(task.dependencies).toEqual(['task_prior']);

    // Update to in_review
    db.updateTask(task.id, { status: 'in_review', result: 'Drafted v1' });
    let updated = db.getTask(task.id);
    expect(updated?.status).toBe('in_review');

    // Reject with feedback
    db.updateTask(task.id, { status: 'in_progress', feedback: 'Needs punchier hook', retryCount: 1 });
    updated = db.getTask(task.id);
    expect(updated?.status).toBe('in_progress');
    expect(updated?.feedback).toBe('Needs punchier hook');
    expect(updated?.retryCount).toBe(1);

    // Accept
    db.updateTask(task.id, { status: 'completed', feedback: 'Approved by CEO' });
    updated = db.getTask(task.id);
    expect(updated?.status).toBe('completed');
  });

  it('tracks token usage and company spend accumulation', () => {
    const comp = db.createCompany({ name: 'Usage Corp', goal: 'Measure Spend', template: 'startup' });
    const run = db.createRun(comp.id);

    db.recordUsage({
      companyId: comp.id,
      runId: run.id,
      agentId: 'agent_1',
      model: 'gpt-4o',
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      estimatedCost: 0.05,
    });

    const updatedComp = db.getCompany(comp.id);
    expect(updatedComp?.totalSpent).toBeCloseTo(0.05);

    const updatedRun = db.getRun(run.id);
    expect(updatedRun?.totalTokens).toBe(1500);
    expect(updatedRun?.estimatedCost).toBeCloseTo(0.05);
  });

  it('handles approval creation and resolution', () => {
    const comp = db.createCompany({ name: 'Approval Corp', goal: 'Test Approvals', template: 'startup' });
    const run = db.createRun(comp.id);

    const approval = db.createApproval({
      companyId: comp.id,
      runId: run.id,
      agentId: 'agent_ceo',
      actionType: 'hire_agent',
      description: 'Requesting to hire Agent #5',
      details: { role: 'DevOps' },
    });

    expect(approval.status).toBe('pending');
    let pending = db.listPendingApprovals(comp.id);
    expect(pending.length).toBe(1);

    db.resolveApproval(approval.id, 'approved');
    pending = db.listPendingApprovals(comp.id);
    expect(pending.length).toBe(0);
  });

  it('safely provisions chat runs and avoids foreign key violations for manual messages', () => {
    const comp = db.createCompany({ name: 'Chat Corp', goal: 'Test Chat', template: 'startup' });

    // 1. Message with 'manual' runId
    const msg1 = db.addMessage({
      runId: 'manual',
      companyId: comp.id,
      agentId: null,
      role: 'user',
      content: 'Hello CEO!',
    });
    expect(msg1.id).toBeDefined();
    expect(msg1.runId).toBe(`chat_${comp.id}`);

    // 2. Message directly with chat_${comp.id} runId (as sent by orchestrator)
    const msg2 = db.addMessage({
      runId: `chat_${comp.id}`,
      companyId: comp.id,
      agentId: null,
      role: 'assistant',
      content: 'Hello Founder! Ready to build.',
    });
    expect(msg2.id).toBeDefined();

    // 3. Message with non-existent runId auto-provisions safely
    const msg3 = db.addMessage({
      runId: 'arbitrary_new_session',
      companyId: comp.id,
      agentId: null,
      role: 'user',
      content: 'Steering direction',
    });
    expect(msg3.id).toBeDefined();

    const messages = db.listMessages(`chat_${comp.id}`, comp.id);
    expect(messages.length).toBe(2);
    expect(messages[0].content).toBe('Hello CEO!');
    expect(messages[1].content).toBe('Hello Founder! Ready to build.');
  });

  it('creates and retrieves departments, and assigns agents and tasks to departments', () => {
    const comp = db.createCompany({ name: 'Demand Corp', goal: 'Demand-driven company', template: 'startup' });

    // 1. Create department
    const dept = db.createDepartment({
      companyId: comp.id,
      name: 'Marketing & Sales',
      description: 'Drives acquisition and client leads',
      color: '#6366f1',
    });

    expect(dept.id).toBeDefined();
    expect(dept.name).toBe('Marketing & Sales');

    // 2. Create agents with department and hierarchy
    const head = db.createAgent({
      companyId: comp.id,
      role: 'CMO',
      systemPrompt: 'Lead marketing',
      departmentId: dept.id,
      level: 'c_level',
      allowedTools: ['read_file', 'write_file'],
    });

    db.updateDepartment(dept.id, { headAgentId: head.id });

    const worker = db.createAgent({
      companyId: comp.id,
      role: 'Outreach Specialist',
      systemPrompt: 'Conduct cold email outreach',
      departmentId: dept.id,
      reportsTo: head.id,
      level: 'specialist',
      allowedTools: ['read_file', 'write_file'],
    });

    // 3. Create task with department
    const task = db.createTask({
      companyId: comp.id,
      departmentId: dept.id,
      title: 'Scrape 100 targeted B2B leads',
      description: 'Find qualified leads',
    });

    expect(task.departmentId).toBe(dept.id);

    // 4. Verify department retrieval
    const depts = db.listDepartments(comp.id);
    expect(depts.length).toBe(1);
    expect(depts[0].headAgentId).toBe(head.id);

    // 5. Test resilient agent lookups (by ID, exact role, case-insensitive, partial)
    expect(db.findAgentByIdOrRole(comp.id, head.id)?.id).toBe(head.id);
    expect(db.findAgentByIdOrRole(comp.id, 'cmo')?.id).toBe(head.id);
    expect(db.findAgentByIdOrRole(comp.id, 'Outreach Specialist')?.id).toBe(worker.id);
    expect(db.findAgentByIdOrRole(comp.id, 'outreach')?.id).toBe(worker.id);

    // 6. Test resilient task lookups (by ID, exact title, partial)
    expect(db.findTaskByIdOrTitle(comp.id, task.id)?.id).toBe(task.id);
    expect(db.findTaskByIdOrTitle(comp.id, 'Scrape 100 targeted B2B leads')?.id).toBe(task.id);
    expect(db.findTaskByIdOrTitle(comp.id, 'scrape 100')?.id).toBe(task.id);

    // 7. Test memory note writing without explicit title
    const note = db.writeMemoryNote(comp.id, '', 'Plan details here', ['strategy']);
    expect(note.title).toBe('Company Strategic Note');
    expect(note.content).toBe('Plan details here');
  });
});
