// A live browser description, not permission to execute. The server remains authoritative.
export function deriveDisplayView(view, now = Date.now()) {
  if (!view) return view;
  const original = view.proposal;
  const proposal = original ? { ...original,
    expired: original.expired || now >= original.expiresAt,
    stale: original.stale || original.epoch !== view.epoch || original.revision !== view.game.revision
      || original.rulesVersion !== view.game.rulesVersion } : null;
  let coach = view.coach;
  if (proposal?.decision === 'pending' && coach.status === 'review') {
    if (proposal.stale) coach = { ...coach, status: 'stale', reason: 'proposal_does_not_match_current_game' };
    else if (proposal.expired) coach = { ...coach, status: 'expired', reason: 'proposal_expired_local_clock' };
  }
  return { ...view, now, proposal, coach };
}
