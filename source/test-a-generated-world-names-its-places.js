// ⭐ #a-generated-world-names-its-places — A WORLD NOVA MAKES GETS NAMES, NOT NUMBERS.
//
// The owner's TEST 30 air map was labelled "STATE 112", "STATE 131" and "STATE 802 SEA" beside real Earth names ("AMAZONAS",
// "BOLIVIA") over land that was never Earth's. Every state Nova made was named "State <id>", and a land region lying over an
// old Earth region took that region's name. The owner: "for generating worlds, we do in fact need a name generator, but since
// people gonna be changing the name anyway, chose spam names i guess we dont have to make it perfect".
//
// Pinned here:
//   · generatedPlaceName — a pronounceable made-up name, the same for the same seed and salt, never one already taken;
//   · the redraw names a land region after its largest state when Nova named that state (nameAfterStates), not after the
//     Earth region under it — and a sea still takes the sea's name;
//   · the endpoint reads which states Nova named from Nova's own names file, end to end.
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

// …over a base game whose states stood ELSEWHERE, as a generated world's did: the base ids name land that is somewhere else. A
// land region takes its state's name only where the land is new (#a-renamed-state-keeps-its-regions-name), and in the default
// world the base game's state 1 covers continent A, so a state there is one the base game already had.
const W = makeRegionWorld("names", { baseStates: "elsewhere" });
process.env.HOI4_ROOT = W.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(W.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
const md = require("./map-data.js");
const SHAPE = /^[A-Z][a-z]{3,10}$/;

console.log("\n-- the generator --");
{
  const taken = new Set(), names = [];
  for (let i = 1; i <= 2000; i++) names.push(md.generatedPlaceName(4242, i, taken));
  ok(names.every((n) => SHAPE.test(n)), "2,000 names, each one capitalised word of 4 to 11 letters", names.filter((n) => !SHAPE.test(n)).slice(0, 5));
  ok(new Set(names.map((n) => n.toLowerCase())).size === names.length, "…no two alike");
  ok(!names.some((n) => /(.)\1\1|[^aeiou]{4}|[aeiou]{3}/.test(n.toLowerCase())), "…none with three of a letter, four consonants or three vowels in a row");
  ok(md.generatedPlaceName(4242, 17) === md.generatedPlaceName(4242, 17) && md.generatedPlaceName(4242, 17) !== md.generatedPlaceName(4243, 17), "the same seed and salt give the same name; another seed another");
  const first = md.generatedPlaceName(4242, 5);
  ok(md.generatedPlaceName(4242, 5, new Set([first.toLowerCase()])) !== first, "a name already taken is never given again");
}

console.log("\n-- ⛔ #a-made-up-name-is-never-a-slur --");
{
  // What the generator actually spelled before it was stopped: TEST 31's rehearsal ("Nigrosk", "Nigeto", "Fagroban") and a
  // review's 22,000 names ("Naziarek", "Negrosford", "Rapeisk", "Thipenis", "Shiteshoth", "Semend"). Evidence, so typed here:
  // the generator's own list is what is being tested.
  const SEEN = ["nig", "negr", "nazi", "fag", "rape", "penis", "shit", "semen"];
  // seeded exactly as the server seeds it: the mod folder's name (generatedStateNameEntries)
  const seedOf = (folder) => { let s = 0; for (const c of folder) s = (Math.imul(s, 31) + c.charCodeAt(0)) | 0; return s; };
  const folders = ["nova_test_t31", "nova_test_t31b", "nova_test_t30", "my_world", "kurdistan", ...Array.from({ length: 15 }, (_, i) => `world_${i}`)];
  const bad = [], fallbacks = [];
  let n = 0;
  for (const f of folders) {
    const taken = new Set();
    for (let id = 1; id <= 1100; id++) {
      const name = md.generatedPlaceName(seedOf(f), id, taken);
      n++;
      if (/^Place /.test(name)) fallbacks.push(`${f}:${id}`);
      else if (SEEN.some((w) => name.toLowerCase().includes(w))) bad.push(`${f}:${id} ${name}`);
    }
  }
  ok(!bad.length, `none of ${n.toLocaleString()} names, seeded as the server seeds them, spells what the generator once did`, bad.slice(0, 12));
  ok(!fallbacks.length, "…and the filter never runs a world out of names (no \"Place <id>\")", fallbacks.slice(0, 5));
}

console.log("\n-- ⭐ a land region takes the name of the state Nova named, not the Earth region under it --");
const ctx = { modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] };
{
  const model = md.buildMapModel(ctx);
  const allStates = (model.states || []).map((s) => s.id);
  const plain = md.rebuildStrategicRegions({ ...ctx, dryRun: true });
  const named = md.rebuildStrategicRegions({ ...ctx, dryRun: true, opts: { nameAfterStates: allStates } });
  ok(plain.ok && named.ok, "both dry runs plan", [plain.error, named.error]);
  const landFromBase = (r) => (r.regionsNamed || []).filter((x) => x.cls === "land" && x.nameFrom && x.nameFrom.baseRegion != null);
  ok(landFromBase(plain).length >= 1, `CONTROL: without it, ${landFromBase(plain).length} land region(s) over continent A take the base game's region names`, landFromBase(plain).map((x) => x.nameFrom));
  ok(landFromBase(named).length === 0 && (named.regionsNamed || []).filter((x) => x.cls === "land").every((x) => x.nameFrom && x.nameFrom.state != null && !x.nameFrom.sea),
    "⭐⭐ with the states Nova named, every land region is named after its largest state", landFromBase(named).map((x) => x.nameFrom));
  const seas = (r) => JSON.stringify((r.regionsNamed || []).filter((x) => x.cls === "sea").map((x) => [x.id, x.nameFrom]));
  ok(seas(plain) === seas(named), "…and every sea region is named exactly as before");
}

console.log("\n-- ⭐ end to end: the redraw endpoint reads which states Nova named from Nova's own names file --");
const { createApp } = require("./server.js");
(async () => {
  let server = null;
  try {
    const model = md.buildMapModel(ctx);
    const states = (model.states || []).slice().sort((a, b) => a.id - b.id);
    const nameOf = new Map(states.map((s) => [s.name, md.generatedPlaceName(99, s.id)]));
    const novaFile = path.join(W.MOD, "localisation", "english", "replace", "nova_state_names_l_english.yml");
    fs.mkdirSync(path.dirname(novaFile), { recursive: true });
    fs.writeFileSync(novaFile, "﻿l_english:\n" + [...nameOf].map(([k, v]) => ` ${k}:0 "${v}"`).join("\n") + "\n");
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const w = await fetch(base + "/api/map/rebuild-regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: W.MOD, confirm: true }) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    ok(w.status === 200 && w.body.ok === true, "the confirmed redraw is written", w.body.error || w.body);
    const locFile = path.join(W.MOD, "localisation", "english", "replace", "nova_region_names_l_english.yml");
    const loc = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    const values = [...loc.matchAll(/^\s*[A-Za-z0-9_.]+:\d*\s*"(.*)"\s*$/gm)].map((m) => m[1]);
    const stateNames = new Set(nameOf.values());
    const m2 = md.buildMapModel(ctx);
    const landRegions = (m2.strategicRegions || []).filter((r) => (r.provinces || []).some((p) => (m2.provinces.find((q) => q.id === p) || {}).type === "land"));
    ok(!values.some((v) => /^A (North|South)( \d+)?$/.test(v)), "⭐⭐⭐ no region over the new land is named after the old Earth region under it", values);
    ok(values.filter((v) => stateNames.has(v.replace(/ \d+$/, ""))).length >= 3, "…they carry the made-up names of their states", values);
    ok(!values.some((v) => /^State \d+/.test(v)), "…and none is \"State <id>\"", values);
    void landRegions;
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(W.ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})();
