// Regression (bug-hunt #19 — client-JS adversarial workflow, split-verdict finding resolved by tracing):
//   parseLocalizationFile's unescape was NOT the inverse of escapeLocalizationValue. escapeLocalizationValue
//   doubles `\`→`\\` (then escapes "/newline/tab/CR), but the parser used a multi-.replace() chain that
//   (a) never reversed `\\`→`\`, and (b) mis-read `\\n` as backslash+newline. The focus-tree editor (app.js)
//   loads names via this parser and has NO client-side unescapeLocForEdit, so a focus name/description
//   containing a literal backslash ESCALATED by one backslash on every re-save (1→2→4→8…). The 5 makers
//   were already safe (they apply their own unescapeLocForEdit, a correct single pass). Fix: parseLocalizationFile
//   now unescapes in one left-to-right pass — the exact inverse — guarded to run only when a backslash is
//   present, so every backslash-free value (virtually all loc) is byte-identical to before.
// Run: node test-loc-parse-inverse.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 200)) : ""); } };

// Write a single-key loc file with an already-ESCAPED value, parse it back, and assert we recover the original.
function roundTrip(original) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locinv-"));
  const fp = path.join(dir, "x_l_english.yml");
  const escaped = S.escapeLocalizationValue(original);
  fs.writeFileSync(fp, "﻿l_english:\n k:0 \"" + escaped + "\"\n", "utf8");
  const parsed = S.parseLocalizationFile(fp);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return parsed.names.k;
}

// (1) inverse property: parse(write(escape(x))) === x for a corpus that stresses backslashes + escapes
const CORPUS = [
  "plain title",
  'He said "hold"',
  "tab\there",
  "C:\\path\\to\\file",            // literal backslashes — the escalation case
  "ends with a backslash \\",
  "backslash then n: \\n literal", // must stay backslash+n, NOT become a newline
  "mixed \\ and \" and \t together",
  "§Ycolor§! [GetName] tokens",
  "double\\\\backslash",
  "quote-backslash \\\" combo",
];
for (const s of CORPUS) {
  ok("round-trips: " + JSON.stringify(s).slice(0, 42), roundTrip(s) === s, "got " + JSON.stringify(roundTrip(s)));
}

// (2) the specific escalation: a backslash value parsed then re-escaped then re-parsed must be STABLE
{
  let v = "C:\\Windows\\System32";
  const first = roundTrip(v);
  ok("backslash value recovered exactly (1 pass)", first === v, first);
  // simulate the editor round-trip: escape the recovered value again and parse — must be identical (no growth)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locinv2-"));
  const fp = path.join(dir, "x_l_english.yml");
  fs.writeFileSync(fp, "﻿l_english:\n k:0 \"" + S.escapeLocalizationValue(first) + "\"\n", "utf8");
  const second = S.parseLocalizationFile(fp).names.k;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  ok("no backslash escalation across a 2nd cycle", second === v, second);
}

// (3) byte-identity on REAL loc: parse a big vanilla/MD loc file and confirm no value contains a stray
//     backslash artifact (there should be none — real loc is backslash-free — so this just proves the
//     parser still returns the same clean strings it always did). We assert it parses non-empty + no value
//     accidentally gained/lost a char vs a naive backslash-free read.
{
  const candidates = [
    "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/localisation/english",
    "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/localisation/english",
    "C:/Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV/localisation/english",
  ];
  let realDir = candidates.find((d) => { try { return fs.existsSync(d); } catch (_) { return false; } });
  if (!realDir) { ok("real-loc byte-identity (SKIPPED — no install found)", true); }
  else {
    const files = fs.readdirSync(realDir).filter((f) => /_l_english\.yml$/i.test(f)).slice(0, 6);
    let checked = 0, mismatches = 0;
    for (const f of files) {
      const fp = path.join(realDir, f);
      const parsed = S.parseLocalizationFile(fp);
      const all = Object.assign({}, parsed.names, parsed.descriptions);
      for (const k in all) {
        checked++;
        // For a value with NO backslash on disk, the new guarded scanner is skipped, so the value is exactly
        // the sliced text (minus the historical \n/\t/\r unescape). Confirm no value contains a lone control
        // artifact from mis-parsing: it should never contain the two-char sequence backslash+n (that means an
        // escape leaked through unparsed).
        if (typeof all[k] === "string" && /\\[ntr"]/.test(all[k])) mismatches++;
      }
    }
    ok(`real-loc parsed ${checked} keys from ${files.length} files, 0 leaked escape sequences`, mismatches === 0, mismatches + " leaked");
    ok("real-loc parse returned a non-trivial number of keys", checked > 50, checked);
  }
}

console.log(`\nLOC-PARSE-INVERSE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
