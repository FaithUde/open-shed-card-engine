import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url), manifest = JSON.parse(readFileSync(new URL('source-manifest.json', root), 'utf8'));
const hash = (file) => createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
assert.equal(process.versions.node, '22.14.0', 'Use the trainer-prepared Node 22.14.0.');
for (const [name, entry] of Object.entries(manifest.engine)) {
  assert.equal(hash(`vendor/engine-source/${name}.ts`), entry.originalSha256, `Original engine source changed: ${name}`);
  assert.equal(hash(`vendor/engine/${name}.mjs`), entry.runtimeSha256, `Engine runtime changed: ${name}`);
}
for (const [name, expected] of Object.entries(manifest.coach)) assert.equal(hash(`vendor/coach/${name}.mjs`), expected, `Coach teaching module changed: ${name}`);
console.log(`SETUP READY: Node ${process.versions.node}; seven real engine modules and four Coach modules match the source manifest.`);
console.log(`Engine pin: ${manifest.upstreamCommit}. No dependencies or model account required.`);
