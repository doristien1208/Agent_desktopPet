const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(__dirname, '../../tmp/console-review'));
app.whenReady().then(() => {
  console.log('[Ollama] 伺服器就緒，對話模型預載完成。');
  app.quit();
});
