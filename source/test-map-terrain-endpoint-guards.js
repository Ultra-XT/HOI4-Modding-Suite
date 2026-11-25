// Four map findings from the deferred Map pass, re-verified as still real and adversarially confirmed.
//
// #terrain-endpoint-skips-erase-cleanup — /api/map/set-province-terrain wrote the definition.csv row and
// nothing else. Turning land into sea that way left the province LISTED IN ITS STATE — which no shipping map
// does and Nova reports as non_land_province_in_state, though what the game does with it is unmeasured (the
// engine text once quoted for it is not in hoi4.exe 1.19) — plus its naval_base, victory point, supply node and
// LAND strategic region. Measured on one fixture: the Erase path left 0 validator errors and this endpoint left 4.
//
// #terrain-endpoint-no-isolated-water-guard [CRASH] — the same endpoint would turn an INLAND province into
// water. flipProvinceToSea refuses that with 400 ("makes an isolated sea/lake … HOI4 loads, then divides by
// zero"); the endpoint happily rewrote the row. Both are fixed by DELEGATING to the guarded sibling rather
// than re-implementing its checks.
//
// #land-row-continent-zero — a land row must carry a non-zero continent (0 means sea, and land with
// continent 0 makes HOI4 report "no continent"). flipProvinceToLand clamps it; this path did not, and the
// type dropdown reaches it because a sea→land change posts no continent and the sea row's value is 0. The
// clamp judges the RESULT, not the request, so an already-land province keeps the continent it has.
//
// #orphan-building-fixer-unreachable — fixOrphanedStateBuildings handles the LAND sibling of the sea-leftover
// cleanup. It was written, exported and covered by a green unit test, and NOTHING CALLED IT: the only
// references in the whole repo were its own definition and that test. So Auto-fix repaired the sea half and
// the land half sat there forever.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapterr-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

// A minimal but REAL map: 4 provinces in a row so 1 and 3 are coastal and 2 is landlocked.
//   1 land (coastal, borders sea 4)   2 land (inland)   3 land (coastal)   4 sea
const MOD = path.join(ROOT, "mapterrmod");
["map", "history/states", "map/strategicregions", "map/supplyareas"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
// replace_path both map dirs so vanilla's 1,046 states and its own definition.csv do not merge into this
// four-province fixture — without it the erase path legitimately reaches vanilla states that reference these
// low province ids, and the test would be measuring the base game rather than the fixture.
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'name="MapTerrMod"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n', "utf8");
fs.writeFileSync(path.join(MOD, "map", "definition.csv"), [
  "1;10;0;0;land;true;plains;1",
  "2;20;0;0;land;false;plains;1",
  "3;30;0;0;land;true;plains;1",
  "4;40;0;0;sea;false;ocean;0",
  "",
].join("\n"), "utf8");
fs.writeFileSync(path.join(MOD, "map", "adjacencies.csv"), "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;;-1;-1;-1;-1;-1;;\n", "utf8");
fs.writeFileSync(path.join(MOD, "history", "states", "1-Probe.txt"),
  "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tprovinces = { 1 2 3 }\n" +
  "\thistory = {\n\t\towner = AAA\n\t\t1 = { naval_base = 8 }\n\t\tvictory_points = { 1 5 }\n\t}\n}\n", "utf8");

const defRow = (id) => {
  const t = fs.readFileSync(path.join(MOD, "map", "definition.csv"), "utf8");
  return (t.split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "");
};
const stateText = () => {
  try { return fs.readFileSync(path.join(MOD, "history", "states", "1-Probe.txt"), "utf8"); } catch (_) { return ""; }
};

const PORT = 42515;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[control] the fixture is what this test thinks it is");
    // If these are wrong every number below is meaningless.
    rec("province 1 starts as coastal land", /^1;.*;land;true;/.test(defRow(1)), defRow(1));
    rec("province 2 starts as inland land", /^2;.*;land;false;/.test(defRow(2)), defRow(2));
    rec("the state lists all three land provinces", /provinces\s*=\s*\{\s*1\s+2\s+3\s*\}/.test(stateText()), stateText());
    rec("…and holds a naval base on province 1", /1\s*=\s*\{\s*naval_base/.test(stateText()), stateText());

    console.log("\n[crash 1] land→sea through the terrain endpoint must do the full cleanup");
    let r = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 1, type: "sea", terrain: "ocean", coastal: false });
    rec("the request succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and was delegated to the guarded erase path", r.b && r.b.delegatedTo === "flip-province-sea", r.b);
    rec("the definition row is now sea", /^1;.*;sea;/.test(defRow(1)), defRow(1));
    // THE CRASH: a non-land province still listed in a state is what HOI4 faults on at load.
    // THE CRASH SHAPE: a non-land province still listed in a state is what HOI4 faults on at load.
    rec("the province was REMOVED from its state", !/provinces\s*=\s*\{[^}]*\b1\b[^}]*\}/.test(stateText()), stateText());
    rec("…and its victory point went with it", !/victory_points/.test(stateText()), stateText());
    // The naval_base block is deliberately NOT the erase path's job — it is left for the Auto-fix sweep
    // (fixSeaProvinceLeftovers), which is where this project put that cleanup. Asserted so the division of
    // labour is explicit rather than assumed; the auto-fix section below checks the other half.
    rec("…while the naval_base is left for Auto-fix, as designed", /naval_base/.test(stateText()), stateText());

    console.log("\n[crash 2] the endpoint must AGREE with the guarded path, whatever that path decides");
    // Pinning a hardcoded "refused" here would be wrong: whether a province counts as inland depends on the
    // map data, and this fixture has no provinces.bmp. The property that actually matters — and the one the
    // fix delivers — is that the two routes can no longer DISAGREE. So run the same operation through both
    // on identical fresh fixtures and compare the outcome.
    const twin = (name) => {
      const m = path.join(ROOT, name);
      // Same directory shape as the main fixture — buildMapModel needs adjacencies.csv and the region dirs,
      // and a twin missing them is not a twin.
      ["map", "history/states", "map/strategicregions", "map/supplyareas"].forEach((d) =>
        fs.mkdirSync(path.join(m, ...d.split("/")), { recursive: true }));
      fs.copyFileSync(path.join(MOD, "map", "adjacencies.csv"), path.join(m, "map", "adjacencies.csv"));
      fs.writeFileSync(path.join(m, "descriptor.mod"),
        `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n`, "utf8");
      fs.copyFileSync(path.join(MOD, "map", "definition.csv"), path.join(m, "map", "definition.csv"));
      fs.writeFileSync(path.join(m, "history", "states", "1-Probe.txt"),
        "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tprovinces = { 1 2 3 }\n" +
        "\thistory = {\n\t\towner = AAA\n\t}\n}\n", "utf8");
      return m;
    };
    const viaFlip = twin("twin_flip");
    const viaTerrain = twin("twin_terrain");
    const a = await post("/api/map/flip-province-sea", { modPath: viaFlip, provinceId: 2 });
    const b = await post("/api/map/set-province-terrain", { modPath: viaTerrain, provinceId: 2, type: "sea", terrain: "ocean", coastal: false });
    rec("both routes returned the same HTTP status", a.s === b.s, { flip: a.s, terrain: b.s });
    rec("…and the same accept/refuse verdict",
      Boolean(a.b && a.b.ok) === Boolean(b.b && b.b.ok), { flip: a.b && a.b.ok, terrain: b.b && b.b.ok });
    const rowOf = (m, id) => {
      const t = fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8");
      return (t.split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "");
    };
    rec("…and left definition.csv in the same state", rowOf(viaFlip, 2) === rowOf(viaTerrain, 2),
      { flip: rowOf(viaFlip, 2), terrain: rowOf(viaTerrain, 2) });

    console.log("\n[control] an ordinary terrain edit still works — this is a guard, not a wall");
    r = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 3, type: "land", terrain: "forest", coastal: true });
    rec("a plain terrain change succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and landed on disk", /^3;.*;land;true;forest/.test(defRow(3)), defRow(3));
    rec("…keeping its existing continent, not resetting it", defRow(3).split(";")[7] === "1", defRow(3));

    console.log("\n[continent] a sea→land change must not leave continent 0");
    r = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 4, type: "land", terrain: "plains", coastal: true });
    rec("the sea→land change succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("the row is land", /^4;.*;land;/.test(defRow(4)), defRow(4));
    // 0 means "sea"; land with continent 0 makes HOI4 report a "no continent" error.
    rec("…and its continent is no longer 0", Number(defRow(4).split(";")[7]) >= 1, defRow(4));

    console.log("\n[unreachable fixer] Auto-fix now runs the orphaned-building cleanup");
    const fix = await post("/api/map/auto-fix", { modPath: MOD });
    rec("auto-fix ran", fix.s === 200 && fix.b && fix.b.ok !== false, fix.b || fix.s);
    // Before this change the key did not exist at all — the fixer was written, exported, unit-tested and
    // never called from anywhere.
    rec("…and reports the orphan-building fixer", !!(fix.b && fix.b.fixes && fix.b.fixes.orphanBuildings),
      fix.b && fix.b.fixes ? Object.keys(fix.b.fixes) : fix.b);

    console.log(`\n=== map terrain endpoint guards: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
