import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  mocha: {
    // The first tests in a run pay the extension host's cold-start cost;
    // mocha's 2s default flunked them on any busy machine before the host
    // settled. Real hangs still fail - just not warmup.
    timeout: 15_000,
  },
});
