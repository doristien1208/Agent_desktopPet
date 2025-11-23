# AI Desktop Pet (Multiple Agent)

基於 Electron + Angular 的雙人格 AI 桌面寵物應用程式。

## 🚀 開發進度

### ✅ Phase 1: 基礎架構 - 已完成
- ✓ Electron 透明視窗設定（無邊框、置頂）
- ✓ Angular 與 Electron 整合
- ✓ IPC 通訊管道建立
- ✓ ElectronService 封裝
- ✓ 滑鼠穿透控制
- ✓ 測試介面

### ✅ Phase 2: 大腦與邏輯 - 已完成
- ✓ TimeManager（時間感知系統）
- ✓ AgentManager（Agent 邏輯管理）
- ✓ 共享對話歷史
- ✓ 發言權分配 Router
- ✓ 自主迴圈（Autonomy Loop）
- ✓ 雙 Agent 人格設定
- ✓ 模擬 API 回應（測試用）

## 📦 安裝與執行

### 1. 安裝依賴
```bash
npm install
```

### 2. 開發模式（推薦）
```bash
# 建置 Angular 並啟動 Electron
npm run electron:dev
```

### 3. 生產模式
```bash
# 先建置 Angular
npm run build

# 啟動 Electron
npm run electron
```

### 4. 僅 Angular 開發伺服器
```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`.

## 🏗️ 專案結構

```
multiple_agent/
├── main.js                          # Electron 主進程（含自主迴圈）
├── .env.example                     # 環境變數範本
├── src/
│   ├── app/
│   │   ├── core/services/
│   │   │   └── electron.service.ts  # IPC 通訊封裝
│   │   ├── app.ts                   # 主元件（含測試代碼）
│   │   └── app.html                 # 測試介面
│   ├── backend/                     # Phase 2: Backend 邏輯
│   │   ├── time-manager.js          # 時間感知系統
│   │   └── agent-manager.js         # Agent 邏輯管理
│   └── assets/                      # 資源檔案（待加入角色圖片）
└── dist/                            # 建置輸出目錄
```

## 🔧 Phase 2 功能測試

### 基礎互動
1. 輸入「你好」→ Agent A 或 B 會回應
2. 輸入「你們好」→ 兩個 Agent 都會回應
3. 輸入「Agent A」→ Agent A 回應
4. 輸入「Agent B」→ Agent B 回應

### 調試功能
- 🎲 **觸發自主對話** - 手動觸發 Agent 自主聊天
- 🗑️ **清空歷史** - 清除所有對話記錄
- ⏰ **重置時間** - 重置時間管理器
- ℹ️ **系統資訊** - 顯示時間上下文和會話資訊

### 自主對話測試
1. 啟動應用後等待 30 秒
2. 系統會自動檢查是否觸發自主對話
3. 時間越長，觸發機率越高
4. 觀察 Console 的 `[Autonomy Loop]` 輸出

### Console 輸出
開啟 Electron DevTools 查看詳細的 Backend 邏輯運作：
- TimeManager 時間計算
- AgentManager 對話管理
- 發言權分配決策
- 自主迴圈檢查

## 📋 下一階段：Phase 3

- [ ] 設計角色視覺（GIF/PNG）
- [ ] 實作 PetComponent
- [ ] 對話氣泡樣式
- [ ] 淡入淡出動畫
- [ ] 角色拖曳功能

## 📚 技術文件

### ElectronService API

**基礎 IPC 方法：**
- `send(channel, ...args)` - 發送訊息到主進程
- `on(channel, listener)` - 監聽主進程訊息
- `invoke(channel, ...args)` - Promise-based IPC

**專案專用方法：**
- `setIgnoreMouseEvents(ignore, options)` - 控制滑鼠穿透
- `sendUserInput(message)` - 發送使用者輸入
- `onAgentResponse(callback)` - 監聽 Agent 回應
- `getSystemInfo()` - 取得系統資訊

**Phase 2 調試方法：**
- `triggerAutonomousChat()` - 手動觸發自主對話
- `getChatHistory()` - 取得對話歷史
- `clearChatHistory()` - 清空對話歷史
- `resetTimeManager()` - 重置時間管理器

## 🧠 Backend 系統說明

### TimeManager - 時間感知
- 計算距離上次互動的時間
- 生成時間流逝旁白
- 判斷時段（早晨/下午/傍晚/深夜）
- 計算自主對話觸發機率

### AgentManager - Agent 邏輯
- **共享對話歷史**：記錄 User、Agent A、Agent B 的所有對話
- **發言權分配**：根據關鍵字、輪流機制決定誰回應
- **雙重人格**：
  - Agent A：暴躁、直接、毒舌但關心人
  - Agent B：溫柔、善解人意、調解者
- **模擬 API**：Phase 2 使用固定回應測試邏輯

### Autonomy Loop - 自主迴圈
- 每 30 秒檢查一次
- 根據時間長短動態調整觸發機率
- 5 分鐘內：10% 機率
- 5-15 分鐘：30% 機率
- 15-30 分鐘：50% 機率
- 30 分鐘以上：70% 機率

## Angular CLI Commands

To generate a new component:

```bash
ng generate component component-name
```

To build the project:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
