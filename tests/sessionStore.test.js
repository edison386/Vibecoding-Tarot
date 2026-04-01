const test = require('node:test');
const assert = require('node:assert/strict');

const { createSession, selectCard, revealReading } = require('../src/lib/sessionStore');

test('session flow enforces 3-card unique selection', () => {
  const { session_id } = createSession('我该如何安排接下来的学习计划？');

  const first = selectCard(session_id, 1);
  assert.equal(first.selected_count, 1);
  assert.equal(first.is_complete, false);

  const second = selectCard(session_id, 2);
  assert.equal(second.selected_count, 2);

  const third = selectCard(session_id, 3);
  assert.equal(third.selected_count, 3);
  assert.equal(third.is_complete, true);

  assert.throws(() => selectCard(session_id, 3), /selection complete|already selected/);
});

test('revealReading requires exactly 3 cards', () => {
  const { session_id } = createSession('这个项目会按期完成吗？');
  selectCard(session_id, 4);
  selectCard(session_id, 5);

  assert.throws(() => revealReading(session_id), /exactly 3/);

  selectCard(session_id, 6);
  const reading = revealReading(session_id);
  assert.equal(reading.cards.length, 3);
  assert.equal(reading.advice.length, 3);
});

test('invalid session operations return errors', () => {
  assert.throws(() => selectCard('missing-session', 1), /session not found/);
  assert.throws(() => revealReading('missing-session'), /session not found/);
});
