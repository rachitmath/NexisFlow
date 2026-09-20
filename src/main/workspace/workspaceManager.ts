import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { DeliverableFile } from '../../shared/types';

export class WorkspaceManager {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    if (customBaseDir) {
      this.baseDir = customBaseDir;
    } else {
      const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.nexisflow_data');
      this.baseDir = path.join(userData, 'workspaces');
    }
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public setBaseDir(newDir: string): void {
    if (!newDir) return;
    this.baseDir = path.resolve(newDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getCompanyDir(companyId: string): string {
    const dir = path.join(this.baseDir, companyId);
    const notesDir = path.join(dir, 'notes');
    const deliverablesDir = path.join(dir, 'deliverables');

    if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
    if (!fs.existsSync(deliverablesDir)) fs.mkdirSync(deliverablesDir, { recursive: true });

    return dir;
  }

  public getNotesDir(companyId: string): string {
    const dir = path.join(this.getCompanyDir(companyId), 'notes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public getDeliverablesDir(companyId: string): string {
    const dir = path.join(this.getCompanyDir(companyId), 'deliverables');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public isPathWithinWorkspace(companyId: string, targetPath: string): boolean {
    const companyDir = path.resolve(this.getCompanyDir(companyId));
    const resolvedTarget = path.resolve(companyDir, targetPath);
    return resolvedTarget.startsWith(companyDir);
  }

  public resolveSafePath(companyId: string, relativePath: string): string {
    const companyDir = path.resolve(this.getCompanyDir(companyId));
    const resolved = path.resolve(companyDir, relativePath);
    if (!resolved.startsWith(companyDir)) {
      throw new Error(`Path traversal violation: ${relativePath} is outside company workspace.`);
    }
    return resolved;
  }

  public writeWorkspaceFile(companyId: string, relativePath: string, content: string): string {
    if (!relativePath || typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error('Invalid file path: path must be a non-empty string.');
    }
    const safeContent = typeof content === 'string' ? content : (content != null ? String(content) : '');
    const normalized = relativePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    let targetRelative = normalized;
    if (!normalized.includes('/') && !normalized.startsWith('notes/') && !normalized.startsWith('deliverables/')) {
      targetRelative = `deliverables/${normalized}`;
    }

    const fullPath = this.resolveSafePath(companyId, targetRelative);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, safeContent, 'utf8');
    return fullPath;
  }

  public readWorkspaceFile(companyId: string, relativePath: string): string {
    if (!relativePath || typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error('Invalid file path: path must be a non-empty string.');
    }
    const clean = relativePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');

    // 1. Try resolving directly in company workspace
    const fullPath = this.resolveSafePath(companyId, clean);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fs.readFileSync(fullPath, 'utf8');
    }

    // 2. Try resolving inside deliverables directory
    const delivPath = path.resolve(this.getDeliverablesDir(companyId), clean);
    if (fs.existsSync(delivPath) && fs.statSync(delivPath).isFile()) {
      return fs.readFileSync(delivPath, 'utf8');
    }

    // 3. Try resolving inside notes directory
    const notesPath = path.resolve(this.getNotesDir(companyId), clean);
    if (fs.existsSync(notesPath) && fs.statSync(notesPath).isFile()) {
      return fs.readFileSync(notesPath, 'utf8');
    }

    throw new Error(`File does not exist: ${relativePath}`);
  }

  public listDeliverables(companyId: string): DeliverableFile[] {
    const delivDir = this.getDeliverablesDir(companyId);
    const results: DeliverableFile[] = [];

    const scan = (currDir: string, relPrefix: string = '') => {
      if (!fs.existsSync(currDir)) return;
      const entries = fs.readdirSync(currDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(currDir, entry.name);
        const rel = path.join(relPrefix, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          scan(full, rel);
        } else if (entry.isFile()) {
          const stats = fs.statSync(full);
          results.push({
            name: entry.name,
            path: full,
            relativePath: rel,
            sizeBytes: stats.size,
            updatedAt: stats.mtime.toISOString(),
          });
        }
      }
    };

    scan(delivDir);
    return results;
  }

  public deleteCompanyDir(companyId: string): void {
    const dir = path.join(this.baseDir, companyId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete company workspace directory for ${companyId}:`, err);
      }
    }
  }

  public cleanCompanyDir(companyId: string): void {
    const notesDir = path.join(this.baseDir, companyId, 'notes');
    const delivDir = path.join(this.baseDir, companyId, 'deliverables');
    
    [notesDir, delivDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.error(`Failed to clean company directory ${dir}:`, err);
        }
      }
    });
  }
}
