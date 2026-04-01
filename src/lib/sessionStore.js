const crypto = require('node:crypto');
const { buildDeck, buildReadingResult, validateQuestion } = require('./readingEngine');

const sessions = new Map();

function randomSeed() {
  return crypto.randomInt(1, 2147483646);
}

function createSession(rawQuestion) {
  const question = validateQuestion(rawQuestion);
  const id = crypto.randomUUID();
  const deckSeed = randomSeed();
  const deck = buildDeck(deckSeed);

  const session = {
    id,
    question,
    deckSeed,
    deck,
    selected: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  sessions.set(id, session);
  return {
    session_id: id,
    deck_seed: deckSeed
  };
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function selectCard(sessionId, cardId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('session not found');
  }

  if (session.selected.length >= 3) {
    throw new Error('selection complete');
  }

  const numericCardId = Number(cardId);
  if (!Number.isInteger(numericCardId)) {
    throw new Error('card_id must be an integer');
  }

  if (!session.deck.includes(numericCardId)) {
    throw new Error('invalid card_id');
  }

  if (session.selected.includes(numericCardId)) {
    throw new Error('card already selected');
  }

  session.selected.push(numericCardId);
  session.updatedAt = Date.now();

  return {
    selected_count: session.selected.length,
    is_complete: session.selected.length === 3
  };
}

function revealReading(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('session not found');
  }

  if (session.selected.length !== 3) {
    throw new Error('need exactly 3 cards selected');
  }

  const reading = buildReadingResult(session.question, session.selected, session.deckSeed);
  session.updatedAt = Date.now();

  return reading;
}

module.exports = {
  createSession,
  selectCard,
  revealReading,
  getSession
};
