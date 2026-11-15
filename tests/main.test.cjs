const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('main process initializes with secure preferences and rejects untrusted IPC', async () => {
  const handlers = new Map();
  const intervals = [];
  const work = [];
  const logs = [];
  let window;
  class Window {
    constructor(options) {
      this.options = options;
      this.webContents = { mainFrame: {}, send() {}, on() {}, setWindowOpenHandler: fn => { this.open = fn; }, session: { setPermissionRequestHandler() {} } };
      window = this;
    }
    loadURL(url) { this.url = url; }
    isDestroyed() { return false; }
    on() {}
    setIgnoreMouseEvents() {}
  }
  class Preferences {
    constructor() { this.settings = { mode: 'mixed', rememberHistory: false, autonomous: true }; this.history = []; }
    save() {}
    validate(value) { return value; }
  }
  class Agent {
    constructor() { this.groq = null; this.nvidia = null; }
    handleUserConfirmation() { return false; }
    beginTask(signal) { this.task = { signal }; }
    async handleAutonomousChat() {
      work.push('autonomous');
      await new Promise((_resolve, reject) => this.task.signal.addEventListener('abort', () => { work.push('interrupted'); reject(Error('cancelled')); }, { once: true }));
    }
    async handleUserInput() { work.push('user'); return []; }
  }
  const app = { whenReady: () => Promise.resolve(), getPath: () => 'test-only', on() {} };
  const box = { console: { log: text => logs.push(text), warn() {}, error() {} }, process: { env: {}, platform: 'win32' }, AbortSignal,
    __dirname: path.join(__dirname, '..'), setTimeout, clearTimeout,
    setInterval: callback => { intervals.push(callback); return 1; }, clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ done: true }) }), require: name => {
      if (name === 'electron') return { app, BrowserWindow: Window, ipcMain: { handle: (channel, fn) => handlers.set(channel, fn), on() {} },
        screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 40, width: 1280, height: 680 } }), on() {} },
        powerMonitor: { getSystemIdleTime: () => 0, on() {} } };
      if (name === './src/backend/preferences') return Preferences;
      if (name === './src/backend/agent-manager') return Agent;
      if (name.startsWith('./')) return require(path.join(__dirname, '..', name));
      if (name === 'child_process') return { spawn() { throw Error('must not spawn'); }, execSync() { throw Error('must not execute'); } };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), box);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.webSecurity, true);
  assert.equal(window.options.height, 680);
  assert.equal(window.options.y, 40);
  assert.equal(window.open({ url: 'https://example.invalid' }).action, 'deny');
  const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  assert.equal(handlers.get('pet:bootstrap')(trusted).settings.mode, 'mixed');
  const count = logs.length;
  for (let i = 0; i < 20; i++) intervals.forEach(callback => callback());
  assert.equal(logs.length, count, 'idle timer ticks must not spam countdown logs');
  assert.throws(() => handlers.get('pet:bootstrap')({ sender: window.webContents, senderFrame: {} }), /不允許/);
  assert.throws(() => handlers.get('pet:confirm')(trusted, { requestId: 'x', approved: 'yes' }), /格式/);
  assert.equal(handlers.get('pet:confirm')(trusted, { requestId: 'expired', approved: true }), false);
  assert.throws(() => handlers.get('pet:message')(trusted, 'x'.repeat(8001)), /8000/);
  assert.equal(handlers.get('pet:autonomy-now')(trusted), true);
  assert.equal(handlers.get('pet:bootstrap')(trusted).autonomy.state, 'chatting');
  assert.throws(() => handlers.get('pet:autonomy-now')(trusted), /忙碌/);
  assert.equal(handlers.get('pet:message')(trusted, '你好'), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(work, ['autonomous', 'interrupted', 'user']);
});
