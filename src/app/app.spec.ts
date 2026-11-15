import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { App } from './app';
import { ElectronService } from './core/services/electron.service';

describe('Desktop conversation', () => {
  let fixture: ComponentFixture<App>;
  let callbacks: Record<string, (value: any) => void>;
  let send: jasmine.Spy;
  beforeEach(async () => {
    callbacks = {};
    send = jasmine.createSpy().and.resolveTo(true);
    const service = {
      api: { bootstrap: async () => ({ history: [], settings: { mode: 'mixed', autonomous: true, chatFrequency: 'normal', rememberHistory: false }, task: { busy: false, queued: 0, status: 'ready', provider: '', model: '' }, availability: { nvidia: false, groq: false } }), sendMessage: send, setInteractive() {}, drag() {} },
      subscribe: (channel: string, callback: (value: any) => void) => { callbacks[channel] = callback; return () => {}; }
    };
    await TestBed.configureTestingModule({ imports: [CommonModule], declarations: [App], providers: [{ provide: ElectronService, useValue: service }] }).compileComponents();
    fixture = TestBed.createComponent(App);
  });
  it('keeps full multiline text in the conversation instead of the short bubble', fakeAsync(() => {
    fixture.detectChanges(); flushMicrotasks();
    const text = '很長的訊息。'.repeat(100) + '\n最後一段';
    callbacks['onHistory']([{ id: 1, role: 'agent_a', content: text, timestamp: new Date().toISOString() }]);
    callbacks['onResponse']({ agent: 'A', message: text });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bubble-text').textContent.length).toBeLessThan(100);
    fixture.componentInstance.openChat(); fixture.detectChanges(); tick(20);
    expect(fixture.nativeElement.querySelector('.message-content').textContent).toBe(text);
    fixture.destroy();
  }));
  it('serializes bubble display, pauses while reading, and ignores system messages', fakeAsync(() => {
    fixture.detectChanges(); flushMicrotasks();
    const app = fixture.componentInstance;
    app.receive({ agent: 'A', message: 'first' });
    app.receive({ agent: 'B', message: 'second' });
    app.receive({ agent: 'System', message: 'system error' });
    tick(1000); app.pauseBubble('hover'); app.pauseBubble('focus'); tick(20000);
    expect(app.bubble()?.message).toBe('first');
    app.resumeBubble('hover'); tick(1000);
    expect(app.bubble()?.message).toBe('first');
    app.resumeBubble('focus'); tick(7000);
    expect(app.bubble()?.message).toBe('second');
    tick(8000); expect(app.bubble()).toBeNull();
    fixture.destroy();
  }));
  it('does not send Enter while a Chinese IME composition is active', fakeAsync(() => {
    fixture.detectChanges(); flushMicrotasks();
    const app = fixture.componentInstance;
    app.input.set('中文');
    app.onInputKey(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect(send).not.toHaveBeenCalled();
    app.onInputKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    flushMicrotasks();
    expect(send).toHaveBeenCalledOnceWith('中文');
    fixture.destroy();
  }));
  it('places manual chat inside the chat panel without a countdown', fakeAsync(() => {
    fixture.detectChanges(); flushMicrotasks();
    expect(fixture.nativeElement.querySelector('.chat-now')).toBeNull();
    expect(fixture.nativeElement.querySelector('.autonomy-bar')).toBeNull();
    fixture.componentInstance.openChat(); fixture.detectChanges(); tick(20);
    expect(fixture.nativeElement.querySelector('.chat-now').textContent).toContain('讓他們聊聊');
    fixture.destroy();
  }));
});
