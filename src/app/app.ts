import { Component, signal, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { ElectronService, AgentResponse, ChatMessage, Confirmation, Settings, TaskState } from './core/services/electron.service';

const ACTIONS = ['idle', 'run-left', 'run-right', 'wave', 'jump', 'sleepy', 'ponder', 'think', 'talk', 'daze', 'annoyed'];
@Component({ selector: 'app-root', templateUrl: './app.html', standalone: false, styleUrl: './app.css' })
export class App implements OnInit, OnDestroy {
  @ViewChild('messageList') messageList?: ElementRef<HTMLElement>;
  @ViewChild('composer') composer?: ElementRef<HTMLTextAreaElement>;
  readonly messages = signal<ChatMessage[]>([]);
  readonly settings = signal<Settings>({ mode: 'mixed', autonomous: true, chatFrequency: 'normal', rememberHistory: false });
  readonly task = signal<TaskState>({ busy: false, queued: 0, status: '準備好了', provider: '', model: '' });
  readonly chatOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly input = signal('');
  readonly unread = signal(0);
  readonly newMessages = signal(0);
  readonly error = signal('');
  readonly ready = signal(false);
  readonly confirm = signal<Confirmation | null>(null);
  readonly bubble = signal<AgentResponse | null>(null);
  readonly agentBAction = signal('idle');
  readonly clearing = signal(false);
  readonly availability = signal({ nvidia: false, groq: false });
  private subscriptions: (() => void)[] = [];
  private bubbleQueue: AgentResponse[] = [];
  private bubbleTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setInterval>;
  private variationTimer?: ReturnType<typeof setTimeout>;
  private bubbleDeadline = 0;
  private bubbleRemaining = 8000;
  private bubblePaused = false;
  private pauseReasons = new Set<string>();
  private lastInteractive = false;
  private dragStart?: { x: number; y: number; moved: boolean };
  private followLatest = true;
  private destroyed = false;
  private previousFocus?: HTMLElement;
  constructor(readonly electron: ElectronService) {}

  async ngOnInit() {
    this.subscriptions.push(
      this.electron.subscribe<ChatMessage[]>('onHistory', history => this.setHistory(history)),
      this.electron.subscribe<AgentResponse>('onResponse', response => this.receive(response)),
      this.electron.subscribe<TaskState>('onTask', state => {
        this.task.set(state);
        if (!state.busy && !this.bubble()) this.agentBAction.set('idle');
      }),
      this.electron.subscribe<{agent: string; status: string}>('onStatus', status => {
        if (status.agent === 'B') this.agentBAction.set('think');
      }),
      this.electron.subscribe<Confirmation | null>('onConfirmation', request => {
        if (request) this.previousFocus = document.activeElement as HTMLElement;
        this.confirm.set(request);
        this.setInteractive(true);
        requestAnimationFrame(() => {
          if (request) document.getElementById('reject-command')?.focus();
          else { this.previousFocus?.focus(); this.updateInteractionFromPointer(); }
        });
      })
    );
    document.addEventListener('pointermove', this.pointerMove);
    document.addEventListener('pointerleave', this.pointerLeave);
    document.addEventListener('keydown', this.keydown);
    window.addEventListener('blur', this.endDrag);
    if (this.electron.api) {
      try {
        const state = await this.electron.api.bootstrap();
        if (this.destroyed) return;
        this.settings.set(state.settings);
        this.messages.set(state.history);
        this.task.set(state.task);
        this.availability.set(state.availability);
        this.ready.set(true);
      } catch { this.error.set('無法連線到桌寵，請重新啟動。'); }
    } else this.error.set('這是瀏覽器預覽；對話與桌面操作需在 Electron 中使用。');
    this.idleTimer = setInterval(() => {
      if (this.task().busy || this.bubble() || this.agentBAction() !== 'idle') return;
      if (Math.random() < 0.25) {
        this.agentBAction.set(Math.random() < 0.5 ? 'ponder' : 'daze');
        this.variationTimer = setTimeout(() => {
          if (!this.task().busy && !this.bubble()) this.agentBAction.set('idle');
        }, 4000);
      }
    }, 12000);
  }
  name(role: string): string {
    return ({ user: '你', agent_a: '羊駝', agent_b: '悠', A: '羊駝', B: '悠', system: '系統' } as Record<string, string>)[role] || '系統';
  }
  preview(text: string): string {
    const chars = Array.from(text.replace(/\s+/g, ' ').trim());
    return chars.slice(0, 64).join('') + (chars.length > 64 ? '…' : '');
  }
  private setHistory(history: ChatMessage[]) {
    const changed = history.at(-1)?.id !== this.messages().at(-1)?.id;
    this.messages.set(history.slice(-200));
    if (!history.length) { this.clearBubbles(); this.newMessages.set(0); this.unread.set(0); }
    if (this.chatOpen() && this.followLatest) requestAnimationFrame(() => this.scrollLatest());
    else if (changed && this.chatOpen()) this.newMessages.update(n => n + 1);
  }
  receive(response: AgentResponse) {
    if (!['A', 'B'].includes(response.agent)) return;
    if (this.chatOpen()) { this.agentBAction.set('idle'); return; }
    this.unread.update(n => n + 1);
    this.bubbleQueue.push(response);
    this.bubbleQueue = this.bubbleQueue.slice(-20);
    if (!this.bubble()) this.nextBubble();
  }
  private nextBubble() {
    clearTimeout(this.bubbleTimer);
    const message = this.bubbleQueue.shift() || null;
    this.bubble.set(message);
    this.bubbleRemaining = 8000;
    this.bubblePaused = false;
    this.pauseReasons.clear();
    this.agentBAction.set(message?.agent === 'B' ? (ACTIONS.includes(message.action || '') ? message.action! : 'talk') : 'idle');
    if (message) this.resumeBubble();
    this.refreshInteraction();
  }
  pauseBubble(reason = 'hover') {
    this.pauseReasons.add(reason);
    if (this.bubblePaused) return;
    this.bubblePaused = true;
    this.bubbleRemaining = Math.max(0, this.bubbleDeadline - Date.now());
    clearTimeout(this.bubbleTimer);
  }
  resumeBubble(reason = 'hover') {
    this.pauseReasons.delete(reason);
    if (this.pauseReasons.size) return;
    if (!this.bubble()) return;
    clearTimeout(this.bubbleTimer);
    this.bubblePaused = false;
    this.bubbleDeadline = Date.now() + this.bubbleRemaining;
    this.bubbleTimer = setTimeout(() => this.nextBubble(), this.bubbleRemaining);
  }
  private clearBubbles() { clearTimeout(this.bubbleTimer); this.bubbleQueue = []; this.bubble.set(null); this.pauseReasons.clear(); this.agentBAction.set('idle'); this.refreshInteraction(); }
  openChat() {
    this.chatOpen.set(true); this.settingsOpen.set(false); this.unread.set(0); this.clearBubbles();
    requestAnimationFrame(() => { this.scrollLatest(); this.composer?.nativeElement.focus(); });
  }
  closeChat() { this.chatOpen.set(false); this.settingsOpen.set(false); this.refreshInteraction(); }
  toggleSettings() { this.settingsOpen.update(value => !value); this.refreshInteraction(); }
  private refreshInteraction() { requestAnimationFrame(() => { if (!this.destroyed) this.updateInteractionFromPointer(); }); }
  onScroll() {
    const el = this.messageList?.nativeElement;
    if (el) this.followLatest = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (this.followLatest) this.newMessages.set(0);
  }
  scrollLatest() {
    const el = this.messageList?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
    this.followLatest = true; this.newMessages.set(0);
  }
  onInputKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); this.sendMessage();
    }
  }
  async sendMessage() {
    const text = this.input().trim();
    if (!text || !this.ready() || this.clearing()) return;
    try {
      await this.electron.api!.sendMessage(text);
      this.input.set(''); this.error.set(''); this.scrollLatest();
    } catch { this.error.set('訊息未送出，請稍後重試。'); }
  }
  async stop() { await this.electron.api?.cancel(); }
  async chatNow() {
    try { await this.electron.api?.chatNow(); }
    catch { this.error.set('目前有任務進行中，請稍後再讓他們聊天。'); }
  }
  async clearHistory() {
    this.clearing.set(true);
    try { await this.electron.api?.clearHistory(); this.clearBubbles(); }
    catch { this.error.set('清除失敗，請稍後再試。'); }
    finally { this.clearing.set(false); }
  }
  async updateSettings(patch: Partial<Settings>) {
    try {
      const value = await this.electron.api?.settings({ ...this.settings(), ...patch });
      if (value) this.settings.set(value);
    } catch { this.error.set('請先停止目前任務再變更設定。'); }
  }
  async decide(approved: boolean) {
    const request = this.confirm();
    if (!request) return;
    try {
      const accepted = await this.electron.api?.confirm(request.requestId, approved);
      if (!accepted) this.error.set('此確認已失效，指令不會因此執行。');
    } catch { this.error.set('無法送出確認。'); }
  }
  startDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    this.dragStart = { x: event.clientX, y: event.clientY, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  dragMove(event: PointerEvent) {
    if (!this.dragStart || this.dragStart.moved) return;
    if (Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y) > 5) {
      this.dragStart.moved = true;
      this.electron.api?.drag('start');
    }
  }
  finishDrag() {
    const click = this.dragStart && !this.dragStart.moved;
    this.endDrag();
    if (click) this.openChat();
  }
  cancelDrag() { this.endDrag(); }
  private endDrag = () => { if (this.dragStart?.moved) this.electron.api?.drag('end'); this.dragStart = undefined; this.refreshInteraction(); };
  private pointer = { x: -1, y: -1 };
  private pointerMove = (event: PointerEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY };
    this.updateInteractionFromPointer();
  };
  private updateInteractionFromPointer() {
    const element = document.elementFromPoint(this.pointer.x, this.pointer.y);
    this.setInteractive(Boolean(this.confirm() || this.dragStart || element?.closest('[data-interactive]')));
  }
  private pointerLeave = () => { if (!this.dragStart) this.setInteractive(false); };
  private setInteractive(value: boolean) {
    if (value === this.lastInteractive) return;
    this.lastInteractive = value; this.electron.api?.setInteractive(value);
  }
  private keydown = (event: KeyboardEvent) => {
    if (this.confirm()) {
      if (event.key === 'Escape') { event.preventDefault(); this.decide(false); }
      if (event.key === 'Tab') {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.confirm-dialog button'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    } else if (event.key === 'Escape') { this.settingsOpen.set(false); this.closeChat(); }
  };
  ngOnDestroy() {
    this.destroyed = true;
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    clearTimeout(this.bubbleTimer); clearTimeout(this.variationTimer); clearInterval(this.idleTimer);
    this.endDrag();
    document.removeEventListener('pointermove', this.pointerMove);
    document.removeEventListener('pointerleave', this.pointerLeave);
    document.removeEventListener('keydown', this.keydown);
    window.removeEventListener('blur', this.endDrag);
  }
}
