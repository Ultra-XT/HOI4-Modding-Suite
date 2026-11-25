// #character-name-falls-back-to-the-token + #character-comment-substring-skip
// TWO THINGS A NO-EDIT CHARACTER SAVE CHANGED IN A FILE IT WAS ASKED TO LEAVE ALONE.
//
// Found by round-tripping real common/characters files through the two endpoints the Characters page uses,
// /api/characters/list and /api/characters/save, with the payload public/characters.js collect() builds —
// loadedRoles included, previousToken/previousFile omitted on a plain re-save, and characters carrying DLC
// `instance = { }` variants skipped, because the page sends instanceIndex only when it loaded variants.
//
// (1) THE NAME. The list mapper resolves a character's display name with
//         resolve(c.name || c.token, c.token)
//     and resolve() falls back to the SECOND key when the first is not a localisation entry. A character
//     whose script gives a literal display name — `name = "Manuel María de Iriondo"` — has a `name` that is
//     not a key, so the fallback fired and the editor's name box was filled with whatever the TOKEN
//     resolves to: a different name than the file carries.
//
//     That list IS where the save payload comes from, so opening such a character and pressing Save with no
//     edit persisted the token's value. And because the resolved name then equalled the inherited one, the
//     localisation write was skipped as well — leaving nothing anywhere in the mod that records the name the
//     file used to have. Measured live before the fix:
//
//         vanilla ARG_manuel_maria_de_iriondo   "Manuel María de Iriondo" -> "Manuel Maria de Iriondo"
//                                               (and in French -> "Manuel de Iriondo")
//         Road to 56 ARG_juan_tonazzi          "Juan Nerón Tonazzi"      -> "Juan Tonazzi"
//
//     9,372 of 29,233 scanned characters have a `name` line that a save rewrites to `name = <token>`.
//     The fallback was only ever meaningful for a character with NO name of its own — and for those the
//     first lookup is already the token, so it was never load-bearing for anything else.
//
// (2) THE NOTES. reattachTrailingComments decided whether a carried comment had already been re-injected
//     with `blockText.includes(w.comment)` — a raw SUBSTRING test. Every comment contains "#", and a short
//     note is a substring of a longer one, so a comment could be judged already-present because a DIFFERENT
//     comment happened to contain its text, and was then dropped. Road to 56's SAU.txt loses exactly the
//     three bare `#` markers trailing its name lines on a no-edit save of its 25 characters.
//
// A third candidate from the same sweep was REFUTED and is recorded here so it is not re-filed: portrait
// values gain quotes (`large = GFX_x` -> `large = "GFX_x"`), but the shipped game writes 3,917 quoted and
// 3,619 unquoted portrait values and uses 52 sprite tokens BOTH ways, so the forms are equivalent — and the
// quotes only appear on a block Nova was already rebuilding for an unrelated reason.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-charname-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const PORT = 53555;
const BASE = "http://127.0.0.1:" + PORT;
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const VAN_ARG = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/characters/ARG.txt";
const R56_SAU = W + "820260968/common/characters/SAU.txt";

let seq = 0;
function mkMod(charText, locLines) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "common", "characters"), { recursive: true });
  fs.mkdirSync(path.join(mod, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova character name"\n');
  fs.writeFileSync(path.join(mod, "common", "characters", "probe.txt"), charText, "utf8");
  if (locLines && locLines.length) {
    fs.writeFileSync(path.join(mod, "localisation", "english", "probe_l_english.yml"),
      "\uFEFFl_english:\n" + locLines.map((l) => " " + l).join("\n") + "\n", "utf8");
  }
  return mod;
}
const charFileOf = (mod) => fs.readFileSync(path.join(mod, "common", "characters", "probe.txt"), "utf8");

async function listChars(mod) {
  const data = await fetch(`${BASE}/api/characters/list?modPath=${encodeURIComponent(mod)}&includeBaseMod=1`).then((r) => r.json());
  return [].concat(...((data.files || []).map((f) => (f.characters || []).map((c) => ({ ...c, file: c.file || f.file })))));
}

// A no-edit save, with the body public/characters.js collect() builds.
async function saveChar(mod, c) {
  const body = {
    modPath: mod,
    token: c.token, name: c.name, gender: c.gender || "",
    file: c.file || "probe.txt",
    portraitCivLarge: c.portraitCivLarge || "", portraitCivSmall: c.portraitCivSmall || "",
    portraitArmyLarge: c.portraitArmyLarge || "", portraitArmySmall: c.portraitArmySmall || "",
    portraitNavyLarge: c.portraitNavyLarge || "", portraitNavySmall: c.portraitNavySmall || "",
    roleLeader: !!c.roleLeader, leaderIdeology: c.leaderIdeology || "", leaderExpire: c.leaderExpire || "", leaderTraits: c.leaderTraits || "",
    roleAdvisor: !!c.roleAdvisor, advisorSlot: c.advisorSlot || "", advisorCost: c.advisorCost || "",
    advisorLedger: c.advisorLedger || "", advisorIdeaToken: c.advisorIdeaToken || "", advisorTraits: c.advisorTraits || "",
    roleGeneral: !!c.roleGeneral, generalType: c.generalType || "",
    // The field that says which roles the form SHOWED — the characters equivalent of formSections.
    loadedRoles: { leader: !!c.roleLeader, advisor: !!c.roleAdvisor, generalType: c.roleGeneral ? (c.generalType || "corps_commander") : null },
    genSkill: c.genSkill || "", genAttack: c.genAttack || "", genDefense: c.genDefense || "",
    genPlanning: c.genPlanning || "", genLogistics: c.genLogistics || "", generalTraits: c.generalTraits || "",
  };
  const r = await fetch(`${BASE}/api/characters/save`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

// What the mod says this character is called, after a save: either the literal still in the script, or the
// localisation entry the save wrote for its token.
function displayedName(mod, token) {
  const script = charFileOf(mod);
  // Scope to THIS character's own block by brace matching. A lazy `[\s\S]*?` across the file finds the
  // next character's literal name instead and reports it as this one's — it read "Hugo Wast" for
  // ARG_manuel_maria_de_iriondo the first time this was written.
  const m = new RegExp("(?:^|\\n)[ \\t]*" + token + "[ \\t]*=[ \\t]*\\{").exec(script);
  let own = "";
  if (m) {
    const open = script.indexOf("{", m.index);
    let d = 0;
    for (let i = open; i < script.length; i++) {
      if (script[i] === "{") d++;
      else if (script[i] === "}") { d--; if (!d) { own = script.slice(open + 1, i); break; } }
    }
  }
  const lit = /(?:^|\n)[ \t]*name[ \t]*=[ \t]*"([^"]*)"/.exec(own);
  if (lit) return lit[1];
  const dir = path.join(mod, "localisation", "english");
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      const t = fs.readFileSync(path.join(dir, f), "utf8");
      const m = new RegExp("^\\s*" + token + ":\\d*\\s+\"([^\"]*)\"", "m").exec(t);
      if (m) best = m[1];
    }
  } catch (_) {}
  return best;
}
const commentCount = (t) => (t.match(/#[^\r\n]*/g) || []).length;

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    // ================================================================ (1) THE NAME
    console.log("\n-- a character whose script gives a literal name --");
    {
      // The token HAS a localisation entry, and it says something DIFFERENT from the script. That is the
      // whole trap: the fallback preferred the token's entry over what the file actually says.
      const text = [
        "characters = {",
        "\tPRB_iriondo = {",
        '\t\tname = "Manuel María de Iriondo"',
        "\t\tportraits = {",
        "\t\t\tcivilian = {",
        "\t\t\t\tlarge = GFX_portrait_probe",
        "\t\t\t}",
        "\t\t}",
        "\t\tcountry_leader = {",
        "\t\t\tideology = despotism",
        "\t\t\texpire = \"1965.1.1.1\"",
        "\t\t\ttraits = { }",
        "\t\t}",
        "\t}",
        "}",
        "",
      ].join("\n");
      const mod = mkMod(text, ['PRB_iriondo:0 "Manuel Maria de Iriondo"']);

      const before = charFileOf(mod);
      rec("CONTROL: the script's literal and the token's loc entry really differ",
        /name = "Manuel María de Iriondo"/.test(before), before);

      const list = await listChars(mod);
      const c = list.find((x) => x.token === "PRB_iriondo");
      rec("the character is listed", !!c, list.map((x) => x.token));
      rec("READ: ⭐ the name box gets what the FILE says, not what the token resolves to",
        !!c && c.name === "Manuel María de Iriondo", c && c.name);

      const r = await saveChar(mod, c);
      rec("the save is accepted", r.status === 200 && r.body && (r.body.ok || !r.body.error), r);
      const shown = displayedName(mod, "PRB_iriondo");
      rec("SAVE: ⭐ the character is still called what the file called it", shown === "Manuel María de Iriondo", shown);
    }

    console.log("\n-- control: a character with NO name of its own still resolves via its token --");
    {
      const text = [
        "characters = {",
        "\tPRB_nameless = {",
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1.1\" traits = { } }",
        "\t}",
        "}",
        "",
      ].join("\n");
      const mod = mkMod(text, ['PRB_nameless:0 "The Nameless One"']);
      const list = await listChars(mod);
      const c = list.find((x) => x.token === "PRB_nameless");
      rec("the character is listed", !!c, list.map((x) => x.token));
      rec("CONTROL: ⭐ with no scripted name, the token's localisation is still used",
        !!c && c.name === "The Nameless One", c && c.name);
    }

    console.log("\n-- control: a scripted name that IS a key still resolves through it --");
    {
      const text = [
        "characters = {",
        "\tPRB_keyed = {",
        "\t\tname = PRB_some_other_key",
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1.1\" traits = { } }",
        "\t}",
        "}",
        "",
      ].join("\n");
      const mod = mkMod(text, ['PRB_some_other_key:0 "Resolved Through The Key"', 'PRB_keyed:0 "The Token Name"']);
      const list = await listChars(mod);
      const c = list.find((x) => x.token === "PRB_keyed");
      rec("CONTROL: ⭐ a scripted key still wins over the token's own entry",
        !!c && c.name === "Resolved Through The Key", c && c.name);
    }

    // ================================================================ (2) THE NOTES
    console.log("\n-- a note that is a substring of another note in the same character --");
    {
      const text = [
        "characters = {",
        "\tPRB_substring = { #note about the character",
        '\t\tname = "Probe Substring" #note',
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1.1\" traits = { } }",
        "\t}",
        "\tPRB_disjoint = { #beta gamma about the character",
        '\t\tname = "Probe Disjoint" #alpha',
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1.1\" traits = { } }",
        "\t}",
        "\tPRB_twin = { #same note",
        '\t\tname = "Probe Twin" #same note',
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1.1\" traits = { } }",
        "\t}",
        "}",
        "",
      ].join("\n");
      const mod = mkMod(text, []);
      const before = charFileOf(mod);
      // ⭐ CONTROL: the fixture must really contain a substring pair and a disjoint pair, or it proves nothing.
      rec("CONTROL: the fixture pairs a note with a longer note containing it",
        before.includes("#note about the character") && /name = "Probe Substring" #note$/m.test(before), "");
      rec("CONTROL: …and an otherwise identical character whose notes are disjoint",
        before.includes("#beta gamma about the character") && before.includes("#alpha"), "");

      const list = await listChars(mod);
      for (const tok of ["PRB_substring", "PRB_disjoint", "PRB_twin"]) {
        const c = list.find((x) => x.token === tok);
        if (c) await saveChar(mod, c);
      }
      const after = charFileOf(mod);
      console.log("     comments in the file: " + commentCount(before) + " -> " + commentCount(after));
      rec("RUN: ⭐ the note that is a SUBSTRING of another survives", /#note(\s|$)/m.test(after) && after.includes("#note about the character"), after);
      rec("CONTROL: the disjoint note survives too", after.includes("#alpha"), after);
      rec("CONTROL: two identical notes both survive", (after.match(/#same note/g) || []).length === 2, (after.match(/#same note/g) || []).length);
      rec("RUN: ⭐ not one comment was lost", commentCount(after) === commentCount(before), { before: commentCount(before), after: commentCount(after) });
    }

    // ---- the same substring test, on the WHOLE-LINE carry-forward ----
    // reattachTrailingComments was one of two places asking "already carried?" with a substring match.
    // The other is the top-level comment carry-forward, and it is reachable whenever a note sits INSIDE a
    // role block (so it is already in the rebuilt text) and a shorter note sits at the character's top
    // level. A commented-out block left as documentation is exactly that shape.
    console.log("\n-- a whole-line note that is a substring of one inside a role block --");
    {
      const text = [
        "characters = {",
        "\tPRB_wl_sub = {",
        '\t\tname = "Probe WL Sub"',
        "\t\t#todo",
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = {",
        "\t\t\t#todo later",
        "\t\t\tideology = despotism",
        '\t\t\texpire = "1965.1.1.1"',
        "\t\t\ttraits = { }",
        "\t\t}",
        "\t}",
        "\tPRB_wl_dis = {",
        '\t\tname = "Probe WL Dis"',
        "\t\t#quokka",
        "\t\tportraits = { civilian = { large = GFX_portrait_probe } }",
        "\t\tcountry_leader = {",
        "\t\t\t#zebra later",
        "\t\t\tideology = despotism",
        '\t\t\texpire = "1965.1.1.1"',
        "\t\t\ttraits = { }",
        "\t\t}",
        "\t}",
        "}",
        "",
      ].join("\n");
      const mod = mkMod(text, []);
      const before = charFileOf(mod);
      const exact = (t, s) => t.split(/\r?\n/).filter((l) => l.trim() === s).length;
      // ⭐ CONTROL: one pair must really be substring-related and the other really not.
      rec("CONTROL: the fixture pairs `#todo` with `#todo later`, and `#quokka` with a disjoint note",
        "#todo later".includes("#todo") && !"#zebra later".includes("#quokka"), "");

      const list = await listChars(mod);
      for (const c of list) await saveChar(mod, c);
      const after = charFileOf(mod);
      console.log("     comments in the file: " + commentCount(before) + " -> " + commentCount(after));
      rec("RUN: ⭐ the whole-line note survives being a substring of one inside a role block",
        exact(after, "#todo") === 1, { before: exact(before, "#todo"), after: exact(after, "#todo") });
      rec("RUN: the longer note inside the role block is still there", exact(after, "#todo later") === 1, exact(after, "#todo later"));
      rec("CONTROL: the disjoint pair survives too",
        exact(after, "#quokka") === 1 && exact(after, "#zebra later") === 1,
        { quokka: exact(after, "#quokka"), zebra: exact(after, "#zebra later") });
      rec("RUN: ⭐ not one comment was lost", commentCount(after) === commentCount(before),
        { before: commentCount(before), after: commentCount(after) });
    }

    // ================================================================ the real files
    console.log("\n-- the corpora this came from --");
    if (!fs.existsSync(VAN_ARG)) {
      rec("vanilla is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(VAN_ARG, "utf8");
      rec("CONTROL: vanilla really scripts an accented literal name",
        /name\s*=\s*"Manuel María de Iriondo"/.test(src), "");
      const mod = mkMod(src, []);
      const list = await listChars(mod);
      const c = list.find((x) => x.token === "ARG_manuel_maria_de_iriondo");
      rec("the real character is listed", !!c, "");
      rec("RUN: ⭐ its accents survive the read", !!c && c.name === "Manuel María de Iriondo", c && c.name);
      if (c) {
        const r = await saveChar(mod, c);
        rec("the real save is accepted", r.status === 200 && r.body && (r.body.ok || !r.body.error), r);
        const shown = displayedName(mod, "ARG_manuel_maria_de_iriondo");
        rec("RUN: ⭐ and they survive the save", shown === "Manuel María de Iriondo", shown);
      }
    }

    if (!fs.existsSync(R56_SAU)) {
      rec("Road to 56 is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(R56_SAU, "utf8");
      const mod = mkMod(src, []);
      const before = charFileOf(mod);
      rec("CONTROL: SAU.txt really carries bare `#` markers beside a longer note",
        /name\s*=\s*"[^"]*"\s*#\s*$/m.test(before) && /#Saudi/.test(before), "");
      const list = await listChars(mod);
      let saved = 0;
      for (const c of list) {
        if (/\binstance\s*=\s*\{/.test(before)) {
          // only skip the characters that actually have variants
          const blk = new RegExp("(?:^|\\n)[ \\t]*" + c.token + "[ \\t]*=[ \\t]*\\{[\\s\\S]*?\\n[ \\t]*\\}").exec(before);
          if (blk && /\binstance\s*=\s*\{/.test(blk[0])) continue;
        }
        const r = await saveChar(mod, c);
        if (r.status === 200 && r.body && !r.body.error) saved++;
      }
      const after = charFileOf(mod);
      console.log("     " + saved + " characters saved · comments " + commentCount(before) + " -> " + commentCount(after));
      rec("the file really was exercised", saved >= 10, saved);
      rec("RUN: ⭐ not one comment was lost across the whole file",
        commentCount(after) === commentCount(before), { before: commentCount(before), after: commentCount(after) });
    }

    rec("the fixture was measured whatever is installed", checks >= 16, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== character save keeps its name and notes: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
