// ⛔ #character-key-read-by-its-tail — A CHARACTER IS INDEXED UNDER ITS WHOLE KEY, AND NAMED BY ITS WHOLE TOKEN.
//
// mod-index.js read a block key with [A-Za-z0-9_.\-], in a scan that is not anchored, so a key holding a letter
// outside that class matched from AFTER the letter. Measured over the base game and the 14 installed Workshop
// items (2026-11-13), 146 character keys hold such a letter:
//
//   • vanilla's `CHL_jorge_gonzález_von_marées = {` was indexed as a character called `es`, and
//     `PRU_sebastián_lynch` and `PRU_hilarión_lynch` both as `n_lynch` — a duplicate_id ERROR on content the
//     game loads cleanly, shown for any mod that ships vanilla's PRU.txt;
//   • a key ENDING in one — Millennium Dawn's `ITA_giovanni_ridinò`, Novum Vexillum's six `BOS_…ć` — matched
//     nowhere, so the scan stepped inside the character and indexed its `portraits`, `corps_commander` and
//     `advisor` blocks as characters of their own: more false duplicate_id errors, and missing_localization rows
//     for "portraits" that Fix all answered by writing ` portraits:0 "Portraits"` into the user's mod;
//   • the character's own `name = <token>` was read with the same class, so Rise of Nations'
//     `name = GER_jürgen_wagner` became the key `GER_j` — and Fix all wrote ` GER_j:0 "GER J"`, a key nothing
//     reads, then reported the problem fixed while the game still showed the raw token.
//
// Census of the change over the same 15 roots: only duplicate_id and missing_localization move; 16 false
// duplicate_id errors and 131 false or misdirected missing_localization rows go; the rows that appear are the
// whole keys, and every one of those but one is a key no localisation line can hold (that refusal is
// test-a-name-the-game-cannot-localise-is-not-auto-fixed.js). The one other is Rise of Nations' character whose
// no-DLC instance really does say `name= allowed`.
//
// What this holds:
//   • a fixture of every shape above, plus the two the class must NOT break: a key that starts with a digit (the
//     reader always accepted one — a letter-first class, unanchored, would read `1st_army = {` as `st_army`) and a
//     token that ends in a dot (Novum Vexillum's `USA_john_nicholson_jr.`);
//   • a name token runs to the token's end, not the class's — `name=USA_terrence_o`shaughnessy` (Rise of Nations)
//     is that whole token to the game;
//   • on the installed game, if it is here: every character the index reads out of common/characters is a key an
//     independent reader of the same files finds there, whole — derived from the files, no name typed in.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex, isHoi4GameFolder } = require("./mod-index.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 220) : JSON.stringify(detail).slice(0, 220))));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

// Non-ASCII letters built from code points, so an editor or a shell cannot change what the fixture holds.
const a_ = "\u00e1", o_ = "\u00f3", ograve = "\u00f2", u_ = "\u00fc", c_ = "\u0107", s_ = "\u0161", ch_ = "\u010d";
const SEBASTIAN = "PRU_sebasti" + a_ + "n_lynch";
const HILARION = "PRU_hilari" + o_ + "n_lynch";
const RIDINO = "ITA_giovanni_ridin" + ograve;          // ends in a non-ASCII letter: Millennium Dawn's shape
const KRISTOFOVIC = "SLO_juraj_kri" + s_ + "tofovi" + ch_;
const TURSUNOVIC = "BOS_husein_tursunovi" + c_;        // Novum Vexillum's shape: no name of its own
const WAGNER = "GER_j" + u_ + "rgen_wagner";           // Rise of Nations' shape: a bare non-ASCII name token
const BACKTICK = "USA_terrence_o`shaughnessy";         // Rise of Nations writes exactly this
const LEADING = "\u00c1d" + a_ + "m_kovacs_name";  // a name token that STARTS outside ASCII
const FOCUS_TEXT = "NVX_b" + a_ + "r_focus";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-charkey-"));
const write = (rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};
const roles = "\t\tportraits = {\n\t\t\tarmy = { large = GFX_x }\n\t\t}\n"
  + "\t\tcorps_commander = {\n\t\t\tskill = 2\n\t\t}\n"
  + "\t\tadvisor = {\n\t\t\tslot = political_advisor\n\t\t\tidea_token = x_token\n\t\t}\n";

try {
  write("descriptor.mod", 'name="character keys whole"\n');
  write(path.join("common", "characters", "c.txt"), "characters = {\n"
    + `\t${SEBASTIAN} = {\n\t\tname = "Sebasti${a_}n Lynch"\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
    + `\t${HILARION} = {\n\t\tname = "Hilari${o_}n Lynch"\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
    + `\t${RIDINO} = {\n\t\tname = "Giovanni Ridin${ograve}"\n${roles}\t}\n`
    + `\t${KRISTOFOVIC} = {\n\t\tname = "Juraj Kri${s_}tofovi${ch_}"\n${roles}\t}\n`
    + `\t${TURSUNOVIC} = {\n${roles}\t}\n`
    + `\t${WAGNER} = {\n\t\tname = ${WAGNER}\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
    + `\tUSA_terrence_oshaughnessy={\n\t\tname=${BACKTICK}\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
    + "\tUSA_john_nicholson_jr. = {\n\t\tname = \"John Nicholson Jr.\"\n\t\tcorps_commander = { skill = 1 }\n\t}\n"
    + `\tHUN_adam_kovacs = {\n\t\tname = ${LEADING}\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
    + "}\n");
  write(path.join("common", "ideas", "i.txt"),
    "ideas = {\n\tcountry = {\n\t\t1st_army_spirit = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n");
  write(path.join("common", "national_focus", "f.txt"),
    `focus_tree = {\n\tid = nvx_tree\n\tfocus = {\n\t\tid = nvx_focus\n\t\ttext = ${FOCUS_TEXT}\n\t\ticon = GFX_a\n\t\tx = 1\n\t\ty = 1\n\t\tcost = 1\n\t}\n}\n`);
  write(path.join("localisation", "english", "x_l_english.yml"),
    "\ufeffl_english:\n 1st_army_spirit:0 \"First Army\"\n nvx_focus:0 \"A Focus\"\n");

  const idx = buildModIndex(root, {});
  const chars = idx.entities.filter((e) => e.type === "idea" && e.fromCharacter && !e.advisorToken).map((e) => e.id);
  const has = (id) => chars.includes(id);

  console.log("\n-- a character key is indexed whole --");
  rec("keys holding an accented letter are indexed under the whole key", has(SEBASTIAN) && has(HILARION), chars);
  rec("...not under their shared tail", !has("n_lynch"), chars);
  rec("keys ENDING in one are indexed whole", has(RIDINO) && has(KRISTOFOVIC) && has(TURSUNOVIC), chars);
  rec("...and their nested blocks are not characters", !["portraits", "corps_commander", "advisor"].some(has), chars);
  rec("exactly the nine characters the file defines, and nothing else", chars.length === 9 && has("USA_john_nicholson_jr.") && has("USA_terrence_oshaughnessy") && has(WAGNER) && has("HUN_adam_kovacs"), chars);
  const dups = idx.problems.filter((p) => p.rule === "duplicate_id");
  rec("no duplicate_id is reported for nine different characters", dups.length === 0, dups.map((p) => p.entityId));

  console.log("\n-- what the class must not break --");
  const ideas = idx.entities.filter((e) => e.type === "idea" && !e.fromCharacter).map((e) => e.id);
  rec("a key that starts with a digit is still read whole", ideas.includes("1st_army_spirit") && !ideas.includes("st_army_spirit"), ideas);

  console.log("\n-- a name token is read to the end of the token --");
  const loc = (id) => idx.problems.find((p) => p.rule === "missing_localization" && p.entityId === id);
  rec("a bare non-ASCII name token is the key, whole", !!loc(WAGNER) && loc(WAGNER).locKey === WAGNER, loc(WAGNER) && loc(WAGNER).locKey);
  rec("...never the head the ASCII class stops at", !idx.problems.some((p) => p.locKey === "GER_j"), idx.problems.map((p) => p.locKey).filter(Boolean));
  rec("a name token that starts outside ASCII is read too, not passed over for the character's own key",
    !!loc("HUN_adam_kovacs") && loc("HUN_adam_kovacs").locKey === LEADING, loc("HUN_adam_kovacs") && loc("HUN_adam_kovacs").locKey);
  rec("a token carrying a character the class does not hold is still read whole",
    !!loc("USA_terrence_oshaughnessy") && loc("USA_terrence_oshaughnessy").locKey === BACKTICK,
    loc("USA_terrence_oshaughnessy") && loc("USA_terrence_oshaughnessy").locKey);
  rec("a focus's `text =` token is read the same way", !!loc("nvx_focus") && loc("nvx_focus").locKey === FOCUS_TEXT,
    loc("nvx_focus") && loc("nvx_focus").locKey);
  rec("a character named by a quoted literal needs no localisation, whatever its key holds",
    ![SEBASTIAN, HILARION, RIDINO, KRISTOFOVIC, "USA_john_nicholson_jr."].some((id) => loc(id)),
    idx.problems.filter((p) => p.rule === "missing_localization").map((p) => p.entityId));

  console.log("\n-- on the installed game, if it is here --");
  const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (isHoi4GameFolder(G)) {
    // An independent reader: a token is a run of anything but whitespace, braces, `=`, a quote or `#`. Every
    // `characters = { KEY = { … } }` in every file, keys as the file spells them.
    const maskComments = (s) => s.replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
    const matchBrace = (t, open) => { let d = 0; for (let i = open; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}" && --d === 0) return i; } return -1; };
    const blocks = (t, from, to) => {
      const out = []; const re = /([^\s{}="#]+)\s*=\s*\{/y;
      for (let i = from; i < to;) {
        if (/\s/.test(t[i])) { i++; continue; }
        re.lastIndex = i; const m = re.exec(t);
        if (m) { const open = i + m[0].length - 1; const close = matchBrace(t, open); out.push({ key: m[1], open, close: close === -1 ? to : close }); i = close === -1 ? to : close + 1; continue; }
        if (t[i] === "{") { const c = matchBrace(t, i); i = c === -1 ? to : c + 1; continue; }
        const tk = /[^\s{}]+|[{}]/y; tk.lastIndex = i; const x = tk.exec(t); i += x ? x[0].length : 1;
      }
      return out;
    };
    const dir = path.join(G, "common", "characters");
    const want = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt"))) {
      const t = maskComments(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const top of blocks(t, 0, t.length)) if (top.key === "characters") for (const c of blocks(t, top.open + 1, top.close)) want.push(c.key);
    }
    const v = buildModIndex(G, { vanillaRoot: null, dependencyRoots: [] });
    const got = v.entities.filter((e) => e.type === "idea" && e.fromCharacter && !e.advisorToken).map((e) => e.id);
    const count = (list) => list.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
    const cw = count(want), cg = count(got);
    const missing = [...cw].filter(([k, n]) => (cg.get(k) || 0) < n).map(([k]) => k);
    const invented = [...cg].filter(([k, n]) => (cw.get(k) || 0) < n).map(([k]) => k);
    const nonAscii = want.filter((k) => /[^\x00-\x7f]/.test(k)).length;
    rec(`every character the base game defines is indexed under the key its file spells (${want.length} keys, ${nonAscii} with a letter outside ASCII)`,
      want.length > 1000 && missing.length === 0, missing.slice(0, 12));
    rec("...and the index reads no character the files do not define", invented.length === 0, invented.slice(0, 12));
  } else {
    skip("the real-install check: no game at " + G + " (set HOI4_ROOT). It did NOT run; the fixture above holds every shape.");
  }
} catch (e) {
  console.error(e);
  fails.push("threw: " + e.message);
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
  + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
process.exitCode = fails.length ? 1 : 0;
