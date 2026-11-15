const { exec, execFile } = require('child_process');

module.exports = function runCommand(command, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let stopped = false;
    let stopReason;
    const child = exec(`chcp 65001 >nul & ${command}`, {
      windowsHide: true, maxBuffer: 2 * 1024 * 1024, encoding: 'buffer'
    }, (error, stdout, stderr) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (stopped) { reject(stopReason); return; }
      const decode = buf => {
        const utf8 = (buf || Buffer.alloc(0)).toString('utf8');
        return utf8.includes('�') ? new TextDecoder('big5').decode(buf) : utf8;
      };
      const output = decode(stdout) || decode(stderr);
      if (error) {
        reject(new Error(`指令未正常完成（${error.code ?? '未知錯誤'}）。${output.slice(0, 500)}`));
        return;
      }
      resolve(output.length > 4000 ? output.slice(0, 4000) + '\n（輸出已截短，請縮小查詢範圍。）' : output || '指令執行完成（無輸出）');
    });
    const stop = reason => {
      if (stopped) return;
      stopped = true;
      stopReason = reason;
      // Kill the shell and its attached children, not just cmd.exe.
      if (process.platform === 'win32' && Number.isInteger(child.pid)) {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => child.kill());
      } else child.kill();
    };
    const abort = () => stop(signal.reason || new Error('已停止執行。'));
    const timer = setTimeout(() => stop(new Error('指令超過 60 秒，已停止。')), 60000);
    let bytes = 0;
    const countOutput = chunk => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) stop(new Error('指令輸出超過 1 MB，已停止。請縮小查詢範圍。'));
    };
    child.stdout?.on('data', countOutput);
    child.stderr?.on('data', countOutput);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
};
