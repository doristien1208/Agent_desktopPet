const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const path = require('node:path');
const TaskQueue = require('../src/backend/task-queue');
const Preferences = require('../src/backend/preferences');
const { fitBounds } = require('../src/backend/window-layout');
const findOllamaExecutable = require('../src/backend/ollama-executable');

// Load the real class without dotenv, real API credentials, network or shell access.
function makeAgent() {
  const box = { module: { exports: {} }, process: { env: {} }, console: { log() {}, warn() {}, error() {} },
    AbortSignal, AbortController, setTimeout, clearTimeout, TextDecoder,
    require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'groq-sdk') return class { constructor() { throw Error('Unexpected cloud initialization'); } };
      if (name === 'crypto') return require('node:crypto');
      if (name === 'node:os') return require('node:os');
      if (name === 'node:path') return require('node:path');
      if (name === './file-search') return require('../src/backend/file-search');
      throw Error('Unexpected dependency: ' + name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/backend/agent-manager.js'), 'utf8'), box);
  const events = [];
  const window = { isDestroyed: () => false, webContents: { send: (channel, value) => events.push({ channel, value }) } };
  const time = { getTimeContext: () => '', updateLastInteraction() {} };
  const agent = new box.module.exports(time, window);
  const controller = new AbortController();
  agent.beginTask(controller.signal);
  return { agent, controller, events };
}
const tool = command => ({ tool_calls: [{ id: '1', function: { name: 'execute_terminal_command', arguments: JSON.stringify({ command }) } }] });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('file location and legacy dir queries require no approval or shell execution', async () => {
  const { agent, events } = makeAgent();
  agent.executeCommand = () => assert.fail('read query reached shell');
  agent.readDirectories = async () => [{ matches: [], skipped: 1, warnings: [{ code: 'EACCES' }] }];
  const found = await agent.handleToolCalls('A', { tool_calls: [{ id: 'find', function: { name: 'find_files', arguments: JSON.stringify({ query: 'ACT' }) } }] });
  assert.equal(JSON.parse(found[0].content)[0].matches.length, 0);
  await agent.handleToolCalls('A', tool('dir /s /b'));
  await agent.handleToolCalls('A', tool('ver'));
  assert.equal(agent.task.commandAttempted, false);
  assert.equal(events.length, 0);
  assert.doesNotThrow(() => agent.assertRetryAllowed(Error('model failed after read')));
});

test('read-only validation failures return to the model for correction', async () => {
  const { agent } = makeAgent();
  agent.readDirectories = async () => { throw Error('invalid roots'); };
  const result = await agent.handleToolCalls('A', tool('dir /s'));
  assert.equal(JSON.parse(result[0].content).error, 'invalid roots');
  assert.equal(agent.task.commandAttempted, false);
});

test('location answers use observed paths even when the model invents a different directory', () => {
  const { agent } = makeAgent();
  agent.addMessage('user', '請幫我找act log的檔案放在哪裡');
  agent.task.fileSearchResults.push({ matches: [{ path: path.join('C:\\ACT', 'real.log'), type: 'file' }], skipped: 0, truncated: false });
  const answer = agent.formatFileLocations('C:\\invented\\wrong.log');
  assert.match(answer, /real\.log/);
  assert.doesNotMatch(answer, /invented|wrong/);
  agent.task.commandAttempted = true;
  assert.equal(agent.formatFileLocations('approved command result'), 'approved command result');
});

test('Ollama connection errors remain distinguishable from command failures', async () => {
  const { agent } = makeAgent();
  agent.ollama.chat.completions.create = async () => { throw Error('fetch failed'); };
  await assert.rejects(agent.requestCompletion(agent.ollama, 'gemma4:latest', {}), error => /無法連線到 Ollama/.test(error.userMessage));
});

test('local file results are never retried or uploaded through cloud fallback', async () => {
  const { agent } = makeAgent();
  agent.mode = 'mixed';
  agent.groq = {};
  agent.task.results.set('find_files:test', 'private local path');
  agent.runConversation = async client => {
    assert.equal(client, agent.ollama);
    throw Error('local model failed after search');
  };
  await assert.rejects(agent.runToolFlow('A'), error => error.toolFlowFailed === true);
  agent.task.provider = 'Groq';
  await assert.rejects(agent.handleToolCalls('A', tool('dir')), /只交由本機模型/);
});

test('local tool answers and their follow-ups are omitted from later cloud history', () => {
  const { agent } = makeAgent();
  agent.addMessage('user', 'Find log files');
  agent.task.commands = 1;
  agent.addMessage('agent_a', 'private-path-one');
  assert.equal(agent.sharedHistory.at(-1).localOnly, true);
  agent.beginTask(new AbortController().signal);
  assert.ok(agent.getMessages('A').some(message => message.content.includes('private-path-one')));
  agent.addMessage('agent_b', 'private-path-followup');
  const cloud = JSON.stringify(agent.getMessages('A', { cloud: true }));
  assert.doesNotMatch(cloud, /private-path/);
  assert.match(cloud, /Find log files/);
});

test('finds an installed Ollama executable even when PATH is stale', () => {
  const installed = 'C:\\Users\\tester\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
  assert.equal(findOllamaExecutable({ LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' }, candidate => candidate === installed, 'win32'), installed);
  assert.equal(findOllamaExecutable({}, () => false, 'win32'), 'ollama');
  assert.equal(findOllamaExecutable({}, () => false, 'linux'), 'ollama');
});

test('unsafe shell strings, including former whitelist bypasses, require approval', async () => {
  const { agent } = makeAgent();
  for (const command of ['type .env', 'ipconfig /release', 'powershell -Command "Get-Item $(Write-Output probe)"', 'dir & del file']) {
    agent.beginTask(new AbortController().signal);
    const pending = agent.handleToolCalls('A', tool(command));
    assert.equal(agent.pendingToolCalls.size, 1);
    agent.handleUserConfirmation([...agent.pendingToolCalls.keys()][0], false);
    await assert.rejects(pending, /拒絕/);
  }
  assert.equal(agent.groq, null, 'local startup needs no Groq key');
});
test('approved command executes once; identical tool calls reuse its recorded result', async () => {
  const { agent } = makeAgent();
  let executions = 0;
  agent.executeCommand = async () => { executions++; return 'ok'; };
  const response = agent.handleToolCalls('A', tool('example-command'));
  assert.equal(executions, 0);
  const id = [...agent.pendingToolCalls.keys()][0];
  assert.equal(agent.handleUserConfirmation(id, true), true);
  await response;
  await agent.handleToolCalls('B', tool('example-command'));
  assert.equal(executions, 1);
  assert.equal(agent.handleUserConfirmation(id, true), false, 'stale approval is rejected');
});
test('rejection terminates the task and cannot be retried through another provider', async () => {
  const { agent } = makeAgent();
  agent.executeCommand = async () => { throw Error('must not execute'); };
  const result = agent.handleToolCalls('A', tool('example-command'));
  agent.handleUserConfirmation([...agent.pendingToolCalls.keys()][0], false);
  await assert.rejects(result, /拒絕/);
  assert.throws(() => agent.assertRetryAllowed(Error('rejected')), /rejected/);
});
test('cancellation dismisses pending confirmation and rejects stale approval', async () => {
  const { agent, controller, events } = makeAgent();
  const result = agent.handleToolCalls('A', tool('example-command'));
  const id = [...agent.pendingToolCalls.keys()][0];
  controller.abort(Error('cancelled'));
  await assert.rejects(result, /cancelled/);
  assert.equal(agent.pendingToolCalls.size, 0);
  assert.equal(agent.handleUserConfirmation(id, true), false);
  assert.equal(events.at(-1).value, null);
});
test('a failure after command execution never starts a second provider', async () => {
  const { agent } = makeAgent();
  let fallback = false;
  agent.groq = {};
  agent.runConversation = async client => {
    if (client === agent.groq) fallback = true;
    agent.task.commandAttempted = true;
    throw Error('provider disconnected after command');
  };
  await assert.rejects(agent.runToolFlow('A'), error => /避免重複操作/.test(error.userMessage) && /provider disconnected/.test(error.message));
  assert.equal(fallback, false);
});
test('local mode blocks cloud even if credentials exist and local request fails', async () => {
  const { agent } = makeAgent();
  agent.mode = 'local';
  let cloud = false;
  agent.groq = { chat: { completions: { create: async () => { cloud = true; } } } };
  agent.chatCompletion = async () => { throw Error('local unavailable'); };
  await assert.rejects(agent.generateResponse('A'), /local unavailable/);
  await assert.rejects(agent.requestCompletion(agent.groq, 'test', {}), /禁止雲端/);
  assert.equal(cloud, false);
});
test('provider calls receive an abortable signal and task rounds are bounded', async () => {
  const { agent, controller } = makeAgent();
  agent.ollama.chat.completions.create = ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const pending = agent.requestCompletion(agent.ollama, 'test', {});
  controller.abort(Error('stop network'));
  await assert.rejects(pending, /stop network/);
  const next = makeAgent().agent;
  next.task.rounds = 12;
  await assert.rejects(next.runConversation(next.ollama, 'test', 'A'), /回合上限/);
});
test('unexpected tool calls are blocked when tools are disabled', async () => {
  const { agent } = makeAgent();
  agent.chatCompletion = async () => tool('example-command');
  await assert.rejects(agent.runConversation(agent.ollama, 'test', 'A', [], false), /已阻擋/);
  assert.equal(agent.pendingToolCalls.size, 0);
});
test('only the first speaker may operate the computer for a shared request', async () => {
  const { agent } = makeAgent();
  const options = [];
  agent.decideSpeaker = () => ['A', 'B'];
  agent.generateResponse = async (_speaker, value) => { options.push(value); return '完成'; };
  await agent.handleUserInput('你們幫我開啟資料夾');
  assert.equal(options[0].allowTools, true);
  assert.equal(options[1].allowTools, false);
  assert.equal(options[1].forceTool, false);
});
test('autonomous chat alternates four peer-directed replies and never enables tools', async () => {
  const { agent } = makeAgent();
  const turns = [];
  const delivered = [];
  agent.generateResponse = async (speaker, options) => {
    turns.push({ speaker, options, history: [...agent.sharedHistory] });
    return '第' + turns.length + '句';
  };
  agent.onResponse = response => delivered.push(response);
  const responses = await agent.handleAutonomousChat();
  assert.equal(responses.length, 4);
  assert.equal(delivered.length, 4);
  assert.notEqual(turns[0].speaker, turns[1].speaker);
  assert.equal(turns[0].speaker, turns[2].speaker);
  assert.equal(turns[1].speaker, turns[3].speaker);
  assert.ok(turns.every(turn => turn.options.allowTools === false));
  assert.match(turns[1].options.additionalMessages[0].content, /上一則訊息/);
  assert.match(turns[3].options.additionalMessages[0].content, /最後一句/);
  assert.match(turns[0].options.additionalMessages[0].content, /不要拿資料量、AI、系統、模型、記憶容量/);
  assert.match(turns[1].options.additionalMessages[0].content, /唯一確定的情境/);
  assert.match(turns[3].options.additionalMessages[0].content, /不要提問/);
  assert.equal(turns[1].history.at(-1).content, '第1句');
});

test('character prompts express personality through behavior without turning it into a gimmick', () => {
  const { agent } = makeAgent();
  const alpaca = agent.agents.A.systemPrompt;
  const yuu = agent.agents.B.systemPrompt;
  assert.match(alpaca, /吐槽是熟人間精準的一小句/);
  assert.match(alpaca, /嘴硬不等於否定感受/);
  assert.match(yuu, /不是分析程式、諮商師或客服/);
  assert.match(yuu, /不要永遠冷靜正確/);
  assert.ok([alpaca, yuu].every(prompt => /深層背景，不是/.test(prompt)));
});

test('response cleanup normalizes only common out-of-character regional wording', () => {
  const { agent } = makeAgent();
  assert.equal(agent.sanitizeResponse('咱們搞點啥吧，這樣挺舒服的。'), '我們找點什麼吧，這樣滿舒服的。');
  assert.equal(agent.sanitizeResponse('他挺身而出。'), '他挺身而出。');
});

test('autonomous reply cleanup removes a verbatim peer echo but keeps the new response', () => {
  const { agent } = makeAgent();
  assert.equal(agent.removeRepeatedPeerText('先休息一下。\n\n好，我陪你。', '先休息一下。'), '好，我陪你。');
  assert.equal(agent.removeRepeatedPeerText('我也想休息。', '先休息一下。'), '我也想休息。');
});
test('cancelling an autonomous exchange stops the remaining turns', async () => {
  const { agent, controller } = makeAgent();
  let turns = 0;
  agent.generateResponse = async () => { turns++; return '你好'; };
  agent.onResponse = () => controller.abort(Error('user interrupted'));
  await assert.rejects(agent.handleAutonomousChat(), /user interrupted/);
  assert.equal(turns, 1);
});
test('Windows command runner supports successful queries and aborts a waiting child tree', { skip: process.platform !== 'win32' }, async () => {
  const run = require('../src/backend/command-runner');
  const controller = new AbortController();
  assert.match(await run('ver', controller.signal), /Windows/);
  const waiting = run('node -e "setInterval(function(){},1000)"', controller.signal);
  setTimeout(() => controller.abort(Error('test cancelled')), 300);
  await assert.rejects(waiting, /test cancelled/);
});
test('queue serializes user work and skips autonomous work while busy', async () => {
  const queue = new TaskQueue();
  const order = [];
  let release;
  const first = queue.enqueue(async () => { order.push('first'); await new Promise(resolve => { release = resolve; }); order.push('first done'); });
  const second = queue.enqueue(async () => order.push('second'));
  assert.equal(await queue.enqueue(() => { throw Error('must skip'); }, { background: true }), false);
  assert.deepEqual(order, ['first']);
  release();
  await Promise.all([first, second]);
  await queue.whenIdle();
  assert.deepEqual(order, ['first', 'first done', 'second']);
});
test('cancelling queue aborts active work, drops pending work, and allows subsequent work', async () => {
  const queue = new TaskQueue();
  const first = queue.enqueue(signal => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
  const next = queue.enqueue(() => assert.fail('cancelled pending work ran'));
  const settled = Promise.allSettled([first, next]);
  queue.cancel();
  assert.deepEqual((await settled).map(item => item.status), ['rejected', 'rejected']);
  await queue.whenIdle();
  assert.equal(await queue.enqueue(async () => 42), 42);
});
test('window is constrained to small work areas and negative-coordinate monitors', () => {
  assert.deepEqual(fitBounds({ x: 10000, y: -900 }, { x: -1280, y: 40, width: 1280, height: 680 }), { x: -440, y: 40, width: 440, height: 680 });
  assert.deepEqual(fitBounds(null, { x: 40, y: 10, width: 320, height: 480 }), { x: 40, y: 10, width: 320, height: 480 });
});
test('history is opt-in, bounded, survives restart, and is erased from disk when disabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-test-'));
  try {
    const prefs = new Preferences(dir);
    prefs.history = [{ id: 1, role: 'user', content: 'private', timestamp: new Date().toISOString() }];
    prefs.save();
    assert.deepEqual(new Preferences(dir).history, []);
    prefs.settings.rememberHistory = true;
    prefs.history = Array.from({ length: 250 }, (_, id) => ({ id, role: 'user', content: 'hello', timestamp: new Date().toISOString() }));
    prefs.save();
    assert.equal(new Preferences(dir).history.length, 200);
    prefs.settings.rememberHistory = false;
    prefs.save();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'desktop-pet.json'), 'utf8')).history, []);
  } finally {
    // Only known files within the newly-created test directory are removed.
    fs.unlinkSync(path.join(dir, 'desktop-pet.json'));
    fs.rmdirSync(dir);
  }
});
