# Sessions 4 and 7 — connect a Coach to a real local game

Edition `open-shed-integrated-game-v1`. Two small beginner exercises share one supplied scaffold. You do **not** rebuild the game engine.

This is an actual local Open Shed game: the pinned engine deals its 168-card deck, calculates legal actions, applies moves, changes turns and reaches a winner. A visibly **scripted in-process Coach** proposes one engine-permitted option. It is not a language model, remote service, hosted multiplayer game or production security system. There is no API key, provider cost, installation or external request.

One person controls two invented hot-seat players, Practice A and Practice B. Only the current hand is shown; the next turn changes the visible hand. The ordinary game works even when the Coach is off, invalid, failed or timed out.

## 1. Prepare and run

Extract the learner ZIP into a new folder and open a terminal there. Ask your trainer to prepare **Node 22.14.0** beforehand. No npm/pnpm dependency installation is needed: runtime/tests use Node built-ins, and the engine's compiled JavaScript is supplied alongside its original TypeScript and license.

```sh
node --version
node scripts/check-setup.mjs
node --test test/*.test.mjs
node --test practice/*.test.mjs
node server.mjs
```

Expected: version `v22.14.0`; `SETUP READY`; **23/23 core checks pass**. The unmodified practice starter has **5 passes and 4 deliberate failures** across nine checks. Keep that initial output; it is part of the exercise, not a reason to change tests.

Open the exact `http://127.0.0.1:...` address printed by the server in your browser. The port is chosen automatically. If the trainer needs a fixed free port, use `node server.mjs --port 4174`. There is no remote-host option. Ctrl+C stops only this server. Restart it after editing a practice file, then refresh the page, because its static files are loaded at startup.

These instructions and local Node/HTTP checks were rehearsed on macOS; Windows and actual browser/device interaction require the trainer's separate verification. On macOS with nvm already installed, `nvm use 22.14.0` selects the prepared version. Do not install an unreviewed runtime or alter source hashes to bypass a setup failure.

## 2. Trace the responsibilities

```text
Browser: show current hand, status and explicit human buttons
    │ local JSON requests only
Local server: revision/reset checks, bounded Coach request, exact proposal + approval
    ├── Scripted provider: temporary option aliases only; cannot change the game
    ├── Approved rule lookup: exact pinned teaching source
    └── Real Open Shed engine: authoritative legality + immutable state transition
```

The server holds the game in memory. Reloading the page keeps that server's current game; restarting the server or pressing **Reset this local game** creates a fresh synthetic round. Nothing is persisted to a database. Other servers, live games, accounts and course grades are not changed.

The provider sees only mode, revision, rules version, requested rule and temporary option aliases, such as `practice-option-1`. It does not receive the whole game view, names, table code, physical card IDs or hidden hands. The server binds each alias to a card in the current engine projection and rejects a response if the game changed while it was pending.

## 3. Session 4 — repair a real browser interaction

1. Start the page. Select **Coach off**, click **Ask scripted Coach**, then click an enabled card in the left panel. Check that the discard, revision, hand and move count change. You played through the real engine without AI.
2. Reset the game. Try **Provider failure**, **Provider timeout**, **Malformed response** and **Unpermitted option**. They must stop without playing a card. A manual card still works afterward. Reset between cases.
3. Notice the supplied status message wrongly says it is ready while the raw status is `loading` or `fallback`. The learner task is the actual UI-imported function in `practice/coach-status.mjs`.
4. Change only that function to distinguish loading, fallback/offline, review, executed and idle/unknown. Use the exact visible messages specified by its tests. Do not change `public/app.mjs`, the tests, server or game rules.
5. Run `node --test practice/coach-status.test.mjs`. Expect **4/4 pass**. Restart/refresh and personally verify the correct loading, safe-fallback and manual-play interaction.
6. Draw the responsibility diagram in your own words and explain which supplied component changes the game. Record your exact one-file change plus initial/final test output and browser observations.

The loading case uses a short real local wait; the deadline is at most 700 ms in the default lab, with one candidate attempt and one allowlisted local rule lookup. It does not measure model latency or provider reliability.

## 4. Session 7 — make approval usable without weakening authority

1. Reset. Ask for a **Legal option**. Check **Moves actually executed: 0** and unchanged revision. A proposal is not an action.
2. Inspect the exact proposed command, revision, epoch, fingerprint and expiry. The Coach chooses the first legal option deterministically, not the best strategic move. A Wild proposal chooses red; a seven names the other seat for a swap; `declareUno: true` is explicit. Reject any proposal you do not want.
3. Click **Reject proposal**. It must not change the hand/revision. Rejection consumes that proposal. Ask again when ready.
4. The starter deliberately keeps **Approve exact move** disabled even after checking the review box. Repair only `practice/review-eligibility.mjs`: return true for a pending proposal in the current epoch, revision and rules version, with expiry strictly later than `view.now`. Otherwise return false. Never return true for every proposal.
5. Run `node --test practice/review-eligibility.test.mjs`. Expect **5/5 pass**. Restart/refresh. Ask again, review its exact command and check the box, then approve within 30 seconds. The server rechecks the stored action against the engine and actually plays it once. Confirm revision, discard, hand/turn and move count.
6. Ask for another proposal, then play a legal card manually before approving. The old proposal is stale. The client should disable approval; the server also rejects a stale direct request. Reset also invalidates older proposals even when the new game's revision repeats.
7. Ask again and wait 30 seconds. Expired proposals must remain blocked. The browser updates the proposal JSON and expired/stale description every half-second using its current view and local clock; this is a display, not server permission. The server independently checks expiry when approval arrives. Missing acknowledgment, changed fingerprints, repeated approvals and failed provider cases are also tested by the core suite. A repeat request reports an existing result without playing twice.
8. Run both test commands again. Final target: **23 core + 9 practice passes**, none skipped, with the tests unchanged. Keep a small risk map linking approval, rejection, stale state, expiry and provider failure to the matching actual tests.

The checkbox/client gate is usability, **not** the security boundary. Server-side approval binding and engine checks remain supplied and tested. Do not bypass a disabled button or remove a server guard to claim a pass. The local browser's explicit decision is not verified human identity: this single-user sandbox is not suitable for remote deployment or adversarial multi-user access.

## 5. Manual controls and limits

Enabled cards come from `legalActionsFor`, not a hard-coded permitted list. When appropriate, the UI enables draw-until-playable, penalty acceptance, roulette colour or UNO. Card clicks declare UNO; sevens swap with the other active seat. Use the colour selector before manually playing a Wild. A finished round can be reset. The full engine handles its real rule effects, including draw penalties, swaps and mercy elimination; this minimal UI does not reproduce the upstream lobby, authentication, network multiplayer, chat, reconnect, scoring series or every optional control.

Use only the invented game. Do not enter real people, credentials, account details or private player data. Do not redirect this scaffold to the public Open Shed game or Hub. The server listens only on `127.0.0.1`, admits fixed routes, rejects cross-origin controls and requires its local control token. These are teaching safeguards, not an OS sandbox or production authentication. Do not expose the port through a tunnel.

The audit contains only status, fixed reason, revision and epoch, not prompts, names, hands, table codes or provider output. Screenshots and test output may still include your local path; sanitise it before sharing. Browser rendering/state hooks are local diagnostic helpers, not an external data feed.

## 6. Evidence and ownership

Keep the edition, Node version, your one-file change for each session, genuine before/after tests, one manual-with-Coach-off observation, one rejected/stale proposal and one approved real engine move. Explain supplied versus learner-written code and any AI assistance. Submit only through a separately released trainer-approved route. Running this package creates no Hub assessment, Git commit, upstream contribution or deployment.

Read `SOURCE-NOTES.md` for the fixed source pin and Apache-2.0 attribution. Keep `vendor/`, `source-manifest.json` and the license unchanged. The public learner ZIP excludes trainer references and private rehearsal evidence. Videos, a real-model adapter, hosted identities, persistent audit, browser/device acceptance and classroom rehearsal are separate deliverables; passing local tests does not silently complete them.
