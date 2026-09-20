import { SecureKeyStore } from '../security/keyStore';
import { AppDatabase } from '../db/database';
import { IProviderAdapter } from './types';
import { OpenAIAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';
import { GoogleAdapter } from './adapters/google';
import { OpenRouterAdapter } from './adapters/openrouter';
import { OpenAICompatibleAdapter } from './adapters/compatible';
import { OllamaDetector } from './ollama';
import { ModelInfo, ProviderType } from '../../shared/types';
import { BUILTIN_MODELS } from '../../shared/constants';

export class ProviderRegistry {
  private keyStore: SecureKeyStore;
  private db: AppDatabase;
  private ollamaDetector: OllamaDetector;
  private cachedOllamaModels: ModelInfo[] = [];

  constructor(keyStore: SecureKeyStore, db: AppDatabase) {
    this.keyStore = keyStore;
    this.db = db;
    this.ollamaDetector = new OllamaDetector();
  }

  public hasKey(provider: ProviderType): boolean {
    return this.keyStore.hasKey(provider);
  }

  public getAvailableModel(): string | null {
    if (this.hasKey('openrouter')) return 'deepseek/deepseek-chat';
    if (this.hasKey('google')) return 'gemini-1.5-flash';
    if (this.hasKey('openai')) return 'gpt-4o';
    if (this.hasKey('anthropic')) return 'claude-3-5-sonnet-20241022';
    if (this.cachedOllamaModels.length > 0) return this.cachedOllamaModels[0].id;
    return null;
  }

  public async refreshLocalModels(): Promise<ModelInfo[]> {
    const res = await this.ollamaDetector.detect();
    if (res.online) {
      this.cachedOllamaModels = res.models;
    } else {
      this.cachedOllamaModels = [];
    }
    return this.cachedOllamaModels;
  }

  public async listAllModels(): Promise<ModelInfo[]> {
    // Refresh local models
    try {
      await this.refreshLocalModels();
    } catch {
      // Ignore detection errors
    }

    const map = new Map<string, ModelInfo>();
    for (const m of BUILTIN_MODELS) {
      map.set(m.id, m);
    }
    for (const m of this.cachedOllamaModels) {
      map.set(m.id, m);
    }

    return Array.from(map.values());
  }

  public getModelInfo(modelId: string): ModelInfo | undefined {
    const builtin = BUILTIN_MODELS.find(m => m.id === modelId);
    if (builtin) return builtin;
    return this.cachedOllamaModels.find(m => m.id === modelId);
  }

  public validateCeoModel(modelId: string): { valid: boolean; warning?: string } {
    const info = this.getModelInfo(modelId);
    if (!info) {
      return { valid: true, warning: `Model ${modelId} capability unknown. Ensure it supports robust tool calling.` };
    }
    if (!info.supportsToolCalling) {
      return {
        valid: false,
        warning: `Model "${info.name}" does not reliably support function/tool calling. As CEO, it may fail to create tasks or hire agents.`,
      };
    }
    return { valid: true };
  }

  public getProviderForModel(modelId: string): ProviderType {
    const localModel = this.cachedOllamaModels.find(m => m.id === modelId);
    if (localModel) return 'openai-compatible';

    const builtin = BUILTIN_MODELS.find(m => m.id === modelId);
    if (builtin) return builtin.provider;

    const lower = (modelId || '').toLowerCase();
    if (lower.startsWith('openrouter/')) return 'openrouter';
    if (lower.startsWith('deepseek/') || lower.startsWith('meta-llama/') || lower.startsWith('qwen/') || lower.startsWith('mistralai/')) return 'openrouter';
    if (lower.includes('/') && this.keyStore.hasKey('openrouter')) return 'openrouter';
    if (lower.includes('gemini') || lower.includes('google')) return 'google';
    if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic';
    if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('dall-e')) return 'openai';

    // Check configured cloud keys
    if (this.keyStore.hasKey('openrouter')) return 'openrouter';
    if (this.keyStore.hasKey('google')) return 'google';
    if (this.keyStore.hasKey('openai')) return 'openai';
    if (this.keyStore.hasKey('anthropic')) return 'anthropic';

    return 'openai';
  }

  public getAdapterForModel(modelId: string): IProviderAdapter {
    // 1. Check if model belongs to local Ollama
    const localModel = this.cachedOllamaModels.find(m => m.id === modelId);
    if (localModel) {
      const settings = this.db.getSetting<any>('settings', {});
      const baseUrl = settings?.providers?.['openai-compatible']?.baseUrl || 'http://localhost:11434/v1';
      return new OpenAICompatibleAdapter(baseUrl, 'ollama');
    }

    // 2. Identify provider intelligently (builtin, model name prefixes, or configured keys)
    const provider = this.getProviderForModel(modelId);
    return this.getAdapterForProvider(provider);
  }

  public getAdapterForProvider(provider: ProviderType): IProviderAdapter {
    const settings = this.db.getSetting<any>('settings', {});
    const key = this.keyStore.getKey(provider);

    switch (provider) {
      case 'openrouter':
        if (!key) throw new Error('OpenRouter API key is not configured. Please add it in Settings.');
        return new OpenRouterAdapter(key);

      case 'anthropic':
        if (!key) throw new Error('Anthropic API key is not configured. Please add it in Settings.');
        return new AnthropicAdapter(key);

      case 'openai':
        if (!key) throw new Error('OpenAI API key is not configured. Please add it in Settings.');
        return new OpenAIAdapter(key);

      case 'google':
        if (!key) throw new Error('Google AI API key is not configured. Please add it in Settings.');
        return new GoogleAdapter(key);

      case 'openai-compatible': {
        const baseUrl = settings?.providers?.['openai-compatible']?.baseUrl || 'http://localhost:11434/v1';
        return new OpenAICompatibleAdapter(baseUrl, key || 'ollama');
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
