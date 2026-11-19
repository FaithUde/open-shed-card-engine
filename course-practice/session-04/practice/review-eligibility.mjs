// Session 7: repair this CLIENT-SIDE review gate, not the fixed server safeguards.
// Enable approval only for a pending, unexpired proposal in this epoch/revision
// and rules version. The checkbox and authoritative engine checks remain separate.
export function canApproveProposal(proposal, view) {
  return false; // Safe starter: approval stays disabled until this repair.
}
