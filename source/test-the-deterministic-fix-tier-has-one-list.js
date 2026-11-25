// ⛔ #deterministic-tier-typed-in-four-places + #tooltip-key-went-to-the-ai
//
// Mod Health has two fix tiers. The DETERMINISTIC tier is the one that matters: free, offline, instant, and
// it cannot invent, because every problem in it has exactly one correct answer. The owner's standing
// instruction is to WIDEN it rather than route more problems to a model.
//
// Widening it was harder than it should have been, because membership was written out by hand at four
// separate sites — the per-card button, the "Fix all" banner, the batch runner's filter, and the confirm
// dialog's wording. Miss one and the failure is silent and asymmetric: a card offers a blue "Auto-fix" that
// the batch then skips, or the banner counts problems the runner will not touch. There is now ONE set.
//
// The first rule added through it: `tooltip_key_no_localization`. A custom_effect_tooltip naming a key with
// no text is the SAME repair as a missing entity name — write `<key>:0 "<text>"` into a .yml — but it was
// not in the server's deterministic branch, so it fell through to the AI, which was asked to edit the .txt
// SCRIPT the tooltip line lives in. That is the wrong file: the key belongs in a .yml. 218 across the
// installed corpus (107 Rise of Nations, 34 Millennium Dawn, 29 Old World Blues, 25 Novum Vexillum,
// 19 Road to 56, 18 vanilla) were being sent to a paid, online, inventing tier for a derivation.
//
// ⚠️ Comments are stripped before every source check. This file's own prose, and the marker comments in
// modhealth.js, contain the very rule names the checks look for.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PORT = 53697;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 220) : JSON.stringify(detail).slice(0, 220))));
  if (!ok) fails.push(label);
};

const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8"));

(async () => {
  console.log("\n-- one list, and every site reads it --");
  rec("the tier is declared exactly once", (SRC.match(/const DETERMINISTIC_FIXES\s*=/g) || []).length === 1);
  // Read the declaration's own body rather than asserting the literal it is written with — the shape has
  // already changed once (a Set became a map of preconditions, so a rule can be deterministic for only
  // SOME of its instances) and the property under test is membership, not syntax.
  const declStart = SRC.indexOf("const DETERMINISTIC_FIXES");
  const setBlock = SRC.slice(declStart, SRC.indexOf("isDeterministicFix", declStart));
  for (const rule of ["missing_localization", "loc_missing_bom", "tooltip_key_no_localization", "loc_duplicate_key"]) {
    rec("the tier contains " + rule, new RegExp('(^|[^A-Za-z_])"?' + rule + '"?\\s*:').test(setBlock), setBlock.slice(0, 120));
  }
  rec("a conditional member is gated on the problem, not just the rule",
    /loc_duplicate_key:\s*\(p\)\s*=>/.test(setBlock), setBlock.slice(-160));
  // Every place that decides "is this deterministic?" must go through the predicate.
  const readers = (SRC.match(/isDeterministicFix\(/g) || []).length;
  rec("at least three sites read the predicate (card, banner, batch)", readers >= 3, readers);

  // …and nobody re-derives membership by hand. This is the regression that made widening hard.
  const handWritten = SRC.match(/rule === "(?:missing_localization|loc_missing_bom|tooltip_key_no_localization)"\s*\|\|/g) || [];
  rec("no site rebuilds the list with || comparisons", handWritten.length === 0, handWritten);

  console.log("\n-- the new rule really is fixed deterministically, with no AI --");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dettier-"));
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="det tier"\n', "utf8");
    const mk = (rel, body) => {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body, "utf8");
    };
    // A decision whose reward shows a tooltip key nothing defines.
    mk(path.join("common", "decisions", "d.txt"),
      "cat_a = {\n\tsome_decision = {\n\t\tcomplete_effect = {\n\t\t\tcustom_effect_tooltip = a_tooltip_with_no_text\n\t\t}\n\t}\n}\n");
    mk(path.join("localisation", "english", "base_l_english.yml"), "﻿l_english:\n cat_a:0 \"A\"\n some_decision:0 \"Some Decision\"\n");

    const scriptBefore = fs.readFileSync(path.join(root, "common", "decisions", "d.txt"), "utf8");

    let idx = buildModIndex(root, {});
    const tip = idx.problems.find((p) => p.rule === "tooltip_key_no_localization");
    rec("the scan reports the tooltip key", !!tip && tip.entityId === "a_tooltip_with_no_text", tip && tip.entityId);

    // NO apiKey is sent. If this rule were still routed to the AI branch it would fail on the missing key,
    // which is exactly the positive control that proves the deterministic branch handled it.
    const r = await fetch(BASE + "/api/modhealth/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problem: tip }),
    });
    const j = await r.json();
    rec("it is fixed with NO api key (so: not the AI tier)", !!(j && j.ok), j);
    rec("...via the localisation path", j && j.mode === "localization", j && j.mode);
    rec("...and it was backed up first", !!(j && j.backupPath && fs.existsSync(j.backupPath)));

    const yml = fs.readFileSync(path.join(root, "localisation", "english", "base_l_english.yml"), "utf8");
    rec("the key is now defined in the .yml", /^\s*a_tooltip_with_no_text:/m.test(yml), yml.split(/\r?\n/).slice(-3));
    rec("the .yml still starts with a BOM", yml.charCodeAt(0) === 0xFEFF);
    rec("the SCRIPT the card named is byte-identical", fs.readFileSync(path.join(root, "common", "decisions", "d.txt"), "utf8") === scriptBefore);

    console.log("\n-- and the fix actually clears the problem --");
    idx = buildModIndex(root, {});
    rec("a rescan no longer reports it", !idx.problems.some((p) => p.rule === "tooltip_key_no_localization"),
      idx.problems.filter((p) => p.rule === "tooltip_key_no_localization").map((p) => p.entityId));

    // ── a duplicate key is deletable ONLY when the copies say the same thing ──────────────────────────
    console.log("\n-- a duplicate loc key: identical copies are removed, differing ones are refused --");
    const dupRel = "localisation/english/dupes_l_english.yml";
    const dupAbs = path.join(root, "localisation", "english", "dupes_l_english.yml");
    // CRLF on purpose: this fix deletes lines, so it must put the survivors back with the bytes they had.
    fs.writeFileSync(dupAbs, "﻿l_english:\r\n"
      + " same_both_times:0 \"Identical Text\"\r\n"
      + " untouched_key:0 \"Leave Me Alone\"\r\n"
      + " same_both_times:0 \"Identical Text\"\r\n"
      + " differs:0 \"A Short Title\"\r\n"
      + " differs:0 \"A much longer description that the author actually wrote.\"\r\n", "utf8");

    idx = buildModIndex(root, {});
    const dupes = idx.problems.filter((p) => p.rule === "loc_duplicate_key" && p.file === dupRel);
    const same = dupes.find((p) => p.entityId === "same_both_times");
    const diff = dupes.find((p) => p.entityId === "differs");
    rec("the identical pair is flagged as identical", !!same && same.allIdentical === true, same && same.allIdentical);
    rec("the differing pair is flagged as NOT identical", !!diff && diff.allIdentical === false, diff && diff.allIdentical);
    rec("the differing pair's message says the copies differ", !!diff && /say DIFFERENT things/.test(diff.message), diff && diff.message);

    let rr = await fetch(BASE + "/api/modhealth/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problem: same }),
    });
    let jj = await rr.json();
    rec("the identical duplicate is removed", !!(jj && jj.ok && jj.removed === 1), jj);
    let after = fs.readFileSync(dupAbs, "utf8");
    rec("exactly one copy survives", (after.match(/^\s*same_both_times:/gm) || []).length === 1, after);
    rec("the untouched key is still there", /untouched_key:0 "Leave Me Alone"/.test(after));
    rec("the file still starts with a BOM", after.charCodeAt(0) === 0xFEFF);
    rec("the surviving lines kept their CRLF endings", !/[^\r]\n/.test(after.replace(/^﻿/, "")), JSON.stringify(after.slice(0, 40)));

    // THE ONE THAT MATTERS: differing copies must be refused, even though the client asked.
    rr = await fetch(BASE + "/api/modhealth/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problem: diff }),
    });
    jj = await rr.json();
    rec("differing copies are REFUSED", !!(jj && jj.error && !jj.ok), jj);
    rec("...and the refusal explains that HOI4 uses the last", !!(jj && /LAST/.test(jj.error)), jj && jj.error);
    after = fs.readFileSync(dupAbs, "utf8");
    rec("...and nothing was deleted", (after.match(/^\s*differs:/gm) || []).length === 2, after);

    // A guard the client supplies is not a guard: lie about allIdentical and the server must still refuse.
    rr = await fetch(BASE + "/api/modhealth/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problem: Object.assign({}, diff, { allIdentical: true }) }),
    });
    jj = await rr.json();
    rec("a client claiming allIdentical is still refused", !!(jj && jj.error && !jj.ok), jj);
    rec("...and still nothing was deleted", (fs.readFileSync(dupAbs, "utf8").match(/^\s*differs:/gm) || []).length === 2);

    // ── an unterminated value: one line, so the closing quote has exactly one place to go ─────────────
    console.log("\n-- an unclosed quote is closed at the end of its own line --");
    const qRel = "localisation/english/quotes_l_english.yml";
    const qAbs = path.join(root, "localisation", "english", "quotes_l_english.yml");
    fs.writeFileSync(qAbs, "﻿l_english:\r\n"
      + ' good_line:0 "Perfectly Fine"\r\n'
      + ' never_closes:0 "this one never closes\r\n'
      + ' inner_mark:0 "armed with five 5" guns."\r\n', "utf8");

    idx = buildModIndex(root, {});
    const mal = idx.problems.filter((p) => p.rule === "loc_value_malformed" && p.file === qRel);
    rec("only the unterminated line is reported", mal.length === 1 && mal[0].entityId === "never_closes", mal.map((p) => p.entityId));
    rec("...and it carries the line number the fix needs", mal[0] && mal[0].line === 3, mal[0] && mal[0].line);

    rr = await fetch(BASE + "/api/modhealth/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problem: mal[0] }),
    });
    jj = await rr.json();
    rec("the quote is closed with no api key (so: not the AI tier)", !!(jj && jj.ok && jj.mode === "loc_quote"), jj);
    let q = fs.readFileSync(qAbs, "utf8");
    rec("the value now closes", /never_closes:0 "this one never closes"/.test(q), q.split(/\r?\n/)[2]);
    rec("the well-formed neighbours are untouched", /good_line:0 "Perfectly Fine"/.test(q) && /inner_mark:0 "armed with five 5" guns\."/.test(q), q);
    rec("the file kept its CRLF endings", !/[^\r]\n/.test(q.replace(/^﻿/, "")), JSON.stringify(q.slice(0, 30)));
    rec("the file kept its BOM", q.charCodeAt(0) === 0xFEFF);

    idx = buildModIndex(root, {});
    rec("a rescan no longer reports it", !idx.problems.some((p) => p.rule === "loc_value_malformed" && p.file === qRel),
      idx.problems.filter((p) => p.rule === "loc_value_malformed").map((p) => p.entityId));

    // Re-derived from disk: replay the same fix and the server must decline, because the line is fixed now.
    rr = await fetch(BASE + "/api/modhealth/fix", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problem: mal[0] }),
    });
    jj = await rr.json();
    rec("replaying the same fix is refused, not applied twice", !!(jj && jj.error && !jj.ok), jj);
    rec("...and the line still has exactly one closing quote",
      (fs.readFileSync(qAbs, "utf8").match(/never_closes:0 "this one never closes"/g) || []).length === 1);
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    server.closeAllConnections && server.closeAllConnections();
    server.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }

  console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
  process.exitCode = fails.length ? 1 : 0;
})();
