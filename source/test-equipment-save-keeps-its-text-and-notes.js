// #equipment-stat-text-reformatted + #equipment-comment-on-a-managed-stat + #equipment-save-mixes-line-endings
// ONE TRAILING ZERO COST AN EQUIPMENT BLOCK EVERY COMMENT IN IT.
//
// serializeEquipment writes formatHoi4Number(value), so an authored `soft_attack = 0.10` comes back as
// `0.1`. That is not merely cosmetic: the rebuilt block now DIFFERS from what is on disk, so the writer
// replaces the block — and the rebuild is what costs the comments and, in a CRLF file, the line endings.
//
// An isolating control, two fixtures differing by ONE character:
//
//     soft_attack = 0.1    file unchanged    3 comments kept    CRLF 31/0 -> 31/0
//     soft_attack = 0.10   file REWRITTEN    3 comments -> 0    CRLF 31/0 -> 4/18
//
// Reproduced on the corpus too: editing one technology in Rise of Nations rewrote
// early_infantry_equipment_1890, losing `#Defensive Abilities` and `#Offensive Abilities`, reformatting
// `ap_attack = 0.10`, and turning 11 of the file's CRLF lines into lone LF.
//
// THREE THINGS HAD TO CHANGE, and each is separately controlled below.
//
// 1. The author's spelling of a number is handed back while the VALUE has not moved — the mechanism
//    #keep-equipment-stat-vars already uses for @variables, one function away. This stops the spurious
//    rebuild at its source.
// 2. A comment above a stat the serializer RE-EMITS is carried onto the new statement. The existing
//    #equipment-save-eats-comments fix only reached statements this merge PRESERVES — keys the rebuilt
//    block does not emit — so a note above `defense` or `soft_attack` had nothing to travel with.
//    2,003 of the corpus's 5,740 equipment comments sit in exactly that position, vanilla's included.
// 3. The write normalises to the file's own line ending. 170 of 243 equipment files are CRLF.
//
// Numbers, measured across vanilla, Millennium Dawn, Road to 56, Old World Blues, Rise of Nations and
// Novum Vexillum: 2,781 equipment blocks, 1,895 of them carrying at least one comment, 5,740 comments in
// all, 427 stats whose authored text a rebuild would reformat, 170 CRLF files.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqtest-"));
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

const PORT = 53593;
const BASE = "http://127.0.0.1:" + PORT;
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const RON_TECH = W + "2026448968/common/technologies/infantry.txt";
const RON_EQ = W + "2026448968/common/units/equipment/infantry.txt";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

const TECH = [
  "technologies = {",
  "\tprobe_tech = {",
  "\t\tenable_equipments = {",
  "\t\t\tprobe_eq",
  "\t\t}",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  "}",
  "",
];
const EQ = (softAttack) => [
  "equipments = {",
  "",
  "\tprobe_eq = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t\ttype = infantry",
  "",
  "\t\t#Defensive Abilities",
  "\t\tdefense = 20",
  "\t\tbreakthrough = 2",
  "",
  "\t\t#Offensive Abilities",
  "\t\tsoft_attack = " + softAttack,
  "\t\thard_attack = 0.5",
  "",
  "\t\t#Space taken in convoy",
  "\t\tlend_lease_cost = 1",
  "",
  "\t\tbuild_cost_ic = 0.5",
  "\t}",
  "}",
  "",
];

let seq = 0;
function mkMod(techText, eqText, crlf) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova equipment"\n');
  const j = (a) => (Array.isArray(a) ? a.join(crlf ? "\r\n" : "\n") : a);
  fs.writeFileSync(path.join(mod, "common", "technologies", "probe.txt"), j(techText), "utf8");
  fs.writeFileSync(path.join(mod, "common", "units", "equipment", "probe.txt"), j(eqText), "utf8");
  return mod;
}
const eqFileOf = (mod) => fs.readFileSync(path.join(mod, "common", "units", "equipment", "probe.txt"), "utf8");
const commentCount = (t) => (t.match(/#[^\r\n]*/g) || []).length;
const eolStats = (t) => { const crlf = (t.match(/\r\n/g) || []).length; return { crlf, lf: (t.match(/\n/g) || []).length - crlf }; };

// One save driven the way public/research.js drives it: ONLY the edited technology, plus every equipment.
async function saveTech(mod, techId, mutateEquip) {
  const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
  const tech = (cat.technologies || []).find((t) => t.id === techId) || (cat.technologies || []).find((t) => t.isMod);
  if (!tech) return { error: "no technology in the catalogue", have: (cat.technologies || []).map((t) => t.id).slice(0, 5) };
  const eq = JSON.parse(JSON.stringify(cat.equipments || {}));
  if (mutateEquip) mutateEquip(eq);
  const r = await fetch(`${BASE}/api/technologies/save-batch`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      technologies: [tech], equipments: eq, customTabs: [], modPath: mod,
      countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
    }),
  });
  return { status: r.status, body: await r.json(), techId: tech.id };
}

// Derive the corpus figures rather than typing them in.
function censusEquipment() {
  const mask = (s) => {
    const a = s.split(""); let inC = false, inS = false;
    for (let i = 0; i < a.length; i++) {
      const c = a[i];
      if (inC) { if (c === "\n") inC = false; else a[i] = " "; continue; }
      if (inS) { if (c === '"') inS = false; else a[i] = " "; continue; }
      if (c === "#") { inC = true; a[i] = " "; continue; }
      if (c === '"') { inS = true; continue; }
    }
    return a.join("");
  };
  const brace = (s, o) => { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
  const kids = (s, o, c) => {
    const out = []; const re = /(?:^|[\s}])([^\s={}#"]+)[ \t\r\n]*=[ \t\r\n]*\{/g; re.lastIndex = o + 1; let m;
    while ((m = re.exec(s)) !== null && m.index < c) {
      const oo = s.indexOf("{", m.index + m[0].length - 1); const cc = brace(s, oo);
      if (cc < 0 || cc > c) break;
      out.push({ open: oo, close: cc }); re.lastIndex = cc;
    }
    return out;
  };
  let blocks = 0, comments = 0, trailingZero = 0, crlfFiles = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, "common", "units", "equipment");
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      let raw;
      try { raw = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
      if (/\r\n/.test(raw)) crlfFiles++;
      const s = mask(raw);
      const im = /(?:^|[\s}])equipments[ \t]*=[ \t]*\{/.exec(s);
      if (!im) continue;
      const io = s.indexOf("{", im.index), ic = brace(s, io);
      if (ic < 0) continue;
      for (const eq of kids(s, io, ic)) {
        blocks++;
        const body = raw.slice(eq.open + 1, eq.close);
        comments += (body.match(/#[^\r\n]*/g) || []).length;
        for (const line of body.split(/\r?\n/)) {
          const m = /^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*(-?\d+\.\d*0)\b/.exec(line);
          if (m && String(Number(m[1])) !== m[1]) trailingZero++;
        }
      }
    }
  }
  return { blocks, comments, trailingZero, crlfFiles, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    // ================================================ the isolating control
    console.log("\n-- a no-edit save, with and without a trailing zero --");
    for (const crlf of [false, true]) {
      const tag = crlf ? "CRLF" : "LF";
      const modA = mkMod(TECH, EQ("0.1"), crlf);    // canonical
      const modB = mkMod(TECH, EQ("0.10"), crlf);   // the author's own spelling
      const beforeA = eqFileOf(modA), beforeB = eqFileOf(modB);
      rec(tag + " CONTROL: the two fixtures differ by exactly one character",
        Math.abs(beforeA.length - beforeB.length) === 1, { a: beforeA.length, b: beforeB.length });

      const rA = await saveTech(modA, "probe_tech");
      const rB = await saveTech(modB, "probe_tech");
      rec(tag + " both saves are accepted", rA.status === 200 && rB.status === 200 && !(rA.body || {}).error && !(rB.body || {}).error, { rA, rB });
      const afterA = eqFileOf(modA), afterB = eqFileOf(modB);

      rec(tag + " CONTROL: the canonical file is left alone", afterA === beforeA, { changed: afterA !== beforeA });
      rec(tag + " RUN: ⭐ the trailing-zero file is left alone too", afterB === beforeB, {
        comments: commentCount(beforeB) + " -> " + commentCount(afterB),
        eol: JSON.stringify(eolStats(beforeB)) + " -> " + JSON.stringify(eolStats(afterB)),
      });
      rec(tag + " RUN: ⭐ the author's `0.10` is still spelt that way", /soft_attack = 0\.10\b/.test(afterB), afterB.slice(0, 300));
      rec(tag + " RUN: ⭐ every comment survives", commentCount(afterB) === 3, commentCount(afterB));
      if (crlf) rec(tag + " RUN: ⭐ no line was converted to lone LF", eolStats(afterB).lf === 0, eolStats(afterB));
    }

    // ================================================ a real edit must still work
    console.log("\n-- an edited stat is written, and the notes stay with it --");
    for (const crlf of [false, true]) {
      const tag = crlf ? "CRLF" : "LF";
      const mod = mkMod(TECH, EQ("0.10"), crlf);
      const before = eqFileOf(mod);
      const r = await saveTech(mod, "probe_tech", (eq) => {
        if (!eq.probe_eq) return;
        eq.probe_eq.softAttack = 0.33;
        if (eq.probe_eq.statsAll) eq.probe_eq.statsAll.soft_attack = 0.33;
        if (eq.probe_eq.authoredStats) eq.probe_eq.authoredStats.soft_attack = true;
      });
      const after = eqFileOf(mod);
      rec(tag + " the edit save is accepted", r.status === 200 && !(r.body || {}).error, r);
      rec(tag + " CONTROL: ⭐ the file really did change — so 'unchanged' above is not the writer idling",
        after !== before, { changed: after !== before });
      rec(tag + " EDIT: ⭐ the new value is written", /soft_attack = 0\.33\b/.test(after), after.slice(0, 400));
      rec(tag + " EDIT: the old value is gone", !/soft_attack = 0\.10\b/.test(after), after.slice(0, 400));
      rec(tag + " EDIT: ⭐ the note above the edited stat survives", after.includes("#Offensive Abilities"), after);
      rec(tag + " EDIT: ⭐ so do the notes on the stats it did not touch",
        after.includes("#Defensive Abilities") && after.includes("#Space taken in convoy"), after);
      rec(tag + " EDIT: an untouched neighbouring stat keeps its value", /hard_attack = 0\.5\b/.test(after), after);
      if (crlf) rec(tag + " EDIT: ⭐ the file is still all CRLF", eolStats(after).lf === 0, eolStats(after));
    }

    // ================================================ the corpus
    console.log("\n-- the corpora this came from --");
    const c = censusEquipment();
    console.log("     " + c.blocks + " equipment blocks · " + c.comments + " comments · " + c.trailingZero
      + " trailing-zero stats · " + c.crlfFiles + " CRLF files · " + c.corpora + " corpora");
    rec("CONTROL: the corpora really carry this shape in quantity",
      c.corpora >= 1 && c.comments >= 500 && c.trailingZero >= 50, c);

    if (!fs.existsSync(RON_TECH) || !fs.existsSync(RON_EQ)) {
      rec("Rise of Nations is not installed — that corpus check is skipped", true, "");
    } else {
      const techSrc = fs.readFileSync(RON_TECH, "utf8"), eqSrc = fs.readFileSync(RON_EQ, "utf8");
      rec("CONTROL: the real file really is CRLF and really carries a trailing-zero stat",
        eolStats(eqSrc).lf === 0 && /ap_attack\s*=\s*0\.10\b/.test(eqSrc), eolStats(eqSrc));
      const mod = mkMod(techSrc, eqSrc, false); // write the bytes as they are
      fs.writeFileSync(path.join(mod, "common", "technologies", "probe.txt"), techSrc, "utf8");
      fs.writeFileSync(path.join(mod, "common", "units", "equipment", "probe.txt"), eqSrc, "utf8");
      const before = eqFileOf(mod);
      // The tech that enables an equipment defined in this very file.
      const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
      const inFile = (id) => new RegExp("(?:^|\\n)[ \\t]*" + String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*=[ \\t]*\\{").test(eqSrc);
      const edited = (cat.technologies || []).filter((t) => t && t.isMod)
        .find((t) => Array.isArray(t.enableEquipments) && t.enableEquipments.some(inFile));
      rec("a technology in that file enables equipment defined in it", !!edited, "");
      if (edited) {
        const r = await saveTech(mod, edited.id);
        const after = eqFileOf(mod);
        console.log("     edited `" + edited.id + "` · comments " + commentCount(before) + " -> " + commentCount(after)
          + " · EOL " + JSON.stringify(eolStats(before)) + " -> " + JSON.stringify(eolStats(after)));
        rec("the real save is accepted", r.status === 200 && !(r.body || {}).error, r);
        rec("RUN: ⭐ the real file is left byte-identical", after === before, {
          comments: commentCount(before) + " -> " + commentCount(after),
          eol: JSON.stringify(eolStats(before)) + " -> " + JSON.stringify(eolStats(after)),
        });
      }
    }

    rec("the fixture was measured whatever is installed", checks >= 20, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== equipment save keeps its text and notes: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
