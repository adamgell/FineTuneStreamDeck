import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('com.finetune.streamdeck.sdPlugin/bin', { recursive: true });
await build({
  entryPoints: ['src/plugin.ts'],
  outfile: 'com.finetune.streamdeck.sdPlugin/bin/plugin.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  sourcemap: true,
});
