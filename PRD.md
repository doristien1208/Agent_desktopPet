# Product Requirements Document (PRD): AI Desktop Pet (Dual Agents)

## 1. 專案概述 (Overview)
本專案旨在開發一個基於 Electron 與 Angular 的桌面寵物應用程式。該應用程式將包含兩個具備獨特個性 AI Agent，它們能互相交談、具有時間感知能力（Time Awareness）、具備自主性（Autonomy），並能透過 CLI 指令操作使用者的電腦。

## 2. 核心功能 (Core Features)

### 2.1. 介面與體驗 (UI/UX)
* **透明視窗 (Transparent Window):** 應用程式背景透明，無邊框，置頂顯示，感覺像是直接生活在桌面上。
* **滑鼠穿透 (Click-through):** 預設情況下，滑鼠可穿透透明區域操作後方視窗；當滑鼠移至角色身上時，攔截事件以進行互動（點擊、拖曳）。
* **視覺呈現:** 顯示兩個角色的圖像 (GIF/Canvas) 與對話氣泡 (Tooltip)。

### 2.2. 雙重人格 Agent (Dual Persona)
* **Agent A:** 設定為特定性格（如：暴躁、直接）。
* **Agent B:** 設定為對比性格（如：溫柔、調解）。
* **互動模式 (Triadic Interaction):**
    * 採用 **三人共用聊天室 (Group Chat)** 模式：User、Agent A、Agent B 處於同一個對話 Context 中。
    * 當 User 發話時，Agent A 或 Agent B 可以搶答，或者兩者依序回答。
    * 當 User 閒置時，Agent A 與 Agent B 可針對環境狀況（如時間、系統負載）互相閒聊，並試圖將 User 拉入話題。

### 2.3. 智慧邏輯 (Intelligence & Logic)
* **模型驅動:** 使用 Groq API (Llama 3) 進行極速推論。
* **時間感知 (Time Awareness):** 透過中間件計算互動間隔，注入「時間流逝」的旁白（例如：「你離開了 3 小時，現在是深夜」），讓 Agent 對時間有感。
* **自主迴圈 (Autonomy Loop):** 系統會定時檢查閒置狀態，根據隨機機率主動發起對話，而非僅被動等待 User 輸入。

### 2.4. 系統操作能力 (System Capabilities)
* **CLI 執行:** 透過 Function Calling 機制判斷是否需要操作電腦。
* **人機協作安全機制 (Human-in-the-loop):** * **關鍵變更：** 任何涉及系統修改或讀取敏感資訊的指令（CLI Execution），Agent **絕不能**自動執行。
    * **流程：** Agent 提出請求 -> 前端介面彈出確認框 (Approve/Deny) -> User 點擊同意 -> 後端才真正執行指令。

## 3. 技術堆疊 (Tech Stack)
* **Frontend:** Angular (v16+), SCSS
* **App Shell:** Electron
* **Backend Logic:** Node.js (Main Process)
* **AI Provider:** Groq SDK
* **Data Structure:** TypeScript Interfaces for Chat History & Config

## 4. 安全限制 (Safety & Constraints)
* CLI 指令執行需經過白名單或 User 確認（初期開發可先由 Prompt 控制）。
* Groq API Key 需透過 `.env` 管理，不提交至 Git。
