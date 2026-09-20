import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, 
  MessageSquare, 
  Coins, 
  Target, 
  Users, 
  KanbanSquare, 
  FolderDown, 
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Cpu,
  Settings,
  Check,
  Save,
  Sliders,
  Terminal
} from 'lucide-react';
import { Company, Agent, Task, Approval, Run, ModelInfo, Department } from '@shared/types';
import { OrgChart } from './OrgChart';

interface CompanyDashboardProps {
  company: Company;
  departments?: Department[];
  agents: Agent[];
  tasks: Task[];
  recentRuns: Run[];
  pendingApprovals: Approval[];
  deliverablesCount: number;
  models?: ModelInfo[];
  onStartRun: () => void;
  onOpenCeoChat: () => void;
  onNavigateTab: (tab: 'tasks' | 'deliverables' | 'approvals' | 'logs') => void;
  onOpenLogs?: (agentRole?: string) => void;
  onOpenSettings?: () => void;
  onUpdateModels?: (ceoModel: string, workerModel: string) => Promise<void>;
  onDeleteAgent?: (agentId: string) => Promise<void>;
  isRunActive: boolean;
}

export const CompanyDashboard: React.FC<CompanyDashboardProps> = ({
  company,
  departments = [],
  agents,
  tasks,
  recentRuns,
  pendingApprovals,
  deliverablesCount,
  models = [],
  onStartRun,
  onOpenCeoChat,
  onNavigateTab,
  onOpenLogs,
  onOpenSettings,
  onUpdateModels,
  onDeleteAgent,
  isRunActive,
}) => {
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'in_review').length;
  const budgetPercent = Math.min(100, Math.round((company.totalSpent / (company.budgetMonthly || 50)) * 100));

  const [ceoModel, setCeoModel] = useState(company.ceoModel || 'gemini-1.5-flash');
  const [workerModel, setWorkerModel] = useState(company.workerModel || 'gemini-1.5-flash');
  const [isCustomCeo, setIsCustomCeo] = useState(false);
  const [isCustomWorker, setIsCustomWorker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setCeoModel(company.ceoModel || 'gemini-1.5-flash');
    setWorkerModel(company.workerModel || 'gemini-1.5-flash');
  }, [company.ceoModel, company.workerModel]);

  const hasModelChanges = ceoModel !== company.ceoModel || workerModel !== company.workerModel;

  const handleSaveModels = async () => {
    if (!onUpdateModels) return;
    setIsSaving(true);
    try {
      await onUpdateModels(ceoModel, workerModel);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save models:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const groupedModels = useMemo(() => {
    const groups: { name: string; items: ModelInfo[] }[] = [
      { name: 'OpenRouter', items: [] },
      { name: 'Google Gemini', items: [] },
      { name: 'OpenAI', items: [] },
      { name: 'Anthropic Claude', items: [] },
      { name: 'Local Models (Ollama)', items: [] },
      { name: 'Other', items: [] }
    ];

    models.forEach(m => {
      if (m.provider === 'openrouter') groups[0].items.push(m);
      else if (m.provider === 'google') groups[1].items.push(m);
      else if (m.provider === 'openai') groups[2].items.push(m);
      else if (m.provider === 'anthropic') groups[3].items.push(m);
      else if (m.isLocal || m.provider === 'openai-compatible') groups[4].items.push(m);
      else groups[5].items.push(m);
    });

    return groups.filter(g => g.items.length > 0);
  }, [models]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Goal & Execution Controls */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-dark-850 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center space-x-2.5">
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {company.template.replace(/_/g, ' ')}
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">{company.name}</h2>
            </div>
            <p className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed">
              <Target className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span><strong>Mission Goal:</strong> {company.goal}</span>
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => onOpenLogs ? onOpenLogs() : onNavigateTab('logs')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer"
              title="View Real-Time and Historical Execution Logs"
            >
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Execution Logs</span>
            </button>

            <button
              onClick={onOpenCeoChat}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span>Chat with CEO</span>
            </button>

            <button
              onClick={onStartRun}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all transform active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isRunActive ? 'View Active Run' : 'Start Goal Run'}</span>
            </button>
          </div>
        </div>

        {/* Approvals Alert if any */}
        {pendingApprovals.length > 0 && (
          <div
            onClick={() => onNavigateTab('approvals')}
            className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-between cursor-pointer hover:bg-amber-950/60 transition-all text-xs text-amber-200"
          >
            <div className="flex items-center space-x-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>{pendingApprovals.length} Action(s) Require Your Approval!</strong> Click to review in Approvals Inbox.
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400" />
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Spend Gauge */}
        <div className="p-4 rounded-xl bg-dark-850 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              Monthly Spend
            </span>
            <span className="text-white font-mono font-bold">${company.totalSpent.toFixed(2)}</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{budgetPercent}% used</span>
            <span>Cap: ${company.budgetMonthly.toFixed(2)}</span>
          </div>
        </div>

        {/* Active Agents */}
        <div
          onClick={() => onNavigateTab('tasks')}
          className="p-4 rounded-xl bg-dark-850 border border-slate-800 space-y-1 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              Roster Size
            </span>
            <span className="text-white font-bold">{agents.length} Agents</span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">{agents.length}</p>
          <p className="text-[10px] text-slate-500">1 CEO + {Math.max(0, agents.length - 1)} Workers</p>
        </div>

        {/* Task Completion */}
        <div
          onClick={() => onNavigateTab('tasks')}
          className="p-4 rounded-xl bg-dark-850 border border-slate-800 space-y-1 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <KanbanSquare className="w-3.5 h-3.5 text-amber-400" />
              Task Progress
            </span>
            <span className="text-white font-bold">{completedTasks}/{tasks.length}</span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">
            {tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0}%
          </p>
          <p className="text-[10px] text-slate-500">{inProgressTasks} currently executing</p>
        </div>

        {/* Deliverables Count */}
        <div
          onClick={() => onNavigateTab('deliverables')}
          className="p-4 rounded-xl bg-dark-850 border border-slate-800 space-y-1 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <FolderDown className="w-3.5 h-3.5 text-cyan-400" />
              Deliverables
            </span>
            <span className="text-white font-bold">{deliverablesCount} Files</span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">{deliverablesCount}</p>
          <p className="text-[10px] text-slate-500">Saved in company /deliverables</p>
        </div>
      </div>

      {/* Model Selection & Agent Engine Configuration */}
      <div className="p-5 rounded-2xl bg-dark-850 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Company AI Model Configuration</h3>
              <p className="text-[11px] text-slate-400">
                Choose the base LLMs powering your CEO orchestration and Worker agents.
              </p>
            </div>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 transition-colors self-start sm:self-auto"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Manage API Keys & Local Ollama</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CEO Model Selector */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                <span>CEO Orchestrator Model</span>
              </label>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsCustomCeo(!isCustomCeo)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
                >
                  {isCustomCeo ? 'Use list' : '+ Custom ID'}
                </button>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Tool Calling
                </span>
              </div>
            </div>

            {isCustomCeo ? (
              <input
                type="text"
                value={ceoModel}
                onChange={(e) => setCeoModel(e.target.value)}
                placeholder="e.g. gemini-3.5-flash or custom model"
                className="w-full bg-slate-800 border border-indigo-500/60 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            ) : (
              <select
                value={ceoModel}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomCeo(true);
                  } else {
                    setCeoModel(e.target.value);
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
              >
                {groupedModels.map(group => (
                  <optgroup key={group.name} label={group.name}>
                    {group.items.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.supportsToolCalling ? '⚡' : '(no tools)'}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {!models.some(m => m.id === ceoModel) && (
                  <option value={ceoModel}>{ceoModel}</option>
                )}
                <option value="__custom__">+ Enter Custom Model ID...</option>
              </select>
            )}
            <p className="text-[10px] text-slate-500">
              Plans goals, creates tasks, manages team budget, and reviews deliverables.
            </p>
          </div>

          {/* Worker Model Selector */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>Default Worker Model</span>
              </label>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsCustomWorker(!isCustomWorker)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
                >
                  {isCustomWorker ? 'Use list' : '+ Custom ID'}
                </button>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Worker
                </span>
              </div>
            </div>

            {isCustomWorker ? (
              <input
                type="text"
                value={workerModel}
                onChange={(e) => setWorkerModel(e.target.value)}
                placeholder="e.g. gemini-3.5-flash or custom model"
                className="w-full bg-slate-800 border border-indigo-500/60 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            ) : (
              <select
                value={workerModel}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomWorker(true);
                  } else {
                    setWorkerModel(e.target.value);
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
              >
                {groupedModels.map(group => (
                  <optgroup key={group.name} label={group.name}>
                    {group.items.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.supportsToolCalling ? '⚡' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {!models.some(m => m.id === workerModel) && (
                  <option value={workerModel}>{workerModel}</option>
                )}
                <option value="__custom__">+ Enter Custom Model ID...</option>
              </select>
            )}
            <p className="text-[10px] text-slate-500">
              Assigned to specialist worker agents for research, writing, and coding tasks.
            </p>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 flex items-center space-x-1 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                <Check className="w-3.5 h-3.5" />
                <span>Models updated successfully! CEO roster synced.</span>
              </span>
            )}
          </div>

          <button
            onClick={handleSaveModels}
            disabled={!hasModelChanges || isSaving}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all ${
              hasModelChanges
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : hasModelChanges ? 'Apply Model Changes' : 'Models Up to Date'}</span>
          </button>
        </div>
      </div>

      {/* Org Chart */}
      <OrgChart
        agents={agents}
        departments={departments}
        ceoModel={company.ceoModel}
        workerModel={company.workerModel}
        onViewAgentLogs={(role) => onOpenLogs ? onOpenLogs(role) : onNavigateTab('logs')}
        onDeleteAgent={onDeleteAgent}
      />
    </div>
  );
};
