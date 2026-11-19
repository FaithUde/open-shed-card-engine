import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLab, LabError } from './src/lab.mjs';
import { exactRecord } from './vendor/coach/contracts.mjs';

const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']], ['/app.mjs', ['public/app.mjs', 'text/javascript; charset=utf-8']],
  ['/proposal-display.mjs', ['public/proposal-display.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/practice/coach-status.mjs', ['practice/coach-status.mjs', 'text/javascript; charset=utf-8']],
  ['/practice/review-eligibility.mjs', ['practice/review-eligibility.mjs', 'text/javascript; charset=utf-8']],
].map(([route, [file, type]]) => [route, { bytes: readFileSync(new URL(file, import.meta.url)), type }]));
export async function startServer({ port = 0, lab = createLab() } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Use a numeric local port.');
  let origin; const csrf = randomBytes(24).toString('hex');
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'" };
  const server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json') => { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(value) : value); };
    try {
      if (req.headers.host !== new URL(origin).host || req.socket.remoteAddress !== '127.0.0.1') return send(403, { error: 'loopback_only' });
      const url = new URL(req.url, origin);
      if (url.origin !== origin || url.search || url.hash) return send(400, { error: 'fixed_routes_only' });
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'same_origin_only' });
      if (req.method === 'GET' && assets.has(url.pathname)) { const asset = assets.get(url.pathname); return send(200, asset.bytes, asset.type); }
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, { csrf, view: lab.view() });
      if (req.method !== 'POST' || !['/api/manual', '/api/propose', '/api/decision', '/api/reset'].includes(url.pathname)) return send(404, { error: 'unknown_route' });
      if (req.headers.origin !== origin || req.headers['x-lab-token'] !== csrf || req.headers['content-type'] !== 'application/json') return send(403, { error: 'same_origin_control_required' });
      const chunks = []; let count = 0;
      for await (const chunk of req) { count += chunk.length; if (count > 2048) { send(413, { error: 'bounded_input_only' }); req.destroy(); return; } chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      let result;
      if (url.pathname === '/api/manual') result = lab.manual(body);
      if (url.pathname === '/api/decision') result = lab.decide(body);
      if (url.pathname === '/api/propose') {
        if (!body || Object.keys(body).join(',') !== 'choice' || typeof body.choice !== 'string') throw new LabError('named_script_only', 400);
        result = await lab.propose(body.choice);
      }
      if (url.pathname === '/api/reset') { if (!exactRecord(body, [])) throw new LabError('empty_reset_only', 400); result = lab.reset(); }
      send(200, result);
    } catch (error) {
      if (!res.headersSent) send(error instanceof LabError ? error.status : 422, { error: error.reason ?? error.code ?? 'invalid_local_request', view: lab.view() });
    }
  });
  server.requestTimeout = 4000; server.headersTimeout = 4000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, lab, async close() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.versions.node !== '22.14.0') throw Error('Use Node 22.14.0.');
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) throw Error('Use node server.mjs [--port 4174]. Host is always 127.0.0.1.');
  const server = await startServer({ port: args.length ? Number(args[1]) : 0 });
  console.log(`Local synthetic Open Shed game: ${server.origin}\nReal pinned engine; scripted Coach only. Ctrl+C stops only this server.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
}
