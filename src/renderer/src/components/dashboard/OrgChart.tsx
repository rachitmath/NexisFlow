import React from 'react';
import { 
  Users, 
  Crown, 
  Bot, 
  Play, 
  Pause, 
  Cpu, 
  Wrench,
  Sparkles,
  Terminal,
  Building2,
  Briefcase,
  Award,
  Trash2
} from 'lucide-react';
import { Agent, Department } from '@shared/types';

interface OrgChartProps {
  agents: Agent[];
  departments?: Department[];
  ceoModel: string;
  workerModel: string;
  onToggleAgentStatus?: (agentId: string, currentStatus: 'active' | 'paused') => void;
  onViewAgentLogs?: (agentRole: string) => void;
  onDeleteAgent?: (agentId: string) => Promise<void>;
}

export const OrgChart: React.FC<OrgChartProps> = ({
  agents,
  departments = [],
  ceoModel,
  workerModel,
  onToggleAgentStatus,
  onViewAgentLogs,
  onDeleteAgent,
}) => {
  const ceo = agents.find(a => a.role.toLowerCase() === 'ceo');
  const nonCeoAgents = agents.filter(a => a.role.toLowerCase() !== 'ceo');

  const handleDeleteAgent = async (agent: Agent) => {
    if (agent.role.toLowerCase() === 'ceo' || agent.level === 'executive') {
      alert('The CEO cannot be dismissed.');
      return;
    }
    if (confirm(`Are you sure you want to dismiss agent "${agent.role}"? Any tasks assigned to them will be unassigned.`)) {
      if (onDeleteAgent) {
        await onDeleteAgent(agent.id);
      }
    }
  };

  // Group agents by department
  const departmentMap = new Map<string, { department: Department; head?: Agent; members: Agent[] }>();
  departments.forEach(dept => {
    departmentMap.set(dept.id, {
      department: dept,
      head: agents.find(a => a.id === dept.headAgentId || (a.departmentId === dept.id && a.level === 'c_level')),
      members: []
    });
  });

  const unassignedAgents: Agent[] = [];

  nonCeoAgents.forEach(agent => {
    if (agent.departmentId && departmentMap.has(agent.departmentId)) {
      const group = departmentMap.get(agent.departmentId)!;
      if (group.head?.id !== agent.id) {
        group.members.push(agent);
      }
    } else {
      unassignedAgents.push(agent);
    }
  });

  const getDepartmentColor = (color?: string, index: number = 0) => {
    if (color) return color;
    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    return colors[index % colors.length];
  };

  const getSupervisorName = (reportsToId?: string | null) => {
    if (!reportsToId) return 'CEO';
    const sup = agents.find(a => a.id === reportsToId);
    return sup ? sup.role : 'CEO';
  };

  return (
    <div className="bg-dark-850 border border-slate-800 rounded-2xl p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Company Organization & Department Pods</h3>
            <p className="text-[11px] text-slate-400">
              Autonomous hierarchy structured dynamically by the CEO to fit your specific business demand.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {departments.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              {departments.length} Department{departments.length === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {agents.length} Total Agent{agents.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Org Tree Structure */}
      <div className="flex flex-col items-center space-y-6">
        {/* CEO Node */}
        <div className="w-full max-w-lg p-4 rounded-xl bg-gradient-to-b from-indigo-950/50 via-slate-900 to-slate-900 border border-indigo-500/30 shadow-xl shadow-indigo-950/30 relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <Crown className="w-6 h-6 text-amber-200" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-white">Chief Executive Officer</h4>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Executive
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                  <Cpu className="w-3 h-3 text-slate-500" />
                  {ceo?.model || ceoModel}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {onViewAgentLogs && (
                <button
                  onClick={() => onViewAgentLogs('CEO')}
                  className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  title="View Execution Logs for CEO"
                >
                  <Terminal className="w-3 h-3" />
                  <span>View Logs</span>
                </button>
              )}
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" title="Active" />
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Directs departments, reviews deliverables, and commands autonomous execution</span>
            <span className="text-indigo-400 font-medium">12 Autonomous Tools</span>
          </div>
        </div>

        {/* Central Spine */}
        <div className="w-0.5 h-6 bg-slate-700 relative">
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-600" />
        </div>

        {/* Dynamic Departments Grid */}
        {departments.length > 0 ? (
          <div className="w-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from(departmentMap.values()).map(({ department, head, members }, idx) => {
                const color = getDepartmentColor(department.color, idx);
                return (
                  <div
                    key={department.id}
                    className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 relative overflow-hidden shadow-md"
                  >
                    {/* Top Accent Bar */}
                    <div 
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: color }}
                    />

                    {/* Department Header */}
                    <div className="flex items-start justify-between pt-1">
                      <div className="flex items-center space-x-2.5">
                        <div 
                          className="p-2 rounded-lg text-white"
                          style={{ backgroundColor: `${color}20`, color: color }}
                        >
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white">{department.name}</h4>
                          {department.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">{department.description}</p>
                          )}
                        </div>
                      </div>
                      <span 
                        className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border"
                        style={{ 
                          backgroundColor: `${color}15`, 
                          color: color,
                          borderColor: `${color}30`
                        }}
                      >
                        Department
                      </span>
                    </div>

                    {/* Department Head Card (if exists) */}
                    {head && (
                      <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Award className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-xs font-bold text-white">{head.role}</span>
                              <span className="text-[9px] uppercase font-semibold px-1 rounded bg-indigo-500/20 text-indigo-300">
                                Dept Head
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono">{head.model || workerModel}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          {onViewAgentLogs && (
                            <button
                              onClick={() => onViewAgentLogs(head.role)}
                              className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded transition-colors"
                              title={`View logs for ${head.role}`}
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteAgent && head.role.toLowerCase() !== 'ceo' && (
                            <button
                              onClick={() => handleDeleteAgent(head)}
                              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                              title={`Dismiss / Delete ${head.role}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span className="w-2 h-2 rounded-full bg-emerald-400" title="Active" />
                        </div>
                      </div>
                    )}

                    {/* Department Specialists & Staff */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-0.5">
                        <span>Staff & Specialists ({members.length})</span>
                        <span className="text-[10px] text-slate-500">Reports to {head ? head.role : 'CEO'}</span>
                      </div>

                      {members.length === 0 ? (
                        <div className="p-3 rounded-lg border border-dashed border-slate-800 text-center text-slate-500 text-[11px]">
                          No specialists assigned yet in this department.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {members.map(agent => (
                            <div
                              key={agent.id}
                              className="p-2.5 rounded-lg bg-dark-900 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between"
                            >
                              <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-slate-400">
                                  <Bot className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-xs font-medium text-slate-200">{agent.role}</span>
                                    {agent.level && agent.level !== 'specialist' && (
                                      <span className="text-[9px] uppercase px-1 rounded bg-slate-800 text-slate-400">
                                        {agent.level}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500 font-mono">{agent.model || workerModel}</span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-1">
                                {onViewAgentLogs && (
                                  <button
                                    onClick={() => onViewAgentLogs(agent.role)}
                                    className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                                    title={`View logs for ${agent.role}`}
                                  >
                                    <Terminal className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => onToggleAgentStatus && onToggleAgentStatus(agent.id, agent.status)}
                                  className={`p-1 rounded text-xs transition-colors ${
                                    agent.status === 'active'
                                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                                      : 'text-amber-400 hover:bg-amber-500/10'
                                  }`}
                                  title={agent.status === 'active' ? 'Pause Agent' : 'Resume Agent'}
                                >
                                  {agent.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                                {onDeleteAgent && (
                                  <button
                                    onClick={() => handleDeleteAgent(agent)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                    title={`Dismiss / Delete ${agent.role}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unassigned / Cross-functional Workers */}
            {unassignedAgents.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Cross-Functional & Direct Specialists ({unassignedAgents.length})</span>
                  </span>
                  <span className="text-[11px] text-slate-500">Reporting directly to CEO</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {unassignedAgents.map(agent => (
                    <div
                      key={agent.id}
                      className="p-2.5 rounded-lg bg-dark-900 border border-slate-800 hover:border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-slate-400">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-200 block truncate max-w-[140px]">{agent.role}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{agent.model || workerModel}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        {onViewAgentLogs && (
                          <button
                            onClick={() => onViewAgentLogs(agent.role)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                            title={`View logs for ${agent.role}`}
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onToggleAgentStatus && onToggleAgentStatus(agent.id, agent.status)}
                          className={`p-1 rounded text-xs transition-colors ${
                            agent.status === 'active'
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-amber-400 hover:bg-amber-500/10'
                          }`}
                          title={agent.status === 'active' ? 'Pause Agent' : 'Resume Agent'}
                        >
                          {agent.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        {onDeleteAgent && (
                          <button
                            onClick={() => handleDeleteAgent(agent)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title={`Dismiss / Delete ${agent.role}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Fallback when no departments created yet */
          <div className="w-full">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Specialist Workers & Departments ({nonCeoAgents.length})
              </span>
              <span className="text-[11px] text-slate-500">Autonomous Demand-Driven Org</span>
            </div>

            {nonCeoAgents.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-2">
                <Bot className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400 font-medium">No specialized departments or workers established yet.</p>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  When you start the goal run, the CEO dynamically evaluates your objective, establishes appropriate departments (e.g. Sales, Marketing, IT, Ops), and hires specialists.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {nonCeoAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-indigo-400 border border-slate-700">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div>
                          <h5 className="text-xs font-semibold text-white truncate max-w-[150px]">{agent.role}</h5>
                          <p className="text-[10px] text-slate-400 font-mono">{agent.model || workerModel}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        {onViewAgentLogs && (
                          <button
                            onClick={() => onViewAgentLogs(agent.role)}
                            className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                            title={`View Execution Logs for ${agent.role}`}
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onToggleAgentStatus && onToggleAgentStatus(agent.id, agent.status)}
                          className={`p-1 rounded-md text-xs transition-colors ${
                            agent.status === 'active'
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-amber-400 hover:bg-amber-500/10'
                          }`}
                          title={agent.status === 'active' ? 'Click to Pause' : 'Click to Resume'}
                        >
                          {agent.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        {onDeleteAgent && (
                          <button
                            onClick={() => handleDeleteAgent(agent)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title={`Dismiss / Delete ${agent.role}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Wrench className="w-3 h-3 text-slate-500" />
                        <span className="truncate">{agent.allowedTools?.join(', ') || 'read_file, write_file'}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center justify-between">
                        <span>Reports to {getSupervisorName(agent.reportsTo)}</span>
                        <span>{agent.level || 'specialist'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
