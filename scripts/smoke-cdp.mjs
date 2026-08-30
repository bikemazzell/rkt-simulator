// End-to-end smoke test driven over the Chrome DevTools Protocol.
// Assumes Brave is already running with --remote-debugging-port=9222 and the app
// is served (default http://localhost:4173). Opens the app, waits for the canvas,
// clicks Launch, verifies the flight altitude rises above 0, checks for console
// errors, and writes a screenshot. Exits non-zero on any failure.
//
// Usage: node scripts/smoke-cdp.mjs [appUrl] [cdpPort]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const APP_URL = process.argv[2] ?? 'http://localhost:4173';
const CDP = `http://127.0.0.1:${process.argv[3] ?? '9222'}`;
const SHOT = new URL('../scratchpad/rkt-smoke.png', import.meta.url).pathname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTarget() {
  // Newer Chromium requires PUT for /json/new.
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
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

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  return { ready, send, evaluate, consoleErrors, close: () => ws.close() };
}

async function main() {
  const target = await openTarget();
  const client = cdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');

  // 1. Canvas mounts.
  let hasCanvas = false;
  for (let i = 0; i < 40 && !hasCanvas; i++) {
    hasCanvas = await client.evaluate('!!document.querySelector("canvas")');
    if (!hasCanvas) await sleep(250);
  }
  if (!hasCanvas) throw new Error('canvas never mounted');

  // 2. The Launch button must be the top element at its own center — i.e. a real
  //    user click would land on it, not on an overlay intercepting pointer events.
  const hit = await client.evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /launch/i.test(b.textContent));
      if (!btn) return 'no-button';
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return btn.contains(top) ? 'ok' : 'blocked:' + (top ? (top.className || top.tagName) : 'none');
    })()
  `);
  if (hit === 'no-button') throw new Error('Launch button not found');
  if (hit !== 'ok') throw new Error(`Launch button is not clickable — ${hit} intercepts pointer events`);

  // Click Launch.
  await client.evaluate(`
    [...document.querySelectorAll('button')].find((b) => /launch/i.test(b.textContent)).click()
  `);

  // 3. Altitude rises above 0 within ~10 s.
  const readApogee = `
    (() => {
      const rows = [...document.querySelectorAll('.rkt-hud-row')];
      const row = rows.find((r) => /apogee/i.test(r.textContent));
      if (!row) return 0;
      const m = row.textContent.match(/(\\d+)\\s*m/);
      return m ? Number(m[1]) : 0;
    })()
  `;
  let maxApogee = 0;
  for (let i = 0; i < 40; i++) {
    maxApogee = Math.max(maxApogee, await client.evaluate(readApogee));
    if (maxApogee > 0) break;
    await sleep(250);
  }
  if (maxApogee <= 0) throw new Error('altitude never rose above 0 (no flight happened)');

  // 4. Screenshot.
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  // 5. No console errors.
  await sleep(300);
  const errors = client.consoleErrors;
  client.close();
  await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});

  if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);

  console.log(`SMOKE OK — canvas mounted, launch flew (apogee ${maxApogee} m), no console errors.`);
  console.log(`screenshot: ${SHOT}`);
}

main().catch((err) => {
  console.error(`SMOKE FAIL: ${err.message}`);
  process.exit(1);
});
