const fs = require('fs');
const path = require('path');

const defaults = { mode: 'mixed', autonomous: true, chatFrequency: 'normal', rememberHistory: false };
class Preferences {
  constructor(directory) {
    this.directory = directory;
    this.settings = { ...defaults };
    this.history = [];
    this.bounds = null;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(directory, 'desktop-pet.json'), 'utf8'));
      this.settings = this.validate(data.settings);
      if (data.bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(data.bounds[key])) && data.bounds.width > 0 && data.bounds.height > 0) {
        this.bounds = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(data.bounds[key])]));
      }
      if (this.settings.rememberHistory && Array.isArray(data.history)) {
        this.history = data.history.filter(m => m && typeof m.content === 'string' &&
          ['user', 'agent_a', 'agent_b', 'system'].includes(m.role)).slice(-200)
          .map((m, index) => ({ id: typeof m.id === 'string' || typeof m.id === 'number' ? m.id : `restored-${index}`,
            role: m.role, content: m.content.slice(0, 12000),
            localOnly: m.localOnly === true,
            timestamp: Number.isFinite(Date.parse(m.timestamp)) ? m.timestamp : new Date().toISOString() }));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('設定檔無法讀取，改用預設設定。');
    }
  }
  validate(value = {}) {
    return {
      mode: value.mode === 'local' ? 'local' : 'mixed',
      autonomous: typeof value.autonomous === 'boolean' ? value.autonomous : true,
      chatFrequency: ['lively', 'normal', 'quiet'].includes(value.chatFrequency) ? value.chatFrequency : 'normal',
      rememberHistory: value.rememberHistory === true
    };
  }
  save() {
    fs.mkdirSync(this.directory, { recursive: true });
    const target = path.join(this.directory, 'desktop-pet.json');
    fs.writeFileSync(target + '.tmp', JSON.stringify({ settings: this.settings, bounds: this.bounds,
      history: this.settings.rememberHistory ? this.history.slice(-200) : [] }), { mode: 0o600 });
    fs.renameSync(target + '.tmp', target);
  }
}
module.exports = Preferences;
