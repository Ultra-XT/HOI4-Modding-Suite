// ⛔ #a-capital-auto-fix-moves-keeps-its-hub — A CAPITAL AUTO-FIX MOVES GETS THE HUB SUPPLY LEAVES IT BY, AND ONE RAILWAY TO ITS
// COUNTRY'S NETWORK.
//
// Generate land hubs every capital (chooseSupplyHubs step 1), but a capital fixForeignCapitals re-points in a later Auto-fix asked
// nobody: the supply step refuses every mod whose own map/supply_nodes.txt has rows, so the new capital stood with no hub — and
// supply leaves a capital by rail. Found 10-07 (the supply critique of TEST 33, commit 1 (e)): a modder hands a country's capital
// state to its neighbour, clicks Auto-fix, and the capital moves onto a state no hub share reaches.
//
// Pinned on a hand-written world the mod owns outright (its own states, hubs and railways): XXX on the west, YYY on the east — its
// capital YK, a city, on the north rows, and three states on the south rows: YA and YB, each with a hub and no railway between
// them (apart, as a modder may leave two networks), and YN between the two, worth more than either and with no hub. The modder
// hands YK to XXX, and:
//   (a) ⭐ Auto-fix moves YYY's capital onto its most important own state (read off the fixture: YN) and puts a hub on its victory
//       point;
//   (b) ⭐ ONE railway joins that hub to ONE of YYY's hubs, over YYY's own land;
//   (c) ⭐ YA and YB stay apart: no railway joins two networks that were there already;
//   (d) a second Auto-fix leaves supply_nodes.txt and railways.txt byte for byte;
//   (e) ⭐ on a network the mod does not own — an empty map/railways.txt, or no map/supply_nodes.txt of its own — it writes nothing,
//       and says why;
//   (f) ⭐ a capital the modder moved by hand is not this click's to hub;
//   (g) ⭐ a capital moved onto land of its country's that touches no other gets its hub and NO railway: the join is over its
//       own country's land only, as the rail planner's owner pass lays it (#a-country-reaches-its-hubs-by-its-own-rail);
//   (h) ⭐ a capital moved onto a state that already holds a hub is given none, and nothing is said of it — nor, on a mod whose
//       supply files are the base game's (the common case), is the gate: the hub is asked of the network that LOADS first (review
//       of 04d87b17: such a mod read "left the capital(s) it moved without a new supply hub" of a capital on the base game's hub).
// Every expected value is read off the fixture. Fixture-only: binds no port.
// Run: node test-a-capital-auto-fix-moves-keeps-its-hub.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capital-fix-hub-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
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

// ── the world: 12 x 6 provinces of 12 px, id = row * 12 + col + 1; land on rows 0-3, cols 0-9, sea round it ────────────────────────
const CELL = 12, COLS = 12, ROWS = 6, W = COLS * CELL, H = ROWS * CELL;
const PLAINS = 0, OCEAN = 15;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   name, kind, owner, provinces, its victory point and what it is worth, and whether it holds a hub
const STATES = [
  { name: "X1", category: "city", owner: "XXX", provinces: cells([0, 1, 2, 3, 4], [0, 1]), vp: idAt(2, 0), value: 10, hub: true },
  { name: "X2", category: "rural", owner: "XXX", provinces: cells([0, 1, 2, 3, 4], [2, 3]), vp: idAt(2, 2), value: 1, hub: false },
  { name: "YK", category: "city", owner: "YYY", provinces: cells([5, 6, 7, 8, 9], [0, 1]), vp: idAt(7, 0), value: 30, hub: true },
  { name: "YA", category: "town", owner: "YYY", provinces: cells([5, 6], [2, 3]), vp: idAt(5, 3), value: 5, hub: true },
  { name: "YN", category: "town", owner: "YYY", provinces: cells([7], [2, 3]), vp: idAt(7, 3), value: 15, hub: false },
  { name: "YB", category: "town", owner: "YYY", provinces: cells([8, 9], [2, 3]), vp: idAt(9, 3), value: 5, hub: true },
].map((s, k) => ({ ...s, id: k + 1 }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
// (g)'s variant: YE, a town of YYY's worth more than YN, carved out of X2's corner — land of YYY's that touches no other of YYY's
const EXCLAVE = { name: "YE", category: "town", owner: "YYY", provinces: cells([0], [3]), vp: idAt(0, 3), value: 25, hub: false, id: STATES.length + 1 };
const statesOf = ({ exclave = false } = {}) => (!exclave ? STATES
  : STATES.map((s) => (s.name === "X2" ? { ...s, provinces: s.provinces.filter((p) => !EXCLAVE.provinces.includes(p)) } : s)).concat([EXCLAVE]));
const nbrs = (u) => { const c = (u - 1) % COLS; return [c > 0 ? u - 1 : -1, c < COLS - 1 ? u + 1 : -1, u - COLS, u + COLS].filter((v) => v >= 1 && v <= COLS * ROWS); };
// the one railway: X1's hub to YK's, along row 0 — YA and YB are joined to nothing
const RAILS = [cells([2, 3, 4, 5, 6, 7], [0])];

function makeGame(name = "game", { supply = null } = {}) {
  const g = path.join(ROOT, name);
  write(g, "hoi4.exe", "");
  write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  // (h)'s base game: it ships the supply network — `supply` the states whose victory point holds a hub — and the one railway
  if (supply) {
    write(g, "map/supply_nodes.txt", STATES.filter((s) => supply.includes(s.name)).map((s) => `1 ${s.vp}`).join("\n") + "\n");
    write(g, "map/railways.txt", RAILS.map((r) => `1 ${r.length} ${r.join(" ")}`).join("\n") + "\n");
  }
  return g;
}
const GAME = makeGame();
const stateFile = (s, owner) => `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tvictory_points = { ${s.vp} ${s.value} }\n\t}\n}\n`;
/** the mod: every state its own, YK handed to XXX; `rails` false leaves map/railways.txt empty, `nodes` false ships no
 *  map/supply_nodes.txt, `ownNetwork` false neither file (it inherits both); `hubAlso` more states holding a hub (h); `yyyCapital`
 *  YYY's capital line; `exclave` (g)'s states */
function makeMod(tag, { rails = true, nodes = true, ownNetwork = true, hubAlso = [], handOver = true, yyyCapital = S.YK.id, exclave = false } = {}) {
  const m = path.join(ROOT, tag);
  const STATES = statesOf({ exclave });
  write(m, "descriptor.mod", 'name="capital fix hub"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? PLAINS : OCEAN)));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 106 : 89)));
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  for (const s of STATES) write(m, `map/strategicregions/r${s.id}.txt`, `strategic_region={\n\tid=${s.id}\n\tname="REGION_${s.id}"\n\tprovinces={ ${s.provinces.join(" ")} }\n\tweather={}\n}\n`);
  if (nodes && ownNetwork) write(m, "map/supply_nodes.txt", STATES.filter((s) => s.hub || hubAlso.includes(s.name)).map((s) => `1 ${s.vp}`).join("\n") + "\n");
  if (ownNetwork) write(m, "map/railways.txt", rails ? RAILS.map((r) => `1 ${r.length} ${r.join(" ")}`).join("\n") + "\n" : "");
  for (const s of STATES) write(m, `history/states/${s.id}-S.txt`, stateFile(s, handOver && s.name === "YK" ? "XXX" : s.owner));
  write(m, "history/countries/XXX - Exx.txt", `capital = ${S.X1.id}\n`);
  write(m, "history/countries/YYY - Wyy.txt", `capital = ${yyyCapital}\n`);
  return m;
}
const read = (m, f) => { try { return fs.readFileSync(path.join(m, "map", f)); } catch (_) { return null; } };
const hubsOn = (m) => new Set(md.parseSupplyNodes(String(read(m, "supply_nodes.txt") || "")).map((h) => h.province));
const railsOn = (m) => md.parseRailways(String(read(m, "railways.txt") || ""));
const joinedBy = (rails) => {   // province → the set of provinces its railways reach
  const g = new Map(), link = (u, v) => { if (!g.has(u)) g.set(u, new Set()); g.get(u).add(v); };
  for (const r of rails) for (let i = 1; i < r.provinces.length; i++) { link(r.provinces[i - 1], r.provinces[i]); link(r.provinces[i], r.provinces[i - 1]); }
  return (a, b) => { const seen = new Set([a]), q = [a]; while (q.length) { const u = q.shift(); if (u === b) return true; for (const v of (g.get(u) || [])) if (!seen.has(v)) { seen.add(v); q.push(v); } } return false; };
};
const ownerAfter = (s) => (s.name === "YK" ? "XXX" : s.owner);
// YYY's most important own state once YK is gone, off the fixture: the highest victory point
const yyyLeft = STATES.filter((s) => ownerAfter(s) === "YYY").sort((a, b) => b.value - a.value || a.id - b.id);
const NEXT = yyyLeft[0];

console.log("\n-- the fixture can tell right from wrong --");
ok(NEXT === S.YN && !S.YN.hub && S.YA.hub && S.YB.hub, "(the fixture: with YK handed over, YYY's most important state is YN — no hub — between YA and YB, which hold one each)", yyyLeft.map((s) => s.name));
ok(!joinedBy(RAILS.map((p) => ({ provinces: p })))(S.YA.vp, S.YB.vp), "(the fixture: no railway joins YA's hub to YB's)");

console.log("\n-- (a)-(c): the modder hands YK to XXX, and clicks Auto-fix --");
const MOD = makeMod("mod");
const railsBefore = railsOn(MOD), hubsBefore = hubsOn(MOD);
const fix1 = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
const capFix = ((fix1 && fix1.fixes) || {}).capitals || {}, ch = ((fix1 && fix1.fixes) || {}).capitalHubs || {};
const model = md.buildMapModel({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
ok(fix1 && fix1.ok === true && (capFix.details || []).some((d) => d.tag === "YYY" && d.from === S.YK.id && d.to === NEXT.id) && (model.capitals || {}).YYY === NEXT.id,
  `(guard: Auto-fix moved YYY's capital off YK onto ${NEXT.name}, its most important own state)`, { error: fix1 && fix1.error, capFix, capitals: model.capitals });
const hubs1 = hubsOn(MOD), rails1 = railsOn(MOD);
ok(hubs1.has(NEXT.vp) && hubs1.size === hubsBefore.size + 1 && [...hubsBefore].every((p) => hubs1.has(p)),
  `⭐⭐ (a) the new capital, ${NEXT.name}, holds a hub on its victory point (${NEXT.vp}) — the one hub added`, { before: [...hubsBefore], after: [...hubs1], ch });
ok(Number(ch.hubs) === 1 && (ch.states || []).some((x) => x.tag === "YYY" && x.state === NEXT.id && x.hub === NEXT.vp),
  "…and the click says so: which country, which state, which province", ch);
const added = rails1.filter((r) => !railsBefore.some((b) => b.provinces.join() === r.provinces.join()));
const ownerOfProvince = new Map(); for (const s of STATES) for (const p of s.provinces) ownerOfProvince.set(p, ownerAfter(s));
const ends = (r) => [r.provinces[0], r.provinces[r.provinces.length - 1]];
const yHubs = [...hubsBefore].filter((p) => ownerOfProvince.get(p) === "YYY");
ok(added.length === 1 && ends(added[0]).includes(NEXT.vp) && ends(added[0]).some((p) => p !== NEXT.vp && yHubs.includes(p)),
  `⭐⭐ (b) ONE railway joins ${NEXT.name}'s hub to one of YYY's hubs`, { added: added.map((r) => r.provinces), yHubs, ch });
ok(added.length === 1 && added[0].provinces.every((p) => ownerOfProvince.get(p) === "YYY"),
  "⭐ …over YYY's own land, end to end", added.map((r) => r.provinces.map((p) => [p, ownerOfProvince.get(p)])));
ok(!joinedBy(rails1)(S.YA.vp, S.YB.vp), "⭐⭐ (c) YA and YB stay apart: no railway joined two networks that were there already", rails1.map((r) => r.provinces));
ok(rails1.length === railsBefore.length + added.length && railsBefore.every((b) => rails1.some((r) => r.provinces.join() === b.provinces.join())),
  "…and every railway that was there is there still", { before: railsBefore.length, after: rails1.length });

console.log("\n-- (d) a second Auto-fix writes nothing more --");
{
  const sn = read(MOD, "supply_nodes.txt"), rw = read(MOD, "railways.txt");
  const fix2 = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
  ok(fix2 && fix2.ok === true && read(MOD, "supply_nodes.txt").equals(sn) && read(MOD, "railways.txt").equals(rw),
    "⭐ the second click leaves supply_nodes.txt and railways.txt byte for byte", { capitals: (fix2.fixes || {}).capitals, capitalHubs: (fix2.fixes || {}).capitalHubs });
  ok(Number(((fix2.fixes || {}).capitalHubs || {}).hubs || 0) === 0, "…and moved no capital, so it hubbed none", (fix2.fixes || {}).capitalHubs);
}

console.log("\n-- (e) on a network the mod does not own, it writes nothing and says why --");
for (const [label, opts, file] of [["an empty map/railways.txt", { rails: false }, "railways.txt"], ["no map/supply_nodes.txt of its own", { nodes: false }, "supply_nodes.txt"]]) {
  const m = makeMod("mod-" + file.replace(/\W/g, "-"), opts);
  const sn = read(m, "supply_nodes.txt"), rw = read(m, "railways.txt");
  const fx = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const c = ((fx && fx.fixes) || {}).capitals || {}, h = ((fx && fx.fixes) || {}).capitalHubs || {};
  ok(fx && fx.ok === true && (c.details || []).some((d) => d.tag === "YYY" && d.to === NEXT.id), `(guard: ${label} — Auto-fix still moved YYY's capital)`, { error: fx && fx.error, c });
  const snAfter = read(m, "supply_nodes.txt"), rwAfter = read(m, "railways.txt");
  ok((sn === null ? snAfter === null : !!snAfter && snAfter.equals(sn)) && (rw === null ? rwAfter === null : !!rwAfter && rwAfter.equals(rw)),
    `⭐⭐ ${label}: supply_nodes.txt and railways.txt are as they were`, { sn: String(snAfter), rw: String(rwAfter) });
  // said of the capital left with no hub, which the page lists under "not finished" (it was one sentence for the whole click, said
  // as a fix — moved with the review of 04d87b17, which found it said of capitals that HAD a hub)
  ok(Array.isArray(h.skipped) && h.skipped.length === 1 && h.skipped[0].tag === "YYY" && String(h.skipped[0].reason).includes(file) && !(Number(h.hubs) > 0),
    `⭐ …and the click says why, of YYY's capital, naming map/${file}`, h);
}

console.log("\n-- (h) a capital moved onto a state that already holds a hub: no hub, and nothing said — the mod's network or the base game's --");
{
  // the mod's own network with YN hubbed: the click moves YYY's capital onto YN and has nothing to give it
  const m = makeMod("mod-hubbed", { hubAlso: [NEXT.name] });
  const sn = read(m, "supply_nodes.txt"), rw = read(m, "railways.txt");
  ok(hubsOn(m).has(NEXT.vp), `(the fixture: ${NEXT.name}'s victory point holds one of the mod's own hubs)`, [...hubsOn(m)]);
  const fx = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const c = ((fx && fx.fixes) || {}).capitals || {}, h = ((fx && fx.fixes) || {}).capitalHubs || {};
  ok(fx && fx.ok === true && (c.details || []).some((d) => d.tag === "YYY" && d.to === NEXT.id), `(guard: Auto-fix moved YYY's capital onto ${NEXT.name})`, { error: fx && fx.error, c });
  ok(read(m, "supply_nodes.txt").equals(sn) && read(m, "railways.txt").equals(rw), "⭐⭐ supply_nodes.txt and railways.txt keep their bytes", { h });
  ok(!(Number(h.hubs) > 0) && Array.isArray(h.skipped) && h.skipped.length === 0 && !(h.states || []).length,
    `⭐⭐ …and the click hubs nothing and says nothing: ${NEXT.name} has its hub (no "could not give YYY's moved capital a supply hub")`, h);
  // the mod ships no supply file of its own; the base game hubs YN. The gate refuses this network — but YN needs nothing from it
  const G = makeGame("game-hubs", { supply: [...STATES.filter((s) => s.hub).map((s) => s.name), NEXT.name] });
  const mi = makeMod("mod-inherits", { ownNetwork: false });
  const fi = md.autoFixMap({ modRoot: mi, gameRoot: G, dependencyRoots: [] });
  const ci = ((fi && fi.fixes) || {}).capitals || {}, hi = ((fi && fi.fixes) || {}).capitalHubs || {};
  const mi2 = md.buildMapModel({ modRoot: mi, gameRoot: G, dependencyRoots: [], cacheStableLayers: false });
  ok(fi && fi.ok === true && (ci.details || []).some((d) => d.tag === "YYY" && d.to === NEXT.id) && (mi2.supplyNodes || []).some((x) => x.province === NEXT.vp),
    `(guard: Auto-fix moved YYY's capital onto ${NEXT.name}, which holds the base game's hub — the network that loads)`, { error: fi && fi.error, ci, hubs: (mi2.supplyNodes || []).map((x) => x.province) });
  ok(read(mi, "supply_nodes.txt") === null && read(mi, "railways.txt") === null, "⭐ …nothing is copied into the mod", { h: hi });
  ok(!(Number(hi.hubs) > 0) && Array.isArray(hi.skipped) && hi.skipped.length === 0,
    "⭐⭐⭐ …and the gate is said of no capital: the one moved stands on a hub (it was said as 'left without a new supply hub')", hi);
  // CONTROL: the same inherited network with YN unhubbed — now the gate IS said, of YYY
  const G2 = makeGame("game-hubs-not-yn", { supply: STATES.filter((s) => s.hub).map((s) => s.name) });
  const mc = makeMod("mod-inherits-control", { ownNetwork: false });
  const fc = md.autoFixMap({ modRoot: mc, gameRoot: G2, dependencyRoots: [] });
  const hc = ((fc && fc.fixes) || {}).capitalHubs || {};
  ok(Array.isArray(hc.skipped) && hc.skipped.length === 1 && hc.skipped[0].tag === "YYY" && /supply_nodes\.txt is not its own/.test(String(hc.skipped[0].reason)),
    `CONTROL: with ${NEXT.name} not hubbed below, the gate is said — of YYY, naming the file`, hc);
  // …and of each capital apart: two capitals one click moved, XXX's onto X1, which holds the base game's hub, and YYY's onto YN, which
  // does not — the gate is said of YYY alone
  const both = md.hubCapitalsThisClickMoved({ modRoot: mc, gameRoot: G2, dependencyRoots: [], moved: ["XXX", "YYY"] });
  ok(S.X1.hub && Array.isArray(both.skipped) && both.skipped.length === 1 && both.skipped[0].tag === "YYY" && !(Number(both.hubs) > 0),
    "⭐⭐ two moved capitals, one standing on a hub: the gate is said of the other alone", both);
}

console.log("\n-- (f) a capital the modder moved by hand is not this click's --");
{
  const m = makeMod("mod-by-hand", { handOver: false, yyyCapital: NEXT.id });
  const sn = read(m, "supply_nodes.txt"), rw = read(m, "railways.txt");
  const fx = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const c = ((fx && fx.fixes) || {}).capitals || {};
  ok(fx && fx.ok === true && !(c.details || []).length, "(guard: YYY's capital line names its own YN, so Auto-fix moved no capital)", { error: fx && fx.error, c });
  ok(read(m, "supply_nodes.txt").equals(sn) && read(m, "railways.txt").equals(rw) && !hubsOn(m).has(NEXT.vp),
    `⭐⭐ ${NEXT.name}, a capital the modder chose, gets no hub from this click — its network is the modder's`, { capitalHubs: (fx.fixes || {}).capitalHubs });
}

console.log("\n-- (g) a moved capital on land of its country's that touches no other: its hub, and no railway across another country's land --");
{
  const all = statesOf({ exclave: true }), left = all.filter((s) => ownerAfter(s) === "YYY").sort((a, b) => b.value - a.value || a.id - b.id), next = left[0];
  const touchesOwn = next.provinces.some((p) => nbrs(p).some((q) => left.some((s) => s !== next && s.provinces.includes(q))));
  ok(next === EXCLAVE && !touchesOwn && next.provinces.some((p) => nbrs(p).some((q) => all.some((s) => s.owner === "XXX" && s.provinces.includes(q)))),
    `(the fixture: YYY's most important state is now ${next.name}, whose land touches XXX's and no other of YYY's)`, left.map((s) => s.name));
  const m = makeMod("mod-exclave", { exclave: true });
  const railsB = railsOn(m), hubsB = hubsOn(m);
  const fx = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const c = ((fx && fx.fixes) || {}).capitals || {}, h = ((fx && fx.fixes) || {}).capitalHubs || {};
  ok(fx && fx.ok === true && (c.details || []).some((d) => d.tag === "YYY" && d.to === next.id), `(guard: Auto-fix moved YYY's capital onto ${next.name})`, { error: fx && fx.error, c });
  ok(hubsOn(m).has(next.vp) && hubsOn(m).size === hubsB.size + 1, `⭐ ${next.name} holds the one hub added, on its victory point`, { h, hubs: [...hubsOn(m)] });
  ok(railsOn(m).length === railsB.length && Number(h.railways) === 0,
    "⭐⭐ …and no railway: none joins it over YYY's own land, and one over XXX's is not one its capital can use", { h, rails: railsOn(m).map((r) => r.provinces) });
}

console.log("\n-- (i) joinOnly hubs a named state only when it is its country's capital (review of 04d87b17, NS-9 MB26) --");
{
  // YN holds no hub. Named on a joinOnly call while YYY's capital is YK it gets none — a state the call names is not one Auto-fix moved a
  // capital onto just because it is named; with YYY's capital line on YN, the same call hubs it.
  const plan = (yyyCapital) => md.generateSupplyNetwork({ modRoot: makeMod(`mod-joinonly-${yyyCapital}`, { handOver: false, yyyCapital }), gameRoot: GAME, dependencyRoots: [],
    stateIds: [S.YN.id], joinOnly: true, dryRun: true });
  const notCap = plan(S.YK.id), cap = plan(S.YN.id);
  ok(!S.YN.hub && S.YK.hub, "(the fixture: YN holds no hub, YK one)");
  ok(cap && !cap.error && Number(cap.hubs) === 1, "CONTROL: with YYY's capital on YN, a joinOnly call naming YN hubs it", cap);
  ok(notCap && !notCap.error && Number(notCap.hubs) === 0, "⭐ …and with YYY's capital on YK, the same call hubs nothing: YN is named, not a capital", notCap);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
