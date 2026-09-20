import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { SCHEMA_SQL } from './schema';
import {
  Company,
  Agent,
  Department,
  Task,
  Goal,
  Run,
  Message,
  MemoryNote,
  Approval,
  UsageRecord,
  CreateCompanyDTO
} from '../../shared/types';

export class AppDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    let resolvedPath = dbPath;
    if (!resolvedPath) {
      const userDataDir = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.nexisflow_data');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      resolvedPath = path.join(userDataDir, 'nexisflow.db');
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(SCHEMA_SQL);
    // Safe column migrations for existing databases
    try { this.db.exec(`ALTER TABLE agents ADD COLUMN department_id TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE agents ADD COLUMN reports_to TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE agents ADD COLUMN level TEXT DEFAULT 'specialist'`); } catch {}
    try { this.db.exec(`ALTER TABLE tasks ADD COLUMN department_id TEXT`); } catch {}
  }

  public getRawDb(): Database.Database {
    return this.db;
  }

  public close() {
    this.db.close();
  }

  // --- Settings ---
  public getSetting<T>(key: string, defaultValue: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  public setSetting<T>(key: string, value: T): void {
    const valStr = JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, valStr);
  }

  // --- Companies ---
  public listCompanies(): Company[] {
    const rows = this.db.prepare('SELECT * FROM companies ORDER BY updated_at DESC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      goal: r.goal,
      template: r.template,
      budgetPerRun: r.budget_per_run,
      budgetMonthly: r.budget_monthly,
      totalSpent: r.total_spent,
      ceoModel: r.ceo_model,
      workerModel: r.worker_model,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public getCompany(id: string): Company | null {
    const r = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      goal: r.goal,
      template: r.template,
      budgetPerRun: r.budget_per_run,
      budgetMonthly: r.budget_monthly,
      totalSpent: r.total_spent,
      ceoModel: r.ceo_model,
      workerModel: r.worker_model,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  public createCompany(dto: CreateCompanyDTO): Company {
    const id = 'comp_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO companies (id, name, description, goal, template, budget_per_run, budget_monthly, ceo_model, worker_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      dto.name,
      dto.description || '',
      dto.goal,
      dto.template || 'startup',
      dto.budgetPerRun ?? 5.0,
      dto.budgetMonthly ?? 50.0,
      dto.ceoModel || 'gpt-4o',
      dto.workerModel || 'gpt-4o-mini',
      now,
      now
    );

    // Seed primary Goal
    const goalId = 'goal_' + Math.random().toString(36).substring(2, 11);
    this.db.prepare(`
      INSERT INTO goals (id, company_id, title, description, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(goalId, id, 'Primary Objective: ' + dto.name, dto.goal, now);

    // Seed CEO Agent into Roster
    const ceoId = 'agent_' + Math.random().toString(36).substring(2, 11);
    const ceoPrompt = `You are the executive CEO and founder of ${dto.name}.
Goal: "${dto.goal}"

Operational Rules:
1. Decompose the goal into clear, concrete tasks.
2. Check existing roster before hiring new workers. Only hire when specialized expertise is missing.
3. Assign tasks to workers.
4. Workers will complete the tasks and report deliverables.
5. Review each worker's result carefully: call review_result(accept) if it meets expectations, or review_result(reject, feedback) if improvements are needed.
6. Once all key deliverables are produced and reviewed, call finish(summary).`;

    this.db.prepare(`
      INSERT INTO agents (id, company_id, role, system_prompt, model, allowed_tools, status, created_by, created_at)
      VALUES (?, ?, 'CEO', ?, ?, ?, 'active', 'user', ?)
    `).run(
      ceoId,
      id,
      ceoPrompt,
      dto.ceoModel || 'gpt-4o',
      JSON.stringify(['create_task', 'hire_agent', 'assign_task', 'check_status', 'get_result', 'review_result', 'pause_agent', 'update_goal_plan', 'write_memory', 'request_approval', 'finish']),
      now
    );

    return this.getCompany(id)!;
  }

  public updateCompany(id: string, updates: Partial<Company>): Company | null {
    const company = this.getCompany(id);
    if (!company) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.goal !== undefined) { fields.push('goal = ?'); values.push(updates.goal); }
    if (updates.budgetPerRun !== undefined) { fields.push('budget_per_run = ?'); values.push(updates.budgetPerRun); }
    if (updates.budgetMonthly !== undefined) { fields.push('budget_monthly = ?'); values.push(updates.budgetMonthly); }
    if (updates.totalSpent !== undefined) { fields.push('total_spent = ?'); values.push(updates.totalSpent); }
    if (updates.ceoModel !== undefined) { fields.push('ceo_model = ?'); values.push(updates.ceoModel); }
    if (updates.workerModel !== undefined) { fields.push('worker_model = ?'); values.push(updates.workerModel); }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (updates.ceoModel !== undefined) {
      this.db.prepare("UPDATE agents SET model = ? WHERE company_id = ? AND LOWER(role) = 'ceo'").run(updates.ceoModel, id);
    }

    return this.getCompany(id);
  }

  public deleteCompany(id: string): boolean {
    let deleted = false;
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM messages WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM approvals WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_notes WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM usage WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM runs WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM agents WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM departments WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM goals WHERE company_id = ?').run(id);
      const res = this.db.prepare('DELETE FROM companies WHERE id = ?').run(id);
      deleted = res.changes > 0;
    })();
    return deleted;
  }

  public restartCompany(id: string): Company | null {
    const company = this.getCompany(id);
    if (!company) return null;

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM messages WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM approvals WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_notes WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM usage WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM runs WHERE company_id = ?').run(id);
      this.db.prepare('DELETE FROM departments WHERE company_id = ?').run(id);
      this.db.prepare("DELETE FROM agents WHERE company_id = ? AND LOWER(role) != 'ceo'").run(id);

      // Reset CEO
      this.db.prepare(`
        UPDATE agents 
        SET status = 'active', department_id = NULL, reports_to = NULL, level = 'executive'
        WHERE company_id = ? AND LOWER(role) = 'ceo'
      `).run(id);

      // Reset company total spent
      this.db.prepare('UPDATE companies SET total_spent = 0.0, updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        id
      );
    })();

    return this.getCompany(id);
  }

  // --- Departments ---
  public listDepartments(companyId: string): Department[] {
    const rows = this.db.prepare('SELECT * FROM departments WHERE company_id = ? ORDER BY created_at ASC').all(companyId) as any[];
    return rows.map(r => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      headAgentId: r.head_agent_id || null,
      description: r.description || '',
      color: r.color || 'indigo',
      createdAt: r.created_at,
    }));
  }

  public getDepartment(id: string): Department | null {
    const r = this.db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      headAgentId: r.head_agent_id || null,
      description: r.description || '',
      color: r.color || 'indigo',
      createdAt: r.created_at,
    };
  }

  public findDepartmentByName(companyId: string, name: string): Department | null {
    if (!name || typeof name !== 'string') return null;
    const clean = name.trim();
    const r = this.db.prepare('SELECT * FROM departments WHERE company_id = ? AND LOWER(name) = LOWER(?) LIMIT 1').get(companyId, clean) as any;
    if (r) {
      return {
        id: r.id,
        companyId: r.company_id,
        name: r.name,
        headAgentId: r.head_agent_id || null,
        description: r.description || '',
        color: r.color || 'indigo',
        createdAt: r.created_at,
      };
    }
    const partial = this.db.prepare('SELECT * FROM departments WHERE company_id = ? AND LOWER(name) LIKE ? LIMIT 1').get(companyId, `%${clean.toLowerCase()}%`) as any;
    if (partial) {
      return {
        id: partial.id,
        companyId: partial.company_id,
        name: partial.name,
        headAgentId: partial.head_agent_id || null,
        description: partial.description || '',
        color: partial.color || 'indigo',
        createdAt: partial.created_at,
      };
    }
    return null;
  }

  public createDepartment(dept: {
    companyId: string;
    name: string;
    headAgentId?: string | null;
    description?: string;
    color?: string;
  }): Department {
    const id = 'dept_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    const name = dept.name.trim();
    const description = dept.description || '';
    const color = dept.color || 'indigo';

    this.db.prepare(`
      INSERT INTO departments (id, company_id, name, head_agent_id, description, color, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, dept.companyId, name, dept.headAgentId || null, description, color, now);

    return {
      id,
      companyId: dept.companyId,
      name,
      headAgentId: dept.headAgentId || null,
      description,
      color,
      createdAt: now,
    };
  }

  public updateDepartment(id: string, updates: Partial<{ name: string; headAgentId: string | null; description: string; color: string }>): void {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name.trim()); }
    if (updates.headAgentId !== undefined) { fields.push('head_agent_id = ?'); values.push(updates.headAgentId); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public deleteDepartment(id: string): boolean {
    const res = this.db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // --- Agents (Roster) ---
  private mapAgentRow(r: any): Agent {
    return {
      id: r.id,
      companyId: r.company_id,
      role: r.role,
      systemPrompt: r.system_prompt,
      model: r.model,
      allowedTools: JSON.parse(r.allowed_tools || '[]'),
      status: r.status,
      createdBy: r.created_by,
      departmentId: r.department_id || null,
      reportsTo: r.reports_to || null,
      level: r.level || (r.role.toLowerCase() === 'ceo' ? 'executive' : 'specialist'),
      createdAt: r.created_at,
    };
  }

  public listAgents(companyId: string): Agent[] {
    const rows = this.db.prepare('SELECT * FROM agents WHERE company_id = ? ORDER BY created_at ASC').all(companyId) as any[];
    return rows.map(r => this.mapAgentRow(r));
  }

  public findAgentByRole(companyId: string, role: string): Agent | null {
    const r = this.db.prepare('SELECT * FROM agents WHERE company_id = ? AND LOWER(role) = LOWER(?) LIMIT 1').get(companyId, role) as any;
    return r ? this.mapAgentRow(r) : null;
  }

  public getAgent(id: string): Agent | null {
    const r = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
    return r ? this.mapAgentRow(r) : null;
  }

  public findAgentByIdOrRole(companyId: string, query: string): Agent | null {
    if (!query || typeof query !== 'string') return null;
    const clean = query.trim();

    // 1. Direct ID match
    const byId = this.db.prepare('SELECT * FROM agents WHERE company_id = ? AND id = ?').get(companyId, clean) as any;
    if (byId) return this.mapAgentRow(byId);

    // 2. Exact role match
    const byRole = this.db.prepare('SELECT * FROM agents WHERE company_id = ? AND LOWER(role) = LOWER(?) LIMIT 1').get(companyId, clean) as any;
    if (byRole) return this.mapAgentRow(byRole);

    // 3. Partial role match
    const byRolePartial = this.db.prepare('SELECT * FROM agents WHERE company_id = ? AND LOWER(role) LIKE ? LIMIT 1').get(companyId, `%${clean.toLowerCase()}%`) as any;
    if (byRolePartial) return this.mapAgentRow(byRolePartial);

    return null;
  }

  public createAgent(agent: Omit<Agent, 'id' | 'createdAt'>): Agent {
    const id = 'agent_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    const role = (agent.role && agent.role.trim()) ? agent.role.trim() : 'Specialist';
    const systemPrompt = (agent.systemPrompt && agent.systemPrompt.trim())
      ? agent.systemPrompt.trim()
      : `You are a specialist ${role} agent. Complete your tasks to high quality.`;
    const model = (agent.model && agent.model.trim()) ? agent.model.trim() : 'gemini-1.5-flash';
    const level = agent.level || (role.toLowerCase() === 'ceo' ? 'executive' : 'specialist');

    this.db.prepare(`
      INSERT INTO agents (id, company_id, role, system_prompt, model, allowed_tools, status, created_by, department_id, reports_to, level, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agent.companyId,
      role,
      systemPrompt,
      model,
      JSON.stringify(agent.allowedTools || []),
      agent.status || 'active',
      agent.createdBy || 'ceo',
      agent.departmentId || null,
      agent.reportsTo || null,
      level,
      now
    );

    return {
      id,
      createdAt: now,
      companyId: agent.companyId,
      role,
      systemPrompt,
      model,
      allowedTools: agent.allowedTools || [],
      status: agent.status || 'active',
      createdBy: agent.createdBy || 'ceo',
      departmentId: agent.departmentId || null,
      reportsTo: agent.reportsTo || null,
      level,
    };
  }

  public updateAgentStatus(agentId: string, status: 'active' | 'paused'): void {
    this.db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, agentId);
  }

  public updateAgent(agentId: string, updates: Partial<Pick<Agent, 'model' | 'status' | 'systemPrompt' | 'departmentId' | 'reportsTo' | 'level' | 'allowedTools'>>): void {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.model !== undefined) { fields.push('model = ?'); values.push(updates.model); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.systemPrompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.systemPrompt); }
    if (updates.departmentId !== undefined) { fields.push('department_id = ?'); values.push(updates.departmentId); }
    if (updates.reportsTo !== undefined) { fields.push('reports_to = ?'); values.push(updates.reportsTo); }
    if (updates.level !== undefined) { fields.push('level = ?'); values.push(updates.level); }
    if (updates.allowedTools !== undefined) { fields.push('allowed_tools = ?'); values.push(JSON.stringify(updates.allowedTools)); }
    if (fields.length === 0) return;
    values.push(agentId);
    this.db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public deleteAgent(agentId: string): { success: boolean; error?: string } {
    const agent = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }
    if (agent.role.toLowerCase() === 'ceo' || agent.level === 'executive') {
      return { success: false, error: 'Cannot delete the Chief Executive Officer.' };
    }

    // Unassign tasks assigned to this agent
    this.db.prepare('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?').run(agentId);
    // Remove from department head if applicable
    this.db.prepare('UPDATE departments SET head_agent_id = NULL WHERE head_agent_id = ?').run(agentId);
    // Re-route direct reports
    this.db.prepare('UPDATE agents SET reports_to = NULL WHERE reports_to = ?').run(agentId);
    // Delete agent
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    return { success: true };
  }

  // --- Tasks ---
  private mapTaskRow(r: any): Task {
    return {
      id: r.id,
      goalId: r.goal_id,
      companyId: r.company_id,
      departmentId: r.department_id || null,
      title: r.title,
      description: r.description,
      assignedTo: r.assigned_to,
      status: r.status,
      dependencies: JSON.parse(r.dependencies || '[]'),
      retryCount: r.retry_count,
      feedback: r.feedback,
      result: r.result,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  public listTasks(companyId: string): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks WHERE company_id = ? ORDER BY created_at ASC').all(companyId) as any[];
    return rows.map(r => this.mapTaskRow(r));
  }

  public getTask(id: string): Task | null {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return r ? this.mapTaskRow(r) : null;
  }

  public findTaskByIdOrTitle(companyId: string, query: string): Task | null {
    if (!query || typeof query !== 'string') return null;
    const clean = query.trim();

    // 1. Direct ID match
    const byId = this.db.prepare('SELECT * FROM tasks WHERE company_id = ? AND id = ?').get(companyId, clean) as any;
    if (byId) return this.mapTaskRow(byId);

    // 2. Exact Title match
    const byTitle = this.db.prepare('SELECT * FROM tasks WHERE company_id = ? AND LOWER(title) = LOWER(?) LIMIT 1').get(companyId, clean) as any;
    if (byTitle) return this.mapTaskRow(byTitle);

    // 3. Partial Title match
    const byTitlePartial = this.db.prepare('SELECT * FROM tasks WHERE company_id = ? AND LOWER(title) LIKE ? LIMIT 1').get(companyId, `%${clean.toLowerCase()}%`) as any;
    if (byTitlePartial) return this.mapTaskRow(byTitlePartial);

    // 4. Index match (e.g. if query is "1" or "task 1")
    const num = parseInt(clean.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      const all = this.listTasks(companyId);
      if (num <= all.length) return all[num - 1];
    }

    return null;
  }

  public createTask(task: {
    companyId: string;
    goalId?: string;
    departmentId?: string | null;
    title: string;
    description: string;
    dependencies?: string[];
    assignedTo?: string | null;
  }): Task {
    const id = 'task_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();

    let goalId: string = task.goalId || '';
    if (!goalId) {
      const g = this.db.prepare('SELECT id FROM goals WHERE company_id = ? LIMIT 1').get(task.companyId) as any;
      goalId = g ? (g.id as string) : 'goal_default';
    }

    this.db.prepare(`
      INSERT INTO tasks (id, goal_id, company_id, department_id, title, description, assigned_to, status, dependencies, retry_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, 0, ?, ?)
    `).run(
      id,
      goalId,
      task.companyId,
      task.departmentId || null,
      task.title,
      task.description,
      task.assignedTo || null,
      JSON.stringify(task.dependencies || []),
      now,
      now
    );

    return {
      id,
      goalId,
      companyId: task.companyId,
      departmentId: task.departmentId || null,
      title: task.title,
      description: task.description,
      assignedTo: task.assignedTo || null,
      status: 'todo',
      dependencies: task.dependencies || [],
      retryCount: 0,
      feedback: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public updateTask(id: string, updates: Partial<Task>): Task | null {
    const t = this.getTask(id);
    if (!t) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.assignedTo !== undefined) { fields.push('assigned_to = ?'); values.push(updates.assignedTo); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.dependencies !== undefined) { fields.push('dependencies = ?'); values.push(JSON.stringify(updates.dependencies)); }
    if (updates.retryCount !== undefined) { fields.push('retry_count = ?'); values.push(updates.retryCount); }
    if (updates.feedback !== undefined) { fields.push('feedback = ?'); values.push(updates.feedback); }
    if (updates.result !== undefined) { fields.push('result = ?'); values.push(updates.result); }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getTask(id);
  }

  public deleteTask(taskId: string): boolean {
    const res = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    return res.changes > 0;
  }

  // --- Runs & Messages ---
  public createRun(companyId: string): Run {
    const id = 'run_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO runs (id, company_id, status, started_at)
      VALUES (?, ?, 'running', ?)
    `).run(id, companyId, now);

    return {
      id,
      companyId,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      error: null
    };
  }

  public getRun(id: string): Run | null {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      companyId: r.company_id,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      estimatedCost: r.estimated_cost,
      error: r.error,
    };
  }

  public updateRun(id: string, updates: Partial<Run>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.finishedAt !== undefined) { fields.push('finished_at = ?'); values.push(updates.finishedAt); }
    if (updates.promptTokens !== undefined) { fields.push('prompt_tokens = ?'); values.push(updates.promptTokens); }
    if (updates.completionTokens !== undefined) { fields.push('completion_tokens = ?'); values.push(updates.completionTokens); }
    if (updates.totalTokens !== undefined) { fields.push('total_tokens = ?'); values.push(updates.totalTokens); }
    if (updates.estimatedCost !== undefined) { fields.push('estimated_cost = ?'); values.push(updates.estimatedCost); }
    if (updates.error !== undefined) { fields.push('error = ?'); values.push(updates.error); }

    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public reconcileStaleRuns(): number {
    const now = new Date().toISOString();
    const res = this.db.prepare("UPDATE runs SET status = 'cancelled', finished_at = ? WHERE status IN ('running', 'paused')").run(now);
    return res.changes;
  }

  public listRuns(companyId: string): Run[] {
    const rows = this.db.prepare('SELECT * FROM runs WHERE company_id = ? ORDER BY started_at DESC').all(companyId) as any[];
    return rows.map(r => ({
      id: r.id,
      companyId: r.company_id,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      estimatedCost: r.estimated_cost,
      error: r.error,
    }));
  }

  public addMessage(msg: Omit<Message, 'id' | 'timestamp'>): Message {
    const id = 'msg_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();

    let targetRunId = msg.runId;
    if (!targetRunId || targetRunId === 'manual') {
      targetRunId = `chat_${msg.companyId}`;
    }

    // Always guarantee that targetRunId exists in runs table before inserting message
    const runRow = this.db.prepare('SELECT id FROM runs WHERE id = ?').get(targetRunId);
    if (!runRow) {
      this.db.prepare(`
        INSERT OR IGNORE INTO runs (id, company_id, status, started_at)
        VALUES (?, ?, 'idle', ?)
      `).run(targetRunId, msg.companyId, now);
    }

    this.db.prepare(`
      INSERT INTO messages (id, run_id, company_id, agent_id, role, content, tool_calls, tool_results, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetRunId,
      msg.companyId,
      msg.agentId || null,
      msg.role,
      msg.content,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.toolResults ? JSON.stringify(msg.toolResults) : null,
      now
    );

    return {
      id,
      timestamp: now,
      ...msg,
      runId: targetRunId,
    };
  }

  public listMessages(runId: string, companyId?: string): Message[] {
    let targetRunId = runId;
    if ((!targetRunId || targetRunId === 'manual') && companyId) {
      targetRunId = `chat_${companyId}`;
    }
    const rows = this.db.prepare('SELECT * FROM messages WHERE run_id = ? ORDER BY timestamp ASC').all(targetRunId) as any[];
    return rows.map(r => ({
      id: r.id,
      runId: r.run_id,
      companyId: r.company_id,
      agentId: r.agent_id,
      role: r.role,
      content: r.content,
      toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
      toolResults: r.tool_results ? JSON.parse(r.tool_results) : undefined,
      timestamp: r.timestamp,
    }));
  }

  // --- Approvals ---
  public createApproval(approval: Omit<Approval, 'id' | 'createdAt' | 'resolvedAt' | 'status'>): Approval {
    const id = 'appr_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO approvals (id, run_id, company_id, agent_id, action_type, description, details, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      approval.runId,
      approval.companyId,
      approval.agentId,
      approval.actionType,
      approval.description,
      JSON.stringify(approval.details || {}),
      now
    );

    return {
      id,
      status: 'pending',
      createdAt: now,
      resolvedAt: null,
      ...approval,
    };
  }

  public resolveApproval(id: string, status: 'approved' | 'denied'): boolean {
    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'
    `).run(status, now, id);
    return res.changes > 0;
  }

  public listPendingApprovals(companyId?: string): Approval[] {
    const sql = companyId
      ? "SELECT * FROM approvals WHERE status = 'pending' AND company_id = ? ORDER BY created_at ASC"
      : "SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC";
    const rows = (companyId ? this.db.prepare(sql).all(companyId) : this.db.prepare(sql).all()) as any[];
    return rows.map(r => ({
      id: r.id,
      runId: r.run_id,
      companyId: r.company_id,
      agentId: r.agent_id,
      actionType: r.action_type,
      description: r.description,
      details: JSON.parse(r.details || '{}'),
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  }

  // --- Memory Notes ---
  public listMemoryNotes(companyId: string): MemoryNote[] {
    const rows = this.db.prepare('SELECT * FROM memory_notes WHERE company_id = ? ORDER BY updated_at DESC').all(companyId) as any[];
    return rows.map(r => ({
      id: r.id,
      companyId: r.company_id,
      title: r.title,
      content: r.content,
      tags: JSON.parse(r.tags || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public writeMemoryNote(companyId: string, title?: string, content?: string, tags: string[] = []): MemoryNote {
    const id = 'mem_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    const safeTitle = (title && typeof title === 'string' && title.trim()) ? title.trim() : 'Company Strategic Note';
    const safeContent = (content && typeof content === 'string') ? content : '';
    this.db.prepare(`
      INSERT INTO memory_notes (id, company_id, title, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, companyId, safeTitle, safeContent, JSON.stringify(tags || []), now, now);

    return {
      id,
      companyId,
      title: safeTitle,
      content: safeContent,
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };
  }

  // --- Usage Tracking ---
  public recordUsage(usage: Omit<UsageRecord, 'id' | 'timestamp'>): void {
    const id = 'use_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO usage (id, company_id, run_id, agent_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      usage.companyId,
      usage.runId,
      usage.agentId,
      usage.model,
      usage.promptTokens,
      usage.completionTokens,
      usage.totalTokens,
      usage.estimatedCost,
      now
    );

    // Update Company totalSpent
    this.db.prepare('UPDATE companies SET total_spent = total_spent + ? WHERE id = ?')
      .run(usage.estimatedCost, usage.companyId);

    // Update Run totals
    this.db.prepare(`
      UPDATE runs
      SET prompt_tokens = prompt_tokens + ?,
          completion_tokens = completion_tokens + ?,
          total_tokens = total_tokens + ?,
          estimated_cost = estimated_cost + ?
      WHERE id = ?
    `).run(usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.estimatedCost, usage.runId);
  }
}
