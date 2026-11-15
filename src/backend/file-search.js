const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const SKIP = new Set(['node_modules', '.git', '.codex', 'cache', 'caches', 'code cache', 'gpucache']);
function defaultRoots() {
  const home = os.homedir();
  return [...new Set([path.join(home, 'Desktop'), path.join(home, 'Documents'), path.join(home, 'Downloads'),
    process.env.APPDATA || path.join(home, 'AppData', 'Roaming')])];
}
function searchable(value) {
  // Match acronyms such as ACT against a discovered "Advanced Combat Tracker" folder.
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2');
  const initials = words.split(/[\\/]/).map(segment => (segment.match(/[A-Za-z]+/g) || []).map(word => word[0]).join('')).join(' ');
  return (words + ' ' + initials).normalize('NFKC').toLowerCase();
}
function matchesTerm(value, term) {
  if (!/^[a-z]{1,3}$/.test(term)) return value.includes(term);
  // Short words/acronyms must not match the middle of "Abstract" or "Character".
  return value.split(/[^a-z0-9]+/).some(word => word === term || word === term + 's' || new RegExp('^' + term + '\\d+$').test(word));
}
async function findFiles(args, signal, options = {}) {
  signal.throwIfAborted();
  if (!args || typeof args.query !== 'string' || args.query.length > 200) throw new Error('搜尋字詞須為 200 字以內的文字。');
  const roots = args.roots === undefined ? (options.defaultRoots || defaultRoots()) : args.roots;
  if (!Array.isArray(roots) || !roots.length || roots.length > 8 || roots.some(root => typeof root !== 'string' || !path.isAbsolute(root) || /^[\\/]{2}/.test(root))) {
    throw new Error('搜尋範圍須為 1–8 個本機絕對路徑，不支援網路路徑。');
  }
  if (args.pattern !== undefined && (typeof args.pattern !== 'string' || args.pattern.length > 100 || /[\\/]/.test(args.pattern))) throw new Error('檔名樣式不合法。');
  if (args.recursive !== undefined && typeof args.recursive !== 'boolean') throw new Error('recursive 必須為布林值。');
  const terms = args.query.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
  const pattern = args.pattern ? new RegExp('^' + args.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
  const queue = roots.map(root => ({ directory: path.resolve(root), depth: 0 }));
  const matches = [];
  const warnings = [];
  const seen = new Set();
  const started = Date.now();
  let visited = 0;
  let skipped = 0;
  let truncated = false;
  let index = 0;
  const reader = options.fs || fs;
  while (index < queue.length) {
    signal.throwIfAborted();
    if (visited >= (options.maxEntries || 40000) || Date.now() - started > (options.maxMilliseconds || 15000) || matches.length >= 40) { truncated = true; break; }
    const { directory, depth } = queue[index++];
    const key = directory.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let entries;
    try { entries = await reader.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (warnings.length < 5) warnings.push({ path: directory, code: error.code || 'READ_ERROR' }); skipped++; continue; }
    for (const entry of entries) {
      signal.throwIfAborted();
      if (++visited > (options.maxEntries || 40000) || matches.length >= 40) { truncated = true; break; }
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { skipped++; continue; }
      const isDirectory = entry.isDirectory();
      const searchablePath = searchable(fullPath);
      if (terms.every(term => matchesTerm(searchablePath, term)) && (!pattern || pattern.test(entry.name))) {
        matches.push({ path: fullPath, type: isDirectory ? 'directory' : 'file' });
      }
      if (isDirectory && args.recursive !== false && depth < 10 && !SKIP.has(entry.name.toLowerCase())) queue.push({ directory: fullPath, depth: depth + 1 });
      else if (isDirectory && args.recursive !== false) skipped++;
    }
  }
  return { matches, roots, visited, skipped, truncated, warnings,
    note: matches.length ? '以下是實際找到的路徑，未讀取檔案內容。' : '在此次搜尋範圍內沒有命中；可拆開關鍵字或改查其他目錄。',
    scope: '只查指定／常用目錄，略過連結、快取與過深目錄；不代表已搜尋整台電腦。' };
}

/** Translate a strictly limited legacy dir query to the native reader. Never eval it. */
function parseReadOnlyCommand(command, env = process.env, cwd = process.cwd()) {
  if (typeof command !== 'string') return null;
  const cmd = command.trim();
  if (/^ver$/i.test(cmd)) return { kind: 'version' };
  if (!/^dir(?:\s|$)/i.test(cmd) || /[&|;><^`$()\r\n\0']/.test(cmd)) return null;
  const tokens = cmd.match(/"[^"\r\n]*"|[^\s"]+/g);
  if (!tokens || (cmd.match(/"/g) || []).length % 2) return null;
  let recursive = false;
  const paths = [];
  for (const token of tokens.slice(1)) {
    if (/^\/(b|s|a)$/i.test(token)) { if (/^\/s$/i.test(token)) recursive = true; continue; }
    if (token.startsWith('/')) return null;
    let value = token.replace(/^"|"$/g, '');
    value = value.replace(/%(USERPROFILE|APPDATA|LOCALAPPDATA)%/gi, (match, name) => env[name.toUpperCase()] || match);
    if (value.includes('%') || /^[\\/]{2}/.test(value)) return null;
    paths.push(value);
  }
  if (paths.length > 8) return null;
  const searches = (paths.length ? paths : [cwd]).map(value => {
    const absolute = path.resolve(cwd, value);
    const basename = path.basename(absolute);
    const glob = /[*?]/.test(basename);
    const root = glob ? path.dirname(absolute) : absolute;
    if (/[*?]/.test(root)) return null;
    return { query: '', roots: [root], recursive, ...(glob ? { pattern: basename === '*.*' ? '*' : basename } : {}) };
  });
  return searches.every(Boolean) ? { kind: 'directory', searches } : null;
}
module.exports = { findFiles, parseReadOnlyCommand };
