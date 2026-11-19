// Generated teaching copy of Open Shed, Apache-2.0. See vendor/LICENSE.
// Modified: TypeScript erased and relative imports suffixed .mjs; rules unchanged.
export const GAME_PROTOCOL_VERSION = 1;
export const RULES_VERSION = "merciless-baseline-v1";
export const COLORS = ["red", "yellow", "green", "blue"];
export const BASELINE_RULES = {
    version: RULES_VERSION,
    finalCardWinsBeforeExternalEffects: true,
    mercyTiming: "immediate_at_25",
    wildContinuingColor: "actor_except_roulette_target",
    rouletteMissingColor: "draw_all_and_finish",
    forcedDraw: "until_playable_then_must_play",
};
