// ⛔ #a-renamed-state-keeps-its-regions-name — A STATE RENAMED ON LAND THE BASE GAME ALREADY HAD LEAVES ITS REGION THE BASE NAME.
//
// Redraw strategic regions names a land region after its largest state when Nova named that state (#a-generated-world-names-its-places)
// — right on a generated world's new land, where the base region under it ("AMAZONAS") names ground that is not there any more.
// "Nova named it" was read off Nova's own state-names file, and that file is also where a rename through the state panel lands,
// where 1.0.6 copied the shown name on EVERY panel save, and where 1.0.2–1.0.5 wrote a second definition beside the mod's own on
// every rename (f4838c8). So on an Earth map a released user once saved in the panel, the next Redraw renamed the region after
// the state, in every language: a German player's "A North (de)" became "Renamed Town" (design probe of 09-29).
//
// Pinned:
//   · statesOnNewLand on four base games — which states stand on land the world below did not have there — with the half-way
//     line on both sides, a dependency's state over the base game's, and a dependency edited in the same session — inside one
//     clock tick of the write before, at the same size (#a-same-tick-write-keeps-its-stamp);
//   · a panel rename, and a 1.0.6-style line in the old file, on land the base game had: the region keeps its base key, German
//     still resolves the base game's name, and a dry run after has nothing to write;
//   · CONTROL: the same rename on a generated world's new land still flips the region — and still when the modder names that
//     state in a file of their own too, while the mod's own English names under half its states;
//   · a map that renumbers its states over the same land (Millennium Dawn's shape), whose own files name every state, with a
//     1.0.5-style duplicate in Nova's old file: the land test alone calls that state new, and the region still keeps its key.
// Driven through the endpoints with the bodies public/map.js sends. Three base games in one process: the server keeps the first
// game's English file list for good (cachedVanillaLocFiles), which is safe here only because all three ship the same localisation.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const { holdTheClock } = require("./testlib-held-clock.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};

const DEF = makeRegionWorld("rn-default", { baseLoc: true });
const EARTH = makeRegionWorld("rn-earth", { baseLoc: true, baseStates: "same" });
const GEN = makeRegionWorld("rn-generated", { baseLoc: true, baseStates: "elsewhere" });
const MD = makeRegionWorld("rn-renumbered", { baseLoc: true, baseStates: "permuted" });
const WORLDS = [DEF, EARTH, GEN, MD];
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(EARTH.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
const use = (W) => { process.env.HOI4_ROOT = W.GAME; process.env.HOI4_MODS_ROOT = path.dirname(W.MOD); };
use(EARTH);

// The body the Redraw dialog's confirm button sends, read out of public/map.js — and the state panel's rename.
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
ok(/confirm:\s*true/.test(bodyText), "(the dialog's request body was found in public/map.js)", bodyText);
const redrawBody = (mod) => vm.runInNewContext("(" + (bodyText || "{}") + ")", { modPath: () => mod });
ok(/queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MASKED), "(the page renames a state as { stateId, nameKey, fields }; the flush adds modPath)");

const md = require("./map-data.js");
const { safeModWrite } = require("./safe-write.js");
const ctx = (W, mod = W.MOD) => ({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [] });
const onA = (s) => (s.provinces || []).some((p) => { const c = (p - 1) % 16; return c >= 3 && c <= 5; });   // continent A: columns 3-5
const KEY_LINE = /^[ \t]*([A-Za-z0-9_.\-]+):\d*[ \t]*"(.*)"[ \t]*(?:#[^\n]*)?\r?$/gm;
const linesIn = (dir, re) => {
  const out = new Map();
  const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (re.test(e.name)) for (const m of fs.readFileSync(p, "utf8").matchAll(KEY_LINE)) out.set(m[1], m[2]); } };
  walk(dir);
  return out;
};
const keyOf = (mod, id) => {
  const dir = path.join(mod, "map", "strategicregions");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
    if (b) { const m = /\bname\s*=\s*"?([A-Za-z0-9_.]+)"?/.exec(text.slice(b.start, b.end)); return m ? m[1] : ""; }
  }
  return "";
};
// The largest state of the land region over continent A, as the planner itself picks it: the one it names that region after
// when every state counts.
const bigStateOfA = (W, mod = W.MOD) => {
  const m = md.buildMapModel(ctx(W, mod));
  const plan = md.rebuildStrategicRegions({ ...ctx(W, mod), dryRun: true, opts: { nameAfterStates: m.states.map((s) => s.id) } });
  const aIds = new Set(m.states.filter(onA).map((s) => s.id));
  const r = (plan.regionsNamed || []).find((x) => x.cls === "land" && x.nameFrom && aIds.has(x.nameFrom.state));
  return r ? { id: r.nameFrom.state, key: r.nameFrom.key, region: r.id } : null;
};

console.log("\n-- statesOnNewLand: which states stand on land the world below did not have there --");
{
  const newOf = (W) => md.statesOnNewLand({ gameRoot: W.GAME, dependencyRoots: [], states: md.buildMapModel(ctx(W)).states }).slice().sort((a, b) => a - b);
  const allIds = (W) => md.buildMapModel(ctx(W)).states.map((s) => s.id).sort((a, b) => a - b);
  // where the base game had land, it had a state over it (one state 1, or the mod's own on A): a state is new when at least half
  // of it was sea or lake below
  const offOldLand = (W) => W.states.map((provs, i) => ({ id: i + 1, provs })).filter((s) => s.provs.filter((p) => W.baseType(p) !== "land").length >= 0.5 * s.provs.length).map((s) => s.id);
  ok(JSON.stringify(offOldLand(DEF)) === JSON.stringify([9, 10, 11, 12, 13, 14]), "(the fixture: the states off the base game's land are B's, the islet's and the two islets')", offOldLand(DEF));
  ok(JSON.stringify(newOf(DEF)) === JSON.stringify(offOldLand(DEF)), "⭐ one base state over all the old land: exactly the states off it are new", newOf(DEF));
  ok(JSON.stringify(newOf(EARTH)) === JSON.stringify(offOldLand(EARTH)), "⭐⭐ the base game's own states on continent A (same ids, same land): none of A's is new", newOf(EARTH));
  ok(JSON.stringify(newOf(GEN)) === JSON.stringify(allIds(GEN)), "⭐⭐ the base ids stood ELSEWHERE, as under a generated world: every state is new", newOf(GEN));
  ok(JSON.stringify(newOf(MD)) === JSON.stringify(allIds(MD)), "(and a map that renumbered its states over the same land looks new to the land test alone — which is what the `mine` filter is for)", newOf(MD));
  // A state Auto-fix renumbered keeps its key when it cannot move it (#a-renumbered-state-keeps-a-name-of-its-own): an id the
  // world below never had, over land a base state DID hold. Its key's state below is the one to ask, not "was there land".
  const aLand = GEN.ALL.filter((p) => GEN.baseType(p) === "land" && ((p - 1) % 16) >= 3 && ((p - 1) % 16) <= 5).slice(0, 3);
  const moved = md.statesOnNewLand({ gameRoot: GEN.GAME, dependencyRoots: [], states: [{ id: 500, name: "STATE_3", provinces: aLand }, { id: 501, name: "STATE_501", provinces: aLand }] });
  ok(JSON.stringify(moved) === JSON.stringify([500]), "⭐ a state off its id is judged by its key's state below (elsewhere: new), not by the land under it (a base state's: old)", moved);
  // ⭐ The boundary, both ways: a counterpart holding 40% of a state leaves it new and one holding 60% makes it old; with no counterpart,
  // 60% of it off every state below makes it new and 40% does not. 0.05 or 0.95 in place of either half left every test green, and
  // an add-on's real overlaps sit in the .4–.6 bin (review of the bootstrap).
  const [S1, S2, S3] = EARTH.states;   // the base game's states 1, 2 and 3 on continent A, three provinces each ("same")
  const off = EARTH.ALL.filter((p) => { const c = (p - 1) % 16; return c === 11 || c === 12; });   // continent B: sea below, in no state
  ok([S1, S2, S3].every((s) => s.length === 3) && off.length >= 10 && off.every((p) => EARTH.baseType(p) === "sea"), "(the fixture: three base states of three provinces, and ten provinces off every state below)");
  const edge = md.statesOnNewLand({ gameRoot: EARTH.GAME, dependencyRoots: [], states: [
    { id: 1, name: "STATE_1", provinces: [S1[0], S1[1], off[0], off[1], off[2]] },   // 2 of 5 in its counterpart
    { id: 2, name: "STATE_2", provinces: [...S2, off[3], off[4]] },                   // 3 of 5
    { id: 600, name: "STATE_600", provinces: [off[5], off[6], off[7], S1[2], S3[0]] }, // no counterpart: 3 of 5 off every state below
    { id: 601, name: "STATE_601", provinces: [off[8], off[9], ...S3] },               // 2 of 5
  ] });
  ok(edge.includes(1), "⭐⭐ a state its counterpart below holds 40% of is new", edge);
  ok(!edge.includes(2), "⭐⭐ …one it holds 60% of is not", edge);
  ok(edge.includes(600), "⭐⭐ with no counterpart, a state 60% off every state below is new", edge);
  ok(!edge.includes(601), "⭐⭐ …one 40% off is not", edge);
}

const srv = require("./server.js");
const { createApp } = srv;
(async () => {
  let server = null;
  try {
    console.log("\n-- ⭐⭐ a dependency's state counts over the base game's, and an edit to it is seen in the same session --");
    {
      // a dependency whose state 1 stands on continent A, where the mod's does; the base game's state 1 stood on the drowned C
      const DEP = path.join(GEN.ROOT, "dep"), depStates = path.join(GEN.ROOT, "dep", "history", "states");
      fs.mkdirSync(depStates, { recursive: true });
      fs.writeFileSync(path.join(DEP, "descriptor.mod"), 'name="Dep"\nsupported_version="1.*"\n');
      // written by Nova, as the modder's own move of it in the map editor is (#a-look-below-answer-moves-when-a-layer-below-changes); each
      // id two characters wide, so continent A's state and continent B's are the same size on disk
      const depFile = path.join(depStates, "1-Dep.txt");
      const writeDep = (provs) => safeModWrite(depFile, `state={\n\tid=1\n\tname="STATE_1"\n\tprovinces={ ${provs.map((p) => String(p).padStart(2, " ")).join(" ")} }\n}\n`, "test-dep");
      const onB = GEN.states[8].slice(0, 3);   // three provinces of continent B, as many as the mod's state 1 has on A
      writeDep(GEN.states[0]);
      const ask = (deps) => md.statesOnNewLand({ gameRoot: GEN.GAME, dependencyRoots: deps, states: [{ id: 1, name: "STATE_1", provinces: GEN.states[0] }] });
      ok(JSON.stringify(ask([])) === "[1]", "(CONTROL: over the base game alone, whose state 1 stood elsewhere, the mod's state 1 is new)", ask([]));
      ok(JSON.stringify(ask([DEP])) === "[]", "⭐⭐ over a dependency whose state 1 stands where the mod's does, it is not: the higher layer's state of an id counts", ask([DEP]));
      // the modder moves the dependency's state 1 elsewhere (continent B), in the same session, and opens the add-on again.
      // ⛔ #a-same-tick-write-keeps-its-stamp — inside the clock tick of the write before it, which is where it landed 8 runs in 10 in
      // batch 3b: the two writes are 1.8-3.1 ms apart here (measured 10-01), so a clock ticking every 15.6 ms puts them in one tick about
      // 85 times in 100, and one ticking every 0.5 ms, as this machine's did that day, never (20 passes in 20). Held, not left to chance.
      const sizeBefore = fs.statSync(depFile).size, seen = (p) => { const s = fs.statSync(p); return [s.size, s.mtimeMs, s.ctimeMs, s.ino].join(":"); };
      const release = holdTheClock([depStates, depFile]);
      try {
        const folderBefore = seen(depStates), fileBefore = seen(depFile);
        writeDep(onB);
        ok(onB.length === 3 && onB.every((p) => GEN.baseType(p) === "sea") && fs.statSync(depFile).size === sizeBefore && seen(depStates) === folderBefore && seen(depFile) === fileBefore,
          "(the fixture: the move is to continent B, at the same size, and stat sees nothing of it — neither the folder nor the file)", { onB, folderBefore, folder: seen(depStates), fileBefore, file: seen(depFile) });
        await new Promise((r) => setImmediate(r));   // a layer below is stamped once per turn of the event loop, as between two requests
        ok(JSON.stringify(ask([DEP])) === "[1]", "⭐⭐ …and once the dependency moves it elsewhere, the next question sees it — inside one clock tick, at the same size (the first answer was kept until Nova restarted, and then 8 runs in 10)", ask([DEP]));
      } finally { release(); }
    }

    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    const regionOverA = (W, mod = W.MOD) => md.buildMapModel(ctx(W, mod)).provinceToRegion[W.idAt(4, 0)];
    // what a player in `lang` reads for `key` from the mod's own files (the base game's own file is not the mod's)
    const modLine = (mod, lang, key) => linesIn(path.join(mod, "localisation"), new RegExp(`_l_${lang}\\.yml$`)).get(key);
    const legacyLine = (mod, key, value) => {
      const f = path.join(mod, "localisation", "english", "nova_state_names_l_english.yml");
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `﻿l_english:\n ${key}:0 "${value}"\n`);
    };

    console.log("\n-- ⭐⭐⭐ on land the base game had, a renamed state leaves its region the base name --");
    use(EARTH);
    const r1 = await post("/api/map/rebuild-regions", redrawBody(EARTH.MOD));
    ok(r1.status === 200 && r1.body.ok === true, "(the first redraw is written)", r1.body.error || r1.body);
    const N = regionOverA(EARTH);
    ok(keyOf(EARTH.MOD, N) === "STRATEGICREGION_3", "(precondition: the region over continent A is the base game's A North)", { N, key: keyOf(EARTH.MOD, N) });
    const big = bigStateOfA(EARTH);
    ok(!!big && big.region === N, "(the largest state of that region is found as the planner picks it)", big);
    // the copy carries a 1.0.6 panel save instead: the shown name, copied into the file beside replace/
    const LEG = path.join(path.dirname(EARTH.MOD), "legacy");
    fs.cpSync(EARTH.MOD, LEG, { recursive: true });
    fs.writeFileSync(path.join(LEG, "descriptor.mod"), fs.readFileSync(path.join(EARTH.MOD, "descriptor.mod"), "utf8").replace(/name="[^"]*"/, 'name="Legacy"'));
    legacyLine(LEG, big.key, "Renamed Town");
    const rn = await post("/api/map/set-state", { modPath: EARTH.MOD, stateId: big.id, nameKey: big.key, fields: { displayName: "Renamed Town" } });
    ok(rn.status === 200 && rn.body.renamed === true, "(the state is renamed through the state panel)", rn.body);
    // the fixture can tell: were that state counted as Nova-named, the redraw WOULD re-key the region after it
    const would = md.rebuildStrategicRegions({ ...ctx(EARTH), dryRun: true, opts: { nameAfterStates: [big.id] } });
    ok((would.regionsNamed || []).some((r) => r.id === N && r.key === `NOVA_REGION_${N}`), "(CONTROL of the fixture: counted as Nova-named, the state would re-key its region)", (would.regionsNamed || []).map((r) => [r.id, r.key]));
    const r2 = await post("/api/map/rebuild-regions", redrawBody(EARTH.MOD));
    ok(r2.status === 200 && r2.body.ok === true, "(the second redraw is written)", r2.body.error || r2.body);
    ok(regionOverA(EARTH) === N && keyOf(EARTH.MOD, N) === "STRATEGICREGION_3", "⭐⭐⭐ the region keeps the base game's key after a panel rename of its largest state", keyOf(EARTH.MOD, N));
    ok(modLine(EARTH.MOD, "german", "STRATEGICREGION_3") === undefined && modLine(EARTH.MOD, "german", `NOVA_REGION_${N}`) === undefined,
      "⭐⭐ …so German still reads the base game's \"A North (de)\": no file of the mod's names it otherwise", [...linesIn(path.join(EARTH.MOD, "localisation"), /_l_german\.yml$/)]);
    ok(![...linesIn(path.join(EARTH.MOD, "localisation"), /^nova_region_names_l_[a-z_]+\.yml$/).values()].includes("Renamed Town"), "⭐⭐ …and no language's region names carry the state's new name");
    const dry = await post("/api/map/rebuild-regions", Object.assign({}, redrawBody(EARTH.MOD), { dryRun: true, confirm: undefined }));
    ok(dry.status === 200 && dry.body.summary && dry.body.summary.nothingToWrite === true, "⭐ a dry run after it has nothing to write", dry.body.summary || dry.body);

    const rL = await post("/api/map/rebuild-regions", redrawBody(LEG));
    ok(rL.status === 200 && rL.body.ok === true, "(the copy carrying 1.0.6's line is redrawn)", rL.body.error || rL.body);
    ok(keyOf(LEG, regionOverA(EARTH, LEG)) === "STRATEGICREGION_3" && modLine(LEG, "german", `NOVA_REGION_${N}`) === undefined,
      "⭐⭐ a 1.0.6 panel save (the shown name, copied beside replace/) leaves the region the base key too", keyOf(LEG, regionOverA(EARTH, LEG)));

    console.log("\n-- ⭐ CONTROL: on a generated world's new land, the same rename still names the region --");
    use(GEN);
    const g1 = await post("/api/map/rebuild-regions", redrawBody(GEN.MOD));
    const NG = regionOverA(GEN);
    ok(g1.status === 200 && g1.body.ok === true && keyOf(GEN.MOD, NG) === "STRATEGICREGION_3", "(the first redraw names the region over A by the base key: no state is Nova-named yet)", { ok: g1.body.ok, key: keyOf(GEN.MOD, NG) });
    const bigG = bigStateOfA(GEN);
    const gn = await post("/api/map/set-state", { modPath: GEN.MOD, stateId: bigG.id, nameKey: bigG.key, fields: { displayName: "Renamed Town" } });
    ok(gn.status === 200 && gn.body.renamed === true, "(the state is renamed through the state panel)", gn.body);
    const g2 = await post("/api/map/rebuild-regions", redrawBody(GEN.MOD));
    ok(g2.status === 200 && g2.body.ok === true && keyOf(GEN.MOD, NG) === `NOVA_REGION_${NG}` && modLine(GEN.MOD, "english", `NOVA_REGION_${NG}`) === "Renamed Town"
      && modLine(GEN.MOD, "german", `NOVA_REGION_${NG}`) === "Renamed Town",
    "⭐⭐ the region over the new land IS re-keyed after its state, in English and German", { key: keyOf(GEN.MOD, NG), en: modLine(GEN.MOD, "english", `NOVA_REGION_${NG}`), de: modLine(GEN.MOD, "german", `NOVA_REGION_${NG}`) });
    // ⭐⭐⭐ …and still when the modder ALSO names that state in a file of their own. A generated world's names are Nova's, not the
    // mod's own: a key its own English defines was dropped like a 1.0.x duplicate on Millennium Dawn, and the region went back to the
    // base game's name under it — the "AMAZONAS" #a-generated-world-names-its-places fixed (review of the bootstrap)
    const ownFile = path.join(GEN.MOD, "localisation", "english", "my_capitals_l_english.yml");
    fs.writeFileSync(ownFile, `﻿l_english:\n ${bigG.key}:0 "Capitalia"\n`);
    const g3 = await post("/api/map/rebuild-regions", redrawBody(GEN.MOD));
    ok(g3.status === 200 && g3.body.ok === true && keyOf(GEN.MOD, NG) === `NOVA_REGION_${NG}`, "⭐⭐⭐ the region over the new land keeps its state's name when the modder's own file names the state too", { key: keyOf(GEN.MOD, NG), error: g3.body.error });

    console.log("\n-- ⭐⭐⭐ a map that renumbered its states and names them itself: a 1.0.5 duplicate is the modder's --");
    use(MD);
    const bigM = bigStateOfA(MD);
    const mine = path.join(MD.MOD, "localisation", "english", "my_state_names_l_english.yml");
    fs.mkdirSync(path.dirname(mine), { recursive: true });
    fs.writeFileSync(mine, "﻿l_english:\n" + md.buildMapModel(ctx(MD)).states.map((s) => ` ${s.name}:0 "Own ${s.id}"`).join("\n") + "\n");
    legacyLine(MD.MOD, bigM.key, "Renamed Town");
    ok(md.statesOnNewLand({ gameRoot: MD.GAME, dependencyRoots: [], states: md.buildMapModel(ctx(MD)).states }).includes(bigM.id),
      "(precondition: the land test alone calls that state new — its id stood elsewhere below)", bigM);
    const m1 = await post("/api/map/rebuild-regions", redrawBody(MD.MOD));
    ok(m1.status === 200 && m1.body.ok === true, "(the redraw is written)", m1.body.error || m1.body);
    const NM = regionOverA(MD);
    ok(keyOf(MD.MOD, NM) === "STRATEGICREGION_3" && modLine(MD.MOD, "english", `NOVA_REGION_${NM}`) === undefined,
      "⭐⭐⭐ the region keeps its base key: a key the mod's own files name is theirs, whatever Nova's old file says", { key: keyOf(MD.MOD, NM), en: modLine(MD.MOD, "english", `NOVA_REGION_${NM}`) });

    console.log("\n-- ⭐⭐ the line between: a mod names its own states when its own English defines half of the loading states' keys --");
    const genKeys = md.buildMapModel(ctx(GEN)).states.map((s) => s.name), half = Math.ceil(genKeys.length / 2);
    const ownNames = (n) => fs.writeFileSync(ownFile, "﻿l_english:\n" + [bigG.key, ...genKeys.filter((k) => k !== bigG.key)].slice(0, n).map((k) => ` ${k}:0 "Own ${k}"`).join("\n") + "\n");
    ownNames(half - 1);
    ok(srv.novaNamedStateIds(GEN.MOD, GEN.GAME, []).includes(bigG.id), `⭐⭐ the modder's own English names ${half - 1} of the ${genKeys.length} states: that state still names its region`, srv.novaNamedStateIds(GEN.MOD, GEN.GAME, []));
    ownNames(half);
    ok(!srv.novaNamedStateIds(GEN.MOD, GEN.GAME, []).includes(bigG.id), `⭐⭐ …${half} of ${genKeys.length}: a map that names its own states, so a key it names is theirs`, srv.novaNamedStateIds(GEN.MOD, GEN.GAME, []));
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    for (const W of WORLDS) { try { fs.rmSync(W.ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})();
