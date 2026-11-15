# AI Desktop Pet · 羊駝與悠

以 Electron + Angular 製作的雙角色桌面陪伴程式。兩個角色共用近期對話，支援 Ollama 本機模型、NVIDIA 對話與 Groq 備援。悠沿用既有 sprite 動畫。

## 使用方式

- 點擊角色或「聊一聊」開啟完整聊天面板；拖曳角色可移動視窗。
- 氣泡只顯示最多 64 字的預覽，依序播放。滑鼠停留或鍵盤聚焦時暫停消失；點擊可讀完整紀錄。
- 完整面板保留換行、可捲動與選取複製。讀舊訊息時，新訊息不會強制把畫面拉到底部。
- Enter 送出，Shift + Enter 換行；中文輸入法選字中的 Enter 不會送出。
- 「停止全部」取消目前任務與等待佇列。停止不能復原已完成的操作，另行啟動並脫離子行程樹的應用程式可能仍會繼續執行。
- 設定可切換混合／純本機模式、關閉主動聊天、選擇保存紀錄。變更設定前須先完成或停止目前任務。

## 安裝與啟動（Windows）

```powershell
npm install
# 依需要從 .env.example 建立 .env，既有 .env 不要覆寫。
.\start.cmd
```

所有 Windows 啟動入口會先設定 UTF-8 碼頁（65001），避免 Electron 中文 Log 被當成舊碼頁解讀。修改後須重新啟動，終端內已經顯示的亂碼不會自動復原。

`start.cmd` 直接用 Node 執行專案內的 Angular CLI，建置後啟動 Electron，可避開損壞的全域 npm 啟動器。也可使用 `npm run electron`。只有 `npm start` 時是瀏覽器預覽，沒有模型或桌面功能。

本機使用需先安裝 Ollama，並安裝 `.env` 指定的對話與工具模型。程式會嘗試啟動 `ollama serve`；只會在離開時停止自己啟動的 Ollama。雲端金鑰均為選填，未設定 Groq key 不會阻止本機啟動。

Windows 會偵測使用者與系統的標準 Ollama 安裝路徑，即使桌面程式尚未取得更新後的 PATH，也能啟動已安裝的 Ollama。

## 模型與資料流向

預設沿用**混合模式**：有 NVIDIA key 時，使用者對話優先交給 NVIDIA；一般聊天可由 Groq 備援。介面顯示當前 provider 與模型。工具流程使用本機模型，失敗時明確回報原因。

**純本機模式**只使用 Ollama，本機不可用時停止，不轉送雲端。模式設定會保存，但既有任務執行中不能切換。

混合模式中的雲端請求會收到一般近期對話，NVIDIA 可規劃工具需求；工具交給本機 Gemma 執行。工具結果與衍生回覆標示為僅限本機，從後續雲端上下文排除；本機工具失敗不改送雲端。Groq 可備援一般聊天。已批准的 shell 指令若執行後失敗，保留錯誤原因並停止自動重試，避免重複操作。

## 執行權限與任務限制

- 尋找檔案位置使用 `find_files`，直接讀目錄與檔名，不讀取檔案內容、不啟動 shell、免授權。預設搜尋桌面、文件、下載、AppData/Roaming；略過連結、快取與過深目錄，每次最多 40 筆命中、40,000 個項目與約 15 秒，會標示搜尋範圍與截短。
- 限定格式的 `dir` 與單獨 `ver` 轉為原生唯讀查詢；一般 shell、讀取檔案內容、寫入、刪除與執行程式仍需批准。串接、管線、重導向不會因指令以 `dir` 開頭就被放行。
- 確認預設聚焦「拒絕並停止」；Escape 拒絕；兩分鐘未回覆自動取消。
- 對話依序執行，最多等待 10 則；主動聊天在忙碌時跳過。同一個請求只由第一位角色操作電腦，第二位角色只回應。
- 每次模型請求 90 秒、整體任務 5 分鐘、最多 12 個工具對話回合及 8 道指令。每道指令 60 秒、輸出擷取上限 1 MB，回傳模型最多 4,000 字元。
- shell 錯誤、拒絕、取消後停止。唯讀搜尋沒命中或目錄無法存取時，回傳查詢結果讓模型修正搜尋；相同查詢與指令在同一任務中復用結果。
- Electron renderer 關閉 Node integration，開啟 context isolation、sandbox、web security。preload 只暴露固定 API，主進程驗證 IPC 來源並阻止外部導覽與新視窗。
- 人工批准仍需要你確認指令內容；此程式不是隔離的作業系統沙箱。

## 紀錄與主動聊天

- 記憶體內最多保留 200 則可見紀錄；模型上下文最多保留 50 則、約 16,000 字元，沒有長期記憶摘要。
- 預設不把對話寫入磁碟。開啟「保存」後，紀錄會以明文存到 Electron `userData` 目錄的 `desktop-pet.json`，通常在 `%APPDATA%\multiple-agent`。
- 關閉保存會從設定檔移除已存對話；「清空對話」先停止任務，再清除記憶體與檔案中的紀錄。
- 視窗位置會保存，移動結束或顯示器配置改變時，依工作區限制位置與尺寸。
- 主動聊天依倒數觸發，預設每 1–2 分鐘一輪；可選活潑（30–60 秒）或安靜（3–5 分鐘）。每輪兩個角色交替說 4 句，結束後重新倒數，不再額外擲骰或因鍵盤滑鼠閒置而停用。
- 不顯示互聊倒數，也不逐秒寫 Log；只記錄開始、結束、失敗及停用／暫停事件。聊天室內可點「讓他們聊聊」立即觸發（即使自動模式已關閉）。正在執行任務時不重疊觸發；鎖定／休眠期間暫停。使用者插話會停止剩餘的自發對話，優先處理使用者訊息。
- 每次使用者訊息後至少保留 30 秒不自動插話。系統時間旁白區分「沒有聊天」與「沒有操作電腦」。

## 驗證

```powershell
node --test tests/backend.test.cjs tests/main.test.cjs tests/autonomy.test.cjs tests/console-encoding.test.cjs
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless
node node_modules/@angular/cli/bin/ng.js build --base-href ./
node tests/run-ui.cjs
```

Electron UI 測試使用真實 sandbox preload 與模擬後端，不讀取金鑰、不呼叫模型，也不執行 AI 指令。檢查長文、捲動位置、氣泡排隊、320×360／320×480／440×600 視窗與確認彈窗，預覽圖輸出至 `tmp/ui-review`。Windows 後端測試另以 `ver` 和可取消的等待行程驗證指令 runner。

可選的真實本機模型測試：先啟動 Ollama，再執行 `node tests/gemma-smoke.cjs`。它使用 `.env` 的本機模型，強制純本機模式，驗證聊天、`ver` 原生唯讀往返（免確認）和請求取消；報告輸出至 `tmp/gemma-review/report.json`。

`node tests/file-search-live.cjs` 使用純本機模型與實際目錄，驗證「請幫我找act log的檔案放在哪裡」從搜尋到回覆，不讀內容、不允許 shell。`node tests/file-search-live.cjs --mixed --fixture` 使用合成路徑驗證 NVIDIA 規劃與 Gemma 交接，不搜尋真實本機檔案。2026-09-06 已通過兩種測試。

目前元件 CSS 會超過原先 4 kB 的警告門檻，但低於 8 kB 的建置限制。模型測試涵蓋指定情境，尚未全面評估回覆品質、各螢幕 DPI 切換，以及正式安裝包與自動更新。

## 結構

- `main.js`：視窗、IPC、模型生命週期與任務整合。
- `preload.js`：固定的 renderer API。
- `src/backend/agent-manager.js`：人格、模型路由、工具流程。
- `src/backend/task-queue.js`：單一執行佇列與取消。
- `src/backend/autonomy-scheduler.js`：可調頻率的互聊倒數、忙碌與鎖定狀態。
- `src/backend/command-runner.js`：Windows 指令執行與終止。
- `src/backend/file-search.js`：有範圍限制的原生檔案位置查詢與舊式 dir 轉譯。
- `src/backend/preferences.js`：選項、位置及可選的對話保存。
- `src/backend/window-layout.js`：螢幕工作區邊界計算。
- `src/app/`：聊天面板、氣泡、互動與設定。
- `src/sprites.css`：既有角色動作的共用樣式。

`PRD.md`、`PLAN.md` 保留早期設計歷史；目前實際行為以本 README 與程式為準。

以 `node tests/gemma-smoke.cjs --autonomy-only` 可單獨實測四句本機互聊；只使用模型對話，不啟用工具，報告位於 `tmp/gemma-review/autonomy-report.json`。

以 `node tests/gemma-smoke.cjs --personality-only` 可檢查悠面對低落時是否先接住情緒，以及羊駝面對壓力時是否維持嘴硬但提供實際幫助；報告位於 `tmp/gemma-review/report.json`。
