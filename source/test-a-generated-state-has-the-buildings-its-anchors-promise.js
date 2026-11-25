// #an-air-wing-needs-somewhere-to-land — Generate land writes the map/buildings.txt POSITION for an air base in
// every state it creates. Until 2026-09-17 it never wrote a `buildings` block saying a building stands there.
//
// The owner launched such a world: it loaded, drew, reached the country-selection screen, and died with
// EXCEPTION_ACCESS_VIOLATION the moment a country was picked. error.log's last line was
//   "State 763 has no air base: {, near line: 5 … " in file: "history/units/GER_1936_air_bba.txt"
// An order of battle flies aircraft into a state BY ID, and generating a world renumbers what those ids mean.
//
// This pins the pairing rather than the literal text: for every state the generator creates, the building types
// it declares in history must be types it also anchored in map/buildings.txt. Derived from the generator's own
// output both sides, so a new building joins the check without anyone editing this file.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  console.log("SKIP: no Hearts of Iron IV install at " + GAME);
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genbuild-"));
const mod = path.join(tmp, "mod");
fs.mkdirSync(path.join(mod, "map"), { recursive: true });
// replace_path="history/states", as every generated world has it: the new states then take ids from 1 — the ids the base game's
// orders of battle name, the renumbering the crash above came from. (Without it they took ids past 1,081, which no air_wings
// block names, and the air-base check below would have nothing to ask.)
fs.writeFileSync(path.join(mod, "descriptor.mod"),
  'version="1"\nname="gen buildings"\nsupported_version="1.19.*"\npath="mod/x"\nreplace_path="history/states"\n');
// Own the world, the way Nova's own refusal tells a modder to, then blank it so Generate land has an ocean.
fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });

const gen = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 120, seed: 7 });
assert.ok(gen && gen.changed !== false, "generateLand refused: " + JSON.stringify(gen && gen.error));
const made = (gen.newStates || []).map((s) => s.id);
assert.ok(made.length >= 5, "expected several new states, got " + made.length);

// ── what each new state DECLARES, read off the files the generator wrote ──────────────────────────────────
const declared = new Map();     // stateId -> Set(buildingKey)
const sDir = path.join(mod, "history", "states");
for (const f of fs.readdirSync(sDir)) {
  const t = fs.readFileSync(path.join(sDir, f), "utf8").replace(/^\uFEFF/, "").replace(/#[^\n]*/g, "");
  const id = /\bid[ \t]*=[ \t]*(\d+)/.exec(t);
  if (!id || !made.includes(+id[1])) continue;
  const b = /buildings[ \t]*=[ \t]*\{/.exec(t);
  const keys = new Set();
  if (b) {
    let i = b.index + b[0].length, depth = 1, body = "";
    for (; i < t.length && depth > 0; i++) {
      const c = t[i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (!depth) break; }
      body += c;
    }
    for (const m of body.replace(/\d+[ \t]*=[ \t]*\{[^}]*\}/g, "").matchAll(/([a-z_]+)[ \t]*=[ \t]*(\d+)/g)) {
      assert.ok(+m[2] > 0, "state " + id[1] + " declares " + m[1] + " at level " + m[2] + " — a level of 0 is not a building");
      keys.add(m[1]);
    }
  }
  declared.set(+id[1], keys);
}

// ── what each new state has GROUND for, read off map/buildings.txt ────────────────────────────────────────
const anchored = new Map();     // stateId -> Set(buildingKey)
for (const line of fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/)) {
  const c = line.split(";");
  if (c.length < 7 || !/^\d+$/.test(c[0])) continue;
  const sid = +c[0];
  if (!anchored.has(sid)) anchored.set(sid, new Set());
  anchored.get(sid).add(c[1]);
}

let withAir = 0, withInfra = 0;
for (const sid of made) {
  const d = declared.get(sid);
  assert.ok(d, "generator made state " + sid + " but wrote no file for it");
  assert.ok(d.size > 0, "state " + sid + " declares no buildings at all — this is the shape that crashed the game");
  const a = anchored.get(sid) || new Set();
  for (const key of d) {
    // infrastructure is abstract: the base game gives it to 97% of its states and anchors it nowhere.
    if (key === "infrastructure") { withInfra++; continue; }
    assert.ok(a.has(key), "state " + sid + " declares " + key + " but map/buildings.txt anchors no " + key + " for it — a building with no position is what fixBuildingsTxtPlacement exists to catch");
  }
  if (d.has("air_base")) withAir++;
}

// ⚠️ MOVED with #an-air-base-holds-the-planes-it-starts-with: this said every generated state gets an air base, because
// Generate land wrote `air_base = 1` into all of them. It now writes one where something asks for it — an airfield below, room
// for planes started there, and (the crash this file was written for) ANY air_wings block in ANY history/units file that keys
// the state's id — and none elsewhere, as vanilla leaves 750 of its 1,081 states without. So: every new state such a block names
// has one, read here off the install's own files, and at least one new state declares none.
const namedByAWing = new Set();
const unitsDir = path.join(GAME, "history", "units");
for (const f of fs.existsSync(unitsDir) ? fs.readdirSync(unitsDir) : []) {
  if (!/\.txt$/i.test(f)) continue;
  const t = fs.readFileSync(path.join(unitsDir, f), "latin1").replace(/^\u00EF\u00BB\u00BF/, "").replace(/"[^"\n]*"/g, '""').replace(/#[^\n]*/g, "");
  for (const m of t.matchAll(/\bair_wings[ \t\r\n]*=[ \t\r\n]*\{/g)) {
    // the block's own top-level keys: `<state id> = {`
    let depth = 1, i = m.index + m[0].length, top = "";
    for (; i < t.length && depth > 0; i++) {
      const c = t[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth === 1 && c !== "}") top += c;
      else if (depth === 2 && c === "{") top += "{";
    }
    for (const k of top.matchAll(/(?:^|[\s}])(\d+)[ \t\r\n]*=[ \t\r\n]*\{/g)) namedByAWing.add(+k[1]);
  }
}
const namedMade = made.filter((sid) => namedByAWing.has(sid));
assert.ok(namedByAWing.size > 100 && namedMade.length > 0, "the fixture: the install's air_wings blocks name many states, and some of these new ids: " + namedByAWing.size + ", " + namedMade.length);
const namedWithout = namedMade.filter((sid) => !declared.get(sid).has("air_base"));
assert.deepStrictEqual(namedWithout, [], "every generated state an air_wings block names should have an air base — the game dies at a country pick without one");
assert.ok(withAir < made.length, "a generated state nothing asks an air base of should declare none: " + withAir + " of " + made.length + " declare one");
assert.ok(withInfra === made.length, "every generated state should get infrastructure: " + withInfra + " of " + made.length);

// ── and the anchors really are in the state that claims them (a count is not a placement) ─────────────────
const provOf = new Map();
for (const f of fs.readdirSync(sDir)) {
  const t = fs.readFileSync(path.join(sDir, f), "utf8").replace(/^\uFEFF/, "").replace(/#[^\n]*/g, "");
  const id = /\bid[ \t]*=[ \t]*(\d+)/.exec(t);
  const pv = /provinces[ \t]*=[ \t]*\{([^}]*)\}/.exec(t);
  if (!id || !pv) continue;
  for (const p of pv[1].match(/\d+/g) || []) provOf.set(+p, +id[1]);
}
let checked = 0;
for (const line of fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/)) {
  const c = line.split(";");
  if (c.length < 7 || c[1] !== "air_base" || !made.includes(+c[0])) continue;
  const anchorProvince = +c[6];
  if (anchorProvince) assert.strictEqual(provOf.get(anchorProvince), +c[0], "air_base row for state " + c[0] + " anchors on province " + anchorProvince + ", which belongs to state " + provOf.get(anchorProvince));
  checked++;
}
assert.strictEqual(checked, made.length, "expected one air_base row per generated state, got " + checked + " for " + made.length);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS: " + made.length + " generated states each declare infrastructure, the " + namedMade.length + " an air_wings block names an air base (" + withAir + " in all), every declared building has an anchor in the state that claims it");
