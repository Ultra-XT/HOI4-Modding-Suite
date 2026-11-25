// ⛔ #terrain-brush-only-offers-vanillas-eight — DERIVED FROM THE GAME, BUT NOT FROM THE MOD.
//
// A mod is an overlay, and common/terrain is one of the files it extends. The map page had TWO lists for one
// question: the province-inspector dropdown derived its terrains from the mod, and the Terrain BRUSH shipped
// a hardcoded eight. Measured on the installed corpus:
//
//   Millennium Dawn  adds `supercity`             and puts 55 land provinces on it
//   Old World Blues  adds `radiation` and `tunnel`      51 land provinces on radiation
//
// So a modder editing Millennium Dawn could not paint Millennium Dawn's own terrain — and painting over an
// existing supercity province was a ONE-WAY loss, because the brush offered `urban` and no way back. The
// write path never objected: editDefinitionCsv takes whatever string it is handed, and the dropdown had been
// writing `supercity` correctly all along.
//
// ⭐ TWO THINGS THE LIST MUST GET RIGHT, and only the game can answer either:
//   • is_water. Vanilla marks five categories as water and Millennium Dawn six. A naive "every category the
//     mod declares" would have offered `ocean` as a land brush.
//   • the colour. Every category in the game and in every installed mod declares its own `color = { r g b }`
//     (14/14 vanilla, 16/16 MD, 16/16 OWB), so a terrain the page has no hand-tuned swatch for still draws
//     as its author meant, instead of collapsing into the unknown-grey.
//
// ⚠️ Vanilla's land categories are EXACTLY the eight that were hardcoded, so a vanilla-based mod sees no
// change at all. That is the control: a fix here must not move the vanilla answer.
//
// 🈯 And a spelling: definition.csv's terrain column says `lakes`, the province TYPE column says `lake`.
// The page's palette was keyed on the type word, so its distinct lake colour never matched and all 126
// vanilla lakes fell through to the sea colour — indistinguishable from ocean in Color-by-terrain.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

const landOf = (m) => ((m && m.terrainCategories) || []).filter((c) => !c.water && c.name !== "unknown").map((c) => c.name);
const catOf = (m, n) => ((m && m.terrainCategories) || []).find((c) => c.name === n);

console.log("\n=== the model carries what common/terrain declares ===");
{
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrg-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0", "1;9;0;0;land;false;plains;1", "2;0;9;0;sea;false;ocean;0"].join("\r\n") + "\r\n");
  mk(path.join(g, "common", "terrain", "00_terrain.txt"),
    "categories = {\n"
    + "\tplains = { color = { 1 2 3 } movement_cost = 1.0 }\n"
    + "\tocean = { color = { 4 5 6 } is_water = yes }\n"
    + "\tunknown = { color = { 7 8 9 } }\n"
    + "}\n");

  const m0 = md.buildMapModel({ modRoot: g, gameRoot: g, dependencyRoots: [] });
  ok(landOf(m0).join(",") === "plains", "a water category is not offered as a land brush", landOf(m0));
  const p = catOf(m0, "plains");
  ok(!!p && p.color && p.color.join(",") === "1,2,3", "…and each category carries its own declared colour", p);
  const o = catOf(m0, "ocean");
  ok(!!o && o.water === true, "…and is_water is read off the category's OWN body, not a sibling's", o);

  console.log("\n=== ⭐ a mod that adds a terrain can paint it ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrm-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="T"\n');
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"),
    "categories = {\n"
    + "\tplains = { color = { 1 2 3 } }\n"
    + "\tocean = { color = { 4 5 6 } is_water = yes }\n"
    + "\tunknown = { color = { 7 8 9 } }\n"
    + "\tsupercity = { color = { 255 106 0 } movement_cost = 1.5 }\n"
    + "\tswamp_sea = { color = { 10 20 30 } is_water = yes }\n"
    + "}\n");
  const m1 = md.buildMapModel({ modRoot: mod, gameRoot: g, dependencyRoots: [] });
  ok(landOf(m1).indexOf("supercity") !== -1, "⭐ the mod's own land terrain is offered", landOf(m1));
  ok(landOf(m1).indexOf("swamp_sea") === -1, "…and its own WATER terrain is not", landOf(m1));
  const sc = catOf(m1, "supercity");
  ok(!!sc && sc.color && sc.color.join(",") === "255,106,0", "…with the colour its author chose", sc);

  console.log("\n=== a dependency's terrain reaches an add-on too ===");
  const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terra-")); tmps.push(addon);
  mk(path.join(addon, "descriptor.mod"), 'name="A"\n');
  const m2 = md.buildMapModel({ modRoot: addon, gameRoot: g, dependencyRoots: [mod] });
  ok(landOf(m2).indexOf("supercity") !== -1,
    "an add-on inherits the terrain its dependency declares", landOf(m2));

  console.log("\n=== the highest layer's definition of a shared name wins ===");
  const recol = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrr-")); tmps.push(recol);
  mk(path.join(recol, "descriptor.mod"), 'name="R"\n');
  mk(path.join(recol, "common", "terrain", "00_terrain.txt"),
    "categories = {\n\tplains = { color = { 90 90 90 } }\n}\n");
  const m3 = md.buildMapModel({ modRoot: recol, gameRoot: g, dependencyRoots: [] });
  ok((catOf(m3, "plains") || {}).color.join(",") === "90,90,90",
    "a mod that recolours plains gets ITS colour, not the base game's", catOf(m3, "plains"));
}

console.log("\n=== ⚠️ the control: the vanilla answer does not move ===");
if (!fs.existsSync(path.join(GAME, "common", "terrain"))) {
  console.log("  ..   (the base game is not installed — the corpus half cannot run)");
} else {
  const van = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  const HARDCODED = ["plains", "forest", "hills", "mountain", "marsh", "jungle", "desert", "urban"];
  ok(landOf(van).slice().sort().join(",") === HARDCODED.slice().sort().join(","),
    "⚠️ vanilla still resolves to exactly the eight that used to be hardcoded", landOf(van));
  ok(((van.terrainCategories || []).filter((c) => !c.color)).length === 0,
    "every vanilla category declares a colour, so nothing falls back to grey");

  const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
  if (fs.existsSync(MD)) {
    const m = md.buildMapModel({ modRoot: MD, gameRoot: GAME, dependencyRoots: [] });
    ok(landOf(m).indexOf("supercity") !== -1, "⭐ Millennium Dawn's supercity is paintable", landOf(m));
    const on = (m.provinces || []).filter((p) => p.type === "land" && p.terrain === "supercity").length;
    ok(on > 0, `…and it is not hypothetical — ${on} of its land provinces use it`, on);
    ok(landOf(m).indexOf("water_littoral") === -1,
      "…while the water category it also adds stays out of the brush", landOf(m));
  }
  const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
  if (fs.existsSync(OWB)) {
    const m = md.buildMapModel({ modRoot: OWB, gameRoot: GAME, dependencyRoots: [] });
    const land = landOf(m);
    ok(land.indexOf("radiation") !== -1 && land.indexOf("tunnel") !== -1,
      "⭐ Old World Blues' radiation and tunnel are paintable", land);
  }

  console.log("\n=== 🈯 lakes, plural ===");
  const usedLakes = (van.provinces || []).filter((p) => p.terrain === "lakes").length;
  ok(usedLakes > 0, `the game's terrain column really does say "lakes" (${usedLakes} provinces)`, usedLakes);
  const SRC = require("./testlib-map-page.js").readSource("public", "map.js");
  ok(/\blakes:\s*\[/.test(SRC), "…and the page's palette has an entry under that spelling");
  ok(/\blake:\s*\[/.test(SRC), "…keeping the singular too, since a mod may use either");
}

console.log("\n=== the page's own two functions, RUN ===");
{
  const SRC = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
  // ⚠️ Source-shape assertions alone did not bite: replacing the brush's derivation with an empty list left
  // every regex here matching, because the same phrase appears in the colour resolver next to it. So lift
  // the two functions out and RUN them, the way the deleteEmptiedStates test does — a back-out control that
  // does not fail is a change that is not load-bearing.
  const lift = (startMark, endMark) => {
    const a = SRC.indexOf(startMark);
    const b = a < 0 ? -1 : SRC.indexOf(endMark, a);
    return (a < 0 || b < 0) ? null : SRC.slice(a, b + endMark.length);
  };
  const block = lift("const VANILLA_LAND_TERRAINS = [", "return (c && c.color) || null;\n  };");
  ok(!!block, "the brush's terrain list and colour resolver were found in public/map.js");
  const build = block && new Function("model", "TERRAIN_COLORS",
    block + "\n return { landTerrains, terrainColor };");

  const MODEL = { terrainCategories: [
    { name: "plains", water: false, color: [1, 2, 3] },
    { name: "ocean", water: true, color: [4, 5, 6] },
    { name: "unknown", water: false, color: [7, 8, 9] },
    { name: "supercity", water: false, color: [255, 106, 0] },
  ] };
  const PALETTE = { plains: [122, 161, 71], unknown: [86, 86, 92] };
  if (build) {
    const f = build(MODEL, PALETTE);
    ok(f.landTerrains().join(",") === "plains,supercity",
      "⭐ RUN: the brush offers the model's land terrains, water and unknown excluded", f.landTerrains());
    // String(...) rather than .join — a resolver that returns null must FAIL here, not throw and take the
    // whole run's summary with it. A back-out control that crashes is a control you cannot read.
    ok(String(f.terrainColor("plains")) === "122,161,71",
      "⭐ RUN: the page's hand-tuned swatch still wins where it has one", f.terrainColor("plains"));
    ok(String(f.terrainColor("supercity")) === "255,106,0",
      "⭐ RUN: …and the mod's own colour is used where it does not", f.terrainColor("supercity"));
    ok(f.terrainColor("nonesuch") === null,
      "…and an unknown terrain resolves to nothing, so the caller's own fallback applies", f.terrainColor("nonesuch"));
    const empty = build({}, PALETTE);
    ok(empty.landTerrains().join(",") === "plains,forest,hills,mountain,marsh,jungle,desert,urban",
      "…and with no model loaded it falls back to vanilla's eight", empty.landTerrains());
  }
  ok(/model\s*&&\s*model\.terrainCategories/.test(SRC), "the brush reads model.terrainCategories");
  ok(/VANILLA_LAND_TERRAINS/.test(SRC), "…with the vanilla eight as the fallback for an unloaded model");
  // The swatch row and the Color-by-terrain fill must agree, or a province paints one colour and draws
  // another. Both call sites are named, rather than counted — a count passes if one of them is duplicated.
  ok(/terrainColor\(t\)\s*\|\|\s*\[120, 120, 120\]/.test(SRC),
    "…the swatch row resolves its colour through it");
  ok(/terrainColor\(t\)\s*\|\|\s*\(\(type ===/.test(SRC),
    "…and so does the Color-by-terrain fill, so a swatch matches what the map draws");
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== the terrain brush offers the mod's own terrain: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
