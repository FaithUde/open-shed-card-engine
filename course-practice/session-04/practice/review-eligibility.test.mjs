import assert from 'node:assert/strict';
import test from 'node:test';
import { canApproveProposal } from './review-eligibility.mjs';
const view = { epoch: 2, now: 1000, game: { revision: 7, rulesVersion: 'merciless-baseline-v1' } };
const p = { epoch: 2, revision: 7, rulesVersion: 'merciless-baseline-v1', decision: 'pending', expiresAt: 2000 };
test('S7: current pending proposal can be reviewed', () => assert.equal(canApproveProposal(p, view), true));
test('S7: missing proposal remains blocked', () => assert.equal(canApproveProposal(null, view), false));
test('S7: rejected and already-executed proposals stay blocked', () => {
  for (const decision of ['rejected', 'executed', 'cancelled']) assert.equal(canApproveProposal({ ...p, decision }, view), false);
});
test('S7: a manual move or reset invalidates the old review', () => {
  assert.equal(canApproveProposal({ ...p, revision: 6 }, view), false);
  assert.equal(canApproveProposal({ ...p, epoch: 1 }, view), false);
});
test('S7: expiry and rules-version mismatch stay blocked', () => {
  assert.equal(canApproveProposal({ ...p, expiresAt: 1000 }, view), false);
  assert.equal(canApproveProposal({ ...p, rulesVersion: 'unapproved' }, view), false);
});
