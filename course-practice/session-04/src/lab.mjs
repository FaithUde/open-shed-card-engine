import { createHash, randomUUID } from 'node:crypto';
import { createLobbyState, joinLobbyState, transitionGame } from '../vendor/engine/engine.mjs';
import { projectGameForUser } from '../vendor/engine/projection.mjs';
import { assertGameInvariants } from '../vendor/engine/invariants.mjs';
import { exactRecord, parseDecision } from '../vendor/coach/contracts.mjs';
import { createFixtureProvider } from '../vendor/coach/provider.mjs';
import { createFixtureTool, admitSource } from '../vendor/coach/tools.mjs';

export const ENGINE_PIN = 'f20a5c15bfb2b1aa943f61f8b17bcbd27f185c40';
export const CHOICES = ['allowed', 'malformed', 'illegal', 'failure', 'timeout', 'off'];
const COLORS = ['red', 'yellow', 'green', 'blue'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = (value) => structuredClone(value);
export class LabError extends Error {
  constructor(reason, status = 409) { super(reason); this.reason = reason; this.status = status; }
}
const check = (condition, reason, status) => { if (!condition) throw new LabError(reason, status); };

function newGame(seed) {
  let state = createLobbyState({ gameId: 'synthetic-local-game', joinCode: 'LOCAL', hostUserId: 'synthetic-a',
    hostPlayerId: 'player-a', hostDisplayName: 'Practice A', now: 0, seed });
  state = joinLobbyState(state, { userId: 'synthetic-b', playerId: 'player-b', displayName: 'Practice B', commandId: 'setup-join', now: 1 }).state;
  for (const [index, actorUserId] of ['synthetic-a', 'synthetic-b'].entries())
    state = transitionGame(state, { type: 'set_ready', ready: true }, { actorUserId, commandId: `setup-ready-${index}`, now: 2 + index }).state;
  state = transitionGame(state, { type: 'start_game' }, { actorUserId: 'synthetic-a', commandId: 'setup-start', now: 4 }).state;
  assertGameInvariants(state);
  return state;
}

function validateCommand(command) {
  check(command && typeof command === 'object' && !Array.isArray(command), 'invalid_command', 400);
  const keys = Object.keys(command);
  if (command.type === 'play_card') {
    check(keys.every((key) => ['type', 'cardId', 'chosenColor', 'swapTargetId', 'declareUno'].includes(key))
      && typeof command.cardId === 'string' && /^[a-z0-9_-]{1,80}$/.test(command.cardId)
      && (command.chosenColor === undefined || COLORS.includes(command.chosenColor))
      && (command.swapTargetId === undefined || ['player-a', 'player-b'].includes(command.swapTargetId))
      && (command.declareUno === undefined || typeof command.declareUno === 'boolean'), 'invalid_command', 400);
  } else if (command.type === 'choose_roulette_color') {
    check(exactRecord(command, ['type', 'color']) && COLORS.includes(command.color), 'invalid_command', 400);
  } else {
    check(exactRecord(command, ['type']) && ['draw_until_playable', 'accept_penalty', 'declare_uno'].includes(command.type), 'command_not_allowlisted', 400);
  }
  return copy(command);
}

export function commandForCard(view, cardId) {
  const card = view.hand.find((candidate) => candidate.id === cardId);
  check(card, 'card_not_in_current_hand');
  const command = { type: 'play_card', cardId, declareUno: true };
  if (card.color === null && card.kind !== 'wild_color_roulette') command.chosenColor = 'red';
  if (card.kind === 'number' && card.number === 7)
    command.swapTargetId = view.players.find((player) => !player.isSelf && player.status === 'active')?.playerId;
  return command;
}

export function createLab({ seed = 3, clock = Date.now, deadlineMs = 700, providerFactory = createFixtureProvider, toolFactory = createFixtureTool } = {}) {
  check(Number.isInteger(seed) && seed >= 1 && seed <= 1000000, 'invalid_seed', 400);
  check(Number.isFinite(deadlineMs) && deadlineMs > 0 && deadlineMs <= 1000, 'invalid_deadline', 400);
  let state = newGame(seed), epoch = 1, executedCommands = 0, executedMoves = 0, busy = false, generation = 0;
  let coach = { status: 'idle', reason: 'scripted_provider_only' }, latestProposalId = null;
  const proposals = new Map(), commands = new Map(), audit = [];
  const actor = () => state.players.find((player) => player.playerId === state.currentPlayerId)?.userId ?? state.hostUserId;
  const gameView = () => copy(projectGameForUser(state, actor()));
  const record = (status, reason) => { audit.push({ status, reason, epoch, revision: state.revision }); if (audit.length > 40) audit.shift(); };
  const proposalView = (p) => p ? { id: p.id, fingerprint: p.fingerprint, epoch: p.epoch, revision: p.revision,
    rulesVersion: p.rulesVersion, command: copy(p.command), expiresAt: p.expiresAt, decision: p.decision,
    stale: p.epoch !== epoch || p.revision !== state.revision, expired: clock() >= p.expiresAt } : null;
  const view = () => ({ mode: 'real_engine_scripted_coach', syntheticOnly: true, enginePin: ENGINE_PIN,
    epoch, now: clock(), game: gameView(), coach: copy(coach), proposal: proposalView(proposals.get(latestProposalId)),
    executedCommands, executedMoves, audit: copy(audit) });
  function apply(command, actorUserId, commandId) {
    const result = transitionGame(state, command, { actorUserId, commandId, now: clock() });
    assertGameInvariants(result.state);
    state = result.state;
    if (!result.replayed) { executedCommands++; if (command.type === 'play_card') executedMoves++; }
    return result;
  }
  function manual(input) {
    check(exactRecord(input, ['requestId', 'expectedEpoch', 'expectedRevision', 'command'])
      && typeof input.requestId === 'string' && /^[a-z0-9-]{1,64}$/.test(input.requestId), 'invalid_manual_request', 400);
    const command = validateCommand(input.command), digest = hash(input);
    const prior = commands.get(input.requestId);
    if (prior) { check(prior === digest, 'request_id_reused'); return { status: 'already_applied', view: view() }; }
    check(input.expectedEpoch === epoch && input.expectedRevision === state.revision, 'stale_manual_request');
    apply(command, actor(), `manual-${input.requestId}`);
    commands.set(input.requestId, digest); if (commands.size > 100) commands.delete(commands.keys().next().value);
    record('applied', 'manual_engine_command');
    return { status: 'applied', view: view() };
  }
  async function propose(choice) {
    check(CHOICES.includes(choice), 'unknown_script', 400);
    if (choice === 'off') {
      generation++; for (const p of proposals.values()) if (p.decision === 'pending') p.decision = 'cancelled';
      latestProposalId = null; coach = { status: 'offline', reason: 'manual_game_available' };
      record('stopped', 'coach_off'); return { status: 'stopped', view: view() };
    }
    check(!busy, 'coach_busy');
    const previous = proposals.get(latestProposalId); if (previous?.decision === 'pending') previous.decision = 'superseded';
    latestProposalId = null;
    const requestGeneration = ++generation;
    const captured = { epoch, revision: state.revision, actorUserId: actor() }, current = gameView();
    if (current.legalActions.playableCardIds.length === 0) {
      coach = { status: 'fallback', reason: 'no_card_proposal_use_manual_controls' }; return { status: 'stopped', view: view() };
    }
    const aliases = new Map(current.legalActions.playableCardIds.map((id, index) => [`practice-option-${index + 1}`, id]));
    // Never pass the game view, names, table code, hidden hands or physical card IDs.
    const context = { mode: 'offline_scripted_fixture', revision: current.revision, rulesVersion: current.rulesVersion,
      playableOptionIds: [...aliases.keys()], requestedRule: 'turn' };
    const candidate = { kind: 'suggest', ruleId: 'turn', cardId: context.playableOptionIds[0] };
    const script = choice === 'failure' ? [{ error: true }] : choice === 'timeout' ? [{ stall: true }]
      : [{ delayMs: 180, value: choice === 'malformed' ? { ...candidate, execute: true }
        : choice === 'illegal' ? { ...candidate, cardId: 'practice-option-999' } : candidate }];
    busy = true; coach = { status: 'loading', reason: 'one_bounded_scripted_attempt' };
    const abort = new AbortController(); let timer;
    try {
      const provider = providerFactory(script);
      check(provider.mode === 'offline_scripted_fixture', 'scripted_provider_required');
      const expired = new Promise((resolve) => { timer = setTimeout(() => { abort.abort(); resolve({ error: 'deadline' }); }, deadlineMs); });
      const response = await Promise.race([provider.next(copy(context), { signal: abort.signal })
        .then((value) => ({ value }), () => ({ error: abort.signal.aborted ? 'deadline' : 'provider_error' })), expired]);
      check(requestGeneration === generation && captured.epoch === epoch && captured.revision === state.revision, 'stale_provider_reply');
      check(!response.error, response.error);
      const decision = parseDecision(response.value);
      check(decision?.kind === 'suggest' && decision.ruleId === 'turn', 'invalid_provider_contract');
      check(aliases.has(decision.cardId), 'unpermitted_option');
      const source = admitSource(toolFactory().call('lookup_rule', { ruleId: 'turn' }), 'turn');
      check(source && source.rulesVersion === current.rulesVersion, 'unapproved_rule_source');
      const command = commandForCard(current, aliases.get(decision.cardId));
      // Dry-run the real engine on its immutable input before showing the exact action.
      transitionGame(state, command, { actorUserId: captured.actorUserId, commandId: 'proposal-validation', now: clock() });
      const p = { id: randomUUID(), ...captured, rulesVersion: current.rulesVersion, command,
        expiresAt: clock() + 30000, decision: 'pending' };
      p.fingerprint = hash(['open-shed-exact-action-v1', p.id, p.epoch, p.revision, p.actorUserId, p.rulesVersion, p.command, p.expiresAt]);
      proposals.set(p.id, p); latestProposalId = p.id;
      if (proposals.size > 20) proposals.delete(proposals.keys().next().value);
      coach = { status: 'review', reason: 'human_decision_required', text: source.text,
        citation: { ruleId: source.id, guideVersion: source.guideVersion, rulesVersion: source.rulesVersion } };
      record('proposed', 'validated_not_executed');
      return { status: 'proposed', view: view() };
    } catch (error) {
      if (requestGeneration !== generation) { record('stopped', 'cancelled_provider_reply'); return { status: 'stopped', view: view() }; }
      coach = { status: 'fallback', reason: error instanceof LabError ? error.reason : 'provider_or_tool_error' };
      record('stopped', coach.reason); return { status: 'stopped', view: view() };
    } finally { clearTimeout(timer); abort.abort(); busy = false; }
  }
  function decide(input) {
    check(exactRecord(input, ['proposalId', 'fingerprint', 'decision', 'acknowledged'])
      && ['approve', 'reject'].includes(input.decision) && typeof input.acknowledged === 'boolean', 'invalid_review', 400);
    const p = proposals.get(input.proposalId);
    check(p && input.fingerprint === p.fingerprint, 'exact_proposal_required');
    if (p.decision === 'executed') { check(input.decision === 'approve', 'decision_already_consumed'); return { status: 'already_executed', view: view() }; }
    check(p.decision === 'pending', 'decision_already_consumed');
    if (input.decision === 'reject') {
      p.decision = 'rejected'; coach = { status: 'rejected', reason: 'human_rejected_no_move' };
      record('rejected', 'human_rejected_no_move'); return { status: 'rejected', view: view() };
    }
    check(input.acknowledged === true, 'explicit_review_required');
    check(clock() < p.expiresAt, 'proposal_expired');
    check(p.epoch === epoch && p.revision === state.revision && p.rulesVersion === state.rules.version
      && p.actorUserId === actor(), 'stale_proposal');
    // Re-evaluate legality NOW, then execute the immutable server-stored command.
    check(gameView().legalActions.playableCardIds.includes(p.command.cardId), 'engine_no_longer_permits_card');
    apply(p.command, p.actorUserId, `approved-${p.id}`);
    p.decision = 'executed'; coach = { status: 'executed', reason: 'human_approved_engine_applied' };
    record('applied', 'human_approved_engine_command'); return { status: 'executed', view: view() };
  }
  function reset() {
    state = newGame(seed); epoch++; generation++; executedCommands = 0; executedMoves = 0;
    coach = { status: 'idle', reason: 'scripted_provider_only' }; latestProposalId = null;
    record('reset', 'new_synthetic_epoch'); return { status: 'reset', view: view() };
  }
  return { view, manual, propose, decide, reset,
    // Tests use this in-process observer; it is NOT exposed by the HTTP server.
    debugSnapshot: () => copy(state) };
}
