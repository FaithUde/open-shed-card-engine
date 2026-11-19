// Generated teaching copy of Open Shed, Apache-2.0. See vendor/LICENSE.
// Modified: TypeScript erased and relative imports suffixed .mjs; rules unchanged.
import { COLORS } from "./types.mjs";
const COLORED_ACTION_COPIES = [
    ["draw_two", 3],
    ["draw_four", 2],
    ["skip", 3],
    ["reverse", 3],
    ["discard_all", 3],
    ["skip_everyone", 2],
];
const WILD_COPIES = [
    ["wild_reverse_draw_four", 8],
    ["wild_draw_six", 4],
    ["wild_draw_ten", 4],
    ["wild_color_roulette", 8],
];
export function createDeck() {
    const cards = [];
    for (const color of COLORS) {
        for (let number = 0; number <= 9; number += 1) {
            for (let copy = 1; copy <= 2; copy += 1) {
                cards.push({
                    id: `${color}-number-${number}-${copy}`,
                    kind: "number",
                    color,
                    number,
                });
            }
        }
        for (const [kind, copies] of COLORED_ACTION_COPIES) {
            for (let copy = 1; copy <= copies; copy += 1) {
                cards.push({
                    id: `${color}-${kind}-${copy}`,
                    kind,
                    color,
                    number: null,
                });
            }
        }
    }
    for (const [kind, copies] of WILD_COPIES) {
        for (let copy = 1; copy <= copies; copy += 1) {
            cards.push({
                id: `wild-${kind}-${copy}`,
                kind,
                color: null,
                number: null,
            });
        }
    }
    if (cards.length !== 168) {
        throw new Error(`Deck manifest must contain 168 cards, got ${cards.length}`);
    }
    return cards;
}
export function isWild(card) {
    return card.color === null;
}
export function isActionCard(card) {
    return card.kind !== "number";
}
export function drawValue(card) {
    switch (card.kind) {
        case "draw_two":
            return 2;
        case "draw_four":
        case "wild_reverse_draw_four":
            return 4;
        case "wild_draw_six":
            return 6;
        case "wild_draw_ten":
            return 10;
        default:
            return null;
    }
}
export function cardLabel(card) {
    const color = card.color ? `${capitalize(card.color)} ` : "Wild ";
    if (card.kind === "number")
        return `${color}${card.number}`;
    const names = {
        draw_two: "Draw 2",
        draw_four: "Draw 4",
        skip: "Skip",
        reverse: "Reverse",
        discard_all: "Discard All",
        skip_everyone: "Skip Everyone",
        wild_reverse_draw_four: "Reverse Draw 4",
        wild_draw_six: "Draw 6",
        wild_draw_ten: "Draw 10",
        wild_color_roulette: "Color Roulette",
    };
    return `${color}${names[card.kind]}`;
}
export function colorLabel(color) {
    return capitalize(color);
}
function capitalize(value) {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
