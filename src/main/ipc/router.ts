import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { API_CHANNEL } from '../../shared/channels';
import { AppDatabase } from '../db/database';
import { SecureKeyStore } from '../security/keyStore';
import { ProviderRegistry } from '../providers/registry';
import { WorkspaceManager } from '../workspace/workspaceManager';
import { CompanyOrchestrator } from '../agents/orchestrator';
import {
  AppSettings,
  CreateCompanyDTO,
  ProviderType,
  RunOptions
} from '../../shared/types';

export function registerIpcHandlers(
  db: AppDatabase,
  keyStore: SecureKeyStore,
  registry: ProviderRegistry,
  workspace: WorkspaceManager,
  orchestrator: CompanyOrchestrator,
  getMainWindow: () => BrowserWindow | null
) {
  // Broadcast orchestrator events to renderer window
  orchestrator.subscribe((event) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(API_CHANNEL.ON_RUN_EVENT, event);
    }
  });

  // --- Settings & Providers ---
  ipcMain.handle(API_CHANNEL.GET_SETTINGS, async (): Promise<AppSettings> => {
    const defaultSettings: AppSettings = {
      providers: {
        openrouter: { enabled: true },
        anthropic: { enabled: true },
        openai: { enabled: true },
        google: { enabled: true },
        'openai-compatible': { enabled: true, baseUrl: 'http://localhost:11434/v1' },
      },
      defaultCeoModel: 'gpt-4o',
      defaultWorkerModel: 'gpt-4o-mini',
      globalMonthlyBudget: 100.0,
      theme: 'dark',
      autoDetectOllama: true,
      workspaceDir: workspace.getBaseDir(),
      onboardingCompleted: false,
    };
    const saved = db.getSetting<AppSettings>('settings', defaultSettings);
    if (!saved.workspaceDir) {
      saved.workspaceDir = workspace.getBaseDir();
    }
    return saved;
  });

  ipcMain.handle(API_CHANNEL.SAVE_SETTINGS, async (_e, updates: Partial<AppSettings>) => {
    const current = db.getSetting<AppSettings>('settings', {
      providers: {
        openrouter: { enabled: true },
        anthropic: { enabled: true },
        openai: { enabled: true },
        google: { enabled: true },
        'openai-compatible': { enabled: true, baseUrl: 'http://localhost:11434/v1' },
      },
      defaultCeoModel: 'gpt-4o',
      defaultWorkerModel: 'gpt-4o-mini',
      globalMonthlyBudget: 100.0,
      theme: 'dark',
      autoDetectOllama: true,
      workspaceDir: workspace.getBaseDir(),
    });

    if (updates.workspaceDir) {
      workspace.setBaseDir(updates.workspaceDir);
    }

    const merged = { ...current, ...updates };
    db.setSetting('settings', merged);
    return true;
  });

  ipcMain.handle(API_CHANNEL.SELECT_DIRECTORY, async () => {
    const win = getMainWindow();
    const res = await dialog.showOpenDialog(win || undefined as any, {
      title: 'Select Company Workspace Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    return res.filePaths[0];
  });

  ipcMain.handle(API_CHANNEL.OPEN_DIRECTORY, async (_e, pathOrCompanyId?: string) => {
    try {
      let targetPath = workspace.getBaseDir();
      if (pathOrCompanyId) {
        if (pathOrCompanyId.includes('/') || pathOrCompanyId.includes('\\')) {
          targetPath = pathOrCompanyId;
        } else {
          targetPath = workspace.getCompanyDir(pathOrCompanyId);
        }
      }
      await shell.openPath(targetPath);
      return true;
    } catch (err) {
      console.error('Failed to open directory in shell:', err);
      return false;
    }
  });

  ipcMain.handle(API_CHANNEL.GET_WORKSPACE_PATH, async (_e, companyId?: string) => {
    if (companyId) {
      return workspace.getCompanyDir(companyId);
    }
    return workspace.getBaseDir();
  });

  ipcMain.handle(API_CHANNEL.SAVE_PROVIDER_KEY, async (_e, provider: ProviderType, apiKey: string) => {
    keyStore.saveKey(provider, apiKey);
    return true;
  });

  ipcMain.handle(API_CHANNEL.DELETE_PROVIDER_KEY, async (_e, provider: ProviderType) => {
    keyStore.deleteKey(provider);
    return true;
  });

  ipcMain.handle(API_CHANNEL.GET_PROVIDER_STATUSES, async () => {
    const settings = db.getSetting<AppSettings>('settings', {} as any);
    const providers: ProviderType[] = ['openrouter', 'google', 'openai', 'anthropic', 'openai-compatible'];
    return providers.map(p => keyStore.getProviderStatus(p, settings?.providers?.[p]?.baseUrl));
  });

  ipcMain.handle(API_CHANNEL.TEST_PROVIDER, async (_e, provider: ProviderType, modelId?: string) => {
    try {
      const adapter = registry.getAdapterForProvider(provider);
      return await adapter.testConnection(modelId);
    } catch (err: any) {
      return { success: false, error: err?.message || 'Connection test failed' };
    }
  });

  ipcMain.handle(API_CHANNEL.LIST_MODELS, async () => {
    return await registry.listAllModels();
  });

  ipcMain.handle(API_CHANNEL.DETECT_OLLAMA, async () => {
    const models = await registry.refreshLocalModels();
    return {
      online: models.length > 0,
      models,
    };
  });

  // --- Companies ---
  ipcMain.handle(API_CHANNEL.LIST_COMPANIES, async () => {
    return db.listCompanies();
  });

  ipcMain.handle(API_CHANNEL.GET_COMPANY, async (_e, id: string) => {
    const company = db.getCompany(id);
    if (!company) throw new Error(`Company ${id} not found`);
    let agents = db.listAgents(id);
    if (!agents.some(a => a.role.toLowerCase() === 'ceo')) {
      db.createAgent({
        companyId: id,
        role: 'CEO',
        systemPrompt: `You are the executive CEO and founder of ${company.name}.\nGoal: "${company.goal}"`,
        model: company.ceoModel || 'gpt-4o',
        allowedTools: ['create_task', 'hire_agent', 'assign_task', 'check_status', 'get_result', 'review_result', 'pause_agent', 'update_goal_plan', 'write_memory', 'request_approval', 'finish'],
        status: 'active',
        createdBy: 'user',
      });
      agents = db.listAgents(id);
    }
    const tasks = db.listTasks(id);
    const departments = db.listDepartments(id);
    const recentRuns = db.listRuns(id).slice(0, 5);
    const pendingApprovals = db.listPendingApprovals(id);
    const deliverables = workspace.listDeliverables(id);

    return {
      company,
      departments,
      agents,
      tasks,
      recentRuns,
      pendingApprovals,
      deliverablesCount: deliverables.length,
    };
  });

  ipcMain.handle(API_CHANNEL.CREATE_COMPANY, async (_e, data: CreateCompanyDTO) => {
    return db.createCompany(data);
  });

  ipcMain.handle(API_CHANNEL.UPDATE_COMPANY, async (_e, id: string, data: any) => {
    return db.updateCompany(id, data);
  });

  ipcMain.handle(API_CHANNEL.DELETE_COMPANY, async (_e, id: string) => {
    orchestrator.cancelAllWorkersForCompany(id);
    const deleted = db.deleteCompany(id);
    if (deleted) {
      workspace.deleteCompanyDir(id);
    }
    return deleted;
  });

  ipcMain.handle(API_CHANNEL.RESTART_COMPANY, async (_e, id: string) => {
    orchestrator.cancelAllWorkersForCompany(id);
    const restarted = db.restartCompany(id);
    if (restarted) {
      workspace.cleanCompanyDir(id);
    }
    return restarted;
  });

  // --- Agents & Tasks ---
  ipcMain.handle(API_CHANNEL.LIST_AGENTS, async (_e, companyId: string) => {
    return db.listAgents(companyId);
  });

  ipcMain.handle(API_CHANNEL.DELETE_AGENT, async (_e, agentId: string) => {
    return db.deleteAgent(agentId);
  });

  ipcMain.handle(API_CHANNEL.LIST_TASKS, async (_e, companyId: string) => {
    return db.listTasks(companyId);
  });

  ipcMain.handle(API_CHANNEL.CREATE_TASK, async (_e, companyId: string, data: any) => {
    const created = db.createTask({
      companyId,
      title: data.title,
      description: data.description,
      dependencies: data.dependencies,
      assignedTo: data.assignedTo,
    });
    if (created && data.status) {
      db.updateTask(created.id, { status: data.status });
      created.status = data.status;
    }
    if (created && created.status === 'in_progress' && created.assignedTo) {
      orchestrator.dispatchInProgressTask(created.id).catch(err => {
        console.error('Failed to dispatch newly created in-progress task:', err);
      });
    }
    return created;
  });

  ipcMain.handle(API_CHANNEL.UPDATE_TASK, async (_e, taskId: string, data: any) => {
    const updated = db.updateTask(taskId, data);
    if (updated) {
      if (data.status === 'in_progress' && updated.assignedTo) {
        orchestrator.dispatchInProgressTask(taskId).catch(err => {
          console.error('Failed to dispatch in-progress task:', err);
        });
      } else if (data.status && data.status !== 'in_progress') {
        orchestrator.cancelTaskWorker(taskId);
      }
    }
    return updated;
  });

  ipcMain.handle(API_CHANNEL.DELETE_TASK, async (_e, taskId: string) => {
    orchestrator.cancelTaskWorker(taskId);
    return db.deleteTask(taskId);
  });

  // --- Runs & Orchestration ---
  ipcMain.handle(API_CHANNEL.START_RUN, async (_e, companyId: string, options?: RunOptions) => {
    return await orchestrator.startRun(companyId, options);
  });

  ipcMain.handle(API_CHANNEL.STOP_RUN, async (_e, runId: string) => {
    return orchestrator.stopRun(runId);
  });

  ipcMain.handle(API_CHANNEL.PAUSE_RUN, async (_e, runId: string) => {
    return orchestrator.pauseRun(runId);
  });

  ipcMain.handle(API_CHANNEL.RESUME_RUN, async (_e, runId: string) => {
    return orchestrator.resumeRun(runId);
  });

  ipcMain.handle(API_CHANNEL.SEND_CEO_MESSAGE, async (_e, companyId: string, runId: string, message: string) => {
    return await orchestrator.sendCeoMessage(companyId, runId, message);
  });

  ipcMain.handle(API_CHANNEL.LIST_MESSAGES, async (_e, companyId: string, runId?: string) => {
    return db.listMessages(runId || `chat_${companyId}`, companyId);
  });

  ipcMain.handle(API_CHANNEL.LIST_RUNS, async (_e, companyId: string) => {
    return db.listRuns(companyId);
  });

  // --- Approvals ---
  ipcMain.handle(API_CHANNEL.LIST_APPROVALS, async (_e, companyId?: string) => {
    return db.listPendingApprovals(companyId);
  });

  ipcMain.handle(API_CHANNEL.RESPOND_APPROVAL, async (_e, approvalId: string, decision: 'approved' | 'denied') => {
    return orchestrator.resolveApproval(approvalId, decision);
  });

  // --- Deliverables & Memory ---
  ipcMain.handle(API_CHANNEL.LIST_DELIVERABLES, async (_e, companyId: string) => {
    return workspace.listDeliverables(companyId);
  });

  ipcMain.handle(API_CHANNEL.READ_DELIVERABLE, async (_e, companyId: string, relativePath: string) => {
    return workspace.readWorkspaceFile(companyId, relativePath);
  });

  ipcMain.handle(API_CHANNEL.LIST_MEMORY_NOTES, async (_e, companyId: string) => {
    return db.listMemoryNotes(companyId);
  });
}
