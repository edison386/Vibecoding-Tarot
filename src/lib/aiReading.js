const { TAROT_CARDS } = require('../data/tarotCards');

const DEFAULT_SPARK_API_URL = 'https://spark-api-open.xf-yun.com/v1/chat/completions';
const DEFAULT_SPARK_MODEL = 'generalv3.5';
const DEFAULT_TIMEOUT_MS = 15000;
const cardMap = new Map(TAROT_CARDS.map((card) => [card.id, card]));

function inferDefaultTimeout(model) {
  return /ultra/i.test(model || '') ? 45000 : DEFAULT_TIMEOUT_MS;
}

function getSparkConfig() {
  const model = process.env.SPARK_MODEL || DEFAULT_SPARK_MODEL;
  const configuredTimeout = process.env.AI_READING_TIMEOUT_MS;
  return {
    apiUrl: process.env.SPARK_API_URL || DEFAULT_SPARK_API_URL,
    apiPassword: process.env.SPARK_API_PASSWORD || '',
    model,
    timeoutMs: Number(configuredTimeout || inferDefaultTimeout(model))
  };
}

function isSparkEnabled() {
  return Boolean(getSparkConfig().apiPassword);
}

function buildSparkPrompt(question, baseResult) {
  const cardLines = baseResult.cards.map((card, index) => ({
    position: index + 1,
    card_id: card.card_id,
    name: card.name,
    orientation: card.orientation === 'upright' ? '正位' : '逆位',
    keywords: card.keywords,
    factual_meaning:
      card.orientation === 'upright'
        ? cardMap.get(card.card_id)?.uprightMeaning || ''
        : cardMap.get(card.card_id)?.reversedMeaning || ''
  }));

  return [
    '你是一位经验老练的中文塔罗师，擅长在仪式感与判断力之间保持平衡。',
    '你的语气像真正做现场解读的塔罗师：先看牌与牌之间的张力，再指出走势、阻滞与可执行的调整。',
    '要求：',
    '1. 不要改变已有牌名、牌序和正逆位，不要编造新的牌。',
    '2. 不要做医疗、法律、投资保证，不要下绝对结论。',
    '3. 语言要有仪式感，但判断必须明确，不要空泛，不要像客服话术，也不要像鸡汤文。',
    '4. 只输出合法 JSON，不要输出 markdown，不要输出解释。',
    '5. JSON 结构必须为：{"cards":[{"card_id":1,"interpretation":"..."}],"summary":"...","risk":"...","advice":["...","...","..."]}',
    '6. advice 必须是 3 条简洁但具体的中文建议，每条都要能直接执行。',
    '7. cards[].interpretation 必须结合问题语境，写出“当前处境 + 潜在阻力/机会 + 建议动作”，每条 70 到 120 个汉字。',
    '8. summary 需要总结三张牌之间的关系，不要只是把关键词拼接起来，长度 90 到 140 个汉字。',
    '9. risk 需要指出最容易失手的具体风险，不要只重复牌名或关键词，长度 60 到 100 个汉字。',
    '10. 严禁复用以下模板腔：',
    '“关于某问题，某牌提示……”',
    '“建议顺势推进 / 先调整再推进”',
    '“围绕某问题，三张牌共同指向主题……”',
    '11. 输入中的 factual_meaning 只能作为牌义参考，不能原句改写，必须重新组织语言。',
    '12. 每张牌的 interpretation 都要像在“解牌”，而不是在“解释关键词”：要说出这张牌在此刻为什么出现、它在提醒什么。',
    '13. summary 要体现三张牌的递进或冲突，例如：起势、阻滞、转机、校准、收束，而不是并列罗列。',
    '14. advice 的措辞要像塔罗师给出的现实指引：温和但笃定，能落地，避免套话。',
    '',
    `用户问题：${question}`,
    `牌阵事实数据：${JSON.stringify(cardLines, null, 2)}`
  ].join('\n');
}

function extractJsonObject(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('spark content is empty');
  }

  const trimmed = rawContent.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('spark content is not valid json');
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function normalizeAiReading(baseResult, aiPayload) {
  const interpretationById = new Map(
    Array.isArray(aiPayload.cards)
      ? aiPayload.cards
          .filter((item) => item && Number.isInteger(Number(item.card_id)) && typeof item.interpretation === 'string')
          .map((item) => [Number(item.card_id), item.interpretation.trim()])
      : []
  );

  return {
    cards: baseResult.cards.map((card) => ({
      ...card,
      interpretation:
        interpretationById.get(card.card_id) && interpretationById.get(card.card_id).length > 0
          ? interpretationById.get(card.card_id)
          : card.interpretation
    })),
    summary: typeof aiPayload.summary === 'string' && aiPayload.summary.trim()
      ? aiPayload.summary.trim()
      : baseResult.summary,
    risk: typeof aiPayload.risk === 'string' && aiPayload.risk.trim()
      ? aiPayload.risk.trim()
      : baseResult.risk,
    advice:
      Array.isArray(aiPayload.advice) && aiPayload.advice.filter((item) => typeof item === 'string' && item.trim()).length === 3
        ? aiPayload.advice.map((item) => item.trim())
        : baseResult.advice,
    analysis_source: 'spark'
  };
}

async function requestSparkReading(question, baseResult, userId) {
  const config = getSparkConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiPassword}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        user: userId,
        response_format: {
          type: 'json_object'
        },
        messages: [
          {
            role: 'user',
            content: buildSparkPrompt(question, baseResult)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`spark request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return normalizeAiReading(baseResult, extractJsonObject(content));
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`spark request timeout after ${config.timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function enhanceReadingWithAI({ question, baseResult, userId }) {
  if (!isSparkEnabled()) {
    return {
      ...baseResult,
      analysis_source: 'template'
    };
  }

  try {
    return await requestSparkReading(question, baseResult, userId);
  } catch (error) {
    process.stderr.write(`[spark] AI reading fallback: ${error.message}\n`);
    return {
      ...baseResult,
      analysis_source: 'template'
    };
  }
}

module.exports = {
  buildSparkPrompt,
  enhanceReadingWithAI,
  extractJsonObject,
  normalizeAiReading,
  isSparkEnabled
};
