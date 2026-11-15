const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { findFiles, parseReadOnlyCommand } = require('../src/backend/file-search');
const signal = () => new AbortController().signal;
const entry = (name, directory = false, link = false) => ({ name, isDirectory: () => directory, isSymbolicLink: () => link });
const root = path.resolve('tmp/search-test');

test('metadata search finds acronym paths and logs without opening file contents', async () => {
  const act = path.join(root, 'Advanced Combat Tracker');
  const log = path.join(act, 'FFXIVLogs');
  const directories = new Map([[root, [entry('Advanced Combat Tracker', true), entry('Abstract.docx'), entry('Character.png'), entry('node_modules', true), entry('junction', true, true)]],
    [act, [entry('FFXIVLogs', true)]], [log, [entry('network.log')]]]);
  const fs = { readdir: async directory => { assert.ok(directories.has(directory)); return directories.get(directory); } };
  const found = await findFiles({ query: 'ACT log', roots: [root] }, signal(), { fs });
  assert.ok(found.matches.some(match => match.path === path.join(log, 'network.log')));
  assert.equal(found.skipped, 2);
  const acronyms = await findFiles({ query: 'ACT', roots: [root] }, signal(), { fs });
  assert.ok(acronyms.matches.every(match => match.path.includes('Advanced Combat Tracker')));
  const filtered = await findFiles({ query: '', roots: [log], pattern: '*.log' }, signal(), { fs });
  assert.equal(filtered.matches.length, 1);
});

test('no hits, denied directories and bounded search are structured results', async () => {
  const fs = { readdir: async directory => {
    if (directory === root) return [entry('blocked', true), entry('a.txt')];
    throw Object.assign(Error('denied'), { code: 'EACCES' });
  } };
  const result = await findFiles({ query: 'missing', roots: [root] }, signal(), { fs });
  assert.equal(result.matches.length, 0);
  assert.equal(result.warnings[0].code, 'EACCES');
  assert.match(result.note, /此次搜尋範圍/);
  const limited = await findFiles({ query: '', roots: [root] }, signal(), { fs, maxEntries: 1 });
  assert.equal(limited.truncated, true);
  const controller = new AbortController(); controller.abort(Error('stop'));
  await assert.rejects(findFiles({ query: '', roots: [root] }, controller.signal, { fs }), /stop/);
});

test('legacy dir translation never evaluates shell, redirects, expansion or pipelines', () => {
  for (const command of ['dir & del x', 'dir | powershell.exe', 'dir > x', 'dir %UNKNOWN%', 'dir /a:d', 'dir $(x)', 'dir `x`', 'dir "x', 'type .env', 'del x', 'ver & x']) {
    assert.equal(parseReadOnlyCommand(command, {}, root), null, command);
  }
  assert.equal(parseReadOnlyCommand('ver').kind, 'version');
  const parsed = parseReadOnlyCommand('dir "%USERPROFILE%\\*.log" /s /b', { USERPROFILE: root }, root);
  assert.equal(parsed.kind, 'directory');
  assert.equal(parsed.searches[0].recursive, true);
  assert.equal(parsed.searches[0].pattern, '*.log');
});
