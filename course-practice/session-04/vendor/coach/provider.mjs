import { setTimeout as delay } from 'node:timers/promises';
import { frozenCopy } from './contracts.mjs';
import { MODE } from './fixtures.mjs';

// This is an in-process script reader, not a language model or API adapter.
export function createFixtureProvider(script) {
  if (!Array.isArray(script) || script.length > 10) throw new TypeError('Use a small scripted response list.');
  const entries = structuredClone(script), requests = [];
  let index = 0, aborted = 0;
  return {
    mode: MODE,
    requests,
    get aborted() { return aborted; },
    async next(context, { signal }) {
      requests.push(frozenCopy(context));
      const entry = entries[index++] ?? { value: null };
      const observedAbort = () => { aborted += 1; };
      signal.addEventListener('abort', observedAbort, { once: true });
      try {
        if (entry.stall) {
          await new Promise((resolve, reject) => {
            const stop = () => reject(new Error('Fixture aborted'));
            if (signal.aborted) stop();
            else signal.addEventListener('abort', stop, { once: true });
          });
        }
        if (entry.delayMs) await delay(entry.delayMs, undefined, { signal });
        if (signal.aborted) throw new Error('Fixture aborted');
        if (entry.error) throw new Error('Injected fixture provider failure');
        return structuredClone(entry.value);
      } finally {
        signal.removeEventListener('abort', observedAbort);
      }
    },
  };
}
