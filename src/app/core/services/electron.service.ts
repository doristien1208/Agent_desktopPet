import { Injectable } from '@angular/core';

// 宣告 Electron 全域物件類型
declare const window: any;

@Injectable({
  providedIn: 'root'
})
export class ElectronService {
  private ipcRenderer: any;
  public isElectron: boolean = false;

  constructor() {
    // 檢查是否在 Electron 環境中執行
    if (window && window.require) {
      try {
        this.ipcRenderer = window.require('electron').ipcRenderer;
        this.isElectron = true;
        console.log('✓ Running in Electron environment');
      } catch (e) {
        console.warn('✗ Not running in Electron environment', e);
      }
    } else {
      console.warn('✗ window.require not available (likely browser mode)');
    }
  }

  // ========== 基礎 IPC 方法 ==========

  /**
   * 發送訊息到 Main Process
   * @param channel 頻道名稱
   * @param args 任意參數
   */
  public send(channel: string, ...args: any[]): void {
    if (this.isElectron && this.ipcRenderer) {
      this.ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`[ElectronService] Cannot send to channel "${channel}": Not in Electron`);
    }
  }

  /**
   * 監聽來自 Main Process 的訊息
   * @param channel 頻道名稱
   * @param listener 回調函數
   */
  public on(channel: string, listener: (event: any, ...args: any[]) => void): void {
    if (this.isElectron && this.ipcRenderer) {
      this.ipcRenderer.on(channel, listener);
    }
  }

  /**
   * 單次監聽來自 Main Process 的訊息
   * @param channel 頻道名稱
   * @param listener 回調函數
   */
  public once(channel: string, listener: (event: any, ...args: any[]) => void): void {
    if (this.isElectron && this.ipcRenderer) {
      this.ipcRenderer.once(channel, listener);
    }
  }

  /**
   * 移除特定監聽器
   * @param channel 頻道名稱
   * @param listener 回調函數
   */
  public removeListener(channel: string, listener: (event: any, ...args: any[]) => void): void {
    if (this.isElectron && this.ipcRenderer) {
      this.ipcRenderer.removeListener(channel, listener);
    }
  }

  /**
   * 移除指定頻道的所有監聽器
   * @param channel 頻道名稱
   */
  public removeAllListeners(channel: string): void {
    if (this.isElectron && this.ipcRenderer) {
      this.ipcRenderer.removeAllListeners(channel);
    }
  }

  /**
   * 使用 invoke/handle 模式（Promise-based IPC）
   * @param channel 頻道名稱
   * @param args 任意參數
   * @returns Promise
   */
  public async invoke(channel: string, ...args: any[]): Promise<any> {
    if (this.isElectron && this.ipcRenderer) {
      return await this.ipcRenderer.invoke(channel, ...args);
    } else {
      throw new Error(`[ElectronService] Cannot invoke "${channel}": Not in Electron`);
    }
  }

  // ========== 專案特定方法 ==========

  /**
   * 設定滑鼠事件穿透
   * @param ignore true = 滑鼠穿透，false = 正常攔截
   * @param options forward 選項
   */
  public setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void {
    this.send('set-ignore-mouse-events', ignore, options || { forward: true });
  }

  /**
   * 發送使用者輸入到 Agent 系統
   * @param message 使用者訊息
   */
  public sendUserInput(message: string): void {
    if (!message || message.trim() === '') {
      console.warn('[ElectronService] Empty message, not sending.');
      return;
    }
    this.send('user-input', message);
  }

  /**
   * 監聽 Agent 回應
   * @param callback 回調函數，接收 { agent: string, message: string, timestamp?: string }
   */
  public onAgentResponse(callback: (response: { agent: string; message: string; timestamp?: string }) => void): void {
    this.on('agent-response', (event: any, response: any) => {
      callback(response);
    });
  }

  /**
   * 取得系統資訊（用於 Time Awareness）
   * @returns Promise<{ platform: string, timestamp: number, uptime: number }>
   */
  public async getSystemInfo(): Promise<any> {
    return await this.invoke('get-system-info');
  }

  // ========== Phase 4: CLI 指令確認機制 ==========

  /**
   * 監聽來自 Main Process 的指令執行請求
   * @param callback 回調函數，接收 { requestId, agent, command }
   */
  public onRequestConfirmation(callback: (data: {
    requestId: string;
    agent: string;
    command: string;
  }) => void): void {
    if (this.isElectron) {
      this.on('request-confirmation', (event: any, data: any) => callback(data));
    }
  }

  /**
   * 發送使用者的確認回應
   */
  public sendConfirmation(requestId: string, approved: boolean): void {
    if (this.isElectron) {
      this.send('confirm-action', { requestId, approved });
    }
  }

  // ========== Phase 2: 調試與測試功能 ==========

  /**
   * 手動觸發自主對話（測試用）
   */
  public triggerAutonomousChat(): void {
    this.send('trigger-autonomous-chat');
  }

  /**
   * 取得對話歷史
   * @returns Promise<Array>
   */
  public async getChatHistory(): Promise<any[]> {
    return await this.invoke('get-chat-history');
  }

  /**
   * 清空對話歷史
   */
  public clearChatHistory(): void {
    this.send('clear-chat-history');
  }

  /**
   * 重置時間管理器
   */
  public resetTimeManager(): void {
    this.send('reset-time-manager');
  }
}
