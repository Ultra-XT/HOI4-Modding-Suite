// ⛔ #a-generated-state-keeps-the-industry-of-the-land-below — OVER THE INSTALLED BASE GAME: what the rule reads is the game's, and
// a world generated over it has industry, within the game's own totals, and every dockyard on a position on its own coast.
//
//   1. The coast's rows are DERIVED, not typed: from vanilla's own map/buildings.txt, the row types every coastal state has exactly
//      one of, and those every coastal province has exactly one of standing on it. Nova's COASTAL_STATE_BUILDING_SLOTS and
//      PER_COASTAL_PROVINCE_BUILDING_SLOTS must be among them, and among the types common/buildings makes coast-only.
//   2. stateBuildingRules agrees with this test's own reader of vanilla's common/buildings on which buildings share the state's
//      slots, their state_max, and which are coast-only — the set the deal caps by, never a typed IC/AF/dockyard triple.
//   3. A world generated the way the owner's flow does (replace_path="history/states", Delete map, then Generate land; the resources
//      test's size and seed — so each country keeps its 1936 economy, #a-generated-country-keeps-its-economy): it has
//      civilian and military factories, no key above the base game's own total, no state over its slots, no dockyard off a coast,
//      and every state that declares a dockyard has a dockyard row standing on its own coastal province; and once Auto-fix has given
//      it its ports (fixCoastalNoPort), its ports, dockyards and coastal forts face their sea (#a-harbour-faces-its-sea).
// Before the fix every generated state carried infrastructure 2 and an air base and nothing else (TEST 32: 0 factories).
//
// SKIPS without the game. Binds no port. Run: node test-a-generated-world-has-the-industry-of-the-world-below.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "definition.csv")) || !fs.existsSync(path.join(GAME, "common", "buildings"))) {
  console.log("SKIP: no Hearts of Iron IV install at " + GAME);
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genindustry-"));
process.env.APPDATA = path.join(tmp, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(tmp, "home");
process.env.HOI4_MODS_ROOT = tmp;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};
const strip = (s) => s.replace(/^\uFEFF/, "").replace(/#[^\n]*/g, "");

// ── this test's own readers ────────────────────────────────────────────────────────────────────────────────────────────────
function blocks(body) {   // top-level `name = { … }` of a comment-free body
  const out = [];
  const re = /([A-Za-z0-9_]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    let d = 0;
    const open = body.indexOf("{", m.index);
    for (let k = open; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (!d) { out.push({ key: m[1], body: body.slice(open + 1, k) }); re.lastIndex = k + 1; break; } } }
  }
  return out;
}
const flatOf = (b) => { let d = 0, s = ""; for (const c of b) { if (c === "{") d++; s += d ? " " : c; if (c === "}") d--; } return s; };
function buildingRulesOf(root) {
  const out = new Map();
  const dir = path.join(root, "common", "buildings");
  for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x)).sort()) {
    // a file that wraps its buildings in `buildings = { … }` holds other top-level blocks too (vanilla's spawn_points); one that
    // does not is all buildings
    const top = blocks(strip(fs.readFileSync(path.join(dir, f), "utf8"))), wrapped = top.filter((t) => t.key === "buildings");
    for (const b of (wrapped.length ? wrapped.flatMap((t) => blocks(t.body)) : top)) {
      const cap = flatOf((blocks(b.body).find((x) => x.key === "level_cap") || {}).body || "");
      const own = flatOf(b.body);
      out.set(b.key, { shares: /shares_slots\s*=\s*yes/.test(cap), stateMax: +((cap.match(/state_max\s*=\s*(\d+)/) || [])[1] || Infinity),
        coast: /(only_costal|is_port)\s*=\s*yes/.test(own) });
    }
  }
  return out;
}
function bitmap(file, csvFile) {
  const buf = fs.readFileSync(file), off = buf.readUInt32LE(10), W = buf.readInt32LE(18), H = buf.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
  const byColour = new Map(), type = new Map();
  for (const l of fs.readFileSync(csvFile, "utf8").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;
    byColour.set((+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]);
    type.set(+c[0], c[4].trim());
  }
  const idAt = (x, y) => { const o = off + (H - 1 - y) * rs + x * 3; const id = byColour.get((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]); return id == null ? -1 : id; };
  return { W, H, idAt, type };
}
function coastalProvinces(bm) {   // land with a 4-neighbour of sea, x wrapping (the map is a cylinder), lakes not counting
  const out = new Set();
  for (let y = 0; y < bm.H; y++) for (let x = 0; x < bm.W; x++) {
    const a = bm.idAt(x, y);
    if (bm.type.get(a) !== "land") continue;
    for (const [qx, qy] of [[(x + 1) % bm.W, y], [(x - 1 + bm.W) % bm.W, y], [x, y - 1], [x, y + 1]]) {
      if (qy < 0 || qy >= bm.H) continue;
      if (bm.type.get(bm.idAt(qx, qy)) === "sea") { out.add(a); break; }
    }
  }
  return out;
}
function statesOf(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x))) {
    const t = strip(fs.readFileSync(path.join(dir, f), "utf8"));
    const id = +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1];
    const provinces = ((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").match(/\d+/g) || [];
    const bi = /\bbuildings\s*=\s*\{/.exec(t);
    const keys = {};
    if (bi) {
      const body = (blocks(t.slice(bi.index)).find((b) => b.key === "buildings") || {}).body || "";
      for (const m of flatOf(body).matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) keys[m[1]] = +m[2];
    }
    out.push({ id, provinces: provinces.map(Number), category: (/\bstate_category\s*=\s*(\w+)/.exec(t) || [])[1], keys });
  }
  return out;
}
const rowsOf = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7).map((c) => ({ sid: +c[0], type: c[1], x: +c[2], z: +c[4] }));

const RULES = buildingRulesOf(GAME);

console.log("=== 1. the coast's rows, derived from the base game ===");
{
  const bm = bitmap(path.join(GAME, "map", "provinces.bmp"), path.join(GAME, "map", "definition.csv"));
  const coast = coastalProvinces(bm);
  const states = statesOf(path.join(GAME, "history", "states"));
  const stateOf = new Map(); for (const s of states) for (const p of s.provinces) stateOf.set(p, s.id);
  const coastalStates = new Set([...coast].map((p) => stateOf.get(p)).filter((x) => x != null));
  const rows = rowsOf(path.join(GAME, "map", "buildings.txt"));
  const types = [...new Set(rows.map((r) => r.type))];
  const perState = (t) => { const m = new Map(); for (const r of rows) if (r.type === t) m.set(r.sid, (m.get(r.sid) || 0) + 1); return m; };
  const onePerCoastalState = types.filter((t) => { const m = perState(t); return [...coastalStates].every((s) => m.get(s) === 1) && [...m.keys()].every((s) => coastalStates.has(s)); });
  // one per coastal province: as many rows as there are coastal provinces in states, every row on its own state's land, and no
  // province with two. (Not "one standing on every coastal province": 2 of vanilla's 2,362 coastal_bunker rows stand a pixel inland.)
  const coastInStates = [...coast].filter((p) => stateOf.has(p));
  const onePerCoastalProvince = types.filter((t) => {
    const on = new Map(); let n = 0, ownLand = 0;
    for (const r of rows) if (r.type === t) {
      n++;
      const px = Math.floor(r.x), row = md.buildingZToPixelY(bm.H, r.z);
      if (px < 0 || row < 0 || px >= bm.W || row >= bm.H) continue;
      const p = bm.idAt(px, row);
      if (bm.type.get(p) === "land" && stateOf.get(p) === r.sid) ownLand++;
      on.set(p, (on.get(p) || 0) + 1);
    }
    return n === coastInStates.length && ownLand === n && [...on.values()].every((k) => k === 1);
  });
  console.log(`   ${coastalStates.size} coastal states, ${coast.size} coastal provinces; one per coastal state: ${onePerCoastalState.join(", ")}; one per coastal province: ${onePerCoastalProvince.join(", ")}`);
  rec("CONTROL: the base game has coastal states and rows to measure", coastalStates.size > 100 && rows.length > 10000, { coastalStates: coastalStates.size, rows: rows.length });
  rec("CONTROL: a per-state constant (air_base) is NOT one per coastal state — the measure tells the two apart", !onePerCoastalState.includes("air_base"));
  const perStateTypes = (md.COASTAL_STATE_BUILDING_SLOTS || []).map(([t, n]) => { rec(`${t}: one row per coastal state (${n}), as the base game has`, n === 1 && onePerCoastalState.includes(t), onePerCoastalState); return t; });
  rec("Nova places at least one per-coastal-state type", perStateTypes.length >= 1, md.COASTAL_STATE_BUILDING_SLOTS);
  for (const t of (md.PER_COASTAL_PROVINCE_BUILDING_SLOTS || [])) rec(`${t}: one row standing on every coastal province, as the base game has`, onePerCoastalProvince.includes(t), onePerCoastalProvince);
  rec("Nova places at least one per-coastal-province type", (md.PER_COASTAL_PROVINCE_BUILDING_SLOTS || []).length >= 1);
  for (const t of [...perStateTypes, ...(md.PER_COASTAL_PROVINCE_BUILDING_SLOTS || [])]) rec(`${t} is coast-only in common/buildings`, !!(RULES.get(t) || {}).coast, RULES.get(t));
}

console.log("\n=== 2. stateBuildingRules reads common/buildings as this test does ===");
let model0 = null;
{
  model0 = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
  rec("map-data.js exports stateBuildingRules", typeof md.stateBuildingRules === "function");
  const rules = typeof md.stateBuildingRules === "function" ? md.stateBuildingRules(model0) : new Map();
  const sharedMine = [...RULES].filter(([, r]) => r.shares).map(([k]) => k).sort();
  const sharedNova = [...rules].filter(([, r]) => r.sharesSlots).map(([k]) => k).sort();
  rec(`the shared-slot buildings agree (${sharedMine.length}: ${sharedMine.join(", ")})`, JSON.stringify(sharedMine) === JSON.stringify(sharedNova), { sharedNova });
  rec("CONTROL: they are more than the three a typed list would hold", sharedMine.length > 3, sharedMine);
  const maxOff = [...RULES].filter(([k, r]) => !rules.has(k) || rules.get(k).stateMax !== r.stateMax).map(([k]) => k);
  rec("every building's state_max agrees", maxOff.length === 0, maxOff);
  const coastOff = [...RULES].filter(([k, r]) => (rules.get(k) || {}).coastOnly !== r.coast).map(([k]) => k);
  rec("every building's coast-only flag agrees", coastOff.length === 0, coastOff);
}

console.log("\n=== 3. a world generated over the base game ===");
{
  const below = statesOf(path.join(GAME, "history", "states"));
  const totals = {};
  for (const s of below) for (const [k, v] of Object.entries(s.keys)) totals[k] = (totals[k] || 0) + v;
  const mod = path.join(tmp, "mod");
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  // ⛔ #a-generated-country-keeps-its-economy — replace_path="history/states", as Delete map's dialog tells the owner and his flow
  // does, so this section measures each country keeping its 1936 economy: without it the base game's states still load and hold
  // every country's whole economy, and the new states keep only their own land's (test-a-generated-state-keeps-the-resources-of-
  // the-land-below.js pins that shape)
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1"\nname="gen industry"\nsupported_version="1.19.*"\nreplace_path="history/states"\npath="mod/x"\n');
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
  md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const gen = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 400, seed: 3 });
  const made = new Set(((gen && gen.newStates) || []).map((s) => s.id));
  rec("the world was generated", gen && gen.changed !== false && made.size >= 20, gen && (gen.error || made.size));
  const states = statesOf(path.join(mod, "history", "states")).filter((s) => made.has(s.id));
  const got = {};
  for (const s of states) for (const [k, v] of Object.entries(s.keys)) if (k !== "infrastructure" && k !== "air_base") got[k] = (got[k] || 0) + v;
  console.log("   carried: " + Object.entries(got).map(([k, v]) => `${k} ${v} of ${totals[k]}`).join(", ") + ` — in ${states.filter((s) => Object.keys(s.keys).some((k) => k !== "infrastructure" && k !== "air_base")).length} of ${states.length} states`);
  const ind = (gen && gen.industry) || {};
  console.log("   report : " + JSON.stringify(ind).slice(0, 400));
  rec("⭐⭐ it has civilian factories", (got.industrial_complex || 0) > 0, got);
  rec("⭐⭐ …and military factories", (got.arms_factory || 0) > 0, got);
  rec("no key above the base game's own total (a share is never invented)", Object.entries(got).every(([k, v]) => v <= (totals[k] || 0)), { got, totals });
  rec("the report counts what is on disk", Object.entries(got).every(([k, v]) => (ind.written || {})[k] === v) && Object.keys(ind.written || {}).length === Object.keys(got).length, ind.written);
  const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
  const probs = (md.validateMapModel(model) || []).concat(md.validateMapBitmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] }) || []);
  const mine = (rule) => probs.filter((q) => q.rule === rule).flatMap((q) => q.items || []).filter((it) => made.has(+(it && it.stateId)));
  rec("no generated state is over its building slots", mine("state_buildings_exceed_slots").length === 0, mine("state_buildings_exceed_slots").slice(0, 5));
  rec("no dockyard in a generated state off the coast", mine("state_naval_building_without_coast").length === 0, mine("state_naval_building_without_coast").slice(0, 5));
  const bm = bitmap(path.join(mod, "map", "provinces.bmp"), path.join(mod, "map", "definition.csv"));
  const coast = coastalProvinces(bm);
  const rows = rowsOf(path.join(mod, "map", "buildings.txt"));
  const yards = states.filter((s) => s.keys.dockyard > 0);
  const badYard = yards.filter((s) => !rows.some((r) => r.sid === s.id && r.type === "dockyard" && (() => { const p = bm.idAt(Math.floor(r.x), md.buildingZToPixelY(bm.H, r.z)); return s.provinces.includes(p) && coast.has(p); })()));
  rec(`⭐ every one of the ${yards.length} states with a dockyard has a dockyard row on its own coastal province`, yards.length > 0 && badYard.length === 0, badYard.map((s) => s.id).slice(0, 10));
  // ⛔ #a-coast-has-the-naval-rows-its-buildings-stand-on — …and every coastal province of a generated state has one row of each
  // per-coastal-province type standing on it, as section 1 finds the base game has (all three drawn on rows of their own there)
  const coastOfMade = states.flatMap((s) => s.provinces.filter((p) => coast.has(p)));
  for (const t of md.PER_COASTAL_PROVINCE_BUILDING_SLOTS) {
    const on = new Map();
    for (const r of rows) if (r.type === t) { const p = bm.idAt(Math.floor(r.x), md.buildingZToPixelY(bm.H, r.z)); on.set(p, (on.get(p) || 0) + 1); }
    const bad = coastOfMade.filter((p) => on.get(p) !== 1);
    rec(`⭐ ${t}: one row on each of the ${coastOfMade.length} coastal provinces of the generated states`, coastOfMade.length > 0 && bad.length === 0, bad.slice(0, 10));
  }

  // ⛔ #a-harbour-faces-its-sea — …and every coast row faces its sea. The ports are Auto-fix's (fixCoastalNoPort), so it is asked
  // here as the owner's flow asks it; Generate land alone writes none. Judged by this test's own reading of the sea round each row:
  // the water side (rotation − π/2, counter-clockwise from map east) against the centroid of the sea pixels within 6 px, x wrapping.
  // Not "none beyond 135°": a strait's port faces the larger sea within 3 px, which the 6-px measure can see the other way (TEST 33a
  // re-turned 1 such row in 1,754, TEST 32 1).
  const ports = md.fixCoastalNoPort({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  rec("Auto-fix gives the new coast its ports", ports && !ports.error && ports.added > 0, ports && (ports.error || ports.added));
  const after = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7).map((c) => ({ type: c[1], x: +c[2], z: +c[4], rot: +c[5] }));
  const seaDir = (x, z, R = 6) => {
    let sx = 0, sz = 0; const c0 = Math.floor(x), z0 = Math.floor(z);
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const row = bm.H - 1 - (z0 + dz), ux = c0 + dx + 0.5 - x, uz = z0 + dz + 0.5 - z;
      if (row < 0 || row >= bm.H || ux * ux + uz * uz > R * R || bm.type.get(bm.idAt(((c0 + dx) % bm.W + bm.W) % bm.W, row)) !== "sea") continue;
      sx += ux; sz += uz;
    }
    return sx || sz ? Math.atan2(sz, sx) : null;
  };
  const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
  // the port Auto-fix writes, and every coast row Generate land does (its slot lists; the hub and HQ too, #a-coast-has-the-naval-rows-its-buildings-stand-on)
  for (const t of ["naval_base_spawn", ...md.COASTAL_STATE_BUILDING_SLOTS.map(([k]) => k), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]) {
    let n = 0, within = 0, away = 0;
    for (const r of after) {
      if (r.type !== t) continue;
      const phi = seaDir(r.x, r.z);
      if (phi == null) continue;
      n++;
      const d = Math.abs(wrapA(r.rot - Math.PI / 2 - phi));
      if (d <= Math.PI / 4) within++;
      if (d > 3 * Math.PI / 4) away++;
    }
    console.log(`   ${t}: ${n} rows with sea within 6 px · water side within 45° of it ${within} (${(100 * within / Math.max(1, n)).toFixed(1)}%) · beyond 135° ${away}`);
    rec(`${t}: the generated world has some to judge`, n > 0, n);
    rec(`⭐ ${t}: at least 90% face their sea, the water side within 45° of it`, n > 0 && within >= 0.9 * n, { n, within });
    rec(`${t}: at most 1% face away from it, beyond 135°`, away <= 0.01 * n, { n, away });
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
