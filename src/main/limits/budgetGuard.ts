import { AppDatabase } from '../db/database';
import { DEFAULT_LIMITS } from '../../shared/constants';
import { Company, Run, Approval } from '../../shared/types';

export interface RunLimitConfig {
  maxAgents: number;
  maxStepsPerAgent: number;
  maxSpawnDepth: number;
  tokenBudget: number;
}

export class BudgetGuard {
  private db: AppDatabase;

  constructor(db: AppDatabase) {
    this.db = db;
  }

  public getRunLimits(options?: { maxAgents?: number; maxStepsPerAgent?: number; tokenBudget?: number }): RunLimitConfig {
    return {
      maxAgents: options?.maxAgents ?? DEFAULT_LIMITS.MAX_AGENTS,
      maxStepsPerAgent: options?.maxStepsPerAgent ?? DEFAULT_LIMITS.MAX_STEPS_PER_AGENT,
      maxSpawnDepth: DEFAULT_LIMITS.MAX_SPAWN_DEPTH,
      tokenBudget: options?.tokenBudget ?? DEFAULT_LIMITS.DEFAULT_TOKEN_BUDGET,
    };
  }

  public checkAgentStepLimit(currentStep: number, limit: number): { allowed: boolean; error?: string } {
    if (currentStep > limit) {
      return {
        allowed: false,
        error: `Agent exceeded maximum allowed execution steps (${limit}). Run halted to prevent infinite loops.`,
      };
    }
    return { allowed: true };
  }

  public checkRunTokenLimit(run: Run, limit: number): { allowed: boolean; error?: string } {
    if (run.totalTokens >= limit) {
      return {
        allowed: false,
        error: `Run exceeded configured token limit (${run.totalTokens} >= ${limit}). Halting run to prevent unintended costs.`,
      };
    }
    return { allowed: true };
  }

  public checkCompanyBudget(company: Company): { allowed: boolean; error?: string } {
    if (company.totalSpent >= company.budgetMonthly) {
      return {
        allowed: false,
        error: `Company has reached its monthly budget cap ($${company.totalSpent.toFixed(2)} >= $${company.budgetMonthly.toFixed(2)}). Run stopped.`,
      };
    }
    return { allowed: true };
  }

  public checkHiringThreshold(companyId: string, runId: string, agentId: string, currentAgentCount: number): Approval | null {
    if (currentAgentCount >= DEFAULT_LIMITS.APPROVAL_AGENT_THRESHOLD) {
      // Create approval gate
      return this.db.createApproval({
        runId,
        companyId,
        agentId,
        actionType: 'hire_agent',
        description: `CEO requested hiring beyond threshold (${currentAgentCount + 1} agents on roster).`,
        details: { currentAgentCount, threshold: DEFAULT_LIMITS.APPROVAL_AGENT_THRESHOLD },
      });
    }
    return null;
  }
}
