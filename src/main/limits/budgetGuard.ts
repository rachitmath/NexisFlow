import { AppDatabase } from '../db/database';
import { DEFAULT_LIMITS, MODEL_PRICING, BUILTIN_MODELS } from '../../shared/constants';
import { Company, Run, Approval } from '../../shared/types';
import { ProviderChatMessage } from '../providers/types';

export interface RunLimitConfig {
  maxAgents: number;
  maxStepsPerAgent: number;
  maxSpawnDepth: number;
  tokenBudget: number;
}

export interface Reservation {
  id: string;
  companyId: string;
  runId: string;
  estimatedCost: number;
  createdAt: number;
}

export interface BudgetReserveParams {
  companyId: string;
  runId: string;
  estimatedCost: number;
  agentId?: string;
}

export interface BudgetReserveResult {
  allowed: boolean;
  reservationId?: string;
  error?: string;
  limitType?: 'run' | 'company' | 'monthly';
}

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  public async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => resolve(release));
      }
    });
  }
}

export class BudgetGuard {
  private db: AppDatabase;
  private mutex = new AsyncMutex();
  private activeReservations: Map<string, Reservation> = new Map();

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

  /**
   * Estimate the cost of an upcoming LLM call.
   * Estimate = input tokens (approximate) × input price + max output tokens × output price.
   * Local models cost 0; unknown models use conservative default price and log a warning.
   */
  public estimateCost(model: string, messages: ProviderChatMessage[], maxTokens?: number): number {
    // 1. Check if model is local
    const isLocal = BUILTIN_MODELS.some(m => m.id === model && m.isLocal) ||
      ['qwen2.5-coder:7b', 'llama3.1:8b', 'mistral:7b'].includes(model) ||
      model.startsWith('ollama/') ||
      model.toLowerCase().includes(':local');
    if (isLocal) {
      return 0.0;
    }

    // 2. Approximate input tokens (~4 chars per token)
    const totalChars = messages.reduce((acc, m) => {
      let len = (m.content || '').length;
      if (m.toolCalls) {
        len += JSON.stringify(m.toolCalls).length;
      }
      return acc + len;
    }, 0);
    const approxInputTokens = Math.max(1, Math.ceil(totalChars / 4));

    // 3. Output tokens
    const outputTokens = maxTokens ?? 2000;

    // 4. Price lookup
    let pricing = MODEL_PRICING[model];
    if (!pricing) {
      console.warn(`[BudgetGuard] Unknown model "${model}". Using conservative default price.`);
      pricing = { promptPerM: 3.0, completionPerM: 15.0 };
    }

    const inputCost = (approxInputTokens / 1_000_000) * pricing.promptPerM;
    const outputCost = (outputTokens / 1_000_000) * pricing.completionPerM;
    return inputCost + outputCost;
  }

  /**
   * Concurrency-safe budget reservation before an LLM call.
   * Atomically checks remaining = cap − spent − reserved across per-run, per-company, and monthly limits.
   */
  public async reserve(params: BudgetReserveParams): Promise<BudgetReserveResult> {
    const releaseLock = await this.mutex.acquire();
    try {
      const { companyId, runId, estimatedCost } = params;

      // Free calls (e.g. local models) always pass
      if (estimatedCost <= 0) {
        const reservationId = 'res_free_' + Math.random().toString(36).substring(2, 11);
        this.activeReservations.set(reservationId, {
          id: reservationId,
          companyId,
          runId,
          estimatedCost: 0,
          createdAt: Date.now(),
        });
        return { allowed: true, reservationId };
      }

      const company = this.db.getCompany(companyId);
      if (!company) {
        return { allowed: false, error: `Company ${companyId} not found.` };
      }

      const run = this.db.getRun(runId);
      if (!run) {
        return { allowed: false, error: `Run ${runId} not found.` };
      }

      // Compute total currently reserved across active reservations
      let reservedForRun = 0;
      let reservedForCompany = 0;
      let reservedGlobal = 0;

      for (const res of this.activeReservations.values()) {
        reservedGlobal += res.estimatedCost;
        if (res.companyId === companyId) {
          reservedForCompany += res.estimatedCost;
        }
        if (res.runId === runId) {
          reservedForRun += res.estimatedCost;
        }
      }

      const EPSILON = 1e-6;

      // 1. Check Per-run limit
      const runCap = company.budgetPerRun ?? 5.0;
      const remainingRun = runCap - run.estimatedCost - reservedForRun;
      if (remainingRun + EPSILON < estimatedCost) {
        const error = `Per-run budget limit exceeded (Cap: $${runCap.toFixed(2)}, Spent: $${run.estimatedCost.toFixed(2)}, Reserved: $${reservedForRun.toFixed(2)}, Required: $${estimatedCost.toFixed(4)}).`;
        return { allowed: false, error, limitType: 'run' };
      }

      // 2. Check Per-company monthly limit
      const companyCap = company.budgetMonthly ?? 50.0;
      const remainingCompany = companyCap - company.totalSpent - reservedForCompany;
      if (remainingCompany + EPSILON < estimatedCost) {
        const error = `Company monthly budget limit exceeded (Cap: $${companyCap.toFixed(2)}, Spent: $${company.totalSpent.toFixed(2)}, Reserved: $${reservedForCompany.toFixed(2)}, Required: $${estimatedCost.toFixed(4)}).`;
        return { allowed: false, error, limitType: 'company' };
      }

      // 3. Check Global monthly limit
      const settings = this.db.getSetting<any>('settings', {});
      const globalCap = settings.globalMonthlyBudget ?? 100.0;
      const companies = this.db.listCompanies();
      const globalSpent = companies.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
      const remainingGlobal = globalCap - globalSpent - reservedGlobal;
      if (remainingGlobal + EPSILON < estimatedCost) {
        const error = `Global monthly budget limit exceeded (Cap: $${globalCap.toFixed(2)}, Spent: $${globalSpent.toFixed(2)}, Reserved: $${reservedGlobal.toFixed(2)}, Required: $${estimatedCost.toFixed(4)}).`;
        return { allowed: false, error, limitType: 'monthly' };
      }

      // Reserve slot
      const reservationId = 'res_' + Math.random().toString(36).substring(2, 11);
      this.activeReservations.set(reservationId, {
        id: reservationId,
        companyId,
        runId,
        estimatedCost,
        createdAt: Date.now(),
      });

      return { allowed: true, reservationId };
    } finally {
      releaseLock();
    }
  }

  /**
   * Release an active reservation after LLM call completes (success, error, or abort).
   */
  public async release(reservationId?: string): Promise<void> {
    if (!reservationId) return;
    const releaseLock = await this.mutex.acquire();
    try {
      this.activeReservations.delete(reservationId);
    } finally {
      releaseLock();
    }
  }

  /**
   * Create an approval request in the Approvals Inbox explaining the budget block.
   */
  public raiseBudgetApproval(companyId: string, runId: string, agentId: string, description: string, details: Record<string, unknown>): Approval {
    return this.db.createApproval({
      runId,
      companyId,
      agentId,
      actionType: 'budget_threshold',
      description,
      details,
    });
  }

  public getActiveReservations(): Reservation[] {
    return Array.from(this.activeReservations.values());
  }

  public getTotalReserved(): number {
    let sum = 0;
    for (const r of this.activeReservations.values()) {
      sum += r.estimatedCost;
    }
    return sum;
  }
}
