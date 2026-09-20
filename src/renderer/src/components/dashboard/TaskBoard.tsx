import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Eye, 
  XCircle, 
  Plus, 
  User, 
  RotateCw, 
  MessageSquareQuote,
  Layers,
  X,
  Trash2,
  FileText,
  Copy,
  Check,
  PlayCircle,
  ArrowRight
} from 'lucide-react';
import { Task, TaskStatus, Agent } from '@shared/types';

interface TaskBoardProps {
  tasks: Task[];
  agents: Agent[];
  onCreateTask: (title: string, description: string, assignedTo?: string, status?: TaskStatus) => Promise<void>;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks = [],
  agents = [],
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeAgents = Array.isArray(agents) ? agents : [];

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [copiedResult, setCopiedResult] = useState(false);
  
  // Create task modal state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo');
  const [submitting, setSubmitting] = useState(false);

  // Edit task modal state
  const [editStatus, setEditStatus] = useState<TaskStatus>('todo');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);

  const columns: { status: TaskStatus; label: string; color: string; icon: React.ReactNode }[] = [
    { status: 'todo', label: 'Todo & Backlog', color: 'border-slate-700 text-slate-300', icon: <Clock className="w-3.5 h-3.5" /> },
    { status: 'in_progress', label: 'In Progress', color: 'border-indigo-500/40 text-indigo-400', icon: <Layers className="w-3.5 h-3.5" /> },
    { status: 'in_review', label: 'CEO In-Review', color: 'border-amber-500/40 text-amber-400', icon: <Eye className="w-3.5 h-3.5" /> },
    { status: 'completed', label: 'Completed', color: 'border-emerald-500/40 text-emerald-400', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { status: 'failed', label: 'Failed', color: 'border-rose-500/40 text-rose-400', icon: <XCircle className="w-3.5 h-3.5" /> },
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      await onCreateTask(newTitle.trim(), newDescription.trim(), newAssignedTo || undefined, newStatus);
      setNewTitle('');
      setNewDescription('');
      setNewAssignedTo('');
      setNewStatus('todo');
      setShowCreateModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenTaskModal = (task: Task) => {
    setSelectedTask(task);
    setEditStatus(task.status);
    setEditAssignedTo(task.assignedTo || '');
  };

  const handleQuickStatusChange = async (task: Task, newStatusVal: TaskStatus) => {
    if (!onUpdateTask || task.status === newStatusVal) return;
    try {
      await onUpdateTask(task.id, { status: newStatusVal });
    } catch (err) {
      console.error('Failed to change task status:', err);
    }
  };

  const handleSaveTaskChanges = async () => {
    if (!selectedTask || !onUpdateTask) return;
    setIsUpdatingTask(true);
    try {
      await onUpdateTask(selectedTask.id, {
        status: editStatus,
        assignedTo: editAssignedTo || null,
      });
      setSelectedTask({
        ...selectedTask,
        status: editStatus,
        assignedTo: editAssignedTo || null,
      });
    } catch (err) {
      console.error('Failed to update task:', err);
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Unassigned';
    const found = safeAgents.find(a => a.id === agentId);
    return found ? `${found.role}` : 'Specialist';
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Task Board (SQLite Source of Truth)</h3>
          <p className="text-[11px] text-slate-400">Autonomous agents inspect, create, claim, and update tasks here.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Quick Task</span>
        </button>
      </div>

      {/* Kanban Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {columns.map(col => {
          const colTasks = safeTasks.filter(t => t.status === col.status);
          return (
            <div
              key={col.status}
              className="bg-dark-850/70 border border-slate-800 rounded-xl p-3 flex flex-col min-h-[400px] max-h-[calc(100vh-280px)]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
                <div className="flex items-center space-x-1.5">
                  <span className={col.color}>{col.icon}</span>
                  <span className="text-xs font-semibold text-slate-200">{col.label}</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => handleOpenTaskModal(task)}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 cursor-pointer transition-all space-y-2 group shadow-sm relative"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <h4 className="text-xs font-semibold text-white leading-snug line-clamp-2">
                        {task.title}
                      </h4>
                      {task.retryCount > 0 && (
                        <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          <RotateCw className="w-2.5 h-2.5" />
                          <span>Retry {task.retryCount}/2</span>
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* In-progress active badge */}
                    {task.status === 'in_progress' && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/25 text-[10px] text-indigo-300 font-medium">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span>Agent active on task...</span>
                      </div>
                    )}

                    {/* Feedback Alert if rejected by CEO */}
                    {task.feedback && (
                      <div className="p-2 rounded bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-200/90 flex items-start gap-1">
                        <MessageSquareQuote className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{task.feedback}</span>
                      </div>
                    )}

                    {/* Quick Move / Bottom Info */}
                    <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="flex items-center gap-1 truncate max-w-[110px]" title={getAgentName(task.assignedTo)}>
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-slate-300 truncate">{getAgentName(task.assignedTo)}</span>
                      </span>

                      {/* Quick Move Controls */}
                      <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                        {task.status === 'todo' && (
                          <button
                            onClick={() => handleQuickStatusChange(task, 'in_progress')}
                            className="px-2 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                            title="Start task (Agent will immediately pick it up)"
                          >
                            <PlayCircle className="w-3 h-3" />
                            <span>Start</span>
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button
                            onClick={() => handleQuickStatusChange(task, 'in_review')}
                            className="px-2 py-0.5 rounded bg-amber-600/80 hover:bg-amber-500 text-white text-[10px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                            title="Submit for CEO review"
                          >
                            <span>Review</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {task.status === 'in_review' && (
                          <button
                            onClick={() => handleQuickStatusChange(task, 'completed')}
                            className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                            title="Accept and complete"
                          >
                            <Check className="w-3 h-3" />
                            <span>Accept</span>
                          </button>
                        )}
                        {/* Status Select for full control */}
                        <select
                          value={task.status}
                          onChange={(e) => handleQuickStatusChange(task, e.target.value as TaskStatus)}
                          className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="todo">Todo</option>
                          <option value="in_progress">In Progress</option>
                          <option value="in_review">In Review</option>
                          <option value="completed">Completed</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {colTasks.length === 0 && (
                  <div className="h-24 flex items-center justify-center border border-dashed border-slate-800/60 rounded-lg text-[11px] text-slate-600">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Task Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-dark-850 border border-slate-700 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-white">Create Task</h4>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Write landing page copy"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description & Requirements</label>
                <textarea
                  rows={3}
                  placeholder="Provide clear requirements and deliverable expectations..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Assign Agent</label>
                  <select
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Leave Unassigned</option>
                    {safeAgents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="todo">Todo & Backlog</option>
                    <option value="in_progress">In Progress (Execute Immediately)</option>
                    <option value="in_review">CEO In-Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newTitle.trim()}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-dark-850 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-dark-900/60">
              <div className="space-y-1.5 pr-4 flex-1">
                <div className="flex items-center space-x-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    selectedTask.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                    selectedTask.status === 'in_progress' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                    selectedTask.status === 'in_review' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                    selectedTask.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {selectedTask.status.replace('_', ' ')}
                  </span>
                  {selectedTask.retryCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      Retry {selectedTask.retryCount}/2
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500">ID: {selectedTask.id}</span>
                </div>
                <h3 className="text-base font-bold text-white leading-tight">
                  {selectedTask.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300 flex-1">
              {/* Status and Assignee Controls */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Task Management & Assignment
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                      className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="todo">Todo & Backlog</option>
                      <option value="in_progress">In Progress (Auto-Executes)</option>
                      <option value="in_review">CEO In-Review</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Assigned Agent</label>
                    <select
                      value={editAssignedTo}
                      onChange={(e) => setEditAssignedTo(e.target.value)}
                      className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">Unassigned</option>
                      {safeAgents.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(editStatus !== selectedTask.status || editAssignedTo !== (selectedTask.assignedTo || '')) && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={isUpdatingTask}
                      onClick={handleSaveTaskChanges}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      {isUpdatingTask ? 'Updating...' : 'Apply Status / Assignee Changes'}
                    </button>
                  </div>
                )}

                {editStatus === 'in_progress' && (
                  <p className="text-[10px] text-indigo-400 bg-indigo-950/30 p-2 rounded border border-indigo-800/30">
                    &bull; Setting status to <strong>In Progress</strong> immediately instructs the assigned agent to execute tools and generate deliverables.
                  </p>
                )}
              </div>

              {/* Detailed Description */}
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Task Requirements & Acceptance Criteria
                </h4>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedTask.description || 'No detailed description provided.'}
                </div>
              </div>

              {/* CEO Feedback if present */}
              {selectedTask.feedback && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <MessageSquareQuote className="w-3.5 h-3.5" />
                    <span>CEO Review Feedback</span>
                  </h4>
                  <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 leading-relaxed whitespace-pre-wrap">
                    {selectedTask.feedback}
                  </div>
                </div>
              )}

              {/* Deliverable Output & Work Result */}
              {selectedTask.result && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Produced Deliverable Result</span>
                    </h4>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedTask.result || '');
                        setCopiedResult(true);
                        setTimeout(() => setCopiedResult(false), 2000);
                      }}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition-colors"
                    >
                      {copiedResult ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedResult ? 'Copied' : 'Copy Result'}</span>
                    </button>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-56">
                    {selectedTask.result}
                  </div>
                </div>
              )}

              {/* Dependencies */}
              {selectedTask.dependencies && selectedTask.dependencies.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dependencies</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTask.dependencies.map(dep => (
                      <span key={dep} className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-dark-900/60 flex items-center justify-between">
              {onDeleteTask ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Are you sure you want to delete task "${selectedTask.title}"?`)) {
                      await onDeleteTask(selectedTask.id);
                      setSelectedTask(null);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Task</span>
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
