import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetGuard } from '../../src/main/limits/budgetGuard';
import { AppDatabase } from '../../src/main/db/database';
import path from 'path';
import fs from 'fs';

describe('BudgetGuard', () => {
  let db: AppDatabase;
  let guard: BudgetGuard;
  const testDbPath = path.join(process.cwd(), 'test-guard.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = new AppDatabase(testDbPath);
    guard = new BudgetGuard(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('enforces maximum agent step limits', () => {
    const check1 = guard.checkAgentStepLimit(10, 25);
    expect(check1.allowed).toBe(true);

    const check2 = guard.checkAgentStepLimit(26, 25);
    expect(check2.allowed).toBe(false);
    expect(check2.error).toContain('Agent exceeded maximum allowed execution steps');
  });

  it('enforces monthly company budget hard stops', () => {
    const comp = db.createCompany({
      name: 'Budgeted LLC',
      goal: 'Test Budget',
      template: 'startup',
      budgetMonthly: 10.0,
    });

    const check1 = guard.checkCompanyBudget(comp);
    expect(check1.allowed).toBe(true);

    db.updateCompany(comp.id, { totalSpent: 10.5 });
    const overBudgetComp = db.getCompany(comp.id)!;
    const check2 = guard.checkCompanyBudget(overBudgetComp);
    expect(check2.allowed).toBe(false);
    expect(check2.error).toContain('monthly budget cap');
  });

  it('triggers approval gate when hiring threshold is reached', () => {
    const comp = db.createCompany({ name: 'Hiring Corp', goal: 'Scale Team', template: 'startup' });
    const run = db.createRun(comp.id);

    // Below threshold (threshold is 4)
    const noApproval = guard.checkHiringThreshold(comp.id, run.id, 'ceo', 2);
    expect(noApproval).toBeNull();

    // At threshold (4 agents exist, trying to hire 5th)
    const approval = guard.checkHiringThreshold(comp.id, run.id, 'ceo', 4);
    expect(approval).not.toBeNull();
    expect(approval?.actionType).toBe('hire_agent');
    expect(approval?.status).toBe('pending');
  });
});
