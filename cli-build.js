// Bundles the CLI into a standalone, dependency-free executable.
// The conversion core is bundled in at build time rather than shared as a
// package: no duplication of source, no workspace to keep in sync, and the
// published artifact is one file.
// Paths are anchored to this file, not the cwd: npm runs prepublishOnly
// with cwd inside cli/, while the repo scripts run from the root.
const esbuild = require('esbuild');
const path = require('node:path');

const outfile = path.join(__dirname, 'cli/dist/linkedin-fmt.js');

esbuild.build({
  entryPoints: [path.join(__dirname, 'src/cli/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
}).then(() => {
  const { statSync } = require('node:fs');
  console.log('cli/dist/linkedin-fmt.js', (statSync(outfile).size / 1024).toFixed(1), 'KB');
}).catch(() => process.exit(1));
