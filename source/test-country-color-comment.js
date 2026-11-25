// #color-edits-a-comment — changing a country's map colour edited a COMMENTED-OUT line, so the colour never
// changed in game while Nova reported success.
//
// setCountryColor located the tag block with `(?:^|[^A-Za-z0-9_])TAG\s*=\s*\{` and replaced the first
// `\bcolor\s*=\s*(rgb|hsv|hsv360)?\s*\{ … \}` inside it. Neither expression knows about comments:
//
//   * `#` is an acceptable "preceding character", so a wholly commented-out block matches. Vanilla's
//     colors.txt ships two of those (WGR, DDR).
//   * `\b` fires at the `#`→`c` boundary, so `#color = HSV { … }` matches. Vanilla's MON block is exactly
//     that shape — a commented HSV line sitting ABOVE the live one:
//
//         MON = {
//             #color = HSV { 0.1 0.15 0.4 }
//             color = rgb { 108 140 42 }
//             color_ui = rgb { 209 247 133 }
//         }
//
//     so the new colour was written INTO the comment and Mongolia kept its old colour, while the call
//     returned changed:true and the endpoint reported success.
//   * the brace-depth scan counted braces inside comments.
//
// It is not a vanilla-only curiosity: a mod that ships no colors.txt of its own is SEEDED from the effective
// base file by this same function, so vanilla's comments are copied into the mod and the bug arrives with
// them. (Millennium Dawn ships its own colors.txt with no commented colour lines, so MD-based mods are
// unaffected — measured: vanilla 295 tag blocks, 3 whose first `color =` match is inside a comment.)
//
// Fixed by searching a COMMENT-MASKED copy (same length, comment bytes blanked) and splicing into the real
// text at those indices.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const mapData = require("./map-data.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-colorcomment-"));
const MOD = path.join(ROOT, "mod");
fs.mkdirSync(path.join(MOD, "common", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CC"\nsupported_version="1.18.*"\n');

const FILE = path.join(MOD, "common", "countries", "colors.txt");
// Vanilla's real MON shape, plus a wholly commented-out block like vanilla's WGR/DDR.
const ORIGINAL = `MON = {
	#color = HSV { 0.1 0.15 0.4 }
	color = rgb { 108 140 42 }
	color_ui = rgb { 209 247 133 }
}

#WGR = {
#	color = rgb { 1 2 3 }
#	color_ui = rgb { 1 2 3 }
#}

GER = {
	color = rgb { 50 60 70 }
	color_ui = rgb { 80 90 100 }
}
`;
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const blockOf = (txt, tag) => (new RegExp(`(?:^|\\n)${tag}\\s*=\\s*\\{[\\s\\S]*?\\n\\}`).exec(txt) || [])[0] || "";

// ── the live colour must change, not the commented one ────────────────────────────────────────────
const r1 = mapData.setCountryColor({ modRoot: MOD, gameRoot: null, dependencyRoots: [], tag: "MON", rgb: [255, 0, 0] });
ok("setting Mongolia's colour reports a change", r1 && r1.changed, r1);
const afterMon = fs.readFileSync(FILE, "utf8");
const monBlock = blockOf(afterMon, "MON");
ok("the LIVE color line now holds the new colour", /(?:^|\n)\s*color = rgb \{ 255 0 0 \}/.test(monBlock), monBlock);
ok("…and the old live colour is gone", !/108 140 42/.test(monBlock), monBlock);
ok("the commented HSV line is left exactly as it was",
  /#color = HSV \{ 0\.1 0\.15 0\.4 \}/.test(monBlock), monBlock);
ok("…and the new colour was NOT written into that comment",
  !/#color = rgb \{ 255 0 0 \}/.test(monBlock) && !/#color\s*=\s*rgb/.test(monBlock), monBlock);
ok("color_ui is untouched", /color_ui = rgb \{ 209 247 133 \}/.test(monBlock), monBlock);

// ── a commented-out BLOCK must not be adopted as a real one ───────────────────────────────────────
const r2 = mapData.setCountryColor({ modRoot: MOD, gameRoot: null, dependencyRoots: [], tag: "WGR", rgb: [11, 22, 33] });
ok("setting a colour for a tag that only exists commented-out still succeeds", r2 && r2.changed, r2);
const afterWgr = fs.readFileSync(FILE, "utf8");
ok("…the commented block is left intact", /#WGR = \{/.test(afterWgr) && /#\tcolor = rgb \{ 1 2 3 \}/.test(afterWgr), afterWgr);
ok("…and a REAL WGR block was appended instead",
  /(?:^|\n)WGR = \{[\s\S]*?color = rgb \{ 11 22 33 \}/.test(afterWgr), afterWgr);

// ── an ordinary block with no comments still works exactly as before ──────────────────────────────
const r3 = mapData.setCountryColor({ modRoot: MOD, gameRoot: null, dependencyRoots: [], tag: "GER", rgb: [7, 8, 9] });
ok("an uncommented block still updates", r3 && r3.changed, r3);
const afterGer = fs.readFileSync(FILE, "utf8");
ok("…to the new colour", /color = rgb \{ 7 8 9 \}/.test(blockOf(afterGer, "GER")), blockOf(afterGer, "GER"));
ok("…without disturbing Mongolia", /color = rgb \{ 255 0 0 \}/.test(blockOf(afterGer, "MON")), blockOf(afterGer, "MON"));
ok("the file is still brace-balanced (comment braces were not counted)",
  (() => { const m = afterGer.replace(/#[^\n]*/g, ""); let d = 0; for (const c of m) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(),
  afterGer);

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log("\ntest-country-color-comment: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 13 ? 0 : 1;
