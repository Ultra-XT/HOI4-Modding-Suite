// ⛔ #loc-line-trailing-comment — A COMMENT AFTER THE VALUE MADE THE WHOLE LINE INVISIBLE.
//
// A HOI4 localisation line may carry a comment after the closing quote:
//
//     infantry_weapons7:0 "Small Arms 2035" #Future Tactical Rifle
//
// Every loc regex in server.js was written as `…".*"[ \t]*$`, which cannot match one. setLocalizationKeyInPlace
// was fixed for it (#loc-line-trailing-comment, recorded with its own measurement) and the fix was never
// adopted anywhere else — the dominant bug shape here, and why a patch added BESIDE a bug leaves the bug to
// be copied onward.
//
// Re-measured 2026-09-02 across the vanilla install and all nine installed workshop mods:
//   3,849,347 localisation lines scanned
//      22,063 that those patterns cannot match
//      21,950 of them because of a trailing comment
// 19,040 are in vanilla alone, and every installed mod has some: R56 815, MD 756, Rise of Nations 669,
// Old World Blues 504, Novum Vexillum 171.
//
// What it cost, per call site:
//   • an UPSERT missed the line and APPENDED a second definition of the same key, leaving two entries whose
//     winner is undefined and orphaning the modder's note on the stale one (#rename-writes-a-duplicate);
//   • a DELETE missed the line and left the key behind after its object was gone;
//   • a READER skipped the entry, so the name showed as the raw key.
"use strict";

const fs = require("fs");
const path = require("path");

const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

// ⭐ DERIVED SWEEP, not a list. A loc-line pattern is one matching `<key>:<version> "<value>"`; in source it
// appears as `:\d*` (regex literal) or `:\\d*` (template string). "Tolerant" means it carries a `#[^\n]*`
// branch to swallow a trailing comment. A pattern added tomorrow is covered the day it appears.
const LOC_LINE = /:\\+d\*/;
const TOLERANT = /#\\?\[\^\\+n\]\*/;
// The one legitimate exception: a probe that does not anchor the end of the line already matches a commented
// line, so it needs no branch. Recognised by shape — it stops at the value's OPENING quote.
// Two spellings of that shape: a template string (`…:\\d*[ \\t]*"`) and a regex literal that ends at the quote (/…:\d*[ \t]*"/gm).
const UNANCHORED = /"`,\s*"m"\)|:\\+d\*\[ \\+t\]\*"(?:`|\/[dgimsuvy]*[;,)\s])/;

(async () => {
  try {
    console.log("1. There is one owner for the pattern");
    rec("locLineRegExp exists", /function locLineRegExp\(key, flags = "m"\)/.test(RAW));
    rec("…and tolerates a trailing comment", /\(\?:#\[\^\\\\n\]\*\)\?/.test(RAW));
    rec("…and captures it, rather than swallowing it",
      /\(\[ \\\\t\]\*\(\?:#\[\^\\\\n\]\*\)\?\)\$/.test(RAW),
      "a non-capturing tail would match the line and then WRITE OVER the comment — deleting it");
    // ⚠️ THE VALUE IS GREEDY, AND THAT IS THE MEASURED CHOICE, NOT AN OVERSIGHT.
    // My first fix used `(?:[^"\\]|\\.)*`, which stops at the first inner quote — and HOI4 ships values with
    // UNESCAPED ones (`"…declares itself "Protector of the North Sea Passage""`). Over 3,849,347 lines from
    // the vanilla install and all nine installed workshop mods:
    //     old (greedy, no comment branch)     missed 22,063
    //     escaped-quote value + comment       missed  6,926   ← trades one bug for another
    //     greedy value + comment (shipped)    missed    113
    // Greedy also matches the game's own last-quote rule, so Nova and HOI4 agree instead of disagreeing.
    rec("the value pattern is greedy, to match the game's last-quote rule",
      /\)".\*"\(\[ \\\\t\]/.test(RAW),
      "an escaped-quote value cannot match the unescaped inner quotes vanilla ships");
    rec("…and no hand-rolled strict copy survives",
      !/\(\?:\[\^"\\\\\\\\\]\|\\\\\\\\\.\)\*"\(\[ /.test(RAW),
      "both earlier copies of this matcher now go through locLineRegExp");

    console.log("\n2. DERIVED: no loc-line regex is blind to a comment");
    const lines = RAW.split(/\r?\n/);
    const blind = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i], trimmed = t.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;  // a comment ABOUT the pattern
      if (!LOC_LINE.test(t) || TOLERANT.test(t)) continue;
      if (UNANCHORED.test(t)) continue;                                    // matches a commented line already
      blind.push(`${i + 1}: ${trimmed.slice(0, 100)}`);
    }
    rec("every anchored loc-line pattern handles a trailing comment", blind.length === 0, blind.slice(0, 8));

    // The sweep must actually be finding patterns, or "0 blind" would mean "0 looked at".
    const found = lines.filter((t) => LOC_LINE.test(t) && !t.trim().startsWith("//") && !t.trim().startsWith("*")).length;
    rec("…and it found patterns to check", found >= 8, found + " loc-line patterns");
    // The exemption is by shape, so hold it to both sides: a probe that stops at the value's opening quote (in either spelling)
    // is exempt, and an anchored pattern with no comment branch is still caught.
    const classify = (t) => (LOC_LINE.test(t) && !TOLERANT.test(t) && !UNANCHORED.test(t) ? "blind" : "ok");
    rec("CONTROL: a key probe that stops at the opening quote is exempt, as a regex literal and as a template string",
      classify('  const KEY = /^[ \\t]*([A-Za-z0-9_.\\-]+):\\d*[ \\t]*"/gm;') === "ok"
      && classify('  const re = new RegExp(`^[ \\\\t]*${k}:\\\\d*[ \\\\t]*"`, "m");') === "ok");
    rec("CONTROL: …while an anchored pattern with no comment branch is still blind",
      classify('  const LINE = /^[ \\t]*STATE_1:\\d*[ \\t]*"(.*)"[ \\t]*$/m;') === "blind"
      && classify('  const LINE = /^[ \\t]*STATE_1:\\d*[ \\t]*"(.*)"/m;') === "blind");

    console.log("\n3. The rule, composed over real lines");
    // The production shape, reproduced. escapeRegExpForIdeaScan is a plain regex escape.
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const locLineRegExp = (key, flags = "m") => new RegExp(
      `^([ \\t]*${esc(String(key))}:\\d*[ \\t]*)".*"([ \\t]*(?:#[^\\n]*)?)$`, flags);
    const OLD = (key) => new RegExp(`^[ \\t]*${esc(String(key))}:\\d*[ \\t]*".*"[ \\t]*$`, "m");

    const commented = ` infantry_weapons7:0 "Small Arms 2035" #Future Tactical Rifle`;
    const plain = ` infantry_weapons7:0 "Small Arms 2035"`;
    rec("the old pattern could not match a commented line", OLD("infantry_weapons7").test(commented) === false);
    rec("…and the new one does", locLineRegExp("infantry_weapons7").test(commented) === true);
    rec("…while still matching a plain line", locLineRegExp("infantry_weapons7").test(plain) === true);
    // ⭐ CONTROL: it must not match a DIFFERENT key, or an upsert would overwrite the wrong entry.
    rec("…and not some other key", locLineRegExp("infantry_weapons7").test(` infantry_weapons8:0 "x"`) === false);
    // …nor a key of which this one is a prefix (the #sprite-name-prefix-match shape, one file along).
    rec("…nor a key this one is a prefix of",
      locLineRegExp("infantry_weapons").test(` infantry_weapons7:0 "x"`) === false,
      "a prefix match would rewrite a neighbouring key's line");

    console.log("\n4. ⭐ The comment SURVIVES the edit — comments are content");
    const replaceLine = (text, key, line) =>
      text.replace(locLineRegExp(key), (_m, _p, trail) => line + (trail || ""));
    const after = replaceLine(commented, "infantry_weapons7", ` infantry_weapons7:0 "Renamed"`);
    rec("the value is rewritten", /"Renamed"/.test(after), after);
    rec("…and the modder's note is still there", /#Future Tactical Rifle/.test(after), after);
    rec("…on the same line, not moved", /"Renamed" #Future Tactical Rifle/.test(after), after);
    // The old behaviour, composed alongside: it appended a SECOND definition of the same key.
    const OLD_UPSERT = (text, key, line) =>
      OLD(key).test(text) ? text.replace(OLD(key), line) : `${text}\n${line}`;
    const oldOut = OLD_UPSERT(commented, "infantry_weapons7", ` infantry_weapons7:0 "Renamed"`);
    rec("the old path wrote a DUPLICATE key", (oldOut.match(/infantry_weapons7:/g) || []).length === 2,
      (oldOut.match(/infantry_weapons7:/g) || []).length + " definitions");
    rec("…and the new path writes exactly one", (after.match(/infantry_weapons7:/g) || []).length === 1);

    console.log("\n5. Measured against the installed corpora");
    const ROOTS = [["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"]];
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    try {
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "localisation"))) ROOTS.push([d, p]);
      }
    } catch (_) {}
    const files = [];
    (function walk(dir) {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.yml$/i.test(e.name)) files.push(p);
      }
    })(path.join(ROOTS[0][1], "localisation"));

    let scanned = 0, oldMisses = 0, newMisses = 0;
    const sample = [];
    for (const f of files.slice(0, 400)) {
      let txt;
      try { txt = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      for (const raw of txt.split(/\r?\n/)) {
        const m = /^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"/.exec(raw);
        if (!m) continue;
        scanned++;
        const key = m[1];
        if (!OLD(key).test(raw)) { oldMisses++; if (sample.length < 3) sample.push(raw.trim().slice(0, 90)); }
        if (!locLineRegExp(key).test(raw)) newMisses++;
      }
    }
    rec("a real corpus was scanned", scanned > 10000, scanned + " lines");
    rec("…and it contains lines the old pattern missed", oldMisses > 0, oldMisses + " missed");
    // Not merely "fewer" — the shipped pattern must reach essentially all of them, or a residue of the same
    // bug is still live. The remainder is values with no closing quote on the line, which no line-wise
    // matcher can edit anyway.
    rec("…and the shipped pattern matches essentially all of them", newMisses === 0,
      `old missed ${oldMisses}, new misses ${newMisses}`);
    // ⭐ CONTROL: the intermediate candidate I nearly shipped must be shown to be worse, or "greedy" reads
    // as an arbitrary choice rather than a measured one.
    const STRICT = (key) => new RegExp(
      `^([ \\t]*${esc(String(key))}:\\d*[ \\t]*)"(?:[^"\\\\]|\\\\.)*"([ \\t]*(?:#[^\\n]*)?)$`, "m");
    const innerQuote = ` iceland_events.23.t:0 "[ICE.GetName] Declares itself "Protector of the North Sea Passage""`;
    rec("the escaped-quote candidate fails on vanilla's unescaped inner quotes",
      STRICT("iceland_events.23.t").test(innerQuote) === false);
    rec("…and the shipped greedy pattern handles them",
      locLineRegExp("iceland_events.23.t").test(innerQuote) === true);
    if (sample.length) console.log("       e.g. " + sample[0]);

    console.log(`\n=== a loc comment does not hide the line: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
