// Capture a screenshot of a URL over the Chrome DevTools Protocol.
// Assumes Brave is already running with --remote-debugging-port=9222.
// Fails on console errors. Writes the PNG to the given path.
//
// Usage: node scripts/shot-cdp.mjs <url> <out.png> [waitMs=1500]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL_ARG = process.argv[2];
const OUT = process.argv[3] ?? 'scratchpad/rkt-shot.png';
const WAIT_MS = Number(process.argv[4] ?? '1500');
const CDP = 'http://127.0.0.1:9222';

if (!URL_ARG) {
  console.error('usage: node scripts/shot-cdp.mjs <url> <out.png> [waitMs]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTarget() {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(URL_ARG)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`could not open target: ${res.status} ${await res.text()}`);
  return res.json();
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.text ?? 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text);
    }
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('websocket error')));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { ready, send, consoleErrors, close: () => ws.close() };
}

async function main() {
  const target = await openTarget();
  const client = cdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');

  // Wait for the canvas, then settle.
  let hasCanvas = false;
  for (let i = 0; i < 40 && !hasCanvas; i++) {
    const r = await client
      .send('Runtime.evaluate', { expression: '!!document.querySelector("canvas")', returnByValue: true })
      .then((x) => x.result.value)
      .catch(() => false);
    hasCanvas = r;
    if (!hasCanvas) await sleep(250);
  }
  if (!hasCanvas) throw new Error('canvas never mounted');
  await sleep(WAIT_MS);

  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  const errors = client.consoleErrors;
  client.close();
  await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});

  if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  const size = shot.data.length;
  console.log(`SHOT OK — ${URL_ARG} -> ${OUT} (${size} b64 chars), no console errors.`);
}

main().catch((err) => {
  console.error(`SHOT FAIL: ${err.message}`);
  process.exit(1);
});
