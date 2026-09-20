import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { AppDatabase } from './db/database';
import { SecureKeyStore } from './security/keyStore';
import { ProviderRegistry } from './providers/registry';
import { WorkspaceManager } from './workspace/workspaceManager';
import { BudgetGuard } from './limits/budgetGuard';
import { CompanyOrchestrator } from './agents/orchestrator';
import { registerIpcHandlers } from './ipc/router';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0f17',
    title: 'NexisFlow - AI-Run Company Platform',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  const distPath = path.join(__dirname, '../renderer/index.html');
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load URL: ${validatedURL} (${errorCode} - ${errorDescription})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize Core Services
  const db = new AppDatabase();
  const savedSettings = db.getSetting<any>('settings', null);
  const keyStore = new SecureKeyStore();
  const workspace = new WorkspaceManager(savedSettings?.workspaceDir);
  const registry = new ProviderRegistry(keyStore, db);
  const budgetGuard = new BudgetGuard(db);
  const orchestrator = new CompanyOrchestrator(db, workspace, registry, budgetGuard);

  // Auto-detect local Ollama on startup
  try {
    const localModels = await registry.refreshLocalModels();
    console.log(`[NexisFlow] Ollama detected with ${localModels.length} models.`);
  } catch (err) {
    console.log('[NexisFlow] Ollama detection skipped or offline.');
  }

  // Register typed IPC bridge
  registerIpcHandlers(db, keyStore, registry, workspace, orchestrator, () => mainWindow);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
