// #colors-file-unbalanced — setting a colour in a damaged colors.txt said nothing about the damage.
//
// A real mod turned up with two colour bodies in common/countries/colors.txt that had no `TAG = {` opener at
// all, leaving the file two closing braces short. HOI4 reads that file positionally, so every tag after the
// damaged point is suspect.
//
// The write itself is SAFE on such a file, and that is measured here rather than assumed: it edits the right
// block, appends a new one correctly, and the imbalance neither grows nor spreads. Refusing would block a
// modder from recolouring over damage they may not know about, so the proportionate move is to say so and
// carry on — the map page surfaces it after Save beside the other advisories.
//
// The negative half matters as much: a healthy file must stay silent, or the warning becomes noise on every
// single colour change.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-colorwarn-"));
const file = path.join(ROOT, "common", "countries", "colors.txt");
fs.mkdirSync(path.dirname(file), { recursive: true });

const HEALTHY = [
  "#reload countrycolors",
  "",
  "GER = {",
  "\tcolor = rgb { 1 2 3 }",
  "\tcolor_ui = rgb { 1 2 3 }",
  "}",
  "",
].join("\n");

// The exact shape found in the wild: a colour body with no opener.
const CORRUPT = HEALTHY + [
  "\tcolor = rgb { 59 125 216 }",
  "\tcolor_ui = rgb { 59 125 216 }",
  "}",
  "",
].join("\n");

const balance = (t) => {
  let d = 0, c = false;
  for (const ch of String(t)) {
    if (c) { if (ch === "\n") c = false; continue; }
    if (ch === "#") { c = true; continue; }
    if (ch === "{") d++; else if (ch === "}") d--;
  }
  return d;
};
const set = (tag, rgb) => md.setCountryColor({ modRoot: ROOT, gameRoot: "", dependencyRoots: [], tag, rgb });

// ── a healthy file stays silent ────────────────────────────────────────────────────────────────
fs.writeFileSync(file, HEALTHY, "utf8");
const r1 = set("GER", [9, 9, 9]);
ok("editing a tag in a healthy file works", r1.changed === true, r1);
ok("…and warns about nothing", !r1.fileWarning, r1.fileWarning);
const r2 = set("NUA", [59, 125, 216]);
ok("appending a new tag to a healthy file works", r2.changed === true && r2.insertedNewBlock === true, r2);
ok("…and still warns about nothing", !r2.fileWarning, r2.fileWarning);
ok("…and the file is still balanced", balance(fs.readFileSync(file, "utf8")) === 0);

// ── a damaged file is written safely, and reported ─────────────────────────────────────────────
for (const [label, tag, rgb, expectAppend] of [
  ["editing an existing tag", "GER", [7, 7, 7], false],
  ["appending a new tag", "NUA", [59, 125, 216], true],
]) {
  fs.writeFileSync(file, CORRUPT, "utf8");
  const before = balance(CORRUPT);
  const r = set(tag, rgb);
  const after = fs.readFileSync(file, "utf8");
  ok(`${label} in a damaged file still succeeds`, r.changed === true, r);
  ok("…and is reported as damaged", !!r.fileWarning, r);
  ok("…naming the file", /colors\.txt/.test(String(r.fileWarning)), r.fileWarning);
  ok("…saying the colour WAS saved", /was saved/i.test(String(r.fileWarning)), r.fileWarning);
  ok("…and pointing at where to see it", /Mod Health/.test(String(r.fileWarning)), r.fileWarning);
  ok("…the damage did not grow", balance(after) === before, { before, after: balance(after) });
  ok("…and the intended write really happened",
    expectAppend ? new RegExp(`${tag} = \\{`).test(after) : /color = rgb \{ 7 7 7 \}/.test(after), after.slice(0, 200));
}

// ── a stray closing brace is described the other way round ─────────────────────────────────────
fs.writeFileSync(file, HEALTHY + "}\n", "utf8");
const r3 = set("GER", [4, 4, 4]);
ok("a stray closing brace is reported", !!r3.fileWarning, r3);
ok("…as a closer with nothing open", /nothing open/i.test(String(r3.fileWarning)), r3.fileWarning);

// ── the client actually shows it ───────────────────────────────────────────────────────────────
// The map page buffers writes and flushes on Save, so a per-write advisory is easy to drop on the floor.
{
  const src = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  ok("the map page collects fileWarning from each write", /res\.fileWarning/.test(src));
  ok("…into the same post-save warning line", /writeWarnings\.push\(res\.fileWarning\)/.test(src));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log("\ntest-colors-file-unbalanced-warning: " + pass + " checks passed");
