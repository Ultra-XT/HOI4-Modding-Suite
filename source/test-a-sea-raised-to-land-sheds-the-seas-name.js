// ⛔ #a-kept-name-keeps-its-kind — A SEA RAISED TO LAND DOES NOT KEEP THE NAME SOMEONE GAVE THE SEA. By either road.
//
// The owner's own flow: ✎ Rename a sea region, raise land there, Redraw. test-a-kept-region-name-keeps-its-kind.js closed the
// road through the planner's keep. A second independent review (09-29) drove the whole flow and found two more roads to the
// same wrong name, each reproduced through the endpoints:
//   · F1: a name typed for a NOVA_REGION_<id> key. That key follows its id, and the planner gives region <id> its own key
//     whatever else happens — so the name writer, which only asked "did the modder type this?", kept "Mare Occidentale" on
//     51 provinces of land.
//   · F2: a mod declaring replace_path="map/strategicregions" (all five shipping map mods do). There the layer the base-name
//     rule reads IS the mod's own blocks, typed by what their provinces are now — a sea raised to land looked like land, and
//     took its old key, "Mare Germanicum", straight back.
// Driven the way a modder drives it: the page's own rename request, definition.csv edited to raise the sea (as the brush and
// Generate land leave it), a state for the new land, and the Redraw dialog's own body. Each world has a CONTROL: nothing
// raised, the typed name stays.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};

const G = makeRegionWorld("raised", { baseLoc: true });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
// the second world: the same mod, which will declare replace_path on its regions after its first redraw
const RP = path.join(path.dirname(G.MOD), "replaced");
fs.cpSync(G.MOD, RP, { recursive: true });
fs.writeFileSync(path.join(RP, "descriptor.mod"), fs.readFileSync(path.join(G.MOD, "descriptor.mod"), "utf8").replace(/name="[^"]*"/, 'name="Replaced Regions"'));

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
rec("(the dialog's request body was found in public/map.js)", /confirm:\s*true/.test(bodyText), bodyText);
rec("(the page renames a region as { nameKey, name })", /queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MASKED), null);
const bodyFor = (mod) => vm.runInNewContext("(" + bodyText + ")", { modPath: () => mod });

const md = require("./map-data.js");
const { createApp } = require("./server.js");
const model = (mod) => md.buildMapModel({ modRoot: mod, gameRoot: G.GAME, dependencyRoots: [] });
const enName = (mod, key) => {
  const f = path.join(mod, "localisation", "english", "replace", "nova_region_names_l_english.yml");
  try { const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"(.*)"`, "m").exec(fs.readFileSync(f, "utf8")); return m ? m[1] : null; } catch (_) { return null; }
};
const setBlockKey = (mod, id, key) => {
  const dir = path.join(mod, "map", "strategicregions");
  for (const f of fs.readdirSync(dir)) {
    const abs = path.join(dir, f), text = fs.readFileSync(abs, "utf8");
    const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
    if (!b) continue;
    fs.writeFileSync(abs, text.slice(0, b.start) + text.slice(b.start, b.end).replace(/\bname\s*=\s*"?[A-Za-z0-9_.]+"?/, () => `name="${key}"`) + text.slice(b.end));
    return true;
  }
  return false;
};
// Raise every sea province of region `id` to land, in a new state of its own — what the brush or Generate land leaves.
const raiseRegion = (mod, id) => {
  const m = model(mod);
  const raise = new Set(Object.keys(m.provinceToRegion).map(Number).filter((p) => m.provinceToRegion[p] === id && G.modType(p) === "sea"));
  const def = path.join(mod, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => { const c = l.split(";"); if (c.length > 4 && raise.has(+c[0])) { c[4] = "land"; c[6] = "plains"; c[7] = "1"; } return c.join(";"); }).join("\n"));
  fs.writeFileSync(path.join(mod, "history", "states", "99-Raised.txt"), `state={\n\tid=99\n\tname="STATE_99"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${[...raise].join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  return raise;
};
// the English every region holding a raised province shows, with its key
const namesOnRaised = (mod, raise) => {
  const m = model(mod);
  return m.strategicRegions.filter((r) => r.provinces.some((p) => raise.has(p))).map((r) => ({ id: r.id, key: r.name, en: enName(mod, r.name) }));
};

(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    const redraw = async (mod, label) => {
      const r = await post("/api/map/rebuild-regions", bodyFor(mod));
      rec(`(${label}: the redraw is written)`, r.status === 200 && r.body.ok === true && !(r.body.regionNames || {}).error, r.body.error || r.body.regionNames);
      return r;
    };

    console.log("\n[F1] a name typed for NOVA_REGION_<id> stays on that id only while the region is the sea it named");
    await redraw(G.MOD, "first redraw");
    rec("(region 1, the west sea, is given its own NOVA_REGION_1 key)", setBlockKey(G.MOD, 1, "NOVA_REGION_1"), null);
    const rn = await post("/api/map/set-region-name", { modPath: G.MOD, nameKey: "NOVA_REGION_1", name: "Mare Occidentale" });
    rec("(the modder names it through ✎ Rename)", rn.status === 200 && rn.body.renamed, rn.body);
    await redraw(G.MOD, "redraw with nothing raised");
    rec("(CONTROL: the sea keeps the name typed for it)", enName(G.MOD, "NOVA_REGION_1") === "Mare Occidentale", enName(G.MOD, "NOVA_REGION_1"));
    const raisedA = raiseRegion(G.MOD, 1);
    rec("(precondition: the west sea's water is raised to land)", raisedA.size >= 10, raisedA.size);
    await redraw(G.MOD, "redraw after raising the sea");
    const onA = namesOnRaised(G.MOD, raisedA);
    rec("⭐⭐⭐ no region on the raised land reads the name typed for the sea", onA.length >= 1 && onA.every((x) => x.en !== "Mare Occidentale"), onA);

    console.log("\n[F2] …nor in a mod whose regions replace the layer below's");
    await redraw(RP, "first redraw of the replacing mod");
    fs.writeFileSync(path.join(RP, "descriptor.mod"), fs.readFileSync(path.join(RP, "descriptor.mod"), "utf8").replace(/\s*$/, "\n") + 'replace_path="map/strategicregions"\n');
    const seaId = model(RP).provinceToRegion[G.idAt(14, 0)];
    const seaKey = (model(RP).strategicRegions.find((r) => r.id === seaId) || {}).name;
    rec("(precondition: the east sea is a region named by a key of its own)", seaId != null && !!seaKey, { seaId, seaKey });
    const rn2 = await post("/api/map/set-region-name", { modPath: RP, nameKey: seaKey, name: "Mare Germanicum" });
    rec("(the modder names it through ✎ Rename)", rn2.status === 200 && rn2.body.renamed, rn2.body);
    await redraw(RP, "redraw with nothing raised");
    rec("(CONTROL: the sea keeps its key and the name typed for it)", (model(RP).strategicRegions.find((r) => r.id === seaId) || {}).name === seaKey && enName(RP, seaKey) === "Mare Germanicum",
      { key: (model(RP).strategicRegions.find((r) => r.id === seaId) || {}).name, en: enName(RP, seaKey) });
    const raisedB = raiseRegion(RP, seaId);
    rec("(precondition: the east sea's water is raised to land)", raisedB.size >= 10, raisedB.size);
    await redraw(RP, "redraw after raising the sea");
    const onB = namesOnRaised(RP, raisedB);
    rec("⭐⭐⭐ with replace_path on the regions, no region on the raised land takes the sea's key or its name",
      onB.length >= 1 && onB.every((x) => x.key !== seaKey && x.en !== "Mare Germanicum"), onB);
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
