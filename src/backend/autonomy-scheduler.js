const RANGES = { lively: [30, 60], normal: [60, 120], quiet: [180, 300] };

/** Schedule a bounded conversation, instead of repeatedly rolling a low probability. */
class AutonomyScheduler {
  constructor({ now = Date.now, random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.enabled = true;
    this.frequency = 'normal';
    this.lastUserAt = -Infinity;
    this.reschedule();
  }
  configure(settings) {
    const frequency = Object.hasOwn(RANGES, settings.chatFrequency) ? settings.chatFrequency : 'normal';
    const enabled = settings.autonomous !== false;
    const changed = frequency !== this.frequency || enabled !== this.enabled;
    this.frequency = frequency;
    this.enabled = enabled;
    if (changed) this.reschedule();
  }
  reschedule() {
    const [min, max] = RANGES[this.frequency];
    this.nextAt = this.now() + Math.round(min + this.random() * (max - min)) * 1000;
  }
  userInteracted() { this.lastUserAt = this.now(); }
  snapshot({ busy = false, paused = false, chatting = false } = {}) {
    const nextInSeconds = Math.max(0, Math.ceil((Math.max(this.nextAt, this.lastUserAt + 30000) - this.now()) / 1000));
    const state = paused ? 'paused' : chatting ? 'chatting' : !this.enabled ? 'disabled' : busy ? 'busy' : 'waiting';
    return { state, nextInSeconds, frequency: this.frequency };
  }
  claim(context) {
    const state = this.snapshot(context);
    if (state.state !== 'waiting' || state.nextInSeconds > 0) return false;
    this.reschedule();
    return true;
  }
}
module.exports = AutonomyScheduler;
