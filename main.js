const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

// ========== Phase 2: 引入 Backend 邏輯 ==========
const TimeManager = require('./src/backend/time-manager');
const AgentManager = require('./src/backend/agent-manager');

let mainWindow;
let timeManager;
let agentManager;
let autonomousLoopInterval;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    transparent:false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 開發模式使用，解決 CORS 問題
    }
  });

  //mainWindow.webContents.openDevTools();

  // 載入 Angular 建置的 index.html
  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, 'dist/browser/index.html'),
    protocol: 'file:',
    slashes: true
  });

  mainWindow.loadURL(startUrl);

  // 開發模式開啟 DevTools
  if (process.env.ELECTRON_START_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopAutonomousLoop();
  });

  // 預設啟用滑鼠穿透（對透明區域）
  mainWindow.setIgnoreMouseEvents(false, { forward: true });

  // ========== Phase 2: 初始化 Backend 系統 ==========
  initializeBackend();
}

/**
 * 初始化 Backend 系統
 */
function initializeBackend() {
  console.log('========================================');
  console.log('🚀 Phase 2/4: 初始化 Backend 系統');
  console.log('========================================');

  // 建立 TimeManager
  timeManager = new TimeManager();
  console.log('✓ TimeManager 已初始化');

  // 建立 AgentManager（Phase 4: 傳入 mainWindow）
  agentManager = new AgentManager(timeManager, mainWindow);
  console.log('✓ AgentManager 已初始化（含 CLI 工具支援）');

  // 啟動自主迴圈
  startAutonomousLoop();
  console.log('✓ 自主迴圈已啟動');

  console.log('========================================');
}

/**
 * 啟動自主迴圈 (Autonomy Loop)
 * 每 30 秒檢查一次是否應該觸發自主對話
 */
function startAutonomousLoop() {
  const CHECK_INTERVAL = 30000; // 30 秒

  autonomousLoopInterval = setInterval(async () => {
    console.log('[Autonomy Loop] 檢查是否觸發自主對話...');

    if (!mainWindow) {
      console.log('[Autonomy Loop] 視窗已關閉，跳過');
      return;
    }

    // 判斷是否應該觸發
    if (timeManager.shouldTriggerAutonomousChat()) {
      console.log('[Autonomy Loop] ✓ 觸發自主對話！');

      try {
        // 取得 Agent 回應
        const responses = await agentManager.handleAutonomousChat();

        // 發送給前端
        responses.forEach(response => {
          mainWindow.webContents.send('agent-response', response);
        });
      } catch (error) {
        console.error('[Autonomy Loop] 自主對話錯誤:', error);
      }
    } else {
      console.log('[Autonomy Loop] ✗ 暫不觸發');
    }
  }, CHECK_INTERVAL);

  console.log(`[Autonomy Loop] 已啟動，檢查間隔: ${CHECK_INTERVAL / 1000} 秒`);
}

/**
 * 停止自主迴圈
 */
function stopAutonomousLoop() {
  if (autonomousLoopInterval) {
    clearInterval(autonomousLoopInterval);
    autonomousLoopInterval = null;
    console.log('[Autonomy Loop] 已停止');
  }
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ========== IPC 通訊處理 ==========

// 控制滑鼠事件穿透
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  }
});

// 接收使用者輸入（Phase 2: 串接 AgentManager）
ipcMain.on('user-input', async (event, message) => {
  console.log('========================================');
  console.log('📥 收到使用者輸入:', message);
  console.log('========================================');

  try {
    // 使用 AgentManager 處理輸入
    const responses = await agentManager.handleUserInput(message);

    // 發送 Agent 回應給前端
    responses.forEach(response => {
      console.log(`📤 發送回應: [${response.agent}] ${response.message}`);
      event.reply('agent-response', response);
    });

    console.log('========================================');
  } catch (error) {
    console.error('❌ 處理使用者輸入時發生錯誤:', error);

    // 發送錯誤訊息給前端
    event.reply('agent-response', {
      agent: 'System',
      message: '抱歉，發生了錯誤：' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 取得系統資訊（Phase 2: 加入 TimeManager 資訊）
ipcMain.handle('get-system-info', async () => {
  return {
    platform: process.platform,
    timestamp: Date.now(),
    uptime: process.uptime(),
    timeContext: timeManager ? timeManager.getTimeContext() : null,
    sessionDuration: timeManager ? timeManager.getSessionDuration() : 0,
    timeSinceLastInteraction: timeManager ? timeManager.getTimeSinceLastInteractionInSeconds() : 0
  };
});

// ========== Phase 2: 新增調試用 IPC 處理器 ==========

// 手動觸發自主對話（測試用）
ipcMain.on('trigger-autonomous-chat', async (event) => {
  console.log('[Debug] 手動觸發自主對話');
  try {
    const responses = await agentManager.handleAutonomousChat();
    responses.forEach(response => {
      event.reply('agent-response', response);
    });
  } catch (error) {
    console.error('[Debug] 錯誤:', error);
  }
});

// 取得對話歷史（測試用）
ipcMain.handle('get-chat-history', async () => {
  return agentManager ? agentManager.getHistory() : [];
});

// 清空對話歷史（測試用）
ipcMain.on('clear-chat-history', (event) => {
  if (agentManager) {
    agentManager.clearHistory();
    console.log('[Debug] 對話歷史已清空');
    event.reply('agent-response', {
      agent: 'System',
      message: '對話歷史已清空',
      timestamp: new Date().toISOString()
    });
  }
});

// 重置時間管理器（測試用）
ipcMain.on('reset-time-manager', (event) => {
  if (timeManager) {
    timeManager.reset();
    console.log('[Debug] 時間管理器已重置');
    event.reply('agent-response', {
      agent: 'System',
      message: '時間管理器已重置',
      timestamp: new Date().toISOString()
    });
  }
});

// ========== Phase 4: CLI 工具確認機制 ==========

// 處理使用者對 CLI 工具的確認回應
ipcMain.on('confirm-action', (event, data) => {
  const { requestId, approved } = data;
  console.log(`[IPC] 收到確認回應: ${requestId}, approved: ${approved}`);

  if (agentManager) {
    agentManager.handleUserConfirmation(requestId, approved);
  }
});
