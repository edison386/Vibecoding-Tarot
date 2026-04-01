const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSparkPrompt, extractJsonObject, normalizeAiReading } = require('../src/lib/aiReading');

test('buildSparkPrompt avoids injecting template wording directly', () => {
  const prompt = buildSparkPrompt(
    '我该如何推进当前项目',
    {
      cards: [
        {
          card_id: 1,
          name: '愚者',
          orientation: 'reversed',
          keywords: ['启程', '冒险', '未知'],
          interpretation: '关于“我该如何推进当前项目”，愚者（逆位）提示：冲动或逃避现实会让你错过关键细节，先停一下再行动。建议先调整再推进。'
        }
      ],
      summary: '围绕“我该如何推进当前项目”，三张牌共同指向主题……',
      risk: '模板风险',
      advice: ['模板建议1', '模板建议2', '模板建议3']
    }
  );

  assert.match(prompt, /factual_meaning/);
  assert.doesNotMatch(prompt, /template_interpretation/);
  assert.doesNotMatch(prompt, /模板综合总结/);
  assert.match(prompt, /严禁复用以下模板腔/);
  assert.match(prompt, /经验老练的中文塔罗师/);
  assert.match(prompt, /起势、阻滞、转机、校准、收束/);
});

test('extractJsonObject parses fenced json content', () => {
  const payload = extractJsonObject('```json\n{"summary":"测试","risk":"注意节奏","advice":["一","二","三"]}\n```');
  assert.equal(payload.summary, '测试');
  assert.equal(payload.advice.length, 3);
});

test('normalizeAiReading keeps base metadata and replaces text fields only', () => {
  const baseResult = {
    cards: [
      {
        card_id: 1,
        name: '魔术师',
        orientation: 'upright',
        keywords: ['行动', '创造'],
        interpretation: '模板解析 1'
      },
      {
        card_id: 2,
        name: '女祭司',
        orientation: 'reversed',
        keywords: ['直觉', '观察'],
        interpretation: '模板解析 2'
      },
      {
        card_id: 3,
        name: '皇后',
        orientation: 'upright',
        keywords: ['丰盛', '照料'],
        interpretation: '模板解析 3'
      }
    ],
    summary: '模板总结',
    risk: '模板风险',
    advice: ['模板建议1', '模板建议2', '模板建议3']
  };

  const normalized = normalizeAiReading(baseResult, {
    cards: [
      { card_id: 1, interpretation: 'AI 解析 1' },
      { card_id: 2, interpretation: 'AI 解析 2' },
      { card_id: 3, interpretation: 'AI 解析 3' }
    ],
    summary: 'AI 总结',
    risk: 'AI 风险',
    advice: ['AI 建议1', 'AI 建议2', 'AI 建议3']
  });

  assert.equal(normalized.cards[0].name, '魔术师');
  assert.equal(normalized.cards[1].orientation, 'reversed');
  assert.equal(normalized.cards[0].interpretation, 'AI 解析 1');
  assert.equal(normalized.summary, 'AI 总结');
  assert.equal(normalized.risk, 'AI 风险');
  assert.deepEqual(normalized.advice, ['AI 建议1', 'AI 建议2', 'AI 建议3']);
  assert.equal(normalized.analysis_source, 'spark');
});
