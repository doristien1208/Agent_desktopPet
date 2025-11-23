/**
 * TimeManager - 時間感知系統
 * 負責計算時間差並生成「時間流逝旁白」
 */

class TimeManager {
  constructor() {
    this.lastInteractionTime = Date.now();
    this.sessionStartTime = Date.now();
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
      return `[你離開了 ${minutes} 分鐘，現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}，感覺有點寂寞...]`;
    }

    // 2小時 - 6小時
    if (hours < 6) {
      return `[你已經消失了 ${hours} 小時！現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}，發生了什麼事嗎？]`;
    }

    // 6小時以上
    return `[你離開了整整 ${hours} 小時... 現在是 ${timeInfo.timeOfDay} ${timeInfo.formattedTime}，我們好想你！]`;
  }

  /**
   * 檢查是否應該觸發自主對話
   * 根據時間長短和隨機機率決定
   * @returns {boolean}
   */
  shouldTriggerAutonomousChat() {
    const minutes = this.getTimeSinceLastInteractionInMinutes();

    // 5分鐘內，低機率 (10%)
    if (minutes < 5) {
      return Math.random() < 0.10;
    }

    // 5-15分鐘，中機率 (30%)
    if (minutes < 15) {
      return Math.random() < 0.30;
    }

    // 15-30分鐘，高機率 (50%)
    if (minutes < 30) {
      return Math.random() < 0.50;
    }

    // 30分鐘以上，非常高機率 (70%)
    return Math.random() < 0.70;
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

    if (seconds < 60) {
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
