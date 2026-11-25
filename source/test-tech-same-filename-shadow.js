// #tech-catalog-ignores-same-filename — HOI4 REPLACES A common/ FILE WHOLESALE AT THE SAME PATH.
//
// Found by the dependency-axis hunt, then reproduced by hand before it was believed.
//
// `collectAllTechnologiesUncached` walked every root's `common/technologies` and merged by tech id, never
// asking which root last ships each BASENAME. So a mod shipping its own `infantry.txt` — which in the game
// replaces vanilla's outright — was still offered all of vanilla's infantry techs on top of its own.
//
// server.js already knew the rule in two other places and contradicted itself here. The equipment collector
// prunes by basename under `#equip-same-filename`, and the technology WRITER refuses to create such a shadow
// at all (`nonShadowingFileName`, `#tech-file-shadows-base`) because "the mod would ship ONE tech where the
// original defined 89". The reader disagreed with both.
//
// Measured, two mods identical but for the filename they ship:
//
//                        techs   vanilla infantry ids offered   equipment
//   control zz_mine.txt    553              87/87                  471
//   shadow  infantry.txt   553 (!)          87/87 (!)              466   <- equipment already correct
//   shadow, after the fix  464               0/87                  466
//
// The equipment column is the control that proves the construction is right: the same experiment run against
// the sibling collector always behaved, so the difference is the tech collector, not the fixture.
//
// The vanilla scan is cached across mods, which is why the ordering checks below exist: a mod that shadows a
// vanilla filename must not poison that cache for the next mod that does not.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shadow-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const VTECH = path.join(VANILLA, "common", "technologies", "infantry.txt");

let seq = 0;
function mkMod(techFileName) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.mkdirSync(path.join(dir, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "technologies", techFileName),
    "technologies = {\n\tnua_only_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t}\n}\n", "utf8");
  fs.writeFileSync(path.join(dir, "common", "units", "equipment", techFileName),
    "equipments = {\n\tnua_only_equip = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\ttype = armor\n\t}\n}\n", "utf8");
  return dir;
}
// The top-level ids vanilla's infantry.txt defines — read, not assumed.
function vanillaInfantryIds() {
  if (!fs.existsSync(VTECH)) return [];
  const t = fs.readFileSync(VTECH, "utf8").replace(/#.*$/gm, "");
  const m = /(?:^|\n)\s*technologies\s*=\s*\{/.exec(t);
  if (!m) return [];
  let d = 0, o = t.indexOf("{", m.index), c = -1;
  for (let i = o; i < t.length; i++) {
    if (t[i] === "{") d++;
    else if (t[i] === "}") { d--; if (!d) { c = i; break; } }
  }
  const inner = t.slice(o + 1, c);
  const ids = [];
  const re = /(?:^|\n)\t([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g;
  let x;
  while ((x = re.exec(inner)) !== null) ids.push(x[1]);
  return ids;
}

let PORT = 47900;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(VTECH)) {
      console.log("  --   vanilla not installed; this test measures against its infantry.txt. Skipping.");
      console.log("\n=== tech same-filename shadow: skipped ===");
      return;
    }
    const ids = vanillaInfantryIds();
    console.log("\n[ground truth]");
    rec("vanilla's infantry.txt defines a substantial number of techs", ids.length >= 50, ids.length);
    console.log(`  --   ${ids.length} top-level ids, e.g. ${ids.slice(0, 3).join(", ")}`);

    api = await serve(createApp());
    const measure = async (dir) => {
      const tc = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(dir)}`);
      const techs = (tc.b.technologies || tc.b.techs || []);
      const eq = await api.get(`/api/equipment/list?modPath=${encodeURIComponent(dir)}`);
      const eqRows = (eq.b.equipment || eq.b.items || eq.b.list || []);
      return {
        techs: techs.length,
        offered: ids.filter((id) => techs.some((t) => t.id === id)).length,
        own: techs.some((t) => t.id === "nua_only_tech"),
        equipment: eqRows.length,
      };
    };

    console.log("\n[a file that does NOT shadow] leaves the base content alone");
    const control = mkMod("zz_mine.txt");
    const c = await measure(control);
    rec("the base techs are offered", c.offered === ids.length, c);
    rec("…and the mod's own is too", c.own === true, c);
    console.log(`  --   control: ${c.techs} techs, ${c.offered}/${ids.length} vanilla infantry ids, ${c.equipment} equipment`);

    console.log("\n[a file that DOES shadow] replaces it, as the game does");
    const shadow = mkMod("infantry.txt");
    const sh = await measure(shadow);
    rec("none of the replaced file's techs are offered", sh.offered === 0, sh);
    rec("…the mod's own tech still is", sh.own === true, sh);
    rec("…and the catalogue really shrank by about that file's worth",
      c.techs - sh.techs >= ids.length, { control: c.techs, shadow: sh.techs, ids: ids.length });
    console.log(`  --   shadow:  ${sh.techs} techs, ${sh.offered}/${ids.length} vanilla infantry ids, ${sh.equipment} equipment`);

    console.log("\n[the sibling collector] behaved correctly all along — the control for the whole construction");
    rec("equipment drops when its filename is shadowed", sh.equipment < c.equipment, { control: c.equipment, shadow: sh.equipment });

    console.log("\n[the vanilla cache] must not be poisoned by whichever mod is read first");
    const again = await measure(control);
    rec("a non-shadowing mod read AFTER a shadowing one still sees the base techs",
      again.offered === ids.length && again.techs === c.techs, { first: c, again });
    const shAgain = await measure(shadow);
    rec("…and the shadowing mod still sees none of them", shAgain.offered === 0 && shAgain.techs === sh.techs,
      { first: sh, again: shAgain });
    api.stop(); api = null;

    console.log("\n[the source] the reader now agrees with the writer and with the equipment sibling");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the tech collector keeps a basename owner map", /techFileOwner = new Map\(\)/.test(SRV), "no map");
      rec("…and reads only the files a root still owns",
        /techFileOwner\.get\(String\(f\)\.toLowerCase\(\)\) === rootIdx/.test(SRV), "no filter");
      // ⚠️ MOVED 2026-11-04 — #the-game-folder-moved-by-itself (reviews P-P1, S-S1). This pinned the TEXT `cachedVanillaTechs &&
      // !_vanillaShadowed`; the reuse now also asks that the cache was read from the game folder in use (`cachedVanillaTechsRoot
      // === gameRoot`, between the two), which is right and read as "cache reused blindly". What this guards is that a shadowed
      // vanilla is never served from the shared cache, so it finds the reuse by what it does (the `if` whose body copies
      // cachedVanillaTechs' entries out), in code with the comments masked, and asks its condition for that conjunct.
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const reuseCondition = (code) =>
        ((code.match(/if\s*\(([^{]*)\)\s*\{\s*for\s*\(\s*const\s*\[\s*\w+\s*,\s*\w+\s*\]\s*of\s*cachedVanillaTechs\.entries\(\)\s*\)/) || [])[1] || "");
      const refusesShadowed = (code) => reuseCondition(code).split("&&").map((s) => s.trim()).includes("!_vanillaShadowed");
      const CODE = maskJsComments(SRV);
      rec("…and refuses to reuse the shared vanilla cache when vanilla is shadowed", refusesShadowed(CODE),
        reuseCondition(CODE) ? { condition: reuseCondition(CODE).trim() } : "cache reused blindly (no reuse of cachedVanillaTechs found)");
      rec("CONTROL: a reuse without that conjunct, or no reuse found, is not taken for one that refuses",
        refusesShadowed("if (cachedVanillaTechs && !_vanillaShadowed) {\n  for (const [k, v] of cachedVanillaTechs.entries()) {}")
        && !refusesShadowed("if (cachedVanillaTechs && cachedVanillaTechsRoot === gameRoot) {\n  for (const [k, v] of cachedVanillaTechs.entries()) {}")
        && !refusesShadowed(""));
      rec("the equipment sibling it was ported from is still there",
        /#equip-same-filename/.test(SRV), "sibling comment gone");
    }

    console.log(`\n=== tech same-filename shadow: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
