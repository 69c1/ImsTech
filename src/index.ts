import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';

import Config from '@ims-tech-auto/core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.join(dirname(__filename), '..', '..');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果无法获得锁，说明已有实例在运行
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
{
  const { appendSwitch } = app.commandLine;
  appendSwitch('remote-debugging-port', '9222');
  appendSwitch('no-sandbox');
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    show: !Config.browser.headless,
    webPreferences: {
      nodeIntegration: false, // 禁用 Node.js Integration
      contextIsolation: true, // 启用上下文隔离
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  await mainWindow.loadFile(path.join(__dirname, '/index.html'));

  mainWindow.webContents.setAudioMuted(true);

  // 使用 Playwright 连接窗口，示例连接到CDP端口（确保 Electron 打开时调试端口暴露）
  connectToElectron().catch((err) => {
    console.error('Electron连接Playwright失败:', err);
  });
}

async function connectToElectron() {
  const child = spawn('node', [path.join(__dirname, 'dist', 'src', 'cli-runner.js')], {
    stdio: 'inherit',
  });

  child.on('exit', () => {
    app.exit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  app.quit();
});
