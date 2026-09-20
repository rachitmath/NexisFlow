import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Terminal, 
  Bot, 
  Crown, 
  Wrench, 
  CheckCircle2, 
  AlertCircle, 
  Pause, 
  Play, 
  Square, 
  Cpu, 
  Coins, 
  Filter, 
  Search, 
  Copy, 
  Check, 
  ChevronDown,
  Clock,
  Layers,
  ArrowDownCircle
} from 'lucide-react';
import { Run, RunEvent, Agent, Company, Message } from '@shared/types';

interface ExecutionLogsViewProps {
  company: Company;
  agents: Agent[];
  runs: Run[];
  activeRun: Run | null;
  liveEvents: RunEvent[];
  initialAgentFilter?: string | null;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onStopRun?: () => void;
}

export const ExecutionLogsView: React.FC<ExecutionLogsViewProps> = ({
  company,
  agents,
  runs,
  activeRun,
  liveEvents,
  initialAgentFilter = null,
  onPauseRun,
  onResumeRun,
  onStopRun,
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string>(activeRun?.id || (runs[0]?.id ?? ''));
  const [selectedAgentRole, setSelectedAgentRole] = useState<string | null>(initialAgentFilter);
  const [typeFilter, setTypeFilter] = useState<'all' | 'messages' | 'tools' | 'errors'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [historicalMessages, setHistoricalMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const api = (window as any).nexisFlowAPI;

  // Sync selected run if activeRun changes
  useEffect(() => {
    if (activeRun?.id && (!selectedRunId || selectedRunId === 'none')) {
      setSelectedRunId(activeRun.id);
    }
  }, [activeRun?.id]);

  useEffect(() => {
    if (initialAgentFilter !== undefined) {
      setSelectedAgentRole(initialAgentFilter);
    }
  }, [initialAgentFilter]);

  // Load historical messages from database if selected run is not the active streaming run
  useEffect(() => {
    const isLive = activeRun && activeRun.id === selectedRunId;
    if (!isLive && selectedRunId && api?.listMessages) {
      setLoadingHistory(true);
      api.listMessages(company.id, selectedRunId)
        .then((msgs: Message[]) => {
          setHistoricalMessages(msgs || []);
        })
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
    }
  }, [selectedRunId, activeRun?.id, company.id]);

  // Find the selected run object
  const currentRun = useMemo(() => {
    if (activeRun && activeRun.id === selectedRunId) return activeRun;
    return runs.find(r => r.id === selectedRunId) || activeRun || runs[0] || null;
  }, [selectedRunId, activeRun, runs]);

  // Build unified log entries from either live events or historical messages
  const rawLogEntries = useMemo(() => {
    const isLive = activeRun && activeRun.id === selectedRunId;

    if (isLive) {
      return liveEvents.filter(e => e.type !== 'token');
    }

    // Convert historical messages into event-like log records
    const converted: RunEvent[] = [];
    historicalMessages.forEach(m => {
      const agent = agents.find(a => a.id === m.agentId);
      const role = agent ? agent.role : (m.role === 'assistant' ? 'CEO' : m.role);

      if (m.content) {
        converted.push({
          runId: m.runId,
          companyId: m.companyId,
          type: 'agent_message',
          timestamp: m.timestamp,
          data: {
            agentId: m.agentId || undefined,
            agentRole: role,
            content: m.content,
          }
        });
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        m.toolCalls.forEach(tc => {
          converted.push({
            runId: m.runId,
            companyId: m.companyId,
            type: 'tool_call',
            timestamp: m.timestamp,
            data: {
              agentId: m.agentId || undefined,
              agentRole: role,
              toolName: tc.name,
              toolArgs: tc.args,
            }
          });
        });
      }
    });
    return converted;
  }, [activeRun, selectedRunId, liveEvents, historicalMessages, agents]);

  // Available agent roles present in the logs + from roster
  const agentTabs = useMemo(() => {
    const set = new Set<string>();
    set.add('CEO');
    agents.forEach(a => set.add(a.role));
    rawLogEntries.forEach(e => {
      if (e.data?.agentRole) set.add(e.data.agentRole);
    });
    return Array.from(set);
  }, [agents, rawLogEntries]);

  // Filter logs by Agent, Type, and Search query
  const filteredLogs = useMemo(() => {
    return rawLogEntries.filter(entry => {
      // 1. Agent Filter
      if (selectedAgentRole) {
        const entryRole = entry.data?.agentRole;
        if (!entryRole || entryRole.toLowerCase() !== selectedAgentRole.toLowerCase()) {
          return false;
        }
      }

      // 2. Type Filter
      if (typeFilter === 'messages' && entry.type !== 'agent_message') return false;
      if (typeFilter === 'tools' && entry.type !== 'tool_call' && entry.type !== 'tool_result') return false;
      if (typeFilter === 'errors' && entry.type !== 'error') return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const contentMatch = entry.data?.content?.toLowerCase().includes(q);
        const toolNameMatch = entry.data?.toolName?.toLowerCase().includes(q);
        const roleMatch = entry.data?.agentRole?.toLowerCase().includes(q);
        const argsMatch = entry.data?.toolArgs ? JSON.stringify(entry.data.toolArgs).toLowerCase().includes(q) : false;
        const resultMatch = entry.data?.toolResult ? JSON.stringify(entry.data.toolResult).toLowerCase().includes(q) : false;
        if (!contentMatch && !toolNameMatch && !roleMatch && !argsMatch && !resultMatch) {
          return false;
        }
      }

      return true;
    });
  }, [rawLogEntries, selectedAgentRole, typeFilter, searchQuery]);

  // Auto-scroll to bottom on new log items
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Copy logs as text
  const handleCopyLogs = () => {
    const text = filteredLogs.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      const role = e.data?.agentRole || 'System';
      if (e.type === 'agent_message') return `[${time}] [${role}] ${e.data?.content}`;
      if (e.type === 'tool_call') return `[${time}] [${role}] TOOL CALL: ${e.data?.toolName}(${JSON.stringify(e.data?.toolArgs)})`;
      if (e.type === 'tool_result') return `[${time}] [${role}] TOOL RESULT: ${JSON.stringify(e.data?.toolResult)}`;
      if (e.type === 'error') return `[${time}] [${role}] ERROR: ${e.data?.error}`;
      return `[${time}] [${role}] [${e.type}]`;
    }).join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLiveRun = Boolean(activeRun && currentRun && activeRun.id === currentRun.id);
  const isRunning = isLiveRun && currentRun?.status === 'running';
  const isPaused = isLiveRun && currentRun?.status === 'paused';

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Header Card */}
      <div className="bg-dark-850 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-tight">Execution Logs & Agent Activity</h2>
                {isLiveRun && (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Stream
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Inspect prompt dispatches, reasoning, and tool calls for the CEO and all sub-agents.
              </p>
            </div>
          </div>
        </div>

        {/* Run Selector & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Run dropdown */}
          <div className="relative min-w-[200px]">
            <select
              aria-label="Select execution run"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 appearance-none pr-8 cursor-pointer"
            >
              {activeRun && (
                <option value={activeRun.id}>
                  ⚡ {activeRun.id} (Live - {activeRun.status})
                </option>
              )}
              {runs.map(r => (
                <option key={r.id} value={r.id}>
                  {r.id === activeRun?.id ? '⚡ ' : '• '} {r.id} ({r.status}) - {new Date(r.startedAt).toLocaleTimeString()}
                </option>
              ))}
              {runs.length === 0 && !activeRun && (
                <option value="none">No runs yet</option>
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
          </div>

          {/* Metrics summary */}
          {currentRun && (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
              <span className="flex items-center gap-1 text-indigo-300">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                {currentRun.totalTokens.toLocaleString()}
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                ${currentRun.estimatedCost.toFixed(4)}
              </span>
            </div>
          )}

          {/* Active run buttons */}
          {isLiveRun && (
            <div className="flex items-center space-x-1.5">
              {isRunning && onPauseRun && (
                <button
                  onClick={onPauseRun}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold flex items-center space-x-1 transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              )}
              {isPaused && onResumeRun && (
                <button
                  onClick={onResumeRun}
                  className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume</span>
                </button>
              )}
              {onStopRun && (
                <button
                  onClick={onStopRun}
                  className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-1 transition-colors shadow-sm"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent Filter Tabs Bar */}
      <div className="bg-dark-850 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Agent Role Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedAgentRole(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
              selectedAgentRole === null
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Agents</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono ml-1">
              {rawLogEntries.length}
            </span>
          </button>

          {agentTabs.map(role => {
            const isCeo = role.toLowerCase() === 'ceo';
            const count = rawLogEntries.filter(e => e.data?.agentRole?.toLowerCase() === role.toLowerCase()).length;
            const isSelected = selectedAgentRole?.toLowerCase() === role.toLowerCase();

            return (
              <button
                key={role}
                onClick={() => setSelectedAgentRole(role)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
                  isSelected
                    ? isCeo
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                      : 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCeo ? (
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Bot className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>{role}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono ml-1">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Secondary filters & search */}
        <div className="flex items-center space-x-2">
          {/* Type Filter */}
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                typeFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('messages')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                typeFilter === 'messages' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setTypeFilter('tools')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                typeFilter === 'tools' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tools
            </button>
            <button
              onClick={() => setTypeFilter('errors')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                typeFilter === 'errors' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Errors
            </button>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-36 sm:w-48 font-mono"
            />
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopyLogs}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Copy filtered logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Terminal Window */}
      <div className="flex-1 bg-dark-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative min-h-[420px]">
        {/* Terminal Header */}
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <span className="font-mono text-[11px] text-slate-500 ml-2">
              Viewing {filteredLogs.length} events {selectedAgentRole ? `(filtered: ${selectedAgentRole})` : '(all agents)'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-[11px] flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                autoScroll ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <ArrowDownCircle className="w-3 h-3" />
              <span>Auto-scroll</span>
            </button>
          </div>
        </div>

        {/* Scrollable Events Body */}
        <div
          ref={terminalRef}
          className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs selection:bg-indigo-500/30"
        >
          {loadingHistory && (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Terminal className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
              <p className="text-xs">Loading execution transcript...</p>
            </div>
          )}

          {!loadingHistory && filteredLogs.length === 0 && (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Terminal className="w-8 h-8 mx-auto text-slate-600 opacity-60" />
              <p className="text-xs font-semibold text-slate-400">
                {selectedAgentRole
                  ? `No logs recorded for ${selectedAgentRole} in this run.`
                  : 'No execution logs recorded yet.'}
              </p>
              <p className="text-[11px] text-slate-600 max-w-sm mx-auto">
                {selectedAgentRole
                  ? `Select 'All Agents' or choose another agent above to inspect their actions.`
                  : `Start a goal run or select a previous run to view agent operations.`}
              </p>
            </div>
          )}

          {!loadingHistory && filteredLogs.map((evt, idx) => {
            const role = evt.data?.agentRole || 'System';
            const isCeo = role.toLowerCase() === 'ceo';
            const time = new Date(evt.timestamp).toLocaleTimeString();

            if (evt.type === 'agent_message') {
              return (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5 transition-all hover:border-slate-700">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 font-bold">
                      {isCeo ? (
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-sky-400" />
                      )}
                      <span className={isCeo ? 'text-amber-300' : 'text-sky-300'}>{role}</span>
                      <span className="text-[10px] text-slate-500 font-normal">thought / message</span>
                    </span>
                    <span className="text-slate-500 text-[10px] flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {time}
                    </span>
                  </div>
                  <p className="text-slate-200 whitespace-pre-wrap font-sans text-xs leading-relaxed pl-5 border-l border-slate-800 ml-1">
                    {evt.data?.content}
                  </p>
                </div>
              );
            }

            if (evt.type === 'tool_call') {
              return (
                <div key={idx} className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/40 text-[11px] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-indigo-300">
                      <Wrench className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className={`font-semibold ${isCeo ? 'text-amber-300' : 'text-sky-300'}`}>{role}</span>
                      <span className="text-slate-500">invoked tool</span>
                      <code className="text-indigo-300 font-bold bg-indigo-900/40 px-1.5 py-0.5 rounded border border-indigo-500/20">
                        {evt.data?.toolName}()
                      </code>
                    </div>
                    <span className="text-slate-500 text-[10px] font-mono">{time}</span>
                  </div>
                  {evt.data?.toolArgs && (
                    <pre className="text-[10px] text-slate-300 overflow-x-auto p-2 rounded-lg bg-black/40 border border-slate-800/80 max-h-48">
                      {JSON.stringify(evt.data.toolArgs, null, 2)}
                    </pre>
                  )}
                </div>
              );
            }

            if (evt.type === 'tool_result') {
              return (
                <div key={idx} className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] space-y-1.5">
                  <div className="flex items-center justify-between text-emerald-400 text-[10px]">
                    <span className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{evt.data?.toolName || 'tool'} output</span>
                    </span>
                    <span className="text-slate-500 font-mono">{time}</span>
                  </div>
                  {evt.data?.toolResult && (
                    <pre className="text-[10px] text-slate-400 overflow-x-auto p-2 rounded-lg bg-black/30 border border-slate-800/60 max-h-48">
                      {typeof evt.data.toolResult === 'string'
                        ? evt.data.toolResult
                        : JSON.stringify(evt.data.toolResult, null, 2)}
                    </pre>
                  )}
                </div>
              );
            }

            if (evt.type === 'task_status_change') {
              return (
                <div key={idx} className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] flex items-center justify-between text-slate-300">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      Task: {evt.data?.status}
                    </span>
                    <span className="font-semibold text-white">{evt.data?.taskTitle}</span>
                  </div>
                  <span className="text-slate-500 text-[10px] font-mono">{time}</span>
                </div>
              );
            }

            if (evt.type === 'agent_status_change') {
              return (
                <div key={idx} className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-800/40 text-[11px] flex items-center justify-between text-sky-200">
                  <div className="flex items-center space-x-2">
                    <Bot className="w-3.5 h-3.5 text-sky-400" />
                    <span>Hired specialist worker: <strong className="text-white">{evt.data?.agentRole}</strong></span>
                  </div>
                  <span className="text-slate-500 text-[10px] font-mono">{time}</span>
                </div>
              );
            }

            if (evt.type === 'error') {
              return (
                <div key={idx} className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 space-y-1">
                  <div className="flex items-center justify-between text-red-400 font-bold text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      Execution Notice
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">{time}</span>
                  </div>
                  <p className="font-sans leading-relaxed text-red-200">{evt.data?.error}</p>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
};
