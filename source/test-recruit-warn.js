// Regression: Mod Health must warn when recruit_character appears in a focus reward or event
// effect (it only works in game-start history files). Guards RULE 4 (recruit_character_misplaced),
// and that the warning names the character the file names (#recruit-character-id-read-short).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex, extractRefs } = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-recruit-"));
try {
  // Focus with recruit_character in completion_reward
  const nf = path.join(tmp, "common", "national_focus");
  fs.mkdirSync(nf, { recursive: true });
  fs.writeFileSync(path.join(nf, "t.txt"),
    `focus_tree = {\n\tid = t_tree\n\tfocus = {\n\t\tid = t_focus\n\t\tx = 1\n\t\ty = 1\n\t\tcompletion_reward = {\n\t\t\trecruit_character = my_leader\n\t\t}\n\t}\n}\n`, "utf8");
  // Event with recruit_character in immediate
  const ev = path.join(tmp, "events");
  fs.mkdirSync(ev, { recursive: true });
  fs.writeFileSync(path.join(ev, "e.txt"),
    `country_event = {\n\tid = t.1\n\tis_triggered_only = yes\n\timmediate = {\n\t\trecruit_character = my_general\n\t}\n\toption = { name = t.1.a }\n}\n`, "utf8");

  const idx = buildModIndex(tmp, {});
  const warns = idx.problems.filter((p) => p.rule === "recruit_character_misplaced");
  check("warns for recruit_character in a focus", warns.some((w) => w.entityType === "focus" && w.refId === "my_leader"), JSON.stringify(warns));
  check("warns for recruit_character in an event", warns.some((w) => w.entityType === "event" && w.refId === "my_general"), JSON.stringify(warns));
  check("recruit_character does NOT produce a broken_reference error", !idx.problems.some((p) => p.rule === "broken_reference" && (p.refId === "my_leader" || p.refId === "my_general")), "");

  // Clean mod: recruit_character ONLY in history → no warning
  const hist = path.join(tmp, "history", "countries");
  fs.mkdirSync(hist, { recursive: true });
  fs.writeFileSync(path.join(hist, "GRE - x.txt"), `recruit_character = my_leader\n`, "utf8");
  // remove the focus/event recruit usages
  fs.writeFileSync(path.join(nf, "t.txt"), `focus_tree = {\n\tid = t_tree\n\tfocus = {\n\t\tid = t_focus\n\t\tx = 1\n\t\ty = 1\n\t}\n}\n`, "utf8");
  fs.writeFileSync(path.join(ev, "e.txt"), `country_event = {\n\tid = t.1\n\tis_triggered_only = yes\n\toption = { name = t.1.a }\n}\n`, "utf8");
  const idx2 = buildModIndex(tmp, {});
  check("recruit_character in history alone does NOT warn", !idx2.problems.some((p) => p.rule === "recruit_character_misplaced"), JSON.stringify(idx2.problems.filter((p) => p.rule === "recruit_character_misplaced")));

  // #recruit-character-id-read-short — the recruit pattern read [A-Za-z_][A-Za-z0-9_.]*, which stops at a hyphen or
  // an accented letter: it read vanilla's `recruit_character = AUS_arthur_seyss-inquart` as `AUS_arthur_seyss` and
  // IRE_Éamon_de_valera as `IRE_`. Those lines are country history, which RULE 4 does not judge, so the cut was
  // latent: over the base game and the 14 installed Workshop items RULE 4 fires twice, both times on a whole id,
  // with the old class and the new alike (measured 2026-11-13). A focus, event or decision recruiting such a
  // character would have been warned under the head. So what this holds is the CLASS of a character token, one id
  // for each thing it allows but the two named below (counts over the same set, 2026-11-13: 32,286 recruits, every
  // one read whole by the class):
  //   • a hyphen, an accented letter, a trailing dot (Novum Vexillum defines and recruits `USA_john_nicholson_jr.`);
  //   • a digit, as 795 recruits carry (vanilla's AFG_generic_army_1);
  //   • a letter beyond Latin-1, as 6 do (Novum Vexillum's BOS_…ć characters);
  //   • a first letter beyond ASCII: no installed recruit has one, but the Character maker's save guard
  //     (/^[\p{L}_][\p{L}\p{N}_.-]*$/u) accepts it, so Nova itself can write one.
  // Not held: a digit beyond ASCII, which no installed recruit carries; and a leading `_`, which the class and that
  // save guard accept and no installed recruit has (a class that refuses it passes this file, 2026-11-19).
  const WHOLE = ["AUS_arthur_seyss-inquart", "COS_jos\u00e9_mar\u00eda_barahona", "IRE_\u00c9amon_de_valera", "USA_john_nicholson_jr.",
    "AFG_generic_army_1", "BOS_husein_tursunovi\u0107", "\u00c5LA_governor_general"];
  // ...and a token ends where the next one starts even with nothing between them: a closing brace glued to the id.
  // No installed recruit is written that way, but the base game glues 1,415 values to a closing brace (common/,
  // events/ and history/, comments stripped, 2026-11-13), e.g. events/AAT_Denmark.txt
  // `FROM = { remove_ideas = DEN_danish_produce_export_ns_improved}`. A class that read on to the next whitespace
  // would name `GER_glued_general}`.
  const GLUED = "GER_glued_general";
  fs.writeFileSync(path.join(nf, "t.txt"), `focus_tree = {\n\tid = t_tree\n\tfocus = {\n\t\tid = t_focus\n\t\tx = 1\n\t\ty = 1\n\t\tcompletion_reward = {\n`
    + WHOLE.map((id) => `\t\t\trecruit_character = ${id}\n`).join("")
    + `\t\t\thidden_effect = { recruit_character = ${GLUED}}\n` + `\t\t}\n\t}\n}\n`, "utf8");
  const idx3 = buildModIndex(tmp, {});
  const named = idx3.problems.filter((p) => p.rule === "recruit_character_misplaced").map((p) => p.refId);
  for (const id of WHOLE) check("the warning names the whole character it was given: " + id, named.includes(id), JSON.stringify(named));
  check("...and the one with a closing brace glued to it, without the brace: " + GLUED, named.includes(GLUED), JSON.stringify(named));
  check("...and never a head cut off one of them, nor a tail run on",
    named.length === WHOLE.length + 1 && named.every((id) => WHOLE.includes(id) || id === GLUED), JSON.stringify(named));
  for (const id of WHOLE) {
    const got = extractRefs("recruit_character = " + id + "\n").filter((r) => r.context === "recruit_character").map((r) => r.id);
    check("extractRefs reads recruit_character = " + id + " whole", got.length === 1 && got[0] === id, JSON.stringify(got));
  }
  {
    const got = extractRefs("hidden_effect = { recruit_character = " + GLUED + "}").filter((r) => r.context === "recruit_character").map((r) => r.id);
    check("extractRefs stops at a closing brace glued to the id", got.length === 1 && got[0] === GLUED, JSON.stringify(got));
  }
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  rmrf(tmp);
}
console.log(`\nRECRUIT-WARN TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
