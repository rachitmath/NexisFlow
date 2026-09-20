import { safeStorage, app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProviderType, ProviderKeyStatus } from '../../shared/types';

export class SecureKeyStore {
  private storePath: string;
  private memoryCache: Map<ProviderType, string> = new Map();
  private fallbackSecret: string;

  constructor(customPath?: string) {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.nexisflow_data');
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true });
    }
    this.storePath = customPath || path.join(userData, 'vault.enc');
    // Fallback key derived from local system info if safeStorage is not supported in the environment (e.g. headless CI)
    this.fallbackSecret = crypto.createHash('sha256').update(process.env.COMPUTERNAME || 'nexisflow-vault-salt').digest('hex');
    this.loadAll();
  }

  private loadAll() {
    if (!fs.existsSync(this.storePath)) {
      return;
    }
    try {
      const rawData = fs.readFileSync(this.storePath, 'utf8');
      const json: Record<string, { mode: 'safeStorage' | 'fallback'; data: string; iv?: string }> = JSON.parse(rawData);

      for (const [provider, record] of Object.entries(json)) {
        try {
          let decrypted = '';
          if (record.mode === 'safeStorage' && safeStorage?.isEncryptionAvailable()) {
            const buf = Buffer.from(record.data, 'base64');
            decrypted = safeStorage.decryptString(buf);
          } else if (record.mode === 'fallback' && record.iv) {
            const iv = Buffer.from(record.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.fallbackSecret.substring(0, 32)), iv);
            decrypted = decipher.update(record.data, 'base64', 'utf8') + decipher.final('utf8');
          }
          if (decrypted) {
            this.memoryCache.set(provider as ProviderType, decrypted);
          }
        } catch {
          // Ignore failed decryption of single key
        }
      }
    } catch {
      // Ignore corrupted store file
    }
  }

  private persist() {
    const json: Record<string, { mode: 'safeStorage' | 'fallback'; data: string; iv?: string }> = {};

    for (const [provider, plainKey] of this.memoryCache.entries()) {
      if (safeStorage?.isEncryptionAvailable()) {
        const encryptedBuf = safeStorage.encryptString(plainKey);
        json[provider] = {
          mode: 'safeStorage',
          data: encryptedBuf.toString('base64'),
        };
      } else {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.fallbackSecret.substring(0, 32)), iv);
        const encrypted = cipher.update(plainKey, 'utf8', 'base64') + cipher.final('base64');
        json[provider] = {
          mode: 'fallback',
          data: encrypted,
          iv: iv.toString('hex'),
        };
      }
    }

    fs.writeFileSync(this.storePath, JSON.stringify(json, null, 2), 'utf8');
  }

  public saveKey(provider: ProviderType, apiKey: string): void {
    if (!apiKey || apiKey.trim() === '') {
      this.deleteKey(provider);
      return;
    }
    this.memoryCache.set(provider, apiKey.trim());
    this.persist();
  }

  public getKey(provider: ProviderType): string | null {
    return this.memoryCache.get(provider) || null;
  }

  public deleteKey(provider: ProviderType): void {
    this.memoryCache.delete(provider);
    this.persist();
  }

  public hasKey(provider: ProviderType): boolean {
    return this.memoryCache.has(provider);
  }

  public getProviderStatus(provider: ProviderType, baseUrl?: string): ProviderKeyStatus {
    const configured = this.hasKey(provider);
    return {
      provider,
      configured,
      baseUrl,
      status: configured ? 'active' : 'unconfigured',
    };
  }
}
