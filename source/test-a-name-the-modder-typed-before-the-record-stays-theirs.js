// ⛔ #a-kept-name-is-recorded-as-theirs, #a-region-name-is-judged-before-its-states-go — A REGION NAME THE MODDER TYPED STAYS THEIRS,
// EVEN WHERE NO RECORD SAID SO.
//
// A line of Nova's region-names file that the record (regionNameRecordPath) says nothing about — a world redrawn before 025324d,
// a copy of a mod, a mod after NOVA_HOME moved — is judged by what it reads (#a-region-name-nova-wrote-before-the-record). Review
// of that bootstrap, measured through the endpoints:
//   · the redraw that judged a line the modder's KEPT it and recorded nothing, so every redraw after judged it again. Once the
//     modder named a state after the region's typed name ("Eastmark"), it read as derived, and the next redraw overwrote it with
//     "Aldutriav" in English and German; the same steps on a world whose record existed from the start kept it;
//   · over vanilla, every one of its 302 region names read as derived, so a plain "North Sea" typed the same way went too;
//   · Delete map removes the states that judgment reads, so a region still named after a gone state read as typed (TEST 31 with
//     the state-names fix merged: 4 of the regions that stayed kept the first world's names);
//   · a record Nova cannot read opened the judgment on every line for good, where it had meant "every line is the modder's".
//
// Pinned, with the bodies public/map.js sends:
//   · a copy of a redrawn world (no record): the redraw keeps "Eastmark", typed through ✎ Rename, records it as the modder's, and
//     keeps it after a state is named "Eastmark" too, in English and German; the region named after that state takes "Eastmark 2";
//     a real sea's name typed the same way ("West Sea", the base game's for a sea the world still has) is kept and recorded too;
//   · a redraw that has no name to write records the lines it kept all the same;
//   · a record that cannot be read: a name typed after the redraw it recorded stays, although it reads as a state's name;
//   · Delete map records every such line before the states go — Nova's by its text, the modder's as null — so once the old states'
//     names are gone, a region named after one is still Nova's (CONTROL: judged after they are gone, it reads as typed).
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
const W = makeRegionWorld("typed-before-record", { baseLoc: true, baseStates: "elsewhere" });
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
ok(/queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MASKED) && /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MASKED)
  && /queueWrite\("\/api\/map\/blank-to-sea", \{\}\)/.test(MASKED) && /Object\.assign\(\{\}, w\.body, \{ modPath: modPath\(\) \}\)/.test(MASKED),
  "(the page renames a region as { nameKey, name }, a state as { stateId, nameKey, fields }, and Delete map sends {}; the flush adds modPath)");

const md = require("./map-data.js");
const ctx = (mod) => ({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [] });
const KEY_LINE = /^[ \t]*([A-Za-z0-9_.\-]+):\d*[ \t]*"(.*)"[ \t]*(?:#[^\n]*)?\r?$/gm;
const lines = (abs) => { const m = new Map(); try { for (const x of fs.readFileSync(abs, "utf8").matchAll(KEY_LINE)) m.set(x[1], x[2]); } catch (_) {} return m; };
const regionFile = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_region_names_l_${lang}.yml`);
const en = (mod, k) => lines(regionFile(mod, "english")).get(k), de = (mod, k) => lines(regionFile(mod, "german")).get(k);
const recordOf = (mod) => { try { return JSON.parse(fs.readFileSync(md.regionNameRecordPath(mod), "utf8")); } catch (_) { return null; } };
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
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
const novaStates = (mod) => path.join(mod, "localisation", "english", "replace", "nova_state_names_l_english.yml");
const writeStateNames = (mod, name) => {
  fs.mkdirSync(path.dirname(novaStates(mod)), { recursive: true });
  fs.writeFileSync(novaStates(mod), "﻿l_english:\n" + states.map((s) => ` ${s.name}:0 "${name(s)}"\n ${vpOf.get(s.name)}:0 "${name(s)}"`).join("\n") + "\n");
};
writeStateNames(W.MOD, (s) => nameOf.get(s.name));

const srv = require("./server.js");
(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    const derives = (mod) => srv.regionNamesNovaDerive({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [], nm: (srv.getLocalizationMap(mod) || {}).names || {}, ownVals: lines(regionFile(mod, "english")) });

    // ── the world is redrawn once: its names are written, and recorded ──
    const r1 = await post("/api/map/rebuild-regions", redrawBody(W.MOD));
    ok(r1.status === 200 && r1.body.ok === true && r1.body.regionNames && r1.body.regionNames.written > 0, "(the first redraw is written and names its regions)", r1.body.regionNames || r1.body);
    const A = regionAt(W.MOD, W.idAt(4, 0)), B = regionAt(W.MOD, W.idAt(11, 0)), I = regionAt(W.MOD, W.PROV.isletA);
    const kA = keyOf(W.MOD, A), kB = keyOf(W.MOD, B), kI = keyOf(W.MOD, I);
    const before = lines(regionFile(W.MOD, "english"));
    const novaKeys = [...before.keys()].filter((k) => /^NOVA_REGION_\d+$/.test(k));
    ok(new Set([kA, kB, kI]).size === 3 && [kA, kB, kI].every((k) => novaKeys.includes(k) && [...nameOf.values()].includes(before.get(k))),
      "(precondition: the land regions over A, B and the islets are each named after a state, under a NOVA_REGION key)", { kA, kB, kI, before: [...before] });
    // a copy of it: a world whose record is not there, as every world redrawn before 025324d
    const copyOf = (name) => {
      const C = path.join(path.dirname(W.MOD), name);
      fs.cpSync(W.MOD, C, { recursive: true });
      fs.writeFileSync(path.join(C, "descriptor.mod"), fs.readFileSync(path.join(W.MOD, "descriptor.mod"), "utf8").replace(/name="[^"]*"/, () => `name="${name}"`));
      return C;
    };
    const bigA = [...nameOf].find(([, v]) => v === before.get(kA));
    const bigStateId = Number(bigA[0].slice("STATE_".length));
    // the copies Delete map is asked of at the end, taken while the world is as the redraw left it
    const BL = copyOf("blanked"), NR = copyOf("unrecorded");

    console.log("\n-- ⭐⭐⭐ a name the redraw keeps as the modder's is recorded as theirs, and stays theirs --");
    const COPY = copyOf("copied");
    ok(!fs.existsSync(md.regionNameRecordPath(COPY)), "(precondition: the copy has no record)");
    const rr = await post("/api/map/set-region-name", { modPath: COPY, nameKey: kB, name: "Eastmark" });
    ok(rr.status === 200 && rr.body.renamed, `(${kB} is renamed "Eastmark" through ✎ Rename)`, rr.body);
    // …and the islets' region to a real sea's name: the base game's for the west sea, which the world still has under the base
    // game's key — what a modder renaming a region over vanilla is likeliest to type, and one of the 302 names over vanilla the
    // bootstrap took for Nova's
    const kW = keyOf(COPY, regionAt(COPY, W.idAt(7, 0))), westSea = ((srv.getLocalizationMap(COPY) || {}).names || {})[kW];
    const ri = await post("/api/map/set-region-name", { modPath: COPY, nameKey: kI, name: westSea });
    ok(kW === "STRATEGICREGION_1" && !!westSea && ri.status === 200 && ri.body.renamed, `(${kI} is renamed "${westSea}", the base game's name for ${kW}, through ✎ Rename)`, { kW, westSea, body: ri.body });
    const r2 = await post("/api/map/rebuild-regions", redrawBody(COPY));
    ok(r2.status === 200 && r2.body.ok === true && r2.body.regionNames && en(COPY, kB) === "Eastmark",
      `(the redraw keeps ${kB}: "Eastmark" reads as nothing a redraw derives)`, { names: r2.body.regionNames || r2.body, en: en(COPY, kB) });
    ok(en(COPY, kI) === westSea, `⭐⭐⭐ ${kI} keeps "${westSea}": a base region's name is a NOVA_REGION line's only with a number`, en(COPY, kI));
    const rec2 = recordOf(COPY);
    ok(has(rec2, kB) && rec2[kB] === null && has(rec2, kI) && rec2[kI] === null, `⭐⭐⭐ …and records both as the modder's (null): neither is judged by what it reads again`, rec2 && { [kB]: rec2[kB], [kI]: rec2[kI] });
    ok(has(rec2, kA) && rec2[kA] === before.get(kA), `(${kA}, which it named, is recorded by its text as before)`, rec2 && rec2[kA]);
    const deB = de(COPY, kB);
    // later, the modder names the state the region over A is named after "Eastmark" as well — the name now reads as a state's
    const rs = await post("/api/map/set-state", { modPath: COPY, stateId: bigStateId, nameKey: bigA[0], fields: { displayName: "Eastmark" } });
    ok(rs.status === 200 && rs.body.renamed === true, `(state ${bigStateId}, "${bigA[1]}", is renamed "Eastmark" through the state panel)`, rs.body);
    ok(derives(COPY)("Eastmark"), "(CONTROL of the fixture: \"Eastmark\" now reads as a name the redraw derives)");
    const r3 = await post("/api/map/rebuild-regions", redrawBody(COPY));
    ok(r3.status === 200 && r3.body.ok === true, "(the copy is redrawn again)", r3.body.error || r3.body);
    ok(en(COPY, kB) === "Eastmark" && de(COPY, kB) === deB, `⭐⭐⭐ ${kB} keeps "Eastmark", in English and German`, { en: en(COPY, kB), de: de(COPY, kB), deBefore: deB });
    ok(en(COPY, kI) === westSea, `(${kI} keeps "${westSea}")`, en(COPY, kI));
    ok(en(COPY, kA) === "Eastmark 2" && de(COPY, kA) === "Eastmark 2", `⭐ …and ${kA} follows its state, told apart by a number`, { en: en(COPY, kA), de: de(COPY, kA) });

    console.log("\n-- ⭐⭐ a redraw with no name to write records the names it kept all the same --");
    const ALL = copyOf("all-typed");
    const typed = new Map(novaKeys.map((k, i) => [k, `Typed ${String.fromCharCode(65 + i)}land`]));
    for (const [k, v] of typed) {
      const t = await post("/api/map/set-region-name", { modPath: ALL, nameKey: k, name: v });
      ok(t.status === 200 && t.body.renamed, `(${k} is renamed "${v}" through ✎ Rename)`, t.body);
    }
    const dryAll = await post("/api/map/rebuild-regions", dryBody(ALL));
    ok(dryAll.status === 200 && dryAll.body.summary && dryAll.body.summary.nothingToWrite === true, "(precondition: every name is the modder's, so there is nothing to write)", dryAll.body.summary || dryAll.body);
    const rA = await post("/api/map/rebuild-regions", redrawBody(ALL));
    ok(rA.status === 200 && rA.body.ok === true && rA.body.regionNames && rA.body.regionNames.written === 0 && rA.body.regionNames.kept === novaKeys.length,
      `(the redraw writes no name and keeps all ${novaKeys.length})`, rA.body.regionNames || rA.body);
    const recA = recordOf(ALL) || {};
    ok(novaKeys.every((k) => has(recA, k) && recA[k] === null), `⭐⭐ …and records each of the ${novaKeys.length} as the modder's`, novaKeys.map((k) => [k, recA[k]]));

    console.log("\n-- ⭐⭐⭐ a record Nova cannot read: every line stays the modder's --");
    const typedI = nameOf.get("STATE_5");
    const rt = await post("/api/map/set-region-name", { modPath: W.MOD, nameKey: kI, name: typedI });
    ok(rt.status === 200 && rt.body.renamed && typedI !== before.get(kI), `(${kI} is renamed "${typedI}" — another state's name — after the redraw that recorded it)`, rt.body);
    ok(derives(W.MOD)(typedI), "(CONTROL of the fixture: it reads as a name the redraw derives)");
    const deI = de(W.MOD, kI);
    fs.writeFileSync(md.regionNameRecordPath(W.MOD), "{ not json");
    const ru = await post("/api/map/rebuild-regions", redrawBody(W.MOD));
    ok(ru.status === 200 && ru.body.ok === true, "(the world is redrawn over its unreadable record)", ru.body.error || ru.body);
    ok(en(W.MOD, kI) === typedI && de(W.MOD, kI) === deI, `⭐⭐⭐ ${kI} keeps "${typedI}", in English and German`, { en: en(W.MOD, kI), de: de(W.MOD, kI), deBefore: deI });
    ok(fs.readFileSync(md.regionNameRecordPath(W.MOD), "utf8") === "{ not json", "(the unreadable record is left as it was)");

    console.log("\n-- ⭐⭐⭐ Delete map records every such line before the states go --");
    const rb = await post("/api/map/set-region-name", { modPath: BL, nameKey: kB, name: "Eastmark" });
    ok(rb.status === 200 && rb.body.renamed, `(${kB} is renamed "Eastmark" through ✎ Rename)`, rb.body);
    ok(!fs.existsSync(md.regionNameRecordPath(BL)), "(precondition: the copy has no record)");
    const bl = await post("/api/map/blank-to-sea", { modPath: BL });
    ok(bl.status === 200 && bl.body.ok === true && bl.body.changed === true && md.buildMapModel(ctx(BL)).states.length === 0, "(Delete map is written: no state is left)", bl.body.error || { changed: bl.body.changed });
    const recB = recordOf(BL) || {};
    const nova = novaKeys.filter((k) => k !== kB);
    ok(nova.length > 0 && nova.every((k) => has(recB, k) && recB[k] === before.get(k)), `⭐⭐⭐ each of the ${nova.length} names Nova wrote is recorded as Nova's, by its text`, nova.map((k) => [k, recB[k], before.get(k)]));
    ok(has(recB, kB) && recB[kB] === null, `⭐⭐ …and the typed "Eastmark" as the modder's`, { has: has(recB, kB), v: recB[kB] });
    // the new world's states are named afresh (the state-names fix overwrites the old world's lines): stand in for it
    const fresh = (s) => md.generatedPlaceName(7, s.id);
    const old = new Set(nameOf.values());
    ok(states.every((s) => !old.has(fresh(s))), "(the fixture: the fresh names are none of the old ones)", states.map((s) => fresh(s)));
    writeStateNames(BL, fresh);
    const ownB = srv.regionNameOwnership(BL, { gameRoot: W.GAME, dependencyRoots: [] });
    ok(!ownB.theirs(kA) && ownB.theirs(kB), `⭐⭐⭐ with the old states' names gone, ${kA} ("${before.get(kA)}") is still Nova's and ${kB} still the modder's`, { [kA]: ownB.theirs(kA), [kB]: ownB.theirs(kB) });
    // CONTROL: the same names gone with nothing recorded first — the fixture can tell
    writeStateNames(NR, fresh);
    ok(srv.regionNameOwnership(NR, { gameRoot: W.GAME, dependencyRoots: [] }).theirs(kA), `(CONTROL: judged after the names are gone, ${kA} reads as typed)`);
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(W.ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})();
