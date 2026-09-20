export const API_CHANNEL = {
  // Settings & Providers
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  SAVE_PROVIDER_KEY: 'provider:saveKey',
  DELETE_PROVIDER_KEY: 'provider:deleteKey',
  GET_PROVIDER_STATUSES: 'provider:getStatuses',
  TEST_PROVIDER: 'provider:test',
  LIST_MODELS: 'models:list',
  DETECT_OLLAMA: 'ollama:detect',
  SELECT_DIRECTORY: 'dialog:selectDirectory',
  OPEN_DIRECTORY: 'shell:openDirectory',
  GET_WORKSPACE_PATH: 'workspace:getPath',

  // Company
  LIST_COMPANIES: 'company:list',
  GET_COMPANY: 'company:get',
  CREATE_COMPANY: 'company:create',
  UPDATE_COMPANY: 'company:update',
  DELETE_COMPANY: 'company:delete',
  RESTART_COMPANY: 'company:restart',

  // Agents & Tasks
  LIST_AGENTS: 'agents:list',
  DELETE_AGENT: 'agents:delete',
  LIST_TASKS: 'tasks:list',
  CREATE_TASK: 'tasks:create',
  UPDATE_TASK: 'tasks:update',
  DELETE_TASK: 'tasks:delete',

  // Runs & Orchestration
  START_RUN: 'run:start',
  STOP_RUN: 'run:stop',
  PAUSE_RUN: 'run:pause',
  RESUME_RUN: 'run:resume',
  SEND_CEO_MESSAGE: 'run:sendCeoMessage',
  LIST_MESSAGES: 'messages:list',
  LIST_RUNS: 'runs:list',
  ON_RUN_EVENT: 'run:event',

  // Approvals
  LIST_APPROVALS: 'approvals:list',
  RESPOND_APPROVAL: 'approvals:respond',

  // Deliverables & Memory
  LIST_DELIVERABLES: 'deliverables:list',
  READ_DELIVERABLE: 'deliverables:read',
  LIST_MEMORY_NOTES: 'memory:list',
} as const;
