// #recruit-matched-a-longer-token — the recruit bridge, its status reader and the Delete button found a character
// token with `${id}\b`, while every guard accepts `[\p{L}\p{N}_.-]`. An ASCII `\b` sits between `t` and `-`, so
// `SRF_Federal-Government\b` matched inside `SRF_Federal-Government-2`. Hearts of Minecraft's SRF history recruits
// both (Workshop 2624254320, history/countries/SRF - Saheritan Federation.txt), and on a copy of it, through the
// page's own requests:
//   Remove SRF_Federal-Government  -> {ok:true}, and the -2 line was gone too
//   Delete SRF_Federal-Government  -> the -2 line gone from every history file that recruited it
//   Add on a country recruiting only -2 -> {ok:true, unchanged:true}, nothing written, page says "now recruits"
// and `\b` never closes after `.` or a non-ASCII letter, so Novum Vexillum's `USA_john_nicholson_jr.` and
// `BOS_husein_tursunović` read as absent: Add appended a second line each time, Remove answered unchanged.
//
// `\b` did hold where an id goes on with a letter, a digit or `_`, and the class must go on holding there: 257 of the
// 258 same-file prefix pairs in the base game and the 15 installed Workshop items continue that way (vanilla's ENG
// recruits ENG_random_communist_minister_1 and _10 to _15). So a digit pair is here too. It is also what holds the
// status reader's `u` flag: without it `\p{N}` is no class at all, and _1 reads as recruited wherever _10 is.
//
// Every request below is the one public/characters.js sends (checked against its source at the end), on a mod in
// the temp folder. The fixture is CRLF with a BOM, like the shipping file. Neighbours are checked BYTE FOR BYTE,
// and comments by a caption map (comment -> the statement on the next code line), not a multiset.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wholetok-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok   " + n); } else console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x).slice(0, 500) : "")); };

const MOD = path.join(ROOT, "wholetok");
for (const d of ["common/characters", "history/countries"]) fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Whole token"\nsupported_version="1.16.*"\n', "utf8");

const X = "TST_federal-government";
const XY = "TST_federal-government-2", XDOT = "TST_federal-government.jr", XACC = "TST_federal-governmentš";
const DOT = "TST_dotted_jr.", ACC = "TST_ending_ć", GEN = "TST_general_one";
const M1 = "TST_minister_1", M10 = "TST_minister_10";
const BOM = "﻿";
const crlf = (lines) => lines.map((l) => l + "\r\n").join("");
const TST_HIST = BOM + crlf([
  "capital = 1",
  "set_research_slots = 3",
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
  "# ministers",
  `recruit_character = ${M1}`,
  `recruit_character = ${M10}`,
  "#Praise Testland!",
]);
const TSB_HIST = BOM + crlf(["capital = 2", "", "# only the second one", `recruit_character = ${XY}`, `recruit_character = ${M10}`]);
const TSC_HIST = BOM + crlf(["capital = 3", "activate_decision = TST_dec", "activate_decision = TST_dec-2", "activate_decision = TST_dec.b"]);
const charBlock = (tok, role) => `\t${tok} = {\n\t\tname = "${tok}"\n\t\t${role}\n\t}\n`;
const LEADER = 'country_leader = { ideology = despotism expire = "1965.1.1.1" id = -1 }';
const CHARS = "characters = {\n" +
  [X, XY, XDOT, XACC, DOT, ACC, M1, M10].map((t) => charBlock(t, LEADER)).join("") +
  charBlock(GEN, "corps_commander = { skill = 2 }") + "}\n";

const P = {
  TST: path.join(MOD, "history", "countries", "TST - Testland.txt"),
  TSB: path.join(MOD, "history", "countries", "TSB - Otherland.txt"),
  TSC: path.join(MOD, "history", "countries", "TSC - Thirdland.txt"),
  CH: path.join(MOD, "common", "characters", "TST.txt"),
};
function seed() {
  fs.writeFileSync(P.TST, TST_HIST, "utf8");
  fs.writeFileSync(P.TSB, TSB_HIST, "utf8");
  fs.writeFileSync(P.TSC, TSC_HIST, "utf8");
  fs.writeFileSync(P.CH, CHARS, "utf8");
}
const read = (p) => fs.readFileSync(p, "utf8");
const line = (cmd, id) => `${cmd} = ${id}\r\n`;
const occurrences = (text, s) => text.split(s).length - 1;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// What a whole-token statement is, independently of server.js: the id must not be followed by a token character.
const wholeLines = (text, cmd, id) =>
  (text.match(new RegExp(`(?:^|\\n)[ \\t]*${escRe(cmd)}[ \\t]*=[ \\t]*${escRe(id)}(?![\\p{L}\\p{N}_.-])`, "gu")) || []).length;
// Caption map: comment text -> the statement on the next code line (blank lines skipped).
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
// Captions of the statements that are still in the file must be exactly what they were.
function captionChanges(before, after) {
  const a = captions(after), b = captions(before), survivors = new Set(after.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()));
  const out = [];
  for (const [c, target] of b) if (survivors.has(target) && a.get(c) !== target) out.push({ comment: c, was: target, now: a.get(c) });
  return out;
}

const PORT = Number(process.env.NOVA_TEST_PORT) || 0;
const app = createApp();
const server = app.listen(PORT, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const q = encodeURIComponent;
  const json = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
  // public/characters.js, initRecruitBridge: refreshStatus / autoDetectMembership / setRecruit — the same URLs and body.
  const status = (tag, t) => fetch(`${base}/api/history/startup-status?tag=${q(tag)}&itemId=${q(t)}&itemType=character&modPath=${q(MOD)}`).then(json);
  const countries = (t) => fetch(`${base}/api/history/character-countries?itemId=${q(t)}&modPath=${q(MOD)}`).then(json);
  const setRecruit = (tag, t, active) => fetch(`${base}/api/history/set-startup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, itemId: t, itemType: "character", active, modPath: MOD }),
  }).then(json);
  // public/characters.js, del(): { modPath, token, file: editingFile }
  const del = (token, file) => fetch(`${base}/api/characters/delete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modPath: MOD, token, file }),
  }).then(json);
  // public/owner-bridge.js / decisions.js: the same set-startup body with itemType "decision".
  const setDecision = (tag, id, active) => fetch(`${base}/api/history/set-startup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, itemId: id, itemType: "decision", active, modPath: MOD }),
  }).then(json);
  const decisionStatus = (tag, id) => fetch(`${base}/api/history/startup-status?tag=${q(tag)}&itemId=${q(id)}&itemType=decision&modPath=${q(MOD)}`).then(json);

  try {
    console.log("\n[status] what the recruit bridge SHOWS");
    seed();
    let r = await status("TST", X);
    ok("TST recruits the head: active (control)", r.body && r.body.active === true, r);
    r = await status("TSB", X);
    ok("TSB recruits only the -2 successor: the head is NOT active there", r.body && r.body.active === false, r);
    r = await countries(X);
    ok("the head belongs to TST alone", r.body && JSON.stringify(r.body.tags) === JSON.stringify(["TST"]), r);
    r = await countries(XY);
    ok("the -2 successor belongs to TSB and TST (control)", r.body && JSON.stringify(r.body.tags) === JSON.stringify(["TSB", "TST"]), r);
    r = await status("TST", DOT);
    ok(`an id ending in a dot (${DOT}) reads as recruited`, r.body && r.body.active === true, r);
    r = await status("TST", ACC);
    ok(`an id ending in a non-ASCII letter (${ACC}) reads as recruited`, r.body && r.body.active === true, r);
    r = await countries(DOT);
    ok("…and the dotted one belongs to TST", r.body && JSON.stringify(r.body.tags) === JSON.stringify(["TST"]), r);

    console.log("\n[digit] an id that goes on with a digit is another id: TST recruits _1 and _10, TSB only _10");
    seed();
    r = await status("TSB", M1);
    ok("TSB recruits only _10: _1 is NOT active there", r.body && r.body.active === false, r);
    r = await countries(M1);
    ok("_1 belongs to TST alone", r.body && JSON.stringify(r.body.tags) === JSON.stringify(["TST"]), r);
    r = await countries(M10);
    ok("_10 belongs to TSB and TST (control)", r.body && JSON.stringify(r.body.tags) === JSON.stringify(["TSB", "TST"]), r);
    r = await setRecruit("TST", M1, false);
    ok("Remove _1 from TST succeeds", r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
    ok("…and _1 is gone", wholeLines(read(P.TST), "recruit_character", M1) === 0, read(P.TST));
    ok("…and _10 survives byte for byte", occurrences(read(P.TST), line("recruit_character", M10)) === 1, read(P.TST));
    seed();
    r = await del(M1, "TST.txt");
    ok("Delete _1 succeeds", r.status === 200 && r.body && r.body.ok === true, r);
    ok("…TST keeps its _10 line byte for byte", occurrences(read(P.TST), line("recruit_character", M10)) === 1, read(P.TST));
    ok("…and TSB, which recruits only _10, is byte-identical", read(P.TSB) === TSB_HIST, read(P.TSB));

    console.log("\n[remove] Remove the head from TST, the way the Remove button does");
    seed();
    {
      const before = read(P.TST);
      r = await setRecruit("TST", X, false);
      ok("the remove succeeds", r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
      const after = read(P.TST);
      ok("the head is no longer recruited", wholeLines(after, "recruit_character", X) === 0, after);
      for (const id of [XY, XDOT, XACC, GEN, DOT, ACC]) {
        ok(`${id}: its line survives byte for byte`, occurrences(after, line("recruit_character", id)) === 1, after);
      }
      ok("captions of the statements that remain are where they were", captionChanges(before, after).length === 0, captionChanges(before, after));
      ok("TSB, which never recruited the head, is byte-identical", read(P.TSB) === TSB_HIST);
      r = await status("TST", XY);
      ok("the -2 successor still reads as recruited by TST", r.body && r.body.active === true, r);
    }

    console.log("\n[add] Add the head to TSB, which recruits only the -2 successor");
    seed();
    {
      r = await setRecruit("TSB", X, true);
      ok("the add WROTE something (not a silent unchanged)", r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
      const after = read(P.TSB);
      ok("TSB now recruits the head, once", wholeLines(after, "recruit_character", X) === 1, after);
      ok("…and still recruits the -2 successor, byte for byte", occurrences(after, line("recruit_character", XY)) === 1, after);
      r = await status("TSB", X);
      ok("…and the status reader agrees", r.body && r.body.active === true, r);
    }

    for (const id of [DOT, ACC]) {
      console.log(`\n[dot / accent] ${id}: Add then Remove on TST`);
      seed();
      r = await setRecruit("TST", id, true);
      ok(`${id}: Add is a no-op — TST already recruits it`, r.status === 200 && r.body && r.body.unchanged === true, r);
      ok(`${id}: still exactly one line, no duplicate`, wholeLines(read(P.TST), "recruit_character", id) === 1, read(P.TST));
      r = await setRecruit("TST", id, false);
      ok(`${id}: Remove changes the file`, r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
      ok(`${id}: …and its line is gone`, wholeLines(read(P.TST), "recruit_character", id) === 0, read(P.TST));
    }

    console.log("\n[delete] Delete the head character, the way the Delete button does");
    seed();
    {
      r = await del(X, "TST.txt");
      ok("the delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      const after = read(P.TST);
      ok("TST no longer recruits the deleted head", wholeLines(after, "recruit_character", X) === 0, after);
      for (const id of [XY, XDOT, XACC]) {
        ok(`${id}: its recruit line survives the delete byte for byte`, occurrences(after, line("recruit_character", id)) === 1, after);
      }
      ok("TSB, which recruits only the -2 successor, is byte-identical", read(P.TSB) === TSB_HIST, read(P.TSB));
      const ch = read(P.CH);
      for (const id of [XY, XDOT, XACC]) ok(`${id}: its definition is still there`, ch.includes(`\t${id} = {\n`), ch);
    }
    seed();
    {
      r = await del(DOT, "TST.txt");
      ok("deleting the dotted character succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      ok("…and takes its recruit line out of TST", wholeLines(read(P.TST), "recruit_character", DOT) === 0, read(P.TST));
    }

    console.log("\n[decision] the same two functions serve activate_decision, whose ids take '-' and '.' too");
    seed();
    {
      r = await setDecision("TSC", "TST_dec", false);
      ok("removing TST_dec succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      const after = read(P.TSC);
      ok("TST_dec is gone", wholeLines(after, "activate_decision", "TST_dec") === 0, after);
      ok("TST_dec-2 survives byte for byte", occurrences(after, line("activate_decision", "TST_dec-2")) === 1, after);
      ok("TST_dec.b survives byte for byte", occurrences(after, line("activate_decision", "TST_dec.b")) === 1, after);
      r = await decisionStatus("TSC", "TST_dec-2");
      ok("…and TST_dec-2 still reads as active", r.body && r.body.active === true, r);
    }

    console.log("\n[client] the requests above are the ones the page sends");
    {
      const cli = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8"));
      ok("set-startup body", cli.includes('body: JSON.stringify({ tag, itemId: t, itemType: "character", active, modPath: modPath() })'), "characters.js changed its set-startup body: update this test");
      ok("startup-status URL", cli.includes("/api/history/startup-status?tag=${encodeURIComponent(tag)}&itemId=${encodeURIComponent(t)}&itemType=character&modPath=${encodeURIComponent(modPath())}"), "characters.js changed its status URL");
      ok("character-countries URL", cli.includes("/api/history/character-countries?itemId=${encodeURIComponent(t)}&modPath=${encodeURIComponent(modPath())}"), "characters.js changed its membership URL");
      ok("delete body", cli.includes("body: JSON.stringify({ modPath: modPath(), token, file: editingFile })"), "characters.js changed its delete body");
    }

    console.log(`\ntest-a-recruit-toggle-takes-only-the-whole-token: ${pass}/${total} checks passed`);
  } catch (e) {
    console.log("  FAIL harness threw: " + (e && e.stack || e));
    total++;
  } finally {
    process.exitCode = pass === total && total >= 59 ? 0 : 1;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error: " + e.message); process.exitCode = 1; });
