// #a-generated-world-has-nothing-to-dig-up — a state Generate land builds on ground that had resources must
// still have them.
//
// MEASURED on the owner's own flow (vanilla → Delete map → Generate land → Auto-fix), on the world they
// launched on 2026-09-23: 0 of 832 generated states declared a single unit of any resource, against 513 of
// the base game's 1,081. common/resources still loads under such a world, so the engine knows steel, oil,
// aluminium, rubber, tungsten and chromium exist and none of them exist anywhere on the map. Nothing that
// needs them can ever be built, and the crash that world dies with has trade.cpp in its stack asserting
// "NEGATIVE RESOURCE EXCHANGE - The whole trade and convoys system will now collapse!".
//
// A custom map is expected to ship this layer: Hearts of Minecraft replaces common/resources with its own
// (coal, iron, redstone, lazurite…) and declares them in 317 of its 744 states.
//
// The rule pinned here is the OVERLAY one, the same one portsFor and the manpower/category pass already use:
// what a generated state is worth is what the land under it was worth. So the assertions are all derived from
// the base game's own files — nothing about the numbers is typed into this test.
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

const strip = (s) => s.replace(/^\uFEFF/, "").replace(/#[^\n]*/g, "");

// ── what the base game itself declares, so nothing here is a hand-typed number ────────────────────────────
const vanillaTotals = Object.create(null);
let vanillaStatesWithResources = 0;
for (const f of fs.readdirSync(path.join(GAME, "history", "states"))) {
  if (!/\.txt$/i.test(f)) continue;
  const t = strip(fs.readFileSync(path.join(GAME, "history", "states", f), "utf8"));
  const m = /resources\s*=\s*\{([^}]*)\}/.exec(t);
  if (!m) continue;
  let any = false;
  for (const r of m[1].matchAll(/([a-z_]+)\s*=\s*([0-9.]+)/g)) {
    const n = Number(r[2]);
    if (!(n > 0)) continue;
    vanillaTotals[r[1]] = (vanillaTotals[r[1]] || 0) + n;
    any = true;
  }
  if (any) vanillaStatesWithResources++;
}
const known = Object.keys(vanillaTotals);
assert.ok(known.length >= 4 && vanillaStatesWithResources > 100,
  "the base game should declare several resources over many states; read " + known.length + " over " + vanillaStatesWithResources);

// ── generate a world the way the owner's flow does ────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genres-"));
const mod = path.join(tmp, "mod");
fs.mkdirSync(path.join(mod, "map"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"),
  'version="1"\nname="gen resources"\nsupported_version="1.19.*"\npath="mod/x"\n');
fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });

// ⛔ #a-generated-country-keeps-its-economy — the DEFAULT, on this mod's shape: no replace_path, so the base game's states still load
// and hold every country's whole economy, and Generate land is adding land to that world — each state keeps its own land's carry.
// (Each country keeping its 1936 economy is the default where the world below no longer loads; test-a-generated-world-keeps-the-
// economies-of-the-world-below.js pins it on the owner's shape. Asked of this shape it wrote 87 states of 1 person and no resource.)
const gen = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 400, seed: 3 });
assert.ok(gen && gen.changed !== false, "generateLand refused: " + JSON.stringify(gen && gen.error));
assert.ok(gen.economy && gen.economy.mode === "land" && gen.economy.belowLoads > 0,
  "the base game's states still load here, so the default should keep the land's own carry and say why: " + JSON.stringify(gen.economy));
const made = new Set((gen.newStates || []).map((s) => s.id));
assert.ok(made.size >= 20, "expected a real world, got " + made.size + " states");

// ── read back what the generator wrote ────────────────────────────────────────────────────────────────────
const got = Object.create(null);
let statesWithResources = 0, emptyBlocks = 0, nonInteger = 0, unknownName = 0;
const sDir = path.join(mod, "history", "states");
for (const f of fs.readdirSync(sDir)) {
  const t = strip(fs.readFileSync(path.join(sDir, f), "utf8"));
  const idm = /\bid[ \t]*=[ \t]*(\d+)/.exec(t);
  if (!idm || !made.has(+idm[1])) continue;
  const m = /resources\s*=\s*\{([^}]*)\}/.exec(t);
  if (!m) continue;
  const entries = [...m[1].matchAll(/([a-z_]+)\s*=\s*([0-9.]+)/g)];
  if (!entries.length) { emptyBlocks++; continue; }
  statesWithResources++;
  for (const r of entries) {
    const n = Number(r[2]);
    if (!Number.isInteger(n) || n <= 0) nonInteger++;
    if (!known.includes(r[1])) unknownName++;
    got[r[1]] = (got[r[1]] || 0) + n;
  }
}

console.log("base game : " + vanillaStatesWithResources + " states declare resources (" + known.join(", ") + ")");
console.log("generated : " + made.size + " states, " + statesWithResources + " declare resources");
for (const k of known.sort()) console.log("   " + k.padEnd(11) + String(got[k] || 0).padStart(6) + " of the base game's " + vanillaTotals[k]);

// ── the pins ──────────────────────────────────────────────────────────────────────────────────────────────
assert.strictEqual(emptyBlocks, 0,
  emptyBlocks + " generated state(s) got an EMPTY resources block — vanilla writes no block rather than an empty one");
assert.strictEqual(nonInteger, 0, nonInteger + " resource value(s) are not positive integers");
assert.strictEqual(unknownName, 0, unknownName + " resource name(s) are not ones the base game uses");

// The world was built on land the base game described, so SOMETHING has to come through. This is the
// assertion the bug would have failed: before the fix, every one of these was zero.
assert.ok(statesWithResources > 0,
  "not one generated state carries a resource, though this world was raised over land the base game gave "
  + vanillaStatesWithResources + " states' worth to");
const carried = known.filter((k) => (got[k] || 0) > 0);
assert.ok(carried.length >= 2,
  "only " + carried.length + " resource type(s) survived the rebuild: " + JSON.stringify(got));

// Apportioning can only ever lose to rounding, never invent: a generated world cannot hold MORE of a
// resource than the world it was built out of.
for (const k of known) {
  assert.ok((got[k] || 0) <= vanillaTotals[k],
    k + ": generated world holds " + got[k] + ", more than the base game's " + vanillaTotals[k] + " — apportioning invented some");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS: a generated state keeps the resources of the land below it");
