// #loc-remove-touched-the-line-above — deleting or renaming a character took its name out of every .yml under
// localisation/ with `^\s*KEY(?:_desc)?:…$` under the m flag. `^` also matches between the `\r` and the `\n` of a
// CRLF line break, so the match began on the line ABOVE the key and left that line's `\r` behind. Through the
// Character maker's own rename of Novum Vexillum's USA_john_nicholson_jr. (Workshop 1827273767, on a copy), all
// nine .yml files that named it came back with a lone CR, and in the English one the damaged line is ANOTHER
// character's name: `USA_joseph_lengyel:0 "Joseph Lengyel"\r\r\n`. On an LF file a blank line was left where the
// key had been, and the result then went through `\n{3,}` -> `\n\n` and `\n+$` -> `\n`, which rewrote every run of
// blank lines in the file and how it ended.
//
//
// #loc-remove-gave-a-translation-an-english-header — the same sweep ran every file through the English-only header
// repair first, so in that rename all eight non-English files came back starting `l_english:` above their own
// `l_french:` (and so on). A translation here must keep its own header, with nothing put above it.
//
// Every request here is the one public/characters.js sends: del() for Delete, and collect() after loadChar() with
// the token edited for a rename (its keys are checked against collect()'s own source). Each .yml must come back as
// the original with exactly the key's own lines taken out, byte for byte: the BOM, the header, the neighbour whose
// id carries this one as a prefix, the blank lines, every comment where it was (a caption map, not a multiset),
// every line ending, and how the file ended.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownloc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok   " + n); } else console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x).slice(0, 700) : "")); };

const MOD = path.join(ROOT, "ownloc");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "french"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Own loc line"\nsupported_version="1.16.*"\n', "utf8");

const BOM = "\uFEFF";
// The English names file, as lines. The deleted character's key sits BELOW another character's name (the line the
// old remover damaged) and above TWO blank lines and a comment: the old `\n{3,}` -> `\n\n` collapse rewrote a run
// like that anywhere in an LF file, and `\n+$` -> `\n` rewrote how the file ended. Its `_desc` line ends in a
// comment after the value, a shape shipping loc carries on thousands of lines: that line must still go whole, with its
// own line break, on CRLF and on LF (#loc-line-trailing-comment).
const LOC = [
  "l_english:",
  " # the heads of state",
  " TST_head-2:0 \"Head the Second\"",
  " TST_head:0 \"Head\"",
  " TST_head_desc:0 \"The head, described\" # the long form",
  "",
  "",
  " # the general",
  " TST_general:0 \"General\"",
];
// The same names in French, in the french folder, under its own header.
const FR = [
  "l_french:",
  " # les chefs d'État",
  " TST_head-2:0 \"Chef le Second\"",
  " TST_head:0 \"Chef\"",
  " TST_head_desc:0 \"Le chef, décrit\" # la forme longue",
  "",
  " # le général",
  " TST_general:0 \"Général\"",
];
const OWN = (id) => (l) => new RegExp(`^[ \\t]*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:_desc)?:`).test(l);
const build = (lines, { eol, finalEol, blankAtEnd }) => BOM + lines.join(eol) + (finalEol ? eol : "") + (blankAtEnd ? eol : "");
const loneCRs = (s) => (s.match(/\r(?!\n)/g) || []).length;
// How a file ends: the exact run of line breaks after its last character.
const ending = (t) => (t.match(/(?:\r?\n)*$/) || [""])[0];
const LOCP = path.join(MOD, "localisation", "english", "TST_characters_l_english.yml");
const FRP = path.join(MOD, "localisation", "french", "TST_characters_l_french.yml");
const CHP = path.join(MOD, "common", "characters", "TST.txt");
const CHARS = "characters = {\n" + ["TST_head", "TST_head-2", "TST_general"].map((t) =>
  `\t${t} = {\n\t\tname = ${t}\n\t\tcountry_leader = {\n\t\t\tideology = despotism\n\t\t\texpire = "1965.1.1.1"\n\t\t\tid = -1\n\t\t}\n\t}\n`).join("") + "}\n";
const read = (p) => fs.readFileSync(p, "utf8");
// Caption map: comment -> the line below it (blank lines and other comments skipped); compared for the comments
// whose line is still in the file.
function captions(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim());
  const out = new Map();
  lines.forEach((l, i) => {
    if (!l.startsWith("#")) return;
    let j = i + 1;
    while (j < lines.length && (lines[j] === "" || lines[j].startsWith("#"))) j++;
    out.set(l, j < lines.length ? lines[j] : "(EOF)");
  });
  return out;
}
function captionDrift(before, after, gone) {
  const a = captions(after), out = [];
  for (const [c, target] of captions(before)) if (!gone(target) && a.get(c) !== target) out.push({ comment: c, was: target, now: a.get(c) });
  return out;
}
// A file's lines WITH their own terminators, so a lone CR or a changed ending shows.
const linesOf = (t) => t.match(/[^\n]*\n|[^\n]+$/g) || [];

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

const SHAPES = [
  { name: "CRLF + BOM", eol: "\r\n", finalEol: true },
  { name: "LF + BOM", eol: "\n", finalEol: true },
  { name: "LF + BOM, ending in a blank line", eol: "\n", finalEol: true, blankAtEnd: true },
  { name: "CRLF + BOM, the key's lines last, no newline after them", eol: "\r\n", finalEol: false, last: true },
];
const linesFor = (shape, base = LOC) => (shape.last ? base.filter((l) => !OWN("TST_head")(l)).concat(base.filter(OWN("TST_head"))) : base);

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
    for (const shape of SHAPES) {
      console.log(`\n[delete, ${shape.name}] TST_head, the way the Delete button does`);
      const lines = linesFor(shape);
      const before = build(lines, shape);
      const frLines = linesFor(shape, FR);
      fs.writeFileSync(CHP, CHARS, "utf8");
      fs.writeFileSync(LOCP, before, "utf8");
      fs.writeFileSync(FRP, build(frLines, shape), "utf8");
      const r = await del("TST_head", "TST.txt");
      ok(`${shape.name}: the delete succeeds`, r.status === 200 && r.body && r.body.ok === true, r);
      const after = read(LOCP);
      const expected = build(lines.filter((l) => !OWN("TST_head")(l)), shape);
      ok(`${shape.name}: the .yml is the original with exactly TST_head's two lines taken out, byte for byte`, after === expected, { expected, after });
      ok(`${shape.name}: no lone CR anywhere`, loneCRs(after) === 0, after);
      ok(`${shape.name}: the neighbour TST_head-2's line survives byte for byte`, linesOf(after).includes(` TST_head-2:0 "Head the Second"${shape.eol}`), after);
      ok(`${shape.name}: every comment above a surviving line still captions it`, captionDrift(before, after, (t) => OWN("TST_head")(t)).length === 0, captionDrift(before, after, (t) => OWN("TST_head")(t)));
      ok(`${shape.name}: the file ends the way it did`, ending(after) === ending(before), { before: ending(before), after: ending(after) });
      const frAfter = read(FRP);
      ok(`${shape.name}: the French .yml is the original with exactly TST_head's two lines taken out, byte for byte`,
        frAfter === build(frLines.filter((l) => !OWN("TST_head")(l)), shape), frAfter);
      ok(`${shape.name}: the French .yml still opens with its own header, and nothing above it`, frAfter.startsWith(BOM + "l_french:" + shape.eol), JSON.stringify(frAfter.slice(0, 40)));
    }

    console.log("\n[rename, CRLF + BOM] TST_head -> TST_new_head, the way the Character maker saves an edited token");
    {
      const shape = SHAPES[0];
      const before = build(LOC, shape);
      const frBefore = build(FR, shape);
      fs.writeFileSync(CHP, CHARS, "utf8");
      fs.writeFileSync(LOCP, before, "utf8");
      fs.writeFileSync(FRP, frBefore, "utf8");
      const l = await list();
      const f = l.body && (l.body.files || []).find((x) => x.file === "TST.txt");
      const c = f && f.characters.find((x) => x.token === "TST_head");
      ok("the list offers TST_head", !!c, l.body);
      if (c) {
        const body = collectBody(c, "TST.txt", "TST_new_head");
        const r = await save(body);
        ok("the rename succeeds", r.status === 200 && r.body && r.body.ok === true, r.body);
        const after = read(LOCP);
        // Only the renamed key's own lines may differ (taken out, or one day renamed in place); every other line,
        // with its own line ending, must be exactly what it was, in the same order.
        const mine = (t) => OWN("TST_head")(t) || OWN("TST_new_head")(t);
        const others = (t) => linesOf(t).filter((x) => !mine(x.replace(/^\uFEFF/, "")));
        ok("every other line of the .yml is byte-identical and in order", JSON.stringify(others(after)) === JSON.stringify(others(before)), { before: others(before), after: others(after) });
        ok("no lone CR anywhere", loneCRs(after) === 0, after);
        ok("it still starts with its BOM and its header", after.startsWith(BOM + "l_english:\r\n"), JSON.stringify(after.slice(0, 20)));
        ok("every comment above a surviving line still captions it", captionDrift(before, after, mine).length === 0, captionDrift(before, after, mine));
        const frAfter = read(FRP);
        ok("the French .yml: every other line is byte-identical and in order", JSON.stringify(others(frAfter)) === JSON.stringify(others(frBefore)), { before: others(frBefore), after: others(frAfter) });
        ok("the French .yml still opens with its own header, and nothing above it", frAfter.startsWith(BOM + "l_french:\r\n"), JSON.stringify(frAfter.slice(0, 40)));
        if (collectKeys) {
          ok("the body has exactly the keys collect() sends", JSON.stringify(Object.keys(body).sort()) === JSON.stringify(collectKeys.filter((k) => k !== "instanceIndex")), { sent: Object.keys(body).sort(), collectKeys });
        } else ok("collect() was found in public/characters.js", false, collectKeys);
      }
    }

    console.log("\n[client] the delete request above is the one the page sends");
    ok("delete body", CLIENT.includes("body: JSON.stringify({ modPath: modPath(), token, file: editingFile })"), "characters.js changed its delete body: update this test");

    console.log(`\ntest-a-removed-character-name-takes-only-its-own-loc-line: ${pass}/${total} checks passed`);
  } catch (e) {
    console.log("  FAIL harness threw: " + (e && e.stack || e));
    total++;
  } finally {
    process.exitCode = pass === total && total >= 42 ? 0 : 1;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error: " + e.message); process.exitCode = 1; });
