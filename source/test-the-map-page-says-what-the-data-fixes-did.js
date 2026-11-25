// ⛔ THE MAP PAGE SAYS WHAT THE DATA FIXES DID (tool campaign B2/B5, the page's half of four data fixes, 2026-11-19).
//
// Four repairs of this round live on the server (map-data.js, server.js); each answers a new field, and a field the page never reads is a
// repair nobody is told about. This file pins the page's half of each, run out of public/map.js itself (comments masked):
//
//   §1 B2-26 #a-new-country-that-fails-part-way-says-what-it-made — ✨ New country names the states it could not take (createCountry's
//      `failedStates` [{ id, error }] or plain ids, and its own `warning`), in the alert and in the line the reload leaves.
//   §2 B5-WD1 #generate-land-ends-with-the-auto-fix-repair — 🌍 Generate land's line says what the repair run after the land did (`autoFix`,
//      with `forFatal`), or that it did not finish; and its dialog stops promising "nothing crashes" and says, in the owner's words
//      (2026-11-18), that the land joins the world already there, where 🌍 Generate a world makes a whole new one.
//   §3 B2-17 #a-merge-says-it-overfills-the-slots — 🔀 Merge says when the sum it carries leaves the kept state over its category's slots,
//      counted as state_buildings_exceed_slots counts them (map-data.js stateSharedBuildingsAndSlots, lifted and asked the same question).
//   §4 B2-11 #a-cleared-state-name-box-writes-no-empty-name — the Save takes the state's name from set-state's answer (`displayName`).
//
// Every server field may be missing (a server from before): the page then says what it said before, which each section checks too.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label + (detail !== undefined ? " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600) : "")); }
}
function section(name, fn) {
  console.log("\n" + name);
  try { fn(); } catch (e) { fail++; console.log("  ✗ threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); }
}

// ── §1 B2-26 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section("§1 ✨ New country names the states it could not take (B2-26)", () => {
  const page = P.runPage(["function createdCountryFailedNote("]);
  const note = page.sb.createdCountryFailedNote;
  const objs = note({ ok: true, tag: "NEW", owned: 1, failedStates: [{ id: 64, error: "EACCES: permission denied, open 'history/states/64-x.txt'" }, { id: 65, error: "" }] });
  ok(/2 of the states you claimed could not be given to it/.test(objs) && /state 64 \(EACCES/.test(objs) && /state 65\b/.test(objs), "the answer's failedStates are named, with their causes", objs);
  ok(/paint them to NEW with 🖌 Paint owner/.test(objs), "…and the step that finishes it is one a Map tool takes", objs);
  ok(/state 7; state 8/.test(note({ ok: true, tag: "NEW", failedStates: [7, 8] })), "plain ids (the shape before) are named too");
  ok(note({ ok: true, tag: "NEW", warning: "NEW was made, but 1 of its 2 states could not be given to it." }) === "NEW was made, but 1 of its 2 states could not be given to it.",
    "the server's own sentence, when it sends one, is said as it is");
  ok(note({ ok: true, tag: "NEW", owned: 3 }) === "" && note({ ok: true, failedStates: [] }) === "" && note(null) === "", "a country that got every state (or an old server's answer) adds nothing");
  const many = note({ ok: true, tag: "NEW", failedStates: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  ok(/9 of the states/.test(many) && /and 3 more/.test(many), "a long list is capped and counted", many);

  // the handler: the alert and the line the reload leaves both carry it
  const at = P.MASKED.indexOf('fetch("/api/map/create-country"');
  const end = at < 0 ? -1 : P.MASKED.indexOf('.catch((e) => setStatus("✨ Create failed: "', at);
  const handler = at < 0 || end < 0 ? "" : P.MASKED.slice(at, end);
  ok(handler.length > 0, "the ✨ New country handler is found from its POST to its catch");
  const failedVar = (/const (\w+) = [^;\n]*createdCountryFailedNote\(res\)/.exec(handler) || [])[1];
  ok(!!failedVar, "the handler asks createdCountryFailedNote of the answer", handler.slice(0, 300));
  if (failedVar) {
    const alertLine = handler.split(/\r?\n/).find((l) => /nbAlert\(/.test(l)) || "";
    const alertBuilt = handler.split(/\r?\n/).filter((l) => new RegExp("\\b" + failedVar + "\\b").test(l) && /join\(|alertText|\bmsg\b/.test(l)).join(" ");
    ok(new RegExp("\\b" + failedVar + "\\b").test(alertBuilt) && /nbAlert\(/.test(alertLine), "…the alert says it", alertBuilt + " || " + alertLine);
    const loadLine = handler.slice(handler.indexOf("load(`✨ Created"), handler.indexOf(";", handler.indexOf("load(`✨ Created")));
    ok(new RegExp("\\b" + failedVar + "\\b").test(loadLine), "…and so does the line the reload leaves on screen", loadLine);
  }
});

// ── §2 B5-WD1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
section("§2 🌍 Generate land says what the repair after it did, and joins the world already there (B5-WD1, owner 11-18)", () => {
  const page = P.runPage(["function generatedLandAutoFixNote("], { statusEl: null });
  const note = page.sb.generatedLandAutoFixNote;
  const labels = require("./public/map-rule-labels.js");
  const label = labels.mapRuleLabel("fractioned_naval_region");
  ok(typeof label === "string" && label.length > 0, "the rule has a label to say", label);
  const ran = note({ flippedProvinces: 10, autoFix: { ok: true, fixes: { fractionedNaval: { fixed: 1 } }, forFatal: ["fractioned_naval_region"] } });
  ok(ran.indexOf(label) !== -1 && /HOI4 refuses to load/.test(ran) && /Auto-fix all/.test(ran), "a repair that ran is said, naming the rule that called for it", ran);
  const notDone = note({ autoFix: { ok: false, error: "the map is read-only.", forFatal: ["fractioned_naval_region"] } });
  ok(/did not finish/.test(notDone) && /the map is read-only\)/.test(notDone) && /Run 🔧 Auto-fix all/.test(notDone) && !/Nova ran 🔧 Auto-fix all's repair/.test(notDone),
    "a repair that did not finish says the problem is still there and names the button that clears it", notDone);
  ok(note({ flippedProvinces: 10 }) === "" && note(null) === "" && note({ autoFix: null }) === "", "no repair (nothing fatal was left, or a server from before): nothing added");

  // the click's success line carries it: the report line the tests of each Generate land note read, built from the masked page
  const line = P.generateLandReportLine(P.MASKED);
  ok(line.length > 0, "🌍 Generate land's success reload is still exactly reloadAfterImmediateWrite(generatedLandResultNote(res))");
  const repairVar = (/const (\w+) = generatedLandAutoFixNote\(res\)/.exec(line) || [])[1];
  ok(!!repairVar && new RegExp("\\$\\{(?:" + repairVar + "|\\w*[Rr]epaired\\w*)\\}").test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))),
    "…and generatedLandResultNote puts the repair's note in the line", line.slice(-400));

  // the dialog and the button's title (public/map.html)
  const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const text = (s) => String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const dlgAt = html.indexOf('id="mapGenConfirm"');
  const dlg = dlgAt < 0 ? "" : html.slice(dlgAt, html.indexOf('id="mapGenWarn"', dlgAt));
  const btn = (/<button id="mapGenerateLand"[^>]*title="([^"]*)"/.exec(html) || [])[1] || "";
  for (const [where, words] of [["the dialog", text(dlg)], ["the button's title", btn]]) {
    ok(/joins the world that is already there/.test(words) && /🌍 Generate a world/.test(words), `${where} says the land joins the world already there, and names 🌍 Generate a world for a new one`, words);
    ok(!/nothing crashes|crash-safe|so that nothing crash/i.test(words), `${where} does not promise that nothing crashes`, words);
  }
  const warnAt = html.indexOf('id="mapGenWarn"');
  const warn = warnAt < 0 ? "" : text(html.slice(warnAt, html.indexOf("</div>", warnAt)));
  ok(/🌍 Generate a world/.test(warn), "the populated-map warning names 🌍 Generate a world for a whole new world", warn);
});

// ── §3 B2-17 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section("§3 🔀 Merge says when its sum leaves the kept state over its slots (B2-17)", () => {
  const page = P.runPage(["function mergeOverSlotsNote("]);
  const note = page.sb.mergeOverSlotsNote;
  // the validator's own count, lifted out of map-data.js
  const MD = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const MDM = maskJsComments(MD);
  const liftTop = (opening) => P.liftFrom(MD, MDM, opening, "\n}", "map-data.js");
  const oneLine = (opening) => { const s = MDM.indexOf(opening); if (s < 0) throw new Error("map-data.js has no " + opening); return MD.slice(s, MDM.indexOf("\n", s)); };
  const sb = {}; vm.createContext(sb);
  vm.runInContext(oneLine("function foldStateCategory(") + "\n" + liftTop("function stateCategoryKeyIn(") + "\n" + liftTop("function stateSharedBuildingsAndSlots(")
    + "\nthis.count = stateSharedBuildingsAndSlots;", sb);
  const slots = { rural: 2, town: 4, City: 6, city: 9, wasteland: 0, "Ünique": 1 };
  const cases = [
    { id: 1, category: "rural", buildings: { industrial_complex: 2, arms_factory: 1 } },
    { id: 2, category: "rural", buildings: { industrial_complex: 1, arms_factory: 1 } },
    { id: 3, category: "town", buildings: { industrial_complex: 3, dockyard: 1, infrastructure: 9 } },
    { id: 4, category: "town", buildings: { industrial_complex: 3, dockyard: 2 }, extraBuildingSlots: 1 },
    { id: 5, category: "city", buildings: { arms_factory: 7 } },
    { id: 6, category: "megalopolis", buildings: { arms_factory: 30 } },
    { id: 7, category: "wasteland", buildings: {} },
    { id: 8, category: "town", buildings: { industrial_complex: 3, dockyard: 3 }, extraBuildingSlots: 1 },
    { id: 9, category: "CITY", buildings: { arms_factory: 7 } },
    { id: 10, category: " town ", buildings: { arms_factory: 5 } },
    { id: 11, category: "ünique", buildings: { arms_factory: 2 } },
    { id: 12, category: "", buildings: { arms_factory: 2 } },
  ];
  for (const st of cases) {
    const v = sb.count({ categorySlots: slots }, st);
    const over = !!(v && v.shared > v.slots);
    const said = note(st, slots, `State ${st.id}`);
    ok(over === (said !== ""), `state ${st.id} (${st.category}): the page says “over” exactly when the validator counts it over`, { validator: v, said });
    if (over) ok(said.indexOf(String(v.shared)) !== -1 && said.indexOf(String(v.slots)) !== -1 && /HOI4 loads it/.test(said) && /state panel/.test(said),
      `…and says the two counts, that HOI4 loads it, and where to lower them`, said);
  }
  ok(note(null, slots) === "" && note({ id: 9, category: "rural", buildings: { arms_factory: 9 } }, undefined) === "", "no state or no slot table (a model from before): nothing said");

  const merge = P.lift("function doMergeState(");
  const mergeMasked = maskJsComments(merge);
  const overVar = (/const (\w+) = [^;\n]*mergeOverSlotsNote\(\s*dstSt\s*,\s*model\.categorySlots/.exec(mergeMasked) || [])[1];
  ok(!!overVar, "doMergeState asks it of the kept state and the model's slot table");
  const lineAt = mergeMasked.indexOf("const mergedLine = ");
  const sumAt = mergeMasked.indexOf("dstSt.buildings = sumInto(");
  ok(lineAt > 0 && sumAt > 0 && sumAt < mergeMasked.indexOf("mergeOverSlotsNote(dstSt"), "…after the merge has summed the buildings into it");
  ok(!!overVar && new RegExp("\\$\\{" + overVar + "\\b").test(mergeMasked.slice(lineAt, mergeMasked.indexOf("\n", lineAt))), "…and the merge's status line carries it", mergeMasked.slice(lineAt, lineAt + 300));
});

// ── §4 B2-11 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section("§4 the Save takes a state's name from set-state's answer (B2-11)", () => {
  const save = P.lift("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
  const saveMasked = maskJsComments(save);
  const stmt = saveMasked.split(/\r?\n/).map((l) => l.trim()).filter((l) => /"\/api\/map\/set-state"/.test(l) && /res\.displayName/.test(l));
  ok(stmt.length === 1, "the Save loop has exactly one statement that reads set-state's displayName", stmt);
  if (stmt.length !== 1) return;
  const run = (w, res, states) => {
    const stateById = new Map(states.map((s) => [s.id, s]));
    const body = Object.assign({}, w.body);
    vm.runInNewContext(stmt[0], { w, res, body, stateById });
    return stateById;
  };
  const a = run({ url: "/api/map/set-state", body: { stateId: 16, fields: { displayName: "" } } }, { ok: true, displayName: "Bordeaux", nameRefused: "…" }, [{ id: 16, displayName: "Gironde" }]);
  ok(a.get(16).displayName === "Bordeaux", "the name the server says is in effect is what the page shows", a.get(16));
  const b = run({ url: "/api/map/set-state", body: { stateId: 16, fields: { manpower: 5 } } }, { ok: true }, [{ id: 16, displayName: "Gironde" }]);
  ok(b.get(16).displayName === "Gironde", "an answer without the field (a server from before) leaves the page's name as it was");
  const c = run({ url: "/api/map/set-owner", body: { stateId: 16 } }, { ok: true, displayName: "X" }, [{ id: 16, displayName: "Gironde" }]);
  ok(c.get(16).displayName === "Gironde", "another write's answer is not read as a name");
  const d = run({ url: "/api/map/set-state", body: { stateId: 99 } }, { ok: true, displayName: "X" }, [{ id: 16, displayName: "Gironde" }]);
  ok(d.get(16).displayName === "Gironde" && !d.has(99), "a state the page does not hold is left alone");
  // the id it looks the state up by is the Save's remapped one (a new state saved in the same Save)
  const remapAt = saveMasked.indexOf("for (const f of STATE_ID_FIELDS) if (f in body) body[f] = remap(body[f]);");
  ok(remapAt > 0 && remapAt < saveMasked.indexOf(stmt[0]) && /stateById\.get\(body\.stateId\)/.test(stmt[0]), "…and it looks the state up by the Save's remapped id");
});

// (§5 B2-8, the 🔧 line's Air base step, is group a's: their 9d845e99 changes that line, and test-a-wing-with-no-base-at-home-names-the-map-step.js
// pins it. It is not written twice.)

// ── §6 B2-25 ────────────────────────────────────────────────────────────
// #auto-fix-names-the-trim-it-makes — a click whose only change to map/buildings.txt was the blank line off its end says it.
section("§6 the 🔧 line names a trim of map/buildings.txt (B2-25)", () => {
  const only = P.autoFixSummary({ ok: true, fixes: { buildingsTxt: { changed: true, rehomed: 0, trimmed: 1, file: "map/buildings.txt" } } });
  ok(/took the blank line off the end of map\/buildings\.txt, rewriting the file for it/.test(only), "a trim alone is said, with the rewrite it cost", only);
  const both = P.autoFixSummary({ ok: true, fixes: { buildingsTxt: { changed: true, rehomed: 4, trimmed: 2, file: "map/buildings.txt" } } });
  ok(/re-homed 4 map building\(s\)/.test(both) && /took 2 blank lines off the end of map\/buildings\.txt \(HOI4/.test(both) && !/rewriting the file for it/.test(both), "with re-homes: the trim is said beside them", both);
  const old = P.autoFixSummary({ ok: true, fixes: { buildingsTxt: { changed: false, rehomed: 0 } } });
  ok(!/blank line/.test(old), "nothing trimmed (or a server from before): nothing said", old);
});

// ── §7 B2-19 ────────────────────────────────────────────────────────────
// #a-capital-write-says-it-copied-the-history-in — Set capital on a country whose history the mod does not ship copies the file in; the
// Save line says the history is now the mod's own (setCountryCapital's `materialisedFrom`, group a; missing = the old words).
section("§7 the Save line says Set capital made the country's history the mod's own (B2-19)", () => {
  const page = P.runPage(["function setCapitalNote("]);
  const f = page.sb.setCapitalNote;
  // (setCountryCapital's answer, group a: { file, layer: "base game" | "dependency", root })
  const a = f("FRA", 16, { ok: true, materialisedFrom: { file: "history/countries/FRA - France.txt", layer: "base game", root: "D:/game" } });
  const dep = f("FRA", 16, { ok: true, materialisedFrom: { file: "history/countries/FRA - France.txt", layer: "dependency", root: "D:/mods/base" } });
  ok(/copied in from a mod it depends on and frozen/.test(dep), "a file from a dependency is said so", dep);
  ok(/^🏛 To set it, FRA's history \(history\/countries\/FRA - France\.txt\) is now your mod's own, copied in from the base game and frozen at this build of the game: a later game update to that file no longer reaches FRA\.$/.test(a), "the copied file, its layer and what it costs are said", a);
  const b = f("FRA", 16, { ok: true, materialisedFrom: "history/countries/FRA - France.txt" });
  ok(/FRA's history \(history\/countries\/FRA - France\.txt\) is now your mod's own, copied in and frozen/.test(b), "a plain path is read too", b);
  // (review of the words) what stops reaching it is the layer's own updates: a dependency's, not the game's; a layer not named names none
  ok(/frozen as that mod has it now: a later update of that mod to the file no longer reaches FRA\.$/.test(dep) && !/game update|build of the game/.test(dep),
    "a file copied from a dependency says that mod's updates stop reaching it, not the game's", dep);
  ok(!/game update|build of the game/.test(b) && /a later update of the file it was copied from no longer reaches FRA\.$/.test(b), "…and one whose layer is not named does not say it was the game's", b);
  const c = f("FRA", 16, { ok: true });
  ok(c === "", "an answer without the field (a server from before): nothing said", c);
  const d = f("PRC", 600, { ok: true, setCapitalPointed: { lines: 1, from: [601], to: 600 }, materialisedFrom: "history/countries/PRC - China.txt" });
  ok(/^🏛 PRC's history also runs set_capital/.test(d) && /🏛 To set it, PRC's history .* no longer reaches PRC\.$/.test(d), "…said after what Set capital did to the set_capital lines", d);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
