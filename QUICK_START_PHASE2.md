# 🚀 Phase 2 快速開始指南

## 立即開始

### 1. 啟動應用
```bash
npm run electron:dev
```

### 2. 等待編譯完成
看到以下輸出表示成功：
```
✓ Browser application bundle generation complete.
========================================
🚀 Phase 2: 初始化 Backend 系統
========================================
✓ TimeManager 已初始化
✓ AgentManager 已初始化
✓ 自主迴圈已啟動
========================================
```

## 🎮 互動測試

### 測試 1: 基礎對話
在輸入框輸入：
- `你好` → 單個 Agent 回應
- `你們好` → 兩個 Agent 都回應
- `Agent A` → 指定 Agent A 回應
- `Agent B` → 指定 Agent B 回應

### 測試 2: 人格差異
觀察兩個 Agent 的回應風格：

**Agent A（暴躁）的典型回應：**
- "哼，終於回來了？我還以為你把我們忘了呢。"
- "怎麼？又有什麼事要煩我了？"
- "你這傢伙，總是這樣突然冒出來..."

**Agent B（溫柔）的典型回應：**
- "歡迎回來～我們一直在等你呢。"
- "你好呀！今天過得怎麼樣？"
- "看到你回來真好，有什麼我能幫忙的嗎？"

### 測試 3: 調試功能
點擊以下按鈕測試：

1. **🎲 觸發自主對話**
   - 手動觸發 Agent 自主聊天
   - 觀察 Agent 如何主動開話題

2. **ℹ️ 系統資訊**
   - 查看當前時間上下文
   - 查看距離上次互動的時間
   - 查看會話持續時間

3. **🗑️ 清空歷史**
   - 清除所有對話記錄
   - 重新開始對話

4. **⏰ 重置時間**
   - 重置時間管理器
   - 重新計算互動時間

### 測試 4: 自主對話（需要等待）
1. 輸入一條訊息與 Agent 互動
2. 等待 30 秒不操作
3. 觀察 Console 輸出：
   ```
   [Autonomy Loop] 檢查是否觸發自主對話...
   ```
4. 如果觸發，會看到：
   ```
   [Autonomy Loop] ✓ 觸發自主對話！
   ```
5. Agent 會自動發送訊息到前端

**提示：** 等待越久，觸發機率越高！

## 📊 Console 輸出解讀

### 使用者輸入時
```
========================================
📥 收到使用者輸入: 你好
========================================
[AgentManager] 處理使用者輸入: 你好
[AgentManager] 新增訊息: [user] 你好
[AgentManager] 決定發言者: ['A']
[AgentManager] 模擬呼叫 Groq API for Agent A
[AgentManager] Messages to API: [
  {
    "role": "system",
    "content": "你是 Agent A，個性暴躁..."
  },
  {
    "role": "user",
    "content": "使用者: 你好"
  }
]
[AgentManager] Agent A 回應: 哼，終於回來了？
📤 發送回應: [A] 哼，終於回來了？
========================================
```

### 自主對話觸發時
```
[Autonomy Loop] 檢查是否觸發自主對話...
[Autonomy Loop] ✓ 觸發自主對話！
[AgentManager] 觸發自主對話
[AgentManager] 新增訊息: [system] [已經過了 5 分鐘...]
[AgentManager] 自主對話發言者: ['B']
[AgentManager] 模擬呼叫 Groq API for Agent B
[AgentManager] Agent B 回應: 歡迎回來～
```

## 🔍 深入探索

### 查看完整對話歷史
在 Console 輸入：
```javascript
agentManager.getHistory()
```

輸出範例：
```javascript
[
  {
    role: 'user',
    content: '你好',
    timestamp: '2025-11-23T14:30:00.000Z',
    id: 1732368600000.123
  },
  {
    role: 'agent_a',
    content: '哼，終於回來了？',
    timestamp: '2025-11-23T14:30:01.000Z',
    id: 1732368601000.456
  }
]
```

### 查看時間資訊
在 Console 輸入：
```javascript
timeManager.getCurrentTimeInfo()
```

輸出範例：
```javascript
{
  hour: 14,
  minute: 30,
  timeOfDay: '下午',
  timestamp: '2025-11-23T14:30:00.000Z',
  formattedTime: '14:30'
}
```

### 查看時間旁白
在 Console 輸入：
```javascript
timeManager.generateTimeNarration()
```

輸出範例：
- 30 秒內：`null`
- 1 分鐘：`[已經過了 1 分鐘，現在是 下午 14:31]`
- 1 小時：`[你離開了 60 分鐘，現在是 下午 15:30，感覺有點寂寞...]`
- 3 小時：`[你已經消失了 3 小時！現在是 傍晚 17:30，發生了什麼事嗎？]`

## 🎯 驗證重點

### ✅ 功能正常的標誌
- [ ] 輸入訊息能收到回應
- [ ] Agent A 和 B 回應風格明顯不同
- [ ] 調試按鈕都能正常工作
- [ ] Console 有清晰的輸出
- [ ] 自主迴圈每 30 秒執行一次
- [ ] 系統資訊顯示正確

### ⚠️ 預期的行為
- Agent 回應是預設的（模擬 API）
- 自主對話是機率性的（可能不會每次都觸發）
- 對話歷史最多保留 50 條（自動清理）

## 🐛 疑難排解

### 問題：看不到 Console 輸出
**解決：** 確保 Electron DevTools 已開啟（按 F12 或查看程式碼中的 `openDevTools()`）

### 問題：自主對話一直不觸發
**解決：** 
1. 機率問題是正常的，等待更長時間
2. 使用「觸發自主對話」按鈕手動測試
3. 檢查 Console 的 `[Autonomy Loop]` 輸出

### 問題：Agent 回應很慢
**解決：** 模擬 API 有 500ms 延遲，這是正常的（模擬真實 API 延遲）

### 問題：訊息顯示異常
**解決：** 
1. 點擊「清空歷史」重置
2. 重新啟動應用
3. 檢查 Console 是否有錯誤訊息

## 📚 相關文件

- `PHASE2_TEST_GUIDE.md` - 完整測試指南
- `PHASE2_CHECKLIST.md` - 完成檢查清單
- `README.md` - 專案總覽

## 🎉 享受你的 AI 桌面寵物！

Phase 2 的核心邏輯已經全部完成。雖然目前使用模擬回應，但整個對話管理、時間感知、自主迴圈的架構都已經建立。

下一步可以：
1. **Phase 2.5**: 串接真實的 Groq API
2. **Phase 3**: 設計真正的桌面寵物介面
3. **Phase 4**: 加入 CLI 工具執行能力

現在就開始玩玩看吧！試著和你的 Agent 們聊聊天 😊
