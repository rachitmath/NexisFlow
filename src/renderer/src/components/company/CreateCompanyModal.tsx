import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Rocket, 
  PenTool, 
  Code, 
  Sliders, 
  AlertTriangle 
} from 'lucide-react';
import { 
  CreateCompanyDTO, 
  ModelInfo 
} from '@shared/types';
import { COMPANY_TEMPLATES } from '@shared/constants';

interface CreateCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelInfo[];
  defaultCeoModel: string;
  defaultWorkerModel: string;
  onCreate: (dto: CreateCompanyDTO) => Promise<void>;
}

export const CreateCompanyModal: React.FC<CreateCompanyModalProps> = ({
  isOpen,
  onClose,
  models,
  defaultCeoModel,
  defaultWorkerModel,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [template, setTemplate] = useState<'startup' | 'content_studio' | 'software_agency' | 'custom'>('startup');
  const [budgetPerRun, setBudgetPerRun] = useState(5.0);
  const [budgetMonthly, setBudgetMonthly] = useState(50.0);
  const [ceoModel, setCeoModel] = useState(defaultCeoModel || 'gemini-1.5-flash');
  const [workerModel, setWorkerModel] = useState(defaultWorkerModel || 'gemini-1.5-flash');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (defaultCeoModel) setCeoModel(defaultCeoModel);
    if (defaultWorkerModel) setWorkerModel(defaultWorkerModel);
  }, [defaultCeoModel, defaultWorkerModel, isOpen]);

  const groupedModels = React.useMemo(() => {
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

  if (!isOpen) return null;

  const selectedCeoModelInfo = models.find(m => m.id === ceoModel);
  const ceoToolWarning = selectedCeoModelInfo && !selectedCeoModelInfo.supportsToolCalling;

  const handleTemplateSelect = (t: 'startup' | 'content_studio' | 'software_agency' | 'custom') => {
    setTemplate(t);
    if (t === 'startup') {
      if (!name) setName('NextGen Analytics');
      setGoal('Research competitor analytics platforms, design MVP data schema, and generate go-to-market plan.');
    } else if (t === 'content_studio') {
      if (!name) setName('AgentPulse Media');
      setGoal('Research 2026 AI Agent breakthroughs and write a 3-part comprehensive newsletter series with code examples.');
    } else if (t === 'software_agency') {
      if (!name) setName('Vanguard Software');
      setGoal('Design architecture and produce complete technical specification and core modules for a task-tracking API.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !goal.trim()) return;

    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        goal: goal.trim(),
        template,
        budgetPerRun,
        budgetMonthly,
        ceoModel,
        workerModel,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-850 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Create AI-Run Company</h2>
              <p className="text-xs text-slate-400">The CEO agent will hire specialists and pursue this objective over multiple sessions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Templates */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Select Company Template
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleTemplateSelect('startup')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  template === 'startup'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Rocket className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold">Tech Startup</span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Build MVP, research competitive landscape, design positioning.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleTemplateSelect('content_studio')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  template === 'content_studio'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <PenTool className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold">Content Studio</span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Plan, draft, edit, and publish newsletters and technical media.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleTemplateSelect('software_agency')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  template === 'software_agency'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Code className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold">Software Agency</span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Autonomous architecture, code development, and QA deliverables.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleTemplateSelect('custom')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  template === 'custom'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold">Custom Venture</span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Freeform company structure shaped entirely by your goal.
                </p>
              </button>
            </div>
          </div>

          {/* Name & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Company Name</label>
              <input
                type="text"
                required
                placeholder="e.g. AgentFlow Media or Nexus AI"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Objective / Goal</label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Launch a newsletter business: research top trending AI topics, draft 3 newsletter editions, and create a 30-day growth playbook."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Models */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                CEO Agent Model
              </label>
              <select
                value={ceoModel}
                onChange={(e) => setCeoModel(e.target.value)}
                className="w-full bg-dark-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
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
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Worker Agents Model
              </label>
              <select
                value={workerModel}
                onChange={(e) => setWorkerModel(e.target.value)}
                className="w-full bg-dark-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
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
              </select>
            </div>

            {ceoToolWarning && (
              <div className="col-span-2 p-2 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center space-x-2 text-[11px] text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Selected CEO model lacks verified function/tool calling. Task delegation may fail.</span>
              </div>
            )}
          </div>

          {/* Budget Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Per-Run Budget ($ USD)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={budgetPerRun}
                onChange={(e) => setBudgetPerRun(parseFloat(e.target.value) || 5.0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Monthly Budget Cap ($ USD)</label>
              <input
                type="number"
                step="1"
                min="5"
                value={budgetMonthly}
                onChange={(e) => setBudgetMonthly(parseFloat(e.target.value) || 50.0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !goal.trim()}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-1.5"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>{submitting ? 'Creating...' : 'Incorporate Company'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
