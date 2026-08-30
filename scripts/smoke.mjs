/* Bundles src/smoketest.ts with esbuild and runs it in node. */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

await build({
  entryPoints: ['src/smoketest.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '/tmp/smoke.mjs',
  loader: { '.json': 'json' },
  logLevel: 'silent',
});
console.log('bundled — running assertions…\n');
await import('/tmp/smoke.mjs');
