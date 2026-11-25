// ⛔ #a-small-states-models-are-spread-over-its-land — A STATE TOO SMALL TO SPREAD OVER ITS POSITIONS SPREADS ITS ROWS OVER ITS LAND,
// NOT INTO ONE 3x3.
//
// A state whose provinces give fewer than BUILDING_SPREAD_LEAST positions (stateSlotLayout's null) had all of its own rows — six
// civilian and six military factories, three anti-air guns, the silo, the refinery, the radar, the rocket site, the reactor and the
// stronghold — piled in the 3x3 at its anchor. On the owner's flow (TEST 34 audit L9; the TEST 35 rehearsal alike) 10 one-province
// states were piles, 22 models drawn at the start among them: the Dutch capital drew 6 civilian factories, 2 military ones and its
// airfield in 3x3 px. The base game has one such state and draws nothing there, and spreads a state of under 100 px of land over a
// median 13 points 7 px across. ensureBuildingSlotsForState now gives each of those rows a spot of its own (siteSpotRows ->
// provinceSiteSpots over every land province of the state): off every point and each other, a 3x3 of the state's land round it and 2 px
// or more from every point where it can, its model as much on the state's land as it can be, the runway's block kept clear while there
// is room. The pile's 3x3 point is only where a row stays when the state's land has no spot left.
//
//   1. Over the installed base game (SKIPS without it): at most one state's template rows stand in one 3x3, and its states of under
//      100 px of land spread them over a median of 10 points or more.
//   2. A one-province state of 64 px and a two-province state of 50 px, each a pile (stateSlotLayout null, the CONTROL): their rows are
//      not in one 3x3, stand on 13 points or more, all on the state's own land; industrial_complex k and arms_factory k never on one
//      point, the first of each and the air base on three; the first civilian and military factory each with a 3x3 of the state's land.
//   3. A strip 2 px wide between two seas: every row on the strip (no step sideways into the sea), on 13 points or more.
//   4. The same click on a second copy writes the same bytes, and a second click writes nothing.
// Binds no port. Run: node test-a-small-states-models-are-spread-over-its-land.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-small-state-spread-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const TEMPLATE = md.STATE_BUILDING_SLOTS.map(([t]) => t);
const TEMPLATE_ROWS = md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0);
const spanOf = (rs) => rs.length ? Math.max(Math.max(...rs.map((r) => r.px)) - Math.min(...rs.map((r) => r.px)), Math.max(...rs.map((r) => r.row)) - Math.min(...rs.map((r) => r.row))) : 0;
const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ── 1. the base game ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the base game spreads a small state's rows ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!["map/provinces.bmp", "map/buildings.txt", "map/definition.csv"].every((f) => fs.existsSync(path.join(GAME, f)))) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 1 did not run");
else {
  const buf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const off = buf.readUInt32LE(10), GW = buf.readInt32LE(18), GH = buf.readInt32LE(22), rs = Math.floor((24 * GW + 31) / 32) * 4;
  const byColour = new Map(), type = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0]) || +c[0] === 0) continue;
    byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]); type.set(+c[0], c[4].trim().toLowerCase());
  }
  const area = new Map();
  for (let row = 0; row < GH; row++) for (let x = 0; x < GW; x++) { const o = off + (GH - 1 - row) * rs + x * 3, id = byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0); if (id != null) area.set(id, (area.get(id) || 0) + 1); }
  const landOf = new Map();
  const dir = path.join(GAME, "history", "states");
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const id = +((/\bid\s*=\s*(\d+)/.exec(t) || [])[1]), m = /\bprovinces\s*=\s*\{([^}]*)\}/.exec(t);
    if (id && m) landOf.set(id, m[1].trim().split(/\s+/).map(Number).filter((p) => type.get(p) === "land").reduce((s, p) => s + (area.get(p) || 0), 0));
  }
  const by = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7 || !TEMPLATE.includes(c[1])) continue;
    if (!by.has(+c[0])) by.set(+c[0], []);
    by.get(+c[0]).push({ type: c[1], px: Math.floor(+c[2]), row: GH - 1 - Math.floor(+c[4]) });
  }
  const piles = [...by.values()].filter((L) => spanOf(L) <= 2).length;
  const small = [...by].filter(([s]) => (landOf.get(s) || Infinity) < 100).map(([, L]) => new Set(L.map((r) => r.px + "," + r.row)).size);
  ok(by.size > 1000 && piles <= 1, `the base game stands the template rows of ${piles} of its ${by.size} states in one 3x3 — at most one`, { piles });
  ok(small.length >= 10 && median(small) >= 10, `…and spreads its ${small.length} states of under 100 px of land over a median ${median(small)} points — 10 or more`, small);
  // ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own — PER STATE, THE MODELS IT DRAWS IN ONE 3x3 (the TEST 34 review's block3 metric). A
  // type's first min(show_on_map, level) rows are drawn (show_on_map from common/buildings, through stateBuildingRules; the level from
  // the state's undated history `buildings` block, summed over the buildings drawn on one row type): the base game piles rows freely —
  // the copies past what it draws — and keeps the drawn ones apart
  const rules = md.stateBuildingRules({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  const showOf = new Map(), rowOf = new Map();
  for (const [b, r] of rules) { rowOf.set(b, r.rowType); if (r.showOnMap) showOf.set(r.rowType, Math.max(showOf.get(r.rowType) || 0, r.showOnMap)); }
  const levelsOf = new Map();
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const id = +((/\bid\s*=\s*(\d+)/.exec(t) || [])[1]);
    // the `buildings` block two braces in (state = { history = { buildings = {), its own statements only — not a province's sub-block
    const lv = new Map();
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "{") depth++;
      else if (t[i] === "}") depth--;
      else if (depth === 2 && /^buildings\s*=\s*\{/.test(t.slice(i, i + 40)) && !/[A-Za-z0-9_]/.test(t[i - 1] || " ")) {
        let j = t.indexOf("{", i) + 1, d = 1, body = "";
        for (; j < t.length && d; j++) { if (t[j] === "{") d++; else if (t[j] === "}") d--; body += d === 1 && t[j] !== "}" ? t[j] : " "; }
        for (const m of body.matchAll(/([A-Za-z_]+)\s*=\s*(\d+)/g)) { const row = rowOf.get(m[1]) || m[1]; lv.set(row, (lv.get(row) || 0) + +m[2]); }
        i = j - 1;
      }
    }
    if (id) levelsOf.set(id, lv);
  }
  const most3x3 = (L) => { let best = 0; for (const a of L) for (let ox = -2; ox <= 0; ox++) for (let oy = -2; oy <= 0; oy++) { const n = L.filter((q) => q.px >= a.px + ox && q.px <= a.px + ox + 2 && q.row >= a.row + oy && q.row <= a.row + oy + 2).length; if (n > best) best = n; } return best; };
  let crowdedAll = 0, crowdedDrawn = 0, drawnStates = 0;
  for (const [s, L] of by) {
    const seen = new Map(), lv = levelsOf.get(s) || new Map();
    const drawn = L.filter((r) => { const k = seen.get(r.type) || 0; seen.set(r.type, k + 1); return k < Math.min(showOf.get(r.type) || 0, lv.get(r.type) || 0); });
    if (most3x3(L) >= 3) crowdedAll++;
    if (drawn.length) drawnStates++;
    if (most3x3(drawn) >= 3) crowdedDrawn++;
  }
  ok(drawnStates > 500 && crowdedAll > 100, `(CONTROL: the base game stands 3 or more of a state's template rows in one 3x3 in ${crowdedAll} of its ${by.size} states — the rows it does not draw)`, { crowdedAll, drawnStates });
  ok(crowdedDrawn <= Math.ceil(by.size / 100), `⭐⭐ …but DRAWS 3 or more of them in one 3x3 in ${crowdedDrawn} of its ${drawnStates} states that draw any — 1% of its states or fewer`, crowdedDrawn);
}

// ── the fixture: rectangles [x0, y0, x1, y1) on a 48 x 48 sea (province 1), rows top-down ────────────────────────────────────
const W = 48, H = 48, SEA = 1;
const RECT = {
  2: [6, 6, 14, 14],     // state 1: one province of 8 x 8 = 64 px
  3: [14, 6, 30, 22],    // state 2: its neighbour to the east, big enough to be laid out
  4: [40, 4, 42, 36],    // state 3: a strip 2 px wide between two seas
  5: [4, 30, 9, 35],     // state 4: two provinces of 5 x 5, side by side — 50 px
  6: [9, 30, 14, 35],
};
const STATES = { 1: [2], 2: [3], 3: [4], 4: [5, 6] };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => { for (const [s, L] of Object.entries(STATES)) if (L.includes(p)) return +s; return null; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 100 + ((x * 3 + y * 5) % 100));
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="small-state-spread"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heightOf));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
}
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA); makeMod(modB);
const rootsA = { modRoot: modA, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
const readRows = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4]; return { sid: +c[0], type: c[1], x, z, px: Math.floor(x), row: H - 1 - Math.floor(z), spot: `${c[2]};${c[4]}` }; });
const own = (sid, rows) => rows.filter((r) => r.sid === sid && TEMPLATE.includes(r.type));
const full3x3 = (sid, px, row) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (stateOf(provAt(px + dx, row + dy)) !== sid) return false; return true; };
const spreadOf = (sid) => { const a = md.stateBuildingAnchor({ ...rootsA, provinces: STATES[sid], positions: true, stateId: sid }) || {}; return { ...a, positions: Array.isArray(a.positions) ? a.positions : [] }; };

// the CONTROL before any row is written: which states are piles
const layoutNull = Object.fromEntries(Object.keys(STATES).map((s) => [s, md.stateSlotLayout(spreadOf(+s)) === null]));
console.log("\n=== the click: Auto-fix's slot pass furnishes every state ===");
const fixed = md.fixStatesWithoutBuildingSlots(rootsA);
ok(fixed && fixed.fixed === Object.keys(STATES).length && !(fixed.failed || []).length, `fixStatesWithoutBuildingSlots gave each of the ${Object.keys(STATES).length} states its rows`, fixed);
const rows = readRows(modA);

for (const [sid, what] of [[1, "one province of 64 px"], [4, "two provinces of 25 px each"]]) {
  console.log(`\n=== 2. a pile state: ${what} ===`);
  const mine = own(sid, rows), ic = mine.filter((r) => r.type === "industrial_complex"), af = mine.filter((r) => r.type === "arms_factory");
  const air = mine.find((r) => r.type === "air_base");
  ok(layoutNull[sid] === true && layoutNull[2] === false, "CONTROL: stateSlotLayout gives this state no layout (it is a pile) and gives its laid-out neighbour one", layoutNull);
  ok(mine.length === TEMPLATE_ROWS, `its ${TEMPLATE_ROWS} template rows`, mine.length);
  ok(spanOf(mine.filter((r) => r.type !== "air_base")) > 2, "⭐⭐ its rows are not in one 3x3", { span: spanOf(mine), spots: mine.map((r) => [r.px, r.row]) });
  const pts = new Set(mine.map((r) => r.spot)).size;
  ok(pts >= 13, `⭐⭐ …they stand on ${pts} points — 13 or more, the base game's median for a state of under 100 px`, pts);
  ok(mine.every((r) => stateOf(provAt(r.px, r.row)) === sid), "⭐ every row on the state's own land", mine.filter((r) => stateOf(provAt(r.px, r.row)) !== sid).map((r) => [r.type, r.px, r.row]));
  ok(ic.length && ic.every((r, k) => !af[k] || af[k].spot !== r.spot), "industrial_complex k and arms_factory k never on one point", ic.map((r, k) => [r.spot, af[k] && af[k].spot]));
  ok(!!ic[0] && !!af[0] && !!air && new Set([ic[0].spot, af[0].spot, air.spot]).size === 3, "⭐ the first civilian factory, the first military one and the air base on three points", { ic0: ic[0] && ic[0].spot, af0: af[0] && af[0].spot, air: air && air.spot });
  ok(!!ic[0] && !!af[0] && full3x3(sid, ic[0].px, ic[0].row) && full3x3(sid, af[0].px, af[0].row), "⭐ …the two factories each with a 3x3 of the state's land round it", { ic0: ic[0] && [ic[0].px, ic[0].row], af0: af[0] && [af[0].px, af[0].row] });
}

console.log("\n=== 3. a strip 2 px wide: every row on the strip, spread along it ===");
{
  const mine = own(3, rows), pts = new Set(mine.map((r) => r.spot)).size;
  ok(layoutNull[3] === true && mine.length === TEMPLATE_ROWS, "(the fixture: a pile, its template rows written)", { pile: layoutNull[3], rows: mine.length });
  ok(mine.every((r) => provAt(r.px, r.row) === 4), "⭐⭐ every row on the strip — no step sideways into the sea", mine.filter((r) => provAt(r.px, r.row) !== 4).map((r) => [r.type, r.px, r.row]));
  ok(pts >= 13, `⭐ …on ${pts} points of it — 13 or more`, pts);
}

console.log("\n=== 3b. the laid-out neighbour: the base game's per-state measure ===");
{
  // ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own — section 1's measure, on the state the fixture lays out (16 x 16, 4 positions), every
  // row counted as drawn: its factory copies stood a pixel aside of each other in a plus, 6 in one 3x3, and each that has a spot no worse
  // placed than its step takes it. A state this small has few such spots — 2 px from every factory, 3 from every other row of its 22 and
  // its sites — so the bar here is fewer than its steps; test-a-factorys-copy-stands-on-a-spot-of-its-own.js holds a roomy state to 2
  const mine = own(2, rows), most3 = (L) => { let best = 0; for (const a of L) for (let ox = -2; ox <= 0; ox++) for (let oy = -2; oy <= 0; oy++) { const n = L.filter((q) => q.px >= a.px + ox && q.px <= a.px + ox + 2 && q.row >= a.row + oy && q.row <= a.row + oy + 2).length; if (n > best) best = n; } return best; };
  const L2 = md.stateSlotLayout(spreadOf(2)), steps = L2 ? ["industrial_complex", "arms_factory"].flatMap((t) => L2.get(t).map((s) => ({ px: Math.floor(s.x), row: H - 1 - Math.floor(s.z) }))) : [];
  ok(layoutNull[2] === false && mine.length === TEMPLATE_ROWS && most3(steps) >= 3, `(the fixture: laid out, its template rows written; its factories' layout spots put ${most3(steps)} in one 3x3)`, { laid: !layoutNull[2], rows: mine.length, steps: most3(steps) });
  ok(most3(mine) < most3(steps), `⭐⭐ its rows put fewer in one 3x3 (${most3(mine)}) than its factories' steps alone did — the base game draws 3 or more in one in 1% of its states or fewer`, mine.map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 4. deterministic, and idempotent ===");
{
  const r2 = md.fixStatesWithoutBuildingSlots({ modRoot: modB, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(r2 && r2.fixed === Object.keys(STATES).length && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "⭐⭐ the same click on a second copy writes the same bytes", r2);
  const before = fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8");
  const again = md.fixStatesWithoutBuildingSlots(rootsA);
  ok(again && !again.fixed && fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8") === before, "a second click writes nothing", again);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
