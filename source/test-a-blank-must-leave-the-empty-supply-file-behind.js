// A blank must MATERIALISE map/supply_nodes.txt and map/railways.txt, even with nothing to put in them.
// #a-blank-must-leave-the-empty-supply-file-behind
//
// THE QUESTION THIS SETTLES, asked after the owner's rebuilt world reported supply_nodes_empty and
// railways_empty: should Delete map write those two files at all, when everything it has to say about them
// is "none"? An empty file looks like a Nova artefact, and the obvious tidy-up is to stop writing it.
//
// ⛔ IT IS NOT AN ARTEFACT. A same-named file in map/ replaces the one below it WHOLESALE — no replace_path
// line needed — so the empty file is the only thing standing between the modder and the layer below's hubs.
// Measured on the owner's own world (Delete map -> Generate land 35% -> Auto-fix x2, validated through the
// same four calls /api/map/validate composes), the two files the ONLY difference:
//
//     with the empty files (today)   2 WARNINGS   supply_nodes_empty, railways_empty
//     without them                   2 ERRORS     475 supply hubs on sea, 886 railways through sea
//
// Both maps report 17 problems. One of them has no supply network and says so; the other has vanilla's
// whole supply network laid out across open ocean and calls it an error. Take the files away and the
// warning does not go quiet — it turns into the thing the warning was there to prevent.
//
// 🈯 And nobody ships an empty one: across every installed root, 7 own at least one of the two files and
// none has zero rows — supply hubs 727 / 914 / 734 / 1,624 / 701 / 717 and railways 909 / 1,323 / 979 /
// 1,424 / 1,655 / 898 for vanilla, Millennium Dawn, Road to 56, Old World Blues, Novum Vexillum and Rise
// of Nations. Not one of the 14 files carries a # comment either, so a self-documenting header would be a
// shape the format has never been given.
//
// ⚠️ AND NOTHING SHOULD PUT HUBS BACK. There is no rule to follow: the share of states with no hub at all
// runs from 27.1% (Old World Blues) to 57.4% (Novum Vexillum), 84 to 164 states per map carry two or more,
// and OWB ships more hubs than it has states. Where a hub belongs on a world nobody has played is a
// scenario decision, which is why the warning declines Auto-fix and points at the tools that place one instead.
//
// ⚠️ THAT LAST CHECK USED TO NAME "the Supply view", and the Map editor has no such thing — the phrase is HOI4's
// own map mode, which map-data.js names correctly three other times. It now reads the tool names off
// public/map.html, so a renamed tool fails here instead of quietly making the advice wrong again.
// #a-validator-must-name-a-control-that-exists pins the message itself.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};
const tmps = [];

// ── the fixture: the owner's own shape — the mod owns the world's SHAPES and nothing else ────────────
// 12x4. Provinces 1, 2, 3 land, 4 already sea. The BASE root carries the supply hubs, the railway and the
// state; the mod carries only provinces.bmp and definition.csv, which is what Delete map insists on owning.
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
const W = 12, H = 4;
const provAtX = (x) => (x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4);
function bmp24() {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + imageSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; } }
  return b;
}
const DEF = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;10;10;land;false;plains;1",
  "2;20;20;20;land;false;plains;1",
  "3;30;30;30;land;true;plains;1",
  "4;40;40;40;sea;false;ocean;0",
].join("\n") + "\n";

function makeWorld() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankfile-")); tmps.push(home);
  const base = path.join(home, "base"), mod = path.join(home, "mod");
  fs.mkdirSync(path.join(base, "map"), { recursive: true });
  fs.mkdirSync(path.join(base, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(base, "map", "provinces.bmp"), bmp24());
  fs.writeFileSync(path.join(base, "map", "definition.csv"), DEF);
  fs.writeFileSync(path.join(base, "map", "supply_nodes.txt"), "1 1\n1 2\n");
  fs.writeFileSync(path.join(base, "map", "railways.txt"), "1 3 1 2 3 \n");
  fs.writeFileSync(path.join(base, "map", "buildings.txt"), "1;arms_factory;1.00;9.50;2.00;0.00;0\n");
  fs.writeFileSync(path.join(base, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  // …and the mod: the descriptor, the shapes, the types. NO replace_path — the base map must show through,
  // which is the whole point of the question.
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="BLANKFILE"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24());
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), DEF);
  return { base, mod };
}
// -1 for a file that is not there, so the check that matters most REPORTS rather than throwing: back out the
// behaviour under test and this whole file used to die on the first read, taking the rest of the run with it.
const rowsIn = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim()).length : -1);
// ⚠️ THE RULE IS GATED ON THE MAP HAVING LAND AGAIN, on purpose — "a blank ocean canvas has no use for a
// supply hub, and saying this mid-flow would be noise". A first cut of this test blanked and then looked for
// the warning, and read its own missing step as Nova saying nothing. So: blank, then put land back, which is
// what Generate land does next in the owner's flow. Province 1 only — 2 and 3 stay drowned, so the map below
// still has a hub and a railway out on the water for the control below to find.
const regrowLand = (mod, base) => md.setProvinceDefinition({
  modRoot: mod, gameRoot: base, dependencyRoots: [], provinceId: 1,
  type: "land", terrain: "plains", coastal: true, continent: 1,
});
// ⚠️ SEND WHAT THE CLIENT SENDS. /api/map/validate composes FOUR calls, and the two rule families this test
// weighs live in different ones: supply_node_bad_province in validateMapModel, supply_nodes_empty in
// validateMapFiles, which only validateMapBitmap reaches. A first cut called validateMapModel alone and read
// its own half-a-validator as Nova staying silent. This is the handler, in order.
const validateLikeTheEndpoint = (mod, base) => {
  const model = md.buildMapModel({ modRoot: mod, gameRoot: base, dependencyRoots: [] });
  return {
    model,
    problems: [
      ...md.findStateFileConflicts(mod),
      ...md.validateMapModel(model),
      ...md.findBuildingAnchorMismatches({ modRoot: mod, gameRoot: base, dependencyRoots: [], model }),
      ...md.validateMapBitmap({ modRoot: mod, gameRoot: base, dependencyRoots: [] }),
    ],
  };
};
const ruleTable = (mod, base) => {
  const { model, problems } = validateLikeTheEndpoint(mod, base);
  const t = new Map();
  for (const p of problems) t.set(p.rule, { n: (t.get(p.rule) || { n: 0 }).n + 1, severity: p.severity, message: p.message });
  return { t, model };
};

// ── ⛔ the finding: the blank leaves the files behind, with nothing in them ───────────────────────────
console.log("\n=== ⛔ a blank materialises both files rather than letting the map below show through ===");
{
  const { base, mod } = makeWorld();
  const sup = path.join(mod, "map", "supply_nodes.txt"), rail = path.join(mod, "map", "railways.txt");
  ok(!fs.existsSync(sup) && !fs.existsSync(rail), "the mod starts owning neither file");
  const start = ruleTable(mod, base);
  ok((start.model.supplyNodes || []).length === 2 && (start.model.railways || []).length === 1,
    "…so the map it loads is the one below: 2 hubs and a railway, all on land",
    { hubs: (start.model.supplyNodes || []).length, rails: (start.model.railways || []).length });

  const r = md.blankMapToSea({ modRoot: mod, gameRoot: base, dependencyRoots: [] });
  ok(r.changed === true && !r.error, "the blank ran", r.error || r);
  ok(r.flippedProvinces === 3, "…and drowned all three land provinces", r.flippedProvinces);

  ok(fs.existsSync(sup) && fs.existsSync(rail),
    "⭐⭐⭐ the mod now OWNS map/supply_nodes.txt and map/railways.txt", { sup: fs.existsSync(sup), rail: fs.existsSync(rail) });
  ok(rowsIn(sup) === 0 && rowsIn(rail) === 0,
    "⭐⭐ …with no rows in them, because a world with no land has no hubs and no railways",
    { supplyRows: rowsIn(sup), railRows: rowsIn(rail) });

  // …and it wrote into the MOD, never into the layer below.
  ok(rowsIn(path.join(base, "map", "supply_nodes.txt")) === 2 && rowsIn(path.join(base, "map", "railways.txt")) === 1,
    "⚠️ the map below is untouched — Nova wrote into the mod, as it must",
    { base: rowsIn(path.join(base, "map", "supply_nodes.txt")) });

  const after = ruleTable(mod, base);
  ok(!after.t.has("supply_node_bad_province") && !after.t.has("railway_bad_province"),
    "⭐⭐⭐ nothing is left standing on the water Nova just made",
    [...after.t.keys()]);
  ok(!after.t.has("supply_nodes_empty") && !after.t.has("railways_empty"),
    "⚠️ …and while the canvas is still all ocean nothing nags about missing hubs",
    [...after.t.keys()]);

  regrowLand(mod, base);
  const grown = ruleTable(mod, base);
  const s = grown.t.get("supply_nodes_empty"), w = grown.t.get("railways_empty");
  ok(!!s && !!w && s.severity === "warning" && w.severity === "warning",
    "⭐⭐ once there is land again, what the modder is told is a WARNING that the map has none, not an error",
    { supply: s && s.severity, rail: w && w.severity, rules: [...grown.t.keys()] });
  ok(!grown.t.has("supply_node_bad_province") && !grown.t.has("railway_bad_province"),
    "⭐⭐ …and still nothing on the water", [...grown.t.keys()]);
}

// ── ⭐⭐⭐ THE COST OF TIDYING THEM AWAY — the control that makes the decision durable ─────────────────
console.log("\n=== ⭐⭐⭐ take the empty files away and the map below shows through, onto water ===");
{
  const { base, mod } = makeWorld();
  md.blankMapToSea({ modRoot: mod, gameRoot: base, dependencyRoots: [] });
  regrowLand(mod, base);
  const kept = ruleTable(mod, base);

  // exactly what a "stop writing an empty file" change would leave behind. rmSync with force, not unlink:
  // under that change the files are ALREADY absent, and this block must still measure, not throw.
  fs.rmSync(path.join(mod, "map", "supply_nodes.txt"), { force: true });
  fs.rmSync(path.join(mod, "map", "railways.txt"), { force: true });
  const gone = ruleTable(mod, base);

  ok((gone.model.supplyNodes || []).length === 2 && (gone.model.railways || []).length === 1,
    "⭐⭐⭐ with the mod's files gone the map below's hubs and railway are loaded again",
    { hubs: (gone.model.supplyNodes || []).length, rails: (gone.model.railways || []).length });
  ok(!!gone.t.get("supply_node_bad_province") && !!gone.t.get("railway_bad_province"),
    "⭐⭐⭐ …standing on the sea this very blank made, and reported as such", [...gone.t.keys()]);
  ok((gone.t.get("supply_node_bad_province") || {}).severity === "error"
    && (gone.t.get("railway_bad_province") || {}).severity === "error",
    "⭐⭐ …as ERRORS, where the empty file gave two warnings",
    { hub: (gone.t.get("supply_node_bad_province") || {}).severity, rail: (gone.t.get("railway_bad_province") || {}).severity });
  ok(kept.t.has("supply_nodes_empty") && !gone.t.has("supply_nodes_empty"),
    "⚠️ the warning does go quiet — it is replaced by the fault it was warning about", [...gone.t.keys()]);
}

// ── ⚠️ …and the warning is honest about itself ───────────────────────────────────────────────────────
console.log("\n=== ⚠️ the warning declines Auto-fix, because where a hub goes is nobody's to derive ===");
{
  const { base, mod } = makeWorld();
  md.blankMapToSea({ modRoot: mod, gameRoot: base, dependencyRoots: [] });
  regrowLand(mod, base);
  const ps = validateLikeTheEndpoint(mod, base).problems.filter((p) => p.rule === "supply_nodes_empty" || p.rule === "railways_empty");
  ok(ps.length === 2, "both are reported, once each", ps.map((p) => p.rule));
  ok(ps.every((p) => p.autoFix === false),
    "⭐⭐ neither offers an Auto-fix — a button that writes nothing is not an offer", ps.map((p) => p.autoFix));
  const labels = require("./public/map-rule-labels.js");
  ok(!labels.isFatalRule("supply_nodes_empty") && !labels.isFatalRule("railways_empty"),
    "⚠️ …and neither gates the Save: a map with no supply hubs loads and starts a game", true);
  // Derived from the page, and scoped to the closing instruction: "Railways are what carry supply out of a hub"
  // puts the string "Railway" in ordinary prose, so a scan of the whole message passes without the advice
  // naming anything.
  const TOOL_NAMES = [...fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8")
    .matchAll(/class="map-tool"[\s\S]*?<span class="tool-name">([^<]+)<\/span>/g)].map((m) => m[1].trim());
  const fixSentence = (p) => { const m = String(p.message || ""), i = m.indexOf("To fix it,"); return i < 0 ? "" : m.slice(i); };
  ok(TOOL_NAMES.length >= 8 && ps.every((p) => TOOL_NAMES.some((t) => fixSentence(p).indexOf(t) >= 0)),
    "⭐ …but each says where the modder does it themselves — a Map editor tool that can place one",
    ps.map((p) => fixSentence(p).slice(0, 120)));
}

// ── 🈯 and the tool it names really can, so the advice is not a dead end ─────────────────────────────
console.log("\n=== 🈯 the page it points at has the endpoint it needs ===");
{
  const page = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  ok(/"\/api\/map\/supply-node"/.test(page) && /action: "add"/.test(page),
    "⭐ public/map.js posts an add to /api/map/supply-node", /"\/api\/map\/supply-node"/.test(page));
  ok(/"\/api\/map\/supply-node"/.test(server), "…and server.js serves it", true);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } });
console.log(`\n=== a blank must leave the empty supply file behind: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
