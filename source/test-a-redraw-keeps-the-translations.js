// ⛔ #a-redraw-keeps-the-translations — REDRAW STRATEGIC REGIONS DOES NOT WRITE ENGLISH OVER A TRANSLATION.
//
// Redraw names the regions it makes in every language the game loads, carrying the English text where there is no
// translation (#a-region-name-in-every-language). It wrote that English over EVERY language's line of Nova's on every click —
// so a German name someone typed into Nova's German region-name file was gone at the next redraw. ✎ Rename next door already
// knew better (followRenameInOtherLanguages): a copy that still reads what English read before follows English; anything else
// is a translation someone made, and stays. Found by a read-only audit of the parked map findings (09-29).
//
// Driven through the endpoints with the bodies public/map.js sends, over a base game that names its regions in English and
// German. The English is made to move (every state renamed, so every region named after a state is renamed with it):
//   · a German translation in replace/ stays;
//   · one that lives only in the old file beside replace/ stays there (that file is pruned of Nova's keys);
//   · a German line that is still Nova's copy of the English follows the English — the control that the write still happens.
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

const G = makeRegionWorld("transl", { baseLoc: true });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
rec("(the dialog's request body was found in public/map.js)", /confirm:\s*true/.test(bodyText), bodyText);
const redrawBody = vm.runInNewContext("(" + bodyText + ")", { modPath: () => G.MOD });
// …and what the page says after the write, lifted out of it
const noteAt = MASKED.indexOf("function redrawNamesNote(");
const redrawNamesNote = noteAt < 0 ? null : vm.runInNewContext("(" + MAP.slice(noteAt, MASKED.indexOf("\n  }\n", noteAt) + 4) + ")", {});
rec("(redrawNamesNote was lifted out of public/map.js)", typeof redrawNamesNote === "function", null);

const md = require("./map-data.js");
const { createApp } = require("./server.js");
const LOC = (lang, legacy) => path.join(G.MOD, "localisation", lang, ...(legacy ? [] : ["replace"]), `nova_region_names_l_${lang}.yml`);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const valueIn = (text, key) => { const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"(.*)"[ \\t]*\\r?$`, "m").exec(text); return m ? m[1] : null; };
const setLine = (file, key, value) => {
  const text = read(file);
  const re = new RegExp(`^([ \\t]*${key}:\\d*[ \\t]*)"(.*)"`, "m");
  fs.writeFileSync(file, re.test(text) ? text.replace(re, (m, p) => `${p}"${value}"`) : `${text.replace(/\s*$/, "")}\n ${key}:0 "${value}"\n`);
};
const dropLine = (file, key) => fs.writeFileSync(file, read(file).replace(new RegExp(`^[ \\t]*${key}:[^\\n]*\\n`, "m"), ""));

(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));

    // ── 1. the first redraw names a region itself, after a state, in English and German ──
    const r1 = await post("/api/map/rebuild-regions", redrawBody);
    rec("(the first redraw is written)", r1.status === 200 && r1.body.ok === true, r1.body);
    const en1 = read(LOC("english")), de1 = read(LOC("german"));
    // a region named after a state is renamed with it: its English is what each round below moves
    const K = ([...en1.matchAll(/^[ \t]*(NOVA_REGION_\d+):\d*[ \t]*"(State \d+(?: Sea)?)"/gm)][0] || [])[1];
    rec("(precondition: a region Nova named after a state, with Nova's copy of the English in German)", !!K && valueIn(de1, K) === valueIn(en1, K), { en: en1, de: de1 });

    // Each round renames every state in the state panel — so the region named after one is renamed with it — then redraws.
    const m = md.buildMapModel({ modRoot: G.MOD, gameRoot: G.GAME, dependencyRoots: [] });
    // `nameOf(id, n)` names the states (default "Town <id> round <n>"); `namesFail`: this round's names write is meant to fail.
    let lastNames = null;
    const round = async (n, nameOf = null, namesFail = false) => {
      let renamed = 0;
      for (const st of m.states) {
        const r = await post("/api/map/set-state", { modPath: G.MOD, stateId: st.id, nameKey: st.name, fields: { displayName: nameOf ? nameOf(st.id, n) : `Town ${st.id} round ${n}` } });
        if (r.status === 200 && r.body.renamed) renamed++;
      }
      const enBefore = valueIn(read(LOC("english")), K);
      const r = await post("/api/map/rebuild-regions", redrawBody);
      const en = valueIn(read(LOC("english")), K);
      const rn = r.body.regionNames || {};
      lastNames = rn;
      rec(`(round ${n}: every state renamed, the redraw written${namesFail ? " with its German write failing" : ""}, and the region's English moved)`,
        renamed === m.states.length && r.status === 200 && r.body.ok === true && !rn.error && (namesFail ? (rn.failedLanguages || []).includes("german") : !(rn.failedLanguages || []).length) && en && en !== enBefore, { renamed, ok: r.body.ok, names: rn, enBefore, en });
      return en;
    };

    // ── 2. CONTROL: German untouched — Nova's copy follows the English ──
    const enA = await round(1);
    rec("⭐ CONTROL: a German line that is still Nova's copy of the English follows the English", valueIn(read(LOC("german")), K) === enA, { de: valueIn(read(LOC("german")), K), en: enA });

    // ── 3. someone translates it in Nova's German file ──
    setLine(LOC("german"), K, "Übersetzt im Ersatz");
    const enB = await round(2);
    rec("⭐⭐⭐ a German translation in Nova's German file stays when the English moves", valueIn(read(LOC("german")), K) === "Übersetzt im Ersatz", { de: valueIn(read(LOC("german")), K), en: enB });

    // ── 4. …or in the old German file beside replace/, with no line in replace/ ──
    dropLine(LOC("german"), K);
    fs.mkdirSync(path.dirname(LOC("german", true)), { recursive: true });
    fs.writeFileSync(LOC("german", true), "﻿l_german:\n " + K + ':0 "Übersetzt in der alten Datei"\n');
    await round(3);
    rec("⭐⭐⭐ a translation that lives only in the old German file stays there — not pruned, and not shadowed by English in replace/",
      valueIn(read(LOC("german", true)), K) === "Übersetzt in der alten Datei" && valueIn(read(LOC("german")), K) === null, { legacy: valueIn(read(LOC("german", true)), K), replace: valueIn(read(LOC("german")), K) });

    // ── 5. …but only while the key still names that place (#a-kept-name-keeps-its-kind, review of the keep) ──
    // NOVA_REGION_<id> follows its id, and the id can come to name other ground: a sea turned to land keeps its id. The record
    // of what each region was is set to say this one was the other kind; its translation is then not a name for it.
    dropLine(LOC("german", true), K);
    setLine(LOC("german"), K, "Übersetzt im Ersatz");
    const RECORD = md.regionNameRecordPath(G.MOD);
    const record = JSON.parse(read(RECORD) || "{}");
    const id = +K.replace(/^NOVA_REGION_/, "");
    const was = ((record["#kinds"] || {})[id] || [])[1];
    rec("(precondition: the record says what the region was, under the key it has)", (was === "sea" || was === "land") && record["#kinds"][id][0] === K, (record["#kinds"] || {})[id]);
    record["#kinds"][id] = [K, was === "sea" ? "land" : "sea"];
    fs.writeFileSync(RECORD, JSON.stringify(record, null, 1));
    const enD = await round(4);
    rec("⭐⭐ a translation of a region that was the other kind is not kept: the English goes over it, as before", valueIn(read(LOC("german")), K) === enD, { de: valueIn(read(LOC("german")), K), en: enD });

    // ── 6. a name holding a quote is still Nova's to redo (review of the keep) ──
    // The record holds the text as written; the line holds it escaped. Compared raw, `The "Homeland"` read as a name the modder
    // typed after the first redraw that wrote it, and the region never followed its state again.
    const enQ = await round(5, (id, n) => `The "Homeland" ${id} r${n}`);
    rec("(precondition: the region's English line holds an escaped quote)", /\\"/.test(enQ || ""), enQ);
    const enAfterQ = await round(6);
    rec("⭐⭐ …and the next redraw still renames it with its state", !!enAfterQ && !/Homeland/.test(enAfterQ), enAfterQ);

    // ── 7. a names write that fails part-way still records what English it wrote (review of the keep) ──
    // English is written first and the record last: when German's write threw, the record kept the last round's English, every
    // English name this click wrote read as the modder's, and the next redraw never touched them again.
    const DE = LOC("german");
    const deText = read(DE);
    const deBefore = valueIn(deText, K);
    fs.rmSync(DE);
    fs.mkdirSync(DE);                                     // a folder where German's file is: its read throws
    await round(7, null, true);
    // what the page says about it: its own words, lifted out of public/map.js and run on the answer the server just gave
    const note = redrawNamesNote ? redrawNamesNote(lastNames || {}) : "";
    rec("⭐⭐ the page says the names were written but not in German, and that Redraw finishes it — not that no name was written",
      /not in german/.test(note) && /Redraw again/.test(note) && !/could not be written/.test(note), { note, names: lastNames });
    fs.rmSync(DE, { recursive: true, force: true });
    fs.writeFileSync(DE, deText);
    rec("(precondition: German still holds Nova's copy of the English before the failed write)", deBefore === enAfterQ, { deBefore, enAfterQ });
    // …the dialog offers to finish it: the dry run does not call a language a write missed "nothing to write"
    const dry = await post("/api/map/rebuild-regions", Object.assign({}, redrawBody, { dryRun: true, confirm: undefined }));
    rec("⭐⭐ after a language's write failed, the next dry run says the names are out of date — the dialog keeps its Redraw button",
      dry.status === 200 && dry.body.summary && dry.body.summary.nothingToWrite === false && dry.body.summary.namesStale >= 1, dry.body.summary);
    const enAfterFail = valueIn(read(LOC("english")), K);
    const enNext = await round(8);
    rec("⭐⭐ the redraw after a failed German write still renames the region's English", !!enNext && enNext !== enAfterFail && /round 8/.test(enNext), { enAfterFail, enNext });
    rec("⭐⭐⭐ …and German, whose line was still Nova's copy of older English, follows it — not kept as if someone had translated it",
      valueIn(read(DE), K) === enNext, { de: valueIn(read(DE), K), en: enNext });

    // ── 8. …and the same in a world named before Nova recorded what it wrote in each language (a record with no "#copies") ──
    const older = JSON.parse(read(RECORD) || "{}");
    delete older["#copies"];
    fs.writeFileSync(RECORD, JSON.stringify(older, null, 1));
    const deText2 = read(DE);
    fs.rmSync(DE);
    fs.mkdirSync(DE);
    await round(9, null, true);
    fs.rmSync(DE, { recursive: true, force: true });
    fs.writeFileSync(DE, deText2);
    const enLast = await round(10);
    rec("⭐⭐ in a world whose record says nothing of German, German still follows the English after its write failed once",
      valueIn(read(DE), K) === enLast, { de: valueIn(read(DE), K), en: enLast });
    // …and goes on following it: what Nova wrote in German this time is what it recorded, not the copy the failure left behind
    const enAfter = await round(11);
    rec("⭐⭐ …and German keeps following the English at the redraw after that", valueIn(read(DE), K) === enAfter, { de: valueIn(read(DE), K), en: enAfter });
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
