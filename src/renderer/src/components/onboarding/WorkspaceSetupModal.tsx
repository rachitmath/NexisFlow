import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FolderOpen, 
  ArrowRight, 
  HardDrive, 
  Layers, 
  ShieldCheck,
  Sparkles
} from 'lucide-react';

interface WorkspaceSetupModalProps {
  isOpen: boolean;
  initialPath?: string;
  onConfirm: (directoryPath: string) => Promise<void>;
}

export const WorkspaceSetupModal: React.FC<WorkspaceSetupModalProps> = ({
  isOpen,
  initialPath = '',
  onConfirm,
}) => {
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = (window as any).nexisFlowAPI;

  useEffect(() => {
    if (initialPath) {
      setSelectedPath(initialPath);
    } else if (api?.getWorkspacePath) {
      api.getWorkspacePath().then((p: string) => {
        if (p && !selectedPath) {
          setSelectedPath(p);
        }
      }).catch(console.error);
    }
  }, [initialPath]);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    setError(null);
    if (!api?.selectDirectory) return;
    try {
      const chosen = await api.selectDirectory();
      if (chosen) {
        setSelectedPath(chosen);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to open directory selector.');
    }
  };

  const handleConfirm = async () => {
    if (!selectedPath.trim()) {
      setError('Please select a folder on your system.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedPath.trim());
    } catch (err: any) {
      setError(err?.message || 'Failed to save workspace directory.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header with decorative glow */}
        <div className="relative p-6 pb-4 border-b border-slate-800/80 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Welcome to NexisFlow</h2>
              <p className="text-xs text-slate-400">Setup your local company workspace storage</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-xs text-slate-300 leading-relaxed">
            Where should NexisFlow store all files created by your autonomous AI team? All company deliverables, reports, code artifacts, and agent notes will be organized neatly in this folder on your computer.
          </div>

          {/* Folder structure illustration */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2 font-mono text-[11px] text-slate-400">
            <div className="flex items-center space-x-2 text-indigo-300 font-sans font-semibold text-xs mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>How your files are organized:</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-200">
              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{selectedPath || 'Your Workspace Directory'}</span>
            </div>
            <div className="pl-4 space-y-1.5 border-l border-slate-800 ml-1.5">
              <div className="flex items-center space-x-2 text-slate-300">
                <Folder className="w-3 h-3 text-sky-400 shrink-0" />
                <span>&lt;company-name&gt;/</span>
              </div>
              <div className="pl-4 space-y-1 border-l border-slate-800 ml-1.5">
                <div className="flex items-center space-x-2 text-slate-400">
                  <Folder className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>deliverables/ <span className="font-sans text-[10px] text-slate-500">(Final docs, code, assets)</span></span>
                </div>
                <div className="flex items-center space-x-2 text-slate-400">
                  <Folder className="w-3 h-3 text-violet-400 shrink-0" />
                  <span>notes/ <span className="font-sans text-[10px] text-slate-500">(Agent memory & run logs)</span></span>
                </div>
              </div>
            </div>
          </div>

          {/* Directory Picker Box */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              Selected Folder Path
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  placeholder="Select a folder on your computer..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10"
                />
                <HardDrive className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={handleBrowse}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors border border-slate-700 flex items-center space-x-1.5 shrink-0"
              >
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>Browse...</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>You can change or move this folder anytime in Settings.</span>
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Step 1: Workspace Storage Setup
          </div>
          <button
            type="button"
            disabled={submitting || !selectedPath.trim()}
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all flex items-center space-x-2"
          >
            <span>{submitting ? 'Setting up...' : 'Confirm & Continue'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
