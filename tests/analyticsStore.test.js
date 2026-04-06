const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAnalyticsStore } = require('../src/lib/analyticsStore');

function buildTempDbPath(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('analytics store persists funnel and recent reading data', () => {
  const dbPath = buildTempDbPath('tarot-analytics');
  const store = createAnalyticsStore({
    dbPath,
    timezone: 'Asia/Shanghai',
    logger: {
      error() {}
    }
  });

  assert.equal(store.isAvailable(), true);

  store.trackPageView({
    path: '/',
    visitorId: 'visitor-1',
    referrer: 'https://example.com'
  });
  store.createReadingSession({
    sessionId: 'session-1',
    visitorId: 'visitor-1',
    questionText: '我接下来应该怎么推进这个项目？',
    createdAt: Date.now(),
    referrer: 'https://example.com',
    utmSource: 'newsletter',
    utmMedium: 'email',
    utmCampaign: 'launch',
    landingPath: '/',
    deviceType: 'mobile',
    userAgent: 'Mozilla/5.0 iPhone'
  });
  store.trackCardSelection({
    sessionId: 'session-1',
    visitorId: 'visitor-1',
    cardId: 1,
    selectedCount: 1,
    isComplete: false
  });
  store.trackCardSelection({
    sessionId: 'session-1',
    visitorId: 'visitor-1',
    cardId: 2,
    selectedCount: 2,
    isComplete: false
  });
  store.trackCardSelection({
    sessionId: 'session-1',
    visitorId: 'visitor-1',
    cardId: 3,
    selectedCount: 3,
    isComplete: true
  });
  store.markRevealStarted({
    sessionId: 'session-1',
    visitorId: 'visitor-1'
  });
  store.completeReveal({
    sessionId: 'session-1',
    visitorId: 'visitor-1',
    analysisSource: 'template',
    aiStatus: 'disabled',
    aiLatencyMs: null
  });

  const overview = store.getAdminOverview('7d');
  assert.equal(overview.summary.landing_views, 1);
  assert.equal(overview.summary.reading_starts, 1);
  assert.equal(overview.summary.selection_completed, 1);
  assert.equal(overview.summary.reveal_successes, 1);
  assert.equal(overview.ai.disabled_count, 1);
  assert.equal(overview.traffic.top_referrers[0].referrer, 'https://example.com');
  assert.equal(overview.traffic.device_breakdown[0].device_type, 'mobile');

  const readings = store.getRecentReadings({ range: '7d', limit: 10, offset: 0 });
  assert.equal(readings.length, 1);
  assert.equal(readings[0].selected_count, 3);
  assert.equal(readings[0].reveal_status, 'success');
  assert.equal(readings[0].ai_status, 'disabled');

  store.close();
  cleanupDb(dbPath);
});

test('analytics store reports unavailable when sqlite cannot initialize', () => {
  const store = createAnalyticsStore({
    dbPath: '/dev/null/tarot.db',
    logger: {
      error() {}
    }
  });

  assert.equal(store.isAvailable(), false);
  assert.throws(() => store.getAdminOverview('7d'), /analytics unavailable/);
});
