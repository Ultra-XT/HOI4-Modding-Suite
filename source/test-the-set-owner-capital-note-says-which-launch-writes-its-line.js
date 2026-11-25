// The note the panel's Owner gives when it takes a country's capital says which launch writes the engine's line.
// ⛔ #a-map-message-says-which-launch-writes-the-line (tool campaign B6-25, S-4: the server's half)
//
// THE DEFECT. B6-25 found Map Errors and the 🔧 Auto-fix line saying 'HOI4 … logs it ("…")' for lines a normal launch never writes:
// the 1.19.4.1 byte-read put "Attempting to set capital state #… they dont own it!" on the log flag word 0x10004, whose one file entry
// sits behind the debug byte only -debug and -crash_data_log set. map-data.js's capital_state_owned_by_other and the page were
// reworded (test-a-map-message-says-which-launch-writes-the-line.js, test-the-map-page-says-which-launch-writes-a-line.js); the note
// POST /api/map/set-owner and create-country answer as `capitalWarning` (server.js capitalTransferWarning) still said "HOI4 refuses a
// capital a country does not own and logs it ("Attempting to set capital state #N … they dont own it!")", and neither guard reads
// server.js. The owner's playtests read error.log; the words sent the reader looking for a line that is not there.
//
// THE CHECKS.
//   1. RUN: the panel's Owner request (public/map.js queueWrite("/api/map/set-owner", { stateId, owner }); flushMapSaves adds modPath)
//      taking AAA's capital state while AAA keeps land: the answer's capitalWarning names -debug before the quote, and no "logs it".
//   2. SOURCE, comments masked: every place server.js's code quotes "they dont own it" names -debug earlier in the same sentence, and
//      never says "logs it" before it. At least one such place must exist, so a quote that moves away fails here instead of passing.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const DEBUG_NAMED = /only a launch started with -debug writes/;

const W = lib.makeWorld("set-owner-capital-line");
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
// AAA owns all three states of the base game; its history names state 2 its capital
lib.write(W.GAME, { "history/countries/AAA - Aland.txt": "capital = 2\n" });
const MOD = W.mod("Capital Line", {});

const { createApp } = require("./server.js");
(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);
    console.log("\n1. RUN: the panel's Owner takes AAA's capital, and AAA keeps land");
    const r = await S.post("/api/map/set-owner", { stateId: 2, owner: "BBB" }, MOD);
    const w = String((r.body && r.body.capitalWarning) || "");
    rec("the owner change is written", r.status === 200 && r.body.ok === true, r.body);
    rec("(the note is the one for a capital taken from a country that keeps land)", /State 2 was AAA's CAPITAL\. HOI4 refuses/.test(w) && !/only state/.test(w), w);
    const at = w.indexOf("they dont own it");
    rec("…and it quotes the engine's line", at !== -1, w);
    rec("⭐⭐ …after words saying only a launch started with -debug writes it to error.log", at !== -1 && DEBUG_NAMED.test(w.slice(0, at)) && /to error\.log/.test(w.slice(at)), w);
    rec("⭐ …and it no longer says HOI4 \"logs it\"", !/\blogs it\b/.test(w), w);

    console.log("\n2. SOURCE: every quote of the line in server.js's code");
    const src = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    const sites = [];
    for (let i = src.indexOf("they dont own it"); i !== -1; i = src.indexOf("they dont own it", i + 1)) {
      const lineStart = src.lastIndexOf("\n", i) + 1;
      // the sentence it stands in: back to the last ". " (or the start of the line), not across the template's ${…} holes
      const before = src.slice(lineStart, i);
      const sentence = before.slice(Math.max(before.lastIndexOf(". "), 0));
      sites.push({ line: src.slice(0, i).split("\n").length, sentence });
    }
    rec("the code of server.js quotes the line somewhere (else this half guards nothing)", sites.length >= 1, sites.length);
    const bad = sites.filter((s) => !DEBUG_NAMED.test(s.sentence) || /\blogs it\b/.test(s.sentence)).map((s) => `server.js:${s.line}: …${s.sentence.slice(-160)}`);
    rec("⭐⭐ every one names -debug before the quote, in the same sentence, and never says \"logs it\"", bad.length === 0, bad);
  } catch (e) {
    rec("threw: " + (e && e.stack || e), false);
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  - " + fails.join("\n  - ")); process.exitCode = 1; }
})();
