export type ProviderType = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'openai-compatible';

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  supportsToolCalling: boolean;
  contextWindow: number;
  isLocal: boolean;
  description?: string;
}

export interface ProviderKeyStatus {
  provider: ProviderType;
  configured: boolean;
  baseUrl?: string;
  lastTestedAt?: string;
  status: 'active' | 'error' | 'unconfigured';
  error?: string;
}

export interface AppSettings {
  providers: Record<ProviderType, {
    enabled: boolean;
    baseUrl?: string;
  }>;
  defaultCeoModel: string;
  defaultWorkerModel: string;
  globalMonthlyBudget: number;
  theme: 'dark' | 'light';
  autoDetectOllama: boolean;
  workspaceDir?: string;
  onboardingCompleted?: boolean;
  maxConcurrentWorkers?: number;
}

export interface Company {
  id: string;
  name: string;
  description: string;
  goal: string;
  template: 'startup' | 'content_studio' | 'software_agency' | 'custom';
  budgetPerRun: number;
  budgetMonthly: number;
  totalSpent: number;
  ceoModel: string;
  workerModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
}

export interface Department {
  id: string;
  companyId: string;
  name: string;
  headAgentId?: string | null;
  description?: string;
  color?: string;
  createdAt: string;
}

export type AgentLevel = 'executive' | 'c_level' | 'lead' | 'specialist';

export interface Agent {
  id: string;
  companyId: string;
  role: string;
  systemPrompt: string;
  model: string;
  allowedTools: string[];
  status: 'active' | 'paused';
  createdBy: 'ceo' | 'user';
  departmentId?: string | null;
  reportsTo?: string | null;
  level?: AgentLevel;
  createdAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'failed';

export interface Task {
  id: string;
  goalId: string;
  companyId: string;
  title: string;
  description: string;
  assignedTo: string | null;
  departmentId?: string | null;
  status: TaskStatus;
  dependencies: string[];
  retryCount: number;
  reviewAttempts: number;
  dispatchState?: 'queued' | 'running' | null;
  claimedAt?: string | null;
  needsAttention?: boolean;
  feedback: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  id: string;
  companyId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  error: string | null;
}

export interface Message {
  id: string;
  runId: string;
  companyId: string;
  agentId: string | null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    result: unknown;
  }>;
  timestamp: string;
}

export interface MemoryNote {
  id: string;
  companyId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  runId: string;
  companyId: string;
  agentId: string;
  actionType: 'hire_agent' | 'budget_threshold' | 'budget_reservation' | 'out_of_bounds_write' | 'task_review_limit' | 'custom';
  description: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  resolvedAt: string | null;
}

export interface UsageRecord {
  id: string;
  companyId: string;
  runId: string;
  agentId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: string;
}

export interface DeliverableFile {
  name: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface CreateCompanyDTO {
  name: string;
  description: string;
  goal: string;
  template: 'startup' | 'content_studio' | 'software_agency' | 'custom';
  budgetPerRun?: number;
  budgetMonthly?: number;
  ceoModel?: string;
  workerModel?: string;
}

export interface CompanyDetail {
  company: Company;
  agents: Agent[];
  departments: Department[];
  tasks: Task[];
  recentRuns: Run[];
  pendingApprovals: Approval[];
  deliverablesCount: number;
}

export type RunEventType =
  | 'token'
  | 'agent_thought'
  | 'agent_message'
  | 'tool_call'
  | 'tool_result'
  | 'agent_status_change'
  | 'task_status_change'
  | 'approval_needed'
  | 'run_status_change'
  | 'usage_update'
  | 'error';

export interface RunEvent {
  runId: string;
  companyId: string;
  type: RunEventType;
  timestamp: string;
  data: {
    agentId?: string;
    agentRole?: string;
    taskId?: string;
    taskTitle?: string;
    assignedTo?: string;
    token?: string;
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    status?: string;
    needsAttention?: boolean;
    dispatchState?: 'queued' | 'running' | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
    };
    approval?: Approval;
    error?: string;
  };
}

export interface RunOptions {
  maxAgents?: number;
  maxStepsPerAgent?: number;
  tokenBudget?: number;
}
