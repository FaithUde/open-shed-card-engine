// Generated teaching copy of Open Shed, Apache-2.0. See vendor/LICENSE.
// Modified: TypeScript erased and relative imports suffixed .mjs; rules unchanged.
export function nextRandom(state) {
    let value = state >>> 0 || 0x9e3779b9;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const nextState = value >>> 0;
    return [nextState / 0x1_0000_0000, nextState];
}
/**
 * Production games use Web Crypto for every shuffle (`state === null`). A
 * numeric state is deliberately supported only as an injected deterministic
 * fixture for conformance tests; it is never derived from public room data.
 */
export function shuffleInPlace(items, state) {
    if (state === null) {
        secureShuffleInPlace(items);
        return null;
    }
    let rngState = state;
    for (let index = items.length - 1; index > 0; index -= 1) {
        let random;
        [random, rngState] = nextRandom(rngState);
        const target = Math.floor(random * (index + 1));
        [items[index], items[target]] = [items[target], items[index]];
    }
    return rngState;
}
function secureShuffleInPlace(items) {
    const words = new Uint32Array(Math.max(32, items.length));
    let cursor = words.length;
    const nextWord = () => {
        if (cursor >= words.length) {
            crypto.getRandomValues(words);
            cursor = 0;
        }
        return words[cursor++];
    };
    for (let index = items.length - 1; index > 0; index -= 1) {
        const range = index + 1;
        const limit = 0x1_0000_0000 - (0x1_0000_0000 % range);
        let word = nextWord();
        while (word >= limit)
            word = nextWord();
        const target = word % range;
        [items[index], items[target]] = [items[target], items[index]];
    }
}
