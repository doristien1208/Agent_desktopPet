/** One conversation owns the shared context and confirmation dialog at a time. */
class TaskQueue {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.items = [];
    this.active = null;
    this.idleWaiters = [];
  }
  get busy() { return Boolean(this.active || this.items.length); }
  notify() { this.onChange({ busy: Boolean(this.active), queued: this.items.length }); }
  enqueue(work, { background = false } = {}) {
    if (background && this.busy) return Promise.resolve(false);
    if (this.items.length >= 10) return Promise.reject(new Error('等待中的訊息太多，請稍後再送出。'));
    const result = new Promise((resolve, reject) => this.items.push({ work, resolve, reject }));
    this.drain();
    return result;
  }
  async drain() {
    if (this.active) { this.notify(); return; }
    const item = this.items.shift();
    if (!item) return;
    const controller = new AbortController();
    this.active = controller;
    this.notify();
    try { item.resolve(await item.work(controller.signal)); }
    catch (error) { item.reject(error); }
    finally {
      this.active = null;
      this.notify();
      if (this.items.length) this.drain();
      else this.idleWaiters.splice(0).forEach(resolve => resolve());
    }
  }
  cancel() {
    const error = new Error('已停止；尚未開始的訊息也已取消。已完成的電腦操作不會自動復原。');
    error.name = 'AbortError';
    this.items.splice(0).forEach(item => item.reject(error));
    this.active?.abort(error);
    this.notify();
  }
  whenIdle() {
    return this.busy ? new Promise(resolve => this.idleWaiters.push(resolve)) : Promise.resolve();
  }
}
module.exports = TaskQueue;
