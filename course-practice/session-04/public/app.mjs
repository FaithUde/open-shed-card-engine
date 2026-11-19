import { coachStatusMessage } from '/practice/coach-status.mjs';
import { canApproveProposal } from '/practice/review-eligibility.mjs';
import { deriveDisplayView } from '/proposal-display.mjs';
const $ = (id) => document.getElementById(id);
let model, csrf, asking = false, lastProposalId;
const label = (card) => card ? `${card.color ?? 'Wild'} ${card.kind === 'number' ? card.number : card.kind.replaceAll('_', ' ')}` : 'None';
async function post(route, body) {
  const response = await fetch(`/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Token': csrf }, body: JSON.stringify(body) });
  const result = await response.json();
  if (result.view) { model = result.view; render(); }
  if (!response.ok) throw Error(result.error ?? 'Local request failed');
  return result;
}
function failure(error) { $('feedback').textContent = `Stopped safely: ${error.message}. Manual controls remain available.`; }
function manual(command) {
  return post('manual', { requestId: crypto.randomUUID(), expectedEpoch: model.epoch,
    expectedRevision: model.game.revision, command }).then(() => { $('feedback').textContent = 'The real engine applied your manual command.'; }).catch(failure);
}
function cardCommand(card) {
  const command = { type: 'play_card', cardId: card.id, declareUno: true };
  if (card.color === null && card.kind !== 'wild_color_roulette') command.chosenColor = $('color').value;
  if (card.kind === 'number' && card.number === 7) command.swapTargetId = model.game.players.find((player) => !player.isSelf && player.status === 'active').playerId;
  return command;
}
function updateApproval() {
  if (!model) return;
  const current = deriveDisplayView(model);
  $('coach-status').textContent = current.coach.status;
  $('coach-message').textContent = current.coach.status === 'expired'
    ? 'This proposal has expired. Ask for a fresh suggestion or keep playing manually.'
    : current.coach.status === 'stale'
      ? 'This proposal no longer matches the current game. Ask again or keep playing manually.'
      : coachStatusMessage(current.coach.status);
  $('coach-reason').textContent = current.coach.reason;
  $('proposal').textContent = current.proposal ? JSON.stringify(current.proposal, null, 2) : 'No proposal.';
  $('approve').disabled = asking || !$('acknowledge').checked || !canApproveProposal(current.proposal, current);
  $('reject').disabled = !model.proposal || model.proposal.decision !== 'pending';
}
function render() {
  const game = model.game;
  $('turn').textContent = game.winner ? `${game.winner.displayName} won (${game.winner.reason})` : game.currentPlayerName ?? game.phase;
  $('discard').textContent = `${label(game.topDiscard)} / ${game.activeColor ?? 'none'}`;
  $('revision').textContent = `${game.revision} / ${model.epoch}`;
  $('counts').textContent = game.players.map((player) => `${player.displayName}: ${player.cardCount}`).join(' · ');
  $('moves').textContent = String(model.executedMoves);
  $('hand').replaceChildren(...game.hand.map((card) => {
    const button = document.createElement('button'); button.textContent = label(card);
    button.disabled = !game.legalActions.playableCardIds.includes(card.id);
    button.dataset.cardId = card.id;
    const detail = document.createElement('small'); detail.textContent = card.id; button.append(detail);
    button.addEventListener('click', () => manual(cardCommand(card))); return button;
  }));
  for (const [id, action] of [['draw', 'canDrawUntilPlayable'], ['penalty', 'canAcceptPenalty'], ['roulette', 'canChooseRouletteColor'], ['uno', 'canDeclareUno']]) $(id).disabled = !game.legalActions[action];
  $('ask').disabled = asking;
  $('citation').textContent = model.coach.citation ? `${model.coach.text} [${model.coach.citation.ruleId}; ${model.coach.citation.rulesVersion}]` : '';
  if (lastProposalId !== model.proposal?.id) $('acknowledge').checked = false;
  lastProposalId = model.proposal?.id;
  $('audit').textContent = JSON.stringify(model.audit.slice(-5), null, 2);
  updateApproval();
  const canvas = $('board'), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#185f49'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 27px system-ui'; ctx.fillText(game.winner ? 'Round complete' : `${game.currentPlayerName}: your turn`, 26, 45);
  ctx.font = '19px system-ui'; ctx.fillText(`Top card: ${label(game.topDiscard)}`, 26, 89);
  ctx.fillText(`Active colour: ${game.activeColor}  |  Revision ${game.revision}`, 26, 126);
  ctx.fillText(`Draw pile: ${game.drawPileCount}  |  Penalty: ${game.pendingDraw?.total ?? 0}  |  Moves played: ${model.executedMoves}`, 26, 166);
  ctx.font = '15px system-ui'; ctx.fillText('Real engine. Synthetic hot-seat game. Coach does not auto-play.', 26, 201);
}
$('draw').addEventListener('click', () => manual({ type: 'draw_until_playable' }));
$('penalty').addEventListener('click', () => manual({ type: 'accept_penalty' }));
$('roulette').addEventListener('click', () => manual({ type: 'choose_roulette_color', color: $('color').value }));
$('uno').addEventListener('click', () => manual({ type: 'declare_uno' }));
$('reset').addEventListener('click', () => post('reset', {}).then(() => { $('feedback').textContent = 'Only this local synthetic game was reset.'; }).catch(failure));
$('ask').addEventListener('click', async () => {
  asking = true; model.coach = { status: 'loading', reason: 'one_bounded_scripted_attempt' }; render();
  try { await post('propose', { choice: $('script').value }); $('feedback').textContent = 'Coach request finished. No move was executed by asking.'; }
  catch (error) { model.coach = { status: 'fallback', reason: 'local_transport_error' }; failure(error); } finally { asking = false; render(); }
});
for (const decision of ['approve', 'reject']) $(decision).addEventListener('click', () => {
  const p = model.proposal; if (!p) return;
  post('decision', { proposalId: p.id, fingerprint: p.fingerprint, decision, acknowledged: $('acknowledge').checked })
    .then((result) => { $('feedback').textContent = `Human decision: ${result.status}. Check the engine revision and move count.`; }).catch(failure);
});
$('acknowledge').addEventListener('change', updateApproval);
setInterval(updateApproval, 500);
window.render_game_to_text = () => {
  const current = deriveDisplayView(model);
  return JSON.stringify({ coordinateSystem: 'canvas origin top-left; x right, y down; turn-based with no physical movement',
    mode: current?.mode, epoch: current?.epoch, game: current?.game, coach: current?.coach, proposal: current?.proposal, executedMoves: current?.executedMoves });
};
window.advanceTime = (ms) => { if (!Number.isFinite(ms) || ms < 0 || ms > 5000) throw Error('Bounded nonnegative time only'); if (model) render(); return window.render_game_to_text(); };
try {
  const response = await fetch('/api/state'); if (!response.ok) throw Error('Local game unavailable');
  const initial = await response.json(); csrf = initial.csrf; model = initial.view; render();
  $('feedback').textContent = 'Local engine ready. You can play manually with the Coach off.';
} catch (error) { failure(error); }
