const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAnalyticsStore } = require('../src/lib/analyticsStore');
const { createServer } = require('../src/server');

function buildTempDbPath(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function startTestServer(options = {}) {
  const dbPath = options.dbPath || buildTempDbPath('tarot-server');
  const analyticsStore =
    options.analyticsStore ||
    createAnalyticsStore({
      dbPath,
      logger: {
        error() {}
      }
    });
  const server = createServer({
    analyticsStore,
    adminToken: options.adminToken || 'secret-token',
    logger: {
      error() {}
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    analyticsStore,
    dbPath,
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

async function stopTestServer(context) {
  await new Promise((resolve, reject) => {
    context.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  context.analyticsStore.close();
  cleanupDb(context.dbPath);
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload || {})
  });

  const data = await response.json();
  return {
    status: response.status,
    data
  };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers
  });
  const data = await response.json();
  return {
    status: response.status,
    data
  };
}

test('server keeps public flow compatible and protects admin APIs', { concurrency: false }, async () => {
  const context = await startTestServer();

  try {
    const pageview = await postJson(`${context.baseUrl}/api/analytics/pageview`, {
      path: '/',
      referrer: 'https://example.com'
    });
    assert.equal(pageview.status, 200);
    assert.equal(pageview.data.ok, true);

    const start = await postJson(`${context.baseUrl}/api/reading/start`, {
      question: '我应该如何安排这周的工作重点？',
      path: '/',
      referrer: 'https://example.com'
    });
    assert.equal(start.status, 200);
    assert.equal(typeof start.data.session_id, 'string');
    assert.equal(typeof start.data.deck_seed, 'number');

    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 1 });
    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 2 });
    const thirdSelect = await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 3 });
    assert.equal(thirdSelect.status, 200);
    assert.equal(thirdSelect.data.is_complete, true);

    const reveal = await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/reveal`, {});
    assert.equal(reveal.status, 200);
    assert.equal(reveal.data.cards.length, 3);
    assert.equal(reveal.data.advice.length, 3);
    assert.equal(reveal.data.analysis_source, 'template');

    const noAuthOverview = await getJson(`${context.baseUrl}/api/admin/overview?range=7d`);
    assert.equal(noAuthOverview.status, 401);
    assert.equal(noAuthOverview.data.error, 'unauthorized');

    const badAuthOverview = await getJson(`${context.baseUrl}/api/admin/overview?range=7d`, {
      Authorization: 'Bearer wrong-token'
    });
    assert.equal(badAuthOverview.status, 401);

    const overview = await getJson(`${context.baseUrl}/api/admin/overview?range=7d`, {
      Authorization: 'Bearer secret-token'
    });
    assert.equal(overview.status, 200);
    assert.equal(overview.data.summary.landing_views, 1);
    assert.equal(overview.data.summary.reading_starts, 1);
    assert.equal(overview.data.summary.selection_completed, 1);
    assert.equal(overview.data.summary.reveal_successes, 1);

    const readings = await getJson(`${context.baseUrl}/api/admin/readings?range=7d&limit=50&offset=0`, {
      Authorization: 'Bearer secret-token'
    });
    assert.equal(readings.status, 200);
    assert.equal(readings.data.readings.length, 1);
    assert.equal(readings.data.readings[0].reveal_status, 'success');
    assert.equal(readings.data.readings[0].ai_status, 'disabled');
  } finally {
    await stopTestServer(context);
  }
});

test('server records AI fallback without breaking reveal response', { concurrency: false }, async () => {
  const originalPassword = process.env.SPARK_API_PASSWORD;
  const originalFetch = global.fetch;
  process.env.SPARK_API_PASSWORD = 'spark-test-token';

  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('http://127.0.0.1')) {
      return originalFetch(input, init);
    }

    throw new Error('spark unavailable');
  };

  const context = await startTestServer();

  try {
    const start = await postJson(`${context.baseUrl}/api/reading/start`, {
      question: '这个合作还值得继续推进吗？',
      path: '/'
    });

    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 1 });
    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 2 });
    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 3 });

    const reveal = await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/reveal`, {});
    assert.equal(reveal.status, 200);
    assert.equal(reveal.data.analysis_source, 'template');
    assert.equal(reveal.data.cards.length, 3);

    const readings = await getJson(`${context.baseUrl}/api/admin/readings?range=7d&limit=10&offset=0`, {
      Authorization: 'Bearer secret-token'
    });
    assert.equal(readings.status, 200);
    assert.equal(readings.data.readings[0].ai_status, 'fallback');
    assert.equal(typeof readings.data.readings[0].ai_latency_ms, 'number');
  } finally {
    global.fetch = originalFetch;
    if (originalPassword === undefined) {
      delete process.env.SPARK_API_PASSWORD;
    } else {
      process.env.SPARK_API_PASSWORD = originalPassword;
    }
    await stopTestServer(context);
  }
});

test('server supports successful AI-enhanced reveal results', { concurrency: false }, async () => {
  const originalPassword = process.env.SPARK_API_PASSWORD;
  const originalFetch = global.fetch;
  process.env.SPARK_API_PASSWORD = 'spark-test-token';

  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('http://127.0.0.1')) {
      return originalFetch(input, init);
    }

    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cards: [
                    { card_id: 1, interpretation: 'AI 解析 1' },
                    { card_id: 2, interpretation: 'AI 解析 2' },
                    { card_id: 3, interpretation: 'AI 解析 3' }
                  ],
                  summary: 'AI 综合总结',
                  risk: 'AI 风险提醒',
                  advice: ['AI 建议 1', 'AI 建议 2', 'AI 建议 3']
                })
              }
            }
          ]
        };
      }
    };
  };

  const context = await startTestServer();

  try {
    const start = await postJson(`${context.baseUrl}/api/reading/start`, {
      question: '这个新方向值得继续投入吗？',
      path: '/'
    });

    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 1 });
    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 2 });
    await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/select`, { card_id: 3 });

    const reveal = await postJson(`${context.baseUrl}/api/reading/${start.data.session_id}/reveal`, {});
    assert.equal(reveal.status, 200);
    assert.equal(reveal.data.analysis_source, 'spark');
    assert.equal(reveal.data.summary, 'AI 综合总结');
    assert.deepEqual(reveal.data.advice, ['AI 建议 1', 'AI 建议 2', 'AI 建议 3']);
  } finally {
    global.fetch = originalFetch;
    if (originalPassword === undefined) {
      delete process.env.SPARK_API_PASSWORD;
    } else {
      process.env.SPARK_API_PASSWORD = originalPassword;
    }
    await stopTestServer(context);
  }
});

test('server returns admin 503 when analytics storage is unavailable but public flow still works', { concurrency: false }, async () => {
  const analyticsStore = createAnalyticsStore({
    dbPath: '/dev/null/tarot.db',
    logger: {
      error() {}
    }
  });
  const context = await startTestServer({
    analyticsStore,
    dbPath: buildTempDbPath('unused')
  });

  try {
    const start = await postJson(`${context.baseUrl}/api/reading/start`, {
      question: '没有埋点时主流程还能不能正常跑？',
      path: '/'
    });
    assert.equal(start.status, 200);

    const overview = await getJson(`${context.baseUrl}/api/admin/overview?range=7d`, {
      Authorization: 'Bearer secret-token'
    });
    assert.equal(overview.status, 503);
    assert.equal(overview.data.error, 'analytics unavailable');
  } finally {
    await new Promise((resolve, reject) => {
      context.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    cleanupDb(context.dbPath);
  }
});
