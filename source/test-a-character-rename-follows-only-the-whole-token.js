// #recruit-matched-a-longer-token — renameCharacterRecruits checked a token against the class every guard accepts,
// `[\p{L}\p{N}_.-]`, and then FOUND it with `${esc}\b`. An ASCII `\b` sits between `t` and `-`, so renaming
// Hearts of Minecraft's SRF_Federal-Government (Workshop 2624254320) rewrote the line below it,
// `recruit_character = SRF_Federal-Government-2`, to `<new>-2`: a character defined nowhere, so SRF silently lost
// that leader at game start. And `\b` never closes after `.` or a non-ASCII letter, so renaming Novum Vexillum's
// `USA_john_nicholson_jr.` rewrote nothing and left USA recruiting a character that no longer existed.
//
// The rename here is the request the Character maker sends: collect()'s body after loadChar() filled the form from
// /api/characters/list, with the token edited (its keys are checked against collect()'s own source below). The
// history fixture is CRLF with a BOM like the shipping file, and each rename must leave it byte-identical apart
// from the one token, with every comment still captioning the statement it captioned.
//
// The last group derives, from server.js itself, every regex that finds a recruit_character id — inside a function
// called with "recruit_character", or written around the keyword — and requires each to end the id with
// WHOLE_TOKEN_END, never with `\b`. A new writer that copies the old shape fails here.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-renametok-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { stripJsComments, maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok   " + n); } else console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x).slice(0, 500) : "")); };

const MOD = path.join(ROOT, "renametok");
for (const d of ["common/characters", "history/countries"]) fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Rename token"\nsupported_version="1.16.*"\n', "utf8");

const X = "TST_federal-government";
const XY = "TST_federal-government-2", XDOT = "TST_federal-government.jr", XACC = "TST_federal-governmentš";
const DOT = "TST_dotted_jr.", ACC = "TST_ending_ć", GEN = "TST_general_one";
const crlf = (lines) => lines.map((l) => l + "\r\n").join("");
const TST_HIST = "﻿" + crlf([
  "capital = 1",
  "",
  "# the head of state",
  `recruit_character = ${X}`,
  "# his successor carries the head's id as a prefix",
  `recruit_character = ${XY}`,
  `recruit_character = ${XDOT}`,
  `recruit_character = ${XACC}`,
  "#generals",
  `recruit_character = ${GEN}`,
  `recruit_character = ${DOT}`,
  `recruit_character = ${ACC}`,
  "#Praise Testland!",
]);
const TSB_HIST = "﻿" + crlf(["capital = 2", "", "# only the second one", `recruit_character = ${XY}`]);
const NAMES = { [X]: "Federal Government", [XY]: "Federal Government II", [XDOT]: "Federal Government Jr", [XACC]: "Federal Governments",
  [DOT]: "Dotted Junior", [ACC]: "Ending Accent", [GEN]: "General One" };
const block = (tok, role) => `\t${tok} = {\n\t\tname = "${NAMES[tok]}"\n\t\t${role}\n\t}\n`;
const LEADER = 'country_leader = {\n\t\t\tideology = despotism\n\t\t\texpire = "1965.1.1.1"\n\t\t\tid = -1\n\t\t}';
const CHARS = "characters = {\n" + [X, XY, XDOT, XACC, DOT, ACC].map((t) => block(t, LEADER)).join("") +
  block(GEN, "corps_commander = {\n\t\t\tskill = 2\n\t\t}") + "}\n";
const P = {
  TST: path.join(MOD, "history", "countries", "TST - Testland.txt"),
  TSB: path.join(MOD, "history", "countries", "TSB - Otherland.txt"),
  CH: path.join(MOD, "common", "characters", "TST.txt"),
};
function seed() {
  fs.writeFileSync(P.TST, TST_HIST, "utf8");
  fs.writeFileSync(P.TSB, TSB_HIST, "utf8");
  fs.writeFileSync(P.CH, CHARS, "utf8");
}
const read = (p) => fs.readFileSync(p, "utf8");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeLines = (text, id) =>
  (text.match(new RegExp(`(?:^|\\n)[ \\t]*recruit_character[ \\t]*=[ \\t]*${escRe(id)}(?![\\p{L}\\p{N}_.-])`, "gu")) || []).length;
function captions(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim());
  const out = new Map();
  lines.forEach((l, i) => {
    if (!l.startsWith("#")) return;
    let j = i + 1;
    while (j < lines.length && (lines[j] === "" || lines[j].startsWith("#"))) j++;
    out.set(l, j < lines.length ? lines[j] : "(EOF)");
  });
  return out;
}

// public/characters.js: collect() after loadChar(c, file) and the token box edited. Field for field.
const CLIENT = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8"));
function collectBody(c, file, newToken) {
  return {
    modPath: MOD,
    token: newToken,
    previousToken: c.token, previousFile: file,
    name: c.name && c.name !== c.token ? c.name : "",
    gender: c.gender === "female" ? "female" : "",
    file,
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
  const list = () => fetch(`${base}/api/characters/list?modPath=${encodeURIComponent(MOD)}&includeBaseMod=1`).then(json);
  const save = (body) => fetch(`${base}/api/characters/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json);
  async function rename(oldTok, newTok) {
    const l = await list();
    const f = l.body && (l.body.files || []).find((x) => x.file === "TST.txt");
    const c = f && f.characters.find((x) => x.token === oldTok);
    if (!c) return { status: 0, body: { error: "the list did not offer " + oldTok }, sent: null };
    const body = collectBody(c, "TST.txt", newTok);
    const r = await save(body);
    return Object.assign(r, { sent: body });
  }
  try {
    for (const [oldTok, newTok] of [[X, "TST_new_government"], [DOT, "TST_dotted_junior"], [ACC, "TST_ending_c"]]) {
      console.log(`\n[rename] ${oldTok} -> ${newTok}, the way the Character maker saves an edited token`);
      seed();
      const before = read(P.TST);
      const r = await rename(oldTok, newTok);
      ok(`${oldTok}: the save succeeds`, r.status === 200 && r.body && r.body.ok === true, r.body);
      const after = read(P.TST);
      ok(`${oldTok}: TST now recruits ${newTok}`, wholeLines(after, newTok) === 1, after);
      ok(`${oldTok}: …and no longer the old token`, wholeLines(after, oldTok) === 0, after);
      const expected = before.replace(`recruit_character = ${oldTok}\r\n`, () => `recruit_character = ${newTok}\r\n`);
      ok(`${oldTok}: the file is byte-identical apart from that one token`, after === expected, { expected, after });
      const want = new Map([...captions(before)].map(([k, v]) => [k, v === `recruit_character = ${oldTok}` ? `recruit_character = ${newTok}` : v]));
      const got = captions(after);
      ok(`${oldTok}: every comment captions the statement it captioned`, JSON.stringify([...got]) === JSON.stringify([...want]), { want: [...want], got: [...got] });
      ok(`${oldTok}: TSB is byte-identical`, read(P.TSB) === TSB_HIST, read(P.TSB));
      if (oldTok === X) {
        for (const id of [XY, XDOT, XACC]) {
          ok(`${id}: its recruit line survives byte for byte`, after.split(`recruit_character = ${id}\r\n`).length === 2, after);
          ok(`${id}: its definition survives`, read(P.CH).includes(`\t${id} = {\n`), read(P.CH));
        }
      }
      if (r.sent && collectKeys) {
        const sent = Object.keys(r.sent).sort();
        ok(`${oldTok}: the body has exactly the keys collect() sends`, JSON.stringify(sent) === JSON.stringify(collectKeys.filter((k) => k !== "instanceIndex")), { sent, collectKeys });
      } else ok(`${oldTok}: collect() was found in public/characters.js`, false, collectKeys);
    }

    console.log("\n[source] every regex that finds a recruit_character id ends it with WHOLE_TOKEN_END");
    {
      const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const plain = maskJsComments(src);
      const masked = maskJsLiterals(src);
      const regexCalls = (from, to) => {
        const out = [];
        let i = from;
        while ((i = masked.indexOf("new RegExp(", i)) !== -1 && i < to) {
          let d = 0, j = i + "new RegExp".length;
          for (; j < masked.length; j++) { if (masked[j] === "(") d++; else if (masked[j] === ")" && --d === 0) break; }
          out.push(plain.slice(i, j + 1));
          i = j;
        }
        return out;
      };
      const callers = new Set([...plain.matchAll(/\b([A-Za-z_$][\w$]*)\(\s*[^()]*?"recruit_character"/g)].map((m) => m[1]));
      const found = [];
      for (const fn of callers) {
        const at = masked.search(new RegExp(`\\bfunction ${fn}\\(`));
        const body = at === -1 ? null : jsBodyAt(masked, at);
        ok(`${fn} is defined in server.js`, !!body, fn);
        if (body) for (const t of regexCalls(body[0], body[1])) found.push({ fn, t });
      }
      for (const t of regexCalls(0, masked.length)) if (t.includes("recruit_character")) found.push({ fn: "(written around the keyword)", t });
      ok("the scan found the readers and writers (at least 3 regexes)", found.length >= 3, found);
      for (const { fn, t } of found) {
        ok(`${fn}: ${t.slice(0, 90)}… ends the id with WHOLE_TOKEN_END`, t.includes("WHOLE_TOKEN_END") && !t.includes("}\\\\b"), t);
      }
      // The class is read out of the startup guard's character branch, not typed in here: an id ends where the next
      // character is one assertStartupItemId would not accept inside a character id, whatever that class becomes.
      const guardAt = masked.search(/\bfunction assertStartupItemId\(/);
      const guardBody = guardAt === -1 ? null : jsBodyAt(masked, guardAt);
      const guardSrc = guardBody ? plain.slice(guardBody[0], guardBody[1]) : "";
      const guard = /type === "character"[\s\S]*?\?\s*\/\^\[[^\]]+\](\[[^\]]+\])\*\$\/u\.test\(id\)/.exec(guardSrc);
      ok("assertStartupItemId's character branch is found", !!guard, guardSrc.slice(0, 400));
      const def = /const WHOLE_TOKEN_END = "([^"]+)";/.exec(plain);
      const value = def ? def[1].replace(/\\\\/g, "\\") : null; // the string's value, as new RegExp() receives it
      ok("WHOLE_TOKEN_END refuses exactly the characters assertStartupItemId accepts inside a character id",
        !!guard && value === `(?!${guard[1]})`, { WHOLE_TOKEN_END: value, guardClass: guard && guard[1] });
    }

    console.log(`\ntest-a-character-rename-follows-only-the-whole-token: ${pass}/${total} checks passed`);
  } catch (e) {
    console.log("  FAIL harness threw: " + (e && e.stack || e));
    total++;
  } finally {
    process.exitCode = pass === total && total >= 30 ? 0 : 1;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error: " + e.message); process.exitCode = 1; });
