import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  X, 
  Square, 
  Play, 
  Pause, 
  Cpu, 
  Coins, 
  Terminal, 
  Bot, 
  Wrench, 
  CheckCircle2, 
  AlertCircle,
  ShieldAlert,
  ExternalLink
} from 'lucide-react';
import { Run, RunEvent, Approval } from '@shared/types';

interface RunStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  run: Run | null;
  events: RunEvent[];
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  pendingApproval?: Approval | null;
  onResolveApproval?: (id: string, decision: 'approved' | 'denied') => void;
  onOpenFullLogs?: () => void;
}

export const RunStreamModal: React.FC<RunStreamModalProps> = ({
  isOpen,
  onClose,
  run,
  events,
  onStop,
  onPause,
  onResume,
  pendingApproval,
  onResolveApproval,
  onOpenFullLogs,
}) => {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [dbEvents, setDbEvents] = useState<RunEvent[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  // If live events are empty, load historical messages from database for this run
  useEffect(() => {
    const api = (window as any).nexisFlowAPI;
    if (isOpen && run?.id && api?.listMessages) {
      api.listMessages(run.companyId, run.id)
        .then((msgs: any[]) => {
          if (!Array.isArray(msgs)) return;
          const converted: RunEvent[] = [];
          msgs.forEach(m => {
            if (m.content && m.content.trim()) {
              converted.push({
                runId: m.runId,
                companyId: m.companyId,
                type: 'agent_message',
                timestamp: m.timestamp,
                data: {
                  agentId: m.agentId,
                  agentRole: m.role === 'assistant' ? 'CEO' : m.role,
                  content: m.content,
                }
              });
            }
            if (m.toolCalls) {
              try {
                const calls = typeof m.toolCalls === 'string' ? JSON.parse(m.toolCalls) : m.toolCalls;
                if (Array.isArray(calls)) {
                  calls.forEach(c => {
                    converted.push({
                      runId: m.runId,
                      companyId: m.companyId,
                      type: 'tool_call',
                      timestamp: m.timestamp,
                      data: {
                        agentId: m.agentId,
                        agentRole: m.role === 'assistant' ? 'CEO' : m.role,
                        toolName: c.name,
                        toolArgs: c.args,
                      }
                    });
                  });
                }
              } catch {
                // Ignore parse errors
              }
            }
          });
          setDbEvents(converted);
        })
        .catch(console.error);
    }
  }, [isOpen, run?.id, run?.companyId]);

  // Combine live stream events and database fallback events
  const combinedEvents = useMemo(() => {
    if (events.length > 0) return events;
    return dbEvents;
  }, [events, dbEvents]);

  // Extract all distinct agent roles seen in this run
  const agentRoles = useMemo(() => {
    const set = new Set<string>();
    combinedEvents.forEach(e => {
      const r = (e.data as any)?.agentRole;
      if (r) set.add(r);
    });
    return Array.from(set);
  }, [combinedEvents]);

  const filteredEvents = useMemo(() => {
    if (!selectedRole) return combinedEvents;
    return combinedEvents.filter(e => {
      const r = (e.data as any)?.agentRole;
      if (!r) return true;
      return r.toLowerCase() === selectedRole.toLowerCase();
    });
  }, [combinedEvents, selectedRole]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [filteredEvents]);

  if (!isOpen || !run) return null;

  const isRunning = run.status === 'running';
  const isPaused = run.status === 'paused';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-dark-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">
        {/* Run Header */}
        <div className="p-4 border-b border-slate-800 bg-dark-850 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              isRunning ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-500'
            }`} />
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Active Company Execution</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {run.id}
                </span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  isRunning ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  isPaused ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {run.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Streaming tokens and tool dispatches in real time</p>
            </div>
          </div>

          {/* Real-time Ticker & Actions */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-3 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
              <span className="flex items-center gap-1 text-indigo-300">
                <Cpu className="w-3.5 h-3.5" />
                {run.totalTokens.toLocaleString()} tokens
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <Coins className="w-3.5 h-3.5" />
                ${run.estimatedCost.toFixed(4)}
              </span>
            </div>

            {/* Run Controls */}
            {isRunning && (
              <button
                onClick={onPause}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold flex items-center space-x-1 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            )}

            {isPaused && (
              <button
                onClick={onResume}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
            )}

            {(isRunning || isPaused) && (
              <button
                onClick={onStop}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md shadow-rose-600/20 transition-all"
                title="Immediate Stop - Halt All Agents"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            )}

            {onOpenFullLogs && (
              <button
                onClick={onOpenFullLogs}
                className="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs border border-slate-700 font-medium cursor-pointer"
                title="Open full logs view with run history and advanced filters"
              >
                <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                <span>Full Logs</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Agent Filter Pill Bar */}
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1">Agent:</span>
            <button
              onClick={() => setSelectedRole(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedRole === null
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              All Agents ({combinedEvents.length})
            </button>

            {agentRoles.map(role => {
              const count = combinedEvents.filter(e => ((e.data as any)?.agentRole || '').toLowerCase() === role.toLowerCase()).length;
              const isCeo = role.toLowerCase() === 'ceo';
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(selectedRole === role ? null : role)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedRole === role
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span>{isCeo ? '👑' : '🤖'}</span>
                  <span>{role}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 shrink-0 font-mono">
            {filteredEvents.length} events
          </div>
        </div>

        {/* Status Notification Banner if Run is Not Active */}
        {!isRunning && !isPaused && (
          <div className="px-5 py-2.5 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-2">
              <CheckCircle2 className={`w-4 h-4 ${run.status === 'completed' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>This execution session is <strong>{run.status.toUpperCase()}</strong>. You can view its log stream here or open full historical logs.</span>
            </span>
            <button
              onClick={onClose}
              className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-white font-medium cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Approval Alert Bar */}
        {pendingApproval && (
          <div className="p-3 bg-amber-950/60 border-b border-amber-800/60 flex items-center justify-between px-5">
            <div className="flex items-center space-x-3 text-xs text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Approval Required:</strong> {pendingApproval.description}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onResolveApproval && onResolveApproval(pendingApproval.id, 'denied')}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-rose-300 cursor-pointer"
              >
                Deny
              </button>
              <button
                onClick={() => onResolveApproval && onResolveApproval(pendingApproval.id, 'approved')}
                className="px-3 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                Approve
              </button>
            </div>
          </div>
        )}

        {/* Streaming Log Terminal */}
        <div
          ref={terminalRef}
          className="flex-1 p-5 overflow-y-auto font-mono text-xs space-y-3 bg-dark-900 selection:bg-indigo-500/40"
        >
          {filteredEvents.length === 0 ? (
            <div className="flex items-center space-x-2 text-slate-500">
              <Terminal className="w-4 h-4 animate-pulse" />
              <span>{combinedEvents.length === 0 ? 'Awaiting agent initialization...' : `No events recorded yet for agent: ${selectedRole}`}</span>
            </div>
          ) : (
            filteredEvents.map((evt, idx) => {
              if (evt.type === 'token') {
                return null; // Streamed tokens accumulated into agent_message for readability
              }

              if (evt.type === 'agent_message') {
                return (
                  <div key={idx} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-indigo-400 text-[11px] font-bold">
                      <span className="flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5" />
                        {evt.data.agentRole || 'Agent'}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-200 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                      {evt.data.content}
                    </p>
                  </div>
                );
              }

              if (evt.type === 'tool_call') {
                return (
                  <div key={idx} className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-[11px] space-y-1">
                    <div className="flex items-center space-x-2 text-indigo-300">
                      <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-semibold">{evt.data.agentRole || 'Agent'}</span>
                      <span className="text-slate-500">invoked</span>
                      <code className="text-indigo-400 font-bold bg-indigo-950/60 px-1 py-0.5 rounded">
                        {evt.data.toolName}()
                      </code>
                    </div>
                    {evt.data.toolArgs && (
                      <pre className="text-[10px] text-slate-400 overflow-x-auto p-1.5 rounded bg-black/30">
                        {JSON.stringify(evt.data.toolArgs, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              }

              if (evt.type === 'tool_result') {
                return (
                  <div key={idx} className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] space-y-1">
                    <div className="flex items-center space-x-1.5 text-emerald-400 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Result from {evt.data.toolName}:</span>
                    </div>
                    <pre className="text-[10px] text-slate-400 overflow-x-auto max-h-32">
                      {typeof evt.data.toolResult === 'string'
                        ? evt.data.toolResult
                        : JSON.stringify(evt.data.toolResult, null, 2)}
                    </pre>
                  </div>
                );
              }

              if (evt.type === 'task_status_change') {
                return (
                  <div key={idx} className="text-amber-300/80 text-[11px] flex items-center space-x-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Task: <strong>{evt.data.taskTitle}</strong> &rarr; <span className="uppercase font-bold">{evt.data.status}</span></span>
                  </div>
                );
              }

              if (evt.type === 'error') {
                return (
                  <div key={idx} className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{evt.data.error}</span>
                  </div>
                );
              }

              return null;
            })
          )}
        </div>
      </div>
    </div>
  );
};
