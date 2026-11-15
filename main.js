const { app, BrowserWindow, ipcMain, screen, powerMonitor } = require('electron');
const path = require('path');
const url = require('url');
const { spawn, execSync } = require('child_process');
const Preferences = require('./src/backend/preferences');
const TaskQueue = require('./src/backend/task-queue');
const { fitBounds } = require('./src/backend/window-layout');
const findOllamaExecutable = require('./src/backend/ollama-executable');
const AutonomyScheduler = require('./src/backend/autonomy-scheduler');

// ========== Phase 2: 引入 Backend 邏輯 ==========
const TimeManager = require('./src/backend/time-manager');
const AgentManager = require('./src/backend/agent-manager');

let mainWindow;
let timeManager;
let agentManager;
let autonomousLoopInterval;
let ollamaProcess = null; // 由本 App 啟動的 ollama serve（外部已在跑則保持 null，關閉時不動它）

// ========== Ollama 生命週期管理 ==========
// App 啟動時自動確保 Ollama 在跑並預載對話模型；App 關閉時只關掉「自己啟動的」Ollama

const OLLAMA_ROOT = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '');

async function isOllamaUp() {
  try {
    const res = await fetch(`${OLLAMA_ROOT}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureOllamaRunning() {
  if (await isOllamaUp()) {
    console.log('[Ollama] 伺服器已在運行（外部啟動，App 關閉時不會動它）');
    warmUpChatModel();
    return;
  }

  console.log('[Ollama] 未偵測到伺服器，自動啟動 ollama serve...');
  try {
    ollamaProcess = spawn(findOllamaExecutable(), ['serve'], { stdio: 'ignore', windowsHide: true });
    ollamaProcess.on('error', (err) => {
      console.error('[Ollama] 啟動失敗（可能未安裝或不在 PATH）:', err.message);
      ollamaProcess = null;
    });
  } catch (e) {
    console.error('[Ollama] 啟動失敗:', e.message);
    return;
  }

  // 等待伺服器就緒（最多 20 秒）
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!ollamaProcess) return; // 啟動失敗
    if (await isOllamaUp()) {
      console.log('[Ollama] 伺服器就緒');
      warmUpChatModel();
      return;
    }
  }
  console.warn('[Ollama] 等待逾時；本機工具目前不可用，一般聊天依連線模式選擇備援。');
}

/**
 * 預載對話模型進記憶體，避免第一句對話卡在模型載入
 * （工具模型使用頻率低，等真正需要時再載，避免兩個模型同時吃光記憶體）
 */
function warmUpChatModel() {
  const model = process.env.OLLAMA_MODEL || 'qwen3:8b';
  fetch(`${OLLAMA_ROOT}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: '30m', stream: false }),
    signal: AbortSignal.timeout(90000)
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`模型 ${model} 預載失敗（HTTP ${res.status}）`);
      const result = await res.json();
      if (result.error || result.done !== true) throw new Error(`模型 ${model} 尚未完成載入，請檢查安裝與 Ollama 狀態。`);
      console.log(`[Ollama] 對話模型 ${model} 預載完成（已驗證回應）`);
    })
    .catch((e) => console.warn('[Ollama] 模型預載失敗:', e.message));
}

function stopOllama() {
  if (!ollamaProcess) return;
  console.log('[Ollama] 關閉由本 App 啟動的 ollama serve');
  try {
    // Windows 需要 taskkill /T 連子行程（模型 runner）一起收掉
    execSync(`taskkill /PID ${ollamaProcess.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
  } catch (e) {
    try { ollamaProcess.kill(); } catch (_) { /* 已結束 */ }
  }
  ollamaProcess = null;
}

let preferences;
let queue;
let saveTimer;
let dragTimer;
const autonomy = new AutonomyScheduler();
let activeBackground = false;
let sessionLocked = false;
let suspended = false;
let lastAutonomyState = '';
function autonomyState() {
  return autonomy.snapshot({ busy: Boolean(queue?.busy), paused: sessionLocked || suspended, chatting: activeBackground });
}
function publishAutonomy() {
  const state = autonomyState();
  if (state.state !== lastAutonomyState) {
    // Only meaningful transitions are logged; no countdown or busy/idle churn.
    if (['paused', 'disabled'].includes(state.state)) console.log(`[Autonomy] ${state.state}`);
    lastAutonomyState = state.state;
  }
}
let taskState = { busy: false, queued: 0, status: '準備好了', provider: '', model: '' };
const send = (channel, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
};
function savePreferences() {
  try { preferences.save(); }
  catch { send('task-state', { ...taskState, status: '無法儲存設定，請檢查磁碟空間與權限。' }); }
}
function addRecord(message) {
  preferences.history.push(message);
  preferences.history = preferences.history.slice(-200);
  send('history-updated', preferences.history);
  if (preferences.settings.rememberHistory) savePreferences();
}
function notice(content) {
  addRecord({ id: require('crypto').randomUUID(), role: 'system', content, timestamp: new Date().toISOString() });
}
function fitWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds(fitBounds(bounds, screen.getDisplayMatching(bounds).workArea));
}
function stopDrag() {
  clearInterval(dragTimer);
  dragTimer = null;
  fitWindow();
}
function createWindow() {
  const area = preferences.bounds ? screen.getDisplayMatching(preferences.bounds).workArea : screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    ...fitBounds(preferences.bounds, area), transparent: true, frame: false,
    alwaysOnTop: true, resizable: false, hasShadow: false, skipTaskbar: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  const startUrl = url.pathToFileURL(path.join(__dirname, 'dist/browser/index.html')).href;
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => { if (target !== startUrl) event.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.loadURL(startUrl);
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.on('move', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      preferences.bounds = mainWindow.getBounds();
      savePreferences();
    }, 300);
  });
  mainWindow.on('closed', () => { mainWindow = null; queue.cancel(); clearInterval(autonomousLoopInterval); clearInterval(dragTimer); });
  timeManager = new TimeManager();
  timeManager.setSystemIdleProvider(() => powerMonitor.getSystemIdleTime());
  agentManager = new AgentManager(timeManager, mainWindow);
  agentManager.mode = preferences.settings.mode;
  agentManager.sharedHistory = preferences.history.filter(m => m.role !== 'system').slice(-50);
  agentManager.onMessage = addRecord;
  agentManager.onResponse = response => send('agent-response', response);
  agentManager.onTaskStatus = status => { taskState = { ...taskState, ...status }; send('task-state', taskState); };
  autonomy.configure(preferences.settings);
  autonomousLoopInterval = setInterval(() => {
    if (!resetting && autonomy.claim({ busy: queue.busy, paused: sessionLocked || suspended, chatting: activeBackground })) {
      submit(null, true);
    }
    publishAutonomy();
  }, 1000);
  publishAutonomy();
}
function submit(text, background = false) {
  if (resetting) return;
  queue.enqueue(async signal => {
    activeBackground = background;
    if (background) console.log('[Autonomy] Starting 4 alternating turns');
    publishAutonomy();
    agentManager.beginTask(signal);
    try {
      if (background) await agentManager.handleAutonomousChat();
      else await agentManager.handleUserInput(text);
    } catch (error) {
      // Do not expose raw HTTP bodies, credentials or shell output in error toasts.
      const message = signal.aborted ? signal.reason.message :
        agentManager.task?.signal.aborted ? '模型等待逾時，任務已停止。' :
        error.userMessage ? error.userMessage :
        /^(你已|任務|確認|指令|已達|模型已|沒有執行)/.test(error.message) ? error.message :
        '模型服務暫時無法完成回覆。請檢查本機模型或雲端設定後重試。';
      console.warn(`[Task] ${background ? 'Autonomy' : 'User'} failed: ${message}`);
      if (!background || !signal.aborted) notice(message);
    } finally {
      agentManager.task = null;
      activeBackground = false;
      if (background) { autonomy.reschedule(); console.log('[Autonomy] Conversation ended'); }
      send('request-confirmation', null);
    }
  }, { background }).catch(error => {
    if (error.name !== 'AbortError') notice(error.message);
  });
}
function trusted(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame;
}
function handle(channel, action) {
  ipcMain.handle(channel, (event, value) => {
    if (!trusted(event)) throw new Error('不允許的訊息來源。');
    return action(value);
  });
}
handle('pet:bootstrap', () => ({ history: preferences.history, settings: preferences.settings, task: taskState, autonomy: autonomyState(),
  availability: { nvidia: Boolean(agentManager.nvidia), groq: Boolean(agentManager.groq) } }));
handle('pet:message', text => {
  if (resetting || queue.items.length >= 10) throw new Error('請稍後再送出。');
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('訊息須為 1–8000 字。');
  autonomy.userInteracted();
  // User messages take priority over the remaining autonomous turns.
  if (activeBackground) { activeBackground = false; queue.cancel(); }
  submit(text.trim());
  return true;
});
handle('pet:cancel', () => { queue.cancel(); autonomy.reschedule(); publishAutonomy(); return true; });
handle('pet:autonomy-now', () => {
  if (resetting || queue.busy || sessionLocked || suspended) throw new Error('目前正在忙碌，請稍後再試。');
  submit(null, true);
  return true;
});
let resetting = false;
handle('pet:clear', async () => {
  resetting = true;
  autonomy.reschedule();
  try {
    queue.cancel();
    await queue.whenIdle();
    preferences.history = [];
    agentManager.clearHistory();
    savePreferences();
    send('history-updated', []);
  } finally { resetting = false; }
  return true;
});
handle('pet:settings', value => {
  if (!value || typeof value !== 'object' || queue.busy) throw new Error('請先停止目前任務再變更設定。');
  preferences.settings = preferences.validate(value);
  autonomy.configure(preferences.settings);
  agentManager.mode = preferences.settings.mode;
  savePreferences();
  publishAutonomy();
  return preferences.settings;
});
handle('pet:confirm', value => {
  if (!value || typeof value.requestId !== 'string' || typeof value.approved !== 'boolean') throw new Error('確認格式錯誤。');
  return agentManager.handleUserConfirmation(value.requestId, value.approved);
});
ipcMain.on('pet:interactive', (event, value) => {
  if (!trusted(event) || typeof value !== 'boolean' || dragTimer) return;
  mainWindow.setIgnoreMouseEvents(!value, { forward: true });
});
ipcMain.on('pet:drag', (event, phase) => {
  if (!trusted(event)) return;
  if (phase === 'end') { stopDrag(); return; }
  if (phase !== 'start' || dragTimer) return;
  const start = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  const started = Date.now();
  mainWindow.setIgnoreMouseEvents(false);
  dragTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || Date.now() - started > 15000) { stopDrag(); return; }
    const cursor = screen.getCursorScreenPoint();
    mainWindow.setPosition(bounds.x + cursor.x - start.x, bounds.y + cursor.y - start.y);
  }, 16);
});
app.whenReady().then(() => {
  preferences = new Preferences(app.getPath('userData'));
  queue = new TaskQueue(state => {
    taskState = { ...taskState, ...state, ...(!state.busy ? { status: '準備好了', provider: '', model: '' } : {}) };
    send('task-state', taskState);
    publishAutonomy();
  });
  ensureOllamaRunning();
  createWindow();
  screen.on('display-metrics-changed', fitWindow);
  screen.on('display-removed', fitWindow);
  powerMonitor.on('suspend', () => { suspended = true; queue.cancel(); publishAutonomy(); });
  powerMonitor.on('resume', () => { suspended = false; autonomy.reschedule(); publishAutonomy(); });
  powerMonitor.on('lock-screen', () => { sessionLocked = true; if (activeBackground) queue.cancel(); publishAutonomy(); });
  powerMonitor.on('unlock-screen', () => { sessionLocked = false; autonomy.reschedule(); publishAutonomy(); });
});
let quitting = false;
app.on('before-quit', event => {
  clearInterval(dragTimer); clearInterval(autonomousLoopInterval); clearTimeout(saveTimer);
  if (!quitting && queue?.busy) {
    event.preventDefault();
    quitting = true;
    queue.cancel();
    // Allow cancellation to stop the running shell tree before exiting Electron.
    Promise.race([queue.whenIdle(), new Promise(resolve => setTimeout(resolve, 6000))]).then(() => app.quit());
  }
});
app.on('will-quit', stopOllama);
app.on('window-all-closed', () => app.quit());
