// #recruit-remove-touched-the-line-above — removing a recruit_character (or activate_decision) statement changed the
// lines AROUND it, not only its own.
//
// setEffectInHistoryText anchored its remover on `^\s*` under the m flag, and `^` also matches between the `\r` and
// the `\n` of a CRLF line break. The match began on the line above and left that line's `\r` behind, so every Remove
// on a CRLF history turned the line above into `…\r\r\n`. On a copy of Novum Vexillum (Workshop 1827273767), through
// the page's own Remove, USA's line above the removed one is ANOTHER character's
// `recruit_character = USA_joseph_lengyel`, and it came back as `recruit_character = USA_joseph_lengyel\r\r\n`.
// On an LF file `\s*` swallowed the blank lines above the statement instead. And the result went through `.trim()`,
// which removes U+FEFF as well: set-startup restores the BOM, the Delete button's unwire did not, so deleting a
// character took the BOM off every history file that recruited it (Hearts of Minecraft's SRF, Novum Vexillum's BOS).
//
// Every request here is the one public/characters.js sends (checked against its source at the end). A Remove must
// give back the file with exactly that statement's line taken out, byte for byte: the BOM, every other line, the
// blank lines, the comments where they were, and how the file ended.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownline-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok   " + n); } else console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x).slice(0, 600) : "")); };

const MOD = path.join(ROOT, "ownline");
for (const d of ["common/characters", "history/countries"]) fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Own line"\nsupported_version="1.16.*"\n', "utf8");

const BOM = "\uFEFF";
// The history, as lines. Each scenario removes one statement and expects exactly its line to go.
const LINES = [
  "capital = 1",
  "set_research_slots = 3",
  "",
  "# the head of state",
  "recruit_character = TST_head",
  "# his successor, below him",
  "recruit_character = TST_next",
  "recruit_character = TST_third # a trailing comment stays with its own statement",
  "",
  "",
  "recruit_character = TST_after_blanks",
  "1936.1.1 = {",
  "\trecruit_character = TST_dated",
  "}",
  "activate_decision = TST_dec",
  "#Praise Testland!",
];
const TOKENS = ["TST_head", "TST_next", "TST_third", "TST_after_blanks", "TST_dated"];
const lineOf = (id) => LINES.findIndex((l) => new RegExp(`=\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_.-])`, "u").test(l));
const build = (lines, { eol, bom, finalEol }) => (bom ? BOM : "") + lines.join(eol) + (finalEol ? eol : "");
const without = (lines, i) => lines.filter((_, j) => j !== i);
const loneCRs = (s) => (s.match(/\r(?!\n)/g) || []).length;
// Caption map: comment -> the code line below it (blank lines skipped). Compared for the comments whose statement
// is still in the file: they must caption exactly what they captioned.
function captions(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const out = new Map();
  lines.forEach((l, i) => {
    if (!/^\s*#/.test(l)) return;
    let j = i + 1;
    while (j < lines.length && (/^\s*$/.test(lines[j]) || /^\s*#/.test(lines[j]))) j++;
    out.set(l, j < lines.length ? lines[j] : "(EOF)");
  });
  return out;
}
function captionDrift(before, after, removedLine) {
  const b = captions(before), a = captions(after), out = [];
  for (const [c, target] of b) if (target !== removedLine && a.get(c) !== target) out.push({ comment: c, was: target, now: a.get(c) });
  return out;
}

const P = {
  TST: path.join(MOD, "history", "countries", "TST - Testland.txt"),
  TSB: path.join(MOD, "history", "countries", "TSB - Otherland.txt"),
  TSC: path.join(MOD, "history", "countries", "TSC - Thirdland.txt"),
  CH: path.join(MOD, "common", "characters", "TST.txt"),
};
const TSB_LINES = ["capital = 2", "", "# borrowed", "recruit_character = TST_next", "recruit_character = TST_next_door"];
const TSC_TEXT = BOM + "capital = 3\r\nrecruit_character = TST_head_two\r\n";
const LEADER = 'country_leader = { ideology = despotism expire = "1965.1.1.1" id = -1 }';
const CHARS = "characters = {\n" + TOKENS.concat(["TST_next_door", "TST_head_two"]).map((t) => `\t${t} = {\n\t\tname = "${t}"\n\t\t${LEADER}\n\t}\n`).join("") + "}\n";
const read = (p) => fs.readFileSync(p, "utf8");

const PORT = Number(process.env.NOVA_TEST_PORT) || 0;
const app = createApp();
const server = app.listen(PORT, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
  // public/characters.js, setRecruit(): the same body.
  const setRecruit = (tag, t, active) => fetch(`${base}/api/history/set-startup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, itemId: t, itemType: "character", active, modPath: MOD }),
  }).then(json);
  // public/characters.js, del(): { modPath, token, file: editingFile }
  const del = (token, file) => fetch(`${base}/api/characters/delete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modPath: MOD, token, file }),
  }).then(json);
  // public/decisions.js, the Delete button: { modPath, categoryId, decisionId, fileName } (checked at the end)
  const delDecision = (categoryId, decisionId, fileName) => fetch(`${base}/api/decisions/delete-definition`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modPath: MOD, categoryId, decisionId, fileName }),
  }).then(json);
  // public/owner-bridge.js: the same set-startup body with itemType "decision" — the same writer.
  const setDecision = (tag, id, active) => fetch(`${base}/api/history/set-startup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, itemId: id, itemType: "decision", active, modPath: MOD }),
  }).then(json);

  try {
    for (const shape of [
      { name: "CRLF + BOM", eol: "\r\n", bom: true, finalEol: true },
      { name: "LF", eol: "\n", bom: false, finalEol: true },
    ]) {
      for (const id of TOKENS) {
        const i = lineOf(id);
        console.log(`\n[remove, ${shape.name}] ${id} (line ${i + 1}), the way the Remove button does`);
        const before = build(LINES, shape);
        fs.writeFileSync(P.TST, before, "utf8");
        const r = await setRecruit("TST", id, false);
        ok(`${id}: the remove succeeds`, r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
        const after = read(P.TST);
        const expected = build(without(LINES, i), shape);
        ok(`${id}: the file is the original with exactly that line taken out, byte for byte`, after === expected, { expected, after });
        ok(`${id}: no lone CR anywhere`, loneCRs(after) === 0, after);
        if (i > 0) ok(`${id}: the line above (${JSON.stringify(LINES[i - 1])}) survives byte for byte`,
          after.includes((i - 1 === 0 && shape.bom ? BOM : "") + LINES[i - 1] + shape.eol + (LINES[i + 1] !== undefined ? LINES[i + 1] : "")), after);
        ok(`${id}: every other comment still captions the statement it captioned`, captionDrift(before, after, LINES[i]).length === 0, captionDrift(before, after, LINES[i]));
      }
    }

    console.log("\n[remove] the decision toggle is the same writer");
    {
      const shape = { eol: "\r\n", bom: true, finalEol: true };
      fs.writeFileSync(P.TST, build(LINES, shape), "utf8");
      const r = await setDecision("TST", "TST_dec", false);
      ok("removing TST_dec succeeds", r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
      ok("…and takes exactly its line out", read(P.TST) === build(without(LINES, LINES.indexOf("activate_decision = TST_dec")), shape), read(P.TST));
    }

    console.log("\n[delete] Delete a character, the way the Delete button does: every history file that recruits it");
    {
      const shape = { eol: "\r\n", bom: true, finalEol: true };
      fs.writeFileSync(P.TST, build(LINES, shape), "utf8");
      fs.writeFileSync(P.TSB, build(TSB_LINES, { eol: "\r\n", bom: true, finalEol: false }), "utf8");
      fs.writeFileSync(P.TSC, TSC_TEXT, "utf8");
      fs.writeFileSync(P.CH, CHARS, "utf8");
      const r = await del("TST_next", "TST.txt");
      ok("the delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      const tst = read(P.TST), tsb = read(P.TSB);
      ok("TST: exactly the recruit line is gone, byte for byte (BOM kept)", tst === build(without(LINES, lineOf("TST_next")), shape), tst);
      ok("TST: still starts with its BOM", tst.charCodeAt(0) === 0xfeff, tst.slice(0, 20));
      ok("TSB: exactly the recruit line is gone, the BOM kept, and it still ends without a newline",
        tsb === build(without(TSB_LINES, 3), { eol: "\r\n", bom: true, finalEol: false }), tsb);
      ok("TSB: TST_next_door, which carries the deleted id as a prefix, survives byte for byte", tsb.endsWith("\r\nrecruit_character = TST_next_door"), tsb);
      ok("TSC, which never recruited it, is byte-identical", read(P.TSC) === TSC_TEXT, read(P.TSC));
    }

    console.log("\n[delete] the last line, with no newline after it");
    {
      const lines = ["capital = 2", "# borrowed", "recruit_character = TST_next_door", "recruit_character = TST_next"];
      fs.writeFileSync(P.TSB, build(lines, { eol: "\r\n", bom: true, finalEol: false }), "utf8");
      fs.writeFileSync(P.CH, CHARS, "utf8");
      fs.writeFileSync(P.TST, build(LINES, { eol: "\r\n", bom: true, finalEol: true }), "utf8");
      const r = await del("TST_next", "TST.txt");
      ok("the delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      ok("TSB ends where the line before it ended, with no newline, as it did", read(P.TSB) === build(lines.slice(0, 3), { eol: "\r\n", bom: true, finalEol: false }), read(P.TSB));
    }

    // #unwire-missed-a-bom-first-line — set-startup takes the BOM off before its removers look; the Delete button's unwire
    // handed them the raw file, and `^[ \t]*` cannot step over U+FEFF. So a recruit (or activate_decision) on the first
    // line of a history with a BOM stayed where it was, and the Delete still answered ok.
    console.log("\n[delete] the recruit line is the file's first line, right after its BOM");
    {
      const shape = { eol: "\r\n", bom: true, finalEol: true };
      const lines = ["recruit_character = TST_next", "capital = 2", "# borrowed", "recruit_character = TST_next_door"];
      fs.writeFileSync(P.CH, CHARS, "utf8");
      fs.writeFileSync(P.TST, build(LINES, shape), "utf8");
      fs.writeFileSync(P.TSB, build(lines, shape), "utf8");
      const r = await del("TST_next", "TST.txt");
      ok("the delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      ok("TSB: exactly the first line is gone and the BOM stays, byte for byte", read(P.TSB) === build(lines.slice(1), shape), read(P.TSB));
      ok("TST, where the line is not the first, loses exactly its line as before", read(P.TST) === build(without(LINES, lineOf("TST_next")), shape), read(P.TST));
    }

    console.log("\n[delete] the decision Delete is the same unwire: activate_decision on the first line, right after the BOM");
    {
      const shape = { eol: "\r\n", bom: true, finalEol: true };
      const DEC = path.join(MOD, "common", "decisions", "TST_decisions.txt");
      fs.mkdirSync(path.dirname(DEC), { recursive: true });
      fs.writeFileSync(DEC, "TST_decisions = {\r\n" + ["TST_dec", "TST_dec_two"].map((d) => `\t${d} = {\r\n\t\ticon = GFX_decision_generic\r\n\t\tcost = 50\r\n\t}\r\n`).join("") + "}\r\n", "utf8");
      const lines = ["activate_decision = TST_dec", "capital = 2", "activate_decision = TST_dec_two"];
      fs.writeFileSync(P.TST, build(LINES, shape), "utf8");
      fs.writeFileSync(P.TSB, build(lines, shape), "utf8");
      const r = await delDecision("TST_decisions", "TST_dec", "TST_decisions.txt");
      ok("the decision delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      ok("TSB: exactly the first line is gone and the BOM stays, byte for byte", read(P.TSB) === build(lines.slice(1), shape), read(P.TSB));
      ok("TSB: TST_dec_two, which carries the deleted id as a prefix, survives", read(P.TSB).endsWith("\r\nactivate_decision = TST_dec_two\r\n"), read(P.TSB));
      ok("TST, where the line is not the first, loses exactly its line", read(P.TST) === build(without(LINES, LINES.indexOf("activate_decision = TST_dec")), shape), read(P.TST));
    }

    // …and an EMPTY result is still the answer: the remover gives "" for a history whose only statement was the line, and
    // `if (next && …)` skipped writing it, so the line stayed.
    for (const bom of [false, true]) {
      console.log(`\n[delete] a history whose only statement is the recruit line${bom ? ", after a BOM" : ""}`);
      fs.writeFileSync(P.CH, CHARS, "utf8");
      fs.writeFileSync(P.TSB, (bom ? BOM : "") + "recruit_character = TST_next\r\n", "utf8");
      const r = await del("TST_next", "TST.txt");
      ok("the delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      ok(`TSB: the line is gone and ${bom ? "only the BOM" : "nothing"} is left`, read(P.TSB) === (bom ? BOM : ""), read(P.TSB));
    }

    console.log("\n[client] the requests above are the ones the page sends");
    {
      const cli = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8"));
      ok("set-startup body", cli.includes('body: JSON.stringify({ tag, itemId: t, itemType: "character", active, modPath: modPath() })'), "characters.js changed its set-startup body: update this test");
      ok("delete body", cli.includes("body: JSON.stringify({ modPath: modPath(), token, file: editingFile })"), "characters.js changed its delete body");
      const dec = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8")).replace(/\s+/g, " ");
      ok("decision delete body", dec.includes('fetch("/api/decisions/delete-definition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: getModPath(), categoryId, decisionId: id, fileName: homeFileFor(categoryId, id) }) })'),
        "decisions.js changed its delete body: update this test");
    }

    console.log(`\ntest-a-recruit-remove-takes-only-its-own-line: ${pass}/${total} checks passed`);
  } catch (e) {
    console.log("  FAIL harness threw: " + (e && e.stack || e));
    total++;
  } finally {
    process.exitCode = pass === total && total >= 70 ? 0 : 1;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error: " + e.message); process.exitCode = 1; });
