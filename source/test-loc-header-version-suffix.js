// #loc-header-version-suffix — `l_english:0` IS A LEGAL HEADER, AND NOVA READ THE FILE AS NOT ENGLISH.
//
// The localisation format allows an optional version number after the colon. It is familiar on entries
// (`KEY:0 "value"`) and is also allowed on the header. Two of the most-played HOI4 mods ship it: Road to 56
// and Rise of Nations both open files with `l_english:0`, and both work in game.
//
// Nova required the colon to end the line, and got three different wrong answers from the one mistake:
//
//   the READER   returned an empty map, so every name in the file rendered as its raw id
//   the WRITER   threw "Localization file is malformed", refusing to save into such a file
//   the REPAIRER prepended a SECOND `l_english:` above the real one — corrupting it. That is exactly the
//                failure the comment beside it says was fixed for leading COMMENTS and never for this.
//
// Measured across the shipping corpora before the fix: 807 declared keys dropped, 585 of them whole files at
// a time — RON_British_Raj (413 of 413), r56_companies_traits (163 of 163, shipped by two different mods),
// KBK (10 of 10). After: 59, and every one of those is an unterminated quote in the mod's own file, which
// swallows the next line. 25 such typos were counted; they are the mods' bugs, not Nova's.
//
// This is the third time this class has bitten: a file that looked un-English was skipped whole. The first
// was a ten-line cap on the header search (896 names invisible), the second a leading comment banner.
"use strict";
const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240));
  }
}

const srv = require("./server.js");
const parse = srv.parseLocalizationFile;

const TMP = fs.mkdtempSync(path.join(require("os").tmpdir(), "nova-loc-"));
const write = (name, text) => { const p = path.join(TMP, name); fs.writeFileSync(p, "\uFEFF" + text); return p; };

console.log("\n[the reader accepts every legal header shape]");
{
  const shapes = [
    ["plain", 'l_english:\n MY_KEY:0 "Hello"\n'],
    ["with a version number", 'l_english:0\n MY_KEY:0 "Hello"\n'],
    ["version with a space", 'l_english: 0\n MY_KEY:0 "Hello"\n'],
    ["after a comment banner", '#####\n# notes\n#####\nl_english:0\n MY_KEY:0 "Hello"\n'],
    ["CRLF line endings", 'l_english:0\r\n MY_KEY:0 "Hello"\r\n'],
  ];
  for (const [label, text] of shapes) {
    const p = write(`h_${label.replace(/\W+/g, "_")}_l_english.yml`, text);
    const got = parse(p);
    rec(`reads a header ${label}`, !!(got && got.names && got.names.MY_KEY === "Hello"), JSON.stringify(got && got.names));
  }
  // CONTROL: a file that genuinely is not English must still be skipped, or the fix is just "accept anything".
  const fr = write("french_l_french.yml", 'l_french:0\n MY_KEY:0 "Bonjour"\n');
  rec("a non-English file is still skipped", Object.keys((parse(fr) || {}).names || {}).length === 0, JSON.stringify(parse(fr)));
  const junk = write("junk_l_english.yml", 'not_a_header\n MY_KEY:0 "Hello"\n');
  rec("a file with no header at all is still skipped", Object.keys((parse(junk) || {}).names || {}).length === 0, "parsed a headerless file");
}

console.log("\n[the writer accepts it too, and does not double the header]");
{
  // The three call sites share one rule now; assert the rule exists and that none of them re-states it.
  const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const code = SRC.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  rec("there is one named header rule", /const LOC_HEADER_RE\s*=/.test(code), "no shared rule");
  // ⭐ The bug was three copies of the same regex drifting; the point of the fix is that they cannot.
  const strays = (code.match(/\/\^l_english\\s\*:\\s\*\$\/i/g) || []).length;
  rec("no call site keeps its own stricter copy", strays === 0, `${strays} stray strict regex(es)`);
  const uses = (code.match(/LOC_HEADER_RE\.test\(/g) || []).length;
  rec("all three call sites use it", uses >= 3, `${uses} uses`);
}

console.log("\n[THE CORRUPTION] the repair path must not prepend a second header");
{
  // ensureLocalizationHeaderRepaired is not exported, so drive the observable consequence: read a file whose
  // header carries a version, and confirm the reader agrees it already HAS a header (which is what stops the
  // repairer adding another).
  const p = write("repair_l_english.yml", 'l_english:0\n A:0 "one"\n B:0 "two"\n');
  const got = parse(p);
  rec("a versioned header file parses, so it is not treated as headerless", Object.keys(got.names || {}).length === 2, got.names);
}

console.log("\n[THE CORPUS] no shipping English file is skipped whole");
{
  const roots = [["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"]];
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  try {
    for (const d of fs.readdirSync(WS)) {
      if (fs.existsSync(path.join(WS, d, "localisation"))) roots.push([`ws/${d}`, path.join(WS, d)]);
    }
  } catch (_) {}
  const ymls = [];
  const walk = (dir) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) ymls.push(p);
    }
  };
  for (const [, root] of roots) { walk(path.join(root, "localisation")); walk(path.join(root, "localization")); }

  if (!ymls.length) {
    // ⚠️ A skip reads as a pass. Say so.
    console.log("  SKIP no shipping corpus on this machine — the corpus check did NOT run");
  } else {
    let english = 0, emptied = 0;
    const names = [];
    for (const f of ymls) {
      let txt = ""; try { txt = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      // ⚠️ The header LINE, not the string anywhere in the file. Nine other-language files
      // (poland_dlc_events_l_french.yml and friends) mention `l_english:` somewhere inside and were counted
      // as English by a looser test — then "failed" for being skipped, which is exactly what should happen
      // to a French file.
      const first = (txt.split(/\r?\n/).map((l) => l.replace(/^﻿/, "").trim()).find((l) => l !== "" && l[0] !== "#")) || "";
      if (!/^l_english\s*:/i.test(first)) continue;
      // Does it declare at least one key in the obvious form?
      if (!/^\s*[A-Za-z0-9_.\-]+\s*:\s*\d*\s*"/m.test(txt)) continue;
      english++;
      const got = parse(f);
      const n = Object.keys((got && got.names) || {}).length + Object.keys((got && got.descriptions) || {}).length;
      if (n === 0) { emptied++; if (names.length < 5) names.push(path.basename(f)); }
    }
    rec(`a real corpus was read (${english} English files with keys)`, english > 1000, english);
    rec("not one of them parses as completely empty", emptied === 0, `${emptied} emptied: ${names.join(", ")}`);
  }
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== loc header version suffix: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
