/**
 * TimeManager - 時間感知系統
 * 負責計算時間差並生成「時間流逝旁白」
 */

class TimeManager {
  constructor() {
    this.lastInteractionTime = Date.now();
    this.sessionStartTime = Date.now();
    this.systemIdleProvider = null; // 由 main.js 注入 powerMonitor
  }

  /**
   * 注入系統閒置時間提供者（Electron powerMonitor.getSystemIdleTime）
   * 用系統 API 判斷使用者是否在操作電腦，不需執行任何 CLI 指令
   * @param {Function} provider - 回傳系統閒置秒數的函數
   */
  setSystemIdleProvider(provider) {
    this.systemIdleProvider = provider;
  }

  /**
   * 取得使用者活動狀態描述（基於全系統的鍵盤/滑鼠閒置時間）
   * @returns {string|null} 活動狀態文字，無 provider 時返回 null
   */
  getUserActivityStatus() {
    if (!this.systemIdleProvider) return null;

    try {
      const idleSeconds = this.systemIdleProvider();

      if (idleSeconds < 60) {
        return '使用者目前正在操作電腦（剛剛還有鍵盤滑鼠活動）。';
      }
      if (idleSeconds < 300) {
        const min = Math.floor(idleSeconds / 60);
        return `使用者大約 ${min} 分鐘沒有碰電腦了，可能在忙別的事。`;
      }
      const min = Math.floor(idleSeconds / 60);
      return `使用者已經離開電腦約 ${min} 分鐘了。`;
    } catch (e) {
      return null;
    }
  }

  /**
   * 更新最後互動時間
   */
  updateLastInteraction() {
    this.lastInteractionTime = Date.now();
  }

  /**
   * 取得距離上次互動的時間（毫秒）
   * @returns {number} 毫秒數
   */
  getTimeSinceLastInteraction() {
    return Date.now() - this.lastInteractionTime;
  }

  /**
   * 取得距離上次互動的時間（秒）
   * @returns {number} 秒數
   */
  getTimeSinceLastInteractionInSeconds() {
    return Math.floor(this.getTimeSinceLastInteraction() / 1000);
  }

  /**
   * 取得距離上次互動的時間（分鐘）
   * @returns {number} 分鐘數
   */
  getTimeSinceLastInteractionInMinutes() {
    return Math.floor(this.getTimeSinceLastInteractionInSeconds() / 60);
  }

  /**
   * 取得距離上次互動的時間（小時）
   * @returns {number} 小時數
   */
  getTimeSinceLastInteractionInHours() {
    return Math.floor(this.getTimeSinceLastInteractionInMinutes() / 60);
  }

  /**
   * 取得當前時間資訊
   * @returns {Object} 包含小時、分鐘、時段等資訊
   */
  getCurrentTimeInfo() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    let timeOfDay = '';
    if (hour >= 5 && hour < 12) {
      timeOfDay = '早晨';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = '下午';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = '傍晚';
    } else {
      timeOfDay = '深夜';
    }

    return {
      hour,
      minute,
      timeOfDay,
      timestamp: now.toISOString(),
      formattedTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    };
  }

  /**
   * 生成時間流逝旁白
   * 根據時間差長短，生成不同程度的旁白
   * @returns {string|null} 旁白文字，如果時間太短則返回 null
   */
  generateTimeNarration() {
    const seconds = this.getTimeSinceLastInteractionInSeconds();
    const minutes = this.getTimeSinceLastInteractionInMinutes();
    const hours = this.getTimeSinceLastInteractionInHours();
    const timeInfo = this.getCurrentTimeInfo();

    // 時間太短，不生成旁白
    if (seconds < 30) {
      return null;
    }

    // 30秒 - 2分鐘
    if (seconds < 120) {
      return `[${seconds} 秒過去了...]`;
    }

    // 2分鐘 - 30分鐘
    if (minutes < 30) {
      return `[已經過了 ${minutes} 分鐘，現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}]`;
    }

    // 30分鐘 - 2小時
    if (minutes < 120) {
      return `[距離上次對話 ${minutes} 分鐘，現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}，感覺有點寂寞...]`;
    }

    // 2小時 - 6小時
    if (hours < 6) {
      return `[距離上次對話已經 ${hours} 小時。現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}，發生了什麼事嗎？]`;
    }

    // 6小時以上
    return `[距離上次對話已經 ${hours} 小時... 現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}，我們好想你！]`;
  }

  /**
   * 取得完整的時間上下文資訊（供 Agent 使用）
   * @returns {string} 格式化的時間上下文
   */
  getTimeContext() {
    const timeInfo = this.getCurrentTimeInfo();
    const narration = this.generateTimeNarration();
    const seconds = this.getTimeSinceLastInteractionInSeconds();

    let context = `當前時間: ${timeInfo.timeOfDay} ${timeInfo.formattedTime}。`;

    if (narration) {
      context += ` ${narration}`;
    }

    // 使用者活動狀態（系統 API，比「距離上次對話」更準確）
    const activity = this.getUserActivityStatus();
    if (activity) {
      context += ` ${activity}`;
    } else if (seconds < 60) {
      context += ` 使用者剛剛還在活躍中。`;
    }

    return context;
  }

  /**
   * 重置時間管理器（用於新會話）
   */
  reset() {
    this.lastInteractionTime = Date.now();
    this.sessionStartTime = Date.now();
    console.log('[TimeManager] 時間管理器已重置');
  }

  /**
   * 取得會話持續時間（分鐘）
   * @returns {number}
   */
  getSessionDuration() {
    return Math.floor((Date.now() - this.sessionStartTime) / 60000);
  }
}

module.exports = TimeManager;
