const { spawnSync } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const run = spawnSync(require('electron'), [path.join(__dirname, 'ui-smoke.cjs')], { env, windowsHide: true, stdio: 'inherit', timeout: 40000 });
if (run.error) console.error(run.error);
process.exit(run.status ?? 1);
