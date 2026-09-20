import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  Company,
  CompanyDetail,
  CreateCompanyDTO,
  Agent,
  Task,
  Run,
  Approval,
  DeliverableFile,
  MemoryNote,
  ModelInfo,
  ProviderType,
  RunEvent,
  RunOptions,
  ProviderKeyStatus,
  Message
} from '../shared/types';
import { API_CHANNEL } from '../shared/channels';

export { API_CHANNEL };

export const nexisFlowAPI = {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(API_CHANNEL.GET_SETTINGS),
  saveSettings: (settings: Partial<AppSettings>): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.SAVE_SETTINGS, settings),
  saveProviderKey: (provider: ProviderType, apiKey: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.SAVE_PROVIDER_KEY, provider, apiKey),
  deleteProviderKey: (provider: ProviderType): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.DELETE_PROVIDER_KEY, provider),
  getProviderStatuses: (): Promise<ProviderKeyStatus[]> => ipcRenderer.invoke(API_CHANNEL.GET_PROVIDER_STATUSES),
  testProvider: (provider: ProviderType, modelId?: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> =>
    ipcRenderer.invoke(API_CHANNEL.TEST_PROVIDER, provider, modelId),
  listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke(API_CHANNEL.LIST_MODELS),
  detectOllama: (): Promise<{ online: boolean; models: ModelInfo[] }> => ipcRenderer.invoke(API_CHANNEL.DETECT_OLLAMA),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke(API_CHANNEL.SELECT_DIRECTORY),
  openDirectory: (pathOrCompanyId?: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.OPEN_DIRECTORY, pathOrCompanyId),
  getWorkspacePath: (companyId?: string): Promise<string> => ipcRenderer.invoke(API_CHANNEL.GET_WORKSPACE_PATH, companyId),

  // Companies
  listCompanies: (): Promise<Company[]> => ipcRenderer.invoke(API_CHANNEL.LIST_COMPANIES),
  getCompany: (id: string): Promise<CompanyDetail> => ipcRenderer.invoke(API_CHANNEL.GET_COMPANY, id),
  createCompany: (data: CreateCompanyDTO): Promise<Company> => ipcRenderer.invoke(API_CHANNEL.CREATE_COMPANY, data),
  updateCompany: (id: string, data: Partial<Company>): Promise<Company> => ipcRenderer.invoke(API_CHANNEL.UPDATE_COMPANY, id, data),
  deleteCompany: (id: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.DELETE_COMPANY, id),

  // Agents & Tasks
  listAgents: (companyId: string): Promise<Agent[]> => ipcRenderer.invoke(API_CHANNEL.LIST_AGENTS, companyId),
  deleteAgent: (agentId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(API_CHANNEL.DELETE_AGENT, agentId),
  listTasks: (companyId: string): Promise<Task[]> => ipcRenderer.invoke(API_CHANNEL.LIST_TASKS, companyId),
  createTask: (companyId: string, data: Partial<Task>): Promise<Task> => ipcRenderer.invoke(API_CHANNEL.CREATE_TASK, companyId, data),
  updateTask: (taskId: string, data: Partial<Task>): Promise<Task> => ipcRenderer.invoke(API_CHANNEL.UPDATE_TASK, taskId, data),
  deleteTask: (taskId: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.DELETE_TASK, taskId),

  // Runs
  startRun: (companyId: string, options?: RunOptions): Promise<Run> => ipcRenderer.invoke(API_CHANNEL.START_RUN, companyId, options),
  stopRun: (runId: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.STOP_RUN, runId),
  pauseRun: (runId: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.PAUSE_RUN, runId),
  resumeRun: (runId: string): Promise<boolean> => ipcRenderer.invoke(API_CHANNEL.RESUME_RUN, runId),
  sendCeoMessage: (companyId: string, runId: string, message: string): Promise<{ success: boolean; reply?: string; messages: Message[] }> =>
    ipcRenderer.invoke(API_CHANNEL.SEND_CEO_MESSAGE, companyId, runId, message),
  listMessages: (companyId: string, runId?: string): Promise<Message[]> =>
    ipcRenderer.invoke(API_CHANNEL.LIST_MESSAGES, companyId, runId),
  listRuns: (companyId: string): Promise<Run[]> =>
    ipcRenderer.invoke(API_CHANNEL.LIST_RUNS, companyId),

  // Approvals
  listApprovals: (companyId?: string): Promise<Approval[]> => ipcRenderer.invoke(API_CHANNEL.LIST_APPROVALS, companyId),
  respondApproval: (approvalId: string, decision: 'approved' | 'denied', reason?: string): Promise<boolean> =>
    ipcRenderer.invoke(API_CHANNEL.RESPOND_APPROVAL, approvalId, decision, reason),

  // Deliverables & Memory
  listDeliverables: (companyId: string): Promise<DeliverableFile[]> => ipcRenderer.invoke(API_CHANNEL.LIST_DELIVERABLES, companyId),
  readDeliverable: (companyId: string, relativePath: string): Promise<string> => ipcRenderer.invoke(API_CHANNEL.READ_DELIVERABLE, companyId, relativePath),
  listMemoryNotes: (companyId: string): Promise<MemoryNote[]> => ipcRenderer.invoke(API_CHANNEL.LIST_MEMORY_NOTES, companyId),

  // Event Subscription
  onRunEvent: (callback: (event: RunEvent) => void): (() => void) => {
    const handler = (_e: any, event: RunEvent) => callback(event);
    ipcRenderer.on(API_CHANNEL.ON_RUN_EVENT, handler);
    return () => {
      ipcRenderer.removeListener(API_CHANNEL.ON_RUN_EVENT, handler);
    };
  },
};

export type NexisFlowAPI = typeof nexisFlowAPI;

if (typeof contextBridge !== 'undefined' && contextBridge.exposeInMainWorld) {
  contextBridge.exposeInMainWorld('nexisFlowAPI', nexisFlowAPI);
}
