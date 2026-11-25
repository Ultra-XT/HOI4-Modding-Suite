// #character-cut-left-a-lone-cr — deleting a character, or moving it to another file, cut its block out of the
// characters file from `lastIndexOf("\n", keyStart)` through the closing brace. On a CRLF file that leaves the `\r`
// of the line break behind, so the line ABOVE the character came back as `…\r\r\n`. On a copy of Hearts of
// Minecraft (Workshop 2624254320), through the page's own Delete of SRF_Federal-Government: SRF.txt's first line
// became `characters = {\r\r\n`. 25,382 of the 33,582 character blocks in the base game and the 14 installed
// Workshop items follow a CRLF break, so this hit three Deletes in four.
//
// Every request here is the one public/characters.js sends: del() for Delete, and collect() after loadChar() with
// the target file edited for a move (its keys checked against collect()'s own source). The file after each must be
// the original with exactly the character's lines taken out, byte for byte: the comment above it, the neighbour
// whose id carries this one as a prefix, the blank lines, and every line ending. Every comment above a character
// that is still there must caption it as before (a caption map, not a multiset of comment texts).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownblock-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok   " + n); } else console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x).slice(0, 600) : "")); };

const MOD = path.join(ROOT, "ownblock");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Own block"\nsupported_version="1.16.*"\n', "utf8");

// The characters file, as lines; BLOCKS names the lines each character's block occupies.
const LINES = [
  "characters = {",
  "\t# the head of state",
  "\tTST_head = {",
  "\t\tname = \"Head\"",
  "\t\tcountry_leader = {",
  "\t\t\tideology = despotism",
  "\t\t\texpire = \"1965.1.1.1\"",
  "\t\t\tid = -1",
  "\t\t}",
  "\t}",
  "\tTST_head-2 = {",
  "\t\tname = \"Head the Second\"",
  "\t\tcountry_leader = {",
  "\t\t\tideology = despotism",
  "\t\t\texpire = \"1965.1.1.1\"",
  "\t\t\tid = -1",
  "\t\t}",
  "\t}",
  "",
  "\t# a general, after a blank line",
  "\tTST_general = {",
  "\t\tname = \"General\"",
  "\t\tcorps_commander = {",
  "\t\t\tskill = 2",
  "\t\t}",
  "\t}",
  "}",
];
const BLOCKS = { "TST_head": [2, 9], "TST_head-2": [10, 17], "TST_general": [20, 25] };
const build = (lines, eol) => lines.join(eol) + eol;
const withoutBlock = (id) => LINES.filter((_, i) => i < BLOCKS[id][0] || i > BLOCKS[id][1]);
const blockText = (id, eol) => LINES.slice(BLOCKS[id][0], BLOCKS[id][1] + 1).join(eol);
const loneCRs = (s) => (s.match(/\r(?!\n)/g) || []).length;
// Caption map: comment -> the code line below it (blank lines and other comments skipped). Compared for the
// comments whose statement is still in the file: each must caption exactly what it captioned. A multiset of
// comment texts cannot see a comment that moved (CLAUDE.md, "Comments are content").
function captions(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out = new Map();
  lines.forEach((l, i) => {
    if (!l.startsWith("#")) return;
    let j = i + 1;
    while (j < lines.length && (lines[j] === "" || lines[j].startsWith("#"))) j++;
    out.set(l, j < lines.length ? lines[j] : "(EOF)");
  });
  return out;
}
function captionDrift(before, after, removedKeyLine) {
  const a = captions(after), out = [];
  for (const [c, target] of captions(before)) if (target !== removedKeyLine && a.get(c) !== target) out.push({ comment: c, was: target, now: a.get(c) });
  return out;
}
const P = path.join(MOD, "common", "characters", "TST.txt");
const PB = path.join(MOD, "common", "characters", "TSTb.txt");
const read = (p) => fs.readFileSync(p, "utf8");

// public/characters.js: collect() after loadChar(c, file) and the File box edited. Field for field.
const CLIENT = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8"));
function collectBody(c, fromFile, toFile) {
  return {
    modPath: MOD,
    token: c.token,
    previousToken: c.token, previousFile: fromFile,
    name: c.name && c.name !== c.token ? c.name : "",
    gender: c.gender === "female" ? "female" : "",
    file: toFile,
    portraitCivLarge: c.portraitCivLarge || "", portraitCivSmall: c.portraitCivSmall || "",
    portraitArmyLarge: c.portraitArmyLarge || "", portraitArmySmall: c.portraitArmySmall || "",
    portraitNavyLarge: c.portraitNavyLarge || "", portraitNavySmall: c.portraitNavySmall || "",
    roleLeader: !!c.roleLeader, leaderIdeology: c.leaderIdeology || "", leaderExpire: c.leaderExpire || "", leaderTraits: c.leaderTraits || "",
    roleAdvisor: !!c.roleAdvisor, advisorSlot: c.advisorSlot || "political_advisor", advisorCost: c.advisorCost || "",
    advisorLedger: c.advisorLedger || "", advisorIdeaToken: c.advisorIdeaToken || "", advisorTraits: c.advisorTraits || "",
    roleGeneral: !!c.roleGeneral, generalType: c.generalType || "corps_commander",
    loadedRoles: { leader: !!c.roleLeader, advisor: !!c.roleAdvisor, generalType: c.roleGeneral ? (c.generalType || "corps_commander") : null },
    genSkill: c.genSkill || "", genAttack: c.genAttack || "", genDefense: c.genDefense || "",
    genPlanning: c.genPlanning || "", genLogistics: c.genLogistics || "", generalTraits: c.generalTraits || "",
  };
}
const collectKeys = (() => {
  const at = CLIENT.indexOf("function collect() {");
  const end = CLIENT.indexOf("async function save()", at);
  if (at === -1 || end === -1) return null;
  return [...new Set([...CLIENT.slice(at, end).matchAll(/(?<![.\w$])([A-Za-z_]\w*)\s*:(?!:)/g)].map((m) => m[1]))].sort();
})();

const PORT = Number(process.env.NOVA_TEST_PORT) || 0;
const app = createApp();
const server = app.listen(PORT, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
  // public/characters.js, del(): { modPath, token, file: editingFile }
  const del = (token, file) => fetch(`${base}/api/characters/delete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modPath: MOD, token, file }),
  }).then(json);
  const list = () => fetch(`${base}/api/characters/list?modPath=${encodeURIComponent(MOD)}&includeBaseMod=1`).then(json);
  const save = (body) => fetch(`${base}/api/characters/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json);

  try {
    for (const [eolName, eol] of [["CRLF", "\r\n"], ["LF", "\n"]]) {
      for (const id of Object.keys(BLOCKS)) {
        console.log(`\n[delete, ${eolName}] ${id}, the way the Delete button does`);
        try { fs.unlinkSync(PB); } catch (_) {}
        fs.writeFileSync(P, build(LINES, eol), "utf8");
        const r = await del(id, "TST.txt");
        ok(`${id}: the delete succeeds`, r.status === 200 && r.body && r.body.ok === true, r);
        const after = read(P);
        ok(`${id}: the file is the original with exactly that character's lines taken out, byte for byte`, after === build(withoutBlock(id), eol), { expected: build(withoutBlock(id), eol), after });
        ok(`${id}: no lone CR anywhere`, loneCRs(after) === 0, after);
        const b = BLOCKS[id][0];
        ok(`${id}: the line above it (${JSON.stringify(LINES[b - 1])}) is still followed by exactly what followed the block`,
          after.includes(LINES[b - 1] + eol + LINES[BLOCKS[id][1] + 1] + eol), after);
        for (const other of Object.keys(BLOCKS)) {
          if (other !== id) ok(`${id}: ${other} survives byte for byte`, after.includes(blockText(other, eol) + eol), after);
        }
        const drift = captionDrift(build(LINES, eol), after, LINES[b].trim());
        ok(`${id}: every comment above a surviving character still captions it`, drift.length === 0, drift);
      }
    }

    console.log("\n[move, CRLF] TST_general to TSTb.txt, the way the Character maker saves an edited File box");
    {
      try { fs.unlinkSync(PB); } catch (_) {}
      fs.writeFileSync(P, build(LINES, "\r\n"), "utf8");
      const l = await list();
      const f = l.body && (l.body.files || []).find((x) => x.file === "TST.txt");
      const c = f && f.characters.find((x) => x.token === "TST_general");
      ok("the list offers TST_general", !!c, l.body);
      if (c) {
        const body = collectBody(c, "TST.txt", "TSTb.txt");
        const r = await save(body);
        ok("the move succeeds", r.status === 200 && r.body && r.body.ok === true, r.body);
        const after = read(P);
        ok("TST.txt is the original with exactly TST_general's lines taken out, byte for byte", after === build(withoutBlock("TST_general"), "\r\n"), { expected: build(withoutBlock("TST_general"), "\r\n"), after });
        ok("TST.txt: no lone CR anywhere", loneCRs(after) === 0, after);
        const drift = captionDrift(build(LINES, "\r\n"), after, LINES[BLOCKS["TST_general"][0]].trim());
        ok("TST.txt: every comment above a surviving character still captions it", drift.length === 0, drift);
        ok("TSTb.txt now defines TST_general", fs.existsSync(PB) && /(^|\n)\s*TST_general\s*=\s*\{/.test(read(PB)), fs.existsSync(PB) ? read(PB) : "(missing)");
        if (collectKeys) {
          ok("the body has exactly the keys collect() sends", JSON.stringify(Object.keys(body).sort()) === JSON.stringify(collectKeys.filter((k) => k !== "instanceIndex")), { sent: Object.keys(body).sort(), collectKeys });
        } else ok("collect() was found in public/characters.js", false, collectKeys);
      }
    }

    console.log("\n[probe] the caption map can see a comment that moved, where a multiset of comments cannot");
    {
      const moved = LINES.filter((l) => l !== "\t# a general, after a blank line");
      moved.splice(moved.indexOf("\tTST_head-2 = {"), 0, "\t# a general, after a blank line");
      const multiset = (t) => t.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("#")).sort().join("|");
      ok("a moved comment shows as drift (and the multiset is identical)",
        captionDrift(build(LINES, "\n"), build(moved, "\n"), "").length === 1 && multiset(build(LINES, "\n")) === multiset(build(moved, "\n")),
        captionDrift(build(LINES, "\n"), build(moved, "\n"), ""));
    }

    console.log("\n[client] the delete request above is the one the page sends");
    ok("delete body", CLIENT.includes("body: JSON.stringify({ modPath: modPath(), token, file: editingFile })"), "characters.js changed its delete body: update this test");

    console.log(`\ntest-a-character-delete-takes-only-its-own-lines: ${pass}/${total} checks passed`);
  } catch (e) {
    console.log("  FAIL harness threw: " + (e && e.stack || e));
    total++;
  } finally {
    process.exitCode = pass === total && total >= 51 ? 0 : 1;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error: " + e.message); process.exitCode = 1; });
