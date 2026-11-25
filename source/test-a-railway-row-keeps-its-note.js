// ⛔ #a-railway-row-keeps-its-note — a railway row with a trailing `# note` is a railway, and a commented-out row is not.
//
// A `#` starts a comment in map/railways.txt, as the game reads it. Every railway WRITER here already read a line up to its `#`
// (the water cleanup, the gap splitter, the rows-below reader, railway_malformed_row — whose own test calls `1 2 10 11 # trailing
// note` "fine"), but parseRailways, the reader behind buildMapModel's railways, took the whole line: the note's `#` was a NaN, the row
// was dropped, and the map drew no railway the game loads while the gap rules never judged it. The fix next door, adopted.
//
// The 2026-11-20 update (HOI4 1.20) put the other half of it in the base game: map/railways.txt now carries a commented-out row
// (`#1 3 6747 723 3707`, line 883 when it shipped). It must stay out of the model. Both are derived below from the installed file
// rather than typed, so a later update that moves or adds such rows is still judged.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-railnote-home-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;
process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const { stripJsComments, jsBodyAt } = require("./testlib-strip-comments.js");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};
const tmps = [SANDBOX];
// The code of a line as the game reads it: everything before its `#`.
const codeOf = (line) => { const h = line.indexOf("#"); return (h === -1 ? line : line.slice(0, h)).trim(); };
const isRow = (code) => /^-?\d+(\s+-?\d+)+$/.test(code);

try {
  console.log("1. ⛔ the reader itself");
  {
    const rows = md.parseRailways("1 2 10 11 # checked by hand\n2 3 4 5 6\n#1 3 6747 723 3707 \n   # a note on its own line\n");
    rec("⭐⭐⭐ a row with a trailing note is read, its provinces without the note", rows.some((r) => r.level === 1 && r.provinces.join(",") === "10,11"), rows);
    rec("…a plain row as before", rows.some((r) => r.level === 2 && r.provinces.join(",") === "4,5,6"), rows);
    rec("⭐⭐ a commented-out row is no row", !rows.some((r) => r.provinces.includes(6747)) && rows.length === 2, rows);
  }

  console.log("\n2. ⛔ the source: parseRailways reads a line up to its `#` (comments masked)");
  {
    const code = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const at = code.indexOf("function parseRailways(");
    const body = at === -1 ? null : jsBodyAt(code, at);
    const text = body ? code.slice(body[0], body[1] + 1) : "";
    rec("parseRailways is found", !!body);
    rec("⭐⭐ its line loop cuts each line at its `#`", /indexOf\(\s*"#"\s*\)/.test(text), text.slice(0, 200));
  }

  console.log("\n3. ⛔ the installed base game's railways.txt, read as the game reads it");
  const railFile = path.join(GAME, "map", "railways.txt");
  if (!fs.existsSync(railFile)) console.log("  SKIP — no base game at " + GAME);
  else {
    const lines = fs.readFileSync(railFile, "utf8").split(/\r?\n/);
    const live = lines.map(codeOf).filter(isRow);
    const commented = lines.filter((l) => /^\s*#/.test(l)).map((l) => l.replace(/^\s*#+/, "").trim()).filter(isRow);
    const rows = md.parseRailways(lines.join("\n"));
    rec(`⭐⭐⭐ every live row is read (${live.length}), and nothing else`, rows.length === live.length, { read: rows.length, live: live.length });
    const asCode = new Set(rows.map((r) => `${r.level} ${r.provinces.length} ${r.provinces.join(" ")}`));
    rec("…each one as the row the file holds", live.every((c) => asCode.has(c.split(/\s+/).join(" "))), live.filter((c) => !asCode.has(c.split(/\s+/).join(" "))).slice(0, 3));
    // commented-out rows the base game ships (1.20 has one); a row that is ALSO live elsewhere in the file is not judged here
    const liveSet = new Set(live.map((c) => c.split(/\s+/).join(" ")));
    const dead = commented.map((c) => c.split(/\s+/).join(" ")).filter((c) => !liveSet.has(c));
    console.log(`     the base game ships ${dead.length} commented-out row(s)${dead.length ? ": " + dead.slice(0, 3).join(" | ") : ""}`);
    rec("⭐⭐ …and none of its commented-out rows is", dead.every((c) => !asCode.has(c)), dead.filter((c) => asCode.has(c)));

    console.log("\n4. ⛔ through the model the map page loads: a mod over the base game whose railways.txt carries a note");
    const mod = path.join(SANDBOX, "mods", "railnote");
    fs.mkdirSync(path.join(mod, "map"), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Rail note"\nsupported_version="1.20.*"\n');
    const firstAt = lines.findIndex((l) => isRow(codeOf(l)) && l.indexOf("#") === -1);
    const noted = lines.slice();
    noted[firstAt] = noted[firstAt].trimEnd() + " # checked by hand";
    fs.writeFileSync(path.join(mod, "map", "railways.txt"), noted.join("\n"));
    const m = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const want = codeOf(noted[firstAt]).split(/\s+/).map(Number);
    rec(`⭐⭐⭐ the model holds every live row (${live.length})`, (m.railways || []).length === live.length, { model: (m.railways || []).length, live: live.length });
    rec("⭐⭐ …the noted one among them", (m.railways || []).some((r) => r.level === want[0] && r.provinces.join(" ") === want.slice(2).join(" ")), want.slice(0, 6));
  }

  console.log(`\n=== a railway row keeps its note: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
