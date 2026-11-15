const fs = require('node:fs');
const path = require('node:path');

// Desktop apps may inherit an older PATH even after Ollama has been installed.
function findOllamaExecutable(env = process.env, exists = fs.existsSync, platform = process.platform) {
  if (platform === 'win32') {
    const candidates = [
      env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
      env.ProgramFiles && path.win32.join(env.ProgramFiles, 'Ollama', 'ollama.exe')
    ].filter(Boolean);
    for (const candidate of candidates) if (exists(candidate)) return candidate;
  }
  return 'ollama';
}
module.exports = findOllamaExecutable;
