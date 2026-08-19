// Speaks real JSON-RPC to the BUILT server over stdio, the way a client does.
// Unit tests cover the tool logic; this is the only thing that proves the
// protocol wiring works, which is exactly why the SDK was chosen over
// hand-rolling.
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'mcp', 'dist', 'linkedin-formatter-mcp.js');

const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
const pending = new Map();
const results = [];

child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) { continue; }
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let stderr = '';
child.stderr.on('data', (d) => { stderr += d.toString(); });

let nextId = 1;
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 8000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
}

(async () => {
  try {
    // 1. Handshake, exactly as a client performs it.
    const init = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-probe', version: '1.0.0' },
    });
    check('initialize returns a result', !!init.result, JSON.stringify(init.result?.serverInfo));
    check('server identifies itself',
      init.result?.serverInfo?.name === 'linkedin-formatter', init.result?.serverInfo?.name);
    check('server advertises the tools capability', !!init.result?.capabilities?.tools);
    notify('notifications/initialized', {});

    // 2. Tool discovery - this is what lands in the model's context.
    const list = await send('tools/list', {});
    const tools = list.result?.tools ?? [];
    check('tools/list returns 7 tools', tools.length === 7, `got ${tools.length}`);
    const applyFamily = tools.find(t => t.name === 'apply_family');
    check('apply_family is discoverable', !!applyFamily);
    check('its description teaches the .linkedin convention',
      applyFamily?.description?.includes('.linkedin'));
    check('its schema declares required fields',
      JSON.stringify(applyFamily?.inputSchema?.required) === '["text","family"]',
      JSON.stringify(applyFamily?.inputSchema?.required));

    // 3. Real calls.
    const bold = await send('tools/call', {
      name: 'apply_family', arguments: { text: 'Shipped', family: 'serif', bold: true } });
    const boldText = bold.result?.content?.[0]?.text;
    check('apply_family returns styled Unicode', boldText === '\u{1D414}\u{1D421}...' || /[\u{1D400}-\u{1D7FF}]/u.test(boldText || ''), boldText);

    const round = await send('tools/call', {
      name: 'strip_formatting', arguments: { text: boldText } });
    check('strip_formatting round-trips it back',
      round.result?.content?.[0]?.text === 'Shipped', round.result?.content?.[0]?.text);

    const count = await send('tools/call', {
      name: 'count_characters', arguments: { text: boldText } });
    check('count_characters reports UTF-16 units (7 chars -> 14)',
      /^14 \/ 3000/.test(count.result?.content?.[0]?.text || ''), count.result?.content?.[0]?.text);

    const drop = await send('tools/call', {
      name: 'apply_family', arguments: { text: 'Hi', family: 'monospace', bold: true } });
    check('a dropped axis is reported in a SEPARATE content block',
      /no bold/.test(drop.result?.content?.[1]?.text || ''));
    check('the converted text itself stays free of commentary',
      !/note|bold/.test(drop.result?.content?.[0]?.text || ''),
      drop.result?.content?.[0]?.text);

    // 4. Bad input from a model must be a tool error, not a crash.
    const bad = await send('tools/call', {
      name: 'apply_style', arguments: { text: 'Hi', style_id: 'comic-sans' } });
    check('a bad argument comes back as isError, server still alive',
      bad.result?.isError === true, JSON.stringify(bad.result?.isError));

    const alive = await send('tools/list', {});
    check('server survives bad input and still serves', (alive.result?.tools ?? []).length === 7);

    // --- spec compliance ---
    check('instructions are advertised at initialize',
      (init.result?.instructions || '').includes('.linkedin'),
      (init.result?.instructions || '').slice(0, 60));
    check('listChanged is declared false, not left implicit',
      init.result?.capabilities?.tools?.listChanged === false,
      JSON.stringify(init.result?.capabilities?.tools));
    check('every tool carries readOnly/non-destructive annotations',
      tools.every(t => t.annotations?.readOnlyHint === true
                    && t.annotations?.destructiveHint === false
                    && t.annotations?.openWorldHint === false));
    check('every tool sets additionalProperties:false',
      tools.every(t => t.inputSchema?.additionalProperties === false));
    check('tool order is deterministic across calls',
      JSON.stringify((alive.result?.tools ?? []).map(t => t.name))
        === JSON.stringify(tools.map(t => t.name)));

    // An unknown TOOL must be a protocol error, not isError.
    const unknown = await send('tools/call', { name: 'drop_database', arguments: {} });
    check('an unknown tool is a JSON-RPC protocol error, not isError',
      !!unknown.error && unknown.result === undefined,
      JSON.stringify(unknown.error || unknown.result));

    const stillAlive = await send('tools/list', {});
    check('server survives a protocol error', (stillAlive.result?.tools ?? []).length === 7);

    // Version skew guard: the VERSION constant in index.ts drifts from the
    // package version silently otherwise.
    const pkgVersion = JSON.parse(require('fs').readFileSync(
      path.join(ROOT, 'mcp', 'package.json'), 'utf8')).version;
    check('serverInfo.version matches mcp/package.json',
      init.result?.serverInfo?.version === pkgVersion,
      init.result?.serverInfo?.version + ' vs ' + pkgVersion);

    check('nothing was written to stderr', stderr === '', stderr.slice(0, 120));
  } catch (err) {
    check('E2E RUN COMPLETED', false, err.message);
  } finally {
    child.kill();
    const passed = results.filter(r => r.pass).length;
    console.log(`${passed}/${results.length} passed`);
    for (const r of results) {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  <- ' + r.detail}`);
    }
    require('fs').writeFileSync(
      path.join(ROOT, 'assets', 'harness', 'mcp-e2e.json'),
      JSON.stringify(results.map(r => ({ name: r.name, pass: r.pass, actual: r.detail, expected: '' })), null, 2));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
