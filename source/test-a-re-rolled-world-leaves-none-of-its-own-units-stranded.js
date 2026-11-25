// ⛔ #a-berth-the-mods-own-file-gives-is-judged-by-the-map — A RE-ROLLED WORLD LEAVES NONE OF THE MOD'S OWN UNITS STRANDED.
//
// THE DEFECT (review of the merged map editor, crash-world F1 + F2, page-honesty F1). The first world's repairs write berths of the
// mod's own: Auto-fix re-berths a fleet at a harbour on what was a base-game inland province (or on a cut piece), and moves a drowned
// division onto land raised from the base game's sea. The re-roll (Delete map, then Generate land again on another seed) takes that
// coast and that land away. findUnitsStrandedByTheMap judged a berth only where the base game had sea (a fleet) or land (a division)
// there, so it never judged those berths again: Generate land's crash repair, Map Errors and Auto-fix all said nothing, and the
// second world started its fleets landlocked and its divisions in the sea. On the review's re-roll of the owner's TEST 37: 86 task
// forces and 1,225 divisions, all in the mod's own files. Here, at the commit before the fix, seed 9 -> 4 left BBB's four task
// forces landlocked on 134 and 30 divisions at sea, and seed 11 -> 12 left 32 divisions at sea, after the second Auto-fix.
//
// This test drives the re-roll through map-data's own steps on testlib-split-world's world (a navy each, an army of 60 each) and
// judges the result with its OWN reader — a plain scan of the mod's history/units files against the mod's definition.csv and
// provinces.bmp — not with the search under test. Required once world 2's Generate land returns, its own crash repair having run and
// no Auto-fix yet: no task force on land with no sea. Required at the end: no task force on land with no sea, no fleet's home port on
// land with no sea, no division on water, in the mod's own files; and the search, the validator and a second Auto-fix agree.
// Controls make sure the re-roll really exposed berths the old rule could not see, so a pass cannot come from a world that never
// tested it. No port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-reroll-units-"));
const DIRS = { mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app, XDG_CONFIG_HOME: DIRS.app,
  HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const W = SW.W, H = SW.H;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const ARMY = 60;

// One re-roll, on a fresh game and mod of its own.
function reroll(seed1, seed2, pct) {
  const tag = `seed ${seed1} -> ${seed2}`;
  const at = path.join(ROOT, `w${seed1}-${seed2}`);
  const game = path.join(at, "game");
  const S = SW.makeShapes();
  const g = SW.makeGame(game, S, { divisions: { AAA: ARMY, BBB: ARMY } });
  // the base game's coast: land with a sea pixel beside it (x wraps, as the map does)
  const coastBelow = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = S.gameIds[y * W + x];
    if (S.typeOf(a) !== "land") continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      if (S.typeOf(S.gameIds[yy * W + ((x + dx + W) % W)]) === "sea") { coastBelow.add(a); break; }
    }
  }
  // a navy each: one fleet on each of its first four coastal provinces, with a harbour there
  const ownerOf = new Map(); for (const s of g.states) for (const p of s.provinces) ownerOf.set(p, s.owner);
  for (const t of ["AAA", "BBB"]) {
    const ports = [...coastBelow].filter((p) => ownerOf.get(p) === t).sort((a, b) => a - b).slice(0, 4);
    for (const s of g.states.filter((x) => x.owner === t)) {
      const here = ports.filter((p) => s.provinces.includes(p));
      if (!here.length) continue;
      const f = path.join(game, "history", "states", `${s.id}-STATE_${s.id}.txt`);
      fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/(\t\tbuildings = \{\n)/, (m) => m + here.map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("")));
    }
    const fleets = ports.map((p, i) => `\tfleet = {\n\t\tname = "${t} Fleet ${i + 1}"\n\t\tnaval_base = ${p}\n\t\ttask_force = {\n\t\t\tname = "${t} TF ${i + 1}"\n`
      + `\t\t\tlocation = ${p}\n\t\t\tship = { name = "${t} ${i + 1}" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = ${t} } } }\n\t\t}\n\t}\n`).join("");
    fs.writeFileSync(path.join(game, "history", "units", `${t}_naval.txt`), `units = {\n${fleets}}\n`);
    fs.appendFileSync(path.join(game, "history", "countries", `${t} - Land of ${t}.txt`), `set_naval_oob = "${t}_naval"\n`);
  }
  const mod = SW.makeMod(path.join(DIRS.mods, `rr${seed1}-${seed2}`), S, { name: `re-roll ${seed1} ${seed2}` });
  const ctx = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
  const COUNT = Math.max(1, Math.round(S.N * pct / 100));

  // what the base game's own files place, counted from them
  const below = { tf: 0, div: 0 };
  for (const f of fs.readdirSync(path.join(game, "history", "units"))) {
    const t = fs.readFileSync(path.join(game, "history", "units", f), "utf8");
    below.tf += (t.match(/\btask_force\s*=\s*\{/g) || []).length;
    below.div += (t.match(/\bdivision\s*=\s*\{/g) || []).length;
  }
  // the test's own judge: every unit in the mod's OWN history/units files, against the mod's map as it is on disk
  const judge = () => {
    const def = SW.readDef(path.join(mod, "map", "definition.csv"));
    const ids = SW.decode(path.join(mod, "map", "provinces.bmp"), def).ids;
    const typeNow = (p) => (def.rows.get(p) || {}).type;
    const seaBeside = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = ids[y * W + x];
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const yy = y + dy; if (yy >= H) continue;
        const b = ids[yy * W + ((x + dx) % W)];
        if (a === b) continue;
        if (typeNow(b) === "sea") seaBeside.add(a);
        if (typeNow(a) === "sea") seaBeside.add(b);
      }
    }
    const landlocked = (p) => typeNow(p) === "land" && !seaBeside.has(p);
    const out = { tf: [], home: [], div: [], tfLandlocked: [], homeLandlocked: [], divOnWater: [], seaBeside, typeNow };
    const dir = path.join(mod, "history", "units");
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\r\n]*/g, "");
      for (const m of t.matchAll(/\bfleet\s*=\s*\{[^{}]*?naval_base\s*=\s*(\d+)/g)) { out.home.push(+m[1]); if (landlocked(+m[1])) out.homeLandlocked.push(`${f}@${m[1]}`); }
      for (const m of t.matchAll(/\btask_force\s*=\s*\{[^{}]*?location\s*=\s*(\d+)/g)) { out.tf.push(+m[1]); if (landlocked(+m[1])) out.tfLandlocked.push(`${f}@${m[1]}`); }
      for (const m of t.matchAll(/\bdivision\s*=\s*\{[^{}]*?location\s*=\s*(\d+)/g)) {
        out.div.push(+m[1]);
        const t2 = typeNow(+m[1]);
        if (t2 === "sea" || t2 === "lake") out.divOnWater.push(`${f}@${m[1]}`);
      }
    }
    return out;
  };
  // where the old rule looked: a fleet only on a base-game coast or sea id, a division only on a base-game land id
  const oldRuleSeesFleetAt = (p) => S.keyOf.has(p) && (S.typeOf(p) === "sea" || coastBelow.has(p));
  const oldRuleSeesDivisionAt = (p) => S.keyOf.has(p) && S.typeOf(p) === "land";

  console.log(`\n${tag} (${pct}%)`);
  const g1 = md.generateLand(Object.assign({ count: COUNT, seed: seed1, ownerMode: "inherit", owner: "" }, ctx));
  rec(`${tag}: world 1 is generated`, g1 && g1.changed !== false && !g1.error, g1 && g1.error);
  md.autoFixMap(ctx);
  const again1 = md.autoFixMap(ctx).fixes || {};
  rec(`${tag}: world 1's second Auto-fix moves no unit`, !(again1.fleetBerths || {}).moved && !(again1.drownedDivisions || {}).moved,
    { fleets: again1.fleetBerths, divisions: again1.drownedDivisions });
  const j1 = judge();
  rec(`${tag}: control — the mod's own files carry the base game's whole navy and army (${below.tf} task forces, ${below.div} divisions)`,
    j1.tf.length === below.tf && j1.div.length === below.div, { tf: j1.tf.length, div: j1.div.length, below });
  rec(`${tag}: world 1 leaves none of them stranded`, !j1.tfLandlocked.length && !j1.homeLandlocked.length && !j1.divOnWater.length,
    { tf: j1.tfLandlocked, homes: j1.homeLandlocked, div: j1.divOnWater.slice(0, 8) });
  const novaFleetBerths = j1.tf.filter((p) => !oldRuleSeesFleetAt(p));
  const novaDivisionBerths = j1.div.filter((p) => !oldRuleSeesDivisionAt(p));
  rec(`${tag}: control — world 1's repairs gave berths the old rule never judged (task forces ${novaFleetBerths.length}, divisions ${novaDivisionBerths.length})`,
    novaFleetBerths.length > 0 && novaDivisionBerths.length > 0, { novaFleetBerths, divisions: novaDivisionBerths.length });

  md.blankMapToSea(ctx);
  const g2 = md.generateLand(Object.assign({ count: COUNT, seed: seed2, ownerMode: "inherit", owner: "" }, ctx));
  rec(`${tag}: world 2 is generated over Delete map`, g2 && g2.changed !== false && !g2.error, g2 && g2.error);
  const j2 = judge();
  // judged against world 2's map, with no Auto-fix yet (Generate land's own crash repair has run, and moves only task forces): the
  // berths world 1 gave, that world 2 took away
  const lostFleetBerths = novaFleetBerths.filter((p) => j2.typeNow(p) === "land" && !j2.seaBeside.has(p));
  const lostDivisionBerths = j2.div.filter((p) => !oldRuleSeesDivisionAt(p) && (j2.typeNow(p) === "sea" || j2.typeNow(p) === "lake"));
  rec(`${tag}: control — the re-roll strands units on berths the old rule never judged (division berths at sea ${lostDivisionBerths.length})`,
    lostDivisionBerths.length > 0, { lostDivisionBerths: lostDivisionBerths.length });
  if (seed1 === 9 && seed2 === 4) rec(`${tag}: control — world 2 takes the sea away from a berth world 1 gave a fleet (${lostFleetBerths.join(" ")})`,
    lostFleetBerths.length > 0, { novaFleetBerths });
  // …and Generate land's own crash repair (padQueueAndReberthFleets) is one of the tools that read the search: it re-berths every task
  // force on land with no sea before the click returns, so a world generated over a modder's map needs no Auto-fix to load
  const cr = (g2 && g2.crashRepairs && g2.crashRepairs.fleetBerths) || {};
  console.log(`  (world 2's crash repair: ${JSON.stringify({ moved: cr.moved, error: cr.error })}; landlocked after it: ${j2.tfLandlocked.join(" ") || "none"})`);
  rec(`${tag}: Generate land's own crash repair leaves no task force of the mod's own on land with no sea`, !j2.tfLandlocked.length,
    { left: j2.tfLandlocked, crashRepair: { moved: cr.moved, error: cr.error } });
  if (seed1 === 9 && seed2 === 4) rec(`${tag}: …by moving the ones world 2 landlocked (${cr.moved || 0})`, (cr.moved || 0) > 0, cr);

  const fix2 = md.autoFixMap(ctx).fixes || {};
  const j3 = judge();
  rec(`${tag}: after Auto-fix no task force of the mod's own is on land with no sea`, !j3.tfLandlocked.length, j3.tfLandlocked);
  rec(`${tag}: after Auto-fix no fleet of the mod's own has its home port on land with no sea`, !j3.homeLandlocked.length, j3.homeLandlocked);
  rec(`${tag}: after Auto-fix no division of the mod's own is on water`, !j3.divOnWater.length, { n: j3.divOnWater.length, first: j3.divOnWater.slice(0, 8) });
  rec(`${tag}: the army and the navy are all still there (${below.tf} task forces, ${below.div} divisions)`, j3.tf.length === below.tf && j3.div.length === below.div,
    { tf: j3.tf.length, div: j3.div.length });
  rec(`${tag}: Auto-fix moved the stranded divisions`, ((fix2.drownedDivisions || {}).moved || 0) >= lostDivisionBerths.length,
    { moved: (fix2.drownedDivisions || {}).moved, lost: lostDivisionBerths.length });
  const st = md.findUnitsStrandedByTheMap(ctx);
  const left = { fleets: st.fleets.length, homes: st.fleetHomes.length, divisions: st.divisions.length, laterFleets: st.laterFleets.length, laterDivisions: st.laterDivisions.length };
  rec(`${tag}: the search finds nothing left`, Object.values(left).every((n) => n === 0), left);
  const unitRules = (md.validateMapBitmap(ctx) || []).filter((p) => /^(fleet|division)_/.test(p.rule)).map((p) => `${p.rule}=${p.total || 1}`);
  rec(`${tag}: Map Errors names no fleet or division`, !unitRules.length, unitRules);
  const again2 = md.autoFixMap(ctx).fixes || {};
  rec(`${tag}: a second Auto-fix moves no unit`, !(again2.fleetBerths || {}).moved && !(again2.drownedDivisions || {}).moved,
    { fleets: again2.fleetBerths, divisions: again2.drownedDivisions });
}

try {
  reroll(9, 4, 35);
  reroll(11, 12, 45);
} catch (e) {
  rec("the re-roll runs", false, e && e.stack);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a re-rolled world leaves none of its own units stranded: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
