// Regression (bug-hunt #20 — deep-sweep workflow, dep/asset finder + git archaeology): the dependency
// sprite-map cache lost original-case sprite names on a warm launch AFTER a Nova upgrade. Bug-hunt #9
// (5636fd3) added the `names` field to this cache's WRITE and a restoreSpriteNames(cached.names) to the READ,
// but did NOT bump the cache version `depspritemap-v1`. So a cache file written by a PRE-#9 Nova (schema
// {fingerprint, map} — no names) still matched (same version prefix + unchanged dependency gfx mtimes),
// hit, and called restoreSpriteNames(undefined) → spriteOriginalCaseMap stayed empty → add-on idea/focus
// icons served lowercased → "?" in-game (HOI4 sprite lookup is case-sensitive). The MOD sprite map was NOT
// affected — its write always persisted `names`. Two-part fix: (a) bump depspritemap-v1 -> v2 (proactively
// busts every stale pre-#9 dep cache, mirroring the static map's version discipline); (b) require
// cached.names for a cache HIT, so ANY names-less cache regenerates instead of being trusted.
// Run: node test-dep-sprite-cache-v2.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

// (1) SOURCE assertion: the version is bumped (catches a straight revert of the fix).
{
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const fn = src.slice(src.indexOf("function getDependencySpriteMap"), src.indexOf("function getDependencySpriteMap") + 3000);
  ok("dep cache version bumped to depspritemap-v2", fn.includes("depspritemap-v2|"), "not found");
  ok("old depspritemap-v1 no longer present in the fn", !fn.includes("depspritemap-v1|"), "still v1");
  ok("cache HIT now requires cached.names", /cached\.map\s*&&\s*cached\.names/.test(fn), "no names guard");
}

const dep = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depv2-"));
fs.mkdirSync(path.join(dep, "interface"), { recursive: true });
fs.writeFileSync(path.join(dep, "interface", "custom.gfx"),
  `spriteTypes = {\n\tspriteType = {\n\t\tname = "GFX_idea_ARG_test"\n\t\ttexturefile = "test.dds"\n\t}\n}\n`);
fs.writeFileSync(path.join(dep, "test.dds"), "DDS");
fs.writeFileSync(path.join(dep, "interface", "test.dds"), "DDS");

// the on-disk cache path is deterministic: sha1 of `${includeDlcs}|${depRoots.join("|")}`
const depKey = `false|${dep}`;
const cachePath = path.join(S.ICON_CACHE_DIR, `spritemap_dep_${crypto.createHash("sha1").update(depKey).digest("hex")}.json`);

const clearMem = () => {
  S._depSpriteMapCache.clear();
  for (const k of Object.keys(S.spriteOriginalCaseMap)) delete S.spriteOriginalCaseMap[k];
};

try {
  // Cold: fresh parse writes the real v2 cache (with names) + populates the case map.
  clearMem();
  const m1 = S.getDependencySpriteMap([dep], false);
  ok("cold parse maps the sprite (lowercase key)", !!(m1 && m1["gfx_idea_arg_test"]), Object.keys(m1 || {}));
  ok("cold parse populates original-case name", S.spriteOriginalCaseMap["gfx_idea_arg_test"] === "GFX_idea_ARG_test", S.spriteOriginalCaseMap["gfx_idea_arg_test"]);
  ok("v2 cache file written to disk", fs.existsSync(cachePath), cachePath);
  const cachedObj = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  ok("v2 cache file carries the names field", cachedObj && cachedObj.names && typeof cachedObj.names === "object", cachedObj && Object.keys(cachedObj));

  // Warm (normal upgrade path — cache has names): still restores names on the hit.
  clearMem();
  S.getDependencySpriteMap([dep], false);
  ok("warm v2 cache-hit restores original-case name", S.spriteOriginalCaseMap["gfx_idea_arg_test"] === "GFX_idea_ARG_test", S.spriteOriginalCaseMap["gfx_idea_arg_test"]);

  // THE FIX: simulate a PRE-#9 cache — same fingerprint + map, but the `names` field STRIPPED. The old code
  // would HIT this (fingerprint+map present) and restore undefined names → empty case map → "?" icons. The
  // guard now requires cached.names, so it MISSES → re-parses → repopulates the case map.
  const stale = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  delete stale.names;                                   // pre-#9 schema: {fingerprint, map} only
  fs.writeFileSync(cachePath, JSON.stringify(stale));
  clearMem();
  const m3 = S.getDependencySpriteMap([dep], false);
  ok("names-less (pre-#9) cache still returns a usable map", !!(m3 && m3["gfx_idea_arg_test"]), Object.keys(m3 || {}));
  ok("names-less cache is NOT trusted → case map REPOPULATED (was the '?' bug)", S.spriteOriginalCaseMap["gfx_idea_arg_test"] === "GFX_idea_ARG_test", S.spriteOriginalCaseMap["gfx_idea_arg_test"]);
  // and the cache file was rewritten WITH names, so the next launch is clean
  const healed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  ok("cache self-heals: names rewritten to disk", healed && healed.names && healed.names["gfx_idea_arg_test"] === "GFX_idea_ARG_test", healed && healed.names);
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
finally {
  try { fs.rmSync(dep, { recursive: true, force: true }); } catch (_) {}
  try { if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch (_) {}
  console.log(`\nDEP-SPRITE-CACHE-V2: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
