const { TAROT_CARDS } = require('../data/tarotCards');

const cardMap = new Map(TAROT_CARDS.map((card) => [card.id, card]));

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validateQuestion(rawQuestion) {
  if (typeof rawQuestion !== 'string') {
    throw new Error('question must be a string');
  }

  const question = rawQuestion.trim();
  if (question.length < 1 || question.length > 120) {
    throw new Error('question length must be between 1 and 120');
  }

  return question;
}

function buildDeck(deckSeed) {
  const random = createSeededRandom(deckSeed);
  const ids = TAROT_CARDS.map((card) => card.id);

  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids;
}

function orientationFromSeed(deckSeed, cardId, index) {
  const value = Math.abs((deckSeed * 31 + cardId * 17 + index * 13) % 100);
  return value % 2 === 0 ? 'upright' : 'reversed';
}

function interpretationForCard(card, orientation, question) {
  const baseMeaning = orientation === 'upright' ? card.uprightMeaning : card.reversedMeaning;
  const direction = orientation === 'upright' ? '建议顺势推进' : '建议先调整再推进';
  return `关于“${question}”，${card.name}${orientation === 'upright' ? '（正位）' : '（逆位）'}提示：${baseMeaning}${direction}。`;
}

function summarize(cards, question) {
  const reversedCount = cards.filter((item) => item.orientation === 'reversed').length;
  const keywordPool = cards.flatMap((item) => item.keywords).slice(0, 6);
  const keywordText = keywordPool.join('、');

  let summary = `围绕“${question}”，三张牌共同指向主题：${keywordText}。`;
  if (reversedCount >= 2) {
    summary += ' 当前更适合先稳住节奏，处理阻力后再扩大动作。';
  } else if (reversedCount === 1) {
    summary += ' 整体可推进，但其中一个环节需要你额外校准。';
  } else {
    summary += ' 整体趋势积极，可按计划连续推进。';
  }

  return summary;
}

function riskPoint(cards) {
  const reversed = cards.find((item) => item.orientation === 'reversed');
  if (reversed) {
    return `风险点在“${reversed.name}”所代表的课题：容易因为${reversed.keywords[0]}失衡而走弯路。`;
  }

  return '风险点主要来自执行细节：在高势能阶段容易忽略复盘与边界。';
}

function buildAdvice(cards) {
  const first = cards[0];
  const second = cards[1];
  const third = cards[2];

  return [
    `先处理“${first.keywords[0]}”议题：给自己一个本周可完成的小目标。`,
    `围绕“${second.keywords[0]}”做一次取舍：保留最关键的一件事。`,
    `在“${third.keywords[0]}”方向设立复盘点：48 小时后检查进展并微调。`
  ];
}

function buildReadingResult(question, selectedCardIds, deckSeed) {
  const cards = selectedCardIds.map((cardId, index) => {
    const card = cardMap.get(cardId);
    if (!card) {
      throw new Error(`invalid card id: ${cardId}`);
    }

    const orientation = orientationFromSeed(deckSeed, cardId, index);
    return {
      card_id: card.id,
      name: card.name,
      orientation,
      keywords: card.keywords,
      interpretation: interpretationForCard(card, orientation, question)
    };
  });

  return {
    cards,
    summary: summarize(cards, question),
    risk: riskPoint(cards),
    advice: buildAdvice(cards)
  };
}

module.exports = {
  validateQuestion,
  buildDeck,
  buildReadingResult
};
