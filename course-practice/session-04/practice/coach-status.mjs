// Session 4: repair only this function. The supplied browser imports it.
// Keep error/offline/timeout states honest: the game is still usable manually.
export function coachStatusMessage(status) {
  switch (status) {
    case 'loading':
      return 'Checking one scripted response; keep playing manually.';
    case 'fallback':
    case 'offline':
      return 'No verified suggestion. Use the manual game controls.';
    case 'review':
      return 'Review the exact proposal. No move has been played.';
    case 'executed':
      return 'The human-approved move was applied by the game engine.';
    default:
      return 'Ready for a scripted suggestion.';
  }
}
