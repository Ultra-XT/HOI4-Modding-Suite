// #character-instance-editor — a DLC-gated character can be edited one variant at a time.
//
// 424 base-game characters put their whole body inside `instance = { … }` blocks so the game picks a variant
// per installed DLC; 365 of them are an exactly-two "with / without one DLC" pair, and NOT ONE mixes instances
// with role keys of its own. An instance is therefore a complete alternative character body.
//
// The reader used to collapse every instance into one flat record (first non-empty value wins) and the writer
// spliced that flat rebuild over the whole character — deleting every instance wrapper, every has_dlc gate and
// all but one of the role blocks. That was caught in time and the save was made to DECLINE instead, which was
// safe but left 424 characters uneditable. Now each instance is offered as a pickable variant and only the
// chosen one is rewritten.
//
// Pinned here: the variants are read out separately and labelled, editing one leaves its siblings and their
// gates byte-identical, an unchanged save is byte-identical, a variant's OWN name key survives (that is the
// whole point of a DLC variant), and a save that names no variant is still refused.
//
// Also pinned: a token containing a non-ASCII letter. The statement walker's identifier class was ASCII-only,
// so `CHL_escudero_oscar_otárola` was read as the key `CHL_escudero_oscar_ot`, the save could not find the
// block it was meant to replace, and it APPENDED a second copy of the character to the file. The base game
// ships 25 such tokens and Millennium Dawn 7.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-char-instances-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(ROOT, { recursive: true, force: true });
const MOD = path.join(ROOT, "mod");
const cDir = path.join(MOD, "common", "characters");
fs.mkdirSync(cDir, { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Instances"\nsupported_version="1.19.*"\n');

// Shaped exactly like the base game's AFG_mohammed_zahir_shah (compact `key={` style included) plus a variant
// that names itself with its own loc key, the way HUN_gyula_gombos_de_jakfa does.
const ORIGINAL = [
  "characters={",
  "",
  "\tZZZ_gated={",
  "\t\tinstance = {",
  '\t\t\tallowed = { NOT = { has_dlc = "Graveyard of Empires" } }',
  "\t\t\tname = ZZZ_gated",
  "\t\t\tportraits={",
  "\t\t\t\tcivilian={",
  "\t\t\t\t\tlarge=GFX_portrait_zzz",
  "\t\t\t\t}",
  "\t\t\t}",
  "\t\t\tcountry_leader={",
  "\t\t\t\tideology=despotism",
  '\t\t\t\texpire="1965.1.1.1"',
  "\t\t\t\tid=-1",
  "\t\t\t}",
  "\t\t}",
  "\t\tinstance = {",
  '\t\t\tallowed = { has_dlc = "Graveyard of Empires" }',
  "\t\t\tname = ZZZ_gated_dlc_name",
  "\t\t\tportraits={",
  "\t\t\t\tcivilian={",
  "\t\t\t\t\tlarge=GFX_portrait_zzz",
  "\t\t\t\t}",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "\tZZZ_plain={",
  "\t\tname = ZZZ_plain",
  "\t\tcountry_leader={",
  "\t\t\tideology=despotism",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(cDir, "ZZ_gated.txt"), ORIGINAL, "utf8");

// A non-ASCII token, in its own file so a failure here cannot mask the instance checks.
const ACCENTED = [
  "characters={",
  "\tCHL_escudero_oscar_otárola={",
  "\t\tname = CHL_escudero_oscar_otárola",
  "\t\tadvisor={",
  "\t\t\tslot = high_command",
  "\t\t\tidea_token = CHL_escudero_oscar_otárola",
  "\t\t\tledger = army",
  "\t\t\tcost = 100",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(cDir, "ZZ_accent.txt"), ACCENTED, "utf8");

const read = (f) => fs.readFileSync(path.join(cDir, f), "utf8");
const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Independent of the server's own parser on purpose.
const instancesOf = (text, token) => {
  const m = new RegExp("(?:^|\\n)\\s*" + esc(token) + "\\s*=\\s*\\{").exec(text);
  if (!m) return [];
  let o = text.indexOf("{", m.index), d = 0, e = -1;
  for (let i = o; i < text.length; i++) { if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (!d) { e = i; break; } } }
  const blk = text.slice(o + 1, e);
  const out = [];
  const re = /(?:^|\n)\s*instance\s*=\s*\{/g; let im;
  while ((im = re.exec(blk))) {
    let bo = blk.indexOf("{", im.index), bd = 0, be = -1;
    for (let i = bo; i < blk.length; i++) { if (blk[i] === "{") bd++; else if (blk[i] === "}") { bd--; if (!bd) { be = i; break; } } }
    if (be === -1) break;
    out.push(blk.slice(bo + 1, be));
    re.lastIndex = be;
  }
  return out;
};

const PORT = 39569, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  // Behavioural antivirus terminates a process that rewrites the same file back-to-back, so the saves are
  // paced. Nothing here is timing-sensitive.
  const breathe = () => new Promise((r) => setTimeout(r, 160));
  const find = async (token) => {
    const l = await get("/api/characters/list?modPath=" + encodeURIComponent(MOD));
    for (const f of (l.files || [])) { const c = (f.characters || []).find((x) => x.token === token); if (c) return { file: f.file, c }; }
    return null;
  };
  const payloadFor = (token, file, v, over) => Object.assign({
    modPath: MOD, token, file,
    name: "", gender: v.gender || "",
    portraitCivLarge: v.portraitCivLarge || "", portraitCivSmall: v.portraitCivSmall || "",
    portraitArmyLarge: v.portraitArmyLarge || "", portraitArmySmall: v.portraitArmySmall || "",
    portraitNavyLarge: v.portraitNavyLarge || "", portraitNavySmall: v.portraitNavySmall || "",
    roleLeader: !!v.roleLeader, leaderIdeology: v.leaderIdeology || "", leaderExpire: v.leaderExpire || "",
    leaderTraits: v.leaderTraits || "",
    roleAdvisor: !!v.roleAdvisor, advisorSlot: v.advisorSlot || "", advisorIdeaToken: v.advisorIdeaToken || "",
    advisorCost: v.advisorCost, advisorLedger: v.advisorLedger || "", advisorTraits: v.advisorTraits || "",
    roleGeneral: !!v.roleGeneral, generalType: v.generalType || "", generalTraits: v.generalTraits || "",
    genSkill: v.genSkill, genAttack: v.genAttack, genDefense: v.genDefense,
    genPlanning: v.genPlanning, genLogistics: v.genLogistics,
  }, over || {});

  try {
    // ── READING: the variants come back separately, labelled and complete ──────────────────────────
    const gated = await find("ZZZ_gated");
    ok("the gated character is listed", !!gated);
    const insts = (gated && gated.c.instances) || [];
    ok("both variants are read", insts.length === 2, insts.length);
    ok("the no-DLC variant is labelled from its condition", insts[0] && insts[0].label === "Without Graveyard of Empires", insts[0] && insts[0].label);
    ok("the with-DLC variant is labelled from its condition", insts[1] && insts[1].label === "With Graveyard of Empires", insts[1] && insts[1].label);
    ok("each variant keeps its raw condition for the tooltip", /has_dlc/.test((insts[0] || {}).allowed || ""), insts[0] && insts[0].allowed);
    // The two variants genuinely differ — that is the point, and a flat read hid it.
    ok("only the no-DLC variant has the leader role", insts[0] && insts[0].roleLeader === true && insts[1].roleLeader === false,
      insts.map((i) => i.roleLeader));
    ok("the variant's own name key is exposed", insts[1] && insts[1].nameKey === "ZZZ_gated_dlc_name", insts[1] && insts[1].nameKey);
    ok("a character with no instances reports none", (await find("ZZZ_plain")).c.instances === undefined);

    // ── an UNCHANGED save of a variant must not touch the file ─────────────────────────────────────
    await breathe();
    const r0 = await post("/api/characters/save", payloadFor("ZZZ_gated", "ZZ_gated.txt", insts[0], { instanceIndex: 0 }));
    await breathe();
    ok("saving variant 0 unchanged → 200", r0.s === 200, r0.b);
    ok("…and the file is BYTE-IDENTICAL", read("ZZ_gated.txt") === ORIGINAL, { now: read("ZZ_gated.txt") });

    // ── a REAL edit of one variant must leave the other alone ──────────────────────────────────────
    const before = instancesOf(ORIGINAL, "ZZZ_gated");
    await breathe();
    const g2 = await find("ZZZ_gated");
    const r1 = await post("/api/characters/save", payloadFor("ZZZ_gated", "ZZ_gated.txt", g2.c.instances[1], {
      instanceIndex: 1, portraitCivSmall: "GFX_portrait_zzz_small",
    }));
    await breathe();
    const afterTxt = read("ZZ_gated.txt");
    const after = instancesOf(afterTxt, "ZZZ_gated");
    ok("editing variant 1 → 200", r1.s === 200, r1.b);
    ok("…the file is still valid", balanced(afterTxt), afterTxt);
    ok("…there are still exactly two variants", after.length === 2, after.length);
    ok("…the edit landed in variant 1", /GFX_portrait_zzz_small/.test(after[1] || ""), after[1]);
    ok("…variant 0 is byte-identical", after[0] === before[0], { was: before[0], now: after[0] });
    ok("…so variant 0 still has its leader role", /country_leader/.test(after[0] || ""), after[0]);
    ok("…both has_dlc gates survive", (afterTxt.match(/has_dlc/g) || []).length === 2, (afterTxt.match(/has_dlc/g) || []).length);
    ok("…the edited variant keeps its OWN name key", /name\s*=\s*ZZZ_gated_dlc_name/.test(after[1] || ""), after[1]);
    ok("…and does not gain the token as a name", !/name\s*=\s*ZZZ_gated\b/.test(after[1] || ""), after[1]);
    ok("…the condition stays at the top of the variant", /^\s*allowed\s*=/.test(after[1] || ""), after[1]);
    ok("…no whitespace-only line was left behind", !/\n[ \t]+\n/.test(after[1] || ""), JSON.stringify(after[1]));
    ok("…the neighbouring character is untouched", /ZZZ_plain=\{\n\t\tname = ZZZ_plain/.test(afterTxt), afterTxt);

    // the display name of a variant is written against ITS key, not the token
    await breathe();
    const g3 = await find("ZZZ_gated");
    const r2 = await post("/api/characters/save", payloadFor("ZZZ_gated", "ZZ_gated.txt", g3.c.instances[1], {
      instanceIndex: 1, name: "Zahir (with DLC)",
    }));
    await breathe();
    const locAll = fs.readdirSync(path.join(MOD, "localisation", "english"))
      .map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n");
    ok("renaming a variant → 200", r2.s === 200, r2.b);
    ok("…the name is written against the VARIANT's key", /ZZZ_gated_dlc_name:\d*\s*"Zahir \(with DLC\)"/.test(locAll), locAll);
    ok("…and not against the token", !/(^|\n)\s*ZZZ_gated:\d*\s*"Zahir/.test(locAll), locAll);

    // ── a save that names no variant is still refused, and changes nothing ─────────────────────────
    const snapshot = read("ZZ_gated.txt");
    await breathe();
    const rNo = await post("/api/characters/save", {
      modPath: MOD, token: "ZZZ_gated", file: "ZZ_gated.txt", name: "Flat",
      roleLeader: true, leaderIdeology: "despotism",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
    });
    await breathe();
    ok("a save naming no variant is refused", rNo.s === 400, rNo.b);
    ok("…and says why, naming the count", /2 instance/.test(rNo.b.error || ""), rNo.b.error);
    ok("…and nothing was written", read("ZZ_gated.txt") === snapshot);
    // an index that names nothing is refused the same way
    await breathe();
    const rBad = await post("/api/characters/save", Object.assign(payloadFor("ZZZ_gated", "ZZ_gated.txt", insts[0], { instanceIndex: 7 })));
    await breathe();
    ok("an out-of-range variant index is refused", rBad.s === 400, rBad.b);
    ok("…and still nothing was written", read("ZZ_gated.txt") === snapshot);

    // ── a non-ASCII token must be EDITED, never duplicated ─────────────────────────────────────────
    const acc = await find("CHL_escudero_oscar_otárola");
    ok("the accented character is listed", !!acc);
    ok("…and its token was not truncated at the accent", acc && acc.c.token === "CHL_escudero_oscar_otárola", acc && acc.c.token);
    ok("…nor was a token-shaped value inside it", acc && acc.c.advisorIdeaToken === "CHL_escudero_oscar_otárola", acc && acc.c.advisorIdeaToken);
    await breathe();
    const rAcc = await post("/api/characters/save", payloadFor("CHL_escudero_oscar_otárola", "ZZ_accent.txt", acc.c, { advisorCost: "150" }));
    await breathe();
    const accTxt = read("ZZ_accent.txt");
    const defs = (accTxt.match(new RegExp("(?:^|\\n)\\s*" + esc("CHL_escudero_oscar_otárola") + "\\s*=\\s*\\{", "g")) || []).length;
    ok("saving it → 200", rAcc.s === 200, rAcc.b);
    ok("…the character is still defined exactly ONCE", defs === 1, { definitions: defs, text: accTxt });
    ok("…the edit landed", /cost\s*=\s*150/.test(accTxt), accTxt);
    ok("…and the file is still valid", balanced(accTxt), accTxt);

    console.log("\ntest-character-instances: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 25 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
