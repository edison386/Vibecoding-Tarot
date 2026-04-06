const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createSession, selectCard, revealReading, getSession } = require('./lib/sessionStore');
const { enhanceReadingWithAI, isSparkEnabled } = require('./lib/aiReading');
const { createAnalyticsStore } = require('./lib/analyticsStore');

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DEFAULT_HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const RANGE_OPTIONS = new Set(['1d', '7d', '30d']);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function parseJsonBody(req) {
  let body = '';

  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error('request body too large');
    }
  }

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('invalid json body');
  }
}

function normalizeRange(range) {
  return RANGE_OPTIONS.has(range) ? range : '7d';
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

function normalizeTrackingBody(body = {}) {
  return {
    path: typeof body.path === 'string' && body.path ? body.path : '/',
    referrer: typeof body.referrer === 'string' ? body.referrer : '',
    utmSource: typeof body.utm_source === 'string' ? body.utm_source : '',
    utmMedium: typeof body.utm_medium === 'string' ? body.utm_medium : '',
    utmCampaign: typeof body.utm_campaign === 'string' ? body.utm_campaign : '',
    sessionId: typeof body.session_id === 'string' ? body.session_id : null
  };
}

function getVisitorId(req) {
  return typeof req.headers['x-visitor-id'] === 'string' && req.headers['x-visitor-id'].trim()
    ? req.headers['x-visitor-id'].trim()
    : null;
}

function getDeviceType(userAgent = '') {
  if (!userAgent) {
    return 'unknown';
  }

  const normalized = userAgent.toLowerCase();
  if (/ipad|tablet/.test(normalized)) {
    return 'tablet';
  }

  if (/mobile|iphone|android/.test(normalized)) {
    return 'mobile';
  }

  return 'desktop';
}

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') {
    return '';
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function isAuthorizedAdmin(req, adminToken) {
  const received = readBearerToken(req);
  if (!adminToken || !received) {
    return false;
  }

  const expectedBuffer = Buffer.from(adminToken);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function writeAnalytics(logger, operation) {
  try {
    operation();
  } catch (error) {
    logger.error(`[analytics] write failed: ${error.message}`);
  }
}

function readAnalyticsOr503(res, logger, operation) {
  try {
    return operation();
  } catch (error) {
    logger.error(`[analytics] read failed: ${error.message}`);
    sendJson(res, 503, { error: 'analytics unavailable' });
    return null;
  }
}

async function serveStatic(res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
}

function createServer({
  analyticsStore = createAnalyticsStore(),
  adminToken = process.env.ADMIN_TOKEN || '',
  logger = console
} = {}) {
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = requestUrl.pathname;
    const visitorId = getVisitorId(req);
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    const deviceType = getDeviceType(userAgent);

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/healthz')) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/analytics/pageview') {
      try {
        const body = normalizeTrackingBody(await parseJsonBody(req));
        const tracked = analyticsStore.isAvailable()
          ? analyticsStore.trackPageView({
              ...body,
              visitorId,
              deviceType,
              userAgent
            })
          : false;
        sendJson(res, 200, { ok: true, tracked });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/reading/start') {
      try {
        const body = await parseJsonBody(req);
        const result = createSession(body.question);
        const session = getSession(result.session_id);
        const tracking = normalizeTrackingBody(body);
        const createdAt = Date.now();

        writeAnalytics(logger, () => {
          analyticsStore.createReadingSession({
            sessionId: result.session_id,
            visitorId,
            questionText: session ? session.question : String(body.question || ''),
            createdAt,
            referrer: tracking.referrer,
            utmSource: tracking.utmSource,
            utmMedium: tracking.utmMedium,
            utmCampaign: tracking.utmCampaign,
            landingPath: tracking.path,
            deviceType,
            userAgent
          });
        });

        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    const selectMatch = pathname.match(/^\/api\/reading\/([a-f0-9-]+)\/select$/);
    if (req.method === 'POST' && selectMatch) {
      try {
        const body = await parseJsonBody(req);
        const result = selectCard(selectMatch[1], body.card_id);

        writeAnalytics(logger, () => {
          analyticsStore.trackCardSelection({
            sessionId: selectMatch[1],
            visitorId,
            cardId: body.card_id,
            selectedCount: result.selected_count,
            isComplete: result.is_complete,
            eventAt: Date.now()
          });
        });

        sendJson(res, 200, result);
      } catch (error) {
        const status = error.message === 'session not found' ? 404 : 400;
        sendJson(res, status, { error: error.message });
      }
      return;
    }

    const revealMatch = pathname.match(/^\/api\/reading\/([a-f0-9-]+)\/reveal$/);
    if (req.method === 'POST' && revealMatch) {
      const sessionId = revealMatch[1];
      let shouldTrackRevealFailure = false;

      try {
        const session = getSession(sessionId);
        if (!session) {
          throw new Error('session not found');
        }
        shouldTrackRevealFailure = true;

        writeAnalytics(logger, () => {
          analyticsStore.markRevealStarted({
            sessionId,
            visitorId,
            eventAt: Date.now()
          });
        });

        const baseResult = revealReading(sessionId);
        const sparkEnabled = isSparkEnabled();
        const aiStartedAt = sparkEnabled ? Date.now() : 0;
        const result = await enhanceReadingWithAI({
          question: session.question,
          baseResult,
          userId: session.id
        });
        const aiStatus = sparkEnabled ? (result.analysis_source === 'spark' ? 'success' : 'fallback') : 'disabled';
        const aiLatencyMs = sparkEnabled ? Date.now() - aiStartedAt : null;

        writeAnalytics(logger, () => {
          analyticsStore.completeReveal({
            sessionId,
            visitorId,
            analysisSource: result.analysis_source,
            aiStatus,
            aiLatencyMs,
            eventAt: Date.now()
          });
        });

        sendJson(res, 200, result);
      } catch (error) {
        if (shouldTrackRevealFailure) {
          writeAnalytics(logger, () => {
            analyticsStore.failReveal({
              sessionId,
              visitorId,
              eventAt: Date.now(),
              errorMessage: error.message
            });
          });
        }

        const status = error.message === 'session not found' ? 404 : 400;
        sendJson(res, status, { error: error.message });
      }
      return;
    }

    if (pathname === '/api/admin/overview' || pathname === '/api/admin/readings') {
      if (!adminToken) {
        sendJson(res, 503, { error: 'admin api disabled' });
        return;
      }

      if (!isAuthorizedAdmin(req, adminToken)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }

      if (!analyticsStore.isAvailable()) {
        sendJson(res, 503, { error: 'analytics unavailable' });
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const range = normalizeRange(requestUrl.searchParams.get('range'));
      const payload = readAnalyticsOr503(res, logger, () => analyticsStore.getAdminOverview(range));
      if (payload) {
        sendJson(res, 200, payload);
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/readings') {
      const range = normalizeRange(requestUrl.searchParams.get('range'));
      const limit = normalizeLimit(requestUrl.searchParams.get('limit'));
      const offset = normalizeOffset(requestUrl.searchParams.get('offset'));
      const rows = readAnalyticsOr503(res, logger, () => analyticsStore.getRecentReadings({ range, limit, offset }));
      if (rows) {
        sendJson(res, 200, {
          range,
          limit,
          offset,
          readings: rows
        });
      }
      return;
    }

    await serveStatic(res, pathname);
  });
}

function startServer({
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  analyticsStore,
  adminToken,
  logger = console
} = {}) {
  const server = createServer({
    analyticsStore,
    adminToken,
    logger
  });

  server.listen(port, host, () => {
    process.stdout.write(`Tarot app running on http://${host}:${port}\n`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  getDeviceType,
  normalizeRange,
  sendJson,
  startServer
};
