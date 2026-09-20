import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from '../../src/main/workspace/workspaceManager';
import path from 'path';
import fs from 'fs';

describe('WorkspaceManager', () => {
  const testWorkspaceDir = path.join(process.cwd(), '.test_custom_workspace');

  beforeEach(() => {
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  it('initializes with a custom base directory and allows dynamic setBaseDir', () => {
    const wm = new WorkspaceManager(testWorkspaceDir);
    expect(wm.getBaseDir()).toBe(testWorkspaceDir);
    expect(fs.existsSync(testWorkspaceDir)).toBe(true);

    const updatedDir = path.join(testWorkspaceDir, 'nested_custom');
    wm.setBaseDir(updatedDir);
    expect(wm.getBaseDir()).toBe(path.resolve(updatedDir));
    expect(fs.existsSync(updatedDir)).toBe(true);
  });

  it('provisions company deliverables and notes directories on demand', () => {
    const wm = new WorkspaceManager(testWorkspaceDir);
    const companyId = 'comp_test_123';
    const compDir = wm.getCompanyDir(companyId);

    expect(fs.existsSync(compDir)).toBe(true);
    expect(fs.existsSync(path.join(compDir, 'deliverables'))).toBe(true);
    expect(fs.existsSync(path.join(compDir, 'notes'))).toBe(true);
  });

  it('writes and lists deliverables in the custom workspace directory', () => {
    const wm = new WorkspaceManager(testWorkspaceDir);
    const companyId = 'comp_test_456';

    const writtenPath = wm.writeWorkspaceFile(companyId, 'deliverables/summary.md', '# Executive Summary');
    expect(fs.existsSync(writtenPath)).toBe(true);

    const deliverables = wm.listDeliverables(companyId);
    expect(deliverables.length).toBe(1);
    expect(deliverables[0].name).toBe('summary.md');
    expect(wm.readWorkspaceFile(companyId, 'deliverables/summary.md')).toBe('# Executive Summary');
  });

  it('blocks path traversal attacks outside company workspace', () => {
    const wm = new WorkspaceManager(testWorkspaceDir);
    const companyId = 'comp_test_safe';

    expect(() => {
      wm.writeWorkspaceFile(companyId, '../../outside.txt', 'malicious content');
    }).toThrow(/Path traversal violation/);
  });
});
