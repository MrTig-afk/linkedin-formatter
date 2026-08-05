// Bundles the CLI into a standalone, dependency-free executable.
// The conversion core is bundled in at build time rather than shared as a
// package: no duplication of source, no workspace to keep in sync, and the
// published artifact is one file.
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'cli/dist/linkedin-fmt.js',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
}).then(() => {
  const { statSync } = require('node:fs');
  console.log('cli/dist/linkedin-fmt.js', (statSync('cli/dist/linkedin-fmt.js').size / 1024).toFixed(1), 'KB');
}).catch(() => process.exit(1));
