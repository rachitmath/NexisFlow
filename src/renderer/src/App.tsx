import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { CompanyDashboard } from './components/dashboard/CompanyDashboard';
import { TaskBoard } from './components/dashboard/TaskBoard';
import { DeliverablesView } from './components/deliverables/DeliverablesView';
import { ApprovalsInbox } from './components/dashboard/ApprovalsInbox';
import { SettingsModal } from './components/settings/SettingsModal';
import { CreateCompanyModal } from './components/company/CreateCompanyModal';
import { CeoChatDrawer } from './components/dashboard/CeoChatDrawer';
import { RunStreamModal } from './components/run/RunStreamModal';
import { WorkspaceSetupModal } from './components/onboarding/WorkspaceSetupModal';
import { ExecutionLogsView } from './components/dashboard/ExecutionLogsView';
import { 
  Company, 
  Agent, 
  Task, 
  Run, 
  Approval, 
  ModelInfo, 
  RunEvent, 
  Message,
  CreateCompanyDTO,
  Department
} from '@shared/types';
import { BUILTIN_MODELS } from '@shared/constants';

export const App: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);
  const [deliverablesCount, setDeliverablesCount] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'deliverables' | 'approvals' | 'logs'>('dashboard');
  const [selectedAgentLogFilter, setSelectedAgentLogFilter] = useState<string | null>(null);

  // Modals & Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNewCompanyOpen, setIsNewCompanyOpen] = useState(false);
  const [isCeoChatOpen, setIsCeoChatOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isWorkspaceSetupOpen, setIsWorkspaceSetupOpen] = useState(false);
  const [workspacePath, setWorkspacePath] = useState('');

  // Live Run State
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [ceoMessages, setCeoMessages] = useState<Message[]>([]);

  // Models & Ollama
  const [models, setModels] = useState<ModelInfo[]>(BUILTIN_MODELS);
  const [isOllamaOnline, setIsOllamaOnline] = useState(false);
  const [ollamaModelCount, setOllamaModelCount] = useState(0);
  const [defaultModels, setDefaultModels] = useState<{ ceo: string; worker: string }>({
    ceo: 'gemini-1.5-flash',
    worker: 'gemini-1.5-flash',
  });

  const api = (window as any).nexisFlowAPI;

  // Load companies & models on startup
  const loadInitialData = async () => {
    if (!api) return;
    try {
      // Check onboarding & workspace directory setup
      let isFirstLaunch = false;
      try {
        const settings = await api.getSettings();
        if (settings) {
          setWorkspacePath(settings.workspaceDir || '');
          if (!settings.onboardingCompleted) {
            isFirstLaunch = true;
            setIsWorkspaceSetupOpen(true);
          }
        }
      } catch (err) {
        console.warn('Could not read workspace settings:', err);
      }

      const comps = await api.listCompanies();
      setCompanies(comps);
      if (comps.length > 0) {
        setSelectedCompany(comps[0]);
      } else if (!isFirstLaunch) {
        // Open modal if no company yet and not in workspace setup
        setIsNewCompanyOpen(true);
      }

      const allModels = await api.listModels();
      setModels(allModels);

      const ollama = await api.detectOllama();
      setIsOllamaOnline(ollama.online);
      setOllamaModelCount(ollama.models.length);

      // Detect configured API keys to pick smartest defaults
      try {
        const statuses = await api.getProviderStatuses();
        const openrouterConfigured = statuses.find((s: any) => s.provider === 'openrouter')?.configured;
        const googleConfigured = statuses.find((s: any) => s.provider === 'google')?.configured;
        const openaiConfigured = statuses.find((s: any) => s.provider === 'openai')?.configured;
        const anthropicConfigured = statuses.find((s: any) => s.provider === 'anthropic')?.configured;

        if (openrouterConfigured) {
          setDefaultModels({ ceo: 'deepseek/deepseek-chat', worker: 'deepseek/deepseek-chat' });
        } else if (googleConfigured) {
          setDefaultModels({ ceo: 'gemini-1.5-flash', worker: 'gemini-1.5-flash' });
        } else if (openaiConfigured) {
          setDefaultModels({ ceo: 'gpt-4o', worker: 'gpt-4o-mini' });
        } else if (anthropicConfigured) {
          setDefaultModels({ ceo: 'claude-3-5-sonnet-20241022', worker: 'claude-3-5-haiku-20241022' });
        } else if (ollama.online && ollama.models.length > 0) {
          setDefaultModels({ ceo: ollama.models[0].name, worker: ollama.models[0].name });
        }
      } catch (err) {
        console.warn('Could not read provider statuses for defaults:', err);
      }
    } catch (err) {
      console.error('Startup data fetch error:', err);
    }
  };

  // Load company detail
  const loadCompanyDetail = async (companyId: string) => {
    if (!api || !companyId) return;
    try {
      const detail = await api.getCompany(companyId);
      setSelectedCompany(detail.company);
      setDepartments(detail.departments || []);
      setAgents(detail.agents);
      setTasks(detail.tasks);
      setRecentRuns(detail.recentRuns);
      setPendingApprovals(detail.pendingApprovals);
      setDeliverablesCount(detail.deliverablesCount);

      // Check if there is an active running run
      const running = detail.recentRuns.find(r => r.status === 'running' || r.status === 'paused');
      if (running) {
        setActiveRun(running);
      }
    } catch (err) {
      console.error('Failed to load company detail:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedCompany?.id) {
      loadCompanyDetail(selectedCompany.id);
    }
  }, [selectedCompany?.id]);

  // Subscribe to real-time IPC run events
  useEffect(() => {
    if (!api) return;

    const unsubscribe = api.onRunEvent((event: RunEvent) => {
      setRunEvents(prev => [...prev, event]);

      if (event.type === 'run_status_change' && event.data.status) {
        setActiveRun(prev => prev ? { ...prev, status: event.data.status as any } : null);
        if (selectedCompany) loadCompanyDetail(selectedCompany.id);
      }

      if (event.type === 'usage_update' && event.data.usage) {
        setActiveRun(prev => prev ? {
          ...prev,
          totalTokens: prev.totalTokens + (event.data.usage?.totalTokens || 0),
          estimatedCost: prev.estimatedCost + (event.data.usage?.cost || 0),
        } : null);
      }

      if (event.type === 'task_status_change' && selectedCompany) {
        api.listTasks(selectedCompany.id).then(setTasks);
      }

      if (event.type === 'agent_status_change' && selectedCompany) {
        loadCompanyDetail(selectedCompany.id);
      }

      if (event.type === 'approval_needed' && event.data.approval) {
        setPendingApprovals(prev => [...prev, event.data.approval!]);
      }

      if (event.type === 'agent_message' && event.data) {
        const d = event.data as any;
        setCeoMessages(prev => {
          if (prev.some(m => m.content === d.content && Math.abs(Date.now() - new Date(m.timestamp).getTime()) < 2000)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: 'msg_' + Date.now() + Math.random().toString(36).substring(2, 6),
              runId: event.runId,
              companyId: selectedCompany?.id || '',
              agentId: d.agentId || null,
              role: d.agentRole === 'User' ? 'user' : 'assistant',
              content: d.content || '',
              timestamp: event.timestamp || new Date().toISOString(),
            }
          ];
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedCompany?.id]);

  const handleCreateCompany = async (dto: CreateCompanyDTO) => {
    if (!api) return;
    const newComp = await api.createCompany(dto);
    const comps = await api.listCompanies();
    setCompanies(comps);
    setSelectedCompany(newComp);
    loadCompanyDetail(newComp.id);
  };

  const handleStartRun = async () => {
    if (!api || !selectedCompany) return;
    try {
      setRunEvents([]);
      const run = await api.startRun(selectedCompany.id);
      setActiveRun(run);
      setIsRunModalOpen(true);
      await loadCompanyDetail(selectedCompany.id);
    } catch (err: any) {
      alert(`Could not start run: ${err?.message}`);
    }
  };

  const handleStopRun = async () => {
    if (!api || !activeRun) return;
    await api.stopRun(activeRun.id);
    if (selectedCompany) await loadCompanyDetail(selectedCompany.id);
  };

  const handlePauseRun = async () => {
    if (!api || !activeRun) return;
    await api.pauseRun(activeRun.id);
    if (selectedCompany) await loadCompanyDetail(selectedCompany.id);
  };

  const handleResumeRun = async () => {
    if (!api || !activeRun) return;
    await api.resumeRun(activeRun.id);
    if (selectedCompany) await loadCompanyDetail(selectedCompany.id);
  };

  const handleResolveApproval = async (approvalId: string, decision: 'approved' | 'denied') => {
    if (!api) return;
    await api.respondApproval(approvalId, decision);
    if (selectedCompany) await loadCompanyDetail(selectedCompany.id);
  };

  const handleCreateTask = async (title: string, description: string, assignedTo?: string) => {
    if (!api || !selectedCompany) return;
    await api.createTask(selectedCompany.id, { title, description, assignedTo });
    const updated = await api.listTasks(selectedCompany.id);
    setTasks(updated);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!api || !selectedCompany) return;
    try {
      await api.deleteTask(taskId);
      const updated = await api.listTasks(selectedCompany.id);
      setTasks(updated);
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!api || !selectedCompany) return;
    try {
      await api.deleteAgent(agentId);
      await loadCompanyDetail(selectedCompany.id);
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  // Load CEO conversation history whenever the drawer opens or active company changes
  useEffect(() => {
    if (selectedCompany && isCeoChatOpen && api?.listMessages) {
      const runId = activeRun?.id || 'manual';
      api.listMessages(selectedCompany.id, runId)
        .then((msgs: Message[]) => {
          if (Array.isArray(msgs) && msgs.length > 0) {
            setCeoMessages(msgs);
          }
        })
        .catch(console.error);
    }
  }, [selectedCompany?.id, isCeoChatOpen, activeRun?.id]);

  const handleSendCeoMessage = async (message: string) => {
    if (!api || !selectedCompany) return;
    const runId = activeRun?.id || 'manual';
    const tempMsg: Message = {
      id: 'msg_user_' + Date.now(),
      runId,
      companyId: selectedCompany.id,
      agentId: null,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setCeoMessages(prev => [...prev, tempMsg]);

    try {
      const res = await api.sendCeoMessage(selectedCompany.id, runId, message);
      if (res?.messages && Array.isArray(res.messages)) {
        setCeoMessages(res.messages);
      } else if (api.listMessages) {
        const msgs = await api.listMessages(selectedCompany.id, runId);
        if (Array.isArray(msgs) && msgs.length > 0) {
          setCeoMessages(msgs);
        }
      }
    } catch (err) {
      console.error('Failed to send CEO message:', err);
    }
  };

  const handleAddCustomModel = (modelId: string) => {
    if (!modelId || !modelId.trim()) return;
    const cleanId = modelId.trim();
    setModels(prev => {
      if (prev.some(m => m.id === cleanId)) return prev;
      const newModel: ModelInfo = {
        id: cleanId,
        name: cleanId,
        provider: cleanId.toLowerCase().startsWith('openrouter/') || cleanId.includes('/') ? 'openrouter'
          : cleanId.toLowerCase().includes('gemini') ? 'google' 
          : cleanId.toLowerCase().includes('claude') ? 'anthropic'
          : cleanId.toLowerCase().includes('gpt') ? 'openai'
          : 'openai-compatible',
        supportsToolCalling: true,
        contextWindow: 128000,
        isLocal: false,
        description: 'User configured custom model',
      };
      return [...prev, newModel];
    });
  };

  const handleUpdateCompanyModels = async (ceoModel: string, workerModel: string) => {
    if (!api || !selectedCompany) return;
    try {
      handleAddCustomModel(ceoModel);
      handleAddCustomModel(workerModel);
      const updated = await api.updateCompany(selectedCompany.id, { ceoModel, workerModel });
      setSelectedCompany(updated);
      await loadCompanyDetail(selectedCompany.id);
      const comps = await api.listCompanies();
      setCompanies(comps);
    } catch (err) {
      console.error('Failed to update company models:', err);
    }
  };

  const handleConfirmWorkspace = async (chosenPath: string) => {
    if (!api) return;
    try {
      await api.saveSettings({
        workspaceDir: chosenPath,
        onboardingCompleted: true,
      });
      setWorkspacePath(chosenPath);
      setIsWorkspaceSetupOpen(false);

      if (companies.length === 0) {
        setIsNewCompanyOpen(true);
      }
    } catch (err) {
      console.error('Failed to save workspace setup:', err);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-dark-900 text-slate-100 overflow-hidden font-sans">
      {/* Navigation Sidebar */}
      <Sidebar
        companies={companies}
        selectedCompany={selectedCompany}
        onSelectCompany={(c) => setSelectedCompany(c)}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'logs') {
            setSelectedAgentLogFilter(null);
          }
          setActiveTab(tab);
        }}
        onOpenNewCompany={() => setIsNewCompanyOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        pendingApprovalsCount={pendingApprovals.length}
        isOllamaOnline={isOllamaOnline}
        ollamaModelCount={ollamaModelCount}
        isRunActive={activeRun?.status === 'running' || activeRun?.status === 'paused'}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-dark-900">
        {/* Top Header Breadcrumb */}
        <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 bg-dark-900/60 backdrop-blur-sm">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 font-medium">NexisFlow</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200 font-semibold">{selectedCompany?.name || 'No Company Selected'}</span>
            <span className="text-slate-600">/</span>
            <span className="text-indigo-400 font-semibold capitalize">{activeTab}</span>
          </div>

          {activeRun && (activeRun.status === 'running' || activeRun.status === 'paused') && (
            <button
              onClick={() => setIsRunModalOpen(true)}
              className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center space-x-2 animate-pulse hover:bg-emerald-500/20 transition-all cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Live Run Active &bull; View Stream</span>
            </button>
          )}
        </header>

        {/* Dynamic Views */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedCompany ? (
            <>
              {activeTab === 'dashboard' && (
                <CompanyDashboard
                  company={selectedCompany}
                  departments={departments}
                  agents={agents}
                  tasks={tasks}
                  recentRuns={recentRuns}
                  pendingApprovals={pendingApprovals}
                  deliverablesCount={deliverablesCount}
                  models={models}
                  onStartRun={activeRun?.status === 'running' ? () => setIsRunModalOpen(true) : handleStartRun}
                  onOpenCeoChat={() => setIsCeoChatOpen(true)}
                  onNavigateTab={setActiveTab}
                  onOpenLogs={(agentRole) => {
                    setSelectedAgentLogFilter(agentRole || null);
                    setActiveTab('logs');
                  }}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onUpdateModels={handleUpdateCompanyModels}
                  onDeleteAgent={handleDeleteAgent}
                  isRunActive={activeRun?.status === 'running' || activeRun?.status === 'paused'}
                />
              )}

              {activeTab === 'tasks' && (
                <TaskBoard
                  tasks={tasks}
                  agents={agents}
                  onCreateTask={handleCreateTask}
                  onDeleteTask={handleDeleteTask}
                />
              )}

              {activeTab === 'deliverables' && (
                <DeliverablesView
                  companyId={selectedCompany.id}
                  runs={recentRuns}
                />
              )}

              {activeTab === 'approvals' && (
                <ApprovalsInbox
                  approvals={pendingApprovals}
                  onRespond={handleResolveApproval}
                />
              )}

              {activeTab === 'logs' && (
                <ExecutionLogsView
                  company={selectedCompany}
                  agents={agents}
                  runs={recentRuns}
                  activeRun={activeRun}
                  liveEvents={runEvents}
                  initialAgentFilter={selectedAgentLogFilter}
                  onPauseRun={handlePauseRun}
                  onResumeRun={handleResumeRun}
                  onStopRun={handleStopRun}
                />
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
              <h3 className="text-lg font-bold text-white">Welcome to NexisFlow</h3>
              <p className="text-xs text-slate-400 max-w-md">
                Create a company and set an ambitious goal. A CEO agent will recruit worker agents and execute your ideas autonomously.
              </p>
              <button
                onClick={() => setIsNewCompanyOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20"
              >
                Incorporate Your First Company
              </button>
            </div>
          )}
        </div>
      </main>

      {/* CEO Direct Chat Drawer */}
      {selectedCompany && (
        <CeoChatDrawer
          isOpen={isCeoChatOpen}
          onClose={() => setIsCeoChatOpen(false)}
          companyName={selectedCompany.name}
          ceoModel={selectedCompany.ceoModel}
          messages={ceoMessages}
          onSendMessage={handleSendCeoMessage}
          isRunning={activeRun?.status === 'running'}
        />
      )}

      {/* Streaming Run Modal */}
      <RunStreamModal
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        run={activeRun}
        events={runEvents}
        onStop={handleStopRun}
        onPause={handlePauseRun}
        onResume={handleResumeRun}
        pendingApproval={pendingApprovals[0] || null}
        onResolveApproval={handleResolveApproval}
        onOpenFullLogs={() => {
          setIsRunModalOpen(false);
          setActiveTab('logs');
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        models={models}
        onRefreshModels={loadInitialData}
        activeCompany={selectedCompany}
        onSetActiveModel={async (modelId) => {
          if (selectedCompany) {
            await handleUpdateCompanyModels(modelId, selectedCompany.workerModel);
          }
        }}
        onAddCustomModel={handleAddCustomModel}
      />

      {/* Create Company Modal */}
      <CreateCompanyModal
        isOpen={isNewCompanyOpen}
        onClose={() => setIsNewCompanyOpen(false)}
        models={models}
        defaultCeoModel={defaultModels.ceo}
        defaultWorkerModel={defaultModels.worker}
        onCreate={handleCreateCompany}
      />

      {/* Workspace Directory Onboarding Modal */}
      <WorkspaceSetupModal
        isOpen={isWorkspaceSetupOpen}
        initialPath={workspacePath}
        onConfirm={handleConfirmWorkspace}
      />
    </div>
  );
};

export default App;
