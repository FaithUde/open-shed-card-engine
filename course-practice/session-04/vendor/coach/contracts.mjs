export function exactRecord(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === 'string' && keys.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

export function frozenCopy(value) {
  const copy = structuredClone(value);
  function freeze(item) {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
    return item;
  }
  return freeze(copy);
}

export function parseDecision(value) {
  if (!exactRecord(value, ['kind', 'ruleId', 'cardId'])) return null;
  if (!['explain', 'suggest', 'lookup', 'ask'].includes(value.kind)) return null;
  if (value.kind === 'ask') return value.ruleId === null && value.cardId === null ? frozenCopy(value) : null;
  if (typeof value.ruleId !== 'string' || !/^[a-z_]{1,30}$/.test(value.ruleId)) return null;
  if (value.kind === 'suggest') {
    if (typeof value.cardId !== 'string' || !/^practice-[a-z0-9-]{1,50}$/.test(value.cardId)) return null;
  } else if (value.cardId !== null) return null;
  return frozenCopy(value);
}

export function decision(kind, ruleId = null, cardId = null) {
  return { kind, ruleId, cardId };
}
