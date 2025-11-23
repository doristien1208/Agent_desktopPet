import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { ElectronService } from './core/services/electron.service';

interface AgentMessage {
  agent: 'A' | 'B';
  message: string;
  timestamp: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('multiple_agent');

  // Phase 3: Agent 對話氣泡
  protected agentAMessage = signal<string | null>(null);
  protected agentBMessage = signal<string | null>(null);

  // 氣泡顯示狀態
  protected showAgentABubble = signal(false);
  protected showAgentBBubble = signal(false);

  // 用於測試的訊息記錄
  protected messages = signal<string[]>([]);
  protected userInput = signal('');

  // 測試面板收合狀態
  protected isPanelCollapsed = signal(false);

  // Phase 4: CLI 確認對話框
  protected showConfirmDialog = signal(false);
  protected confirmRequest = signal<{
    requestId: string;
    agent: string;
    command: string;
  } | null>(null);

  // 自動隱藏氣泡的 timeout IDs
  private agentATimeout: any = null;
  private agentBTimeout: any = null;

  constructor(protected electronService: ElectronService) {}

  ngOnInit(): void {
    // Phase 3: 監聽 Agent 回應並顯示對話氣泡
    this.electronService.onAgentResponse((response) => {
      console.log('Received agent response:', response);

      // 記錄到測試訊息區
      this.messages.update(msgs => [
        ...msgs,
        `[${response.agent}]: ${response.message}`
      ]);

      // 顯示對應的對話氣泡
      const agent = response.agent as 'A' | 'B';
      this.showAgentBubble(agent, response.message);
    });

    // 測試系統資訊（Phase 2 會用到）
    if (this.electronService.isElectron) {
      this.electronService.getSystemInfo().then(info => {
        console.log('System Info:', info);
      });

      // Phase 4: 監聽 CLI 確認請求
      this.electronService.onRequestConfirmation((data) => {
        console.log('[App] 收到確認請求:', data);
        this.confirmRequest.set(data);
        this.showConfirmDialog.set(true);
      });
    }
  }

  /**
   * 顯示 Agent 對話氣泡，5 秒後自動消失
   */
  private showAgentBubble(agent: 'A' | 'B', message: string) {
    if (agent === 'A') {
      // 清除舊的 timeout
      if (this.agentATimeout) {
        clearTimeout(this.agentATimeout);
      }

      // 顯示氣泡
      this.agentAMessage.set(message);
      this.showAgentABubble.set(true);

      // 5 秒後自動隱藏
      this.agentATimeout = setTimeout(() => {
        this.showAgentABubble.set(false);
        this.agentAMessage.set(null);
      }, 5000);
    } else {
      // 清除舊的 timeout
      if (this.agentBTimeout) {
        clearTimeout(this.agentBTimeout);
      }

      // 顯示氣泡
      this.agentBMessage.set(message);
      this.showAgentBBubble.set(true);

      // 5 秒後自動隱藏
      this.agentBTimeout = setTimeout(() => {
        this.showAgentBBubble.set(false);
        this.agentBMessage.set(null);
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    // 清理監聽器
    this.electronService.removeAllListeners('agent-response');

    // 清理 timeout
    if (this.agentATimeout) clearTimeout(this.agentATimeout);
    if (this.agentBTimeout) clearTimeout(this.agentBTimeout);
  }

  sendMessage(): void {
    const message = this.userInput();
    if (message.trim()) {
      this.messages.update(msgs => [...msgs, `[You]: ${message}`]);
      this.electronService.sendUserInput(message);
      this.userInput.set('');
    }
  }

  /**
   * Phase 3: 滑鼠進入 Agent 圖片時，關閉穿透（可點擊）
   */
  onAgentMouseEnter(): void {
    this.electronService.setIgnoreMouseEvents(false);
  }

  /**
   * Phase 3: 滑鼠離開 Agent 圖片時，開啟穿透
   */
  onAgentMouseLeave(): void {
    this.electronService.setIgnoreMouseEvents(true, { forward: true });
  }

  // ========== Phase 2: 調試功能 ==========

  triggerAutonomousChat(): void {
    console.log('[Debug] 觸發自主對話');
    this.electronService.triggerAutonomousChat();
  }

  clearHistory(): void {
    console.log('[Debug] 清空對話歷史');
    this.messages.set([]);
    this.electronService.clearChatHistory();
  }

  resetTime(): void {
    console.log('[Debug] 重置時間管理器');
    this.electronService.resetTimeManager();
  }

  async showSystemInfo(): Promise<void> {
    try {
      const info = await this.electronService.getSystemInfo();
      console.log('[Debug] 系統資訊:', info);

      this.messages.update(msgs => [
        ...msgs,
        `[System] 平台: ${info.platform}`,
        `[System] 時間上下文: ${info.timeContext}`,
        `[System] 會話時長: ${info.sessionDuration} 分鐘`,
        `[System] 距離上次互動: ${info.timeSinceLastInteraction} 秒`
      ]);
    } catch (error) {
      console.error('[Debug] 取得系統資訊失敗:', error);
    }
  }

  /**
   * 切換測試面板的收合狀態
   */
  togglePanel(): void {
    this.isPanelCollapsed.update(collapsed => !collapsed);
  }

  // ========== Phase 4: CLI 確認對話框 ==========

  /**
   * 批准 CLI 指令執行
   */
  approveCommand(): void {
    const request = this.confirmRequest();
    if (request) {
      console.log('[App] 批准指令:', request.command);
      this.electronService.sendConfirmation(request.requestId, true);
      this.showConfirmDialog.set(false);
      this.confirmRequest.set(null);
    }
  }

  /**
   * 拒絕 CLI 指令執行
   */
  rejectCommand(): void {
    const request = this.confirmRequest();
    if (request) {
      console.log('[App] 拒絕指令:', request.command);
      this.electronService.sendConfirmation(request.requestId, false);
      this.showConfirmDialog.set(false);
      this.confirmRequest.set(null);
    }
  }
}
