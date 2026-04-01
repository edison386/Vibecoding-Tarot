const test = require('node:test');
const assert = require('node:assert/strict');

const { validateQuestion, buildDeck, buildReadingResult } = require('../src/lib/readingEngine');

test('validateQuestion trims and accepts valid input', () => {
  const question = validateQuestion('  我要换工作吗  ');
  assert.equal(question, '我要换工作吗');
});

test('validateQuestion rejects empty or over limit input', () => {
  assert.throws(() => validateQuestion('   '), /between 1 and 120/);
  assert.throws(() => validateQuestion('x'.repeat(121)), /between 1 and 120/);
});

test('buildDeck produces deterministic shuffled sequence', () => {
  const first = buildDeck(1024);
  const second = buildDeck(1024);
  assert.deepEqual(first, second);
  assert.equal(first.length, 22);
  assert.equal(new Set(first).size, 22);
});

test('buildReadingResult returns card-level and summary fields', () => {
  const result = buildReadingResult('这次合作是否顺利', [1, 2, 3], 54321);
  assert.equal(result.cards.length, 3);
  assert.equal(typeof result.summary, 'string');
  assert.equal(typeof result.risk, 'string');
  assert.equal(result.advice.length, 3);
  assert.equal(result.cards[0].card_id, 1);
  assert.match(result.cards[0].interpretation, /这次合作是否顺利/);
});
