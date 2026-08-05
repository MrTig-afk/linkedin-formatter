/**
 * Thin shell around run(). Everything decidable lives in run.ts as a pure
 * function over (argv, stdin), so the tests never spawn a process; this file
 * only does the two things that cannot be pure - reading stdin and exiting.
 */
import { run } from './run';

const VERSION = '0.1.0';

function readStdin(): Promise<string | null> {
  // A TTY means nothing was piped in; do not block waiting for input.
  if (process.stdin.isTTY) { return Promise.resolve(null); }
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
    process.stdin.on('error', () => resolve(null));
  });
}

async function main(): Promise<void> {
  const stdin = await readStdin();
  const result = run(process.argv.slice(2), stdin, VERSION);
  if (result.stdout) { process.stdout.write(result.stdout); }
  if (result.stderr) { process.stderr.write(result.stderr); }
  process.exitCode = result.code;
}

void main();
