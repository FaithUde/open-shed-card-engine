import assert from 'node:assert/strict';
import test from 'node:test';
import { coachStatusMessage } from './coach-status.mjs';
test('S4: loading never claims the response is ready', () => assert.equal(coachStatusMessage('loading'), 'Checking one scripted response; keep playing manually.'));
test('S4: fallback and offline preserve a clear manual path', () => {
  for (const status of ['fallback', 'offline']) assert.equal(coachStatusMessage(status), 'No verified suggestion. Use the manual game controls.');
});
test('S4: review and executed are different states', () => {
  assert.equal(coachStatusMessage('review'), 'Review the exact proposal. No move has been played.');
  assert.equal(coachStatusMessage('executed'), 'The human-approved move was applied by the game engine.');
});
test('S4: idle or unknown does not claim an action', () => {
  assert.equal(coachStatusMessage('idle'), 'Ready for a scripted suggestion.');
  assert.equal(coachStatusMessage('unknown'), 'Ready for a scripted suggestion.');
});
