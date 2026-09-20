import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Check, 
  X, 
  UserPlus, 
  DollarSign, 
  FolderLock, 
  HelpCircle,
  Clock
} from 'lucide-react';
import { Approval } from '@shared/types';

interface ApprovalsInboxProps {
  approvals: Approval[];
  onRespond: (approvalId: string, decision: 'approved' | 'denied', reason?: string) => Promise<void>;
}

export const ApprovalsInbox: React.FC<ApprovalsInboxProps> = ({
  approvals,
  onRespond,
}) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleAction = async (id: string, decision: 'approved' | 'denied') => {
    setResolvingId(id);
    try {
      await onRespond(id, decision);
    } catch (err) {
      console.error(err);
    } finally {
      setResolvingId(null);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'hire_agent': return <UserPlus className="w-5 h-5 text-amber-400" />;
      case 'budget_threshold': return <DollarSign className="w-5 h-5 text-amber-400" />;
      case 'out_of_bounds_write': return <FolderLock className="w-5 h-5 text-rose-400" />;
      default: return <HelpCircle className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="bg-dark-850 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Human-In-The-Loop Approvals Inbox</h3>
            <p className="text-[11px] text-slate-400">
              Enforced gates: agents pause execution until you grant permission.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
          {approvals.length} Pending
        </span>
      </div>

      {approvals.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400 font-medium">All clear! No pending approval requests.</p>
          <p className="text-[11px] text-slate-500">
            If the CEO seeks to hire beyond thresholds or requests authorization, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="p-4 rounded-xl bg-slate-900 border border-amber-500/30 shadow-md shadow-amber-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                  {getIcon(approval.actionType)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-bold text-white capitalize">
                      {approval.actionType.replace(/_/g, ' ')}
                    </h4>
                    <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                      PAUSED
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {approval.description}
                  </p>
                  <div className="flex items-center space-x-3 text-[10px] text-slate-500 font-mono pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(approval.createdAt).toLocaleTimeString()}
                    </span>
                    <span>Run: {approval.runId}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => handleAction(approval.id, 'denied')}
                  disabled={resolvingId === approval.id}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 text-xs font-semibold flex items-center space-x-1.5 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Deny</span>
                </button>
                <button
                  onClick={() => handleAction(approval.id, 'approved')}
                  disabled={resolvingId === approval.id}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve & Resume</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
