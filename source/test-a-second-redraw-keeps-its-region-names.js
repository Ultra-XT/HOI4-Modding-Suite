// A second 🗺 Redraw regions on a mod that owns its region layout keeps every region's name.
// ⛔ #a-second-redraw-keeps-its-names (B3-2)
//
// THE DEFECT (campaign B3-2, repro-B3-2.js on The Road to 56, 2026-11-10). Every shipping map mod declares
// replace_path="map/strategicregions", so nothing beneath it ships a region and map-data.js regionRebuildBase plans over the
// mod's OWN layout. After the first redraw that layout is the redraw's own: region 1 holds the old Komi-Nenetsia and is named
// "Komi-Nenetsia 2", in a file still called "1-Southern England.txt". server.js regionNamePlan named a base region by the layers'
// name only when no line of Nova's own names file gave it one, so it fell back to the FILE's name: the second press's dialog said
// "1,450 region names Nova wrote are out of date — a state they are named after was renamed, or a language missed a write"
// (neither had happened) and its write renamed 145 regions, region 1 to "Southern England". Now, over the mod's own layout, a
// base region goes by the name it has; beneath the mod nothing changed.
//
// Driven through /api/map/rebuild-regions with the bodies public/map.js sends: { modPath, confirm: true } (#mapRedrawConfirmBtn)
// and { modPath, dryRun: true } (#mapRedrawRegions).
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};

// the mod that owns its layout (Road to 56's shape): its own copy of the region files and the replace_path line
const W = makeRegionWorld("second-redraw-names");
// …and the world the regions load beneath, as before (the control): no replace_path, the base game's regions below
const V = makeRegionWorld("second-redraw-names-below");
process.env.HOI4_ROOT = W.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(W.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
{
  const from = path.join(W.GAME, "map", "strategicregions"), to = path.join(W.MOD, "map", "strategicregions");
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
  const d = path.join(W.MOD, "descriptor.mod");
  fs.writeFileSync(d, fs.readFileSync(d, "utf8").replace(/\s*$/, "\n") + 'replace_path="map/strategicregions"\n');
}

const NAMES = (mod) => path.join(mod, "localisation", "english", "replace", "nova_region_names_l_english.yml");
const namesOf = (mod) => {
  const out = new Map();
  try { for (const m of fs.readFileSync(NAMES(mod), "utf8").matchAll(/^[ \t]*([A-Za-z0-9_.\-]+):\d*[ \t]*"(.*)"[ \t]*\r?$/gm)) out.set(m[1], m[2]); } catch (_) {}
  return out;
};
// each region key of the mod's own region files → the file it is in
const fileOfKey = (mod) => {
  const out = new Map(), dir = path.join(mod, "map", "strategicregions");
  for (const f of fs.readdirSync(dir)) {
    if (!/\.txt$/i.test(f)) continue;
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    for (const m of t.matchAll(/\bname\s*=\s*"?([A-Za-z0-9_.\-]+)"?/g)) out.set(m[1], f);
  }
  return out;
};
const fileNice = (f) => String(f || "").replace(/\.[^.]+$/, "").replace(/^\d+[_ -]*/, "").trim();
const changedNames = (a, b) => [...a].filter(([k, v]) => b.has(k) && b.get(k) !== v).map(([k, v]) => ({ key: k, first: v, second: b.get(k) }));

const { createApp } = require("./server.js");
(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/map/rebuild-regions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

    console.log("\n-- the mod owns its layout (replace_path): a second press keeps every name --");
    const w1 = await post({ modPath: W.MOD, confirm: true });
    ok(w1.status === 200 && w1.body.ok === true && w1.body.regionNames && !w1.body.regionNames.error, "the first redraw is written, names and all", w1.body.error || w1.body.regionNames || w1.body);
    const A = namesOf(W.MOD), files = fileOfKey(W.MOD);
    const notTheFiles = [...A].filter(([k, v]) => files.has(k) && v !== fileNice(files.get(k)));
    ok(A.size >= 3, `(the first redraw named ${A.size} regions in Nova's names file)`, [...A]);
    // the defect needs a region whose name is not its file's: otherwise naming by the file reads the same, and nothing could bite
    ok(notTheFiles.length >= 1, `(precondition: ${notTheFiles.length} of them are named otherwise than their file, e.g. ${JSON.stringify(notTheFiles.slice(0, 3).map(([k, v]) => [k, v, files.get(k)]))})`, [...A].map(([k, v]) => [k, v, files.get(k)]));
    const d2 = await post({ modPath: W.MOD, dryRun: true });
    const s2 = (d2.body && d2.body.summary) || {};
    ok(d2.status === 200 && d2.body.ok === true, "the second dry run answers", d2.body);
    ok(!s2.namesStale, `⭐⭐ the second dry run finds no name Nova wrote "out of date" (namesStale ${s2.namesStale || 0})`, s2);
    ok(s2.nothingToWrite === true, "⭐⭐ …and has nothing to write, so the dialog offers no second Redraw", s2);
    const w2 = await post({ modPath: W.MOD, confirm: true });
    ok(w2.status === 200 && w2.body.ok === true, "a second confirmed redraw (as a forced press) is written", w2.body);
    const B = namesOf(W.MOD);
    const renamed = changedNames(A, B);
    ok(renamed.length === 0 && B.size === A.size, `⭐⭐ …and renames no region (${renamed.length} renamed)`, renamed.slice(0, 6));
    ok(!changedNames(A, B).some((r) => files.has(r.key) && r.second === fileNice(files.get(r.key))), "⭐ …least of all after the file it was written into");

    console.log("\n-- control: regions that load beneath the mod are named as before --");
    const v1 = await post({ modPath: V.MOD, confirm: true });
    ok(v1.status === 200 && v1.body.ok === true, "the first redraw over the base game's regions is written", v1.body.error || v1.body);
    const VA = namesOf(V.MOD);
    const vd = await post({ modPath: V.MOD, dryRun: true });
    ok(vd.body && vd.body.ok === true && vd.body.summary && vd.body.summary.nothingToWrite === true && !vd.body.summary.namesStale, "its second dry run has nothing to write either", vd.body.summary || vd.body);
    const v2 = await post({ modPath: V.MOD, confirm: true });
    ok(v2.body && v2.body.ok === true && changedNames(VA, namesOf(V.MOD)).length === 0, "…and a second press renames nothing there", changedNames(VA, namesOf(V.MOD)));

    console.log("\n-- the source: one question, asked only over the mod's own layout --");
    const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const src = maskJsComments(raw), lits = maskJsLiterals(raw);
    // braces counted where only code is left (#a-counted-brace-inside-a-regex), read where only comments are masked
    const body = (name) => { const at = src.indexOf(`function ${name}(`); const b = at === -1 ? null : jsBodyAt(lits, at); return b ? src.slice(b[0], b[1] + 1) : ""; };
    const plan = body("regionNamePlan");
    ok(/\(\s*overOwnLayout\s*\|\|\s*!ownVals\.has\(f\.key\)\s*\)/.test(plan), "regionNamePlan drops a line of Nova's own file for a base key only when the base is BELOW the mod", plan.slice(0, 200));
    ok(/regionRedrawBaseIsTheModsOwn\(\s*modRoot\s*,\s*gameRoot\s*,\s*dependencyRoots\s*\)/.test(plan), "…which it asks regionRedrawBaseIsTheModsOwn with the plan's own roots");
    const helper = body("regionRedrawBaseIsTheModsOwn");
    ok(/mapData\.readReplacePaths\(modRoot\)\.has\("map\/strategicregions"\)/.test(helper) && /mapData\.baseRootsFor\(/.test(helper), "…and it reads the roots layersBelow gives (the mod's replace_path, then baseRootsFor)", helper.slice(0, 300));
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    for (const X of [W, V]) { try { fs.rmSync(X.ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})();
