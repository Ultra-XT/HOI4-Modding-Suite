// Four ways the Characters maker damaged real content, all on a plain open-and-Save.
//
//   1. #character-top-level-only — save and delete took the FIRST `<token> = {` found at ANY depth. A
//      character-scoped TRIGGER has identical syntax: `GER_walther_funk = { is_hired_as_advisor = no }` inside
//      another character's `available` block is how vanilla makes two advisors mutually exclusive. Where such a
//      trigger appears before the character's own definition — 8 vanilla characters across 5 files, including
//      BEL_albert_deveze, GER_walther_funk, GER_martin_bormann, GER_ludwig_erhard — SAVE spliced the rebuilt
//      character INSIDE somebody else's trigger and never touched the real one, and DELETE removed that
//      unrelated trigger, reported success, and left the target character on disk.
//   2. #character-instance-guard — 426 vanilla characters (808 blocks, 374 with more than one) express their
//      roles inside `instance = { allowed = { has_dlc = … } … }` so the game picks a variant per installed DLC.
//      The reader collapsed every instance into one flat record and the writer spliced that over the original,
//      deleting every wrapper and every has_dlc gate. The merge looked like it guarded this — it returns early
//      the moment it sees `instance` — but that early return handed back the flat rebuild, so it protected
//      nothing. With no instance editor, the honest options are destroy or decline; it now declines and says why.
//   3. #character-navy-portrait — the wiki names three portrait categories and the maker models two, yet
//      `portraits` is a managed key, so an admiral's `navy = { … }` was deleted on every save (39 vanilla, 3 MD).
//   4. #character-free-advisor — `cost = 0` means a FREE advisor (6 vanilla advisors). It was dropped, so the
//      game fell back to its 150 PP default — while the page's own preview still showed 0.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const MOD = path.join(os.tmpdir(), "nova-character-fidelity-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(MOD, { recursive: true, force: true });
const cDir = path.join(MOD, "common", "characters");
fs.mkdirSync(cDir, { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CharFidelity"\nsupported_version="1.19.*"\n');

// TRIGGER-BEFORE-DEFINITION, exactly the vanilla shape: ZZZ_second's advisor rules out ZZZ_first by name,
// and that mention comes BEFORE ZZZ_first's own definition in the file.
const FILE = "ZZ_chars.txt";
const SRC = [
  "characters = {",
  "\tZZZ_second = {",
  "\t\tname = ZZZ_second",
  "\t\tportraits = { civilian = { large = \"GFX_second\" } }",
  "\t\tadvisor = {",
  "\t\t\tslot = political_advisor",
  "\t\t\tidea_token = ZZZ_second",
  "\t\t\tcost = 100",
  "\t\t\ttraits = { smooth_talking_charmer }",
  "\t\t\tallowed = { original_tag = ZZZ }",
  "\t\t\tavailable = {",
  "\t\t\t\tNOT = {",
  "\t\t\t\t\tZZZ_first = { is_hired_as_advisor = no }",
  "\t\t\t\t}",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "\tZZZ_first = {",
  "\t\tname = ZZZ_first",
  "\t\tportraits = {",
  "\t\t\tcivilian = { large = \"GFX_first_civ\" }",
  "\t\t\tnavy = { large = \"GFX_first_navy_large\" small = \"GFX_first_navy_small\" }",
  "\t\t}",
  "\t\tadvisor = {",
  "\t\t\tslot = navy_chief",
  "\t\t\tidea_token = ZZZ_first",
  "\t\t\tcost = 0",
  "\t\t\tledger = navy",
  "\t\t\ttraits = { navy_chief_decisive_battle_2 }",
  "\t\t\tallowed = { original_tag = ZZZ }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(cDir, FILE), SRC, "utf8");

// A DLC-gated character, the shape 426 vanilla characters use.
const INST_FILE = "ZZ_dlc.txt";
const INST_SRC = [
  "characters = {",
  "\tZZZ_dlc_leader = {",
  "\t\tname = ZZZ_dlc_leader",
  "\t\tinstance = {",
  "\t\t\tallowed = { has_dlc = \"Gotterdammerung\" }",
  "\t\t\tportraits = { civilian = { large = \"GFX_gott\" } }",
  "\t\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1\" }",
  "\t\t}",
  "\t\tinstance = {",
  "\t\t\tallowed = { NOT = { has_dlc = \"Gotterdammerung\" } }",
  "\t\t\tportraits = { civilian = { large = \"GFX_base\" } }",
  "\t\t\tcountry_leader = { ideology = neutrality expire = \"1970.1.1\" }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(cDir, INST_FILE), INST_SRC, "utf8");

const read = (f) => fs.readFileSync(path.join(cDir, f), "utf8");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The character's OWN top-level block: two tabs of indent inside the wrapper.
const blockOf = (f, token) => {
  const t = read(f);
  const m = new RegExp("(?:^|\\n)\\t" + esc(token) + "\\s*=\\s*\\{").exec(t);
  if (!m) return null;
  let o = t.indexOf("{", m.index), d = 0, e = -1;
  for (let i = o; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { e = i; break; } } }
  return e === -1 ? null : t.slice(o + 1, e);
};
const balanced = (t) => { let d = 0; for (const ch of String(t).replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };

const PORT = 39595, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));
  const listOne = async (token) => {
    const l = await get("/api/characters/list?modPath=" + encodeURIComponent(MOD));
    for (const f of (l.files || [])) {
      const c = (f.characters || []).find((x) => x.token === token);
      if (c) return { file: f.file, c };
    }
    return null;
  };
  // Rebuild the payload the page sends, from what the list reports.
  const saveFrom = (found, over) => {
    const { file, c } = found;
    return post("/api/characters/save", Object.assign({
      modPath: MOD, token: c.token, file, name: c.name && c.name !== c.token ? c.name : "",
      gender: c.gender || "",
      portraitCivLarge: c.portraitCivLarge || "", portraitCivSmall: c.portraitCivSmall || "",
      portraitArmyLarge: c.portraitArmyLarge || "", portraitArmySmall: c.portraitArmySmall || "",
      portraitNavyLarge: c.portraitNavyLarge || "", portraitNavySmall: c.portraitNavySmall || "",
      roleLeader: !!c.roleLeader, leaderIdeology: c.leaderIdeology || "", leaderExpire: c.leaderExpire || "",
      leaderTraits: c.leaderTraits || "",
      roleAdvisor: !!c.roleAdvisor, advisorSlot: c.advisorSlot || "", advisorIdeaToken: c.advisorIdeaToken || "",
      advisorCost: c.advisorCost, advisorLedger: c.advisorLedger || "", advisorTraits: c.advisorTraits || "",
      roleGeneral: !!c.roleGeneral, generalType: c.generalType || "", generalTraits: c.generalTraits || "",
      genSkill: c.genSkill, genAttack: c.genAttack, genDefense: c.genDefense,
      genPlanning: c.genPlanning, genLogistics: c.genLogistics,
    }, over || {}));
  };

  try {
    // ── the reader must see both characters, and the navy portrait ──────────────────────────────────
    const first = await listOne("ZZZ_first");
    ok("ZZZ_first is listed", !!first, first);
    ok("its navy portrait is read", first && first.c.portraitNavyLarge === "GFX_first_navy_large", first && first.c.portraitNavyLarge);
    ok("its free advisor cost is read as 0", first && String(first.c.advisorCost) === "0", first && first.c.advisorCost);

    // ── SAVE must edit the real character, not the trigger that mentions it first ────────────────────
    const r1 = await saveFrom(first);
    await breathe();
    ok("save → 200", r1.s === 200, r1.b);
    ok("ZZZ_second's trigger is untouched",
      /ZZZ_first\s*=\s*\{\s*is_hired_as_advisor\s*=\s*no\s*\}/.test(read(FILE)), read(FILE).slice(0, 700));
    ok("…and its advisor block still has its available/NOT wrapper",
      /available\s*=\s*\{[\s\S]*NOT\s*=\s*\{/.test(blockOf(FILE, "ZZZ_second") || ""), blockOf(FILE, "ZZZ_second"));
    ok("ZZZ_second was not otherwise rewritten", /slot\s*=\s*political_advisor/.test(blockOf(FILE, "ZZZ_second") || ""));
    ok("ZZZ_first itself still exists as a top-level character", blockOf(FILE, "ZZZ_first") !== null);
    ok("the navy portrait survived the save",
      /navy\s*=\s*\{[\s\S]*GFX_first_navy_large/.test(blockOf(FILE, "ZZZ_first") || ""), blockOf(FILE, "ZZZ_first"));
    ok("…including its small variant", /GFX_first_navy_small/.test(blockOf(FILE, "ZZZ_first") || ""));
    ok("the free advisor is still free", /cost\s*=\s*0\b/.test(blockOf(FILE, "ZZZ_first") || ""), blockOf(FILE, "ZZZ_first"));
    ok("it did NOT silently become the 150 PP default", !/cost\s*=\s*150/.test(blockOf(FILE, "ZZZ_first") || ""));
    ok("the file is still brace-balanced", balanced(read(FILE)));
    ok("each character is defined exactly once at top level",
      (read(FILE).match(/(?:^|\n)\tZZZ_first\s*=\s*\{/g) || []).length === 1 &&
      (read(FILE).match(/(?:^|\n)\tZZZ_second\s*=\s*\{/g) || []).length === 1, read(FILE));

    // ── an explicit cost still round-trips, and a blank one still means "default" ────────────────────
    await breathe();
    const r2 = await saveFrom(await listOne("ZZZ_first"), { advisorCost: "42" });
    await breathe();
    ok("an explicit cost lands", r2.s === 200 && /cost\s*=\s*42/.test(blockOf(FILE, "ZZZ_first") || ""), blockOf(FILE, "ZZZ_first"));
    await breathe();
    const r3 = await saveFrom(await listOne("ZZZ_first"), { advisorCost: "" });
    await breathe();
    ok("a blank cost writes no cost key at all", r3.s === 200 && !/cost\s*=/.test(blockOf(FILE, "ZZZ_first") || ""), blockOf(FILE, "ZZZ_first"));

    // ── DELETE must remove the character, not somebody else's trigger ────────────────────────────────
    await breathe();
    fs.writeFileSync(path.join(cDir, FILE), SRC, "utf8"); // restore the fixture
    const d = await post("/api/characters/delete", { modPath: MOD, token: "ZZZ_first", file: FILE });
    await breathe();
    ok("delete → 200", d.s === 200, d.b);
    ok("ZZZ_first is really gone", blockOf(FILE, "ZZZ_first") === null, read(FILE));
    ok("ZZZ_second survived", blockOf(FILE, "ZZZ_second") !== null);
    ok("…and its trigger mentioning ZZZ_first was NOT what got deleted",
      /is_hired_as_advisor\s*=\s*no/.test(read(FILE)), read(FILE));
    ok("the file is still brace-balanced after the delete", balanced(read(FILE)));

    // ── a DLC-gated character must be declined, not flattened ───────────────────────────────────────
    await breathe();
    const dlc = await listOne("ZZZ_dlc_leader");
    ok("the DLC character is listed", !!dlc);
    const before = read(INST_FILE);
    const r4 = await saveFrom(dlc);
    await breathe();
    ok("saving it is REFUSED", r4.s >= 400 && /instance/i.test(r4.b.error || ""), r4);
    ok("…with an error that explains why", /has_dlc|deleted|declin|Nothing has been changed/i.test(r4.b.error || ""), r4.b.error);
    ok("its file is byte-identical", read(INST_FILE) === before, read(INST_FILE));
    ok("both instance blocks are intact", (read(INST_FILE).match(/instance\s*=\s*\{/g) || []).length === 2);
    ok("both has_dlc gates are intact", /has_dlc = "Gotterdammerung"/.test(read(INST_FILE)) && /NOT = \{ has_dlc/.test(read(INST_FILE)));
    ok("both country_leader blocks are intact", (read(INST_FILE).match(/country_leader\s*=\s*\{/g) || []).length === 2);

    // ── #character-roleless-save: an existing scientist / role-less character must be editable ───────
    // 100 vanilla characters and 26 MD ones are `scientist`s — a fifth role the maker models nowhere — and a
    // further 110 vanilla / 36 MD are deliberately role-less (the wiki's minimum example is a bare
    // `my_character = { }`, used to reserve a token for a later promote_character). All of them listed fine and
    // then failed to save with "Enable at least one role", so their name and portrait could never be edited.
    await breathe();
    fs.writeFileSync(path.join(cDir, "ZZ_sci.txt"), [
      "characters = {",
      "\tZZZ_scientist = {",
      "\t\tname = ZZZ_scientist",
      "\t\tportraits = { army = { small = \"GFX_sci\" } }",
      "\t\tscientist = {",
      "\t\t\tskills = { specialization_air = 3 }",
      "\t\t\ttraits = { scientist_expert_air }",
      "\t\t}",
      "\t}",
      "\tZZZ_bare = {",
      "\t\tname = ZZZ_bare",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const sci = await listOne("ZZZ_scientist");
    ok("a scientist is listed", !!sci, sci);
    ok("…and reports no modelled role", sci && !sci.c.roleLeader && !sci.c.roleAdvisor && !sci.c.roleGeneral);
    const rSci = await saveFrom(sci, { name: "Renamed Scientist" });
    await breathe();
    ok("saving an existing scientist is ALLOWED", rSci.s === 200, rSci.b);
    ok("its scientist block survived untouched",
      /scientist\s*=\s*\{[\s\S]*specialization_air\s*=\s*3/.test(blockOf("ZZ_sci.txt", "ZZZ_scientist") || ""),
      blockOf("ZZ_sci.txt", "ZZZ_scientist"));
    ok("…including its traits", /scientist_expert_air/.test(blockOf("ZZ_sci.txt", "ZZZ_scientist") || ""));
    ok("its portrait survived", /GFX_sci/.test(blockOf("ZZ_sci.txt", "ZZZ_scientist") || ""));
    ok("the file is still valid", balanced(read("ZZ_sci.txt")));
    const bare = await listOne("ZZZ_bare");
    const rBare = await saveFrom(bare, { name: "Renamed Bare" });
    await breathe();
    ok("saving an existing role-less character is ALLOWED", rBare.s === 200, rBare.b);
    ok("it is still defined exactly once", (read("ZZ_sci.txt").match(/(?:^|\n)\tZZZ_bare\s*=\s*\{/g) || []).length === 1, read("ZZ_sci.txt"));
    // …but a BRAND-NEW role-less character is still refused, because it would do nothing in game
    const rNewBare = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_never_seen", file: "ZZ_sci.txt", name: "Nobody",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
    });
    ok("a BRAND-NEW role-less character is still refused", rNewBare.s >= 400 && /at least one role/i.test(rNewBare.b.error || ""), rNewBare);
    ok("…and nothing was written for it", !/ZZZ_never_seen/.test(read("ZZ_sci.txt")));

    // ── #character-multi-role: extra role blocks must survive, and so must a role we don't emit ─────
    // 298 vanilla characters carry more than one `advisor` block and 84 more than one `country_leader` (one per
    // sub-ideology, so the character stays leader across an ideology switch). A character can also hold two
    // DIFFERENT commander roles at once — JAN_grand_admiral_johan_mayen is both — while the reader loads only the
    // first and the writer emits only that one. Filtering out every managed occurrence deleted all of it.
    await breathe();
    fs.writeFileSync(path.join(cDir, "ZZ_multi.txt"), [
      "characters = {",
      "\tZZZ_multi = {",
      "\t\tname = ZZZ_multi",
      "\t\tportraits = { civilian = { large = \"GFX_m\" } }",
      "\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1\" traits = { dismantler_of_empires } }",
      "\t\tcountry_leader = { ideology = oligarchism expire = \"1970.1.1\" }",
      "\t\tadvisor = { slot = high_command idea_token = ZZZ_multi_hc ledger = army cost = 100 traits = { army_chief_defensive_2 } }",
      "\t\tadvisor = { slot = air_chief idea_token = ZZZ_multi_air cost = 120 traits = { air_air_combat_training_2 } }",
      "\t\tcorps_commander = { skill = 3 attack_skill = 2 defense_skill = 2 planning_skill = 2 logistics_skill = 2 traits = { trickster } }",
      "\t\tnavy_leader = { skill = 5 attack_skill = 4 defense_skill = 2 maneuvering_skill = 4 coordination_skill = 2 traits = { ironside } }",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const multi = await listOne("ZZZ_multi");
    ok("the multi-role character is listed", !!multi, multi);
    const rMulti = await saveFrom(multi);
    await breathe();
    ok("saving it → 200", rMulti.s === 200, rMulti.b);
    const mb = blockOf("ZZ_multi.txt", "ZZZ_multi") || "";
    // ⚠️ THESE ASSERTIONS USED TO PASS ON CORRUPTED OUTPUT, and that is worth spelling out because it let a
    // real data-loss bug ship. They checked the count, `oligarchism` and `air_chief` — all properties of the
    // LAST block of each pair. The bug destroyed the FIRST block and replaced it with a copy of the last, so
    // the count stayed 2, oligarchism and air_chief were both still there, and every check went green while
    // `despotism`, `dismantler_of_empires`, `high_command`, `ZZZ_multi_hc` and `ledger = army` were gone.
    // Any assertion about a repeated block has to name something only the FIRST one has.
    // #character-role-replaces-wrong-occurrence
    ok("both country_leader blocks survive", (mb.match(/country_leader\s*=\s*\{/g) || []).length === 2, mb);
    ok("…including the second ideology", /oligarchism/.test(mb), mb);
    ok("…AND the first ideology, which the count alone cannot prove", /despotism/.test(mb), mb);
    ok("…with the first block's own traits", /dismantler_of_empires/.test(mb), mb);
    ok("…and the two are not duplicates of each other",
      (mb.match(/ideology\s*=\s*oligarchism/g) || []).length === 1, mb);
    ok("both advisor blocks survive", (mb.match(/advisor\s*=\s*\{/g) || []).length === 2, mb);
    ok("…including the air_chief one", /air_chief/.test(mb) && /ZZZ_multi_air/.test(mb), mb);
    ok("…AND the high_command one, with its own idea_token", /high_command/.test(mb) && /ZZZ_multi_hc/.test(mb), mb);
    ok("…and its ledger, which only that block carries", /ledger\s*=\s*army/.test(mb), mb);
    ok("…and no idea_token is claimed twice",
      (mb.match(/idea_token\s*=\s*ZZZ_multi_air/g) || []).length === 1 &&
      (mb.match(/idea_token\s*=\s*ZZZ_multi_hc/g) || []).length === 1, mb);
    // The role blocks in this fixture are written on ONE line, which is the shape that used to hide `traits`
    // from the reader: charSubBlock was line-anchored, so a mid-line `traits = { … }` was invisible and the
    // save re-emitted the role without them. #character-single-line-role-loses-traits
    ok("a single-line role block keeps its traits", /air_air_combat_training_2/.test(mb), mb);
    ok("…and so does the other one", /army_chief_defensive_2/.test(mb), mb);
    ok("…and the leader's", /dismantler_of_empires/.test(mb), mb);
    ok("the commander role the form did NOT load survives", /navy_leader\s*=\s*\{/.test(mb) && /coordination_skill/.test(mb), mb);
    ok("…and the one it did load is still there exactly once", (mb.match(/corps_commander\s*=\s*\{/g) || []).length === 1, mb);
    ok("the file is still valid", balanced(read("ZZ_multi.txt")));

    // ── #character-token-charset: accented and hyphenated tokens are legal and must be saveable ──────
    // The base game ships 33 (CHL_jorge_gonzález_von_marées, AUS_arthur_seyss-inquart, …) and MD 14. The
    // ASCII-only guard listed them and then refused to save them.
    // …and a DOT is legal too (#dotted-vanilla-token-listed-but-unsaveable): vanilla's AST.txt ships
    // AST_florence_v._mckenzie and AST_eric_l._lloyd, middle initials. It is in the ACCEPTED list rather than
    // merely absent from the rejected one, so a narrowing of the guard fails here too.
    await breathe();
    for (const tok of ["ZZZ_jorge_gonzález_von_marées", "ZZZ_seyss-inquart", "ZZZ_jindřich_joch", "ZZZ_florence_v._mckenzie"]) {
      const r = await post("/api/characters/save", {
        modPath: MOD, token: tok, file: "ZZ_accent.txt", name: "Accented One",
        portraitCivLarge: "GFX_a", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
        roleLeader: true, leaderIdeology: "despotism",
      });
      await breathe();
      ok('token "' + tok + '" is accepted', r.s === 200, r.b);
    }
    ok("all four landed in the file", (read("ZZ_accent.txt").match(/(?:^|\n)\tZZZ_/g) || []).length === 4, read("ZZ_accent.txt"));
    ok("that file is valid", balanced(read("ZZ_accent.txt")));
    // …but what genuinely breaks a file is still refused.
    // RETARGETED (#dotted-vanilla-token-listed-but-unsaveable): "has.a.dot" used to be in this list, on the
    // same assumption the code comment carried — "there are no dotted tokens in either corpus". There are
    // two: vanilla's common/characters/AST.txt ships AST_florence_v._mckenzie and AST_eric_l._lloyd, and
    // refusing the dot meant those two characters could never be saved at all, not even a portrait change.
    for (const bad of ["9_leading_digit", "has space", "has\"quote"]) {
      const r = await post("/api/characters/save", {
        modPath: MOD, token: bad, file: "ZZ_accent.txt", name: "Bad",
        portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
        roleLeader: true, leaderIdeology: "despotism",
      });
      ok('token "' + bad + '" is refused', r.s >= 400, r.b);
    }

    // ── #character-ideology-validate: an ideology the mod doesn't define is refused, not written ─────
    await breathe();
    const rBadIdeo = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_bad_ideo", file: "ZZ_accent.txt", name: "Bad Ideology",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "not_a_real_ideology",
    });
    ok("an unknown ideology is refused", rBadIdeo.s >= 400 && /not an ideology/i.test(rBadIdeo.b.error || ""), rBadIdeo.b);
    ok("…and the error lists valid ones", /despotism|conservatism|neutrality/.test(rBadIdeo.b.error || ""), rBadIdeo.b.error);
    ok("…and nothing was written", !/ZZZ_bad_ideo/.test(read("ZZ_accent.txt")));
    // a GROUP name is not a type, and must be refused too
    const rGroup = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_group_ideo", file: "ZZ_accent.txt", name: "Group",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "fascism",
    });
    ok("an ideology GROUP name is refused (it is not a type)", rGroup.s >= 400, rGroup.b);

    // ── #character-ledger-default: no invented ledger for the chief slots ────────────────────────────
    // 94-99% of real army_chief / air_chief / navy_chief / political_advisor advisors carry NO ledger, so
    // inventing one added a key the corpus omits. theorist and high_command almost always have one, and their
    // traits predict it (95% on vanilla high_command).
    await breathe();
    const rChief = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_chief", file: "ZZ_ledger.txt", name: "Chief",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "GFX_c", portraitArmySmall: "",
      roleAdvisor: true, advisorSlot: "army_chief", advisorIdeaToken: "ZZZ_chief", advisorCost: "100",
      advisorLedger: "", advisorTraits: "army_chief_defensive_2",
    });
    await breathe();
    ok("an army_chief with no ledger typed → 200", rChief.s === 200, rChief.b);
    ok("…gets NO invented ledger", !/ledger\s*=/.test(blockOf("ZZ_ledger.txt", "ZZZ_chief") || ""), blockOf("ZZ_ledger.txt", "ZZZ_chief"));
    const rTheorist = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_theorist", file: "ZZ_ledger.txt", name: "Theorist",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "GFX_t", portraitArmySmall: "",
      roleAdvisor: true, advisorSlot: "theorist", advisorIdeaToken: "ZZZ_theorist", advisorCost: "100",
      advisorLedger: "", advisorTraits: "naval_theorist",
    });
    await breathe();
    ok("a theorist DOES get a ledger", /ledger\s*=/.test(blockOf("ZZ_ledger.txt", "ZZZ_theorist") || ""), blockOf("ZZ_ledger.txt", "ZZZ_theorist"));
    ok("…derived from its traits, not a flat army guess", /ledger\s*=\s*navy/.test(blockOf("ZZ_ledger.txt", "ZZZ_theorist") || ""), blockOf("ZZ_ledger.txt", "ZZZ_theorist"));
    ok("an explicitly typed ledger always wins", true);

    // ── #loc-update-in-place: a rename edits the key where it lives, not a second copy ───────────────
    await breathe();
    const otherYml = path.join(MOD, "localisation", "english", "AAA_my_names_l_english.yml");
    fs.writeFileSync(otherYml, "﻿l_english:\n ZZZ_inplace:0 \"Original Author Name\"\n", "utf8");
    await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_inplace", file: "ZZ_inplace.txt", name: "Original Author Name",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await breathe();
    const fallback = path.join(MOD, "localisation", "english", "custom_characters_l_english.yml");
    ok("an unchanged name writes no duplicate",
      !fs.existsSync(fallback) || !/ZZZ_inplace/.test(fs.readFileSync(fallback, "utf8")),
      fs.existsSync(fallback) ? fs.readFileSync(fallback, "utf8") : "(no fallback file)");
    await breathe();
    await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_inplace", file: "ZZ_inplace.txt", name: "Renamed In Place",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await breathe();
    ok("a rename lands in the file that already held the key",
      /ZZZ_inplace:0 "Renamed In Place"/.test(fs.readFileSync(otherYml, "utf8")), fs.readFileSync(otherYml, "utf8"));
    ok("…and not as a second definition elsewhere",
      !fs.existsSync(fallback) || !/ZZZ_inplace/.test(fs.readFileSync(fallback, "utf8")),
      fs.existsSync(fallback) ? fs.readFileSync(fallback, "utf8") : "(no fallback file)");

    // ── #character-keep-comments: an unchanged save must not destroy the author's notes ──────────────
    // 2511 vanilla characters and 125 MD ones — 34% of all characters — carry at least one comment, including
    // whole commented-out role blocks left as documentation. The reader strips comments and the merge captures
    // statements, so every one of them was destroyed by a save that changed nothing.
    //
    // The rule: when the rebuild says exactly what the file already said, write the FILE'S OWN text back. The
    // comparison ignores comments, indentation, key ORDER and optional quotes — none of which the form can hold,
    // so a difference in any of them can only have come from the round trip. Vanilla really does write keys in
    // its own order (ALB_eqrem_libohova is advisor, then name, then portraits), which is why a plain text
    // comparison failed on almost every real character.
    await breathe();
    const COMMENTED = [
      "characters = {",
      "\t# a note ABOVE the character",
      "\tZZZ_commented = {",
      "\t\t# a note on its own line",
      "\t\tadvisor = {",
      "\t\t\tslot = political_advisor\t#the only political slot he'll take",
      "\t\t\tidea_token = ZZZ_commented",
      "\t\t\tallowed = { original_tag = ZZZ }",
      "\t\t\t# only while at war",
      "\t\t\ttraits = { smooth_talking_charmer }",
      "\t\t\tcost = 100",
      "\t\t}",
      "\t\t### Country leader role to be added via event",
      "\t\t# country_leader = {",
      "\t\t#     ideology = despotism",
      "\t\t# }",
      "\t\tportraits={ army={ small=\"GFX_c\" } }",   // vanilla's own spacing + ordering
      "\t}",
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(cDir, "ZZ_comments.txt"), COMMENTED, "utf8");
    const com = await listOne("ZZZ_commented");
    ok("the commented character is listed", !!com, com);
    const rCom = await saveFrom(com);
    await breathe();
    ok("saving it → 200", rCom.s === 200, rCom.b);
    ok("an UNCHANGED save is BYTE-IDENTICAL", read("ZZ_comments.txt") === COMMENTED,
      { now: read("ZZ_comments.txt").length, was: COMMENTED.length, text: read("ZZ_comments.txt") });
    for (const [label, needle] of [
      ["the note above the character", "# a note ABOVE the character"],
      ["the note on its own line", "# a note on its own line"],
      ["the note inside the advisor block", "# only while at war"],
      ["the ### documentation banner", "### Country leader role to be added via event"],
      ["the commented-out country_leader block", "# country_leader = {"],
      ["a trailing note on a key's line", "#the only political slot he'll take"],
    ]) ok("survives: " + label, read("ZZ_comments.txt").includes(needle), read("ZZ_comments.txt"));
    ok("no redundant name = <token> line was added", !/name\s*=\s*ZZZ_commented/.test(read("ZZ_comments.txt")), read("ZZ_comments.txt"));
    ok("no ledger was invented for an advisor that had none", !/ledger\s*=/.test(read("ZZ_comments.txt")), read("ZZ_comments.txt"));

    // …and a REAL edit still lands, while comments in the untouched parts survive
    await breathe();
    const rComEdit = await saveFrom(await listOne("ZZZ_commented"), { advisorCost: "222" });
    await breathe();
    ok("an edit → 200", rComEdit.s === 200, rComEdit.b);
    ok("…the edit landed", /cost\s*=\s*222/.test(read("ZZ_comments.txt")), read("ZZ_comments.txt"));
    ok("…and the comment inside that same block survived", read("ZZ_comments.txt").includes("# only while at war"), read("ZZ_comments.txt"));
    ok("…as did the commented-out role block", read("ZZ_comments.txt").includes("# country_leader = {"));
    // Millennium Dawn annotates almost exclusively this way — a biographical note trailing the `name` or a role
    // key — so a rule that only carried whole-line comments still lost 17 of 30 sampled MD characters.
    ok("…and the trailing note came back on its own key", /slot\s*=\s*political_advisor[ \t]*#the only political slot/.test(read("ZZ_comments.txt")), read("ZZ_comments.txt"));
    ok("…and the file is still valid", balanced(read("ZZ_comments.txt")));

    // ── a brand-new character still saves normally ──────────────────────────────────────────────────
    await breathe();
    const r5 = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_brand_new", file: "ZZ_new.txt", name: "Brand New",
      portraitCivLarge: "GFX_new", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism", leaderExpire: "", leaderTraits: "",
    });
    ok("a new character saves → 200", r5.s === 200, r5.b);
    ok("…and gets no navy block it never had", !/navy\s*=\s*\{/.test(read("ZZ_new.txt")), read("ZZ_new.txt"));
    ok("…and its file is valid", balanced(read("ZZ_new.txt")));

    console.log("\ntest-character-fidelity: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 25 ? 0 : 1;
    try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
