// Opt-in live local model test. Never runs during the normal unit test suite.
// Only the exact read-only `ver` command can be approved by this test harness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AgentManager = require('../src/backend/agent-manager');
const TimeManager = require('../src/backend/time-manager');
const report = [];
const directory = path.join(__dirname, '../tmp/gemma-review');
fs.mkdirSync(directory, { recursive: true });
function createAgent() {
  const controller = new AbortController();
  const commands = [];
  let agent;
  const window = {
    isDestroyed: () => false,
    webContents: { send(channel, data) {
      if (channel === 'request-confirmation' && data) {
        commands.push(data.command);
        agent.handleUserConfirmation(data.requestId, /^\s*ver\s*$/i.test(data.command));
      }
    } }
  };
  agent = new AgentManager(new TimeManager(), window);
  agent.mode = 'local';
  agent.beginTask(controller.signal);
  agent.onTaskStatus = state => console.log(JSON.stringify({ status: state.status, provider: state.provider, model: state.model }));
  return { agent, controller, commands };
}
async function scenario(name, work) {
  const started = Date.now();
  try {
    const detail = await work();
    report.push({ name, passed: true, milliseconds: Date.now() - started, ...detail });
  } catch (error) {
    report.push({ name, passed: false, milliseconds: Date.now() - started, error: error.message });
  }
  console.log(JSON.stringify(report.at(-1)));
  fs.writeFileSync(path.join(directory, process.argv.includes('--autonomy-only') ? 'autonomy-report.json' : 'report.json'), JSON.stringify(report, null, 2));
}
(async () => {
  if (process.argv.includes('--personality-only')) {
    await scenario('Yuu responds to emotion before analysis', async () => {
      const { agent } = createAgent();
      agent.addMessage('user', '悠，我準備了很久還是沒考好。現在不想分析原因，只想跟你說一下。');
      const response = agent.extractAction(await agent.generateResponse('B', { allowTools: false })).text;
      assert.ok(response.length > 3 && response.length < 180);
      assert.doesNotMatch(response, /沒有足夠依據|首先|其次|建議你|身為|AI|系統|記憶容量/);
      return { response };
    });
    await scenario('Alpaca is sharp but supportive under pressure', async () => {
      const { agent } = createAgent();
      agent.addMessage('user', '羊駝，簡報明天早上要交，我現在才做到一半，腦袋一團亂。');
      const response = agent.extractAction(await agent.generateResponse('A', { allowTools: false })).text;
      assert.ok(response.length > 3 && response.length < 180);
      assert.doesNotMatch(response, /笨死|活該|沒救|身為|AI|系統|記憶容量/);
      return { response };
    });
    process.exitCode = report.every(item => item.passed) ? 0 : 1;
    return;
  }
  if (process.argv.includes('--autonomy-only')) {
    await scenario('four-turn autonomous conversation', async () => {
      const { agent, commands } = createAgent();
      const transcript = [];
      agent.onResponse = response => { transcript.push(response); console.log(JSON.stringify({ turn: transcript.length, agent: response.agent, message: response.message })); };
      const responses = await agent.handleAutonomousChat();
      assert.equal(responses.length, 4);
      assert.equal(commands.length, 0);
      assert.notEqual(responses[0].agent, responses[1].agent);
      assert.equal(responses[0].agent, responses[2].agent);
      assert.equal(responses[1].agent, responses[3].agent);
      assert.ok(responses.every(response => response.message?.length > 3));
      assert.ok(responses.every(response => !/(啥|挺|唄|咋|咱們|搞點)/.test(response.message)), 'Conversation used out-of-character regional wording');
      return { transcript };
    });
    process.exitCode = report.every(item => item.passed) ? 0 : 1;
    return;
  }
  await scenario('local conversation', async () => {
    const { agent } = createAgent();
    agent.addMessage('user', '悠，今天我有點累。請用繁體中文簡短回覆，不需要操作電腦。');
    const raw = await agent.generateResponse('B', { allowTools: false });
    const response = agent.extractAction(raw);
    assert.ok(response.text?.length > 3);
    assert.doesNotMatch(response.text, /<think>|<tool_call>|execute_terminal_command/);
    return { model: agent.models.chat, action: response.action, response: response.text };
  });
  await scenario('read-only ver tool round trip without approval', async () => {
    const { agent, commands } = createAgent();
    const responses = await agent.handleUserInput('悠，請查詢這台電腦的 Windows 版本。這是唯讀測試，只允許執行 cmd 的 ver 指令，不需要其他操作。');
    assert.equal(commands.length, 0, 'Read-only version query prompted for approval');
    assert.equal(agent.task.results.size, 1);
    assert.match([...agent.task.results.values()][0], /Windows/);
    assert.ok(responses[0]?.message.length > 3);
    return { commands, response: responses[0].message };
  });
  await scenario('in-flight local request cancellation', async () => {
    const { agent, controller } = createAgent();
    agent.addMessage('user', '請用繁體中文寫一段長故事。');
    const pending = agent.generateResponse('B', { allowTools: false });
    const timer = setTimeout(() => controller.abort(new Error('live-test-cancelled')), 100);
    try { await assert.rejects(pending, /live-test-cancelled/); }
    finally { clearTimeout(timer); }
    assert.equal(agent.pendingToolCalls.size, 0);
    return { cancelled: true };
  });
  process.exitCode = report.every(item => item.passed) ? 0 : 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
