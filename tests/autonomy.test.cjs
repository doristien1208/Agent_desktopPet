const test = require('node:test');
const assert = require('node:assert/strict');
const Scheduler = require('../src/backend/autonomy-scheduler');
function clock() {
  let time = 0;
  const scheduler = new Scheduler({ now: () => time, random: () => 0 });
  return { scheduler, advance: seconds => { time += seconds * 1000; } };
}
test('normal mode starts after one minute with no additional probability gate', () => {
  const { scheduler, advance } = clock();
  advance(59); assert.equal(scheduler.claim({}), false);
  advance(1); assert.equal(scheduler.claim({}), true);
  assert.equal(scheduler.claim({}), false, 'the same tick cannot launch twice');
});
test('long desktop inactivity does not disable spontaneous chat', () => {
  const { scheduler, advance } = clock();
  advance(600);
  assert.equal(scheduler.claim({ systemIdleSeconds: 600 }), true);
});
test('busy, disabled and locked sessions pause triggering', () => {
  const { scheduler, advance } = clock();
  advance(120);
  assert.equal(scheduler.claim({ busy: true }), false);
  assert.equal(scheduler.snapshot({ busy: true }).state, 'busy');
  assert.equal(scheduler.claim({ paused: true }), false);
  assert.equal(scheduler.claim({ chatting: true }), false);
  scheduler.configure({ autonomous: false });
  advance(120);
  assert.equal(scheduler.claim({}), false);
});
test('user input gets at least 30 seconds before a due autonomous conversation', () => {
  const { scheduler, advance } = clock();
  advance(120); scheduler.userInteracted();
  advance(29); assert.equal(scheduler.claim({}), false);
  advance(1); assert.equal(scheduler.claim({}), true);
});
test('frequency changes reset the countdown; unrelated settings do not', () => {
  const { scheduler, advance } = clock();
  scheduler.configure({ chatFrequency: 'lively' });
  assert.equal(scheduler.snapshot().nextInSeconds, 30);
  advance(10);
  scheduler.configure({ chatFrequency: 'lively', rememberHistory: true });
  assert.equal(scheduler.snapshot().nextInSeconds, 20);
  scheduler.configure({ chatFrequency: 'quiet' });
  assert.equal(scheduler.snapshot().nextInSeconds, 180);
});
test('cooldown starts after the previous conversation finishes', () => {
  const { scheduler, advance } = clock();
  advance(60); assert.equal(scheduler.claim({}), true);
  advance(200); scheduler.reschedule();
  assert.equal(scheduler.claim({}), false);
  assert.equal(scheduler.snapshot().nextInSeconds, 60);
});
