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

### ✅ Phase 3: 身體與介面 - 已完成
- ✓ 角色圖片顯示（Agent A & B）
- ✓ Flex 佈局（橫向排列）
- ✓ 對話氣泡系統（5 秒自動消失）
- ✓ 滑鼠互動（hover 控制穿透）
- ✓ 測試面板（可收合）
- ✓ 淡入淡出動畫

### ✅ Phase 4: 手腳與工具 - 已完成
- ✓ Groq API 整合（llama-3.3-70b-versatile）
- ✓ CLI 工具定義（execute_terminal_command）
- ✓ 安全確認機制（使用者批准/拒絕）
- ✓ 指令執行與結果回傳
- ✓ 確認對話框 UI

## 📦 安裝與執行

### 1. 安裝依賴
```bash
npm install
```

### 2. 設定 Groq API Key
```bash
# 複製環境變數範本
cp .env.example .env

# 編輯 .env 檔案，填入你的 Groq API Key
# GROQ_API_KEY=your_api_key_here
```

### 3. 開發模式（推薦）
```bash
# 建置 Angular 並啟動 Electron
npm run electron:dev
```

### 4. 生產模式
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
├── main.js                          # Electron 主進程（含 CLI 確認處理）
├── .env                             # 環境變數（含 Groq API Key）
├── .env.example                     # 環境變數範本
├── src/
│   ├── app/
│   │   ├── core/services/
│   │   │   └── electron.service.ts  # IPC 通訊封裝（含 Phase 4 方法）
│   │   ├── app.ts                   # 主元件（含確認對話框邏輯）
│   │   └── app.html                 # 桌面寵物介面 + 確認對話框
│   ├── backend/                     # Backend 邏輯
│   │   ├── time-manager.js          # 時間感知系統
│   │   └── agent-manager.js         # Agent 邏輯 + Groq API + CLI 工具
│   └── assets/                      # 資源檔案
│       ├── agent-a.png              # Agent A 角色圖片
│       └── agent-b.png              # Agent B 角色圖片
└── dist/                            # 建置輸出目錄
```

## 🔧 功能測試

### 基礎對話（Phase 2）
1. 輸入「你好」→ Agent A 或 B 會使用 Groq API 回應
2. 輸入「你們好」→ 兩個 Agent 都會回應
3. 輸入「Agent A」→ Agent A 回應
4. 輸入「Agent B」→ Agent B 回應

### 視覺互動（Phase 3）
- **對話氣泡**：Agent 說話時會在角色左側顯示氣泡，5 秒後自動消失
- **滑鼠穿透**：滑鼠移到角色或面板上時可點擊，移開後穿透桌面
- **測試面板**：點擊黑色標題列可收合/展開

### CLI 工具（Phase 4）
試著詢問 Agent：
- 「幫我查看當前目錄」
- 「列出這個資料夾的檔案」
- 「查看系統時間」

當 Agent 想執行指令時，會彈出確認對話框：
- ✅ **批准** - 執行指令並回傳結果給 Agent
- ❌ **拒絕** - Agent 會知道你拒絕了操作

### 調試功能
- 🎲 **觸發自主對話** - 手動觸發 Agent 自主聊天
- 🗑️ **清空歷史** - 清除所有對話記錄
- ⏰ **重置時間** - 重置時間管理器
- ℹ️ **系統資訊** - 顯示時間上下文和會話資訊

### 自主對話測試
1. 啟動應用後等待 30 秒
2. 系統會自動檢查是否觸發自主對話
3. 時間越長，觸發機率越高（最高 70%）
4. Agent 會根據時間流逝自主聊天

### Console 輸出
開啟 Electron DevTools 查看詳細的運作：
- Groq API 呼叫與回應
- Tool Calls 偵測
- 使用者確認流程
- 指令執行結果

## 📋 未來規劃

### 優化與擴充
- [ ] 角色拖曳功能
- [ ] 更多工具定義（檔案操作、網路查詢等）
- [ ] 對話歷史持久化
- [ ] 使用者偏好設定
- [ ] 更豐富的動畫效果
- [ ] 多語言支援

### 進階功能
- [ ] 角色情緒狀態系統
- [ ] 更複雜的自主行為模式
- [ ] 桌面互動（通知、提醒）
- [ ] 打包為獨立應用程式

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

**調試方法：**
- `triggerAutonomousChat()` - 手動觸發自主對話
- `getChatHistory()` - 取得對話歷史
- `clearChatHistory()` - 清空對話歷史
- `resetTimeManager()` - 重置時間管理器

**Phase 4 方法：**
- `onRequestConfirmation(callback)` - 監聽 CLI 確認請求
- `sendConfirmation(requestId, approved)` - 發送確認回應

## 🧠 Backend 系統說明

### TimeManager - 時間感知
- 計算距離上次互動的時間
- 生成時間流逝旁白
- 判斷時段（早晨/下午/傍晚/深夜）
- 計算自主對話觸發機率

### AgentManager - Agent 邏輯
- **Groq API 整合**：使用 llama-3.3-70b-versatile 模型
- **共享對話歷史**：記錄 User、Agent A、Agent B 的所有對話
- **發言權分配**：根據關鍵字、輪流機制決定誰回應
- **雙重人格**：
  - Agent A：暴躁、直接、毒舌但關心人
  - Agent B：溫柔、善解人意、調解者
- **CLI 工具**：execute_terminal_command（需使用者確認）
- **安全機制**：所有指令執行前都需要使用者批准

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
