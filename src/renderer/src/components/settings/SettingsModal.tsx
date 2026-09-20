import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ShieldCheck, 
  Trash2,
  DollarSign,
  Sparkles,
  Folder,
  FolderOpen,
  ExternalLink,
  HardDrive
} from 'lucide-react';
import { 
  AppSettings, 
  ProviderType, 
  ProviderKeyStatus, 
  ModelInfo,
  Company
} from '@shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelInfo[];
  onRefreshModels: () => void;
  activeCompany?: Company | null;
  onSetActiveModel?: (modelId: string) => Promise<void>;
  onAddCustomModel?: (modelId: string) => void;
}

const PROVIDER_TEST_MODELS: Record<ProviderType, string[]> = {
  openrouter: [
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1',
    'meta-llama/llama-3.3-70b-instruct',
    'anthropic/claude-3.5-sonnet',
    'google/gemini-2.0-flash-001',
    'qwen/qwen-2.5-coder-32b-instruct',
  ],
  google: [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-2.0-flash-exp',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  anthropic: [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
  ],
  'openai-compatible': [
    'qwen2.5-coder:7b',
    'llama3.1:8b',
    'mistral:7b',
  ],
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  models,
  onRefreshModels,
  activeCompany,
  onSetActiveModel,
  onAddCustomModel,
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<ProviderKeyStatus[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string }>>({});
  const [lastTestedModels, setLastTestedModels] = useState<Record<string, string>>({});
  const [appliedModelStatus, setAppliedModelStatus] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'providers' | 'models' | 'budgets' | 'workspace'>('providers');

  const handleSelectWorkspaceDir = async () => {
    if (!api?.selectDirectory) return;
    try {
      const chosen = await api.selectDirectory();
      if (chosen) {
        await api.saveSettings({ workspaceDir: chosen });
        setSettings(prev => prev ? { ...prev, workspaceDir: chosen } : null);
      }
    } catch (err) {
      console.error('Failed to choose directory:', err);
    }
  };

  const handleOpenWorkspaceDir = async () => {
    if (!api?.openDirectory) return;
    try {
      await api.openDirectory(settings?.workspaceDir);
    } catch (err) {
      console.error('Failed to open directory:', err);
    }
  };

  const [selectedTestModels, setSelectedTestModels] = useState<Record<ProviderType, string>>({
    openrouter: 'deepseek/deepseek-chat',
    google: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    'openai-compatible': 'qwen2.5-coder:7b',
  });
  const [customModelInputs, setCustomModelInputs] = useState<Record<ProviderType, string>>({
    openrouter: '',
    google: '',
    openai: '',
    anthropic: '',
    'openai-compatible': '',
  });
  const [showCustomModel, setShowCustomModel] = useState<Record<ProviderType, boolean>>({
    openrouter: false,
    google: false,
    openai: false,
    anthropic: false,
    'openai-compatible': false,
  });

  const api = (window as any).nexisFlowAPI;

  const loadData = async () => {
    if (!api) return;
    try {
      const s = await api.getSettings();
      setSettings(s);
      const statuses = await api.getProviderStatuses();
      setProviderStatuses(statuses);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveKey = async (provider: ProviderType) => {
    const key = keyInputs[provider];
    if (!key || !key.trim()) return;
    setSavingKey(provider);
    try {
      await api.saveProviderKey(provider, key.trim());
      setKeyInputs(prev => ({ ...prev, [provider]: '' }));
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteKey = async (provider: ProviderType) => {
    try {
      await api.deleteProviderKey(provider);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestProvider = async (provider: ProviderType) => {
    setTestingProvider(provider);
    const targetModel = showCustomModel[provider] && customModelInputs[provider]?.trim()
      ? customModelInputs[provider].trim()
      : selectedTestModels[provider];
    setLastTestedModels(prev => ({ ...prev, [provider]: targetModel }));
    try {
      const res = await api.testProvider(provider, targetModel);
      setTestResults(prev => ({ ...prev, [provider]: res }));
      if (res.success && targetModel) {
        onAddCustomModel?.(targetModel);
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [provider]: { success: false, error: err?.message || 'Failed' } }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleApplyAsActiveModel = async (modelId: string) => {
    if (!onSetActiveModel) return;
    try {
      await onSetActiveModel(modelId);
      setAppliedModelStatus(modelId);
      setTimeout(() => setAppliedModelStatus(null), 4000);
    } catch (err) {
      console.error('Failed to set active model:', err);
    }
  };

  const handleSaveDefaultModels = async (ceoModel: string, workerModel: string) => {
    if (!settings) return;
    const updated = { ...settings, defaultCeoModel: ceoModel, defaultWorkerModel: workerModel };
    setSettings(updated);
    await api.saveSettings(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-850 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Settings & Model Providers</h2>
              <p className="text-xs text-slate-400">Manage API keys (safely encrypted) and local Ollama instances</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtabs */}
        <div className="flex border-b border-slate-800 px-4 bg-slate-900/50">
          <button
            onClick={() => setActiveSubTab('providers')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeSubTab === 'providers'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            API Keys & Providers
          </button>
          <button
            onClick={() => setActiveSubTab('models')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeSubTab === 'models'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Model Defaults & Ollama
          </button>
          <button
            onClick={() => setActiveSubTab('budgets')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeSubTab === 'budgets'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Global Budgets
          </button>
          <button
            onClick={() => setActiveSubTab('workspace')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 ${
              activeSubTab === 'workspace'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Workspace Storage</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeSubTab === 'providers' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-start space-x-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  Keys are protected at rest using your operating system's native hardware encryption (Electron <code className="text-emerald-300 font-mono">safeStorage</code>). Raw secrets never touch the browser renderer.
                </p>
              </div>

              {/* Providers List */}
              {(['openrouter', 'google', 'openai', 'anthropic', 'openai-compatible'] as ProviderType[]).map((provider) => {
                const status = providerStatuses.find(s => s.provider === provider);
                const isConfigured = status?.configured || provider === 'openai-compatible';
                const test = testResults[provider];

                const labels: Record<string, { title: string; desc: string; placeholder: string }> = {
                  openrouter: { title: 'OpenRouter', desc: 'Access 200+ models (DeepSeek V3/R1, Llama 3.3, Claude, Gemini & more)', placeholder: 'sk-or-v1-...' },
                  google: { title: 'Google AI Gemini', desc: 'Gemini 1.5 Pro & Flash', placeholder: 'AIzaSy...' },
                  openai: { title: 'OpenAI', desc: 'GPT-4o & GPT-4o Mini', placeholder: 'sk-proj-...' },
                  anthropic: { title: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet & Haiku', placeholder: 'sk-ant-...' },
                  'openai-compatible': { title: 'Local Ollama / OpenAI Compatible', desc: 'http://localhost:11434/v1 (No key needed)', placeholder: 'Optional API Key' },
                };

                const info = labels[provider];

                return (
                  <div key={provider} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-semibold text-white">{info.title}</h4>
                          {isConfigured ? (
                            <span className="flex items-center space-x-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Configured</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                              Not configured
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{info.desc}</p>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        {/* Model selector for test */}
                        {showCustomModel[provider] ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              placeholder="model id"
                              value={customModelInputs[provider]}
                              onChange={(e) => setCustomModelInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                              className="bg-dark-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono w-32 focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCustomModel(prev => ({ ...prev, [provider]: false }))}
                              className="text-[10px] text-slate-400 hover:text-white px-1"
                              title="Cancel custom model"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select
                            value={selectedTestModels[provider]}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setShowCustomModel(prev => ({ ...prev, [provider]: true }));
                              } else {
                                setSelectedTestModels(prev => ({ ...prev, [provider]: e.target.value }));
                              }
                            }}
                            className="bg-dark-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 max-w-[145px] truncate cursor-pointer"
                            title="Select model to test"
                          >
                            {(PROVIDER_TEST_MODELS[provider] || []).map(m => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            {provider === 'openai-compatible' && models.filter(m => m.isLocal).map(m => (
                              <option key={m.id} value={m.id}>
                                {m.id}
                              </option>
                            ))}
                            <option value="__custom__">+ Custom model...</option>
                          </select>
                        )}

                        <button
                          onClick={() => handleTestProvider(provider)}
                          disabled={testingProvider === provider || (!isConfigured && provider !== 'openai-compatible')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 disabled:opacity-40 transition-colors flex items-center space-x-1"
                          title="Test connection using selected model"
                        >
                          {testingProvider === provider ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          <span>Test</span>
                        </button>

                        {status?.configured && (
                          <button
                            onClick={() => handleDeleteKey(provider)}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Remove key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Test feedback */}
                    {test && (
                      <div className={`text-[11px] p-2.5 rounded-lg space-y-2 ${
                        test.success ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/30' : 'bg-rose-950/40 text-rose-300 border border-rose-800/30'
                      }`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span>{test.success ? `✓ Connected successfully (${test.latencyMs}ms)` : `✗ ${test.error}`}</span>
                          {test.success && lastTestedModels[provider] && (
                            <span className="font-mono text-[11px] text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                              {lastTestedModels[provider]}
                            </span>
                          )}
                        </div>

                        {test.success && lastTestedModels[provider] && onSetActiveModel && (
                          <div className="flex items-center justify-between pt-1.5 border-t border-emerald-800/40 gap-2 flex-wrap">
                            <span className="text-[10px] text-slate-300">
                              {appliedModelStatus === lastTestedModels[provider]
                                ? '✓ Company active base model updated!'
                                : activeCompany
                                  ? `Use ${lastTestedModels[provider]} as CEO orchestrator model?`
                                  : `Set ${lastTestedModels[provider]} as base model?`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleApplyAsActiveModel(lastTestedModels[provider])}
                              disabled={appliedModelStatus === lastTestedModels[provider]}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-600/50 text-dark-900 font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>
                                {appliedModelStatus === lastTestedModels[provider] ? 'Active Base Model ✓' : 'Set as Active Base Model'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Input field */}
                    <div className="flex space-x-2">
                      <input
                        type="password"
                        placeholder={info.placeholder}
                        value={keyInputs[provider] || ''}
                        onChange={(e) => setKeyInputs({ ...keyInputs, [provider]: e.target.value })}
                        className="flex-1 bg-dark-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button
                        onClick={() => handleSaveKey(provider)}
                        disabled={savingKey === provider || !keyInputs[provider]?.trim()}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors"
                      >
                        {savingKey === provider ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeSubTab === 'models' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">Local Ollama Detection</h4>
                    <p className="text-[11px] text-slate-400">{models.filter(m => m.isLocal).length} local models detected</p>
                  </div>
                </div>
                <button
                  onClick={onRefreshModels}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Scan Now</span>
                </button>
              </div>

              {/* Model Selectors */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Default Model Preferences</h4>
                
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Default CEO Agent Model
                  </label>
                  <select
                    value={settings?.defaultCeoModel || 'gpt-4o'}
                    onChange={(e) => handleSaveDefaultModels(e.target.value, settings?.defaultWorkerModel || 'gpt-4o-mini')}
                    className="w-full bg-dark-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {!m.supportsToolCalling ? '⚠️ (Weak tool-calling)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Needs strong function/tool calling to delegate tasks and hire workers.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Default Worker Agent Model
                  </label>
                  <select
                    value={settings?.defaultWorkerModel || 'gpt-4o-mini'}
                    onChange={(e) => handleSaveDefaultModels(settings?.defaultCeoModel || 'gpt-4o', e.target.value)}
                    className="w-full bg-dark-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Cost-effective or fast local model for specialized task execution.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'budgets' && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-semibold text-white">Global Hard Budget Stop</h4>
              </div>
              <p className="text-xs text-slate-400">
                Enforces a hard limit in code. If total spend across all companies hits this threshold in a month, all runs halt immediately.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Monthly Cap ($ USD)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={settings?.globalMonthlyBudget || 100}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 50;
                    if (settings) {
                      const updated = { ...settings, globalMonthlyBudget: val };
                      setSettings(updated);
                      api.saveSettings(updated);
                    }
                  }}
                  className="w-40 bg-dark-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-semibold text-white">Worker Concurrency Pool</h4>
                </div>
                <p className="text-xs text-slate-400">
                  Limits concurrent specialist worker loops. Excess in-progress tasks wait in a FIFO queue.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Max Concurrent Workers
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={settings?.maxConcurrentWorkers ?? 3}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 3);
                      if (settings) {
                        const updated = { ...settings, maxConcurrentWorkers: val };
                        setSettings(updated);
                        api.saveSettings(updated);
                      }
                    }}
                    className="w-40 bg-dark-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'workspace' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 flex items-start space-x-2.5">
                <Folder className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-200/90 leading-relaxed">
                  All company artifacts, generated code, documents, deliverables, and agent notes are stored directly on your computer inside subdirectories within this path.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">
                    Active Storage Directory
                  </label>
                  <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    Local Storage
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono break-all select-all">
                    {settings?.workspaceDir || 'Default directory (App Data)'}
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSelectWorkspaceDir}
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors flex items-center space-x-1.5 shadow-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Change Folder</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenWorkspaceDir}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors border border-slate-700 flex items-center space-x-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    <span>Open in File Explorer</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs text-slate-400">
                <div className="font-semibold text-slate-300 text-xs">Directory Layout:</div>
                <div className="font-mono text-[11px] space-y-1 pl-1">
                  <div>📁 &lt;workspace&gt;/</div>
                  <div className="pl-4">└── 📁 &lt;company-id&gt;/</div>
                  <div className="pl-8 text-emerald-400">├── 📁 deliverables/ <span className="text-slate-500 font-sans">(Code, docs, slides, generated files)</span></div>
                  <div className="pl-8 text-violet-400">└── 📁 notes/ <span className="text-slate-500 font-sans">(Agent memory notes & transcripts)</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
