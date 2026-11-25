// ⛔ #a-commented-capital-is-not-a-capital  +  #a-dated-capital-is-a-different-capital
//
// setCountryCapital found the assignment with a RAW-text regex carrying /g. Two ways that went wrong, both
// confirmed against shipped mod files:
//
//   1. A file whose only `capital` line is commented out — Old World Blues ships CHI as `#capital = 361` —
//      was "edited" into `#capital = 4242` and reported {ok:true, changed:true}. `#` starts a comment in
//      Clausewitz script, so the country still had NO capital, and the click did nothing at all. Nova then
//      agreed with itself that all was well, because the reader beside it strips comments and so saw no
//      capital either way.
//
//   2. The /g rewrote assignments inside DATED history blocks. `1960.4.21 = { capital = 505 }` is Brazil
//      moving its capital to Brasília; a `YYYY.MM.DD = { … }` block applies to bookmarks starting after
//      that date. One click on Rise of Nations changed two lines for BRA and three for GER — every
//      bookmark silently given the same capital.
//
// A country with no capital, or with the wrong one, is not cosmetic: HOI4 crashes when a capital is
// dangling, which is why Nova has a rule for it.
//
// The fix locates the assignment on text with comments masked AND dated blocks blanked (topLevelOnly), so
// what it finds is what the 1936 start actually reads. Both maskers preserve length, so the offsets address
// the raw file and the author's own bytes are spliced back.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const roots = [];
const mk = (body) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capital-"));
  roots.push(m);
  fs.mkdirSync(path.join(m, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="cap"\n', "utf8");
  fs.writeFileSync(path.join(m, "history", "countries", "TST.txt"), body, "utf8");
  return m;
};
const set = (m, sid) => md.setCountryCapital({ modRoot: m, gameRoot: GAME, dependencyRoots: [], tag: "TST", stateId: sid });
const read = (m) => fs.readFileSync(path.join(m, "history", "countries", "TST.txt"), "utf8");
// What the GAME reads: comments gone, dated blocks gone.
const liveCapital = (txt) => {
  const noComments = txt.replace(/#[^\n\r]*/g, "");
  let t = noComments;
  for (let i = 0; i < 12; i++) { const n = t.replace(/\{[^{}]*\}/g, ""); if (n === t) break; t = n; }
  const m = /(?:^|[^A-Za-z0-9_])capital[ \t]*=[ \t]*(\d+)/.exec(t);
  return m ? parseInt(m[1], 10) : null;
};

try {
  console.log("\n-- a commented-out capital must produce a REAL one --");
  {
    const m = mk("#capital = 361\nset_politics = { ruling_party = neutrality }\n");
    const r = set(m, 4242);
    const out = read(m);
    ok(r && r.changed, "the write reports a change", r);
    ok(liveCapital(out) === 4242, "the country now HAS a capital the game will read", { live: liveCapital(out), out: out.slice(0, 80) });
    ok(/#capital = 361/.test(out), "…and the author's commented line is left exactly as they wrote it", out.slice(0, 80));
    ok(!/#capital = 4242/.test(out), "…rather than the comment being edited, which changed nothing");
  }

  console.log("\n-- a dated block keeps its own capital --");
  {
    const m = mk("capital = 500\nset_politics = { ruling_party = neutrality }\n1960.4.21 = {\n\tcapital = 505\n}\n");
    set(m, 999);
    const out = read(m);
    ok(liveCapital(out) === 999, "the 1936 capital is the one that changed", liveCapital(out));
    ok(/1960\.4\.21 = \{\s*\r?\n\s*capital = 505/.test(out),
      "…and the 1960 block still moves it to 505 — that is a different bookmark's capital", out);
    ok((out.match(/capital = 999/g) || []).length === 1, "…exactly one line was rewritten", out);
  }

  console.log("\n-- several dated blocks, none of them touched --");
  {
    const m = mk("capital = 1105\n1945.1.1 = {\n\tcapital = 51\n}\n2000.1.1 = {\n\tcapital = 1105\n}\n");
    set(m, 7);
    const out = read(m);
    ok(liveCapital(out) === 7, "the undated capital changed", liveCapital(out));
    ok(/1945\.1\.1 = \{\s*\r?\n\s*capital = 51/.test(out), "…1945 kept 51", out);
    ok(/2000\.1\.1 = \{\s*\r?\n\s*capital = 1105/.test(out), "…2000 kept 1105", out);
    ok((out.match(/capital = 7\b/g) || []).length === 1, "…and only one line was rewritten", out);
  }

  console.log("\n-- the stale trailing comment naming the OLD state is dropped --");
  {
    const m = mk("capital = 64 # Berlin/Brandeburg\n");
    set(m, 7);
    const out = read(m);
    ok(/^capital = 7\s*$/m.test(out), "the line reads capital = 7", JSON.stringify(out));
    ok(!/Berlin/.test(out), "…without a comment that now names the wrong state", JSON.stringify(out));
  }

  console.log("\n-- a file with no capital at all still gets one --");
  {
    const m = mk("set_politics = { ruling_party = neutrality }\n");
    set(m, 12);
    ok(liveCapital(read(m)) === 12, "a capital is prepended", read(m));
  }

  console.log("\n-- ⭐ CONTROL: what the old code did, on the same fixtures --");
  {
    // The old implementation, verbatim in shape: raw-text guard, raw-text global replace.
    const oldWay = (content, sid) => (/capital\s*=\s*\d+/.test(content)
      ? content.replace(/capital\s*=\s*\d+[ \t]*(#[^\n\r]*)?/g, `capital = ${sid}`)
      : `capital = ${sid}\n` + content);
    const commented = oldWay("#capital = 361\n", 4242);
    ok(liveCapital(commented) === null,
      "the old code left a commented file with NO capital the game can read — the bug", JSON.stringify(commented));
    const dated = oldWay("capital = 500\n1960.4.21 = {\n\tcapital = 505\n}\n", 999);
    ok((dated.match(/capital = 999/g) || []).length === 2,
      "…and rewrote the dated block too, so both bookmarks got the same capital", JSON.stringify(dated));
  }

  console.log("\n-- CRLF files keep their line endings --");
  {
    const m = mk("capital = 500\r\nset_politics = { x = y }\r\n");
    set(m, 3);
    const out = read(m);
    const lone = (out.match(/[^\r]\n/g) || []).length;
    ok(lone === 0, "no lone LF is introduced into an all-CRLF country file", { lone, out: JSON.stringify(out) });
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
