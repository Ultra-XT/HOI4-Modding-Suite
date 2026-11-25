// #a-validator-must-not-cry-wolf — ASKED OF THE THREE FIXERS ADDED ON 2026-09-24.
//
// CLAUDE.md is blunt: "A rule that fires hundreds of times on a shipping mod is a bug in the rule, not a
// finding." The flag rule went from 409 warnings to 1 on Millennium Dawn once someone read how HOI4 actually
// resolves flags. Three fixers went in today — one that comments out ai_strategy blocks, one that MOVES
// DIVISIONS, and one that RE-BERTHS FLEETS. All three write, and all three may MATERIALISE a base-game file
// into the modder's mod to do it, which is the widest blast radius any Nova repair has. None of them had
// been pointed at content that already works.
//
// Measured 2026-09-24 across every installed map, with both finders (read-only, nothing is written):
//
//     vanilla · Novum Vexillum · Rise of Nations · Old World Blues
//     Hearts of Minecraft · Millennium Dawn · The Road to 56   ai 0  divisions 0  fleets 0
//     Millennium: Damaged Continuum                            ai 0  divisions 1  fleets 0
//
// ONE division across nine shipping maps, and it is real — MDC does start a single division on water and
// plays. Nova's own rebuilt worlds score 18 and 2,922, which is where the loudness belongs.
//
// ⚠️ THE CEILING IS DELIBERATELY LOOSE, AND THAT IS THE LESSON. A test that demanded exactly 0 would be an
// over-tight corpus invariant, and those rot: installing ONE mod (Hearts of Minecraft) once falsified five
// suite files in a day, four of them over-tight rules. So this fails on a REGRESSION — a fixer that starts
// firing in the dozens on content that ships and plays — not on a mod that legitimately carries one or two.
// #a-corpus-derived-invariant-has-a-shelf-life
//
// It also pins the SCOPE, which is the part that makes the division fixer safe: a map that does not own its
// order-of-battle files must report those divisions as `inherited` and NEVER as movable, because repairing an
// inherited history/units file means adopting that country's whole army.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-crywolf-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0, skips = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
// SKIP in capitals: run-tests.js hears a section that did not run only from a line whose first word is SKIP (case-sensitive),
// and this printed "skip", so not one of its skips ever reached the suite's summary.
const skip = (why) => { console.log("  SKIP " + why); skips++; };

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";

// A fixer that fires this often on a map that ships and plays is misreading it. Chosen an order of magnitude
// above the measured corpus maximum (1), and two orders below what a Nova-built world scores (2,922), so it
// has room for a mod that legitimately carries a few and still bites on a real regression.
const CRY_WOLF_CEILING = 25;

// ⛔ #a-script-loads-an-army-later — the fleets a SCRIPT loads onto land with no sea, on maps that ship and play. Measured
// 2026-10-02: one, in Old World Blues' own files (cartel_fuerte.txt, berthed on 10730, loaded by its Shared Cartel Focus) —
// a real one: 10730 was coastal in vanilla and is land with no sea on OWB's map. Pinned by name as well as under the
// ceiling, so a SECOND shipping hit is seen the day it appears, not the day there are twenty-five of them.
// ⚠️ RE-MEASURED 2026-11-04: OWB moved it itself. The update Steam wrote on 2026-10-28 (266 files in two seconds at 14:54Z,
// cartel_fuerte.txt among them) berths the squadron on 2255, coastal land on OWB's map and a lake in vanilla; 10730 is still land
// with no sea there and coastal in vanilla. The finder of 2026-10-07 (77b8b12d) and today's both answer 0 on the file as installed,
// and both find it the moment its berth is put back on 10730, so the content changed and the finder did not. Kept as the measured
// case: "still found" below asks the installed file before it asks the finder.
const KNOWN_LOADED_FLEETS_ON_LAND = [{ map: /^Old World Blues/, file: "cartel_fuerte.txt", province: 10730 }];
const loadedFleetHits = [];

// ⛔ #a-wing-the-map-sent-abroad — the air-wing message quotes SHIPPING_AIR_WINGS_ABROAD and the base game's own figure, so both
// are re-measured here rather than trusted. Measured 2026-10-06: Road to 56 2 (the base game's Chinese wings in state 1036, which
// its states give to Finland), every other map 0, every installed add-on over its dependency 0; vanilla 22 of its 438 started
// wings in a state another country owns. Keys are the constant's own; the map each names is matched by its descriptor name.
const AIR_KEY_OF = { R56: /^The Road to 56/ };
const abroadByMap = [];
// #a-fleets-home-port-the-map-landlocked — and the fleet home-port message says the base game and the shipping maps measured base
// every fleet on a coast (0 of 252 and 0 of 1,725 on land with no sea, 2026-10-06): exactly 0, because it is quoted.

console.log("=== the two fixers added 2026-09-24, pointed at maps that already work ===");

// Every installed map that rebuilds a world. Derived from what is on disk, never a hand-kept list
// (#derive-lists-from-the-source), so a map installed later is checked without touching this file.
//
// ⚠️ THE WORKSHOP FOLDER ONLY, and deliberately: the user's own mod folder is where Nova's rebuilt test
// worlds live, and being loud on those is the entire point of both rules — 18 and 2,922 on the world that
// crashed. Scanning it would assert the opposite of what this file is for.
const maps = [{ p: GAME, n: "vanilla" }];
try {
  for (const e of fs.readdirSync(WORKSHOP, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(WORKSHOP, e.name);
    if (!fs.existsSync(path.join(p, "descriptor.mod"))) continue;
    if (!fs.existsSync(path.join(p, "map", "definition.csv"))) continue;   // not a map mod
    let n = e.name;
    try { n = (/^name\s*=\s*"([^"]*)"/m.exec(fs.readFileSync(path.join(p, "descriptor.mod"), "utf8")) || [])[1] || e.name; } catch (_) {}
    maps.push({ p, n: n.slice(0, 40) });
  }
} catch (_) { /* no workshop folder on this machine */ }

if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  skip("the base game is not installed here — NOTHING in this file ran, and it is the only cry-wolf control the two new fixers have");
} else if (maps.length === 1) {
  skip("no workshop map mods are installed — only vanilla was checked, so the corpus half did NOT run");
}

for (const m of maps) {
  let coast = null, ai = null, lists = null, scripts = null, straits = null, rows = null, floor = null, queue = null, movable = null, inherited = null, ownsUnits = null, berths = null, err = "";
  let laterMovable = null, laterFleets = null, abroad = null, homes = null, startedHomes = null;
  try {
    const ctx = { modRoot: m.p, gameRoot: GAME, dependencyRoots: [] };
    const model = md.buildMapModel(ctx);
    ai = md.deadAiStrategyBlocks(model).length;
    // #a-state-list-in-an-ai-strategy-is-never-checked — the list repair is FATAL-backed and materialises, so it is
    // asked the same question. Counted in ids, which is what it cuts.
    lists = md.deadAiStrategyListIds(model).reduce((n, l) => n + l.ids.length, 0);
    // #a-script-touches-a-state-that-is-gone — the widest repair of all: it may copy a hundred base-game files in. The
    // one installed map that deletes base-game state ids (and plays) is the control that matters here.
    scripts = md.deadScriptStateRefs(model).length;
    // ⚓ #a-strait-left-on-land — its first draft fired on four of these maps (portals, anomalies, Torres Strait).
    straits = md.adjacencyRulesLeftOnLand(model).length;
    // ⛔ #a-row-written-for-the-map-below — the row retype, asked as the new warning asks it (its dry run). Gated per mod alone it
    // rewrote 19 of Millennium Dawn's own ruled straits and 19 of Damaged Continuum's (measured 2026-10-02); per row, 0 on all eight.
    rows = md.fixAdjacenciesForProvinceTypes({ ...ctx, model, dryRun: true }).retyped;
    // 🧱 #a-world-keeps-the-base-games-state-ids — the biggest change any fixer here makes (hundreds of state splits). Six
    // of these maps keep every base id; Hearts of Minecraft (744) replaces the base script folders instead.
    floor = md.stateIdFloorShortfall(model);
    // 🌊 #the-supply-queue-counts-naval-links — two of these (MD, Damaged Continuum) overflow a little and play; the line
    // is set past them. This is the check that says the line is where the comment claims.
    queue = md.navalRegionQueueDemand({ ...ctx, model });
    // 🗺 #a-rebuilt-world-needs-its-own-regions — regions_ignore_the_coastline fires under 50%. Measured 2026-09-24: vanilla 89.4%,
    // Novum Vexillum 87.9, Rise of Nations 88.6, Old World Blues 87.0 (the lowest), Hearts of Minecraft 96.8, Millennium Dawn 88.0,
    // Damaged Continuum 88.0, The Road to 56 89.3 — and Nova's own TEST 26 23.4, TEST 27 23.6.
    coast = md.coastRegionBorderShare({ ...ctx, model });
    const d = md.drownedDivisionsInOwnFiles({ ...ctx, model });
    movable = d.movable.length; inherited = d.inherited.length;
    // #a-script-loads-an-army-later — the armies scripts load mid-game: measured 0 drowned divisions on every one of these
    laterMovable = d.laterMovable.length;
    const stu = md.findUnitsStrandedByTheMap({ ...ctx, model });
    laterFleets = stu.laterFleets;
    // #a-fleets-home-port-the-map-landlocked · #a-wing-the-map-sent-abroad
    homes = stu.fleetHomes; startedHomes = stu.startedHomes;
    abroad = md.findAirWingsBasedAbroad({ ...ctx, model }).wings;
    // ⚓ the fleet repair MATERIALISES, so it is the one with the widest blast radius of the three and the
    // one that most needs asking. It re-berths any stranded task force whose country owns a harbour, in a
    // file the mod does not have to own yet.
    berths = md.strandedFleetBerths({ ...ctx, model }).movable.length;
    ownsUnits = fs.existsSync(path.join(m.p, "history", "units"));
  } catch (e) { err = String((e && e.message) || e); }

  if (err) { skip(`${m.n} could not be read (${err.slice(0, 60)}) — it was NOT checked`); continue; }

  rec(`${m.n}: the ai_strategy repair would cut ${ai} block(s)`, ai <= CRY_WOLF_CEILING, { ai, ceiling: CRY_WOLF_CEILING });
  rec(`${m.n}: the ai_strategy list repair would take out ${lists} state id(s)`, lists <= CRY_WOLF_CEILING, { lists, ceiling: CRY_WOLF_CEILING });
  rec(`${m.n}: the script repair would neutralise ${scripts} reference(s)`, scripts <= CRY_WOLF_CEILING, { scripts, ceiling: CRY_WOLF_CEILING });
  // Not the loose ceiling: a strait rule is one row in the problems list and the owner reads it as "this map is wrong".
  rec(`${m.n}: the strait repair would take out ${straits} rule(s)`, straits === 0, { straits });
  // …and the same for a row: each one retyped is a line of adjacency_describes_another_map, and a copy of the map below's file.
  rec(`${m.n}: the adjacency retype would rewrite ${rows} row(s) the map ships`, rows === 0, { rows });
  rec(`${m.n}: the state-id floor would split ${floor ? floor.missing : 0} state(s)`, floor === null, floor);
  rec(`${m.n}: the supply queue needs ${queue ? queue.queue : "?"} of ${queue ? queue.n : "?"} slots — under the line ${queue ? queue.line : "?"}`,
    !!queue && queue.queue <= queue.line, queue);
  rec(`${m.n}: ${coast ? (100 * coast.share).toFixed(1) : "?"}% of its coast is a region border — the coastline rule stays quiet under 50%`,
    !!coast && coast.share >= 0.5, coast);
  rec(`${m.n}: the division repair would move ${movable}`, movable <= CRY_WOLF_CEILING, { movable, inherited, ceiling: CRY_WOLF_CEILING });
  rec(`${m.n}: the fleet repair would re-berth ${berths}`, berths <= CRY_WOLF_CEILING, { berths, ceiling: CRY_WOLF_CEILING });
  rec(`${m.n}: the repair of divisions scripts load later would move ${laterMovable}`, laterMovable <= CRY_WOLF_CEILING, { laterMovable, ceiling: CRY_WOLF_CEILING });
  rec(`${m.n}: ${laterFleets.length} fleet(s) a script loads are berthed on land with no sea`, laterFleets.length <= CRY_WOLF_CEILING, { n: laterFleets.length, ceiling: CRY_WOLF_CEILING });
  for (const u of laterFleets) loadedFleetHits.push({ map: m.n, file: u.file, province: u.province });
  rec(`${m.n}: ${homes.length} of its ${startedHomes} fleet home port(s) stand on land the map cut off from the sea`, homes.length === 0,
    homes.slice(0, 5).map((u) => `${u.file}:${u.province}`));
  rec(`${m.n}: the air-wing repair would re-key ${abroad.length} wing(s)`, abroad.length <= CRY_WOLF_CEILING, { n: abroad.length, ceiling: CRY_WOLF_CEILING });
  // …and never one the map ships itself: its own deployment is its author's to choose (Millennium Dawn's 8 NATO wings abroad)
  const ownAbroad = abroad.filter((w) => path.resolve(w.root).toLowerCase() === path.resolve(m.p).toLowerCase());
  rec(`${m.n}: every wing it would re-key is in a file the map does not ship`, ownAbroad.length === 0, ownAbroad.slice(0, 5).map((w) => `${w.file}:${w.state}`));
  abroadByMap.push({ n: m.n, abroad: abroad.length });
  if (m.p === GAME) {
    // the base game's own figure, quoted in the message: its started wings in a state another country owns
    const model = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
    const owner = new Map(model.states.map((s) => [s.id, String(s.owner || "").toUpperCase()]));
    const wings = md.startingUnitLocations({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], model, stateIds: true }).filter((u) => u.kind === "air_wing");
    const another = wings.filter((u) => owner.get(u.state) && owner.get(u.state) !== String(u.tag).toUpperCase()).length;
    const q = md.BASE_GAME_WINGS_IN_ANOTHER_COUNTRYS_STATE || {};
    rec(`the base game starts ${another} of its ${wings.length} wings in a state another country owns, as the air-wing message says (${q.n} of ${q.of})`,
      another === q.n && wings.length === q.of, { measured: [another, wings.length], quoted: q });
  }
  // ⭐ WHAT IT WOULD COST. All three repairs may copy a base-game file into the mod, and `inherited` is how
  // many of these divisions sit in a file the mod does not ship — i.e. the size of that bill. On a map that
  // already works it must be as quiet as everything else here.
  // ⚠️ This used to assert `movable === 0` whenever the mod shipped no history/units, on the old scope where
  // the repair declined inherited files entirely. That scope repaired 0 of 2,563 on a world built by Nova's
  // own flow and was replaced on 2026-09-24; the assertion would now be encoding behaviour Nova has dropped.
  if (!ownsUnits && inherited > 0) {
    rec(`${m.n}: ships no history/units, and the repair would have to copy ${inherited} division(s)' files in`,
      inherited <= CRY_WOLF_CEILING, { inherited, movable, ceiling: CRY_WOLF_CEILING });
  }
}

// …every loaded fleet on land is a KNOWN one, and every known one on an installed map is still found
//
// ⚠️ "STILL FOUND" USED TO ASK THE FINDER ALONE, so the day OWB re-berthed its own fleet it could not tell "the finder went blind"
// from "the case is not installed any more", and from that update on it went red on every commit. It now reads the installed file first,
// off the file itself and not through the finder, because a blind reader must FAIL here and never pass for a case that went away:
//   · the file still berths a fleet on the known province → the finder must find it there, exactly as before;
//   · it berths it elsewhere → THE NEAREST REAL CASE: the same installed file, loaded by the same installed focus, on the same
//     installed map, with its berths put back on the measured province IN MEMORY (nothing is written). The finder must find that,
//     and the line says the real one is gone;
//   · the map is not installed, or the file is not, or it berths no fleet → a SKIP, and nothing ran in its place.
{
  const known = (h) => KNOWN_LOADED_FLEETS_ON_LAND.some((k) => k.map.test(h.map) && k.file === h.file && k.province === h.province);
  const unknown = loadedFleetHits.filter((h) => !known(h));
  rec(`every fleet a script loads onto land with no sea on these maps is a known one (${loadedFleetHits.length} found)`, unknown.length === 0, unknown);
  // the berths read are the task forces' `location`s; the stand-in moves those and the fleet's home `naval_base` alike. One in a
  // comment is not a berth, and a # inside a quoted name ("Fleet #2") does not start a comment
  const BERTH = /\b(location|naval_base)(\s*=\s*)(\d+)/g;
  const uncommented = (s) => s.replace(/("[^"\r\n]*")|#[^\r\n]*/g, (_, quoted) => quoted || "");
  for (const k of KNOWN_LOADED_FLEETS_ON_LAND) {
    const m = maps.find((x) => k.map.test(x.n));
    if (!m) { skip(`the map that ships the known loaded fleet on land (${k.file}) is not installed — its half did NOT run`); continue; }
    const file = path.join(m.p, "history", "units", k.file);
    let text = null;
    try { text = fs.readFileSync(file, "utf8"); } catch (_) { /* not installed */ }
    const berths = text === null ? []
      : [...new Set([...uncommented(text).matchAll(BERTH)].filter((x) => x[1] === "location").map((x) => +x[3]))];
    if (!berths.length) {
      skip(`${m.n} as installed ${text === null ? "has no" : "berths no fleet in its"} history/units/${k.file} — the known case is gone and nothing stands in for it, so "still found" did NOT run`);
      continue;
    }
    if (berths.includes(k.province)) {
      rec(`…and every known one is still found on its installed map (${m.n}: ${k.file} on ${k.province})`,
        loadedFleetHits.some((h) => k.map.test(h.map) && h.file === k.file && h.province === k.province), { file: k.file, province: k.province });
      continue;
    }
    const standIn = text.replace(BERTH, (_, key, eq) => key + eq + k.province);   // a function, so nothing in the file is a token
    const want = path.resolve(file).toLowerCase(), realRead = fs.readFileSync;
    let found = null, inland = null;
    try {
      const ctx = { modRoot: m.p, gameRoot: GAME, dependencyRoots: [] };
      const model = md.buildMapModel(ctx);
      fs.readFileSync = function (p, ...rest) {
        if (typeof p !== "string" || path.resolve(p).toLowerCase() !== want) return realRead.call(this, p, ...rest);
        return typeof rest[0] === "string" || (rest[0] && rest[0].encoding) ? standIn : Buffer.from(standIn, "utf8");
      };
      const st = md.findUnitsStrandedByTheMap({ ...ctx, model });
      found = st.laterFleets.map((u) => `${u.file}:${u.province}`);
      inland = !!(st.inlandBerths && st.inlandBerths.has(k.province));   // the finder's own "land with no sea", for the detail
    } catch (e) { found = String((e && e.message) || e); } finally { fs.readFileSync = realRead; }
    rec(`…and every known one is still found: as installed, ${m.n} berths ${k.file} on ${berths.join(", ")}, not ${k.province}, so the real case is gone — `
      + `put back on ${k.province} in memory, the same installed file is found on the same installed map`,
      Array.isArray(found) && found.includes(`${k.file}:${k.province}`), { found, inland, berthsAsInstalled: berths });
  }
}

// …the air-wing corpus the message quotes is what these maps measure: each keyed map its figure, every other map none
{
  const quoted = md.SHIPPING_AIR_WINGS_ABROAD || {};
  const keyOf = (n) => Object.keys(AIR_KEY_OF).find((k) => AIR_KEY_OF[k].test(n)) || null;
  const wrong = abroadByMap.filter((x) => x.n !== "vanilla" && x.abroad !== (keyOf(x.n) ? quoted[keyOf(x.n)] : 0));
  rec(`SHIPPING_AIR_WINGS_ABROAD is what the installed maps measure (${abroadByMap.map((x) => `${x.n.slice(0, 12)} ${x.abroad}`).join(", ")})`,
    wrong.length === 0 && Object.keys(quoted).every((k) => AIR_KEY_OF[k]), { wrong, quoted });
  if (!Object.keys(AIR_KEY_OF).every((k) => abroadByMap.some((x) => AIR_KEY_OF[k].test(x.n)))) skip("a map SHIPPING_AIR_WINGS_ABROAD quotes is not installed — its figure was NOT re-measured");
}

// …and every installed ADD-ON, over the map it declares it depends on. An add-on inherits its map's deployment, so a wing the map
// based abroad is the map's choice, and the add-on must hear nothing of it (#inherited-problem-not-yours). Derived from the
// descriptors on disk: a workshop mod with no definition.csv whose `dependencies` name an installed map.
console.log("\n=== the air-wing finder over every installed add-on ===");
{
  const all = [];
  try {
    for (const e of fs.readdirSync(WORKSHOP, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(WORKSHOP, e.name);
      let d = ""; try { d = fs.readFileSync(path.join(p, "descriptor.mod"), "utf8"); } catch (_) { continue; }
      const dm = /dependencies\s*=\s*\{([^}]*)\}/.exec(d);
      all.push({ p, n: (/^name\s*=\s*"([^"]*)"/m.exec(d) || [])[1] || e.name, map: fs.existsSync(path.join(p, "map", "definition.csv")), deps: dm ? [...dm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [] });
    }
  } catch (_) { /* no workshop folder */ }
  const addons = all.filter((a) => !a.map && a.deps.length).map((a) => ({ ...a, roots: a.deps.map((n) => all.find((x) => x.n === n)).filter(Boolean) }))
    .filter((a) => a.roots.some((r) => r.map));
  if (!addons.length) skip("no add-on over an installed map is installed — the add-on half did NOT run");
  for (const a of addons) {
    let n = null;
    try { n = md.findAirWingsBasedAbroad({ modRoot: a.p, gameRoot: GAME, dependencyRoots: a.roots.map((r) => r.p) }).wings.length; } catch (e) { n = null; }
    rec(`${a.n.slice(0, 40)} over ${a.roots.map((r) => r.n.slice(0, 20)).join(" + ")}: the air-wing repair would re-key ${n}`, n !== null && n <= CRY_WOLF_CEILING, { n, ceiling: CRY_WOLF_CEILING });
  }
}

// ── the back-out control ─────────────────────────────────────────────────────────────────────────────
// Every number above is a "nothing happened" result, and a probe that cannot detect the thing it is looking
// for reports nothing happened too. So: build a world that IS broken and confirm both finders see it.
// #a-positive-control-in-every-nothing-happened-probe
console.log("\n=== THE POSITIVE CONTROL: both finders must still see a world that really is broken ===");
{
  const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  // ⚠️ THE FIXTURE NEEDS A REAL BITMAP. findUnitsStrandedByTheMap computes the coastal set the moment it meets
  // a LAND province and bails with `if (!coast) return out` when there is no provinces.bmp to read — which
  // discards the DIVISION findings too, even though they never needed a coast. Without this the control
  // reported 0 on a world that is definitely broken, which is precisely the failure it exists to catch.
  // (Not reachable on a real map: landProvincesTouchingSea falls back to the base roots, and every installed
  // map inherits vanilla's bitmap.)
  const bmp24 = (w, h, fn) => {
    const rs = (w * 3 + 3) & ~3, is = rs * h, b = Buffer.alloc(54 + is);
    b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
    for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, gg, bl] = fn(x, y); b[o++] = bl; b[o++] = gg; b[o++] = r; } }
    return b;
  };
  const COL = (p) => [p * 9, p * 17, p * 23];
  const BMP = bmp24(64, 16, (x) => COL(Math.min(4, Math.floor(x / 16) + 1)));
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-crywolf-game-"));
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-crywolf-mod-"));
  const defn = (isLand) => {
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let p = 1; p <= 4; p++) rows.push(`${p};${p * 9};${p * 17};${p * 23};${isLand(p) ? "land" : "sea"};false;${isLand(p) ? "plains" : "ocean"};${isLand(p) ? 1 : 0}`);
    return rows.join("\n") + "\n";
  };
  mk(g, "map/provinces.bmp", BMP);
  mk(g, "map/definition.csv", defn(() => true));
  // a mountain wall between 2 and 3, which touch: 3 is sea in the mod, so it is a wall standing in the sea
  mk(g, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n2;3;impassable;-1;-1;-1;-1;-1;;Wall\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  for (const id of [1, 2, 3, 4]) mk(g, `history/states/${id}.txt`, `state = {\n\tid = ${id}\n\tprovinces = { ${id} }\n\thistory = { owner = ZZZ }\n}\n`);
  mk(g, "common/ai_strategy/ZZZ.txt", "ai_strategy = { type = t state = 4 value = 1 }\nai_strategy = { type = put_unit_buffers ratio = 0.1 states = { 1 4 } }\n");
  mk(g, "history/countries/ZZZ - Z.txt", 'capital = 1\noob = "ZZZ_1936"\n');
  // a division AND a fleet, both stranded on province 4, so all three finders have something to see
  const OOB = 'units = {\n\tdivision = { name = "D" location = 4 division_template = "Inf" }\n\tfleet = {\n\t\tname = "F"\n\t\tnaval_base = 4\n\t\ttask_force = { name = "TF" location = 4 }\n\t}\n}\n';
  mk(g, "history/units/ZZZ_1936.txt", OOB);
  mk(m, "descriptor.mod", 'name="broken on purpose"\nreplace_path="history/states"\nreplace_path="history/units"\n');
  mk(m, "map/definition.csv", defn((p) => p <= 2));                       // 3 and 4 are sea now
  // province 1 keeps a harbour, so the stranded fleet has somewhere honest to go
  mk(m, "history/states/1.txt", 'state = {\n\tid = 1\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = ZZZ\n\t\tbuildings = { 1 = { naval_base = 3 } }\n\t}\n}\n');
  mk(m, "history/states/2.txt", 'state = {\n\tid = 2\n\tprovinces = { 2 }\n\thistory = { owner = ZZZ }\n}\n');
  mk(m, "history/units/ZZZ_1936.txt", OOB);
  // …and an army an event loads, drowned on 3 (land below): the finder of the armies scripts load must see it. In the
  // mod's own history/units, which replaces the base game's here.
  mk(m, "history/units/ZZZ_later.txt", 'units = {\n\tdivision = { name = "L" location = 3 division_template = "Inf" }\n}\n');
  mk(g, "events/later.txt", 'later.1 = {\n\timmediate = { ZZZ = { load_oob = "ZZZ_later" } }\n}\n');
  const ctx = { modRoot: m, gameRoot: g, dependencyRoots: [] };
  const model = md.buildMapModel(ctx);
  const ai = md.deadAiStrategyBlocks(model).length;
  const d = md.drownedDivisionsInOwnFiles({ ...ctx, model });
  const b = md.strandedFleetBerths({ ...ctx, model });
  rec("⭐⭐⭐ the ai_strategy finder sees the dead block", ai === 1, { ai });
  const li = md.deadAiStrategyListIds(model);
  rec("⭐⭐⭐ the ai_strategy list finder sees the one dead id in the list, and keeps the live one",
    li.length === 1 && li[0].ids.join() === "4" && li[0].liveIds.join() === "1", li);
  rec("⭐⭐⭐ the division finder sees the drowned division, in a file the mod owns", d.movable.length === 1 && d.inherited.length === 0, { movable: d.movable.length, inherited: d.inherited.length });
  rec("⭐⭐⭐ …and the drowned division an event loads", d.laterMovable.length === 1 && d.laterMovable[0].file === "ZZZ_later.txt",
    d.laterMovable.map((u) => u.file));
  const at = md.fixAdjacenciesForProvinceTypes({ ...ctx, model, dryRun: true });
  rec("⭐⭐⭐ the adjacency retype sees the wall the mod's sea now stands in", at.retyped === 1 && at.wallsOpened === 1, at);
  rec("⭐⭐⭐ the fleet finder sees the stranded task force, and that it has a harbour to go to",
    b.stranded.length === 1 && b.movable.length === 1 && b.noHarbour.length === 0,
    { stranded: b.stranded.length, movable: b.movable.length, noHarbour: b.noHarbour.length });
  for (const d2 of [g, m]) { try { fs.rmSync(d2, { recursive: true, force: true }); } catch (_) {} }
}
// #a-fleets-home-port-the-map-landlocked · #a-wing-the-map-sent-abroad — the same control for the two finders added 2026-10-06, on
// eight provinces in a row: land 1..3 below (3 the coast), land 1..5 in the mod (3 inland now, 5 the coast), state 2 given away.
{
  const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  const bmp24 = (w, h, fn) => {
    const rs = (w * 3 + 3) & ~3, is = rs * h, b = Buffer.alloc(54 + is);
    b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
    for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, gg, bl] = fn(x, y); b[o++] = bl; b[o++] = gg; b[o++] = r; } }
    return b;
  };
  const COL = (p) => [p * 9, p * 17, p * 23];
  const defn = (isLand) => ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6, 7, 8].map((p) => `${p};${p * 9};${p * 17};${p * 23};${isLand(p) ? "land" : "sea"};false;${isLand(p) ? "plains" : "ocean"};${isLand(p) ? 1 : 0}`)).join("\n") + "\n";
  const st = (id, provs, owner, extra = "") => `state = {\n\tid = ${id}\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n${extra}\t}\n}\n`;
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-crywolf-game2-"));
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-crywolf-mod2-"));
  mk(g, "map/provinces.bmp", bmp24(128, 16, (x) => COL(Math.floor(x / 16) + 1)));
  mk(g, "map/definition.csv", defn((p) => p <= 3));
  for (const id of [1, 2, 3]) mk(g, `history/states/${id}.txt`, st(id, [id], "ZZZ"));
  mk(g, "history/countries/ZZZ - Z.txt", 'capital = 1\noob = "ZZZ_navy"\nset_air_oob = "ZZZ_air"\n');
  mk(g, "history/units/ZZZ_navy.txt", 'units = {\n\tfleet = {\n\t\tname = "F"\n\t\tnaval_base = 3\n\t\ttask_force = { name = "TF" location = 5 }\n\t}\n}\n');
  mk(g, "history/units/ZZZ_air.txt", 'air_wings = {\n\t2 = { fighter_equipment_0 = { owner = "ZZZ" amount = 10 } }\n}\n');
  mk(m, "descriptor.mod", 'name="broken on purpose, again"\nreplace_path="history/states"\n');
  mk(m, "map/definition.csv", defn((p) => p <= 5));
  mk(m, "history/states/1.txt", st(1, [1], "ZZZ"));
  mk(m, "history/states/2.txt", st(2, [2], "YYY"));
  mk(m, "history/states/3.txt", st(3, [3, 4, 5], "ZZZ", "\t\tbuildings = {\n\t\t\tair_base = 1\n\t\t\t5 = { naval_base = 1 }\n\t\t}\n"));
  const ctx = { modRoot: m, gameRoot: g, dependencyRoots: [] };
  const model = md.buildMapModel(ctx);
  const stu = md.findUnitsStrandedByTheMap({ ...ctx, model });
  rec("⭐⭐⭐ the fleet finder sees a home port on the coast the map cut off (3), its task force in port (5)",
    stu.fleetHomes.length === 1 && stu.fleetHomes[0].province === 3 && stu.fleets.length === 0, stu.fleetHomes.map((u) => u.province));
  const ab = md.findAirWingsBasedAbroad({ ...ctx, model }).wings;
  rec("⭐⭐⭐ the air-wing finder sees the wing in the state the mod gave away", ab.length === 1 && ab[0].state === 2 && ab[0].owner === "YYY", ab.map((w) => `${w.file}:${w.state}`));
  for (const d2 of [g, m]) { try { fs.rmSync(d2, { recursive: true, force: true }); } catch (_) {} }
}

try { fs.rmSync(APPDATA_DIR, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== the new map fixers stay silent on maps that work: ${pass + fails.length} checks, ${fails.length} failed${skips ? `, ${skips} skipped` : ""} ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
