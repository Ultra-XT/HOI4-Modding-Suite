// ⛔ #farmland-is-not-a-hoi4-terrain  +  #a-supply-hub-has-no-level-to-raise
//
// Two map tools offered the modder values the game has no meaning for, and wrote them.
//
// TERRAIN: the brush listed nine land terrains, one of which — "farmland" — appears NOWHERE in Hearts of
// Iron IV. Not in common/terrain/, not once in definition.csv's 13,282 provinces. Painting it put a terrain
// string into definition.csv that no terrain category matches.
//
// SUPPLY HUB: the Rails & supply panel offered levels 2-5 and wrote them into map/supply_nodes.txt. The
// wiki is explicit — "By default, supply nodes have the max level of 1, so this is limited to 1" — and all
// 727 vanilla rows are level 1, with `supply_node` appearing in ZERO state history files, so there is no
// other place the level could be stored. Railways ARE graded ("By default, this is no more than 5"), and
// one shared RAIL_LVL_MAX = 5 was being used for both.
//
// Both lists are DERIVED here from the installed game rather than typed, so a Paradox patch that adds a
// terrain fails this test instead of silently leaving the brush short.
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const DEF = path.join(GAME, "map", "definition.csv");
const NODES = path.join(GAME, "map", "supply_nodes.txt");
const RAILS = path.join(GAME, "map", "railways.txt");
const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");

const listInSource = (name) => {
  const m = new RegExp("const " + name + " = \\[([^\\]]*)\\]").exec(SRC);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
};

if (!fs.existsSync(DEF)) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  console.log("\n-- every terrain the brush offers must exist in the game --");
  {
    const used = new Map();
    for (const line of fs.readFileSync(DEF, "utf8").split(/\r?\n/)) {
      const c = line.split(";");
      if (c.length < 8) continue;
      const t = (c[6] || "").trim();
      if (t) used.set(t, (used.get(t) || 0) + 1);
    }
    // Water and the single "unknown" province are not paintable land terrain.
    const WATER = new Set(["ocean", "lakes", "unknown"]);
    const land = [...used.keys()].filter((t) => !WATER.has(t)).sort();
    // ⚠️ This asserted against a literal named LAND_TERRAINS. The brush now DERIVES its list from the mod's
    // own common/terrain (#terrain-brush-only-offers-vanillas-eight — Millennium Dawn's `supercity` and Old
    // World Blues' `radiation` were unpaintable), so the literal is the fallback for a model that has not
    // loaded, and it is what a vanilla-based mod resolves to. Both are still checked, and a third check
    // pins that the derivation happens at all — without it the literal could quietly become the only path
    // again and every assertion here would still pass.
    const offered = listInSource("VANILLA_LAND_TERRAINS");
    ok(offered && offered.length > 0, "the brush's vanilla fallback was found in public/map.js", offered);
    ok(used.size >= 10, `definition.csv uses ${used.size} distinct terrains`, [...used.entries()]);

    const invented = (offered || []).filter((t) => !used.has(t));
    ok(invented.length === 0, "no terrain is offered that the game never uses", { invented, gameUses: [...used.keys()] });
    ok(!(offered || []).includes("farmland"), "…specifically, farmland is gone");

    const missing = land.filter((t) => !(offered || []).includes(t));
    ok(missing.length === 0, "…and every land terrain the game DOES use is offered", { missing, offered });

    const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
    ok(/model\s*&&\s*model\.terrainCategories/.test(SRC),
      "…and the brush reads the MOD's terrain categories, not only that literal");
    ok(/!c\.water/.test(SRC),
      "…filtering out is_water, so `ocean` can never become a land brush");
  }

  console.log("\n-- a supply hub has exactly one level --");
  {
    const levels = new Set();
    for (const line of fs.readFileSync(NODES, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      levels.add(parseInt(t.split(/\s+/)[0], 10));
    }
    ok(levels.size === 1 && levels.has(1), "every vanilla supply node is level 1", [...levels]);

    const cap = /const SUPPLY_LVL_MAX = (\d+)/.exec(SRC);
    ok(!!cap, "public/map.js declares a supply-hub cap of its own", cap && cap[1]);
    ok(cap && parseInt(cap[1], 10) === 1, "…and it is 1, as the wiki and the game agree", cap && cap[1]);

    // ⭐ The bug was that ONE constant served both. Assert the supply path no longer reaches the rail cap.
    const fn = (() => {
      const a = SRC.indexOf("function changeSupplyLevel(");
      if (a < 0) return "";
      const end = SRC.indexOf("\n  }", a);
      return end < 0 ? "" : SRC.slice(a, end);
    })();
    ok(fn.length > 0, "changeSupplyLevel was found", fn.length);
    ok(/SUPPLY_LVL_MAX/.test(fn), "…and it clamps with the supply cap");
    ok(!/RAIL_LVL_MAX/.test(fn), "…not the railway cap, which is a different number for a different thing");
  }

  console.log("\n-- …but a railway really is graded, up to the MAX_RAILWAY_LEVEL the mod gives --");
  {
    const levels = new Set();
    for (const line of fs.readFileSync(RAILS, "utf8").split(/\r?\n/)) {
      const t = line.replace(/#.*/, "").trim();   // (a # starts a comment, as the game reads the file: the base game ships a commented-out row, line 883, since its 2026-11-20 update)
      if (!t) continue;
      levels.add(parseInt(t.split(/\s+/)[0], 10));
    }
    const max = Math.max(...levels);
    ok(max >= 2, `vanilla ships railway levels ${[...levels].sort().join(",")} — they are genuinely graded`, [...levels]);
    // ⛔ #a-railway-level-cap-is-the-mods (B4-8) — 5 is the BASE GAME'S define, not a rule: Millennium Dawn sets
    // NDefines.NSupply.MAX_RAILWAY_LEVEL = 6 and the page stopped ▴ at 5. The cap is the mod's effective define, handed to the page in
    // the map model (maxRailwayLevel); RAIL_LVL_MAX is only the fallback when the model does not say, and must be the base game's own.
    const cap = /const RAIL_LVL_MAX = (\d+)/.exec(SRC);
    const DEFINES = path.join(GAME, "common", "defines", "00_defines.lua");
    const vanillaMax = (() => { try { const m = /MAX_RAILWAY_LEVEL\s*=\s*(\d+)/.exec(fs.readFileSync(DEFINES, "utf8")); return m ? parseInt(m[1], 10) : null; } catch (_) { return null; } })();
    ok(cap && vanillaMax != null && parseInt(cap[1], 10) === vanillaMax,
      `the fallback cap is the base game's own MAX_RAILWAY_LEVEL (${vanillaMax})`, { fallback: cap && cap[1], vanillaMax });
    ok(max <= (vanillaMax || 5), "…and nothing vanilla ships exceeds it", max);
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const M = maskJsComments(SRC.replace(/\r\n/g, "\n"));
    const fnAt = M.indexOf("function changeRailwayLevel(");
    const fnText = fnAt < 0 ? "" : M.slice(fnAt, M.indexOf("\n  }\n", fnAt));
    ok(/railLevelCap\(\)/.test(fnText) && !/Math\.min\(RAIL_LVL_MAX/.test(fnText), "⭐ changeRailwayLevel caps at railLevelCap(), not the constant", fnText.slice(0, 300));
    const capAt = M.indexOf("function railLevelCap()");
    ok(capAt > 0 && /model\.maxRailwayLevel/.test(M.slice(capAt, M.indexOf("\n", capAt))), "⭐ …which is the model's maxRailwayLevel, the constant only when it is missing");
    // …and the page's own function, run, in both shapes of the model
    const P = require("./testlib-map-page.js");
    const run = (maxRailwayLevel, level, delta) => {
      const model = { railways: [{ level, provinces: [1, 2] }] };
      if (maxRailwayLevel != null) model.maxRailwayLevel = maxRailwayLevel;
      const pg = P.runPage([["function railLevelCap()", "\n"], "function changeRailwayLevel(idx, delta)", ["const RAIL_LVL_MAX = ", "\n"]],P.loadGlobals({ model, pushUndo: () => {}, queueWrite: (url, body) => pg.sb.queued.push(body), queued: [], renderRailPanel: () => {}, draw: () => {} }));
      pg.sb.changeRailwayLevel(0, delta);
      return { level: model.railways[0].level, queued: pg.sb.queued, said: String(pg.statuses[pg.statuses.length - 1] || "") };
    };
    const md = run(6, 5, +1);
    ok(md.level === 6 && md.queued.length === 1 && md.queued[0].to === 6, "⭐⭐ with the mod's define at 6, ▴ takes a level-5 line to 6", md);
    const mdTop = run(6, 6, +1);
    ok(mdTop.level === 6 && !mdTop.queued.length && /maximum level \(6, the most this mod's NDefines\.NSupply\.MAX_RAILWAY_LEVEL allows\)/.test(mdTop.said), "⭐ …and stops there, naming the mod's own maximum", mdTop);
    const old = run(undefined, 5, +1);
    ok(old.level === 5 && !old.queued.length && /maximum level \(5, the base game's/.test(old.said), "⭐ a model that does not say keeps the base game's 5", old);
    const above = run(6, 7, +1);
    ok(above.level === 7 && !above.queued.length, "⭐⭐ ▴ never LOWERS a line already above the cap (min(cap, level + 1) made a 7 a 6)", above);
    const down = run(6, 7, -1);
    ok(down.level === 6 && down.queued.length === 1, "…while ▾ still takes it down one", down);
    // the model's half: buildMapModel answers the effective define (the rule railway_level_out_of_range reads the same one)
    const MDS = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r\n/g, "\n"));
    const bm = MDS.slice(MDS.indexOf("function buildMapModel("), MDS.indexOf("\nfunction ", MDS.indexOf("function buildMapModel(") + 10));
    ok((/const maxRailwayLevel = readEffectiveDefineNumber\(\{ modRoot, gameRoot, dependencyRoots: deps \}, "MAX_RAILWAY_LEVEL", 5\);/.test(bm) && /\breturn \{[^}]*\bmaxRailwayLevel\b/.test(bm))
      || /\bmodel\.maxRailwayLevel = readEffectiveDefineNumber\(\{ modRoot, gameRoot, dependencyRoots: deps \}, "MAX_RAILWAY_LEVEL", 5\);/.test(bm), "⭐ buildMapModel answers maxRailwayLevel, read by readEffectiveDefineNumber (5 when nothing sets it)");
    // …and the reader it calls, run (it is not exported, so it is lifted out of map-data.js): a mod's own define file wins over the
    // base game's, and a mod that sets nothing reads the base game's number.
    const os = require("os");
    const vm = require("vm");
    const MDRAW = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r\n/g, "\n");
    const rdAt = MDS.indexOf("function readEffectiveDefineNumber(");
    const rdEnd = MDS.indexOf("\n}\n", rdAt);
    ok(rdAt > 0 && rdEnd > rdAt, "readEffectiveDefineNumber was found in map-data.js", { rdAt, rdEnd });
    const sbx = { fs, path, samePath: (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(), readReplacePaths: () => new Set() };
    vm.createContext(sbx);
    vm.runInContext(MDRAW.slice(rdAt, rdEnd + 2) + "\nglobalThis.readEffectiveDefineNumber = readEffectiveDefineNumber;", sbx);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-cap-"));
    try {
      ok(sbx.readEffectiveDefineNumber({ modRoot: tmp, gameRoot: GAME, dependencyRoots: [] }, "MAX_RAILWAY_LEVEL", 5) === vanillaMax, "a mod that sets nothing reads the base game's own MAX_RAILWAY_LEVEL", vanillaMax);
      fs.mkdirSync(path.join(tmp, "common", "defines"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "common", "defines", "zz_mod_defines.lua"), "NDefines.NSupply.MAX_RAILWAY_LEVEL = 6\n");
      ok(sbx.readEffectiveDefineNumber({ modRoot: tmp, gameRoot: GAME, dependencyRoots: [] }, "MAX_RAILWAY_LEVEL", 5) === 6, "…and a mod's own define file wins over it (Millennium Dawn's shape)", 6);
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  }

  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
