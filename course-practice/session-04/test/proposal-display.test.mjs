import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDisplayView } from '../public/proposal-display.mjs';

const fixture = () => ({ now: 1000, epoch: 1, game: { revision: 4, rulesVersion: 'teaching-v1' },
  coach: { status: 'review', reason: 'human_decision_required' }, executedMoves: 0,
  proposal: { id: 'synthetic', epoch: 1, revision: 4, rulesVersion: 'teaching-v1', expiresAt: 31000,
    decision: 'pending', expired: false, stale: false } });

test('live expiry description changes at the deadline without a new server response or mutation', () => {
  const view = fixture(), before = structuredClone(view);
  assert.equal(deriveDisplayView(view, 30999).coach.status, 'review');
  const expired = deriveDisplayView(view, 31000);
  assert.equal(expired.proposal.expired, true);
  assert.equal(expired.coach.status, 'expired');
  assert.equal(expired.coach.reason, 'proposal_expired_local_clock');
  assert.equal(expired.executedMoves, 0);
  assert.deepEqual(view, before);
});
test('current epoch, revision and rules changes each produce a truthful stale description', () => {
  for (const change of [v => v.epoch++, v => v.game.revision++, v => { v.game.rulesVersion = 'teaching-v2'; }]) {
    const view = fixture(); change(view);
    const current = deriveDisplayView(view, 1001);
    assert.equal(current.proposal.stale, true);
    assert.equal(current.coach.status, 'stale');
    assert.equal(current.coach.reason, 'proposal_does_not_match_current_game');
  }
});
test('server-reported expiry and staleness are never cleared by an older local clock', () => {
  const view = fixture(); view.proposal.expired = true;
  assert.equal(deriveDisplayView(view, 0).coach.status, 'expired');
  view.proposal.stale = true;
  const current = deriveDisplayView(view, 0);
  assert.equal(current.proposal.expired, true);
  assert.equal(current.proposal.stale, true);
  assert.equal(current.coach.status, 'stale');
});
test('executed or rejected decisions retain their terminal description after expiry', () => {
  for (const status of ['executed', 'rejected']) {
    const view = fixture(); view.proposal.decision = status; view.coach.status = status;
    assert.equal(deriveDisplayView(view, 99999).coach.status, status);
  }
});
test('no proposal and a new loading/fallback state do not acquire an old proposal review message', () => {
  assert.equal(deriveDisplayView(undefined, 0), undefined);
  const empty = fixture(); empty.proposal = null;
  assert.equal(deriveDisplayView(empty, 99999).proposal, null);
  for (const status of ['loading', 'fallback', 'offline']) {
    const view = fixture(); view.coach.status = status;
    assert.equal(deriveDisplayView(view, 99999).coach.status, status);
  }
});
