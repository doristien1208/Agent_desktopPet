# Implementation Plan

## Phase 1: 基礎架構搭建 (Foundation)
**目標:** 讓 Angular 在 Electron 透明視窗中跑起來，並建立 IPC 通訊管道。
1.  [Config] 修改 `package.json` 加入 `main` 入口與 `electron` 啟動指令。
2.  [Config] 修改 `angular.json` 確保 build output path 正確。
3.  [Main] 建立 `main.js`，設定 `BrowserWindow` 為 `transparent: true`, `frame: false`。
4.  [IPC] 建立 `preload.js` 或直接在 `main.js` 開啟 `nodeIntegration` (快速開發模式)。
5.  [Service] 在 Angular 建立 `ElectronService`，封裝 `ipcRenderer` 通訊。

## Phase 2: 大腦與邏輯 (The Brain - Node.js)
**目標:** 串接 Groq API 並實作時間與自主邏輯。
1.  [Setup] 安裝 `groq-sdk`, `dotenv`。
2.  [Logic] 建立 `src/backend/time-manager.ts`，實作時間差計算與旁白生成。
3.  [Logic] 建立 `src/backend/agent-manager.ts`:
    * 實作 **Shared Context (共享歷史紀錄)**：包含 User, Agent A, Agent B 的所有對話。
    * 設計 **Router (發言權分配)**：決定現在輪到 A 講、B 講，還是兩個都要講。
4.  [Main] 在 `main.js` 實作 `setInterval` 迴圈 (Autonomy Loop)，定時觸發 Agent 對話。
5.  [IPC] 串接 Angular `user-input` 事件 -> Groq API -> 回傳 `agent-response`。

## Phase 3: 身體與介面 (The Body - Angular)
**目標:** 顯示角色、對話氣泡與滑鼠互動。
1.  [UI] 製作 `PetComponent`，包含兩個角色的 HTML/SCSS。
2.  [UI] 實作對話氣泡樣式，支援「淡入淡出」動畫。
3.  [Interaction] 綁定 `mouseenter` / `mouseleave` 事件，呼叫 `ElectronService` 切換 `setIgnoreMouseEvents`。
4.  [Assets] 放入角色 GIF 至 `src/assets/`。

## Phase 4: 手腳與工具 (CLI Tools & Safety)
**目標:** 賦予 Agent 操作系統的能力，並實作安全確認機制。
1.  [Tools] 定義 Groq 的 Tool Definitions (JSON Schema)。
2.  [Main] 在 `main.js` 攔截 Groq 回傳的 `tool_calls`：
    * **暫停執行**。
    * 透過 IPC 發送 `request-confirmation` 事件給 Angular (包含指令內容)。
3.  [UI] 在 Angular 實作「指令確認彈窗 (Confirmation Modal)」：
    * 顯示：「Agent 想要執行 `ipconfig`，是否同意？」
    * 按鈕：[同意] / [拒絕]。
4.  [IPC] Angular 回傳 User 的決定 (`user-confirmed` 或 `user-denied`)。
5.  [System] Main Process 收到 `user-confirmed` 後，才呼叫 `child_process.exec` 並回傳結果。

## 5. File Structure Reference (預期結構)
```text
multiple_agent/
├── main.js                  # Electron Entry
├── .env                     # API Keys
├── src/
│   ├── app/
│   │   ├── core/services/electron.service.ts
│   │   ├── components/pet/pet.component.ts
│   │   └── app.component.ts
│   ├── assets/              # Images
│   └── backend/             # Node.js Logic (Optional folder structure)
│       ├── time-manager.js
│       └── agent-manager.js
└── ...
