import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Authority, checksum } from './authority.js';
import { loadContent } from './content.js';
import { RuleError } from '../rules/actions.js';

const projectRoot = new URL('../../', import.meta.url);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

export async function createApp({ databasePath, port = 0, host = '127.0.0.1', actionRegistry, roll } = {}) {
  if (!databasePath) {
    await mkdir(new URL('.runtime/', projectRoot), { recursive: true });
    databasePath = fileURLToPath(new URL('.runtime/rooms.sqlite', projectRoot));
  }
  const content = await loadContent(projectRoot);
  const authority = new Authority(databasePath, content, actionRegistry, roll);
  const streams = new Map();
  let presenceSequence = 0;
  const envelope = code => {
    const state = authority.room(code).state;
    const clients = streams.get(code) ?? new Set();
    return { state, checksum: checksum(state), presence: { A: [...clients].some(c => c.player === 'A'), B: [...clients].some(c => c.player === 'B') }, presenceSequence: ++presenceSequence };
  };
  function broadcast(code) {
    const clients = streams.get(code);
    if (!clients?.size) return;
    try {
      const message = JSON.stringify(envelope(code)) + '\n';
      for (const client of clients) {
        if (client.res.writableLength > 1024 * 1024) client.res.destroy();
        else client.res.write(message);
      }
    } catch (error) {
      for (const client of clients) client.res.end(JSON.stringify({ error: { code: error.code, message: error.message } }) + '\n');
    }
  }
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  async function readJson(req) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 8192) throw new RuleError('TOO_LARGE', 'Request is too large.', 413);
    }
    try { return JSON.parse(body || '{}'); }
    catch { throw new RuleError('BAD_JSON', 'Request must contain valid JSON.', 400); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new RuleError('ORIGIN', 'Cross-origin requests are not allowed.', 403);
      if (req.method === 'GET' && url.pathname === '/api/content') return send(res, 200, content);
      if (req.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readJson(req);
        return send(res, 201, authority.create(body.requestToken));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join|state|stream|actions)$/);
      if (match) {
        const [, code, operation] = match;
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (operation === 'join' && req.method === 'POST') {
          const body = await readJson(req);
          const joined = authority.join(code, body.requestToken);
          broadcast(code);
          return send(res, 200, joined);
        }
        if (operation === 'state' && req.method === 'GET') {
          authority.snapshot(code, token);
          return send(res, 200, envelope(code));
        }
        if (operation === 'actions' && req.method === 'POST') {
          const result = authority.command(code, token, await readJson(req));
          broadcast(code);
          return send(res, 200, result);
        }
        if (operation === 'stream' && req.method === 'GET') {
          const { player } = authority.snapshot(code, token);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          const client = { player, res };
          if (!streams.has(code)) streams.set(code, new Set());
          streams.get(code).add(client);
          broadcast(code);
          const heartbeat = setInterval(() => {
            try { authority.room(code); res.write('{"heartbeat":true}\n'); }
            catch (error) { res.end(JSON.stringify({ error: { code: error.code, message: error.message } }) + '\n'); }
          }, 5000);
          res.on('close', () => {
            clearInterval(heartbeat);
            streams.get(code)?.delete(client);
            if (!streams.get(code)?.size) streams.delete(code);
            else broadcast(code);
          });
          return;
        }
      }
      if (url.pathname.startsWith('/api/')) throw new RuleError('NOT_FOUND', 'Room not found or invalid request.', 404);
      if (req.method !== 'GET') throw new RuleError('NOT_FOUND', 'Not found.', 404);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      if (!/^\/(index\.html|style\.css|src\/(main\.js|(?:rules|state|multiplayer|game|ui)\/[A-Za-z0-9_-]+\.js))$/.test(pathname)) throw new RuleError('NOT_FOUND', 'Not found.', 404);
      const bytes = await readFile(new URL(`.${pathname}`, projectRoot));
      res.writeHead(200, { 'Content-Type': mime[path.extname(pathname)] ?? 'text/plain', 'Cache-Control': 'no-cache' });
      res.end(bytes);
    } catch (error) {
      if (!res.headersSent) send(res, error.status ?? (error.code === 'ENOENT' ? 404 : 500), { error: { code: error.code ?? 'SERVER_ERROR', message: error instanceof RuleError ? error.message : 'Server error. Reconnect and try again.' } });
      else res.end();
      if (!(error instanceof RuleError) && error.code !== 'ENOENT') console.error(error);
    }
  });
  await new Promise(resolve => server.listen(port, host, resolve));
  const automaticTimer = setInterval(() => {
    for (const code of streams.keys()) {
      try { if (authority.advanceAutomatic(code)) broadcast(code); }
      catch (error) { if (error instanceof RuleError) broadcast(code); else console.error(error); }
    }
  }, 500);
  return {
    server, authority, port: server.address().port,
    async close() {
      clearInterval(automaticTimer);
      for (const clients of streams.values()) for (const client of clients) client.res.destroy();
      await new Promise(resolve => server.close(resolve));
      authority.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0', databasePath: process.env.WRECKLANDS_DB });
  console.log(`WRECKLANDS Phase 2 listening on http://localhost:${app.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
