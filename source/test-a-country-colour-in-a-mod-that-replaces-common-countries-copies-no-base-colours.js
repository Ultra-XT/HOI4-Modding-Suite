// Setting a country's colour in a mod that replaces common/countries copies no base colours into it.
// #a-colour-seed-reads-what-loads-beneath-the-mod
//
// THE DEFECT. colors.txt is one file, so a mod's copy replaces the base's wholesale, and setCountryColor seeds a mod that has no
// colors.txt of its own from the one beneath it, so every other country keeps its colour. It found "the one beneath" with
// baseRootsFor, which honours a DEPENDENCY's replace_path and — by design, its question being where to copy a file from — not the
// ACTIVE mod's. A mod declaring replace_path="common/countries" loads no base colors.txt at all, so one colour pick copied the base
// game's whole colours file in: every tag in it suddenly had a colour in the mod's game that it did not have before. The same
// blind spot batch 8 closed in closeStateIdGaps, baseStateIdsByFile, the country_tags marker and findCountryHistoryFiles by adopting
// layersBelow, which answers "what actually loads beneath this mod".
//
// THE EVIDENCE (batch 8 renumber, deferred item D-colors, probe-colors-replace-path.js on 65978a2): a replace_path="common/countries"
// mod setting BBB's colour got GER and ENG copied in (seededBaseColors: true), exactly as a plain mod does.
//
// JUDGED BY WHAT LOADS: GET /api/map/model?modPath's countryColors honours replace_path (buildMapModel's effectiveLayers), so a
// colour pick must leave every OTHER tag's loaded colour as it was. The request is the page's: the 🎨 picker queues
// /api/map/set-country-color { tag, rgb } and flushMapSaves posts it with modPath added.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-colors");
const GAME_COLORS = "GER = {\n\tcolor = rgb { 90 100 90 }\n\tcolor_ui = rgb { 150 160 150 }\n}\nENG = {\n\tcolor = rgb { 200 30 30 }\n\tcolor_ui = rgb { 220 60 60 }\n}\n";
const DEP_COLORS = "XXX = {\n\tcolor = rgb { 7 70 170 }\n\tcolor_ui = rgb { 17 80 180 }\n}\n";
lib.write(world.GAME, { "common/countries/colors.txt": GAME_COLORS });
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const REPLACES = 'replace_path="common/countries"\n';
const colorsFile = (mod) => path.join(mod, "common", "countries", "colors.txt");
const tagsIn = (mod) => { try { return Object.keys(md.parseCountryColors(fs.readFileSync(colorsFile(mod), "utf8"))).sort(); } catch (_) { return null; } };
const others = (colors, tag) => JSON.stringify(Object.keys(colors || {}).filter((t) => t !== tag).sort().map((t) => [t, colors[t]]));

(async () => {
  let srv = null;
  try {
    console.log("0. The page's request");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("the 🎨 picker queues /api/map/set-country-color { tag, rgb }", /queueWrite\("\/api\/map\/set-country-color", \{ tag, rgb \}/.test(MAP));
    }

    srv = await lib.startServer(createApp);
    const colorsLoaded = async (mod) => ((await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json())).countryColors) || {};
    /** Pick BBB's colour the way the page does, and report what changed. */
    const pick = async (mod) => {
      const before = await colorsLoaded(mod);
      const r = await srv.post("/api/map/set-country-color", { tag: "BBB", rgb: [1, 2, 3] }, mod);
      const after = await colorsLoaded(mod);
      return { r, before, after, file: tagsIn(mod) };
    };

    console.log("\n1. CONTROL: a plain mod over the base game");
    {
      const p = await pick(world.mod("colors plain", {}));
      rec("the write answers ok", p.r.status === 200 && p.r.body.ok === true, p.r.body);
      rec("it seeds the mod's colors.txt from the base game's", p.r.body.seededBaseColors === true && JSON.stringify(p.file) === JSON.stringify(["BBB", "ENG", "GER"]), { seeded: p.r.body.seededBaseColors, file: p.file });
      rec("⭐ …so every other tag loads the colour it loaded before", others(p.before, "BBB") === others(p.after, "BBB") && Object.keys(p.before).length >= 2, { before: others(p.before, "BBB"), after: others(p.after, "BBB") });
      rec("…and BBB loads its new colour", JSON.stringify(p.after.BBB) === "[1,2,3]", p.after.BBB);
    }

    console.log("\n2. ⭐⭐⭐ A mod that declares replace_path=\"common/countries\"");
    {
      const mod = world.mod("colors replace", { "descriptor.mod": `name="colors replace"\nsupported_version="1.*"\n${REPLACES}` });
      const p = await pick(mod);
      rec("CONTROL: before the pick it loads none of the base game's colours", !p.before.GER && !p.before.ENG, p.before);
      rec("the write answers ok", p.r.status === 200 && p.r.body.ok === true, p.r.body);
      rec("⭐⭐⭐ the mod's colors.txt holds BBB alone — nothing copied from a file the mod does not load", JSON.stringify(p.file) === JSON.stringify(["BBB"]), p.file);
      rec("⭐⭐ …and the response does not say it seeded from the base", p.r.body.seededBaseColors === false, p.r.body);
      rec("⭐⭐⭐ every other tag loads the colour it loaded before", others(p.before, "BBB") === others(p.after, "BBB"), { before: others(p.before, "BBB"), after: others(p.after, "BBB") });
      rec("…and BBB loads its new colour", JSON.stringify(p.after.BBB) === "[1,2,3]", p.after.BBB);
    }

    console.log("\n3. ⭐⭐ An add-on that replaces common/countries, over a dependency that ships colors.txt");
    {
      world.mod("colors dep plain", { "common/countries/colors.txt": DEP_COLORS });
      const addon = world.mod("colors addon replaces", { "descriptor.mod": `name="colors addon replaces"\nsupported_version="1.*"\ndependencies={\n\t"colors dep plain"\n}\n${REPLACES}` });
      const p = await pick(addon);
      rec("the write answers ok", p.r.status === 200 && p.r.body.ok === true, p.r.body);
      rec("⭐⭐⭐ nothing is copied from the dependency's colors.txt or the base game's", JSON.stringify(p.file) === JSON.stringify(["BBB"]), p.file);
      rec("⭐⭐ every other tag loads the colour it loaded before", others(p.before, "BBB") === others(p.after, "BBB"), { before: others(p.before, "BBB"), after: others(p.after, "BBB") });
    }

    console.log("\n4. CONTROL: an add-on over a dependency that replaces common/countries seeds from the dependency");
    {
      world.mod("colors dep replaces", { "descriptor.mod": `name="colors dep replaces"\nsupported_version="1.*"\n${REPLACES}`, "common/countries/colors.txt": DEP_COLORS });
      const p = await pick(world.mod("colors addon over replacing dep", {}, ["colors dep replaces"]));
      rec("the write answers ok and says it seeded", p.r.status === 200 && p.r.body.seededBaseColors === true, p.r.body);
      rec("⭐ it copies the dependency's colours, not the base game's", JSON.stringify(p.file) === JSON.stringify(["BBB", "XXX"]), p.file);
      rec("…so every other tag loads the colour it loaded before", others(p.before, "BBB") === others(p.after, "BBB"), { before: others(p.before, "BBB"), after: others(p.after, "BBB") });
    }

    console.log("\n5. CONTROL: an add-on over a plain dependency that ships colors.txt seeds from the dependency");
    {
      const p = await pick(world.mod("colors addon over plain dep", {}, ["colors dep plain"]));
      rec("the write answers ok and says it seeded", p.r.status === 200 && p.r.body.seededBaseColors === true, p.r.body);
      rec("⭐ it copies the dependency's file, which replaces the base game's of the same name", JSON.stringify(p.file) === JSON.stringify(["BBB", "XXX"]), p.file);
      rec("…so every other tag loads the colour it loaded before", others(p.before, "BBB") === others(p.after, "BBB"), { before: others(p.before, "BBB"), after: others(p.after, "BBB") });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a country colour in a mod that replaces common/countries copies no base colours: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
