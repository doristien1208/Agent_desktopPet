// Opt-in real model + real directory metadata test. No file contents or shell execution.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const AgentManager = require('../src/backend/agent-manager');
const TimeManager = require('../src/backend/time-manager');
const fixture = process.argv.includes('--fixture');
const report = { mode: process.argv.includes('--mixed') ? 'mixed' : 'local', fixture, query: '請幫我找act log的檔案放在哪裡', approvals: [], searches: [], providers: [] };
let agent;
const window = { isDestroyed: () => false, webContents: { send(channel, data) {
  if (channel === 'request-confirmation' && data) {
    report.approvals.push(data.command);
    agent.handleUserConfirmation(data.requestId, false);
  }
} } };
agent = new AgentManager(new TimeManager(), window);
agent.mode = report.mode;
agent.executeCommand = () => { throw Error('Live search must never execute shell commands'); };
const read = agent.readDirectories.bind(agent);
agent.readDirectories = async searches => {
  const result = fixture ? [{ matches: [{ path: 'C:\\DesktopPet-Test\\Advanced Combat Tracker\\FFXIVLogs', type: 'directory' },
    { path: 'C:\\DesktopPet-Test\\Advanced Combat Tracker\\FFXIVLogs\\Network_20260906.log', type: 'file' }],
    roots: ['C:\\DesktopPet-Test'], visited: 2, skipped: 0, truncated: false, warnings: [], note: '合成測試資料，不來自真實檔案系統。' }] : await read(searches);
  report.searches.push({ searches, result });
  return result;
};
agent.onTaskStatus = state => { if (state.provider) report.providers.push({ provider: state.provider, model: state.model }); };
agent.beginTask(new AbortController().signal);
const start = Date.now();
(async () => {
  try {
    report.responses = await agent.handleUserInput(report.query);
    assert.equal(report.approvals.length, 0, 'File location search requested shell approval');
    assert.ok(report.searches.length > 0, 'Model answered without searching');
    assert.ok(report.providers.some(item => item.provider === 'Ollama'), 'Local model never ran');
    assert.ok(report.responses[0]?.message.length > 3);
    const matches = report.searches.flatMap(item => item.result.flatMap(result => result.matches));
    if (matches.length) assert.ok(matches.some(match => report.responses.some(response => response.message.includes(match.path) ||
      (match.type === 'file' && response.message.includes(path.dirname(match.path))))), 'Model did not report any discovered path or its containing directory');
    report.passed = true;
  } catch (error) { report.passed = false; report.error = error.userMessage || error.message; process.exitCode = 1; }
  report.milliseconds = Date.now() - start;
  const output = path.join(__dirname, '../tmp/gemma-review');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, `file-search-${report.mode}${fixture ? '-fixture' : ''}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, error: report.error, mode: report.mode, milliseconds: report.milliseconds,
    approvals: report.approvals.length, searches: report.searches.length, responses: report.responses }));
})();
