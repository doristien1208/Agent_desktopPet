const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

test('all supported Windows launchers select UTF-8 before starting Electron', () => {
  const pkg = require('../package.json');
  for (const name of ['electron', 'electron:dev', 'electron:build']) {
    assert.match(pkg.scripts[name], /^chcp 65001 >nul && /);
  }
  const batch = fs.readFileSync(path.join(__dirname, '../start.cmd'), 'utf8');
  assert.ok(batch.indexOf('chcp 65001 >nul') < batch.indexOf('node node_modules'));
  assert.match(batch, /chcp 65001 >nul/);
});
test('Electron Chinese console output survives the UTF-8 launch command', { skip: process.platform !== 'win32' }, () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = require('electron');
  const fixture = path.join(__dirname, 'fixtures/console-utf8.cjs');
  const output = execSync(`chcp 65001 >nul && "${electron}" "${fixture}"`, {
    cwd: path.join(__dirname, '..'), env, windowsHide: true, timeout: 15000, encoding: 'buffer'
  });
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(output);
  assert.match(decoded, /\[Ollama\] 伺服器就緒，對話模型預載完成。/);
});
