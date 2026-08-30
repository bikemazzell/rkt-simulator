// Scrape the Estes catalogue (Shopify storefront) and regenerate the game's
// rocket/motor data. Estes exposes structured product JSON at /products.json,
// so no HTML scraping or headless browser is needed.
//
//   node scripts/scrape-estes.mjs
//
// Outputs:
//   data/estes-products.json     raw snapshot (kept for records)
//   src/data/motors.ts           generated from product_type === 'Engine'
//   src/data/rockets.ts          generated from product_type === 'Rocket'
//
// Motor physics (total impulse, burn time, masses) and every rocket aero
// parameter (drag, parachute, colours) are NOT published by Estes, so they are
// inferred from the class/description or filled with plausible-and-fun defaults.
// The one hard invariant kept is avgThrust === totalImpulse / burnTime, which the
// catalog test enforces.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36';
const BASE = 'https://estesrockets.com/products.json';

// --- deterministic RNG so regenerating the data is stable ---------------------
function hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngFor(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const round = (n, d = 4) => Number(n.toFixed(d));

// --- class reference (typical Estes values, not strict NAR maxima) ------------
const IMPULSE = { '1/8A': 0.3, '1/4A': 0.6, '1/2A': 1.25, A: 2.5, B: 5, C: 10, D: 20, E: 30, F: 60, G: 120 };
const MOTOR_MASS = {
  '1/8A': [0.0088, 0.0010], '1/4A': [0.0088, 0.0018], '1/2A': [0.0088, 0.0025],
  A: [0.0162, 0.0033], B: [0.0190, 0.0062], C: [0.0258, 0.0108], D: [0.0428, 0.0211],
  E: [0.0570, 0.0353], F: [0.0900, 0.0600], G: [0.1200, 0.0800],
};
const CLASS_ORDER = ['1/8A', '1/4A', '1/2A', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

const COLOR_WORDS = {
  white: 0xf5f5f5, black: 0x1a1a1a, dark: 0x222222, red: 0xd22222, crimson: 0xb31217,
  blue: 0x1f6fe0, navy: 0x0b3d91, indigo: 0x4b0082, green: 0x2e8b57, lime: 0x8bc34a,
  yellow: 0xffe14d, gold: 0xffd700, orange: 0xff7f00, purple: 0x8e44ad, violet: 0x8e44ad,
  pink: 0xff69b4, silver: 0xc0c0c0, gray: 0x888888, grey: 0x888888, chrome: 0xd0d0d0,
};
const FUN_PALETTE = [0xff4d4d, 0x4dd2ff, 0xffe14d, 0x8bff4d, 0xff8c1a, 0xb84dff, 0xff4db8, 0x4dffd2];

async function fetchAll() {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${BASE}?limit=250&page=${page}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
    const { products: batch } = await res.json();
    if (!batch || batch.length === 0) break;
    products.push(...batch);
    if (batch.length < 250) break;
  }
  return products;
}

const strip = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function parseDesignation(title) {
  const m = title.match(/(1\/8A|1\/4A|1\/2A|[A-G])(\d+)-(\d+)/);
  if (!m) return null;
  return { id: `${m[1]}${m[2]}-${m[3]}`, cls: m[1], avg: Number(m[2]), delay: Number(m[3]) };
}

function buildMotors(products) {
  const byId = new Map();
  for (const p of products) {
    if (p.product_type !== 'Engine') continue;
    const d = parseDesignation(p.title);
    if (!d || !(d.cls in IMPULSE) || d.avg <= 0) continue;
    if (byId.has(d.id)) continue;
    const impulse = IMPULSE[d.cls];
    const [massTotal, massProp] = MOTOR_MASS[d.cls];
    byId.set(d.id, {
      id: d.id, class: d.cls, totalImpulseNs: impulse, avgThrustN: d.avg,
      burnTimeS: round(impulse / d.avg, 3), massTotalKg: massTotal, massPropKg: massProp, delayS: d.delay,
    });
  }
  return [...byId.values()].sort((a, b) =>
    CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class) || a.avgThrustN - b.avgThrustN || a.delayS - b.delayS);
}

function colorsFromText(text, rng) {
  const found = [];
  for (const [word, hex] of Object.entries(COLOR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) found.push(hex);
  }
  const c = (i) => found[i] ?? pick(rng, FUN_PALETTE);
  return { bodyColor: c(0), finColor: c(1), noseColor: c(2) };
}

function buildRockets(products, motors) {
  const motorIds = new Set(motors.map((m) => m.id));
  const idByClass = (cls) => motors.filter((m) => m.class === cls).map((m) => m.id);
  const usedIds = new Set();
  const rockets = [];

  for (const p of products) {
    if (p.product_type !== 'Rocket') continue;
    const rng = rngFor(hash(p.handle || p.title));
    const text = strip(p.body_html);
    const grams = Number(p.variants?.[0]?.grams) || 0;

    // Mass: shipping weight is a rough proxy; clamp to a sane model-rocket range.
    const massEmptyKg = Math.min(1.5, Math.max(0.02, grams > 0 ? grams / 1000 : 0.05));

    // Diameter: "2.6-inch diameter" / "diameter of 1.3 in" -> metres, else default.
    let diameterM = 0.024;
    const dia = text.match(/([\d.]+)\s*-?\s*inch(?:es)?\s+diameter/i) || text.match(/diameter[^\d]{0,12}([\d.]+)\s*(?:in|")/i);
    if (dia) diameterM = round(Math.min(0.15, Math.max(0.012, Number(dia[1]) * 0.0254)), 4);

    // Body length: "51 inches long" -> metres, else scale from mass.
    let bodyLengthM = round(0.25 + massEmptyKg * 1.2, 3);
    const len = text.match(/([\d.]+)\s*inch(?:es)?\s+long/i) || text.match(/([\d.]+)"\s*long/i);
    if (len) bodyLengthM = round(Math.min(2.5, Math.max(0.1, Number(len[1]) * 0.0254)), 3);

    // Recommended motors: designations named in the copy that we actually have.
    const recs = [...new Set((text.match(/(1\/8A|1\/4A|1\/2A|[A-G])\d+-\d+/g) || []))].filter((id) => motorIds.has(id));
    let recommendedMotors = recs.slice(0, 4);
    if (recommendedMotors.length === 0) {
      // Fall back to a class band chosen by mass.
      const bands = massEmptyKg < 0.05 ? ['A', 'B', 'C'] : massEmptyKg < 0.09 ? ['B', 'C', 'D'] : ['C', 'D', 'E'];
      for (const cls of bands) { const ids = idByClass(cls); if (ids.length) recommendedMotors.push(ids[0]); }
      if (recommendedMotors.length === 0) recommendedMotors = [motors[0].id];
    }
    const maxMotorImpulseNs = Math.max(...recommendedMotors.map((id) => motors.find((m) => m.id === id).totalImpulseNs));

    // Streamer/tumble recovery for the very light ones, parachute otherwise.
    const streamer = massEmptyKg < 0.03 || /streamer|tumble/i.test(text);

    let id = (p.handle || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
    while (usedIds.has(id)) id += '-x';
    usedIds.add(id);

    rockets.push({
      id, name: p.title.replace(/^Estes\s+(Rockets:\s+)?/i, '').trim(),
      massEmptyKg: round(massEmptyKg, 4), diameterM,
      dragCoefficient: round(0.7 + rng() * 0.18, 3),
      chuteDiameterM: streamer ? 0 : round(0.25 + rng() * 0.3, 3), chuteCd: 1.2,
      recommendedMotors, maxMotorImpulseNs,
      look: {
        bodyLengthM, finCount: 3 + Math.floor(rng() * 2),
        ...colorsFromText(text, rng),
      },
    });
  }
  return rockets;
}

// --- serialisation ------------------------------------------------------------
const hex = (n) => `0x${n.toString(16).padStart(6, '0')}`;
const banner = `// GENERATED by scripts/scrape-estes.mjs from estesrockets.com (${new Date().toISOString().slice(0, 10)}).\n// Do not edit by hand; re-run the scraper to refresh. See data/estes-products.json for the raw source.`;

function motorsFile(motors) {
  const rows = motors.map((m) =>
    `  { id: ${JSON.stringify(m.id)}, class: ${JSON.stringify(m.class)}, totalImpulseNs: ${m.totalImpulseNs}, avgThrustN: ${m.avgThrustN}, burnTimeS: ${m.burnTimeS}, massTotalKg: ${m.massTotalKg}, massPropKg: ${m.massPropKg}, delayS: ${m.delayS} },`);
  return `${banner}\nimport type { Motor } from '../sim/types';\n\nexport const motors: Motor[] = [\n${rows.join('\n')}\n];\n\nexport function motorById(id: string): Motor | undefined {\n  return motors.find((m) => m.id === id);\n}\n`;
}

function rocketsFile(rockets) {
  const rows = rockets.map((r) => {
    const L = r.look;
    return `  { id: ${JSON.stringify(r.id)}, name: ${JSON.stringify(r.name)}, massEmptyKg: ${r.massEmptyKg}, diameterM: ${r.diameterM}, dragCoefficient: ${r.dragCoefficient}, chuteDiameterM: ${r.chuteDiameterM}, chuteCd: ${r.chuteCd}, recommendedMotors: ${JSON.stringify(r.recommendedMotors)}, maxMotorImpulseNs: ${r.maxMotorImpulseNs}, look: { bodyLengthM: ${L.bodyLengthM}, finCount: ${L.finCount}, bodyColor: ${hex(L.bodyColor)}, finColor: ${hex(L.finColor)}, noseColor: ${hex(L.noseColor)} } },`;
  });
  return `${banner}\nimport type { Rocket, Motor } from '../sim/types';\nimport { motorById } from './motors';\n\nexport const rockets: Rocket[] = [\n${rows.join('\n')}\n];\n\nexport function rocketById(id: string): Rocket | undefined {\n  return rockets.find((r) => r.id === id);\n}\n\nexport function compatibleMotors(rocket: Rocket): Motor[] {\n  return rocket.recommendedMotors\n    .map((id) => motorById(id))\n    .filter((m): m is Motor => m !== undefined);\n}\n`;
}

// --- main ---------------------------------------------------------------------
const products = await fetchAll();
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/estes-products.json'), JSON.stringify(products, null, 2));

const motors = buildMotors(products);
const rockets = buildRockets(products, motors);
writeFileSync(join(ROOT, 'src/data/motors.ts'), motorsFile(motors));
writeFileSync(join(ROOT, 'src/data/rockets.ts'), rocketsFile(rockets));

console.log(`products: ${products.length}  ->  motors: ${motors.length}, rockets: ${rockets.length}`);
console.log(`raw snapshot: data/estes-products.json`);
