// Regression (bug-hunt #9): three confirmed fixes.
//  (1) [HIGH] getSpriteTextureMapAsync's mod cache-hit + (2) [MED] getDependencySpriteMap's cache-hit both
//      loaded the sprite map WITHOUT restoreSpriteNames(cached.names) — unlike their sync/static siblings. On
//      a WARM-cache launch (the steady state) spriteOriginalCaseMap stayed empty, so a sprite authored
//      GFX_idea_ARG_test was served to the picker lowercased (GFX_idea_arg_test) and rendered "?" in-game
//      (HOI4 sprite lookup is case-sensitive). Both now restore names on the cache hit; dep also persists them.
//  (3) [HIGH] The duplicate_id validator only grouped focus/idea/event — decision/tech/equipment duplicates
//      (silent last-wins data loss in HOI4) went unreported. Now covered (decisions scoped by category+id so
//      a legal same-id-different-category pair isn't a false alarm; continuous_focus stays excluded).
// Run: node test-hunt9-fixes.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const S = require("./server.js");
const mi = require("./mod-index.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

(async () => {
  try {
    // ══ (1)+(2) SPRITE original-case restore on a warm-cache (simulated restart) ══
    {
      const dep = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depsprite-"));
      fs.mkdirSync(path.join(dep, "interface"), { recursive: true });
      fs.writeFileSync(path.join(dep, "interface", "custom.gfx"),
        `spriteTypes = {\n\tspriteType = {\n\t\tname = "GFX_idea_ARG_test"\n\t\ttexturefile = "test.dds"\n\t}\n}\n`);
      // resolveTexturefilePath needs the texture to exist — place it where both the owner-root and
      // relative-to-gfx resolution strategies look.
      fs.writeFileSync(path.join(dep, "test.dds"), "DDS");
      fs.writeFileSync(path.join(dep, "interface", "test.dds"), "DDS");

      const clearCaches = () => {
        S._depSpriteMapCache.clear();                                   // force re-read (in-memory else short-circuits)
        for (const k of Object.keys(S.spriteOriginalCaseMap)) delete S.spriteOriginalCaseMap[k]; // simulate a fresh process
      };

      // Cold: fresh parse populates the case map AND persists {map, names} to the disk cache.
      clearCaches();
      const m1 = S.getDependencySpriteMap([dep], false);
      ok("dep sprite parsed (lowercase key present in map)", !!(m1 && m1["gfx_idea_arg_test"]), Object.keys(m1 || {}));
      ok("cold parse populates original-case name", S.spriteOriginalCaseMap["gfx_idea_arg_test"] === "GFX_idea_ARG_test", S.spriteOriginalCaseMap["gfx_idea_arg_test"]);

      // Warm/restart: clear in-memory (case map + dep cache) but KEEP the disk cache → cache-hit path runs.
      clearCaches();
      const m2 = S.getDependencySpriteMap([dep], false);
      ok("warm cache-hit still returns the map", !!(m2 && m2["gfx_idea_arg_test"]), Object.keys(m2 || {}));
      ok("warm cache-hit RESTORES original-case name (was lost → '?')", S.spriteOriginalCaseMap["gfx_idea_arg_test"] === "GFX_idea_ARG_test", S.spriteOriginalCaseMap["gfx_idea_arg_test"]);

      try { fs.rmSync(dep, { recursive: true, force: true }); } catch (_) {}
    }

    // ══ (3) VALIDATOR now flags duplicate decision / tech / equipment ids ══
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupval-"));
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="DupVal"\n');
      const w = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
      // same decision id twice in ONE category (real dup) + the SAME id in a DIFFERENT category (legal, must NOT flag)
      w("common/decisions/x.txt",
        `cat_a = {\n\tdup_dec = { cost = 10 }\n\tdup_dec = { cost = 20 }\n\tuniq_dec = { cost = 5 }\n}\ncat_b = {\n\tdup_dec = { cost = 30 }\n}\n`);
      w("common/technologies/x.txt",
        `technologies = {\n\tdup_tech = { start_year = 1936 }\n\tdup_tech = { start_year = 1940 }\n\tuniq_tech = { start_year = 1936 }\n}\n`);
      w("common/units/equipment/x.txt",
        `equipments = {\n\tdup_eq = { year = 1936 }\n\tdup_eq = { year = 1940 }\n\tuniq_eq = { year = 1936 }\n}\n`);

      const res = await mi.buildModIndex(mod);
      const dups = ((res && res.problems) || []).filter(p => p && p.rule === "duplicate_id");
      const flagged = (type, id) => dups.some(d => d.entityType === type && d.entityId === id);
      ok("duplicate DECISION id (same category) flagged", flagged("decision", "dup_dec"), dups.map(d => d.entityType + ":" + d.entityId));
      ok("duplicate TECH id flagged", flagged("tech", "dup_tech"), dups.map(d => d.entityType + ":" + d.entityId));
      ok("duplicate EQUIPMENT id flagged", flagged("equipment", "dup_eq"), dups.map(d => d.entityType + ":" + d.entityId));
      ok("unique decision NOT flagged", !flagged("decision", "uniq_dec"));
      ok("unique tech NOT flagged", !flagged("tech", "uniq_tech"));
      ok("unique equipment NOT flagged", !flagged("equipment", "uniq_eq"));
      // cross-category same id must be reported ONLY within cat_a, not merged with cat_b's one.
      // #duplicate-id-counted-once-per-copy — this asserted `length === 2`, one row per COPY. A duplicated id
      // is now ONE row carrying `copies`, so the count this guards moved from the number of rows to the
      // number of definitions the row claims: still 2 (cat_a's pair), never 3 (which is what merging cat_b in
      // would produce). Checking `copies` tests the real thing more directly than counting rows ever did.
      const decDupEntries = dups.filter(d => d.entityType === "decision" && d.entityId === "dup_dec");
      ok("cross-category same-id decision NOT crying wolf (one row, for cat_a only)", decDupEntries.length === 1, decDupEntries.length);
      ok("...and that row counts cat_a's 2 definitions, not cat_b's as well", decDupEntries[0] && decDupEntries[0].copies === 2, decDupEntries[0] && decDupEntries[0].copies);

      try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    }
  } catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
  console.log(`\nHUNT9-FIXES: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
