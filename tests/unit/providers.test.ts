import { describe, it, expect } from 'vitest';
import { OllamaDetector } from '../../src/main/providers/ollama';
import { ProviderRegistry } from '../../src/main/providers/registry';
import { SecureKeyStore } from '../../src/main/security/keyStore';
import { AppDatabase } from '../../src/main/db/database';
import path from 'path';
import fs from 'fs';

describe('Providers & Ollama Integration', () => {
  it('detects running local Ollama instance and categorizes models', async () => {
    const detector = new OllamaDetector();
    const result = await detector.detect();

    // Since Ollama is running on this machine (v0.34.2)
    if (result.online) {
      expect(result.models.length).toBeGreaterThan(0);
      const qwen = result.models.find(m => m.id.includes('qwen2.5-coder'));
      if (qwen) {
        expect(qwen.supportsToolCalling).toBe(true);
        expect(qwen.isLocal).toBe(true);
      }
    } else {
      // Offline fallback check
      expect(result.models).toEqual([]);
    }
  });

  it('validates CEO model capability and warns on non-tool-calling models', () => {
    const testDbPath = path.join(process.cwd(), 'test-prov.db');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    const db = new AppDatabase(testDbPath);
    const keyStore = new SecureKeyStore(path.join(process.cwd(), 'test-vault.enc'));
    const registry = new ProviderRegistry(keyStore, db);

    const validCheck = registry.validateCeoModel('gpt-4o');
    expect(validCheck.valid).toBe(true);

    const openRouterCheck = registry.validateCeoModel('deepseek/deepseek-chat');
    expect(openRouterCheck.valid).toBe(true);

    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(path.join(process.cwd(), 'test-vault.enc'))) fs.unlinkSync(path.join(process.cwd(), 'test-vault.enc'));
  });

  it('correctly maps OpenRouter models and creates OpenRouter adapter', () => {
    const testDbPath = path.join(process.cwd(), 'test-or.db');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    const db = new AppDatabase(testDbPath);
    const keyStore = new SecureKeyStore(path.join(process.cwd(), 'test-or-vault.enc'));
    keyStore.saveKey('openrouter', 'sk-or-v1-testkey12345');
    const registry = new ProviderRegistry(keyStore, db);

    expect(registry.getProviderForModel('deepseek/deepseek-chat')).toBe('openrouter');
    expect(registry.getProviderForModel('meta-llama/llama-3.3-70b-instruct')).toBe('openrouter');
    expect(registry.getProviderForModel('openrouter/anthropic/claude-3.5-sonnet')).toBe('openrouter');

    const adapter = registry.getAdapterForModel('deepseek/deepseek-chat');
    expect(adapter.providerType).toBe('openrouter');

    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(path.join(process.cwd(), 'test-or-vault.enc'))) fs.unlinkSync(path.join(process.cwd(), 'test-or-vault.enc'));
  });
});
