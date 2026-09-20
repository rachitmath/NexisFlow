import React from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  KanbanSquare, 
  FolderDown, 
  ShieldAlert, 
  Settings, 
  Plus, 
  Cpu, 
  Terminal,
  ChevronDown 
} from 'lucide-react';
import { Company } from '@shared/types';

interface SidebarProps {
  companies: Company[];
  selectedCompany: Company | null;
  onSelectCompany: (company: Company) => void;
  activeTab: 'dashboard' | 'tasks' | 'deliverables' | 'approvals' | 'logs';
  onTabChange: (tab: 'dashboard' | 'tasks' | 'deliverables' | 'approvals' | 'logs') => void;
  onOpenNewCompany: () => void;
  onOpenSettings: () => void;
  pendingApprovalsCount: number;
  isOllamaOnline: boolean;
  ollamaModelCount: number;
  isRunActive?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  companies,
  selectedCompany,
  onSelectCompany,
  activeTab,
  onTabChange,
  onOpenNewCompany,
  onOpenSettings,
  pendingApprovalsCount,
  isOllamaOnline,
  ollamaModelCount,
  isRunActive,
}) => {
  return (
    <aside className="w-64 bg-dark-850 border-r border-slate-800 flex flex-col h-screen select-none">
      {/* App Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              NexisFlow
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                v0.1
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Autonomous AI Companies</p>
          </div>
        </div>
      </div>

      {/* Company Selector */}
      <div className="p-3 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Company</span>
          <button
            onClick={onOpenNewCompany}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
            title="Create New Company"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        {companies.length > 0 ? (
          <div className="relative">
            <select
              aria-label="Select active company"
              value={selectedCompany?.id || ''}
              onChange={(e) => {
                const found = companies.find(c => c.id === e.target.value);
                if (found) onSelectCompany(found);
              }}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none font-medium truncate pr-8 cursor-pointer"
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
          </div>
        ) : (
          <button
            onClick={onOpenNewCompany}
            className="w-full py-2 px-3 border border-dashed border-slate-700 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Create first company
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'dashboard'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard & Org</span>
        </button>

        <button
          onClick={() => onTabChange('tasks')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'tasks'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <KanbanSquare className="w-4 h-4" />
          <span>Task Board</span>
        </button>

        <button
          onClick={() => onTabChange('deliverables')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'deliverables'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <FolderDown className="w-4 h-4" />
          <span>Deliverables</span>
        </button>

        <button
          onClick={() => onTabChange('approvals')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'approvals'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-4 h-4" />
            <span>Approvals</span>
          </div>
          {pendingApprovalsCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-dark-900">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('logs')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Terminal className="w-4 h-4" />
            <span>Execution Logs</span>
          </div>
          {isRunActive && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </button>
      </nav>

      {/* Footer / Status */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        {/* Active Company Base Model */}
        {selectedCompany && (
          <div 
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-[11px] hover:border-indigo-500/40 transition-colors cursor-pointer"
            title="Click to view or configure model providers"
          >
            <div className="flex items-center justify-between text-indigo-300 mb-0.5">
              <span className="font-semibold text-[10px] uppercase tracking-wider">Active Base Model</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-white font-mono text-xs truncate">
              {selectedCompany.ceoModel}
            </p>
          </div>
        )}

        {/* Local Ollama Status */}
        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-900 border border-slate-800/80 text-[10px]">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Cpu className="w-3 h-3" />
            <span>Local Ollama</span>
          </div>
          <span className="text-slate-400 font-mono">
            {isOllamaOnline ? `${ollamaModelCount} models ready` : 'offline'}
          </span>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-all"
        >
          <Settings className="w-4 h-4" />
          <span>Settings & Keys</span>
        </button>
      </div>
    </aside>
  );
};
