// A generated world gives the navies it inherits their ports back — and only where the new map can hold one.
// #a-generated-world-has-no-port-for-the-navies-it-inherits
//
// THE DEFECT. Generate land replaces the whole state layer while every order of battle underneath it stays put.
// A fleet is placed by PROVINCE (`fleet = { naval_base = 10980  task_force = { location = 10980 … } }`) and
// Generate land renumbers STATES, not provinces — so the province an inherited fleet asks for is still that
// province, and what is gone is its naval base, which lived in the state file this world replaced. Measured on
// the world Nova's own flow builds (vanilla → Delete map → Generate land 35% → Auto-fix, seed 1): 732
// naval_base_spawn anchors in map/buildings.txt and 0 naval_base buildings in all 832 states, against 534
// naval-base provinces in the base game; 238 fleets and 646 task forces start there and not one of the 97
// provinces they name has a port.
//
// THE CONVENTION, derived and not invented — and NOT the air-base one. Anchor and building are not paired:
// vanilla gives 534 of its 2,362 coastal provinces a naval base (22.6%), Old World Blues 233 of 4,421. What IS
// absolute over the six shipping maps is that every naval base stands on a land province that touches sea and
// hosts a port anchor the engine accepts — 3,223 of 3,223. So the gate is landProvincesTouchingSea (the same set
// navalBuildingsWithoutCoastWork judges by, so Auto-fix can never strip a port written here) and the LEVEL is the
// one the layer below gave that very province.
//
// WHAT THIS PINS, from a manifest the test itself writes rather than from the writer's output: which provinces
// the layer below gave a naval base, and which of those the generated map still leaves on a coast. So reverting
// the writer FAILS this — it does not skip, and it does not pass.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, okFlag, detail) => {
  checks++;
  console.log((okFlag ? "  ok   " : "  FAIL ") + label + (okFlag || detail === undefined ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!okFlag) fails.push(label);
};

const tmps = [];
const tmpDir = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genports-" + tag + "-")); tmps.push(d); return d; };

const APPDATA_DIR = tmpDir("appdata");
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = tmpDir("home");
process.env.HOI4_MODS_ROOT = tmpDir("mods");
const md = require("./map-data.js");

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// ── the fixture world ────────────────────────────────────────────────────────────────────────────────────────
// A 256×256 bitmap of sixteen 64-pixel province blocks: province = floor(x/64) + floor(y/64)*4 + 1.
// Provinces 1-12 (the top three rows) are in a strategic region and so are what Generate land can raise;
// 13-16 (the bottom row) are in none and stay SEA. That makes the answer independent of the seed: every
// eligible province is taken, and afterwards exactly the third row (9-12) touches water.
const W = 256, H = 256, BLOCK = 64;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const provAt = (x, y) => Math.floor(x / BLOCK) + Math.floor(y / BLOCK) * 4 + 1;
const EAGER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];      // raised by Generate land
const STAYS_SEA = [13, 14, 15, 16];
const COASTAL_AFTER = [9, 10, 11, 12];                       // the only raised provinces that touch row 4

function bmp24() {
  const rowSize = (W * 3 + 3) & ~3, imgSize = rowSize * H;
  const b = Buffer.alloc(54 + imgSize);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + imgSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(imgSize, 34);
  for (let y = 0; y < H; y++) {
    let o = 54 + (H - 1 - y) * rowSize;
    for (let x = 0; x < W; x++) { const [r, g, bl] = COL(provAt(x, y)); b[o++] = bl; b[o++] = g; b[o++] = r; }
  }
  return b;
}
const csv = (landIds) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) {
    const [r, g, b] = COL(p);
    const land = landIds.includes(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};

// ⛔ THE MANIFEST — the expectation, written by the test, never read back off the writer. Province → the naval
// base level the LAYER BELOW declares for it. 3 is landlocked once the world is generated, 10 and 12 are on the
// new coast, and 14 never leaves the sea, so it is never in a generated state at all.
const BELOW_PORTS = { 3: 4, 10: 6, 12: 2, 14: 3 };
const EXPECTED = { 10: 6, 12: 2 };

/** The base game these mods sit on: the world Delete map blanked, and the only description of that land anybody has. */
function buildGame() {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", bmp24());
  mk(g, "map/definition.csv", csv(EAGER));                 // below, 1-12 were land
  mk(g, "map/strategicregions/r1.txt", 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n\tweather={}\n}\n');
  // Four states of three provinces each, carrying the ports of the manifest. A naval base is a PROVINCE building,
  // so it is nested under the province id inside the state's own buildings block — which is also the only shape
  // hoi4.exe accepts ("State Error: Trying to set invalid state building" for a state-level one).
  const stateOf = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12], 5: [13, 14, 15, 16] };
  for (const [sid, provs] of Object.entries(stateOf)) {
    const ports = provs.filter((p) => BELOW_PORTS[p]).map((p) => `\t\t\t${p} = {\n\t\t\t\tnaval_base = ${BELOW_PORTS[p]}\n\t\t\t}\n`).join("");
    mk(g, `history/states/${sid}.txt`,
      `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 300000\n\tstate_category = rural\n`
      + `\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n${ports}\t\t}\n\t}\n}\n`);
  }
  mk(g, "history/countries/AAA - Aland.txt", "capital = 1\n");
  return g;
}

/** A mod doing what Nova's own Delete map dialog tells a modder to do: own the world, replace the state layer. */
function buildMod(tag) {
  const m = tmpDir(tag);
  mk(m, "descriptor.mod", 'version="1"\nname="Ports"\nreplace_path="history/states"\npath="mod/ports"\n');
  mk(m, "map/provinces.bmp", bmp24());
  mk(m, "map/definition.csv", csv([]));                     // the blanked world: every province is sea
  return m;
}

// ── reading a written state back ─────────────────────────────────────────────────────────────────────────────
function bodyAfter(s, from) {
  const i = s.indexOf("{", from);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) { if (s[j] === "{") depth++; else if (s[j] === "}") { depth--; if (!depth) return [i + 1, j]; } }
  return [i + 1, s.length];
}
/** Every generated state: { id, provinces, stateKeys, provincePorts } read from the files on disk. */
function readStates(modRoot) {
  const dir = path.join(modRoot, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = parseInt((/\bid\s*=\s*(\d+)/.exec(t) || [])[1], 10);
    const provinces = (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || [];
    const stateKeys = {}, provincePorts = {};
    const bi = /\bbuildings\s*=\s*\{/.exec(t);
    if (bi) {
      const b = bodyAfter(t, bi.index + bi[0].length - 1);
      const body = t.slice(b[0], b[1]);
      // the state's own keys: everything not inside a nested block
      const flat = body.replace(/\{[^{}]*\}/g, " ");
      const kr = /([a-z_]+)\s*=\s*(\d+)/g; let km;
      while ((km = kr.exec(flat))) stateKeys[km[1]] = parseInt(km[2], 10);
      const pr = /(?:^|[^A-Za-z0-9_.])(\d+)\s*=\s*\{/g; let pm;
      while ((pm = pr.exec(body))) {
        const pb = bodyAfter(body, pm.index + pm[0].length - 1);
        if (!pb) break;
        const own = body.slice(pb[0], pb[1]).replace(/\{[^{}]*\}/g, " ");
        pr.lastIndex = pb[1];
        const nb = /\bnaval_base\s*=\s*(\d+)/.exec(own);
        if (nb) provincePorts[parseInt(pm[1], 10)] = parseInt(nb[1], 10);
      }
    }
    return { file: f, id, provinces: provinces.map(Number), stateKeys, provincePorts };
  });
}

/** One whole run: build a mod on `game`, generate the world, read it back. */
function run(game, tag) {
  const mod = buildMod(tag);
  const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: EAGER.length, provincesPerState: 4, seed: 7, ownerMode: "inherit" });
  const states = readStates(mod);
  const ports = {};
  for (const st of states) for (const [p, lv] of Object.entries(st.provincePorts)) ports[p] = { level: lv, stateId: st.id, owns: st.provinces.includes(+p) };
  let coast = null;
  try {
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
    coast = md.landProvincesTouchingSea ? md.landProvincesTouchingSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], model }) : null;
  } catch (_) { coast = null; }
  return { mod, result: r, states, ports, coast };
}

(() => {
  console.log("\n=== a generated world keeps the ports it can still hold ===");
  const game = buildGame();

  // ⚠️ COLD AND WARM IN ONE PROCESS. provinceFactsBeneath reads the layer below through getRootLayer's cache and
  // buildMapModel writes fields onto the object its cached layer holds, so the second run over the SAME game root
  // is the warm one. A fixture that answers differently warm is a fixture that answers differently for the modder
  // whose second click it is.
  const cold = run(game, "mod1");
  const warm = run(game, "mod2");

  for (const [label, R] of [["cold", cold], ["warm", warm]]) {
    console.log(`\n-- ${label} --`);
    rec(`${label}: the world was generated`, R.result && R.result.changed === true && R.result.createdStates > 0, R.result && (R.result.error || R.result));
    rec(`${label}: the coast walk answered`, !!(R.coast && R.coast.size), R.coast ? R.coast.size : null);
    rec(`${label}: exactly the provinces the new map leaves on a coast are coastal`,
      JSON.stringify([...(R.coast || [])].sort((a, b) => a - b)) === JSON.stringify(COASTAL_AFTER),
      [...(R.coast || [])].sort((a, b) => a - b));

    // 1. every province the layer below gave a port, and that is still on a coast, has it back at the SAME level
    for (const p of Object.keys(EXPECTED).map(Number)) {
      const got = R.ports[p];
      rec(`${label}: province ${p} had naval_base = ${EXPECTED[p]} below and has it again`,
        !!got && got.level === EXPECTED[p], got || "no naval base written");
      rec(`${label}: province ${p}'s port is declared by the state that OWNS it`, !!got && got.owns === true, got);
    }
    // 2. and NOTHING else got one — not a landlocked province the layer below had a port on, not a coast that
    //    never had one. Writing a port per anchor is the convention no shipping map has.
    const written = Object.keys(R.ports).map(Number).sort((a, b) => a - b);
    rec(`${label}: no other province was given a naval base`,
      JSON.stringify(written) === JSON.stringify(Object.keys(EXPECTED).map(Number).sort((a, b) => a - b)), written);
    rec(`${label}: the landlocked province the layer below gave a port (3) did NOT get one`, R.ports[3] === undefined, R.ports[3]);
    rec(`${label}: the province that never left the sea (14) is in no generated state`,
      R.states.every((s) => !s.provinces.includes(14)), R.states.map((s) => s.provinces));

    // 3. the invariant the corpus shows, asserted on the output: 3,223 of 3,223 naval bases across six shipping
    //    maps stand on a land province that touches sea.
    rec(`${label}: every naval base written stands on a province that touches sea`,
      written.every((p) => R.coast && R.coast.has(p)), written.filter((p) => !(R.coast && R.coast.has(p))));

    // 4. a naval base is a PROVINCE building — a state-level one is refused by hoi4.exe
    rec(`${label}: no state declares naval_base as one of its own keys`,
      R.states.every((s) => s.stateKeys.naval_base === undefined), R.states.filter((s) => s.stateKeys.naval_base !== undefined).map((s) => s.id));

    // 5. the caller is told, and the numbers add up — including the honest half
    const nb = (R.result && R.result.navalBases) || null;
    rec(`${label}: generateLand reports what it did with the ports`, !!nb, R.result && Object.keys(R.result));
    rec(`${label}: restored == the manifest's coastal ports`, !!nb && nb.restored === Object.keys(EXPECTED).length, nb);
    rec(`${label}: fromBelow counts every port inside the new states`, !!nb && nb.fromBelow === [3, 10, 12].length, nb);
    rec(`${label}: notOnACoast is the difference, said rather than swallowed`,
      !!nb && nb.notOnACoast === nb.fromBelow - nb.restored && nb.notOnACoast === 1, nb);
    rec(`${label}: the provinces it names are the ones it wrote`,
      !!nb && JSON.stringify((nb.provinces || []).slice().sort((a, b) => a - b)) === JSON.stringify(written), nb && nb.provinces);
  }

  // one answer, cold and warm
  rec("cold and warm agree on which provinces got a port",
    JSON.stringify(Object.keys(cold.ports).sort()) === JSON.stringify(Object.keys(warm.ports).sort()),
    [Object.keys(cold.ports), Object.keys(warm.ports)]);
  rec("cold and warm agree on the levels",
    JSON.stringify(Object.entries(cold.ports).map(([p, v]) => p + ":" + v.level).sort()) === JSON.stringify(Object.entries(warm.ports).map(([p, v]) => p + ":" + v.level).sort()),
    [cold.ports, warm.ports]);
  rec("cold and warm agree on the report",
    JSON.stringify(cold.result.navalBases) === JSON.stringify(warm.result.navalBases),
    [cold.result.navalBases, warm.result.navalBases]);

  // ── the layer below is read, not guessed ──────────────────────────────────────────────────────────────────
  const beneath = md.provinceFactsBeneath({ modRoot: cold.mod, gameRoot: game, dependencyRoots: [] });
  for (const p of Object.keys(BELOW_PORTS).map(Number)) {
    rec(`provinceFactsBeneath carries province ${p}'s naval_base = ${BELOW_PORTS[p]}`,
      !!beneath.get(p) && beneath.get(p).navalBase === BELOW_PORTS[p], beneath.get(p));
  }
  rec("a province the layer below gave no port carries navalBase 0",
    !!beneath.get(1) && beneath.get(1).navalBase === 0, beneath.get(1));

  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
})();
