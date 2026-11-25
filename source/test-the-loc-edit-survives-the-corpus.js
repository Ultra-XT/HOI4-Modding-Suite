// CORPUS ROUND TRIP on the in-place localisation edit.
//
// setLocalizationKeyInPlace is the most widely shared write path in server.js — every maker's rename reaches
// it or its sibling upsertLocalizationLines — and #loc-line-trailing-comment rewrote the matcher all of them
// use. A matcher proven only against hand-made fixtures is proven against the shapes I thought of, so this
// drives REAL localisation files from the installed corpora through a real rename and checks fidelity.
//
// Per key: the key keeps exactly ONE definition (no appended duplicate), its value is the new one, a trailing
// comment survives verbatim, EVERY OTHER LINE is byte-identical, and the file keeps its l_english header.
//
// ⛔ SCRATCH MOD IN TEMP ONLY. The corpus files are read and copied; nothing is written back to the game or
// to any real mod.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locrt-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { setLocalizationKeyInPlace, locLineRegExp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const NEW = "NOVA_ROUNDTRIP_VALUE";

function englishFiles(root, cap) {
  const out = [];
  (function walk(dir) {
    if (out.length >= cap) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (out.length >= cap) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/l_english\.yml$/i.test(e.name)) out.push(p);
    }
  })(path.join(root, "localisation"));
  return out;
}

// ⚠️ A `#` right after the opening quote is the START OF THE VALUE, not a trailing comment
// (`CONSTRUCTION_FACTORIES_LABEL: "#"`). A naive /"[ \t]*#/ test calls those commented and then reports a
// lost comment that was never there — it produced two false alarms the first time this ran.
function trailingCommentOf(line) {
  const q = /^[ \t]*[A-Za-z0-9_.]+:\d*[ \t]*"(.*)"([ \t]*#.*)?$/.exec(line);
  return q && q[2] ? q[2].trim() : "";
}

(async () => {
  try {
    console.log("1. The corpora are present");
    const roots = [];
    if (fs.existsSync(path.join(GAME, "localisation"))) roots.push(["vanilla", GAME]);
    try {
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "localisation"))) roots.push([d, p]);
      }
    } catch (_) {}
    rec("there are localisation corpora to sweep", roots.length >= 2, roots.length + " roots");
    if (roots.length < 2) {
      console.log(`\n=== the loc edit survives the corpus: ${checks} checks, ${fails.length} failed ===`);
      if (fails.length) process.exitCode = 1;
      return;
    }

    const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locrt-mod-"));
    fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Loc Roundtrip"\nsupported_version="1.16.*"\n', "utf8");
    const locDir = path.join(MOD, "localisation", "english");
    fs.mkdirSync(locDir, { recursive: true });

    const unmatchedEg = [];
    const s = { lines: 0, unmatched: 0, unexplained: 0, files: 0, keys: 0, withComment: 0, withInnerQuote: 0, dup: 0, valueWrong: 0, commentLost: 0, otherLines: 0, headerBroken: 0, notWritten: 0 };
    const examples = [];
    const bad = (kind, detail) => { s[kind]++; if (examples.length < 6) examples.push(`${kind}: ${detail}`); };

    try {
      for (const [rootName, root] of roots) {
        for (const src of englishFiles(root, 12)) {
          const raw = fs.readFileSync(src);
          const lines = raw.toString("utf8").split(/\r?\n/);
          const cands = [];
          for (const l of lines) {
            const m = /^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"/.exec(l);
            if (!m) continue;
            cands.push({ key: m[1], line: l, comment: trailingCommentOf(l), innerQuote: (l.match(/"/g) || []).length > 2 });
            // ⭐ The shared matcher, measured against EVERY loc line the sweep walks — not just the handful
            // it goes on to rewrite. This is the check that would have caught the escaped-quote candidate I
            // nearly shipped, which matched fixtures fine and missed 6,926 real lines.
            s.lines++;
            if (!locLineRegExp(m[1]).test(l)) {
              s.unmatched++;
              // ⚠️ CLASSIFY THE RESIDUE, DO NOT TOLERATE A NUMBER. A line-wise matcher genuinely cannot edit
              // a value with no closing quote on its own line, nor one with stray junk after the value that
              // is not a comment (`…"Remove Global Reach Idea"\`` — a typo in that mod). Those two shapes are
              // expected and harmless. Anything ELSE unmatched is a matcher defect, and asserting a count
              // instead would let a new shape hide inside the allowance.
              // ⚠️ Judge from the LAST quote on the line, not from any quote. The first version used
              // /"[ \t]*[^#\s]/, which can match a quote INSIDE the value — so when the comment branch was
              // backed out as a control, it happily classified 25 freshly-broken commented lines as
              // "trailing junk" and stayed green. A classifier that absorbs the regression it exists to
              // catch is worse than no classifier.
              const firstQ = l.indexOf('"');
              const lastQ = l.lastIndexOf('"');
              const closes = lastQ > firstQ;
              const tail = closes ? l.slice(lastQ + 1).trim() : "";
              const trailingJunk = closes && tail !== "" && !tail.startsWith("#");
              const known = !closes || trailingJunk;
              if (!known) {
                s.unexplained++;
                if (unmatchedEg.length < 5) unmatchedEg.push(`UNEXPLAINED ${path.basename(src)}: ${l.trim().slice(0, 90)}`);
              } else if (unmatchedEg.length < 5) {
                unmatchedEg.push(`${!closes ? "no closing quote" : "trailing junk"} — ${path.basename(src)}: ${l.trim().slice(0, 70)}`);
              }
            }
          }
          if (!cands.length) continue;
          const pick = [
            ...cands.filter((c) => c.comment).slice(0, 3),
            ...cands.filter((c) => c.innerQuote && !c.comment).slice(0, 2),
            ...cands.filter((c) => !c.comment && !c.innerQuote).slice(0, 2),
          ];
          if (!pick.length) continue;
          s.files++;
          const dest = path.join(locDir, path.basename(src));

          for (const c of pick) {
            fs.writeFileSync(dest, raw);                 // fresh copy per key
            const before = fs.readFileSync(dest, "utf8");
            let r;
            try { r = setLocalizationKeyInPlace(MOD, c.key, NEW); }
            catch (e) { bad("notWritten", `${c.key}: threw ${e.message}`); continue; }
            s.keys++;
            if (c.comment) s.withComment++;
            if (c.innerQuote) s.withInnerQuote++;
            if (!r || !(r.written || []).length) { bad("notWritten", `${rootName}/${path.basename(src)}:${c.key}`); continue; }

            const after = fs.readFileSync(dest, "utf8");
            const esc = c.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const defRe = new RegExp(`^[ \\t]*${esc}:\\d*[ \\t]*"`);
            const beforeLines = before.split(/\r?\n/);
            const afterLines = after.split(/\r?\n/);

            const defs = afterLines.filter((l) => defRe.test(l));
            if (defs.length !== 1) bad("dup", `${c.key} -> ${defs.length} definitions`);
            if (defs.length === 1 && !defs[0].includes(NEW)) bad("valueWrong", `${c.key} -> ${defs[0].trim().slice(0, 60)}`);
            if (c.comment && defs.length === 1 && !defs[0].includes(c.comment)) {
              bad("commentLost", `${c.key} lost ${c.comment.slice(0, 40)}`);
            }
            if (beforeLines.length !== afterLines.length) {
              bad("otherLines", `${path.basename(src)}: ${beforeLines.length} -> ${afterLines.length} lines`);
            } else {
              for (let i = 0; i < beforeLines.length; i++) {
                if (beforeLines[i] === afterLines[i]) continue;
                if (defRe.test(beforeLines[i])) continue;                 // the edited line
                // ⚠️ HOI4 REQUIRES the UTF-8 BOM on a loc file, and Nova repairs a missing one on write.
                // That is a deliberate fix (Mod Health has a rule for it), not a fidelity loss — so the
                // header line gaining a BOM is expected, and only a header changed OTHERWISE is a failure.
                if (i === 0 && beforeLines[i].replace(/^\uFEFF/, "") === afterLines[i].replace(/^\uFEFF/, "")) continue;
                bad("otherLines", `${path.basename(src)} line ${i + 1}: ${JSON.stringify(beforeLines[i].slice(0, 40))} -> ${JSON.stringify(afterLines[i].slice(0, 40))}`);
                break;
              }
            }
            if (!/l_english\s*:/.test(after)) bad("headerBroken", path.basename(src));
          }
          try { fs.rmSync(dest); } catch (_) {}
        }
      }
    } finally {
      try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
    }

    console.log("\n2. The sweep actually exercised the shapes that matter");
    rec("real corpus files were rewritten", s.files >= 20 && s.keys >= 50, `${s.files} files, ${s.keys} keys`);
    // Without these two the sweep would be measuring only the easy shape.
    rec("…including lines with a TRAILING COMMENT", s.withComment > 0, s.withComment + " keys");
    rec("…and values containing INNER QUOTES", s.withInnerQuote > 0, s.withInnerQuote + " keys");

    console.log("\n3. The shared matcher, against every loc line walked");
    // ⭐ This is the check that would have caught the escaped-quote candidate I nearly shipped: it passed
    // every hand-made fixture and missed 6,926 real lines, because vanilla ships values with unescaped
    // inner quotes. A matcher is only as good as the corpus it was measured on.
    rec("a lot of real loc lines were tested", s.lines >= 5000, s.lines + " lines");
    // The residue is CLASSIFIED, not allowed as a number: a line-wise matcher cannot edit a value with no
    // closing quote on its own line, nor one with stray junk after the value that is not a comment. Both are
    // malformed source. Anything else unmatched is a matcher defect — and an "under N%" allowance would let
    // a brand-new shape hide inside it.
    rec("every unmatched line is a known-unmatchable shape", s.unexplained === 0,
      `${s.unmatched} unmatched of ${s.lines}, ${s.unexplained} unexplained`);
    if (unmatchedEg.length) unmatchedEg.forEach((e) => console.log("       " + e));

    console.log("\n4. Fidelity");
    rec("no key gained a second definition", s.dup === 0, s.dup);
    rec("every edited key carries the new value", s.valueWrong === 0, s.valueWrong);
    rec("every trailing comment survived", s.commentLost === 0, s.commentLost);
    rec("no other line was touched", s.otherLines === 0, s.otherLines);
    rec("every file kept its l_english header", s.headerBroken === 0, s.headerBroken);
    rec("every edit was actually written", s.notWritten === 0, s.notWritten);
    if (examples.length) { console.log("\n  examples:"); examples.forEach((e) => console.log("    " + e)); }

    console.log(`\n=== the loc edit survives the corpus: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
