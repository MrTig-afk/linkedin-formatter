// Bundles the MCP server into one standalone file.
// The SDK is bundled in (it is a devDependency), so the published package
// installs with zero dependencies - same shape as the CLI.
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/mcp/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'mcp/dist/linkedin-formatter-mcp.js',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
}).then(() => {
  const { statSync } = require('node:fs');
  console.log('mcp/dist/linkedin-formatter-mcp.js',
    (statSync('mcp/dist/linkedin-formatter-mcp.js').size / 1024).toFixed(0), 'KB');
}).catch(() => process.exit(1));
