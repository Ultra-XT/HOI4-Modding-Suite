// ⛔ #an-air-base-holds-the-planes-it-starts-with + #a-generated-railway-is-as-good-as-the-rail-below — ON THE BASE GAME ITSELF.
//
// TEST 32 gave every state `air_base = 1` and every railway level 1. Vanilla gives 750 of its 1,081 states no air base and the rest
// 1–10, and its railways run 1–4 — so 14 states started 620 planes over capacity (3,443 at 1939), the map showed an airfield in every
// state, and no main line stood out from a branch line. The two fixtures beside this file pin each rule; this asks the installed
// game the question the owner's world asks, on a world Generate land raises over it (400 provinces, seed 3, history/states replaced
// as every generated world has it):
//   · at BOTH bookmarks (1936, 1939.8.14) and in BOTH branches of the country histories (By Blood Alone, legacy), no state starts with
//     more planes than its air base has room for (⌈load / AIRBASE_CAPACITY_MULT⌉ ≤ its level), and no wing is based in a state that
//     has none — before Auto-fix, and after its own repair (fixAirWingsBasedAbroad) has moved every wing the new world sent abroad;
//   · every wing the repair moved landed in its country's state nearest the land the base game's state at its id stood on — the
//     place its file's author meant, which is where Generate land must leave the room;
//   · every new state any air_wings block names, started or not, has an air base;
//   · some railway is above level 1 and none is above the game's MAX_RAILWAY_LEVEL.
// Everything is read here by this file's own reader — the country histories, which order of battle each country loads at each
// bookmark and branch, the air_wings keys, the defines, the state_max — never by the code under test. A state the report names as
// capped (its need past the state_max) is the only one allowed over. Workshop maps are not asked: Millennium Dawn itself ships 95
// states over capacity, so a shipping map is no oracle for this.
//
// Run: node test-a-generated-world-has-the-air-bases-and-main-lines-of-the-world-below.js   (needs the game; ~1 min)
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "definition.csv")) || !fs.existsSync(path.join(GAME, "history", "units"))) {
  console.log("⚠⚠⚠ SKIP: no Hearts of Iron IV install at " + GAME + " — NOTHING here was checked. Set HOI4_ROOT to run it.");
  process.exit(0);
}
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-air-and-main-lines-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};

// ── this file's own Paradox reader: [{ k, v }], v a string or a nested list; a bare value is { k: null, v } ──────────────────
function parse(text) {
  const toks = [];
  const re = /"([^"]*)"|([{}=])|([^\s{}="#]+)|#[^\n]*/g;
  let m;
  while ((m = re.exec(String(text).replace(/^\uFEFF/, "")))) {
    if (m[1] !== undefined) toks.push({ s: m[1], q: true });
    else if (m[2] !== undefined) toks.push({ s: m[2], p: true });
    else if (m[3] !== undefined) toks.push({ s: m[3] });
  }
  let i = 0;
  const block = () => {
    const out = [];
    while (i < toks.length) {
      const t = toks[i];
      if (t.p && t.s === "}") { i++; return out; }
      if (t.p && t.s === "{") { i++; out.push({ k: null, v: block() }); continue; }
      if (t.p) { i++; continue; }
      i++;
      if (toks[i] && toks[i].p && toks[i].s === "=") {
        i++;
        const n = toks[i];
        if (!n) break;
        if (n.p && n.s === "{") { i++; out.push({ k: t.s, v: block() }); }
        else { i++; out.push({ k: t.s, v: n.s }); }
      } else out.push({ k: null, v: t.s });
    }
    return out;
  };
  return block();
}
const read = (f) => { try { return fs.readFileSync(f, "latin1"); } catch (_) { return ""; } };
const kids = (list, key) => (Array.isArray(list) ? list.filter((e) => e.k != null && String(e.k).toLowerCase() === key) : []);
const isDate = (k) => /^\d{1,4}\.\d{1,2}\.\d{1,2}$/.test(String(k || ""));
const dateNum = (d) => { const [y, mo, dd] = String(d).split(".").map(Number); return y * 10000 + (mo || 0) * 100 + (dd || 0); };
const listTxt = (dir) => { try { return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; } };

// ── the game's own numbers ─────────────────────────────────────────────────────────────────────────────────────────────────
const DEFINES = read(path.join(GAME, "common", "defines", "00_defines.lua"));
const MULT = +((/\bAIRBASE_CAPACITY_MULT\s*=\s*(\d+)/.exec(DEFINES) || [])[1] || 0);
const MAX_RAIL = +((/\bMAX_RAILWAY_LEVEL\s*=\s*(\d+)/.exec(DEFINES) || [])[1] || 0);
let CAP = 0;
for (const f of listTxt(path.join(GAME, "common", "buildings"))) for (const b of kids(parse(read(path.join(GAME, "common", "buildings", f))), "buildings")) for (const a of kids(b.v, "air_base"))
  for (const lc of kids(a.v, "level_cap")) for (const sm of kids(lc.v, "state_max")) CAP = +sm.v;
ok(MULT > 0 && MAX_RAIL > 1 && CAP > 1, `(the game: AIRBASE_CAPACITY_MULT ${MULT}, MAX_RAILWAY_LEVEL ${MAX_RAIL}, air_base state_max ${CAP})`);

// ── the world ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MOD = path.join(ROOT, "mod");
fs.mkdirSync(path.join(MOD, "map"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'version="1"\nname="air and main lines"\nsupported_version="1.*"\nreplace_path="history/states"\n');
fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(MOD, "map", "provinces.bmp"));
md.blankMapToSea({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
const gen = md.generateLand({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], count: 400, seed: 3 });
ok(gen && gen.changed && !gen.error && (gen.newStates || []).length > 20, "Generate land raised a world over the base game", gen && (gen.error || (gen.newStates || []).length));
const AB = gen.airBases || {};
ok(!AB.error && AB.levels > 0 && Array.isArray(AB.capped), "…and sized its air bases", AB);

const typeOf = new Map();
for (const line of read(path.join(MOD, "map", "definition.csv")).split(/\r?\n/)) { const c = line.split(";"); if (c.length >= 5 && /^\d+$/.test(c[0])) typeOf.set(+c[0], c[4].trim().toLowerCase()); }
/** a state file's id, owner, provinces and UNDATED air_base */
const stateOf = (text) => {
  const s = kids(parse(text), "state")[0];
  if (!s) return null;
  const h = kids(s.v, "history")[0];
  const b = h ? kids(h.v, "buildings")[0] : null;
  const ab = b ? kids(b.v, "air_base")[0] : null;
  return { id: +(kids(s.v, "id")[0] || {}).v, owner: String((h && (kids(h.v, "owner")[0] || {}).v) || "").toUpperCase(),
    provinces: ((kids(s.v, "provinces")[0] || {}).v || []).map((e) => +e.v).filter(Number.isFinite), air: ab ? +ab.v : 0, airLines: b ? kids(b.v, "air_base").length : 0 };
};
const now = new Map();
for (const f of listTxt(path.join(MOD, "history", "states"))) { const s = stateOf(read(path.join(MOD, "history", "states", f))); if (s && s.id) now.set(s.id, s); }
const landOf = (s) => s.provinces.filter((p) => typeOf.get(p) === "land");
const level = (id) => (now.get(id) || { air: 0 }).air;
const owners = new Set([...now.values()].filter((s) => s.owner && landOf(s).length).map((s) => s.owner));
ok(now.size === (gen.newStates || []).length && owners.size > 3, `(the world: ${now.size} states, ${owners.size} countries owning land)`, { states: now.size, owners: [...owners] });
ok([...now.values()].every((s) => s.airLines <= 1 && (s.air > 0) === (s.airLines === 1) && s.air <= CAP), "every state writes one air_base line of 1 to the state_max, or none", [...now.values()].filter((s) => !(s.airLines <= 1 && s.air <= CAP)).slice(0, 5));

// ── which order of battle each country loads, at each bookmark and in each branch ─────────────────────────────────────────
/** [{ date, branch: "bba" | "legacy" | null, oob }] — the latest applicable one wins, as the critic's census and the game take it */
function airRefs(list) {
  const out = [];
  const limitBranch = (lim) => {
    // has_dlc = "By Blood Alone" decides the branch; inside a NOT it is the other one. Any other limit is taken as met.
    const find = (l, neg) => { for (const e of l || []) { const k = String(e.k || "").toLowerCase(); if (k === "has_dlc" && /by blood alone/i.test(String(e.v))) return neg ? "legacy" : "bba"; if (Array.isArray(e.v)) { const r = find(e.v, neg !== (k === "not")); if (r) return r; } } return null; };
    return find(lim, false);
  };
  const other = (b) => (b === "bba" ? "legacy" : b === "legacy" ? "bba" : "never");
  const walk = (l, date, branch) => {
    let lastIf = null;
    for (const e of l) {
      const k = String(e.k || "").toLowerCase();
      if (isDate(e.k) && Array.isArray(e.v)) { walk(e.v, dateNum(e.k), branch); lastIf = null; continue; }
      if (k === "set_air_oob") { out.push({ date, branch, oob: String(e.v).toLowerCase() }); continue; }
      if (k === "if" && Array.isArray(e.v)) {
        const b = limitBranch((kids(e.v, "limit")[0] || {}).v);
        walk(e.v.filter((x) => !["else", "limit", "else_if"].includes(String(x.k || "").toLowerCase())), date, b || branch);
        // vanilla writes its legacy branch as an `else` INSIDE the `if` (GER - Germany.txt); a sibling `else` is read the same way
        for (const el of kids(e.v, "else")) if (other(b) !== "never") walk(el.v, date, b ? other(b) : branch);
        lastIf = b;
        continue;
      }
      if (k === "else" && Array.isArray(e.v)) { if (lastIf) walk(e.v, date, other(lastIf)); lastIf = null; continue; }
      lastIf = null;
    }
  };
  walk(list, 0, null);
  return out;
}
const SCENARIOS = [["1936", 19360101, "bba"], ["1936", 19360101, "legacy"], ["1939", 19390814, "bba"], ["1939", 19390814, "legacy"]].map(([d, start, branch]) => ({ name: d + " " + branch, start, branch }));
const loads = new Map(SCENARIOS.map((sc) => [sc.name, new Map()]));   // scenario → Map(tag → oob)
for (const f of listTxt(path.join(GAME, "history", "countries"))) {
  const tag = (/^([A-Za-z][A-Za-z0-9]{2})\b/.exec(f) || [])[1];
  if (!tag || !owners.has(tag.toUpperCase())) continue;
  const refs = airRefs(parse(read(path.join(GAME, "history", "countries", f))));
  for (const sc of SCENARIOS) {
    const fit = refs.filter((r) => r.date <= sc.start && (r.branch === null || r.branch === sc.branch)).sort((a, b) => a.date - b.date);
    if (fit.length) loads.get(sc.name).set(tag.toUpperCase(), fit[fit.length - 1].oob);
  }
}
ok(SCENARIOS.every((sc) => loads.get(sc.name).size > 0) && loads.get("1936 bba").size === loads.get("1936 legacy").size, "(the fixture: countries owning land load an air order of battle at every bookmark, in both branches)", SCENARIOS.map((sc) => [sc.name, loads.get(sc.name).size]));
ok([...loads.get("1936 bba")].some(([t, o]) => loads.get("1936 legacy").get(t) !== o), "(…and the two branches load different files: the census reads the branch)", [...loads.get("1936 bba")].slice(0, 3));

/** the air_wings keys of one units file, in order: [{ state, planes }] */
const wingsIn = (text) => {
  const out = [];
  for (const aw of kids(parse(text), "air_wings")) for (const e of aw.v) {
    if (e.k == null || !Array.isArray(e.v) || !/^\d+$/.test(String(e.k))) continue;
    let planes = 0;
    for (const x of e.v) if (Array.isArray(x.v)) { const a = Number((kids(x.v, "amount")[0] || {}).v); if (Number.isFinite(a)) planes += a; }
    out.push({ state: +e.k, planes });
  }
  return out;
};
/** the units files that load: the mod's own copy over the game's, by name, case-insensitive */
const unitsFiles = () => {
  const by = new Map();
  for (const root of [GAME, MOD]) for (const f of listTxt(path.join(root, "history", "units"))) by.set(f.toLowerCase(), path.join(root, "history", "units", f));
  return by;
};
/** each scenario's load on each state: over capacity, wings at a state with no air base, wings at an id the world lacks */
function judge() {
  const files = unitsFiles(), res = {}, placed = [];
  for (const sc of SCENARIOS) {
    const load = new Map();
    let noBase = 0, gone = 0, wings = 0;
    for (const [, oob] of loads.get(sc.name)) {
      const f = files.get(oob + ".txt");
      for (const w of f ? wingsIn(read(f)) : []) {
        wings++;
        placed.push(sc.name + "|" + oob + "|" + w.state);
        if (!now.has(w.state) || !landOf(now.get(w.state)).length) { gone++; continue; }
        if (!(level(w.state) > 0)) { noBase++; continue; }
        load.set(w.state, (load.get(w.state) || 0) + w.planes);
      }
    }
    const over = [...load].filter(([s, v]) => v > MULT * level(s)).map(([s]) => s).sort((a, b) => a - b);
    res[sc.name] = { wings, over, noBase, gone, planes: [...load.values()].reduce((a, b) => a + b, 0) };
  }
  Object.defineProperty(res, "placed", { value: placed.sort() });   // where every loaded wing sits, for the before/after comparison
  return res;
}
const capped = (AB.capped || []).slice().sort((a, b) => a - b);

console.log("\n-- ⭐ 1. the air bases, before Auto-fix --");
const before = judge();
console.log("    " + JSON.stringify(before));
ok(SCENARIOS.reduce((n, sc) => n + before[sc.name].wings - before[sc.name].gone, 0) > 50, "(the fixture: the orders of battle base wings in the new world's states)", before);
ok(SCENARIOS.every((sc) => before[sc.name].noBase === 0), "⭐⭐⭐ no wing of any started order of battle is based in a state with no air base — at both bookmarks, in both branches", before);
ok(SCENARIOS.every((sc) => before[sc.name].over.every((s) => capped.includes(s))), `⭐⭐⭐ no state starts with more planes than its air base has room for (${MULT} a level) — but a state the report names as past the state_max`, { before, capped });

console.log("\n-- ⭐ 2. …and after Auto-fix's own repair has moved the wings the new world sent abroad --");
const fix = md.fixAirWingsBasedAbroad({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
ok(fix && !fix.error && (fix.moved || 0) > 0, "(the fixture: the repair moved wings)", fix && { moved: fix.moved, error: fix.error, files: fix.files });
const after = judge();
console.log("    " + JSON.stringify(after));
const movedHere = after.placed.filter((p, i) => p !== before.placed[i]).length;
ok(movedHere > 0 && after.placed.length === before.placed.length, `(the fixture: ${movedHere} loaded wings sit somewhere else now — this census reads the repair's own copies)`, movedHere);
ok(SCENARIOS.every((sc) => after[sc.name].noBase === 0), "⭐⭐⭐ no wing is based in a state with no air base, wherever the repair put it", after);
ok(SCENARIOS.every((sc) => after[sc.name].over.every((s) => capped.includes(s))), "⭐⭐⭐ and no state holds more planes than its air base has room for — the room Generate land left was where they landed", { after, capped });

// ⛔ #an-air-base-holds-the-planes-it-starts-with — …AND WHERE IT LANDED IS WHERE ITS FILE'S AUTHOR MEANT. The repair sends a wing to its
// country's state nearest the land the base game's state at its id stood on, and Generate land sizes that state for it. Sized from
// the generated state now at the id instead, the room-first repair still found room — but 134 of 345 of the owner's wings landed
// somewhere else, away from that land. Read here with this file's own pixel reader: every province's pixel sums off the mod's
// provinces.bmp, the old land off the base game's history/states, the moved keys off the repair's own notes.
{
  const bmp = fs.readFileSync(path.join(MOD, "map", "provinces.bmp"));
  const W = bmp.readInt32LE(18), H = Math.abs(bmp.readInt32LE(22)), off = bmp.readUInt32LE(10), stride = Math.floor((24 * W + 31) / 32) * 4, up = bmp.readInt32LE(22) > 0;
  const idOfColour = new Map();
  for (const line of read(path.join(MOD, "map", "definition.csv")).split(/\r?\n/)) { const c = line.split(";"); if (c.length >= 5 && /^\d+$/.test(c[0])) idOfColour.set((+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]); }
  const px = new Map();   // province → [n, Σx, Σy]
  for (let y = 0; y < H; y++) {
    const row = off + (up ? H - 1 - y : y) * stride;
    let x = 0;
    while (x < W) {
      const o = row + 3 * x, key = (bmp[o + 2] << 16) | (bmp[o + 1] << 8) | bmp[o];
      let e = x + 1;
      while (e < W && ((bmp[row + 3 * e + 2] << 16) | (bmp[row + 3 * e + 1] << 8) | bmp[row + 3 * e]) === key) e++;
      const id = idOfColour.get(key);
      if (id) { const a = px.get(id) || [0, 0, 0]; a[0] += e - x; a[1] += (x + e - 1) * (e - x) / 2; a[2] += y * (e - x); px.set(id, a); }
      x = e;
    }
  }
  const centreOf = (provs) => { let n = 0, sx = 0, sy = 0; for (const p of provs) { const a = px.get(p); if (a) { n += a[0]; sx += a[1]; sy += a[2]; } } return n ? { x: sx / n, y: sy / n } : null; };
  const beneath = new Map();
  for (const f of listTxt(path.join(GAME, "history", "states"))) { const s = stateOf(read(path.join(GAME, "history", "states", f))); if (s && s.id) beneath.set(s.id, s.provinces); }
  const tagOfOob = new Map();
  for (const sc of SCENARIOS) for (const [t, oob] of loads.get(sc.name)) tagOfOob.set(oob + ".txt", t);
  const files = unitsFiles(), keyed = new Map();   // a loaded file → Map(state → planes it keys there, after the repair)
  for (const f of tagOfOob.keys()) { const m = new Map(); for (const w of files.has(f) ? wingsIn(read(files.get(f))) : []) m.set(w.state, (m.get(w.state) || 0) + w.planes); keyed.set(f, m); }
  const moved = [], unread = [];
  for (const f of listTxt(path.join(MOD, "history", "units"))) {
    const t = read(path.join(MOD, "history", "units", f)), masked = t.replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
    for (const m of t.matchAll(/^\s*(\d+)\s*=\s*\{[^\n]*#\s*Nova: moved from state (\d+)/gm)) {
      const tag = tagOfOob.get(f.toLowerCase());
      if (!tag) { unread.push(f); continue; }
      const open = t.indexOf("{", m.index);
      let depth = 0, close = open;
      for (; close < masked.length; close++) { if (masked[close] === "{") depth++; else if (masked[close] === "}" && --depth === 0) break; }
      const planes = [...masked.slice(open, close).matchAll(/\bamount\s*=\s*(\d+)/g)].reduce((a, x) => a + +x[1], 0);
      moved.push({ file: f.toLowerCase(), tag, to: +m[1], from: +m[2], planes });
    }
  }
  const nearestTo = (c0, tag) => {
    let best = null;
    for (const s of now.values()) {
      const c = s.owner === tag && landOf(s).length ? centreOf(landOf(s)) : null;
      if (c && c0) { const d = Math.hypot(c.x - c0.x, c.y - c0.y); if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && s.id < best.id)) best = { id: s.id, d }; }
    }
    return best;
  };
  const distance = (id, c0) => { const c = centreOf(landOf(now.get(id))); return c && c0 ? Math.hypot(c.x - c0.x, c.y - c0.y) : Infinity; };
  // a state that could not take the wing even at the state_max: what its file keys there, the most of each other country's files, and it
  const full = (id, w) => {
    let load = (keyed.get(w.file) || new Map()).get(id) || 0;
    const others = new Map();
    for (const [f, t] of tagOfOob) if (t !== w.tag) others.set(t, Math.max(others.get(t) || 0, (keyed.get(f) || new Map()).get(id) || 0));
    for (const v of others.values()) load += v;
    return load + w.planes > CAP * MULT;
  };
  const far = [];
  let spilled = 0, decides = 0;
  for (const w of moved) {
    const c0 = centreOf(beneath.get(w.from) || []) || centreOf(landOf(now.get(w.from)));
    const near = nearestTo(c0, w.tag), fromNow = nearestTo(centreOf(landOf(now.get(w.from))), w.tag);
    if (near && fromNow && near.id !== fromNow.id) decides++;
    if (near && distance(w.to, c0) <= near.d + 0.05) continue;   // the repair's centroids are rounded to 0.01 px
    if (near && full(near.id, w)) { spilled++; continue; }
    far.push({ ...w, landedPx: Math.round(distance(w.to, c0)), nearest: near && near.id, nearestPx: near && Math.round(near.d) });
  }
  ok(moved.length > 20 && moved.length + unread.length === fix.moved && decides > 0,
    `(the fixture: ${moved.length} of the repair's ${fix.moved} moves are in files a bookmark loads; for ${decides} of them the nearest state to the old land is not the nearest to the state now at the id)`, { moved: moved.length, unread, decides });
  ok(far.length === 0, `⭐⭐⭐ every one of the ${moved.length} wings landed in its country's state nearest the land the base game's state at its id stood on${spilled ? ` — but ${spilled} that state could not hold even at the state_max` : ""}`, far.slice(0, 5));
}

console.log("\n-- 3. every state an air_wings block names has an air base; most have none --");
const named = new Set();
for (const f of listTxt(path.join(GAME, "history", "units"))) for (const w of wingsIn(read(path.join(GAME, "history", "units", f)))) named.add(w.state);
const namedNow = [...now.values()].filter((s) => named.has(s.id) && landOf(s).length);
ok(namedNow.length > 0 && namedNow.every((s) => s.air >= 1), `⭐⭐ all ${namedNow.length} new states an air_wings block names (in any history/units file, started or not) have one`, namedNow.filter((s) => !(s.air >= 1)).map((s) => s.id));
const withAir = [...now.values()].filter((s) => s.air > 0).length;
ok(withAir < now.size && AB.states === withAir && AB.levels === [...now.values()].reduce((a, s) => a + s.air, 0), `…and ${now.size - withAir} of ${now.size} have none: an airfield is not in every state any more; the report counts what was written`, { withAir, states: now.size, report: AB });

console.log("\n-- ⭐ 4. the railways --");
const rails = md.parseRailways(read(path.join(MOD, "map", "railways.txt")));
const hist = {};
for (const r of rails) hist[r.level] = (hist[r.level] || 0) + 1;
console.log("    levels: " + JSON.stringify(hist) + " — " + JSON.stringify((gen.supplyNetwork || {}).levels));
ok(rails.length > 10 && (gen.supplyNetwork || {}).levelsFrom === "below", "(Generate land laid railways, and dealt their levels from the rail below)", { rails: rails.length, from: (gen.supplyNetwork || {}).levelsFrom });
ok(rails.some((r) => r.level > 1), "⭐⭐ some railway is above level 1: the main lines the land below had", hist);
ok(rails.every((r) => r.level >= 1 && r.level <= MAX_RAIL), `…and none above the game's MAX_RAILWAY_LEVEL (${MAX_RAIL})`, hist);

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
