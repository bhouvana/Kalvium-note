const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCircuitBreaker, CircuitOpenError } = require('./circuitBreaker');

const fail = () => Promise.reject(new Error('provider down'));
const ok = () => Promise.resolve('drafted');

test('does not open before minimum request volume', async () => {
  const cb = createCircuitBreaker({ failureThreshold: 0.5, minimumRequests: 5 });
  for (let i = 0; i < 4; i++) await cb.exec(fail).catch(() => {});
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.metrics.breaker_open_total, 0);
});

test('opens after failure ratio reaches threshold', async () => {
  const cb = createCircuitBreaker({ failureThreshold: 0.5, minimumRequests: 5 });
  for (let i = 0; i < 5; i++) await cb.exec(fail).catch(() => {});
  assert.equal(cb.state, 'OPEN');
  assert.equal(cb.metrics.breaker_open_total, 1);
});

test('short-circuits while open without invoking provider', async () => {
  const cb = createCircuitBreaker({ failureThreshold: 0.5, minimumRequests: 1, now: () => 0 });
  await cb.exec(fail).catch(() => {});
  let called = false;
  await assert.rejects(() => cb.exec(() => { called = true; return ok(); }), CircuitOpenError);
  assert.equal(called, false);
  assert.equal(cb.metrics.short_circuited_total, 1);
});

test('allows one half-open probe after timeout and closes on success', async () => {
  let clock = 0;
  const states = [];
  const cb = createCircuitBreaker({ failureThreshold: 1, minimumRequests: 1, openMillis: 1000, now: () => clock, onStateChange: s => states.push(s) });
  await cb.exec(fail).catch(() => {});
  clock = 1000;
  assert.equal(await cb.exec(ok), 'drafted');
  assert.equal(cb.state, 'CLOSED');
  assert.deepEqual(states, ['OPEN', 'HALF_OPEN', 'CLOSED']);
});

test('a failed half-open probe reopens the breaker and counts each trip', async () => {
  let clock = 0;
  const cb = createCircuitBreaker({ failureThreshold: 1, minimumRequests: 1, openMillis: 5, now: () => clock });
  await cb.exec(fail).catch(() => {});
  clock = 5;
  await cb.exec(fail).catch(() => {});
  assert.equal(cb.state, 'OPEN');
  assert.equal(cb.metrics.breaker_open_total, 2);
});

test('only one probe can run concurrently', async () => {
  let clock = 0;
  const cb = createCircuitBreaker({ failureThreshold: 1, minimumRequests: 1, openMillis: 1, now: () => clock });
  await cb.exec(fail).catch(() => {});
  clock = 1;
  let resolveProbe;
  const probe = cb.exec(() => new Promise(resolve => { resolveProbe = resolve; }));
  await assert.rejects(() => cb.exec(ok), CircuitOpenError);
  resolveProbe('ok');
  await probe;
  assert.equal(cb.state, 'CLOSED');
});
