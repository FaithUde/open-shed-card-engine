import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../server.mjs';

function http(origin, route, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${route}`, { method: options.method ?? 'GET', headers: options.headers ?? {} }, (res) => {
      let text = ''; res.on('data', (chunk) => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    }); req.on('error', reject); req.end(options.body);
  });
}
test('loopback HTTP serves actual page/modules but refuses internal files and external origin', async () => {
  const server = await startServer();
  try {
    const html = await http(server.origin, '/'); assert.equal(html.status, 200); assert.match(html.text, /real pinned game engine/i);
    assert.match(html.headers['content-security-policy'], /connect-src 'self'/);
    assert.equal((await http(server.origin, '/app.mjs')).status, 200);
    assert.equal((await http(server.origin, '/proposal-display.mjs')).status, 200);
    for (const route of ['/src/lab.mjs', '/source-manifest.json', '/_trainer/reference.mjs', '/.env', '/?url=https://example.invalid'])
      assert.ok([400, 404].includes((await http(server.origin, route)).status));
    assert.equal((await http(server.origin, '/api/state', { headers: { Host: 'live.example' } })).status, 403);
    assert.equal((await http(server.origin, '/api/state', { headers: { Origin: 'https://live.example' } })).status, 403);
  } finally { await server.close(); }
});
test('HTTP proposal and explicit decision execute a real move; CSRF/malformed reset denied', async () => {
  const server = await startServer();
  try {
    const initial = JSON.parse((await http(server.origin, '/api/state')).text);
    const headers = { Origin: server.origin, 'Content-Type': 'application/json', 'X-Lab-Token': initial.csrf };
    const post = (route, body, supplied = headers) => http(server.origin, route, { method: 'POST', headers: supplied, body: JSON.stringify(body) });
    assert.equal((await post('/api/reset', {}, {})).status, 403);
    assert.equal((await post('/api/reset', true)).status, 400);
    assert.equal((await post('/api/propose', { choice: 'allowed', private: 'not accepted' })).status, 400);
    const proposal = JSON.parse((await post('/api/propose', { choice: 'allowed' })).text).view.proposal;
    const review = { proposalId: proposal.id, fingerprint: proposal.fingerprint, decision: 'approve', acknowledged: false };
    assert.equal((await post('/api/decision', review)).status, 409); assert.equal(server.lab.view().executedMoves, 0);
    const result = JSON.parse((await post('/api/decision', { ...review, acknowledged: true })).text);
    assert.equal(result.status, 'executed'); assert.equal(result.view.executedMoves, 1);
    assert.equal(result.view.game.topDiscard.id, proposal.command.cardId); assert.equal(result.view.game.revision, initial.view.game.revision + 1);
  } finally { await server.close(); }
});
