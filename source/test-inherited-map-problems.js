// #inherited-problem-not-yours — Mod Health reported the BASE GAME's own map defects as the modder's.
//
// The buildings scans read the "effective" map/buildings.txt: the mod's own if it has one, otherwise the
// dependency's or the base game's. Only the first case is the modder's file. When a mod has no map folder at
// all — a content-only mod of characters, events and spirits — the scan read the base game's buildings.txt
// and reported its stale rows as problems in the user's mod, saying the buildings "silently vanish from the
// game" and offering to auto-fix them.
//
// Three things wrong with that. The rows are not theirs. The shipping game plays fine with them. And the only
// way to act on the advice is to materialise the entire base-game buildings.txt — tens of thousands of rows —
// into a mod that has no map folder, turning a content mod into one that overrides the whole map.
//
// Found by running Nova's own Mod Health against the mod this campaign built through the UI: it reported two
// buildings in a mod containing no map directory whatsoever.
//
// The AUTO-FIX used to still work on an inherited file, on the reasoning that materialising is the right move when the
// modder asks for it. Its only caller is "Auto-fix all", which repairs the problems on the screen, and one click copied
// the layer's whole buildings.txt into the mod for rows no rule had named — so it re-homes only what the rule reports
// (#auto-fix-leaves-a-building-row-the-mod-inherited), and the modder's own stranded building is still repaired.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height; const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3);

// A "base game" that ships a stranded building of its own — exactly what vanilla does.
function makeGameRoot() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-basegame-"));
  const W = 9, H = 4;
  mk(path.join(g, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(g, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(g, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(g, "history", "states", "200.txt"), 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(g, "map", "buildings.txt"), [
    "100;arms_factory;4.00;10.0;2.00;0.00;0",   // sits on prov2 (state 200) but keyed 100 — the base game's own
    "200;bunker;4.00;10.0;2.00;0.00;0",
    "100;naval_base;4.00;10.0;2.00;0.00;2",     // anchor column names prov2 (state 200) — the anchor rule's case
  ].join("\n") + "\n");
  return g;
}

// The same base game, but with the OTHER inherited inconsistencies vanilla actually ships:
// a victory point on a province another state owns, and a sea province carrying a continent.
function makeGameRootWithModelProblems() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-basegame2-"));
  const W = 9, H = 4;
  mk(path.join(g, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  // province 3 is SEA with continent 1 — vanilla ships sea provinces with a continent set
  mk(path.join(g, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;1",
  ].join("\r\n") + "\r\n");
  // state 100 owns province 1 but claims a victory point on province 2 — which state 200 owns.
  // This is vanilla's state-97-vs-95 shape exactly.
  mk(path.join(g, "history", "states", "100.txt"),
    'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA victory_points = { 2 5 } }\n}\n');
  mk(path.join(g, "history", "states", "200.txt"),
    'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n');
  return g;
}

(() => {
  console.log("=== a CONTENT-ONLY mod is not blamed for the base game's buildings ===");
  const game = makeGameRoot();
  // A mod with characters and events and NO map folder — the shape that exposed this.
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-contentmod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="ContentOnly"\nsupported_version="1.19.*"\n');
  mk(path.join(mod, "common", "characters", "chars.txt"), "characters = {\n}\n");
  ok("the mod really has no map folder", !fs.existsSync(path.join(mod, "map")));

  const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  ok("…but the base game's buildings.txt is still what would be read",
    fs.existsSync(path.join(game, "map", "buildings.txt")));

  const placement = md.findBuildingPlacementProblems({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
  ok("no position problems are reported against it", placement.length === 0, placement);

  const anchors = md.findBuildingAnchorMismatches({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
  ok("…and no anchor problems either", anchors.length === 0, anchors);

  // Moved with #auto-fix-leaves-a-building-row-the-mod-inherited: this asserted the auto-fix still re-homed the inherited row
  // "when asked". Its only caller is Auto-fix all, which answers to the rules, so it leaves the inherited row alone too. The
  // half a blunt "ignore inherited buildings entirely" fix would break is pinned below: the modder's OWN row is re-homed.
  const planned = md.fixBuildingsTxtPlacement({ modRoot: mod, gameRoot: game, dependencyRoots: [], dryRun: true });
  ok("the auto-fix leaves the inherited row alone too — nothing reported, nothing re-homed, nothing trimmed",
    planned && !planned.error && (planned.rehomed || 0) === 0 && !planned.trimmed, planned);
  ok("…and a dry run writes nothing into the mod", !fs.existsSync(path.join(mod, "map", "buildings.txt")));

  console.log("\n=== a mod that OWNS its buildings.txt is still told about its own rows ===");
  // Same stranded row, but now it is the modder's file. Nothing about this case changes.
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapmod-"));
  mk(path.join(mod2, "descriptor.mod"), 'name="MapMod"\nreplace_path="map"\nreplace_path="history/states"\n');
  const W = 9, H = 4;
  mk(path.join(mod2, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(mod2, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod2, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod2, "history", "states", "200.txt"), 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod2, "map", "buildings.txt"), [
    "100;arms_factory;4.00;10.0;2.00;0.00;0",
    "100;naval_base;4.00;10.0;2.00;0.00;2",
  ].join("\n") + "\n");

  const model2 = md.buildMapModel({ modRoot: mod2, gameRoot: game, dependencyRoots: [] });
  const own = md.findBuildingPlacementProblems({ modRoot: mod2, gameRoot: game, dependencyRoots: [], model: model2 });
  ok("the modder's OWN stranded building is still reported",
    own.some((p) => p.rule === "building_wrong_state"), own);
  const ownPlan = md.fixBuildingsTxtPlacement({ modRoot: mod2, gameRoot: game, dependencyRoots: [], dryRun: true });
  ok("…and the auto-fix still re-homes it", ownPlan && !ownPlan.error && ownPlan.rehomed === 1, ownPlan);
  const ownAnchor = md.findBuildingAnchorMismatches({ modRoot: mod2, gameRoot: game, dependencyRoots: [], model: model2 });
  ok("…and so is their own anchor mismatch",
    ownAnchor.some((p) => p.rule === "building_anchor_wrong_state"), ownAnchor);

  console.log("\n=== the same rule for the OTHER inherited map layers ===");
  // Victory points and sea continents are the same bug in different rules: the base game ships both, and a
  // mod that inherits the files did not write them. Ownership is checked on BOTH sides of the VP mismatch,
  // because a modder CAN break a state they don't own by moving a province out of it.
  const game2 = makeGameRootWithModelProblems();
  const mod3 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-contentmod2-"));
  mk(path.join(mod3, "descriptor.mod"), 'name="ContentOnly2"\nsupported_version="1.19.*"\n');
  mk(path.join(mod3, "common", "characters", "chars.txt"), "characters = {\n}\n");

  const m3 = md.buildMapModel({ modRoot: mod3, gameRoot: game2, dependencyRoots: [] });
  const probs3 = md.validateMapModel(m3);
  ok("the base game's own VP mismatch is not reported to a mapless mod",
    !probs3.some((p) => p.rule === "vp_not_in_state"), probs3.filter((p) => p.rule === "vp_not_in_state"));
  ok("…nor its sea province with a continent",
    !probs3.some((p) => p.rule === "sea_province_has_continent"), probs3.filter((p) => p.rule === "sea_province_has_continent"));

  // Now a mod that SHIPS the state holding the stray VP: its own file, its own problem.
  const mod4 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vpmod-"));
  mk(path.join(mod4, "descriptor.mod"), 'name="VpMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod4, "history", "states", "100.txt"),
    'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA victory_points = { 2 5 } }\n}\n');
  const m4 = md.buildMapModel({ modRoot: mod4, gameRoot: game2, dependencyRoots: [] });
  const probs4 = md.validateMapModel(m4);
  ok("a mod that ships the state IS told about its stray victory point",
    probs4.some((p) => p.rule === "vp_not_in_state" && p.stateId === 100), probs4.map((p) => p.rule));

  // …and the other side: the mod ships the state that now HOLDS the province, having taken it. The state
  // still carrying the VP is inherited, but the modder caused this, so it must still be reported.
  const mod5 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vpmod2-"));
  mk(path.join(mod5, "descriptor.mod"), 'name="VpMod2"\nsupported_version="1.19.*"\n');
  mk(path.join(mod5, "history", "states", "200.txt"),
    'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = BBB }\n}\n');
  const m5 = md.buildMapModel({ modRoot: mod5, gameRoot: game2, dependencyRoots: [] });
  const probs5 = md.validateMapModel(m5);
  ok("a mod that ships the state HOLDING the province is told too (it may have taken it)",
    probs5.some((p) => p.rule === "vp_not_in_state" && p.stateId === 100), probs5.map((p) => p.rule));

  // ⛔ SHIPPING definition.csv IS NOT AUTHORING ITS ROWS. This assertion used to read "a mod that ships
  // definition.csv IS told about its sea province with a continent", and its fixture — unchanged below —
  // is a copy of game2's file BYTE FOR BYTE. That is not a hypothetical: definition.csv is a whole-file
  // override, so Nova copies all of it into the mod the first time you use the Terrain tool, and from that
  // moment the modder owns 13,000 of vanilla's rows. Measured against the real game: a mod holding vanilla's
  // definition.csv verbatim and nothing else was shown "⛔ This map will crash HOI4", over province 5257,
  // which really is `sea;true;ocean;2` in the shipped base game — which launches.
  const mod6 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-defmod-"));
  mk(path.join(mod6, "descriptor.mod"), 'name="DefMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod6, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;1",
  ].join("\r\n") + "\r\n");
  ok("the fixture really is a verbatim copy of the base game's definition.csv",
    fs.readFileSync(path.join(mod6, "map", "definition.csv")).equals(fs.readFileSync(path.join(game2, "map", "definition.csv"))));
  const m6 = md.buildMapModel({ modRoot: mod6, gameRoot: game2, dependencyRoots: [] });
  const probs6 = md.validateMapModel(m6);
  ok("a mod that merely COPIED definition.csv in is not blamed for the base game's sea continent",
    !probs6.some((p) => p.rule === "sea_province_has_continent"), probs6.map((p) => p.rule));

  // …and the half that must still bite. Suppressing "not the mod's" must never collapse into "never fires":
  // a row the mod actually CHANGED, and a province it INVENTED, are both its own.
  const mod7 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-defmod-changed-"));
  mk(path.join(mod7, "descriptor.mod"), 'name="DefModChanged"\nsupported_version="1.19.*"\n');
  mk(path.join(mod7, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1",
    "3;0;0;200;sea;false;ocean;7",             // continent CHANGED from the base game's 1
  ].join("\r\n") + "\r\n");
  const probs7 = md.validateMapModel(md.buildMapModel({ modRoot: mod7, gameRoot: game2, dependencyRoots: [] }));
  ok("a mod that CHANGED a sea province's continent is still told",
    probs7.some((p) => p.rule === "sea_province_has_continent" && (p.provinces || []).includes(3)), probs7.map((p) => p.rule));

  const mod8 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-defmod-added-"));
  mk(path.join(mod8, "descriptor.mod"), 'name="DefModAdded"\nsupported_version="1.19.*"\n');
  mk(path.join(mod8, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;1",
    "4;10;20;30;sea;false;ocean;3",            // a province the base game does not have at all
  ].join("\r\n") + "\r\n");
  const probs8 = md.validateMapModel(md.buildMapModel({ modRoot: mod8, gameRoot: game2, dependencyRoots: [] }));
  ok("a sea province the mod INVENTED is its own, continent and all",
    probs8.some((p) => p.rule === "sea_province_has_continent" && (p.provinces || []).includes(4)), probs8.map((p) => p.rule));
  ok("…and the untouched inherited row beside it is still not blamed",
    !probs8.some((p) => p.rule === "sea_province_has_continent" && (p.provinces || []).includes(3)),
    probs8.filter((p) => p.rule === "sea_province_has_continent"));

  // With NO mod root there is nobody to attribute a problem to, so everything is reported. The first cut of
  // this fix had that backwards and silently blanked the sea-continent rule for every caller that validates
  // without an active mod — the suite caught it. Worth a guard of its own: "not the mod's" must never
  // collapse into "not reported at all".
  const noMod = md.validateMapModel({
    provinces: [{ id: 1, type: "sea", continent: 5 }],
    states: [{ id: 1, provinces: [1], victoryPoints: [{ province: 99, value: 3 }] }],
    provinceToState: { 1: 1 },
  });
  ok("with no mod selected the sea-continent rule still fires",
    noMod.some((p) => p.rule === "sea_province_has_continent"), noMod.map((p) => p.rule));
  ok("…and so does the victory-point rule", noMod.some((p) => p.rule === "vp_not_in_state"), noMod.map((p) => p.rule));

  [game, game2, mod, mod2, mod3, mod4, mod5, mod6, mod7, mod8].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log("\ntest-inherited-map-problems: " + pass + " checks passed");
})();
