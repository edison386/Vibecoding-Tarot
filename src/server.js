const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createSession, selectCard, revealReading, getSession } = require('./lib/sessionStore');
const { enhanceReadingWithAI } = require('./lib/aiReading');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

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

async function handleApi(req, res) {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'POST' && req.url === '/api/reading/start') {
    try {
      const body = await parseJsonBody(req);
      const result = createSession(body.question);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  const selectMatch = req.url.match(/^\/api\/reading\/([a-f0-9-]+)\/select$/);
  if (req.method === 'POST' && selectMatch) {
    try {
      const body = await parseJsonBody(req);
      const result = selectCard(selectMatch[1], body.card_id);
      sendJson(res, 200, result);
    } catch (error) {
      const status = error.message === 'session not found' ? 404 : 400;
      sendJson(res, status, { error: error.message });
    }
    return true;
  }

  const revealMatch = req.url.match(/^\/api\/reading\/([a-f0-9-]+)\/reveal$/);
  if (req.method === 'POST' && revealMatch) {
    try {
      const session = getSession(revealMatch[1]);
      if (!session) {
        throw new Error('session not found');
      }

      const baseResult = revealReading(revealMatch[1]);
      const result = await enhanceReadingWithAI({
        question: session.question,
        baseResult,
        userId: session.id
      });
      sendJson(res, 200, result);
    } catch (error) {
      const status = error.message === 'session not found' ? 404 : 400;
      sendJson(res, status, { error: error.message });
    }
    return true;
  }

  return false;
}

async function serveStatic(req, res) {
  const requestedPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(requestedPath).replace(/^\.\.(\/|\\|$)/, '');
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

const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res)) {
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Tarot app running on http://${HOST}:${PORT}\n`);
});
