// Generated teaching copy of Open Shed, Apache-2.0. See vendor/LICENSE.
// Modified: TypeScript erased and relative imports suffixed .mjs; rules unchanged.
export class GameRuleError extends Error {
    code;
    status;
    constructor(code, message, status = 422) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = "GameRuleError";
    }
}
export function requireRule(condition, code, message, status = 422) {
    if (!condition)
        throw new GameRuleError(code, message, status);
}
