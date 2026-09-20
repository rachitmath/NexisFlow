import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../../src/main/db/database';
import { DEFAULT_LIMITS } from '../../src/shared/constants';
import path from 'path';
import fs from 'fs';

describe('Task Board & Review Mechanism', () => {
  let db: AppDatabase;
  const testDbPath = path.join(process.cwd(), 'test-board.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = new AppDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('verifies max 2 retries before marking task failed', () => {
    const comp = db.createCompany({ name: 'Retry Corp', goal: 'Test Retry Limits', template: 'startup' });
    const task = db.createTask({
      companyId: comp.id,
      title: 'Generate financial forecast',
      description: 'Monthly projection spreadsheet',
    });

    expect(task.retryCount).toBe(0);

    // First rejection
    let retryCount = task.retryCount + 1;
    expect(retryCount <= DEFAULT_LIMITS.MAX_RETRIES_PER_TASK).toBe(true);
    db.updateTask(task.id, { status: 'in_progress', feedback: 'Fix revenue assumptions', retryCount });

    // Second rejection
    let curr = db.getTask(task.id)!;
    retryCount = curr.retryCount + 1;
    expect(retryCount <= DEFAULT_LIMITS.MAX_RETRIES_PER_TASK).toBe(true);
    db.updateTask(task.id, { status: 'in_progress', feedback: 'Include churn rate', retryCount });

    // Third rejection (exceeds max retries 2)
    curr = db.getTask(task.id)!;
    retryCount = curr.retryCount + 1;
    expect(retryCount > DEFAULT_LIMITS.MAX_RETRIES_PER_TASK).toBe(true);
    db.updateTask(task.id, { status: 'failed', feedback: 'Failed after maximum retries', retryCount });

    const finalTask = db.getTask(task.id)!;
    expect(finalTask.status).toBe('failed');
    expect(finalTask.retryCount).toBe(3);
  });
});
