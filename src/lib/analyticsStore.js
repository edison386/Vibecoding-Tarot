const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'tarot.db');
const DEFAULT_TIMEZONE = process.env.ADMIN_TIMEZONE || 'Asia/Shanghai';
const RANGE_TO_MS = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};
const PAGE_EVENT_MAP = {
  '/': 'landing_view',
  '/index.html': 'landing_view',
  '/draw.html': 'draw_view',
  '/reading.html': 'reading_view'
};
const SESSION_COLUMNS = [
  'session_id',
  'visitor_id',
  'question_text',
  'question_length',
  'created_at',
  'first_select_at',
  'completed_select_at',
  'reveal_started_at',
  'reveal_completed_at',
  'reveal_status',
  'selected_count',
  'analysis_source',
  'ai_status',
  'ai_latency_ms',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'landing_path',
  'device_type',
  'user_agent'
];

function createAnalyticsStore({
  dbPath = process.env.SQLITE_PATH || DEFAULT_DB_PATH,
  timezone = DEFAULT_TIMEZONE,
  logger = console
} = {}) {
  const store = {
    available: false,
    dbPath,
    timezone,
    logger,
    db: null
  };

  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    store.db = new Database(dbPath);
    store.db.pragma('journal_mode = WAL');
    store.db.pragma('foreign_keys = ON');
    initializeSchema(store.db);
    prepareStatements(store);
    store.available = true;
  } catch (error) {
    logger.error(`[analytics] failed to initialize sqlite store: ${error.message}`);
  }

  return {
    isAvailable: () => store.available,
    getTimezone: () => store.timezone,
    getDbPath: () => store.dbPath,
    close() {
      if (store.db) {
        store.db.close();
        store.db = null;
        store.available = false;
      }
    },
    trackPageView(payload) {
      if (!store.available) {
        return false;
      }

      const eventType = PAGE_EVENT_MAP[payload.path];
      if (!eventType) {
        return false;
      }

      const eventAt = payload.eventAt || Date.now();
      store.stmts.insertEvent.run({
        session_id: payload.sessionId || null,
        visitor_id: payload.visitorId || null,
        event_type: eventType,
        event_at: eventAt,
        path: payload.path,
        payload_json: serializePayload({
          referrer: payload.referrer || '',
          utm_source: payload.utmSource || '',
          utm_medium: payload.utmMedium || '',
          utm_campaign: payload.utmCampaign || '',
          landing_path: payload.path
        })
      });

      return true;
    },
    createReadingSession(payload) {
      if (!store.available) {
        return false;
      }

      store.stmts.insertSession.run({
        session_id: payload.sessionId,
        visitor_id: payload.visitorId || null,
        question_text: payload.questionText,
        question_length: payload.questionText.length,
        created_at: payload.createdAt,
        first_select_at: null,
        completed_select_at: null,
        reveal_started_at: null,
        reveal_completed_at: null,
        reveal_status: 'pending',
        selected_count: 0,
        analysis_source: null,
        ai_status: null,
        ai_latency_ms: null,
        referrer: payload.referrer || null,
        utm_source: payload.utmSource || null,
        utm_medium: payload.utmMedium || null,
        utm_campaign: payload.utmCampaign || null,
        landing_path: payload.landingPath || '/',
        device_type: payload.deviceType || 'unknown',
        user_agent: payload.userAgent || null
      });

      store.stmts.insertEvent.run({
        session_id: payload.sessionId,
        visitor_id: payload.visitorId || null,
        event_type: 'reading_started',
        event_at: payload.createdAt,
        path: payload.landingPath || '/',
        payload_json: serializePayload({
          question_length: payload.questionText.length
        })
      });

      return true;
    },
    trackCardSelection(payload) {
      if (!store.available) {
        return false;
      }

      const eventAt = payload.eventAt || Date.now();
      store.stmts.updateSelection.run({
        session_id: payload.sessionId,
        first_select_at: payload.selectedCount === 1 ? eventAt : null,
        completed_select_at: payload.isComplete ? eventAt : null,
        selected_count: payload.selectedCount
      });

      store.stmts.insertEvent.run({
        session_id: payload.sessionId,
        visitor_id: payload.visitorId || null,
        event_type: 'card_selected',
        event_at: eventAt,
        path: '/draw.html',
        payload_json: serializePayload({
          card_id: payload.cardId,
          selected_count: payload.selectedCount
        })
      });

      if (payload.isComplete) {
        store.stmts.insertEvent.run({
          session_id: payload.sessionId,
          visitor_id: payload.visitorId || null,
          event_type: 'selection_completed',
          event_at: eventAt,
          path: '/draw.html',
          payload_json: serializePayload({
            selected_count: payload.selectedCount
          })
        });
      }

      return true;
    },
    markRevealStarted(payload) {
      if (!store.available) {
        return false;
      }

      const eventAt = payload.eventAt || Date.now();
      store.stmts.markRevealStarted.run({
        session_id: payload.sessionId,
        reveal_started_at: eventAt
      });
      store.stmts.insertEvent.run({
        session_id: payload.sessionId,
        visitor_id: payload.visitorId || null,
        event_type: 'reveal_started',
        event_at: eventAt,
        path: '/reading.html',
        payload_json: serializePayload({})
      });

      return true;
    },
    completeReveal(payload) {
      if (!store.available) {
        return false;
      }

      const eventAt = payload.eventAt || Date.now();
      store.stmts.completeReveal.run({
        session_id: payload.sessionId,
        reveal_completed_at: eventAt,
        reveal_status: 'success',
        analysis_source: payload.analysisSource || null,
        ai_status: payload.aiStatus || null,
        ai_latency_ms: payload.aiLatencyMs ?? null
      });
      store.stmts.insertEvent.run({
        session_id: payload.sessionId,
        visitor_id: payload.visitorId || null,
        event_type: 'reveal_succeeded',
        event_at: eventAt,
        path: '/reading.html',
        payload_json: serializePayload({
          analysis_source: payload.analysisSource || null,
          ai_status: payload.aiStatus || null,
          ai_latency_ms: payload.aiLatencyMs ?? null
        })
      });

      if (payload.aiStatus === 'fallback') {
        store.stmts.insertEvent.run({
          session_id: payload.sessionId,
          visitor_id: payload.visitorId || null,
          event_type: 'ai_fallback',
          event_at: eventAt,
          path: '/reading.html',
          payload_json: serializePayload({
            analysis_source: payload.analysisSource || null,
            ai_latency_ms: payload.aiLatencyMs ?? null
          })
        });
      }

      return true;
    },
    failReveal(payload) {
      if (!store.available) {
        return false;
      }

      const eventAt = payload.eventAt || Date.now();
      store.stmts.failReveal.run({
        session_id: payload.sessionId,
        reveal_completed_at: eventAt
      });
      store.stmts.insertEvent.run({
        session_id: payload.sessionId,
        visitor_id: payload.visitorId || null,
        event_type: 'reveal_failed',
        event_at: eventAt,
        path: '/reading.html',
        payload_json: serializePayload({
          error: payload.errorMessage || 'unknown error'
        })
      });

      return true;
    },
    getAdminOverview(rangeKey) {
      ensureAvailable(store);
      const since = getSinceTimestamp(rangeKey);
      const summary = store.stmts.summary.get(since, since, since, since);
      const ai = buildAiSummary(store.stmts.aiRows.all(since));

      return {
        range: normalizeRange(rangeKey),
        generated_at: Date.now(),
        summary: buildSummaryPayload(summary),
        funnel: buildFunnelPayload(summary),
        ai,
        traffic: {
          top_referrers: normalizeTopRows(store.stmts.topReferrers.all(since), 'referrer'),
          top_utm_campaigns: normalizeTopRows(store.stmts.topCampaigns.all(since), 'utm_campaign'),
          device_breakdown: normalizeTopRows(store.stmts.deviceBreakdown.all(since), 'device_type')
        },
        trend: buildTrendPayload(store.stmts.trendEvents.all(since), normalizeRange(rangeKey), timezone)
      };
    },
    getRecentReadings({ range = '7d', limit = 50, offset = 0 } = {}) {
      ensureAvailable(store);
      const since = getSinceTimestamp(range);
      return store.stmts.recentReadings.all(since, normalizeLimit(limit), normalizeOffset(offset));
    }
  };
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_sessions (
      session_id TEXT PRIMARY KEY,
      visitor_id TEXT,
      question_text TEXT,
      question_length INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      first_select_at INTEGER,
      completed_select_at INTEGER,
      reveal_started_at INTEGER,
      reveal_completed_at INTEGER,
      reveal_status TEXT NOT NULL DEFAULT 'pending',
      selected_count INTEGER NOT NULL DEFAULT 0,
      analysis_source TEXT,
      ai_status TEXT,
      ai_latency_ms INTEGER,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      landing_path TEXT,
      device_type TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS reading_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      visitor_id TEXT,
      event_type TEXT NOT NULL,
      event_at INTEGER NOT NULL,
      path TEXT,
      payload_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reading_sessions_created_at ON reading_sessions (created_at);
    CREATE INDEX IF NOT EXISTS idx_reading_sessions_reveal_completed_at ON reading_sessions (reveal_completed_at);
    CREATE INDEX IF NOT EXISTS idx_reading_events_event_at ON reading_events (event_at);
    CREATE INDEX IF NOT EXISTS idx_reading_events_type_event_at ON reading_events (event_type, event_at);
    CREATE INDEX IF NOT EXISTS idx_reading_events_session_id ON reading_events (session_id);
  `);
}

function prepareStatements(store) {
  const { db } = store;
  store.stmts = {
    insertSession: db.prepare(`
      INSERT INTO reading_sessions (${SESSION_COLUMNS.join(', ')})
      VALUES (@session_id, @visitor_id, @question_text, @question_length, @created_at, @first_select_at, @completed_select_at,
        @reveal_started_at, @reveal_completed_at, @reveal_status, @selected_count, @analysis_source, @ai_status, @ai_latency_ms,
        @referrer, @utm_source, @utm_medium, @utm_campaign, @landing_path, @device_type, @user_agent)
    `),
    insertEvent: db.prepare(`
      INSERT INTO reading_events (session_id, visitor_id, event_type, event_at, path, payload_json)
      VALUES (@session_id, @visitor_id, @event_type, @event_at, @path, @payload_json)
    `),
    updateSelection: db.prepare(`
      UPDATE reading_sessions
      SET
        first_select_at = COALESCE(first_select_at, @first_select_at),
        completed_select_at = COALESCE(@completed_select_at, completed_select_at),
        selected_count = @selected_count
      WHERE session_id = @session_id
    `),
    markRevealStarted: db.prepare(`
      UPDATE reading_sessions
      SET reveal_started_at = COALESCE(reveal_started_at, @reveal_started_at)
      WHERE session_id = @session_id
    `),
    completeReveal: db.prepare(`
      UPDATE reading_sessions
      SET
        reveal_completed_at = @reveal_completed_at,
        reveal_status = @reveal_status,
        analysis_source = @analysis_source,
        ai_status = @ai_status,
        ai_latency_ms = @ai_latency_ms
      WHERE session_id = @session_id
    `),
    failReveal: db.prepare(`
      UPDATE reading_sessions
      SET
        reveal_completed_at = @reveal_completed_at,
        reveal_status = 'error'
      WHERE session_id = @session_id
    `),
    summary: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM reading_events WHERE event_type = 'landing_view' AND event_at >= ?) AS landing_views,
        (SELECT COUNT(*) FROM reading_sessions WHERE created_at >= ?) AS reading_starts,
        (SELECT COUNT(*) FROM reading_sessions WHERE completed_select_at IS NOT NULL AND created_at >= ?) AS selection_completed,
        (SELECT COUNT(*) FROM reading_sessions WHERE reveal_status = 'success' AND created_at >= ?) AS reveal_successes
    `),
    aiRows: db.prepare(`
      SELECT ai_status, ai_latency_ms
      FROM reading_sessions
      WHERE created_at >= ?
        AND ai_status IS NOT NULL
    `),
    topReferrers: db.prepare(`
      SELECT referrer, COUNT(*) AS count
      FROM reading_sessions
      WHERE created_at >= ?
        AND referrer IS NOT NULL
        AND TRIM(referrer) != ''
      GROUP BY referrer
      ORDER BY count DESC, referrer ASC
      LIMIT 5
    `),
    topCampaigns: db.prepare(`
      SELECT utm_campaign, COUNT(*) AS count
      FROM reading_sessions
      WHERE created_at >= ?
        AND utm_campaign IS NOT NULL
        AND TRIM(utm_campaign) != ''
      GROUP BY utm_campaign
      ORDER BY count DESC, utm_campaign ASC
      LIMIT 5
    `),
    deviceBreakdown: db.prepare(`
      SELECT device_type, COUNT(*) AS count
      FROM reading_sessions
      WHERE created_at >= ?
      GROUP BY device_type
      ORDER BY count DESC, device_type ASC
    `),
    trendEvents: db.prepare(`
      SELECT event_type, event_at
      FROM reading_events
      WHERE event_at >= ?
        AND event_type IN ('landing_view', 'reading_started', 'reveal_succeeded')
      ORDER BY event_at ASC
    `),
    recentReadings: db.prepare(`
      SELECT
        session_id,
        created_at,
        question_text,
        selected_count,
        reveal_status,
        analysis_source,
        ai_status,
        ai_latency_ms,
        device_type,
        referrer
      FROM reading_sessions
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)
  };
}

function serializePayload(payload) {
  return JSON.stringify(payload || {});
}

function normalizeRange(rangeKey) {
  return RANGE_TO_MS[rangeKey] ? rangeKey : '7d';
}

function getSinceTimestamp(rangeKey) {
  const range = normalizeRange(rangeKey);
  return Date.now() - RANGE_TO_MS[range];
}

function normalizeLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return 50;
  }

  return Math.min(numeric, 200);
}

function normalizeOffset(offset) {
  const numeric = Number(offset);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
}

function ensureAvailable(store) {
  if (!store.available) {
    const error = new Error('analytics unavailable');
    error.code = 'ANALYTICS_UNAVAILABLE';
    throw error;
  }
}

function buildSummaryPayload(summaryRow = {}) {
  const landingViews = Number(summaryRow.landing_views || 0);
  const readingStarts = Number(summaryRow.reading_starts || 0);
  const selectionCompleted = Number(summaryRow.selection_completed || 0);
  const revealSuccesses = Number(summaryRow.reveal_successes || 0);

  return {
    landing_views: landingViews,
    reading_starts: readingStarts,
    selection_completed: selectionCompleted,
    reveal_successes: revealSuccesses,
    completion_rate: toRatio(selectionCompleted, readingStarts),
    reveal_rate: toRatio(revealSuccesses, readingStarts)
  };
}

function buildFunnelPayload(summaryRow = {}) {
  const landingViews = Number(summaryRow.landing_views || 0);
  const readingStarts = Number(summaryRow.reading_starts || 0);
  const selectionCompleted = Number(summaryRow.selection_completed || 0);
  const revealSuccesses = Number(summaryRow.reveal_successes || 0);

  return {
    landing_views: {
      count: landingViews,
      conversion_rate: 1
    },
    reading_starts: {
      count: readingStarts,
      conversion_rate: toRatio(readingStarts, landingViews)
    },
    selection_completed: {
      count: selectionCompleted,
      conversion_rate: toRatio(selectionCompleted, readingStarts)
    },
    reveal_successes: {
      count: revealSuccesses,
      conversion_rate: toRatio(revealSuccesses, selectionCompleted)
    }
  };
}

function buildAiSummary(rows) {
  const counts = {
    success_count: 0,
    fallback_count: 0,
    disabled_count: 0
  };
  const latencies = [];

  for (const row of rows) {
    if (row.ai_status === 'success') {
      counts.success_count += 1;
    } else if (row.ai_status === 'fallback') {
      counts.fallback_count += 1;
    } else if (row.ai_status === 'disabled') {
      counts.disabled_count += 1;
    }

    const latency = Number(row.ai_latency_ms);
    if (row.ai_status !== 'disabled' && Number.isFinite(latency)) {
      latencies.push(latency);
    }
  }

  const attemptedCount = counts.success_count + counts.fallback_count;
  latencies.sort((left, right) => left - right);

  return {
    ...counts,
    success_rate: toRatio(counts.success_count, attemptedCount),
    avg_latency_ms: latencies.length ? Math.round(latencies.reduce((sum, item) => sum + item, 0) / latencies.length) : null,
    p95_latency_ms: percentile(latencies, 0.95)
  };
}

function normalizeTopRows(rows, labelKey) {
  return rows.map((row) => ({
    [labelKey]: row[labelKey] || 'unknown',
    count: Number(row.count || 0)
  }));
}

function buildTrendPayload(rows, range, timezone) {
  const bucketFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    ...(range === '1d' ? { hour: '2-digit' } : {})
  });
  const buckets = new Map();

  for (const row of rows) {
    const bucket = formatBucket(bucketFormatter, row.event_at, range, timezone);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        bucket,
        landing_views: 0,
        reading_starts: 0,
        reveal_successes: 0
      });
    }

    const entry = buckets.get(bucket);
    if (row.event_type === 'landing_view') {
      entry.landing_views += 1;
    } else if (row.event_type === 'reading_started') {
      entry.reading_starts += 1;
    } else if (row.event_type === 'reveal_succeeded') {
      entry.reveal_successes += 1;
    }
  }

  return [...buckets.values()];
}

function formatBucket(formatter, timestamp, range, timezone) {
  const base = formatter.format(new Date(timestamp)).replace(/\//g, '-');
  if (range !== '1d') {
    return base;
  }

  const hourFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false
  });
  return `${base} ${hourFormatter.format(new Date(timestamp))}:00`;
}

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }

  const index = Math.max(0, Math.ceil(values.length * ratio) - 1);
  return values[index];
}

function toRatio(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

module.exports = {
  DEFAULT_DB_PATH,
  DEFAULT_TIMEZONE,
  createAnalyticsStore
};
