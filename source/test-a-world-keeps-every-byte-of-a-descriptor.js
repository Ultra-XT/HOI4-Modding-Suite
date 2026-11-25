// 🌍 Generate a world's step 1 adds ONE line to a mod's descriptors and keeps every other byte — whatever the file's encoding and
// whatever line ending its name line has. #a-world-keeps-every-byte-of-a-descriptor (review-safety of the world run)
//
// Step 1 read each descriptor as UTF-8 and wrote the splice back as UTF-8: a byte that is not UTF-8 (a name typed in an ANSI editor,
// "Großreich" saved as Windows-1252) came back as EF BF BD — U+FFFD — in descriptor.mod AND in the launcher's .mod, so the launcher
// lists the mod under a broken name, permanently (#backup-decoded-and-re-encoded is the same bug in the backup path). And a file whose
// line endings are mixed had its name line's own ending changed. map-data already splices bytes without decoding them where this
// matters (fixModelsOnTheOldGround: "latin1: one character per byte, so the fixer's rewrite of one column gives back every other
// byte as it was"). Measured on this machine: 0 of 260 installed descriptors are non-UTF-8 or mixed — the exposure is a hand-edited
// descriptor, which is why the guard is a byte comparison and not a corpus count.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-bytes-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const md = require("./map-data.js");
const LINE = 'replace_path="history/states"';
/** The file's bytes with the one added line taken out, compared byte for byte with what was there: "" when only that line came. */
function onlyTheLine(before, after) {
  const a = before.toString("latin1").split("\n"), b = after.toString("latin1").split("\n");
  const at = b.findIndex((l) => l.replace(/\r$/, "") === LINE);
  if (at < 0 || b.length !== a.length + 1) return `the line was not added once (lines ${a.length} -> ${b.length})`;
  const rest = b.slice(0, at).concat(b.slice(at + 1));
  const bad = a.map((l, i) => (l === rest[i] ? null : `line ${i + 1}: ${JSON.stringify(l)} -> ${JSON.stringify(rest[i])}`)).filter(Boolean);
  return bad.join("; ");
}
const cases = [
  ["a Windows-1252 byte in the name (Großreich)", Buffer.concat([Buffer.from('version="1"\r\nname="Gro'), Buffer.from([0xdf]), Buffer.from('reich"\r\nsupported_version="1.*"\r\n')])],
  ["a Windows-1252 byte in a comment above the name", Buffer.concat([Buffer.from("# caf"), Buffer.from([0xe9]), Buffer.from('\nname="Cafe"\nversion="1"\n')])],
  ["mixed endings, the name line LF in a CRLF file", Buffer.from('version="1"\r\nname="Mixed"\npath="mod/mixed"\r\n')],
  // THE CONTROLS: the shapes that already kept every byte
  ["CONTROL: UTF-8 with a BOM and CRLF", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('name="Ünï"\r\nversion="1"\r\n', "utf8")])],
  ["CONTROL: New mod's LF descriptor", Buffer.from('version="1"\ntags={\n\t"Gameplay"\n}\nname="Plain"\nsupported_version="1.*"\n')],
];
cases.forEach(([label, bytes], i) => {
  const dir = path.join(DIRS.mods, "bytes_" + i);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), bytes);
  const entry = Buffer.concat([bytes, Buffer.from(`path="${dir.replace(/\\/g, "/")}"\n`)]);
  fs.writeFileSync(path.join(DIRS.mods, "bytes_" + i + ".mod"), entry);
  const r = md.prepareModForNewWorld({ modRoot: dir, gameRoot: DIRS.game, dependencyRoots: [], modsRoot: DIRS.mods });
  const d = onlyTheLine(bytes, fs.readFileSync(path.join(dir, "descriptor.mod")));
  rec(`⭐⭐ ${label}: descriptor.mod gets the line and keeps every other byte`, r.ok === true && d === "", d || r.error);
  // (the launcher's .mod: step 1 finds it only through server.js's lookup; here it is the <folder>.mod beside the folder)
  const e = onlyTheLine(entry, fs.readFileSync(path.join(DIRS.mods, "bytes_" + i + ".mod")));
  rec(`⭐⭐ ${label}: the .mod beside it too`, e === "", e);
  rec(`…and the game's reading of the descriptor sees the line`, md.readReplacePaths(dir).has("history/states"));
});
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
