// Map owns country COLOUR: mapData.setCountryColor writes common/countries/colors.txt. colors.txt is a
// WHOLESALE file (a mod's copy overrides the base entirely), so the writer must preserve every OTHER
// country's colour: edit-in-place when the mod has its own file, else SEED from the effective base first.
// Also verifies color_ui is untouched, a brand-new tag inserts a fresh block, and the tag match never
// corrupts a different tag that shares a prefix (GE vs GER). Wiki format (hoi4.paradoxwikis.com/Country_modding):
// `TAG = { color = rgb { r g b } color_ui = rgb { ... } }`, rgb on 0-255. Run: node test-map-country-color.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const mapData = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmp = (pfx) => fs.mkdtempSync(path.join(os.tmpdir(), pfx));
const colorsPath = (root) => path.join(root, "common", "countries", "colors.txt");
const readColors = (root) => fs.readFileSync(colorsPath(root), "utf8");

(() => {
  console.log("=== Map: setCountryColor (colors.txt writer) ===");
  const made = [];
  try {
    // ── 1) Edit a tag in the mod's OWN colors.txt: primary colour changes, color_ui + other tags survive. ──
    {
      const mod = tmp("nova-col-edit-"); made.push(mod);
      mk(colorsPath(mod),
        "AAA = {\n\tcolor = rgb { 10 20 30 }\n\tcolor_ui = rgb { 40 50 60 }\n}\nBBB = {\n\tcolor = rgb { 1 2 3 }\n}\n");
      const r = mapData.setCountryColor({ modRoot: mod, gameRoot: null, tag: "AAA", rgb: [200, 100, 50] });
      ok("edit: changed ok", r.changed === true, r);
      const parsed = mapData.parseCountryColors(readColors(mod));
      ok("edit: AAA primary colour is now 200,100,50", JSON.stringify(parsed.AAA) === JSON.stringify([200, 100, 50]), parsed.AAA);
      ok("edit: AAA color_ui line untouched", /color_ui\s*=\s*rgb\s*\{\s*40 50 60\s*\}/.test(readColors(mod)));
      ok("edit: BBB (another country) untouched", JSON.stringify(parsed.BBB) === JSON.stringify([1, 2, 3]), parsed.BBB);
      ok("edit: did NOT insert a new block", r.insertedNewBlock === false && r.seededBaseColors === false, r);
    }

    // ── 2) Mod has NO colors.txt → SEED from the effective base, preserving every other country. ──
    {
      const game = tmp("nova-col-game-"); made.push(game);
      const mod = tmp("nova-col-seed-"); made.push(mod);
      mk(colorsPath(game),
        "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\nCCC = {\n\tcolor = rgb { 5 5 5 }\n}\nDDD = {\n\tcolor = rgb { 9 9 9 }\n}\n");
      ok("seed: mod starts with no colours file", !fs.existsSync(colorsPath(mod)));
      const r = mapData.setCountryColor({ modRoot: mod, gameRoot: game, tag: "CCC", rgb: [12, 34, 56] });
      ok("seed: changed ok + reports it seeded from base", r.changed === true && r.seededBaseColors === true, r);
      ok("seed: mod now has its own colours file", fs.existsSync(colorsPath(mod)));
      const parsed = mapData.parseCountryColors(readColors(mod));
      ok("seed: CCC colour set to 12,34,56", JSON.stringify(parsed.CCC) === JSON.stringify([12, 34, 56]), parsed.CCC);
      ok("seed: AAA preserved from base (not lost to the wholesale override)", JSON.stringify(parsed.AAA) === JSON.stringify([10, 20, 30]), parsed.AAA);
      ok("seed: DDD preserved from base too", JSON.stringify(parsed.DDD) === JSON.stringify([9, 9, 9]), parsed.DDD);
    }

    // ── 3) A brand-new tag (in no colours file) → a fresh block with both color + color_ui. ──
    {
      const mod = tmp("nova-col-new-"); made.push(mod);
      mk(colorsPath(mod), "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\n");
      const r = mapData.setCountryColor({ modRoot: mod, gameRoot: null, tag: "ZZZ", rgb: [7, 8, 9] });
      ok("new: changed + insertedNewBlock", r.changed === true && r.insertedNewBlock === true, r);
      const txt = readColors(mod), parsed = mapData.parseCountryColors(txt);
      ok("new: ZZZ block added with the colour", JSON.stringify(parsed.ZZZ) === JSON.stringify([7, 8, 9]), parsed.ZZZ);
      ok("new: ZZZ block also has color_ui", /ZZZ\s*=\s*\{[\s\S]*color_ui\s*=\s*rgb\s*\{\s*7 8 9\s*\}/.test(txt));
      ok("new: AAA still present", JSON.stringify(parsed.AAA) === JSON.stringify([10, 20, 30]), parsed.AAA);
    }

    // ── 4) Tag match is exact — setting "GE" must not corrupt "GER" (shared prefix). ──
    {
      const mod = tmp("nova-col-prefix-"); made.push(mod);
      mk(colorsPath(mod), "GE = {\n\tcolor = rgb { 1 1 1 }\n}\nGER = {\n\tcolor = rgb { 2 2 2 }\n}\n");
      mapData.setCountryColor({ modRoot: mod, gameRoot: null, tag: "GE", rgb: [100, 100, 100] });
      let parsed = mapData.parseCountryColors(readColors(mod));
      ok("prefix: GE changed", JSON.stringify(parsed.GE) === JSON.stringify([100, 100, 100]), parsed.GE);
      ok("prefix: GER NOT touched when editing GE", JSON.stringify(parsed.GER) === JSON.stringify([2, 2, 2]), parsed.GER);
      mapData.setCountryColor({ modRoot: mod, gameRoot: null, tag: "GER", rgb: [200, 200, 200] });
      parsed = mapData.parseCountryColors(readColors(mod));
      ok("prefix: GER now changed", JSON.stringify(parsed.GER) === JSON.stringify([200, 200, 200]), parsed.GER);
      ok("prefix: GE unchanged by the GER edit", JSON.stringify(parsed.GE) === JSON.stringify([100, 100, 100]), parsed.GE);
    }

    // ── 5) Bad inputs are rejected cleanly (no throw, no write). ──
    {
      const mod = tmp("nova-col-bad-"); made.push(mod);
      ok("bad: empty tag rejected", mapData.setCountryColor({ modRoot: mod, tag: "", rgb: [1, 2, 3] }).changed === false);
      ok("bad: short rgb rejected", mapData.setCountryColor({ modRoot: mod, tag: "AAA", rgb: [1, 2] }).changed === false);
      ok("bad: no modRoot rejected", mapData.setCountryColor({ tag: "AAA", rgb: [1, 2, 3] }).changed === false);
      ok("bad: out-of-range clamps (300 → 255)", JSON.stringify(mapData.setCountryColor({ modRoot: mod, tag: "AAA", rgb: [300, -5, 128] }).rgb) === JSON.stringify([255, 0, 128]));
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\nMAP-COUNTRY-COLOR: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
