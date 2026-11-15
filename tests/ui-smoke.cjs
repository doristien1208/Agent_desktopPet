// Render the compiled app with the real sandboxed preload and an inert IPC backend.
// No model service, user data, credentials, or terminal commands are used.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, '../tmp/ui-review');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-test-profile'));
app.disableHardwareAcceleration();
const history = [];
const confirmed = [];
let chatNowRequests = 0;
const task = { busy: false, queued: 0, status: '準備好了', provider: '', model: '' };
ipcMain.handle('pet:bootstrap', () => ({ history, settings: { mode: 'mixed', autonomous: true, chatFrequency: 'normal', rememberHistory: false }, task, autonomy: { state: 'waiting', nextInSeconds: 90, frequency: 'normal' }, availability: { nvidia: true, groq: true } }));
ipcMain.handle('pet:autonomy-now', () => { chatNowRequests++; return true; });
ipcMain.handle('pet:message', () => true);
ipcMain.handle('pet:cancel', () => true);
ipcMain.handle('pet:clear', () => true);
ipcMain.handle('pet:settings', (_event, data) => data);
ipcMain.handle('pet:confirm', (_event, data) => { confirmed.push(data); return true; });
let window;
const evaluate = code => window.webContents.executeJavaScript(code);
const wait = async condition => {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(condition)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Timed out: ' + condition);
};
const capture = async name => {
  await new Promise(resolve => setTimeout(resolve, 100));
  const screenshot = await window.webContents.capturePage();
  fs.writeFileSync(path.join(output, name + '.png'), screenshot.toPNG());
};
const geometry = selector => evaluate(`(() => {
  const e = document.querySelector(${JSON.stringify(selector)});
  const r = e.getBoundingClientRect();
  return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height, scroll:e.scrollHeight, client:e.clientHeight, viewport:innerHeight };
})()`);
app.whenReady().then(async () => {
  window = new BrowserWindow({ width: 440, height: 760, show: false, frame: false, transparent: true,
    webPreferences: { preload: path.join(__dirname, '../preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const errors = [];
  window.webContents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
  await window.loadFile(path.join(__dirname, '../dist/browser/index.html'));
  await wait('Boolean(document.querySelector(".dock"))');
  assert.equal(await evaluate('typeof window.require'), 'undefined');
  assert.equal(await evaluate('typeof window.desktopPet.send'), 'undefined');
  assert.equal(await evaluate('document.querySelector(".autonomy-bar") === null && document.querySelector(".chat-now") === null'), true);
  const long = '這是一段很長的桌邊對話。'.repeat(100) + '\n\n最後一段完整保留。';
  history.push({ id: 'a', role: 'agent_a', content: '今天過得如何？先休息一下，我們在這裡陪你。', timestamp: new Date().toISOString() });
  window.webContents.send('history-updated', history);
  window.webContents.send('agent-response', { agent: 'A', message: history[0].content });
  window.webContents.send('agent-response', { agent: 'B', message: long });
  await wait('Boolean(document.querySelector(".speech-bubble"))');
  assert.equal(await evaluate('document.querySelectorAll(".speech-bubble").length'), 1);
  const bubble = await geometry('.speech-bubble');
  assert.ok(bubble.x >= 0 && bubble.right <= 440 && bubble.bottom <= 760);
  await capture('desktop-compact');
  await evaluate('document.querySelector(".speech-bubble").click()');
  await wait('Boolean(document.querySelector(".message-list"))');
  await evaluate('document.querySelector(".chat-now").click()');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(chatNowRequests, 1);
  history.push({ id: 'b', role: 'agent_b', content: long, timestamp: new Date().toISOString() });
  window.webContents.send('history-updated', history);
  await wait('document.querySelectorAll(".message").length === 2');
  assert.equal(await evaluate('document.querySelectorAll(".message-content")[1].textContent'), long);
  await wait('document.querySelector(".message-list").scrollTop > 0');
  await evaluate('document.querySelector(".message-list").scrollTop = 0; document.querySelector(".message-list").dispatchEvent(new Event("scroll"))');
  history.push({ id: 'c', role: 'agent_b', content: '不用急，慢慢讀。', timestamp: new Date().toISOString() });
  window.webContents.send('history-updated', history);
  await wait('Boolean(document.querySelector(".latest-button"))');
  assert.equal(await evaluate('document.querySelector(".message-list").scrollTop'), 0);
  // Use a short readable conversation for the presentation screenshot.
  window.webContents.send('history-updated', [history[0], { id: 'demo-user', role: 'user', content: '想把桌面整理一下，但今天有點累。', timestamp: new Date().toISOString() }, { id: 'demo-b', role: 'agent_b', content: '那就先留一點時間給自己吧。\n\n我們可以從一個小角落開始；等你準備好了，再一起慢慢整理。', timestamp: new Date().toISOString() }]);
  await wait('document.body.textContent.includes("今天有點累")');
  await evaluate('document.querySelector(".latest-button")?.click()');
  await wait('!document.querySelector(".latest-button")');
  await evaluate('document.querySelector(".message-list").scrollTop = 0');
  await capture('desktop-chat');
  for (const [width, height] of [[440, 600], [320, 480], [320, 360]]) {
    window.setSize(width, height);
    await new Promise(resolve => setTimeout(resolve, 100));
    const composer = await geometry('.composer');
    const list = await geometry('.message-list');
    assert.ok(composer.x >= 0 && composer.right <= width && composer.bottom <= height, JSON.stringify({ width, height, composer }));
    assert.ok(list.height >= 35, JSON.stringify({ width, height, list }));
    window.webContents.send('request-confirmation', { requestId: 'test', agent: '悠', command: '僅供測試顯示的長文字。'.repeat(150), cloud: true, expiresAt: Date.now() + 120000 });
    await wait('Boolean(document.querySelector(".confirm-dialog"))');
    const dialog = await geometry('.confirm-dialog');
    assert.ok(dialog.y >= 0 && dialog.bottom <= height);
    assert.equal(await evaluate('document.activeElement.id'), 'reject-command');
    const command = await geometry('.confirm-command');
    assert.ok(command.scroll > command.client);
    window.webContents.send('request-confirmation', null);
    await wait('!document.querySelector(".confirm-dialog")');
    await capture('chat-' + width + 'x' + height);
  }
  window.setSize(440, 760);
  window.webContents.send('request-confirmation', { requestId: 'reject-test', agent: '悠', command: '測試指令，不會執行', cloud: false, expiresAt: Date.now() + 120000 });
  await wait('Boolean(document.querySelector("#reject-command"))');
  await evaluate('document.querySelector("#reject-command").click()');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(confirmed, [{ requestId: 'reject-test', approved: false }]);
  window.webContents.send('request-confirmation', null);
  assert.deepEqual(errors, []);
  console.log('Electron UI checks passed: sandbox preload, queued bubbles, complete long text, scroll preservation, 3 small viewports, confirmation focus and rejection.');
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('UI test timeout'); app.exit(1); }, 30000).unref();
