// Bundles the MCP server into one standalone file.
// The SDK is bundled in (it is a devDependency), so the published package
// installs with zero dependencies - same shape as the CLI.
// Paths are anchored to this file, not the cwd: npm runs prepublishOnly
// with cwd inside mcp/, while the repo scripts run from the root.
const esbuild = require('esbuild');
const path = require('node:path');

const outfile = path.join(__dirname, 'mcp/dist/linkedin-formatter-mcp.js');

// The version the server reports at initialize comes from mcp/package.json,
// never a second literal. A client can only tell which instructions it loaded
// by that number, so a hand-maintained copy that drifts is worse than none.
const { version } = require(path.join(__dirname, 'mcp/package.json'));

esbuild.build({
  entryPoints: [path.join(__dirname, 'src/mcp/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  define: { __MCP_VERSION__: JSON.stringify(version) },
}).then(() => {
  const { statSync } = require('node:fs');
  console.log('mcp/dist/linkedin-formatter-mcp.js',
    (statSync(outfile).size / 1024).toFixed(0), 'KB');
}).catch(() => process.exit(1));
