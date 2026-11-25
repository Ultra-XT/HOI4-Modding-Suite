// Two character findings recorded 2026-08-02, still real on re-verification.
//
// #duplicate-role-key — A ROLE BLOCK MAY DECLARE THE SAME KEY TWICE, AND HOI4 IS LAST-WINS.
// 19 vanilla role blocks do it; 10 duplicate a key Nova models. Nova's readers took the FIRST occurrence
// while the merge dropped every occurrence and re-emitted the single value it had read — so a plain
// open-and-Save silently CHANGED the value. Measured on vanilla: AST_cederic_hicks advisor cost 100 → 150,
// USA_charles_lindbergh 200 → 100, and GER_oskar_von_nidermayer's empty `traits = { }` followed by a real
// traits block collapsed to NO traits at all, destroying two. Reading last makes the collapse a faithful
// normalisation of what the game already did.
//
// #instance-name-quotes — A DLC VARIANT'S QUOTED NAME IS A LITERAL, AND THE QUOTES ARE LOAD-BEARING.
// rewriteCharacterInstance stripped them and re-emitted a bareword, so `name = "Rafael Franco"` became
// `name = Rafael Franco` — HOI4 then reads name=Rafael plus a stray `Franco`. 9 vanilla instance blocks
// carry a quoted name and 6 contain a space (PAR_rafael_franco, PAR_higinio_morinigo, SLO_jozef_turanec,
// two instances each), so a no-edit save of any of them corrupted the character.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chardup-"));
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

const MOD = path.join(ROOT, "chardupmod");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CharDupMod"\nsupported_version="1.19.*"\n', "utf8");

const FILE = "dup_probe.txt";
const ABS = path.join(MOD, "common", "characters", FILE);
// Shapes taken from vanilla: a duplicated cost (AST_cederic_hicks), an empty-then-real traits pair
// (GER_oskar_von_nidermayer), and a quoted instance name with a space (PAR_rafael_franco).
fs.writeFileSync(ABS, [
  "characters = {",
  "\tdup_advisor = {",
  '\t\tname = "Dup Advisor"',
  "\t\tadvisor = {",
  "\t\t\tslot = political_advisor",
  "\t\t\tidea_token = dup_advisor",
  "\t\t\tcost = 100",
  "\t\t\tcost = 200",
  "\t\t}",
  "\t}",
  "\tdup_general = {",
  '\t\tname = "Dup General"',
  "\t\tcorps_commander = {",
  "\t\t\ttraits = { }",
  "\t\t\ttraits = { politically_connected infantry_officer }",
  "\t\t\tskill = 3",
  "\t\t\tattack_skill = 2",
  "\t\t\tdefense_skill = 2",
  "\t\t\tplanning_skill = 2",
  "\t\t\tlogistics_skill = 2",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const read = () => { try { return fs.readFileSync(ABS, "utf8"); } catch (_) { return ""; } };

const PORT = 42503;
const app = createApp();
const server = app.listen(PORT, async () => {
  const list = async () => (await fetch(`http://127.0.0.1:${PORT}/api/characters/list?modPath=${encodeURIComponent(MOD)}`)).json();
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[reader] the value read back is the one the GAME uses — the last");
    const l = await list();
    const chars = (l.files || []).flatMap((f) => f.characters || []);
    const adv = chars.find((c) => c.token === "dup_advisor");
    const gen = chars.find((c) => c.token === "dup_general");
    rec("both characters are listed", !!adv && !!gen, chars.map((c) => c.token));
    // HOI4 is last-wins, so 200 is the live value. Reading 100 is what made the save change it.
    rec("the duplicated cost reads as the LAST one (200)", !!adv && String(adv.advisorCost) === "200", adv && adv.advisorCost);
    rec("the duplicated traits read as the LAST block, not the empty one",
      !!gen && /politically_connected/.test(String(gen.generalTraits || "")), gen && gen.generalTraits);

    console.log("\n[the damage] a plain open-and-Save must not change the value");
    let r = await post("/api/characters/save", Object.assign({}, adv, {
      modPath: MOD, file: FILE, token: "dup_advisor",
    }));
    rec("the advisor re-saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const afterAdv = read();
    rec("the surviving cost is 200, the value the game used", /cost\s*=\s*200/.test(afterAdv), afterAdv.slice(0, 500));
    rec("…and it is not the shadowed 100", !/cost\s*=\s*100\b/.test(afterAdv), afterAdv.slice(0, 500));

    r = await post("/api/characters/save", Object.assign({}, gen, {
      modPath: MOD, file: FILE, token: "dup_general",
    }));
    rec("the general re-saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const afterGen = read();
    // The original bug destroyed BOTH copies and left the character with no traits at all.
    rec("the traits survived the save", /politically_connected/.test(afterGen) && /infantry_officer/.test(afterGen),
      afterGen.slice(0, 700));
    // A NO-EDIT save leaves the duplicate pair alone entirely — the preserve-merge decides nothing changed
    // and writes the role block back verbatim. That is correct, and it is why the damage only appears once
    // the block is actually rewritten. So drive the case that rewrites it: change one unrelated field.
    r = await post("/api/characters/save", Object.assign({}, gen, {
      modPath: MOD, file: FILE, token: "dup_general", genSkill: 4, generalSkill: 4, skill: 4,
    }));
    rec("an EDIT to the general saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const edited = read();
    // THE DAMAGE: the merge drops every occurrence of a modelled key and re-emits the ONE value it read.
    // Reading the first gave `traits = { }`, so both copies vanished and two traits were destroyed.
    rec("the rewritten block still has the real traits",
      /politically_connected/.test(edited) && /infantry_officer/.test(edited), edited.slice(0, 800));
    rec("…and collapsed to exactly one traits key",
      (edited.match(/traits\s*=\s*\{/g) || []).length === 1, (edited.match(/traits\s*=\s*\{/g) || []).length);
    rec("…and is not the empty one that used to win",
      !/traits\s*=\s*\{\s*\}/.test(edited), edited.slice(0, 800));
    rec("the file is still brace-balanced",
      (afterGen.match(/\{/g) || []).length === (afterGen.match(/\}/g) || []).length,
      { open: (afterGen.match(/\{/g) || []).length, close: (afterGen.match(/\}/g) || []).length });

    console.log("\n[control] a character with NO duplicate keys round-trips untouched");
    // Without this, "read the last one" could be hiding a rewrite of everything.
    fs.writeFileSync(path.join(MOD, "common", "characters", "clean_probe.txt"), [
      "characters = {",
      "\tclean_advisor = {",
      '\t\tname = "Clean Advisor"',
      "\t\tadvisor = {",
      "\t\t\tslot = political_advisor",
      "\t\t\tidea_token = clean_advisor",
      "\t\t\tcost = 150",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const cleanBefore = fs.readFileSync(path.join(MOD, "common", "characters", "clean_probe.txt"), "utf8");
    const l2 = await list();
    const clean = (l2.files || []).flatMap((f) => f.characters || []).find((c) => c.token === "clean_advisor");
    rec("the clean character is listed with its real cost", !!clean && String(clean.advisorCost) === "150", clean && clean.advisorCost);
    r = await post("/api/characters/save", Object.assign({}, clean, { modPath: MOD, file: "clean_probe.txt", token: "clean_advisor" }));
    rec("it re-saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const cleanAfter = fs.readFileSync(path.join(MOD, "common", "characters", "clean_probe.txt"), "utf8");
    rec("…and its cost is unchanged", /cost\s*=\s*150/.test(cleanAfter), cleanAfter);
    void cleanBefore;

    console.log("\n[quoted DLC-variant name] the quotes are load-bearing");
    // PAR_rafael_franco's shape: two instances, each naming itself with a quoted literal containing a space.
    fs.writeFileSync(path.join(MOD, "common", "characters", "inst_probe.txt"), [
      "characters = {",
      "\tinst_char = {",
      "\t\tinstance = {",
      '\t\t\tallowed = { has_dlc = "Trial of Allegiance" }',
      '\t\t\tname = "Rafael Franco"',
      "\t\t\tcountry_leader = {",
      "\t\t\t\tideology = despotism",
      "\t\t\t\texpire = \"1965.1.1.1\"",
      "\t\t\t}",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const instPath = path.join(MOD, "common", "characters", "inst_probe.txt");
    const l3 = await list();
    const inst = (l3.files || []).flatMap((f) => f.characters || []).find((c) => c.token === "inst_char");
    rec("the instance character is listed", !!inst, (l3.files || []).flatMap((f) => (f.characters || []).map((c) => c.token)));
    r = await post("/api/characters/save", Object.assign({}, inst, {
      modPath: MOD, file: "inst_probe.txt", token: "inst_char", instanceIndex: 0,
    }));
    rec("the instance re-saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const instAfter = fs.readFileSync(instPath, "utf8");
    // The bug: `name = "Rafael Franco"` became `name = Rafael Franco`, which HOI4 reads as name=Rafael.
    rec("the quoted literal name kept its quotes", /name\s*=\s*"Rafael Franco"/.test(instAfter), instAfter.slice(0, 600));
    rec("…and did NOT become a bareword", !/name\s*=\s*Rafael\s+Franco/.test(instAfter), instAfter.slice(0, 600));
    rec("the instance file is still brace-balanced",
      (instAfter.match(/\{/g) || []).length === (instAfter.match(/\}/g) || []).length,
      { open: (instAfter.match(/\{/g) || []).length, close: (instAfter.match(/\}/g) || []).length });

    console.log(`\n=== character dup key and quoted name: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
