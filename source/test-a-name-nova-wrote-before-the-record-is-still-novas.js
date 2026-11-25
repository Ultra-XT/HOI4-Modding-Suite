// ⛔ #a-region-name-nova-wrote-before-the-record — A REGION NAME A REDRAW WROTE IS NOVA'S, EVEN WHERE NO RECORD SAYS SO.
//
// Whose a line in Nova's region-names file is was told by a record of what the last redraw wrote (regionNameRecordPath). That
// record lives outside the mod, keyed on its path, and exists only since 025324d — so every world redrawn before it had none,
// nor does a copy of a mod, nor a mod after NOVA_HOME moved. A line with no record read as typed by the modder: on TEST 31 all
// 317 of its region names. A redraw there never named a region again, never followed a state's rename (the dialog said "nothing
// to write"), and kept the first world's names after Delete map → Generate land. Now a record-less line is Nova's when it reads
// as a name the redraw derives (regionNamesNovaDerive); anything else is still the modder's. Measured on a scratch copy of TEST 31:
// 317 of 317 handed back, a dry run of the unchanged world has nothing to write, and one state rename is followed.
//
// Pinned, with the bodies public/map.js sends:
//   · the predicate, shape by shape (a state's name — Nova's file's, or only a loading state's — " Sea", the " <n>" that tells two
//     apart, the placeholders, a base region's name with that number, its file's where the planner names by it, the old name a
//     renamed state keeps on its victory point) and what it must not take: a base region's name plain ("West Sea"), or one a
//     replace_path hides from the planner (review of the bootstrap);
//   · a copy of a redrawn world (no record): a state rename is followed, in English and German; a name typed through ✎ Rename is
//     kept; every other name reads as before; the next dry run has nothing to write;
//   · where the record DOES speak, a name typed after the redraw is the modder's even when it reads as a state's name.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};

// a generated world's shape: the base game's state ids stood elsewhere, so every land region is named after its state
const W = makeRegionWorld("before-record", { baseLoc: true, baseStates: "elsewhere" });
process.env.HOI4_ROOT = W.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(W.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
ok(/confirm:\s*true/.test(bodyText), "(the dialog's request body was found in public/map.js)", bodyText);
const redrawBody = (mod) => vm.runInNewContext("(" + (bodyText || "{}") + ")", { modPath: () => mod });
const dryBody = (mod) => Object.assign({}, redrawBody(mod), { dryRun: true, confirm: undefined });
ok(/queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MASKED) && /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MASKED),
  "(the page renames a region as { nameKey, name } and a state as { stateId, nameKey, fields }; the flush adds modPath)");

const md = require("./map-data.js");
const ctx = (mod) => ({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [] });
const KEY_LINE = /^[ \t]*([A-Za-z0-9_.\-]+):\d*[ \t]*"(.*)"[ \t]*(?:#[^\n]*)?\r?$/gm;
const lines = (abs) => { const m = new Map(); try { for (const x of fs.readFileSync(abs, "utf8").matchAll(KEY_LINE)) m.set(x[1], x[2]); } catch (_) {} return m; };
const regionFile = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_region_names_l_${lang}.yml`);
const keyOf = (mod, id) => {
  const dir = path.join(mod, "map", "strategicregions");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
    if (b) { const m = /\bname\s*=\s*"?([A-Za-z0-9_.]+)"?/.exec(text.slice(b.start, b.end)); return m ? m[1] : ""; }
  }
  return "";
};
const regionAt = (mod, p) => md.buildMapModel(ctx(mod)).provinceToRegion[p];

// The world as Generate land leaves it: every state named in Nova's own file, and its victory point named after it.
const states = md.buildMapModel(ctx(W.MOD)).states.slice().sort((a, b) => a.id - b.id);
const nameOf = new Map(states.map((s) => [s.name, md.generatedPlaceName(99, s.id)]));
for (const f of fs.readdirSync(path.join(W.MOD, "history", "states"))) {
  const abs = path.join(W.MOD, "history", "states", f);
  const txt = fs.readFileSync(abs, "utf8");
  const first = (/provinces=\{ (\d+)/.exec(txt) || [])[1];
  fs.writeFileSync(abs, txt.replace("owner=AAA", () => `owner=AAA\n\t\tvictory_points = { ${first} 1 }`));
}
const vpOf = new Map(states.map((s) => [s.name, `VICTORY_POINTS_${s.provinces[0]}`]));
const NOVA_STATES = path.join(W.MOD, "localisation", "english", "replace", "nova_state_names_l_english.yml");
fs.mkdirSync(path.dirname(NOVA_STATES), { recursive: true });
fs.writeFileSync(NOVA_STATES, "﻿l_english:\n" + [...nameOf].map(([k, v]) => ` ${k}:0 "${v}"\n ${vpOf.get(k)}:0 "${v}"`).join("\n") + "\n");
const langsBelow = ["english", ...fs.readdirSync(path.join(W.GAME, "localisation"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "english").map((e) => e.name)];

const srv = require("./server.js");
(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));

    // ── the world is redrawn once: its names are written, and recorded ──
    const r1 = await post("/api/map/rebuild-regions", redrawBody(W.MOD));
    ok(r1.status === 200 && r1.body.ok === true && r1.body.regionNames && r1.body.regionNames.written > 0, "(the first redraw is written and names its regions)", r1.body.regionNames || r1.body);
    const A = regionAt(W.MOD, W.idAt(4, 0)), B = regionAt(W.MOD, W.idAt(11, 0)), I = regionAt(W.MOD, W.PROV.isletA);
    const kA = keyOf(W.MOD, A), kB = keyOf(W.MOD, B), kI = keyOf(W.MOD, I);
    const before = lines(regionFile(W.MOD, "english"));
    ok(new Set([kA, kB, kI]).size === 3 && [kA, kB, kI].every((k) => /^NOVA_REGION_\d+$/.test(k) && [...nameOf.values()].includes(before.get(k))),
      "(precondition: the land regions over A, B and the islets are each named after a state, under a NOVA_REGION key)", { kA, kB, kI, before: [...before] });

    // ── a copy of it: a world whose record is not there, as every world redrawn before 025324d ──
    const COPY = path.join(path.dirname(W.MOD), "copied");
    fs.cpSync(W.MOD, COPY, { recursive: true });
    fs.writeFileSync(path.join(COPY, "descriptor.mod"), fs.readFileSync(path.join(W.MOD, "descriptor.mod"), "utf8").replace(/name="[^"]*"/, 'name="Copied"'));
    ok(fs.existsSync(md.regionNameRecordPath(W.MOD)) && !fs.existsSync(md.regionNameRecordPath(COPY)), "(precondition: the world has a record of its names, its copy none)");
    // the state the region over A is named after is renamed in the panel; the region over B is renamed through ✎ Rename
    const bigA = [...nameOf].find(([, v]) => v === before.get(kA));
    const bigStateId = Number(bigA[0].slice("STATE_".length));
    const rs = await post("/api/map/set-state", { modPath: COPY, stateId: bigStateId, nameKey: bigA[0], fields: { displayName: "Homeland" } });
    ok(rs.status === 200 && rs.body.renamed === true, `(state ${bigStateId}, "${bigA[1]}", is renamed "Homeland" through the state panel)`, rs.body);
    const rr = await post("/api/map/set-region-name", { modPath: COPY, nameKey: kB, name: "Eastmark" });
    ok(rr.status === 200 && rr.body.renamed, `(${kB} is renamed "Eastmark" through ✎ Rename)`, rr.body);
    // …and the east sea, under the base game's key, is renamed to a STATE's name: what a released user renaming an Earth region
    // might type. Only a NOVA_REGION_<id> key is ever the redraw's to claim back.
    const E = regionAt(COPY, W.idAt(14, 0)), kE = keyOf(COPY, E), asState = nameOf.get("STATE_7");
    const re = await post("/api/map/set-region-name", { modPath: COPY, nameKey: kE, name: asState });
    ok(kE === "STRATEGICREGION_5" && re.status === 200 && re.body.renamed, `(${kE}, the base game's East Sea, is renamed "${asState}" — state 7's name — through ✎ Rename)`, { kE, body: re.body });
    // the base game's name for the west sea, which the world still has under the base game's key: a real sea's name, what a modder
    // renaming a region over vanilla is likeliest to type (review of the bootstrap)
    const kW = keyOf(COPY, regionAt(COPY, W.idAt(7, 0))), westSea = ((srv.getLocalizationMap(COPY) || {}).names || {})[kW];
    ok(kW === "STRATEGICREGION_1" && !!westSea, `(the west sea keeps the base game's key ${kW}, "${westSea}")`, { kW, westSea });

    console.log("\n-- the names a redraw derives, and only those --");
    {
      const nm = (srv.getLocalizationMap(COPY) || {}).names || {};
      const own = lines(regionFile(COPY, "english"));
      const derives = srv.regionNamesNovaDerive({ modRoot: COPY, gameRoot: W.GAME, dependencyRoots: [], nm, ownVals: own });
      const other = nameOf.get("STATE_5");
      ok(derives(bigA[1]), `⭐⭐⭐ the OLD name of a state renamed since ("${bigA[1]}", kept on its victory point in Nova's file)`);
      ok(derives("Homeland") && derives(other), "⭐ a state's name Nova's own file gives now");
      // ⭐ a LOADING state's name that no file of Nova's gives: the planner names a sea after its coast's state by whatever names that
      // state. Every state of this world is in Nova's file, so the check above cannot tell the two readings apart (review of the
      // bootstrap): a copy whose Nova file names nothing, and whose modder names every state in a file of their own, stands in.
      const OWN = path.join(path.dirname(W.MOD), "own-names");
      fs.cpSync(W.MOD, OWN, { recursive: true });
      fs.writeFileSync(path.join(OWN, path.relative(W.MOD, NOVA_STATES)), "﻿l_english:\n");
      fs.writeFileSync(path.join(OWN, "localisation", "english", "my_state_names_l_english.yml"), "﻿l_english:\n" + states.map((s) => ` ${s.name}:0 "Own ${s.id}"`).join("\n") + "\n");
      const ownDerives = srv.regionNamesNovaDerive({ modRoot: OWN, gameRoot: W.GAME, dependencyRoots: [], nm: (srv.getLocalizationMap(OWN) || {}).names || {}, ownVals: new Map() });
      const sid = states[2].id;
      ok(ownDerives(`Own ${sid}`) && ownDerives(`Own ${sid} Sea`) && !ownDerives("Own 99"), `⭐⭐ a loading state's name only the modder's own file gives ("Own ${sid}", ± " Sea"), and no state that does not load`);
      ok(derives(`${other} Sea`), "⭐ a state's name + \" Sea\" (a sea named after its coast)");
      ok(derives(`${other} 2`) && derives(`${other} Sea 3`), "⭐ …and either with the \" <n>\" that tells two alike apart");
      ok(!derives(`${other} 1`) && !derives(`${other}Sea`) && !derives(`${other} Sea Sea`), "…but not \" 1\", a glued \"Sea\", or \" Sea\" twice");
      ok(derives("State 7") && derives("State 7 Sea") && derives("Sea Region 40") && derives("Region 7") && derives("Region 7 2"), "⭐ the placeholders: \"State <id>\" (± Sea), \"Sea Region <id>\", \"Region <id>\"");
      ok(!derives("Region") && !derives("Sea Region") && !derives("State"), "…each only with its number");
      // a base region's name, told apart from its file's: this fixture's base names equal its file names, so "Typed Over" stands in
      const fromLoc = srv.regionNamesNovaDerive({ modRoot: COPY, gameRoot: W.GAME, dependencyRoots: [], nm: { STRATEGICREGION_3: "Typed Over" }, ownVals: new Map() });
      // ⚠ was fromLoc("Typed Over") && fromLoc("Typed Over 2"): the largest region named after a base region takes its KEY, so a
      // NOVA_REGION_<id> line carries its name only as a second one — and a plain "North Sea" typed through ✎ Rename was taken for
      // Nova's, one of 302 such names over vanilla (review of the bootstrap)
      ok(fromLoc("Typed Over 2") && fromLoc("Typed Over 3"), "⭐ a base region's name with the number a second region named after it takes, as the layers' localisation gives it");
      ok(!fromLoc("Typed Over"), "⭐⭐⭐ …but never plain: the largest region named after it takes its key, not a NOVA_REGION_<id>");
      const guard = srv.regionNamesNovaDerive({ modRoot: COPY, gameRoot: W.GAME, dependencyRoots: [], nm: { STRATEGICREGION_3: "Typed Over" }, ownVals: new Map([["STRATEGICREGION_3", "Typed Over"]]) });
      ok(!guard("Typed Over") && !guard("Typed Over 2"), "⭐⭐ …nor when only Nova's own line gives that key its name: the planner never names a region by such a line");
      const noLoc = srv.regionNamesNovaDerive({ modRoot: COPY, gameRoot: W.GAME, dependencyRoots: [], nm: {}, ownVals: own });
      ok(noLoc("West Sea") && !noLoc("A North (de)"), "⭐ with nothing localised, a base region's FILE name (\"1-West Sea.txt\")");
      ok(!derives(westSea) && derives(`${westSea} 2`), `⭐⭐⭐ "${westSea}" plain is not one where the layers localise its region: the planner names by that, never by its file ("1-West Sea.txt")`);
      const eastSea = (fs.readdirSync(path.join(W.GAME, "map", "strategicregions")).find((f) => f.startsWith("5-")) || "").replace(/^5-|\.txt$/g, "");
      ok(!!eastSea && derives(eastSea), `⭐ …but its file's name is, where only Nova's own line names the key (${kE}, renamed): the planner names a second region by the file then ("${eastSea}")`);
      ok(!derives("Eastmark") && !derives("My Northland") && !derives("A North (de)"), "⭐⭐ a typed name is not one (nor a translation)");
      // ⭐⭐ the base regions are the planner's (regionRebuildBase): a mod whose replace_path hides the base game's regions names from
      // its own. A copy that replaces map/strategicregions and names its own region files: the base game's names that none of its
      // regions carries, by key or by file, are nothing it derives (review of the bootstrap: the predicate read the base game anyway)
      const RP = path.join(path.dirname(W.MOD), "replaces-regions");
      fs.cpSync(COPY, RP, { recursive: true });
      fs.writeFileSync(path.join(RP, "descriptor.mod"), fs.readFileSync(path.join(COPY, "descriptor.mod"), "utf8").replace(/name="[^"]*"/, () => 'name="Replaces"') + 'replace_path="map/strategicregions"\n');
      const rpDir = path.join(RP, "map", "strategicregions");
      for (const f of fs.readdirSync(rpDir)) fs.renameSync(path.join(rpDir, f), path.join(rpDir, f.replace(/^(\d+)-.*$/, (m, id) => `${id}-region.txt`)));
      const rpKeys = new Set(md.buildMapModel(ctx(RP)).strategicRegions.map((r) => r.name));
      const hidden = [...lines(path.join(W.GAME, "localisation", "english", "regions_l_english.yml"))].filter(([k]) => !rpKeys.has(k)).map(([, v]) => v);
      const rpDerives = srv.regionNamesNovaDerive({ modRoot: RP, gameRoot: W.GAME, dependencyRoots: [], nm: (srv.getLocalizationMap(RP) || {}).names || {}, ownVals: lines(regionFile(RP, "english")) });
      ok(hidden.length > 0 && hidden.every((n) => derives(`${n} 2`)), `(CONTROL: without that replace_path each is one — ${hidden.join(", ")})`, hidden);
      ok(hidden.every((n) => !rpDerives(n) && !rpDerives(`${n} 2`)), "⭐⭐ with it, none is: the planner never sees the base game's regions", hidden.filter((n) => rpDerives(n) || rpDerives(`${n} 2`)));
    }

    console.log("\n-- ⭐⭐⭐ a world with no record: the redraw names its regions again --");
    const dry = await post("/api/map/rebuild-regions", dryBody(COPY));
    ok(dry.status === 200 && dry.body.summary && dry.body.summary.nothingToWrite === false && dry.body.summary.namesStale === langsBelow.length,
      `⭐⭐⭐ the dialog offers a redraw: the renamed state's region is stale in each of the ${langsBelow.length} languages`, dry.body.summary || dry.body);
    const r2 = await post("/api/map/rebuild-regions", redrawBody(COPY));
    ok(r2.status === 200 && r2.body.ok === true, "(the copy is redrawn)", r2.body.error || r2.body);
    const after = lines(regionFile(COPY, "english")), afterDe = lines(regionFile(COPY, "german"));
    ok(keyOf(COPY, regionAt(COPY, W.idAt(4, 0))) === kA && after.get(kA) === "Homeland" && afterDe.get(kA) === "Homeland",
      `⭐⭐⭐ ${kA} follows its state's rename, in English and German`, { en: after.get(kA), de: afterDe.get(kA) });
    ok(keyOf(COPY, regionAt(COPY, W.idAt(11, 0))) === kB && after.get(kB) === "Eastmark", `⭐⭐⭐ ${kB} keeps the name typed through ✎ Rename`, { key: keyOf(COPY, regionAt(COPY, W.idAt(11, 0))), en: after.get(kB) });
    ok(keyOf(COPY, regionAt(COPY, W.idAt(14, 0))) === kE && after.get(kE) === asState, `⭐⭐⭐ ${kE} keeps "${asState}" although it reads as a state's name: a base key is never the redraw's to claim`, { key: keyOf(COPY, regionAt(COPY, W.idAt(14, 0))), en: after.get(kE) });
    const others = [...before.keys()].filter((k) => k !== kA && k !== kB);
    ok(others.includes(kI) && others.every((k) => after.get(k) === before.get(k)), `⭐⭐ every other name (${kI}'s among them) reads as it did`, others.map((k) => [k, before.get(k), after.get(k)]));
    const rec = fs.existsSync(md.regionNameRecordPath(COPY)) ? JSON.parse(fs.readFileSync(md.regionNameRecordPath(COPY), "utf8")) : {};
    // ⚠ was `rec[kB] === undefined`: a name kept as the modder's with no record of it is recorded as theirs now, or the next redraw
    // judged it by what it reads again (#a-kept-name-is-recorded-as-theirs, test-a-name-the-modder-typed-before-the-record-stays-theirs.js)
    ok(rec[kA] === "Homeland" && Object.prototype.hasOwnProperty.call(rec, kB) && rec[kB] === null, `⭐ the copy has a record now: ${kA} is Nova's, ${kB} the modder's (null)`, { [kA]: rec[kA], [kB]: rec[kB] });
    const dry2 = await post("/api/map/rebuild-regions", dryBody(COPY));
    ok(dry2.status === 200 && dry2.body.summary && dry2.body.summary.nothingToWrite === true, "⭐ the next dry run has nothing to write", dry2.body.summary || dry2.body);

    console.log("\n-- ⭐⭐ where the record speaks, it decides --");
    const typed = nameOf.get("STATE_5");
    const rt = await post("/api/map/set-region-name", { modPath: W.MOD, nameKey: kI, name: typed });
    ok(rt.status === 200 && rt.body.renamed, `(${kI} is renamed "${typed}" — another state's name — through ✎ Rename, after the redraw that recorded it)`, rt.body);
    const r3 = await post("/api/map/rebuild-regions", redrawBody(W.MOD));
    ok(r3.status === 200 && r3.body.ok === true && lines(regionFile(W.MOD, "english")).get(kI) === typed,
      `⭐⭐ ${kI} keeps it: the record says the redraw wrote "${before.get(kI)}", so a line reading otherwise is the modder's, whatever it reads`, lines(regionFile(W.MOD, "english")).get(kI));
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(W.ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})();
