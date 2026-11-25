// Mod-wide localisation integrity scan (Mod Health). The killer HOI4 loc bug: a .yml whose first non-empty
// line isn't a `l_<language>:` header → HOI4 ignores the WHOLE file, so every key in it shows raw in-game.
// A missing UTF-8 BOM is a softer warning. The scan must flag the right files, stay quiet on good ones and
// genuinely-empty ones, and never touch dependencies/vanilla (only the mod's own localisation/).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { scanLocalizationIntegrity } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const BOM = "﻿";
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locint-"));
const dir = path.join(mod, "localisation", "english");
fs.mkdirSync(dir, { recursive: true });
const write = (name, content, withBom) => fs.writeFileSync(path.join(dir, name), (withBom ? BOM : "") + content, "utf8");

// good: BOM + header
write("good_l_english.yml", "l_english:\n key:0 \"Hi\"\n", true);
// ERROR: no header at all (HOI4 ignores the whole file)
write("noheader_l_english.yml", " key:0 \"Hi\"\n more:0 \"x\"\n", true);
// ERROR: a comment then KEYS but no header anywhere → still ignored by HOI4
write("comment_first_l_english.yml", "# a comment\n key:0 \"Hi\"\n", true);
// OK: leading comment line(s) BEFORE the l_english: header is valid — real mods (Millennium Dawn) do this
write("comment_then_header_l_english.yml", "# Author(s): Someone\n# credits\nl_english:\n key:0 \"Hi\"\n", true);
// WARNING: valid header but missing the BOM
write("nobom_l_english.yml", "l_english:\n key:0 \"Hi\"\n", false);
// OK: genuinely empty file → harmless, must NOT be flagged
write("empty_l_english.yml", "", true);
// OK: header for another language (french) still counts as a header
write("fr_l_french.yml", "l_french:\n key:0 \"Bonjour\"\n", true);
// OK: the American "localization" (US spelling) folder is ALSO scanned — a valid header there is fine.
const usDir = path.join(mod, "localization", "english");
fs.mkdirSync(usDir, { recursive: true });
fs.writeFileSync(path.join(usDir, "us_l_english.yml"), BOM + "l_english:\n key:0 \"Hi\"\n", "utf8");
// OK: a file that is ONLY comments/blanks (no header AND no keys) → can't tell, must NOT cry wolf.
write("commentsonly_l_english.yml", "# just a credits comment\n# nothing else here\n", true);
// not a .yml → ignored entirely
fs.writeFileSync(path.join(mod, "localisation", "Save.txt"), "not yaml", "utf8");

const res = scanLocalizationIntegrity(mod);
const byFile = (name) => res.problems.find((p) => p.file.endsWith(name));

check("scan ran and returned ok", res.ok === true && Array.isArray(res.problems), JSON.stringify(res).slice(0, 120));
check("scanned the .yml files (9), not Save.txt", res.scanned === 9, "scanned=" + res.scanned);
check("no-header file → error", byFile("noheader_l_english.yml") && byFile("noheader_l_english.yml").severity === "error", JSON.stringify(byFile("noheader_l_english.yml")));
check("comment + keys but no header anywhere → error", byFile("comment_first_l_english.yml") && byFile("comment_first_l_english.yml").severity === "error");
check("comment(s) THEN l_english: header → NO problem (real mods do this)", !byFile("comment_then_header_l_english.yml"));
check("missing-BOM file → warning (not error)", byFile("nobom_l_english.yml") && byFile("nobom_l_english.yml").severity === "warning", JSON.stringify(byFile("nobom_l_english.yml")));
check("good file → no problem", !byFile("good_l_english.yml"));
check("empty file → NOT flagged (harmless)", !byFile("empty_l_english.yml"));
check("french header file → no problem (l_<any-language> counts)", !byFile("fr_l_french.yml"));
check("American 'localization' folder is scanned too, valid header → no problem", !byFile("us_l_english.yml"), JSON.stringify(byFile("us_l_english.yml")));
check("comments-only file (no header, no keys) → NOT flagged (can't tell, don't cry wolf)", !byFile("commentsonly_l_english.yml"), JSON.stringify(byFile("commentsonly_l_english.yml")));
check("exactly 2 errors + 1 warning total", res.problems.filter((p) => p.severity === "error").length === 2 && res.problems.filter((p) => p.severity === "warning").length === 1, JSON.stringify(res.problems.map((p) => [p.file, p.severity])));
check("a no-mod path → empty, no throw", scanLocalizationIntegrity("").scanned === 0);

try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
console.log(`\nLOC-INTEGRITY TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
