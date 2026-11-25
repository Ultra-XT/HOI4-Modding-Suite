// ⛔ #a-caption-must-not-start-inside-a-commented-out-block — REMOVING A STATEMENT TOOK THE TAIL OF THE COMMENTED-OUT ONE
// ABOVE IT, AND LEFT THE FILE A BRACE HEAVIER THAN IT CAN CLOSE.
//
// A comment above a key belongs to that key, so removing the key removes its caption: captionStart walks up over the own-line
// comments directly above a statement. It stops at a commented-out assignment (`#naval_base = 2`), because that is somebody's
// disabled statement and not a caption. What it did not do is give back the lines of THAT statement it had already walked
// past — so over the shape vanilla writes constantly,
//
//     #victory_points = {
//     #	976 1
//     #}
//     victory_points = { 7127 3 }
//
// the walk absorbed `#}` and `#	976 1`, stopped at `#victory_points = {`, and the removal deleted the two body lines and
// left the opening comment dangling. Comments are content, and this one carried a brace.
//
// MEASURED on the owner's own workflow at 4601d18 — new mod over vanilla, Delete map, Generate land at the page's defaults,
// Auto-fix twice — in two vanilla files Nova had materialised into the mod and then edited: 47-Greece.txt and
// 474-Yucatan.txt, both left with a dangling `#victory_points = {` and both reported by the validator as
// state_file_unreadable, "no state could be read from it … HOI4 will skip it, leaving its provinces unassigned". They were
// 2 of the 3 errors left on that map after two clicks.
//
// This drives the real writer, writeStateFields, on the real file, and asks the whole installed corpus the same question.
//
// Run: node test-a-caption-must-not-start-inside-a-commented-out-block.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caption-"));
process.env.NOVA_HOME_DIR = path.join(TMP, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
/** The comment structure of a file, counted the way the damage shows: every own-line comment's brace balance. */
const commentBraces = (txt) => {
  let opens = 0, closes = 0, lines = 0;
  for (const raw of String(txt).split(/\r?\n/)) {
    if (!/^[ \t]*#/.test(raw)) continue;
    lines++;
    for (const ch of raw.replace(/^[ \t]*#+/, "")) { if (ch === "{") opens++; else if (ch === "}") closes++; }
  }
  return { opens, closes, lines };
};
const same = (a, b) => a.opens === b.opens && a.closes === b.closes && a.lines === b.lines;

/** A mod holding one copy of a base-game state file, and the writer the flow uses. */
const rewriteWithNoVps = (fileName, stateId) => {
  const mod = fs.mkdtempSync(path.join(TMP, "mod-"));
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="caption probe"\n');
  const dst = path.join(mod, "history", "states", fileName);
  fs.copyFileSync(path.join(GAME, "history", "states", fileName), dst);
  const before = fs.readFileSync(dst, "utf8");
  const r = md.writeStateFields({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId, fields: { victoryPoints: [] } });
  return { before, after: fs.readFileSync(dst, "utf8"), r };
};

try {
  const statesDir = path.join(GAME, "history", "states");
  const haveGame = fs.existsSync(path.join(GAME, "hoi4.exe")) && fs.existsSync(statesDir);
  if (!haveGame) {
    console.log("SKIP: the base game is not installed at " + GAME);
  } else {
    console.log("0. The corpus picks the fixture — a state file whose commented-out block sits directly above a live one");
    // DERIVED, never typed: every base-game state file where an own-line `#…= {` is followed, within its comment run, by a
    // `#}` and then a LIVE victory_points block. That is the shape the walk used to eat into.
    const candidates = [];
    for (const f of fs.readdirSync(statesDir)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      let txt = ""; try { txt = fs.readFileSync(path.join(statesDir, f), "utf8"); } catch (_) { continue; }
      const lines = txt.split(/\r?\n/);
      for (let i = 0; i + 1 < lines.length; i++) {
        if (!/^[ \t]*#[ \t]*\}/.test(lines[i])) continue;                       // a commented close…
        if (!/^[ \t]*victory_points\s*=\s*\{/.test(lines[i + 1])) continue;     // …with a LIVE block right under it
        const id = (/\bid\s*=\s*(\d+)/.exec(txt) || [])[1];
        if (id) candidates.push({ file: f, id: +id });
        break;
      }
    }
    rec("the base game ships this shape, so the fixture is real", candidates.length > 0, candidates.slice(0, 6));

    console.log("\n1. ⭐⭐⭐ Removing the live block leaves every comment exactly as the author wrote it");
    for (const c of candidates.slice(0, 4)) {
      const { before, after, r } = rewriteWithNoVps(c.file, c.id);
      rec(`${c.file}: the writer really rewrote it`, r && r.changed === true, r);
      rec(`${c.file}: …no live victory_points block is left`, !/^[ \t]*victory_points\s*=\s*\{/m.test(after),
        (after.match(/^[ \t]*victory_points[^\n]*/gm) || []).slice(0, 3));
      const b = commentBraces(before), a = commentBraces(after);
      rec(`⭐⭐⭐ ${c.file}: …and not one comment line, or one brace inside one, is lost`, same(b, a), { before: b, after: a });
      rec(`${c.file}: …so the file still reads as one state`, (md.parseStatesText(after) || []).length === 1,
        (md.parseStatesText(after) || []).length);
    }

    console.log("\n2. ⚠️ CONTROL: a real caption is still removed with the statement it captions");
    {
      // Without this the fix would look like "never take a caption", which is the opposite mistake: a note the author wrote
      // about a statement must not outlive it, orphaned against something else.
      const mod = fs.mkdtempSync(path.join(TMP, "mod-cap-"));
      fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="caption control"\n');
      // An id no base-game file declares, so the writer edits THIS file and not a vanilla one of another name.
      const dst = path.join(mod, "history", "states", "5000-Cap.txt");
      fs.writeFileSync(dst, "state = {\n\tid = 5000\n\tname = \"STATE_5000\"\n\tprovinces = { 7 }\n\thistory = {\n"
        + "\t\t# Athens, the capital\n\t\t# worth three\n\t\tvictory_points = { 7 3 }\n\t}\n}\n");
      md.writeStateFields({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 5000, fields: { victoryPoints: [] } });
      const after = fs.readFileSync(dst, "utf8");
      rec("the statement is gone", !/victory_points/.test(after), after);
      rec("⚠️ …and its caption went with it, both lines", !/Athens/.test(after) && !/worth three/.test(after), after);
    }

    console.log("\n3. ⚠️ CONTROL: a balanced comment above a statement is still its caption");
    {
      // `# victory_points = { 7 3 }` on one line opens and closes, so nothing about it says "I am the tail of a block".
      // The commented-out-assignment guard, which predates this, is what stops it — and it must still stop it.
      const mod = fs.mkdtempSync(path.join(TMP, "mod-bal-"));
      fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="balanced control"\n');
      const dst = path.join(mod, "history", "states", "5001-Bal.txt");
      fs.writeFileSync(dst, "state = {\n\tid = 5001\n\tname = \"STATE_5001\"\n\tprovinces = { 7 }\n\thistory = {\n"
        + "\t\t#victory_points = { 7 9 }\n\t\tvictory_points = { 7 3 }\n\t}\n}\n");
      md.writeStateFields({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 5001, fields: { victoryPoints: [] } });
      const after = fs.readFileSync(dst, "utf8");
      rec("the live statement is gone", !/^[ \t]*victory_points/m.test(after), after);
      rec("⚠️ …and the disabled one the author kept is still there, whole", /#victory_points = \{ 7 9 \}/.test(after), after);
    }
  }
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  console.log(`\n=== a caption must not start inside a commented-out block: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
}
