import test from 'node:test';
import assert from 'node:assert/strict';
import { createLab, commandForCard } from '../src/lab.mjs';
import { assertGameInvariants } from '../vendor/engine/invariants.mjs';
import { createFixtureProvider } from '../vendor/coach/provider.mjs';
import { createFixtureTool } from '../vendor/coach/tools.mjs';

const request = (lab, command, id = 'one') => ({ requestId: id, expectedEpoch: lab.view().epoch, expectedRevision: lab.view().game.revision, command });
const move = (lab, id = 'one') => { const v = lab.view().game; return lab.manual(request(lab, commandForCard(v, v.legalActions.playableCardIds[0]), id)); };
const review = (p, decision = 'approve', acknowledged = true) => ({ proposalId: p.id, fingerprint: p.fingerprint, decision, acknowledged });
const rejects = (action, reason) => assert.throws(action, (error) => (error.reason ?? error.code) === reason);

test('real pinned engine deals a conserved 168-card game and changes hands/turns', () => {
  const lab = createLab(), before = lab.debugSnapshot();
  assertGameInvariants(before); assert.equal(before.players.reduce((sum, p) => sum + p.hand.length, 0), 14);
  const chosen = lab.view().game.legalActions.playableCardIds[0];
  move(lab); const after = lab.debugSnapshot(); assertGameInvariants(after);
  assert.equal(after.discardPile.at(-1).id, chosen); assert.equal(after.revision, before.revision + 1);
  assert.notEqual(after.currentPlayerId, before.currentPlayerId); assert.equal(lab.view().executedMoves, 1);
});
test('ordinary game reaches a real winner with Coach off, through bounded legal actions', async () => {
  const lab = createLab(); await lab.propose('off'); let steps = 0;
  while (lab.view().game.phase === 'playing' && steps < 600) {
    const v = lab.view().game, a = v.legalActions;
    const command = a.canChooseRouletteColor ? { type: 'choose_roulette_color', color: 'red' }
      : a.playableCardIds.length ? commandForCard(v, a.playableCardIds[0])
      : a.canAcceptPenalty ? { type: 'accept_penalty' } : { type: 'draw_until_playable' };
    lab.manual(request(lab, command, `round-${steps++}`)); assertGameInvariants(lab.debugSnapshot());
  }
  assert.equal(lab.view().game.phase, 'complete'); assert.ok(lab.view().game.winner);
  assert.ok(steps > 1 && steps < 600); assert.equal(lab.view().coach.status, 'offline');
});
test('ask has no side effect; exact acknowledged approval really executes once', async () => {
  const lab = createLab(), before = lab.debugSnapshot(); await lab.propose('allowed'); const p = lab.view().proposal;
  assert.deepEqual(lab.debugSnapshot(), before); assert.equal(lab.view().executedMoves, 0);
  assert.equal(lab.decide(review(p)).status, 'executed'); const after = lab.debugSnapshot();
  assert.equal(after.discardPile.at(-1).id, p.command.cardId); assert.equal(after.revision, before.revision + 1);
  assert.equal(lab.decide(review(p)).status, 'already_executed'); assert.deepEqual(lab.debugSnapshot(), after);
});
test('missing approval and a modified fingerprint cannot apply a move', async () => {
  const lab = createLab(); await lab.propose('allowed'); const p = lab.view().proposal, before = lab.debugSnapshot();
  rejects(() => lab.decide(review(p, 'approve', false)), 'explicit_review_required');
  rejects(() => lab.decide({ ...review(p), fingerprint: 'changed' }), 'exact_proposal_required');
  rejects(() => lab.decide({ ...review(p), command: { type: 'play_card', cardId: 'invented' } }), 'invalid_review');
  assert.deepEqual(lab.debugSnapshot(), before);
});
test('human rejection remains final and never changes the game', async () => {
  const lab = createLab(); await lab.propose('allowed'); const p = lab.view().proposal, before = lab.debugSnapshot();
  assert.equal(lab.decide(review(p, 'reject', false)).status, 'rejected');
  rejects(() => lab.decide(review(p)), 'decision_already_consumed'); assert.deepEqual(lab.debugSnapshot(), before);
});
test('manual play makes the previous proposal stale', async () => {
  const lab = createLab(); await lab.propose('allowed'); const p = lab.view().proposal; move(lab);
  const after = lab.debugSnapshot(); rejects(() => lab.decide(review(p)), 'stale_proposal'); assert.deepEqual(lab.debugSnapshot(), after);
});
test('reset prevents approval from an earlier epoch even at the same revision', async () => {
  const lab = createLab(); await lab.propose('allowed'); const p = lab.view().proposal; lab.reset();
  assert.equal(lab.view().game.revision, p.revision); const after = lab.debugSnapshot();
  rejects(() => lab.decide(review(p)), 'stale_proposal'); assert.deepEqual(lab.debugSnapshot(), after);
});
test('expiry is enforced by the server, not only the browser', async () => {
  let now = 1000; const lab = createLab({ clock: () => now }); await lab.propose('allowed'); const p = lab.view().proposal;
  now = p.expiresAt; rejects(() => lab.decide(review(p)), 'proposal_expired'); assert.equal(lab.view().executedMoves, 0);
});
test('illegal manual cards and unknown command types are rejected by guards/engine', () => {
  const lab = createLab(), before = lab.debugSnapshot();
  rejects(() => lab.manual(request(lab, { type: 'play_card', cardId: 'invented-card' })), 'CARD_NOT_IN_HAND');
  const v = lab.view().game, illegal = v.hand.find((card) => !v.legalActions.playableCardIds.includes(card.id));
  assert.ok(illegal); rejects(() => lab.manual(request(lab, commandForCard(v, illegal.id))), 'CARD_NOT_PLAYABLE');
  rejects(() => lab.manual(request(lab, { type: 'execute_arbitrary' })), 'command_not_allowlisted');
  assert.deepEqual(lab.debugSnapshot(), before);
});
test('manual duplicate requests apply once and cannot be reused for changed actions', () => {
  const lab = createLab(), v = lab.view().game, body = request(lab, commandForCard(v, v.legalActions.playableCardIds[0]));
  lab.manual(body); const after = lab.debugSnapshot(); assert.equal(lab.manual(body).status, 'already_applied');
  rejects(() => lab.manual({ ...body, command: { type: 'draw_until_playable' } }), 'request_id_reused');
  assert.deepEqual(lab.debugSnapshot(), after);
});
test('malformed, unpermitted, failed and timed-out scripts stop; manual game survives', async () => {
  for (const choice of ['malformed', 'illegal', 'failure', 'timeout']) {
    const lab = createLab({ deadlineMs: choice === 'timeout' ? 20 : 700 }), before = lab.debugSnapshot();
    assert.equal((await lab.propose(choice)).status, 'stopped'); assert.equal(lab.view().proposal, null);
    assert.deepEqual(lab.debugSnapshot(), before); move(lab); assert.equal(lab.view().executedMoves, 1);
  }
});
test('provider sees only aliases and exact small context, never the game view', async () => {
  let captured;
  const lab = createLab({ providerFactory(script) { const p = createFixtureProvider(script); return { ...p, async next(context, options) { captured = context; return p.next(context, options); } }; } });
  await lab.propose('allowed'); assert.deepEqual(Object.keys(captured).sort(), ['mode', 'playableOptionIds', 'requestedRule', 'revision', 'rulesVersion']);
  assert.ok(captured.playableOptionIds.every((id) => /^practice-option-\d+$/.test(id)));
  assert.ok(!JSON.stringify(captured).includes('synthetic-')); assert.ok(!JSON.stringify(captured).includes('red-number'));
});
test('altered rule source cannot authorize a proposal', async () => {
  const lab = createLab({ toolFactory: () => createFixtureTool({ tamper: true }) });
  assert.equal((await lab.propose('allowed')).status, 'stopped'); assert.equal(lab.view().coach.reason, 'unapproved_rule_source');
  assert.equal(lab.view().executedMoves, 0);
});
test('manual movement during a pending request discards the late response', async () => {
  const lab = createLab(), pending = lab.propose('allowed'); move(lab);
  await pending; assert.equal(lab.view().coach.reason, 'stale_provider_reply'); assert.equal(lab.view().proposal, null); assert.equal(lab.view().executedMoves, 1);
});
test('only one request can run; off cancels a pending response without auto-play', async () => {
  const lab = createLab(), pending = lab.propose('allowed');
  await assert.rejects(lab.propose('allowed'), (e) => e.reason === 'coach_busy');
  await lab.propose('off'); await pending; assert.equal(lab.view().coach.status, 'offline'); assert.equal(lab.view().proposal, null); assert.equal(lab.view().executedMoves, 0);
});
test('sanitised audit has bounded metadata only and view mutation cannot change state', async () => {
  const lab = createLab(); await lab.propose('allowed'); lab.decide(review(lab.view().proposal, 'reject'));
  for (const event of lab.view().audit) assert.deepEqual(Object.keys(event).sort(), ['epoch', 'reason', 'revision', 'status']);
  const view = lab.view(); view.game.hand.length = 0; assert.equal(lab.view().game.hand.length, 7);
});
