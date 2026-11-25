// A mod that replaces common/country_tags is judged by the tag files it loads, not by the base game's dynamic-tag marker.
// #the-dynamic-tag-marker-is-read-from-what-loads
//
// country_tag_after_dynamic_marker is FATAL ("crashes", map-rule-labels.js): common/country_tags is read in filename order, and
// every tag registered after zz_dynamic_countries.txt's `dynamic_tags = yes` is a civil-war tag the game builds no flag for.
// The rule found the marker by walking [modRoot, ...baseRootsFor(dependencyRoots, gameRoot, "common")]. Two blind spots, one
// line: baseRootsFor never honours the ACTIVE mod's replace_path (by design — its question is where to copy a file from), and it
// honours a dependency's only for the exact folder asked, so "common" matched no one's replace_path="common/country_tags". So the
// base game's zz_dynamic_countries.txt — a file such a mod does not load — still decided which of the mod's own files come after it.
//
// Measured on 30244fe (batch 8 probe-country-tags-replace-path.js): a mod declaring replace_path="common/country_tags" and shipping
// 00_mine.txt and zz_mine.txt was reported one tag "registered AFTER zz_dynamic_countries.txt" — the same answer as a plain mod that
// does load vanilla's marker. Old World Blues declares this replace_path. layersBelow asks what loads beneath the mod.
//
// Requests are the page's: GET /api/map/validate?modPath (the Map Errors popup), and the Save gate lifted out of public/map.js.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b8-country-tags-replace-path");
lib.write(world.GAME, {
  "common/country_tags/00_countries.txt": 'AAA = "countries/Aland.txt"\n',
  "common/country_tags/zz_dynamic_countries.txt": 'dynamic_tags = yes # any tags after this is used for temporary civil wars\nD01 = "countries/D01.txt"\n',
});
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");

const RULE = "country_tag_after_dynamic_marker";
const told = (v) => ((v && v.problems) || []).filter((p) => p.rule === RULE);

(async () => {
  let srv = null;
  try {
    rec("the rule is one Save stops for (the reason a false one matters)", labels.isFatalRule(RULE) === true);
    srv = await lib.startServer(createApp);

    console.log("\n1. ⭐⭐⭐ A mod that replaces common/country_tags and ships 00_mine.txt and zz_mine.txt");
    {
      const mod = world.mod("tags replace", {
        "descriptor.mod": 'name="tags replace"\nsupported_version="1.*"\nreplace_path="common/country_tags"\n',
        "common/country_tags/00_mine.txt": 'AAA = "countries/Aland.txt"\n',
        "common/country_tags/zz_mine.txt": 'BBB = "countries/Bee.txt"\n',
      });
      const v = await srv.validate(mod);
      rec("⭐⭐⭐ it is not told zz_mine.txt comes after a marker it does not load", told(v).length === 0, told(v).map((p) => p.message.slice(0, 160)));
      const g = await lib.saveGate(v);
      // The fixture has nothing else Save stops for (testlib-two-layer-map.js: only province_too_large, a warning), so any count is this rule.
      rec("⭐⭐ …and Save stops for nothing", g.crashes === 0, { status: g.status, fatal: (v.problems || []).filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule) });
    }

    console.log("\n2. CONTROL: a plain mod loads the base game's marker, so its zz_mine.txt is still reported");
    {
      const mod = world.mod("tags plain", { "common/country_tags/zz_mine.txt": 'BBB = "countries/Bee.txt"\n' });
      const v = await srv.validate(mod);
      rec("zz_mine.txt is reported", told(v).length === 1 && /zz_mine\.txt/.test(told(v)[0].message), told(v));
      rec("…and Save stops for it", (await lib.saveGate(v)).crashes >= 1);
    }

    console.log("\n3. CONTROL: a mod that replaces the folder and ships its OWN marker is judged by that marker");
    {
      const mod = world.mod("tags own marker", {
        "descriptor.mod": 'name="tags own marker"\nsupported_version="1.*"\nreplace_path="common/country_tags"\n',
        "common/country_tags/00_mine.txt": 'AAA = "countries/Aland.txt"\n',
        "common/country_tags/zz_dynamic_countries.txt": 'dynamic_tags = yes\nD01 = "countries/D01.txt"\n',
        "common/country_tags/zz_zmine.txt": 'BBB = "countries/Bee.txt"\n',
      });
      const v = await srv.validate(mod);
      rec("zz_zmine.txt, after the mod's own marker, is reported", told(v).length === 1 && /zz_zmine\.txt/.test(told(v)[0].message), told(v));
    }

    console.log("\n4. ⭐⭐ An add-on over a dependency that replaces common/country_tags");
    {
      world.mod("tags dep replace", {
        "descriptor.mod": 'name="tags dep replace"\nsupported_version="1.*"\nreplace_path="common/country_tags"\n',
        "common/country_tags/00_dep.txt": 'AAA = "countries/Aland.txt"\n',
      });
      const addon = world.mod("tags addon", { "common/country_tags/zz_zaddon.txt": 'BBB = "countries/Bee.txt"\n' }, ["tags dep replace"]);
      const v = await srv.validate(addon);
      rec("⭐⭐ the base game's marker is hidden by the dependency, so zz_zaddon.txt is not reported", told(v).length === 0, told(v).map((p) => p.message.slice(0, 160)));

      world.mod("tags dep plain", { "common/country_tags/00_dep.txt": 'AAA = "countries/Aland.txt"\n' });
      const addon2 = world.mod("tags addon two", { "common/country_tags/zz_zaddon.txt": 'BBB = "countries/Bee.txt"\n' }, ["tags dep plain"]);
      const v2 = await srv.validate(addon2);
      rec("CONTROL: over a dependency that does not replace the folder, the base game's marker loads and zz_zaddon.txt is reported", told(v2).length === 1, told(v2));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a mod that replaces country tags is judged by the tag files it loads: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
