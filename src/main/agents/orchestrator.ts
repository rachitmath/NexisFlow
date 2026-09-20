import { AppDatabase } from '../db/database';
import { WorkspaceManager } from '../workspace/workspaceManager';
import { ProviderRegistry } from '../providers/registry';
import { BudgetGuard } from '../limits/budgetGuard';
import { AgentLoop } from './agentLoop';
import { getCeoTools } from './tools/ceoTools';
import { getWorkerTools } from './tools/workerTools';
import {
  Run,
  Company,
  Agent,
  Task,
  RunEvent,
  RunOptions,
  Approval,
  Message,
  AgentLevel
} from '../../shared/types';
import { DEFAULT_LIMITS } from '../../shared/constants';

export class CompanyOrchestrator {
  private db: AppDatabase;
  private workspace: WorkspaceManager;
  private registry: ProviderRegistry;
  private budgetGuard: BudgetGuard;
  private activeRuns: Map<string, { abortController: AbortController; paused: boolean }> = new Map();
  private activeTaskWorkers: Map<string, { abortController: AbortController }> = new Map();
  private eventListeners: Set<(event: RunEvent) => void> = new Set();
  private pendingApprovalResolvers: Map<string, (decision: 'approved' | 'denied') => void> = new Map();

  constructor(
    db: AppDatabase,
    workspace: WorkspaceManager,
    registry: ProviderRegistry,
    budgetGuard: BudgetGuard
  ) {
    this.db = db;
    this.workspace = workspace;
    this.registry = registry;
    this.budgetGuard = budgetGuard;
    try {
      const reconciled = this.db.reconcileStaleRuns();
      if (reconciled > 0) {
        console.log(`[Orchestrator] Reconciled ${reconciled} orphaned run(s) from previous session.`);
      }
    } catch (err) {
      console.warn('[Orchestrator] Could not reconcile stale runs:', err);
    }
  }

  public subscribe(listener: (event: RunEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(event: RunEvent) {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Safe listener error suppression
      }
    }
  }

  public isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  public stopRun(runId: string): boolean {
    const active = this.activeRuns.get(runId);
    if (active) {
      active.abortController.abort();
      this.activeRuns.delete(runId);
    }
    this.db.updateRun(runId, { status: 'cancelled', finishedAt: new Date().toISOString() });
    const run = this.db.getRun(runId);
    if (run) {
      this.emit({
        runId,
        companyId: run.companyId,
        type: 'run_status_change',
        timestamp: new Date().toISOString(),
        data: { status: 'cancelled' },
      });
    }
    return true;
  }

  public pauseRun(runId: string): boolean {
    const active = this.activeRuns.get(runId);
    if (active) {
      active.paused = true;
      this.db.updateRun(runId, { status: 'paused' });
      const run = this.db.getRun(runId);
      if (run) {
        this.emit({
          runId,
          companyId: run.companyId,
          type: 'run_status_change',
          timestamp: new Date().toISOString(),
          data: { status: 'paused' },
        });
      }
      return true;
    }
    return false;
  }

  public resumeRun(runId: string): boolean {
    const active = this.activeRuns.get(runId);
    if (active && active.paused) {
      active.paused = false;
      this.db.updateRun(runId, { status: 'running' });
      const run = this.db.getRun(runId);
      if (run) {
        this.emit({
          runId,
          companyId: run.companyId,
          type: 'run_status_change',
          timestamp: new Date().toISOString(),
          data: { status: 'running' },
        });
      }
      return true;
    }
    return false;
  }

  public resolveApproval(approvalId: string, decision: 'approved' | 'denied'): boolean {
    const resolved = this.db.resolveApproval(approvalId, decision);
    if (resolved) {
      const resolver = this.pendingApprovalResolvers.get(approvalId);
      if (resolver) {
        resolver(decision);
        this.pendingApprovalResolvers.delete(approvalId);
      }
    }
    return resolved;
  }

  private waitForApproval(approval: Approval): Promise<'approved' | 'denied'> {
    return new Promise(resolve => {
      this.pendingApprovalResolvers.set(approval.id, resolve);
    });
  }

  public cancelTaskWorker(taskId: string): void {
    const active = this.activeTaskWorkers.get(taskId);
    if (active) {
      active.abortController.abort();
      this.activeTaskWorkers.delete(taskId);
    }
  }

  public cancelAllWorkersForCompany(companyId: string): void {
    for (const [runId, active] of this.activeRuns.entries()) {
      const run = this.db.getRun(runId);
      if (run && run.companyId === companyId) {
        active.abortController.abort();
        this.activeRuns.delete(runId);
      }
    }
    for (const [taskId, active] of this.activeTaskWorkers.entries()) {
      const task = this.db.getTask(taskId);
      if (task && task.companyId === companyId) {
        active.abortController.abort();
        this.activeTaskWorkers.delete(taskId);
      }
    }
  }

  public async dispatchInProgressTask(taskId: string): Promise<void> {
    const task = this.db.getTask(taskId);
    if (!task || task.status !== 'in_progress' || !task.assignedTo) {
      return;
    }

    if (this.activeTaskWorkers.has(taskId)) {
      return;
    }

    const company = this.db.getCompany(task.companyId);
    if (!company) return;

    const worker = this.db.getAgent(task.assignedTo) || this.db.findAgentByIdOrRole(company.id, task.assignedTo);
    if (!worker) return;

    const runs = this.db.listRuns(company.id);
    let run = runs.find(r => r.status === 'running');
    let createdRun = false;
    if (!run) {
      run = this.db.createRun(company.id);
      createdRun = true;
      this.emit({
        runId: run.id,
        companyId: company.id,
        type: 'run_status_change',
        timestamp: new Date().toISOString(),
        data: { status: 'running' },
      });
    }

    const abortController = new AbortController();
    this.activeTaskWorkers.set(taskId, { abortController });

    (async () => {
      try {
        await this.executeWorkerTask(company, run!, worker, task, abortController.signal);
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          console.error(`Task worker error for task ${taskId}:`, err);
        }
      } finally {
        this.activeTaskWorkers.delete(taskId);
        if (createdRun && run) {
          this.db.updateRun(run.id, { status: 'completed', finishedAt: new Date().toISOString() });
          this.emit({
            runId: run.id,
            companyId: company.id,
            type: 'run_status_change',
            timestamp: new Date().toISOString(),
            data: { status: 'completed' },
          });
        }
      }
    })();
  }

  public async checkAndDispatchAssignedTasks(companyId: string): Promise<void> {
    const tasks = this.db.listTasks(companyId);
    for (const task of tasks) {
      if (task.status === 'in_progress' && task.assignedTo && !this.activeTaskWorkers.has(task.id)) {
        await this.dispatchInProgressTask(task.id);
      }
    }
  }

  public async startRun(companyId: string, options?: RunOptions): Promise<Run> {
    const company = this.db.getCompany(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found.`);
    }

    // Budget guard verification
    const budgetCheck = this.budgetGuard.checkCompanyBudget(company);
    if (!budgetCheck.allowed) {
      throw new Error(budgetCheck.error);
    }

    // Ensure CEO exists in roster and is updated with latest prompt and tools
    const ceoPrompt = `You are the executive CEO and founder of ${company.name}.
Goal: "${company.goal}"

Operational Rules:
1. Analyze the company goal dynamically. Determine the exact domain and demands of this business (e.g. Software/Engineering, Marketing & Lead Gen, Sales Outreach, Content & Media, Operations, Research, etc.).
2. Do NOT default to software engineering unless the goal specifically requires coding. If the user already has an app and needs sales/leads, focus on Marketing and Sales departments!
3. Establish 1 to 3 relevant Departments using setup_department (e.g. "Marketing & Growth", "Sales & Outreach", "Product & Engineering", etc.) and designate a department head role for each.
4. Hire specialized workers (Specialists or Team Leads) under their respective departments using hire_agent.
5. Create multiple concrete, actionable tasks (at least 2-4 tasks) using create_task with rich, descriptive requirements and expected deliverables.
6. Assign these tasks to the hired specialist agents using assign_task. Workers will automatically execute their tasks and produce deliverables.
7. Continuously monitor progress using check_status and review worker deliverables with review_result.
8. CRITICAL: Do NOT merely describe what you plan to do in text. You MUST execute your plan immediately by invoking the tools (setup_department, hire_agent, create_task, assign_task).
9. Only when all required objectives and deliverables are achieved, call finish(summary).`;

    const allCeoTools = Object.keys(getCeoTools());
    let ceoAgent = this.db.findAgentByRole(companyId, 'CEO');
    if (!ceoAgent) {
      ceoAgent = this.db.createAgent({
        companyId,
        role: 'CEO',
        systemPrompt: ceoPrompt,
        model: company.ceoModel || 'gpt-4o',
        allowedTools: allCeoTools,
        status: 'active',
        createdBy: 'user',
      });
    } else {
      this.db.updateAgent(ceoAgent.id, {
        systemPrompt: ceoPrompt,
        allowedTools: allCeoTools,
        model: company.ceoModel || ceoAgent.model,
      });
      ceoAgent = this.db.findAgentByRole(companyId, 'CEO') || ceoAgent;
    }

    const run = this.db.createRun(companyId);
    const abortController = new AbortController();
    this.activeRuns.set(run.id, { abortController, paused: false });

    this.emit({
      runId: run.id,
      companyId,
      type: 'run_status_change',
      timestamp: new Date().toISOString(),
      data: { status: 'running' },
    });

    // Execute run asynchronously so caller gets Run immediately
    this.runCompanyLoop(company, run, ceoAgent, options, abortController.signal)
      .catch(err => {
        this.db.updateRun(run.id, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: err?.message || 'Unknown execution error',
        });
        this.emit({
          runId: run.id,
          companyId,
          type: 'error',
          timestamp: new Date().toISOString(),
          data: { error: err?.message || 'Run failed' },
        });
        this.emit({
          runId: run.id,
          companyId,
          type: 'run_status_change',
          timestamp: new Date().toISOString(),
          data: { status: 'failed' },
        });
      })
      .finally(() => {
        this.activeRuns.delete(run.id);
      });

    return run;
  }

  public async sendCeoMessage(companyId: string, runId: string, userMessage: string): Promise<{ success: boolean; reply?: string; messages: Message[] }> {
    const company = this.db.getCompany(companyId);
    let ceo = this.db.findAgentByRole(companyId, 'CEO');
    if (!company) return { success: false, messages: [] };

    if (!ceo) {
      ceo = this.db.createAgent({
        companyId,
        role: 'CEO',
        systemPrompt: `You are the executive CEO and founder of ${company.name}.\nGoal: "${company.goal}"`,
        model: company.ceoModel || 'gemini-2.0-flash',
        allowedTools: ['create_task', 'hire_agent', 'assign_task', 'check_status', 'get_result', 'review_result', 'pause_agent', 'update_goal_plan', 'write_memory', 'request_approval', 'finish'],
        status: 'active',
        createdBy: 'user',
      });
    }

    // Sync CEO agent model if company model changed
    if (company.ceoModel && ceo.model !== company.ceoModel) {
      this.db.updateAgent(ceo.id, { model: company.ceoModel });
      ceo = this.db.findAgentByRole(companyId, 'CEO') || ceo;
    }

    let activeModel = ceo.model || company.ceoModel || 'gemini-1.5-flash';
    const currentProvider = this.registry.getProviderForModel(activeModel);
    
    // If the selected model's provider key is missing, auto-fallback to an active configured provider
    if (!this.registry.hasKey(currentProvider) && currentProvider !== 'openai-compatible') {
      const fallback = this.registry.getAvailableModel();
      if (fallback) {
        activeModel = fallback;
        this.db.updateAgent(ceo.id, { model: fallback });
        this.db.updateCompany(company.id, { ceoModel: fallback });
      }
    }

    const targetRunId = (runId && runId !== 'manual') ? runId : `chat_${companyId}`;

    // Add user message
    this.db.addMessage({
      runId: targetRunId,
      companyId,
      agentId: null,
      role: 'user',
      content: userMessage,
    });

    this.emit({
      runId: targetRunId,
      companyId,
      type: 'agent_message',
      timestamp: new Date().toISOString(),
      data: {
        agentRole: 'User',
        content: userMessage,
      },
    });

    // Generate CEO reply asynchronously
    const recentMessages = this.db.listMessages(targetRunId, companyId);
    const chatHistory = recentMessages.slice(-8).map(m => ({
      role: m.role as any,
      content: m.content,
    }));

    let replyText: string | undefined;

    try {
      const adapter = this.registry.getAdapterForModel(activeModel);
      const response = await adapter.chat(
        [
          {
            role: 'system',
            content: `You are the executive CEO of ${company.name}.
Company Goal: "${company.goal}"
You are directly speaking with the founder/user. Respond thoughtfully, strategically, and concisely to their questions or directions.`,
          },
          ...chatHistory,
        ],
        [],
        { model: activeModel, maxTokens: 400 }
      );

      if (response.text) {
        replyText = response.text;
        this.db.addMessage({
          runId: targetRunId,
          companyId,
          agentId: ceo.id,
          role: 'assistant',
          content: response.text,
        });

        this.emit({
          runId: targetRunId,
          companyId,
          type: 'agent_message',
          timestamp: new Date().toISOString(),
          data: {
            agentId: ceo.id,
            agentRole: 'CEO',
            content: response.text,
          },
        });
      }
    } catch (err: any) {
      console.error('Error generating CEO response:', err);
      const errorDetail = err?.message || 'Model connection error';
      replyText = `⚠️ CEO Offline: ${errorDetail}. Please check your API key in Settings or choose a verified model (e.g. gemini-2.0-flash) in Company AI Model Configuration.`;
      
      this.db.addMessage({
        runId: targetRunId,
        companyId,
        agentId: ceo.id,
        role: 'assistant',
        content: replyText,
      });

      this.emit({
        runId: targetRunId,
        companyId,
        type: 'agent_message',
        timestamp: new Date().toISOString(),
        data: {
          agentId: ceo.id,
          agentRole: 'CEO',
          content: replyText,
        },
      });
    }

    const finalMessages = this.db.listMessages(targetRunId, companyId);
    return {
      success: true,
      reply: replyText,
      messages: finalMessages,
    };
  }

  private async runCompanyLoop(
    company: Company,
    run: Run,
    ceoAgent: Agent,
    options: RunOptions | undefined,
    abortSignal: AbortSignal
  ): Promise<void> {
    const agentLoop = new AgentLoop(this.db, this.workspace, this.registry);
    const limits = this.budgetGuard.getRunLimits(options);

    // CEO Tool Executor
    const executeCeoTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      if (name === 'setup_department') {
        const rawName = args.name || args.department || args.departmentName;
        const deptName = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : 'Operations';
        const description = (typeof args.description === 'string') ? args.description.trim() : undefined;
        const color = (typeof args.color === 'string') ? args.color : undefined;

        let dept = this.db.findDepartmentByName(company.id, deptName);
        if (!dept) {
          dept = this.db.createDepartment({
            companyId: company.id,
            name: deptName,
            description,
            color,
          });
        }

        const headRole = (typeof args.headRole === 'string' && args.headRole.trim()) ? args.headRole.trim() : null;
        let headAgent: Agent | null = null;

        if (headRole) {
          let existingHead = this.db.findAgentByRole(company.id, headRole);
          if (!existingHead) {
            const headPrompt = (typeof args.headPrompt === 'string' && args.headPrompt.trim())
              ? args.headPrompt.trim()
              : `You are the ${headRole} leading the ${deptName} department for ${company.name}. Plan, direct, and oversee execution in your domain.`;

            existingHead = this.db.createAgent({
              companyId: company.id,
              role: headRole,
              systemPrompt: headPrompt,
              model: company.workerModel || company.ceoModel || 'gemini-2.0-flash',
              allowedTools: ['read_file', 'write_file', 'report_result'],
              status: 'active',
              createdBy: 'ceo',
              departmentId: dept.id,
              reportsTo: ceoAgent.id,
              level: 'c_level',
            });

            this.emit({
              runId: run.id,
              companyId: company.id,
              type: 'agent_status_change',
              timestamp: new Date().toISOString(),
              data: { agentId: existingHead.id, agentRole: existingHead.role, status: 'hired' },
            });
          } else {
            this.db.updateAgent(existingHead.id, { departmentId: dept.id, reportsTo: ceoAgent.id, level: 'c_level' });
          }
          headAgent = existingHead;
          this.db.updateDepartment(dept.id, { headAgentId: headAgent.id });
        }

        return {
          success: true,
          departmentId: dept.id,
          name: dept.name,
          headAgentId: headAgent?.id,
          headRole: headAgent?.role,
          message: `Department ${dept.name} established${headAgent ? ` led by ${headAgent.role}` : ''}.`
        };
      }

      if (name === 'create_task') {
        const rawTitle = args.title || args.name || args.task;
        const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : 'Company Objective Task';
        const rawDesc = args.description || args.details || args.prompt;
        let description = (typeof rawDesc === 'string' && rawDesc.trim()) ? rawDesc.trim() : '';

        if (!description || description.toLowerCase() === title.toLowerCase()) {
          description = `Execute deliverable for "${title}". Requirements: Formulate strategy, generate needed documents, conduct deep research or code implementation, and output high-quality deliverables into the workspace for CEO review.`;
        }

        let departmentId: string | null = null;
        if (args.department) {
          const dept = this.db.getDepartment(String(args.department).trim()) || this.db.findDepartmentByName(company.id, String(args.department).trim());
          if (dept) departmentId = dept.id;
        }

        const task = this.db.createTask({
          companyId: company.id,
          title,
          description,
          dependencies: (args.dependencies as string[]) || [],
          departmentId,
        });
        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'task_status_change',
          timestamp: new Date().toISOString(),
          data: { taskId: task.id, taskTitle: task.title, status: 'todo' },
        });
        return { success: true, taskId: task.id, status: 'created' };
      }

      if (name === 'hire_agent') {
        const rawRole = args.role || args.name || args.title || args.role_name || args.agentRole || args.job_title;
        const role = (typeof rawRole === 'string' && rawRole.trim()) ? rawRole.trim() : 'Specialist';
        const rawPrompt = args.prompt || args.systemPrompt || args.description || args.instructions;
        const prompt = (typeof rawPrompt === 'string' && rawPrompt.trim())
          ? rawPrompt.trim()
          : `You are the ${role} for ${company.name}. Complete assigned tasks to high standard and report results.`;
        const allowedTools = (args.tools as string[]) || ['read_file', 'write_file', 'report_result'];

        // Resolve department
        let departmentId: string | null = null;
        if (args.department) {
          const deptQuery = String(args.department).trim();
          const dept = this.db.getDepartment(deptQuery) || this.db.findDepartmentByName(company.id, deptQuery);
          if (dept) {
            departmentId = dept.id;
          }
        }

        // Resolve reportsTo
        let reportsTo: string | null = null;
        if (args.reportsTo) {
          const supervisorQuery = String(args.reportsTo).trim();
          const supervisor = this.db.findAgentByIdOrRole(company.id, supervisorQuery);
          if (supervisor) {
            reportsTo = supervisor.id;
          }
        }
        if (!reportsTo && departmentId) {
          const dept = this.db.getDepartment(departmentId);
          if (dept?.headAgentId) {
            reportsTo = dept.headAgentId;
          }
        }
        if (!reportsTo) {
          reportsTo = ceoAgent.id;
        }

        const level: AgentLevel = (args.level as AgentLevel) || (role.toLowerCase().includes('head') || role.toLowerCase().includes('vp') || role.toLowerCase().includes('chief') || role.toLowerCase().includes('lead') ? 'c_level' : 'specialist');

        // Check deduplication
        const existing = this.db.findAgentByRole(company.id, role);
        if (existing) {
          if (departmentId || reportsTo) {
            this.db.updateAgent(existing.id, {
              departmentId: departmentId ?? existing.departmentId,
              reportsTo: reportsTo ?? existing.reportsTo,
              level: level ?? existing.level,
            });
          }
          return { success: true, agentId: existing.id, reused: true, message: `Reused existing agent for role ${role}` };
        }

        // Check hiring threshold approval
        const currentAgents = this.db.listAgents(company.id);
        const approvalNeeded = this.budgetGuard.checkHiringThreshold(company.id, run.id, ceoAgent.id, currentAgents.length);
        if (approvalNeeded) {
          this.emit({
            runId: run.id,
            companyId: company.id,
            type: 'approval_needed',
            timestamp: new Date().toISOString(),
            data: { approval: approvalNeeded },
          });
          const decision = await this.waitForApproval(approvalNeeded);
          if (decision === 'denied') {
            return { success: false, reason: 'Hiring rejected by human supervisor.' };
          }
        }

        const newAgent = this.db.createAgent({
          companyId: company.id,
          role,
          systemPrompt: prompt,
          model: company.workerModel || 'gpt-4o-mini',
          allowedTools,
          status: 'active',
          createdBy: 'ceo',
          departmentId,
          reportsTo,
          level,
        });

        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'agent_status_change',
          timestamp: new Date().toISOString(),
          data: { agentId: newAgent.id, agentRole: newAgent.role, status: 'hired' },
        });

        return { success: true, agentId: newAgent.id, role: newAgent.role, departmentId, reportsTo };
      }

      if (name === 'assign_task') {
        const rawTaskId = (args.taskId || args.task || args.id) as string;
        const rawAgentId = (args.agentId || args.agent || args.role) as string;

        const task = this.db.findTaskByIdOrTitle(company.id, rawTaskId);
        if (!task) {
          return { error: `Task not found for identifier: "${rawTaskId}". Check check_status for valid tasks.` };
        }

        const worker = this.db.findAgentByIdOrRole(company.id, rawAgentId);
        if (!worker) {
          return { error: `Agent not found for identifier: "${rawAgentId}". Check check_status or hire_agent first.` };
        }

        this.db.updateTask(task.id, { assignedTo: worker.id, status: 'in_progress' });
        const updatedTask = this.db.getTask(task.id) || task;

        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'task_status_change',
          timestamp: new Date().toISOString(),
          data: { taskId: updatedTask.id, taskTitle: updatedTask.title, status: 'in_progress', assignedTo: worker.role },
        });

        // Trigger worker agent execution
        await this.executeWorkerTask(company, run, worker, updatedTask, abortSignal);

        return { success: true, taskId: updatedTask.id, taskTitle: updatedTask.title, assignedTo: worker.role, status: 'dispatched_to_worker' };
      }

      if (name === 'check_status') {
        const departments = this.db.listDepartments(company.id);
        const tasks = this.db.listTasks(company.id);
        const agents = this.db.listAgents(company.id);
        const notes = this.db.listMemoryNotes(company.id);
        return {
          departments: departments.map(d => ({ id: d.id, name: d.name, headAgentId: d.headAgentId })),
          tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, assignedTo: t.assignedTo, retryCount: t.retryCount })),
          agents: agents.map(a => ({ id: a.id, role: a.role, level: a.level, departmentId: a.departmentId, reportsTo: a.reportsTo, status: a.status })),
          notesCount: notes.length,
        };
      }

      if (name === 'get_result') {
        const rawTaskId = (args.taskId || args.task || args.id) as string;
        const task = this.db.findTaskByIdOrTitle(company.id, rawTaskId);
        return task ? { taskId: task.id, title: task.title, result: task.result, feedback: task.feedback, status: task.status } : { error: `Task not found for "${rawTaskId}"` };
      }

      if (name === 'review_result') {
        const rawTaskId = (args.taskId || args.task || args.id) as string;
        const decision = (args.decision as 'accept' | 'reject') || 'accept';
        const feedback = (args.feedback as string) || '';
        const task = this.db.findTaskByIdOrTitle(company.id, rawTaskId);

        if (!task) return { error: `Task not found for "${rawTaskId}"` };

        if (decision === 'accept') {
          this.db.updateTask(task.id, { status: 'completed', feedback });
          this.emit({
            runId: run.id,
            companyId: company.id,
            type: 'task_status_change',
            timestamp: new Date().toISOString(),
            data: { taskId: task.id, taskTitle: task.title, status: 'completed' },
          });
          return { success: true, taskId: task.id, status: 'completed', message: 'Work accepted.' };
        } else {
          // Reject with feedback
          const newRetry = task.retryCount + 1;
          if (newRetry > DEFAULT_LIMITS.MAX_RETRIES_PER_TASK) {
            this.db.updateTask(task.id, { status: 'failed', feedback, retryCount: newRetry });
            this.emit({
              runId: run.id,
              companyId: company.id,
              type: 'task_status_change',
              timestamp: new Date().toISOString(),
              data: { taskId: task.id, taskTitle: task.title, status: 'failed' },
            });
            return { success: false, taskId: task.id, status: 'failed', message: `Max retries (${DEFAULT_LIMITS.MAX_RETRIES_PER_TASK}) exceeded.` };
          }

          this.db.updateTask(task.id, { status: 'in_progress', feedback, retryCount: newRetry });
          this.emit({
            runId: run.id,
            companyId: company.id,
            type: 'task_status_change',
            timestamp: new Date().toISOString(),
            data: { taskId: task.id, taskTitle: task.title, status: 'in_progress' },
          });

          // Re-dispatch worker with feedback
          const worker = task.assignedTo ? this.db.listAgents(company.id).find(a => a.id === task.assignedTo) : null;
          if (worker) {
            await this.executeWorkerTask(company, run, worker, task, abortSignal, feedback);
          }

          return { success: true, taskId: task.id, status: 'retrying_with_feedback', retryCount: newRetry };
        }
      }

      if (name === 'pause_agent') {
        const rawAgentId = (args.agentId || args.role || args.agent) as string;
        const agent = this.db.findAgentByIdOrRole(company.id, rawAgentId);
        if (!agent) return { error: `Agent not found for "${rawAgentId}"` };
        this.db.updateAgent(agent.id, { status: 'paused' });
        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'agent_status_change',
          timestamp: new Date().toISOString(),
          data: { agentId: agent.id, agentRole: agent.role, status: 'paused' },
        });
        return { success: true, agentId: agent.id, status: 'paused' };
      }

      if (name === 'update_goal_plan') {
        const plan = (args.plan as string) || (args.summary as string) || JSON.stringify(args);
        this.db.writeMemoryNote(company.id, 'Strategic Operating Plan', plan, ['plan', 'strategy', 'ceo']);
        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'agent_status_change',
          timestamp: new Date().toISOString(),
          data: { agentId: ceoAgent.id, agentRole: 'CEO', status: 'plan_updated' },
        });
        return { success: true, message: 'Goal operational plan saved successfully.' };
      }

      if (name === 'write_memory') {
        const title = (typeof args.title === 'string' && args.title.trim())
          ? args.title.trim()
          : (typeof args.key === 'string' && args.key.trim())
            ? args.key.trim()
            : 'Strategic Note';
        const content = (typeof args.content === 'string')
          ? args.content
          : (typeof args.text === 'string')
            ? args.text
            : JSON.stringify(args);
        const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];

        const note = this.db.writeMemoryNote(company.id, title, content, tags);
        return { success: true, noteId: note.id };
      }

      if (name === 'request_approval') {
        const approval = this.db.createApproval({
          runId: run.id,
          companyId: company.id,
          agentId: ceoAgent.id,
          actionType: 'custom',
          description: args.reason as string,
          details: { action: args.action },
        });
        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'approval_needed',
          timestamp: new Date().toISOString(),
          data: { approval },
        });
        const decision = await this.waitForApproval(approval);
        return { decision, allowed: decision === 'approved' };
      }

      if (name === 'finish') {
        return { success: true, summary: args.summary };
      }

      return { error: `Unknown CEO tool: ${name}` };
    };

    // Run CEO Loop
    const ceoResult = await agentLoop.run({
      companyId: company.id,
      runId: run.id,
      agent: ceoAgent,
      tools: getCeoTools(),
      toolExecutor: executeCeoTool,
      maxSteps: limits.maxStepsPerAgent,
      abortSignal,
      onEvent: this.emit.bind(this),
      systemPromptAddendum: `Today is ${new Date().toLocaleDateString()}. Work systematically to produce the required deliverable.`,
      initialMessage: `You are now active as CEO of ${company.name}. Goal: "${company.goal}". Begin execution:
1. Dynamically analyze what departments are needed for this specific goal (e.g. Sales, Marketing, IT, Design, Operations, etc. depending on what the user wants).
2. Set up the departments using setup_department, specifying a department head role.
3. Hire required specialist agents using hire_agent with department and reportsTo.
4. Create 2 to 4 concrete, actionable tasks with create_task.
5. Assign tasks to the specialist agents with assign_task to start execution.
CRITICAL: Do NOT just describe or discuss the plan in text. Invoke the tools (setup_department, hire_agent, create_task, assign_task) immediately to take action.`,
    });

    if (abortSignal.aborted) {
      this.db.updateRun(run.id, { status: 'cancelled', finishedAt: new Date().toISOString() });
      this.emit({
        runId: run.id,
        companyId: company.id,
        type: 'run_status_change',
        timestamp: new Date().toISOString(),
        data: { status: 'cancelled' },
      });
      return;
    }

    this.db.updateRun(run.id, { status: 'completed', finishedAt: new Date().toISOString() });
    this.emit({
      runId: run.id,
      companyId: company.id,
      type: 'run_status_change',
      timestamp: new Date().toISOString(),
      data: { status: 'completed' },
    });
  }

  private async executeWorkerTask(
    company: Company,
    run: Run,
    worker: Agent,
    task: Task,
    abortSignal: AbortSignal,
    feedback?: string
  ): Promise<void> {
    const agentLoop = new AgentLoop(this.db, this.workspace, this.registry);

    const executeWorkerTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      if (name === 'read_file') {
        const filePath = args.path as string;
        try {
          const content = this.workspace.readWorkspaceFile(company.id, filePath);
          return { success: true, path: filePath, content };
        } catch (err: any) {
          return { error: err?.message };
        }
      }

      if (name === 'write_file') {
        const filePath = args.path as string;
        const content = args.content as string;
        try {
          const savedPath = this.workspace.writeWorkspaceFile(company.id, filePath, content);
          return { success: true, path: filePath, savedPath };
        } catch (err: any) {
          return { error: err?.message };
        }
      }

      if (name === 'list_files') {
        const deliverables = this.workspace.listDeliverables(company.id);
        return { deliverables: deliverables.map(d => ({ name: d.name, path: d.relativePath, size: d.sizeBytes })) };
      }

      if (name === 'report_result') {
        const summary = args.summary as string;
        const deliverablePath = args.deliverablePath as string | undefined;
        const deliverableContent = args.deliverableContent as string | undefined;

        // Automatically persist deliverable if content provided
        if (deliverablePath && deliverableContent) {
          try {
            this.workspace.writeWorkspaceFile(company.id, deliverablePath, deliverableContent);
          } catch {
            // Workspace write fallback
          }
        }

        this.db.updateTask(task.id, {
          status: 'in_review',
          result: JSON.stringify({ summary, deliverablePath, deliverableContent }),
        });

        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'task_status_change',
          timestamp: new Date().toISOString(),
          data: { taskId: task.id, taskTitle: task.title, status: 'in_review' },
        });

        return { success: true, status: 'submitted_for_review' };
      }

      return { error: `Unknown worker tool: ${name}` };
    };

    let workerAddendum = `Your assigned task is:
Title: "${task.title}"
Description: "${task.description}"`;

    if (feedback) {
      workerAddendum += `\n\n[PRIOR REVIEW FEEDBACK]: The CEO reviewed your previous draft and requested these corrections:\n"${feedback}"\nPlease address this feedback carefully and report result.`;
    }

    const workerInitialPrompt = feedback
      ? `Please review the assigned task "${task.title}" and the CEO's review feedback:\n"${feedback}"\nMake the necessary improvements and report your updated deliverable.`
      : `Please execute your assigned task: "${task.title}". Description: "${task.description}". Produce the required deliverable and report the result.`;

    const workerAbortController = new AbortController();
    const onAbort = () => workerAbortController.abort();
    abortSignal.addEventListener('abort', onAbort);
    this.activeTaskWorkers.set(task.id, { abortController: workerAbortController });

    try {
      await agentLoop.run({
        companyId: company.id,
        runId: run.id,
        agent: worker,
        tools: getWorkerTools(),
        toolExecutor: executeWorkerTool,
        maxSteps: 15,
        abortSignal: workerAbortController.signal,
        onEvent: this.emit.bind(this),
        systemPromptAddendum: workerAddendum,
        initialMessage: workerInitialPrompt,
      });

      const currentTask = this.db.getTask(task.id);
      if (currentTask && currentTask.status === 'in_progress' && !workerAbortController.signal.aborted) {
        this.db.updateTask(task.id, {
          status: 'in_review',
          result: JSON.stringify({ summary: `Worker ${worker.role} finished task execution.` }),
        });
        this.emit({
          runId: run.id,
          companyId: company.id,
          type: 'task_status_change',
          timestamp: new Date().toISOString(),
          data: { taskId: task.id, taskTitle: task.title, status: 'in_review' },
        });
      }
    } finally {
      this.activeTaskWorkers.delete(task.id);
      abortSignal.removeEventListener('abort', onAbort);
    }
  }
}
