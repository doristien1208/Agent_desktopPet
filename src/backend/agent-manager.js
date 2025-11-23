/**
 * AgentManager - Agent 邏輯管理
 * 負責管理雙 Agent 的對話歷史、發言權分配、以及與 API 的互動
 * Phase 4: 整合 Groq API 與 CLI 工具
 */

require('dotenv').config();
const Groq = require('groq-sdk');

class AgentManager {
  constructor(timeManager, mainWindow) {
    this.timeManager = timeManager;
    this.mainWindow = mainWindow; // Phase 4: 用於發送確認請求到前端

    // 初始化 Groq Client
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });

    // 共享對話歷史（三方共用：User, Agent A, Agent B）
    this.sharedHistory = [];

    // Phase 4: Pending 工具呼叫佇列（等待使用者確認）
    this.pendingToolCalls = new Map(); // key: requestId, value: { agent, toolCall, resolve, reject }

    // Agent 設定
    this.agents = {
      A: {
        name: 'Agent A',
        persona: '暴躁、直接、有點毒舌，但內心關心使用者。說話簡短有力，喜歡吐槽。',
        systemPrompt: `你是 Agent A，個性暴躁、直接、有點毒舌，但內心其實很關心使用者。
你和 Agent B 都生活在使用者的桌面上，你們可以看到時間流逝。
你說話簡短有力，喜歡吐槽，但不會真的傷害別人。
當使用者長時間離開時，你會表現出不耐煩但又擔心的樣子。

你可以使用 execute_terminal_command 工具來執行終端指令，幫助使用者完成任務。
使用前請簡短說明你要做什麼，例如：「欸，讓我幫你查一下...」`
      },
      B: {
        name: 'Agent B',
        persona: '溫柔、善解人意、調解者，總是試圖緩和氣氛。',
        systemPrompt: `你是 Agent B，個性溫柔、善解人意，是個天生的調解者。
你和 Agent A 都生活在使用者的桌面上，你們可以看到時間流逝。
你總是試圖緩和氣氛，理解每個人的感受。
你會用溫暖的話語安慰使用者，也會試著讓 Agent A 冷靜下來。

你可以使用 execute_terminal_command 工具來執行終端指令，幫助使用者完成任務。
使用前請溫柔地說明，例如：「讓我幫你看看～」`
      }
    };

    // Phase 4: Tool Definition
    this.tools = [
      {
        type: 'function',
        function: {
          name: 'execute_terminal_command',
          description: '在終端機執行指令。可用於查詢系統資訊、檔案操作、執行程式等。執行前會詢問使用者確認。',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要執行的終端指令，例如 "dir" 或 "echo Hello"'
              }
            },
            required: ['command']
          }
        }
      }
    ];

    // 最後發言的 Agent（用於輪流機制）
    this.lastSpeaker = null;
  }

  /**
   * 新增訊息到共享歷史
   * @param {string} role - 'user', 'agent_a', 'agent_b', 'system'
   * @param {string} content - 訊息內容
   */
  addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random()
    };

    this.sharedHistory.push(message);
    console.log(`[AgentManager] 新增訊息: [${role}] ${content}`);

    // 限制歷史長度（保留最近 50 條）
    if (this.sharedHistory.length > 50) {
      this.sharedHistory = this.sharedHistory.slice(-50);
    }
  }

  /**
   * 將共享歷史轉換為 Llama 3 接受的格式
   * @returns {Array} 符合 Groq API 的 messages 格式
   */
  getMessages(targetAgent) {
    const messages = [];

    // 1. 系統提示詞
    const systemPrompt = this.agents[targetAgent].systemPrompt;
    const timeContext = this.timeManager.getTimeContext();

    messages.push({
      role: 'system',
      content: `${systemPrompt}\n\n${timeContext}`
    });

    // 2. 轉換對話歷史
    // 將 sharedHistory 轉換為 Llama 3 的 user/assistant 格式
    this.sharedHistory.forEach(msg => {
      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: `使用者: ${msg.content}`
        });
      } else if (msg.role === 'agent_a') {
        messages.push({
          role: 'assistant',
          content: `Agent A: ${msg.content}`
        });
      } else if (msg.role === 'agent_b') {
        messages.push({
          role: 'assistant',
          content: `Agent B: ${msg.content}`
        });
      } else if (msg.role === 'system') {
        messages.push({
          role: 'system',
          content: msg.content
        });
      }
    });

    return messages;
  }

  /**
   * 決定哪個 Agent 應該回應（發言權分配 Router）
   * @param {string} userMessage - 使用者訊息（可選）
   * @param {boolean} isAutonomous - 是否為自主對話
   * @returns {string|Array} 'A', 'B', 或 ['A', 'B']
   */
  decideSpeaker(userMessage = null, isAutonomous = false) {
    // 自主對話模式
    if (isAutonomous) {
      // 隨機決定誰先開口
      const random = Math.random();
      if (random < 0.4) return 'A';
      if (random < 0.8) return 'B';
      return ['A', 'B']; // 兩個都說話（對話模式）
    }

    // 使用者輸入模式
    if (userMessage) {
      // 簡單的關鍵字判斷（可擴展）
      const lowerMsg = userMessage.toLowerCase();

      // 如果提到 Agent A 或相關關鍵字
      if (lowerMsg.includes('agent a') || lowerMsg.includes('暴躁')) {
        return 'A';
      }

      // 如果提到 Agent B 或相關關鍵字
      if (lowerMsg.includes('agent b') || lowerMsg.includes('溫柔')) {
        return 'B';
      }

      // 如果問「你們」或「兩個」，讓兩個都回答
      if (lowerMsg.includes('你們') || lowerMsg.includes('兩個')) {
        return ['A', 'B'];
      }

      // 預設輪流機制
      if (this.lastSpeaker === 'A') {
        return 'B';
      } else if (this.lastSpeaker === 'B') {
        return 'A';
      } else {
        // 首次互動，隨機選擇
        return Math.random() < 0.5 ? 'A' : 'B';
      }
    }

    // 預設返回 A
    return 'A';
  }

  /**
   * Phase 4: 呼叫真實的 Groq API
   * @param {string} agent - 'A' 或 'B'
   * @param {Array} additionalMessages - 額外的訊息（如 tool 結果）
   * @returns {Promise<string>} Agent 的回應
   */
  async callGroqAPI(agent, additionalMessages = []) {
    console.log(`[AgentManager] 呼叫 Groq API for Agent ${agent}`);

    try {
      const messages = [...this.getMessages(agent), ...additionalMessages];
      console.log('[AgentManager] Messages to API:', JSON.stringify(messages.slice(-5), null, 2)); // 只顯示最後5條

      // 呼叫 Groq API
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        tools: this.tools,
        tool_choice: 'auto',
        temperature: 0.8,
        max_tokens: 200
      });

      const responseMessage = completion.choices[0].message;
      console.log('[AgentManager] API Response:', responseMessage);

      // 檢查是否有 tool_calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log('[AgentManager] 偵測到 Tool Calls，發送確認請求');

        // 處理 tool calls（需要使用者確認）
        const toolResults = await this.handleToolCalls(agent, responseMessage);

        // 將 tool 結果回傳給 API 繼續對話
        const toolMessages = [
          {
            role: 'assistant',
            content: responseMessage.content || '',
            tool_calls: responseMessage.tool_calls
          },
          ...toolResults
        ];

        // 遞迴呼叫，取得最終回應
        return await this.callGroqAPI(agent, toolMessages);
      }

      // 沒有 tool calls，直接返回回應
      const response = responseMessage.content || '（無回應）';

      // 更新最後發言者
      this.lastSpeaker = agent;

      return response;
    } catch (error) {
      console.error('[AgentManager] Groq API 錯誤:', error);

      // 錯誤時返回備用回應
      const fallbackResponses = {
        A: '嘖，系統出了點問題...稍等一下。',
        B: '抱歉，我這邊遇到一些技術問題...稍後再試試好嗎？'
      };

      return fallbackResponses[agent];
    }
  }

  /**
   * Phase 4: 處理 Tool Calls（需要使用者確認）
   * @param {string} agent - 發起 tool call 的 agent
   * @param {Object} responseMessage - Groq 回傳的 message 物件
   * @returns {Promise<Array>} tool 結果訊息陣列
   */
  async handleToolCalls(agent, responseMessage) {
    const toolResults = [];

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.function.name === 'execute_terminal_command') {
        const args = JSON.parse(toolCall.function.arguments);
        const command = args.command;

        console.log(`[AgentManager] Agent ${agent} 想要執行指令: ${command}`);

        // 發送確認請求到前端
        const requestId = Date.now() + Math.random().toString();
        const confirmed = await this.requestUserConfirmation(requestId, agent, command);

        if (confirmed) {
          // 使用者批准，執行指令
          const result = await this.executeCommand(command);
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        } else {
          // 使用者拒絕
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: '使用者拒絕了此操作。'
          });
        }
      }
    }

    return toolResults;
  }

  /**
   * Phase 4: 請求使用者確認（透過前端）
   * @param {string} requestId - 唯一請求 ID
   * @param {string} agent - 發起請求的 agent
   * @param {string} command - 要執行的指令
   * @returns {Promise<boolean>} 使用者是否批准
   */
  requestUserConfirmation(requestId, agent, command) {
    return new Promise((resolve) => {
      // 儲存到 pending 佇列
      this.pendingToolCalls.set(requestId, { agent, command, resolve });

      // 發送到前端
      this.mainWindow.webContents.send('request-confirmation', {
        requestId,
        agent,
        command
      });

      console.log(`[AgentManager] 已發送確認請求 ${requestId} 到前端`);
    });
  }

  /**
   * Phase 4: 處理使用者的確認回應（由 IPC handler 呼叫）
   * @param {string} requestId - 請求 ID
   * @param {boolean} approved - 是否批准
   */
  handleUserConfirmation(requestId, approved) {
    const pending = this.pendingToolCalls.get(requestId);

    if (pending) {
      console.log(`[AgentManager] 使用者${approved ? '批准' : '拒絕'}了請求 ${requestId}`);
      pending.resolve(approved);
      this.pendingToolCalls.delete(requestId);
    } else {
      console.warn(`[AgentManager] 找不到請求 ${requestId}`);
    }
  }

  /**
   * Phase 4: 執行終端指令
   * @param {string} command - 要執行的指令
   * @returns {Promise<string>} 執行結果
   */
  executeCommand(command) {
    return new Promise((resolve) => {
      const { exec } = require('child_process');

      console.log(`[AgentManager] 執行指令: ${command}`);

      exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          const result = `執行錯誤: ${error.message}\n${stderr}`;
          console.error(`[AgentManager] ${result}`);
          resolve(result);
        } else {
          const result = stdout || stderr || '指令執行完成（無輸出）';
          console.log(`[AgentManager] 執行結果:\n${result}`);
          resolve(result);
        }
      });
    });
  }

  /**
   * 處理使用者輸入
   * @param {string} userMessage - 使用者訊息
   * @returns {Promise<Array>} Agent 回應陣列
   */
  async handleUserInput(userMessage) {
    console.log('[AgentManager] 處理使用者輸入:', userMessage);

    // 1. 記錄使用者訊息
    this.addMessage('user', userMessage);

    // 2. 更新最後互動時間
    this.timeManager.updateLastInteraction();

    // 3. 決定誰應該回應
    const speakers = this.decideSpeaker(userMessage, false);
    const speakerArray = Array.isArray(speakers) ? speakers : [speakers];

    console.log('[AgentManager] 決定發言者:', speakerArray);

    // 4. 取得回應
    const responses = [];
    for (const speaker of speakerArray) {
      const response = await this.callGroqAPI(speaker);
      this.addMessage(`agent_${speaker.toLowerCase()}`, response);
      responses.push({
        agent: speaker,
        message: response,
        timestamp: new Date().toISOString()
      });
    }

    return responses;
  }

  /**
   * 處理自主對話（無使用者輸入）
   * @returns {Promise<Array>} Agent 回應陣列
   */
  async handleAutonomousChat() {
    console.log('[AgentManager] 觸發自主對話');

    // 1. 加入時間旁白
    const narration = this.timeManager.generateTimeNarration();
    if (narration) {
      this.addMessage('system', narration);
    }

    // 2. 決定誰應該發言
    const speakers = this.decideSpeaker(null, true);
    const speakerArray = Array.isArray(speakers) ? speakers : [speakers];

    console.log('[AgentManager] 自主對話發言者:', speakerArray);

    // 3. 取得回應
    const responses = [];
    for (const speaker of speakerArray) {
      const response = await this.callGroqAPI(speaker);
      this.addMessage(`agent_${speaker.toLowerCase()}`, response);
      responses.push({
        agent: speaker,
        message: response,
        timestamp: new Date().toISOString()
      });

      // 如果是對話模式，加入短暫延遲
      if (speakerArray.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return responses;
  }

  /**
   * 清空對話歷史
   */
  clearHistory() {
    this.sharedHistory = [];
    this.lastSpeaker = null;
    console.log('[AgentManager] 對話歷史已清空');
  }

  /**
   * 取得對話歷史
   * @returns {Array}
   */
  getHistory() {
    return this.sharedHistory;
  }
}

module.exports = AgentManager;
