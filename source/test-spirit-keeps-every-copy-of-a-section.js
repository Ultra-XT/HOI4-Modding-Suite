// #spirit-duplicate-section-collapsed — A SPIRIT THAT DECLARED A SECTION TWICE CAME BACK WITH ONE.
//
// The Ideas page loads each modelled section into its box with extractBraceBlock (public/ideas.js), which
// is `text.match(re)` — the FIRST match. The server then strips EVERY top-level copy of every key the
// payload names (stripTopLevelIdeaSections) and re-inserts the single copy it was sent. N in, 1 out, on a
// save that changed nothing, under {ok:true} with no warning.
//
// What it cost, driven through the endpoints the page actually uses with the payload it actually sends:
//
//     vanilla SWE_let_fly_all_guns_idea        equipment_bonus 4 -> 1   (6 leaf assignments gone)
//     Millennium Dawn HOL_Dutch_Army_Doctrine_Change
//                                              on_add 2 -> 1
//
// The Dutch one is the sharp case: the surviving on_add holds a debug `log` line, and the deleted one held
// `block_defence_decrease = yes` — the spirit's only gameplay effect. CWTools' hoi4 schema annotates
// on_add and on_remove `cardinality = 0..inf`, so repeated blocks all execute and dropping one is a
// behaviour change, not a formatting one. equipment_bonus is annotated 0..1, so what the engine does with
// four is unproven — but Paradox ships four differing blocks in a spirit named "Let Fly, All Guns", and
// five community teams do the same, so the author's script is being deleted either way.
//
// Measured over all six installed corpora: 98 of 48,173 spirits declare a duplicate, 131 blocks. 82 of
// those spirits / 96 blocks sit in a category the Ideas page itself lists (public/ideas.js:111-114 offers
// only `country` and the five designer categories), and in 75 spirits / 87 blocks the copies actually
// DIFFER, so something is really lost rather than a byte-identical twin. The fix is server-side, in the
// merge every caller goes through, so the app.js national-spirit editor — which opens categories this page
// does not, such as division_command_spirit and trade_laws — is covered by the same change.
//
// The copies the editor never showed are now handed back verbatim after the one it did. Only for keys the
// payload NAMES — clearing a box must still clear all of it, which is the control below that would
// otherwise be the obvious way to get this wrong.
//
// This is the shape the technology maker already solved with enableEquipmentsRawAll. The adjacent fix
// #spirit-save-deletes-hidden-blocks taught the server which sections the form DREW, but not that a
// section can appear more than once — "the fix exists next door and one caller never adopted it".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupsec-"));
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

const PORT = 53553;
const BASE = "http://127.0.0.1:" + PORT;
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const VAN_SWEDEN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/ideas/sweden.txt";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

// A country spirit declaring on_add twice and equipment_bonus three times.
const FIXTURE = [
  "ideas = {",
  "\tcountry = {",
  "",
  "\t\tprobe_twice = {",
  "\t\t\tallowed = { always = yes }",
  "",
  "\t\t\ton_add = {",
  '\t\t\t\tlog = "[GetDateText]: probe_twice added"',
  "\t\t\t}",
  "",
  "\t\t\ton_add = {",
  "\t\t\t\tblock_defence_decrease = yes",
  "\t\t\t}",
  "",
  "\t\t\tequipment_bonus = {",
  "\t\t\t\tfighter_equipment = { instant = yes air_attack = 0.08 }",
  "\t\t\t}",
  "",
  "\t\t\tequipment_bonus = {",
  "\t\t\t\tcas_equipment = { instant = yes soft_attack = 0.08 }",
  "\t\t\t}",
  "",
  "\t\t\tequipment_bonus = {",
  "\t\t\t\tnaval_bomber_equipment = { instant = yes hard_attack = 0.08 }",
  "\t\t\t}",
  "\t\t}",
  "",
  "\t\tprobe_once = {",
  "\t\t\tallowed = { always = yes }",
  "\t\t\ton_add = {",
  "\t\t\t\tadd_political_power = 10",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// ---- mirrors of public/ideas.js ----
function dedentBlock(s) {
  let lines = String(s).replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const ind = lines.filter((l) => l.trim()).map((l) => (l.match(/^[ \t]*/) || [""])[0].length);
  const min = ind.length ? Math.min(...ind) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}
function extractBraceBlock(text, keyword) {
  const m = text.match(new RegExp("\\b" + keyword + "\\s*=\\s*\\{"));
  if (!m) return "";
  const start = m.index + m[0].length;
  let depth = 1, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  return end === -1 ? "" : dedentBlock(text.slice(start, end));
}
const DESIGNER_CATS = ["tank_manufacturer", "naval_manufacturer", "aircraft_manufacturer", "materiel_manufacturer", "industrial_concern"];
const categoryKind = (c) => (c === "country" ? "country" : DESIGNER_CATS.includes(c) ? "designer" : "advisor");

let seq = 0;
function mkMod(text) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova dup sections"\n');
  fs.writeFileSync(path.join(mod, "common", "ideas", "probe.txt"), text, "utf8");
  return mod;
}
const fileOf = (mod) => fs.readFileSync(path.join(mod, "common", "ideas", "probe.txt"), "utf8");

// Count top-level `key = {` copies inside one spirit's block.
function sectionCount(fileText, ideaId, key) {
  const m = new RegExp("(?:^|\\n)[ \\t]*" + ideaId + "[ \\t]*=[ \\t]*\\{").exec(fileText);
  if (!m) return -1;
  const open = fileText.indexOf("{", m.index);
  let d = 0, end = -1;
  for (let i = open; i < fileText.length; i++) {
    if (fileText[i] === "{") d++;
    else if (fileText[i] === "}") { d--; if (!d) { end = i; break; } }
  }
  if (end < 0) return -1;
  const body = fileText.slice(open + 1, end);
  let depth = 0, n = 0;
  for (const line of body.split(/\r?\n/)) {
    if (depth === 0 && new RegExp("^\\s*" + key + "\\s*=\\s*\\{").test(line)) n++;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  }
  return n;
}

// One save of `ideaId`. `mutate` may edit or drop sections to simulate the user editing / clearing a box.
async function saveSpirit(mod, ideaId, mutate) {
  const q = encodeURIComponent(mod);
  const cat = await fetch(`${BASE}/api/ideas/catalog?includeVanilla=0&includeWorkshop=0&includeActiveMod=1&includeModsRoot=0&sourcePath=${q}&modPath=${q}`).then((r) => r.json());
  const item = (cat.items || []).find((i) => i.ideaId === ideaId);
  if (!item) return { error: "not in catalogue", have: (cat.items || []).map((i) => i.ideaId) };
  const sr = encodeURIComponent(item.sourceRoot || mod);
  const df = encodeURIComponent(item.definitionFile);
  const ed = await fetch(`${BASE}/api/ideas/edit-payload?ideaId=${item.ideaId}&definitionFile=${df}&sourceRoot=${sr}`).then((r) => r.json());
  const blk = await fetch(`${BASE}/api/ideas/entry-block?ideaId=${item.ideaId}&definitionFile=${df}&sourceRoot=${sr}`).then((r) => r.json());
  const full = blk.blockText || "";
  if (!full) return { error: "entry-block returned nothing" };
  const kind = categoryKind(item.category);

  // The boxes, exactly as the page fills them.
  const box = {
    allowed: extractBraceBlock(full, "allowed") || "always = yes",
    allowed_civil_war: kind === "country" ? extractBraceBlock(full, "allowed_civil_war") : "",
    available: kind === "country" ? "" : extractBraceBlock(full, "available"),
    research_bonus: kind === "designer" ? extractBraceBlock(full, "research_bonus") : "",
    modifier: kind === "designer" ? "" : extractBraceBlock(full, "modifier"),
    equipment_bonus: extractBraceBlock(full, "equipment_bonus"),
    visible: extractBraceBlock(full, "visible"),
    on_add: extractBraceBlock(full, "on_add"),
  };
  const drawn = new Set(["allowed", "equipment_bonus", "visible", "on_add"]);
  if (kind !== "designer") drawn.add("modifier");
  if (kind !== "country") drawn.add("available");
  if (kind === "designer") drawn.add("research_bonus");
  if (kind === "country") drawn.add("allowed_civil_war");
  if (mutate) mutate(box, drawn);

  const se = [];
  for (const k of ["allowed", "allowed_civil_war", "available", "research_bonus", "modifier", "equipment_bonus", "visible", "on_add"]) {
    if (box[k]) se.push(`${k} = {\n${box[k]}\n}`);
  }
  const picM = full.match(/^\s*picture\s*=\s*"?([A-Za-z0-9_.:-]+)"?(?:\s*#.*)?$/m);
  const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modPath: mod, ideaId: item.ideaId, targetRelativeFile: "common/ideas/probe.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: ed.localizedName || item.ideaId, desc: ed.localizedDesc || "",
      picture: picM ? picM[1] : (ed.pictureToken || ""),
      selectedEffects: se, mode: "edit", category: item.category,
      formSections: [...drawn],
      cost: ed.cost || "", removalCost: ed.removalCost || "", ledger: ed.ledger || "", traits: ed.traits || "",
    }),
  });
  return { status: r.status, body: await r.json() };
}

// Derive the corpus figure instead of typing it.
function countDuplicateSpirits() {
  const KEYS = ["allowed", "allowed_civil_war", "available", "research_bonus", "modifier", "equipment_bonus", "visible", "on_add"];
  const mask = (s) => {
    const a = s.split("");
    let inC = false, inS = false;
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
      out.push({ id: m[1], open: oo, close: cc }); re.lastIndex = cc;
    }
    return out;
  };
  let spirits = 0, dup = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, "common", "ideas");
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      let raw;
      try { raw = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
      const s = mask(raw);
      const im = /(?:^|[\s}])ideas[ \t]*=[ \t]*\{/.exec(s);
      if (!im) continue;
      const io = s.indexOf("{", im.index); const ic = brace(s, io);
      if (ic < 0) continue;
      for (const cat of kids(s, io, ic)) {
        for (const idea of kids(s, cat.open, cat.close)) {
          spirits++;
          const counts = new Map();
          for (const sec of kids(s, idea.open, idea.close)) counts.set(sec.id, (counts.get(sec.id) || 0) + 1);
          if (KEYS.some((k) => (counts.get(k) || 0) > 1)) dup++;
        }
      }
    }
  }
  return { spirits, dup, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    console.log("\n-- a spirit that declares a section more than once --");
    {
      const mod = mkMod(FIXTURE);
      const before = fileOf(mod);
      // ⭐ CONTROL: the fixture must really carry duplicates, or nothing below means anything.
      rec("CONTROL: the fixture declares on_add twice and equipment_bonus three times",
        sectionCount(before, "probe_twice", "on_add") === 2 && sectionCount(before, "probe_twice", "equipment_bonus") === 3,
        { on_add: sectionCount(before, "probe_twice", "on_add"), eq: sectionCount(before, "probe_twice", "equipment_bonus") });

      const r = await saveSpirit(mod, "probe_twice");
      rec("the save is accepted", r.status === 200 && r.body && r.body.ok, r);
      const after = fileOf(mod);
      rec("RUN: ⭐ both on_add blocks survive", sectionCount(after, "probe_twice", "on_add") === 2, sectionCount(after, "probe_twice", "on_add"));
      rec("RUN: ⭐ all three equipment_bonus blocks survive", sectionCount(after, "probe_twice", "equipment_bonus") === 3, sectionCount(after, "probe_twice", "equipment_bonus"));
      rec("RUN: ⭐ the gameplay effect in the SECOND on_add is still there",
        /block_defence_decrease\s*=\s*yes/.test(after), after);
      rec("RUN: the equipment in the 2nd and 3rd blocks is still there",
        /cas_equipment/.test(after) && /naval_bomber_equipment/.test(after), after);
      rec("RUN: nothing was duplicated — the single-copy sibling is untouched",
        sectionCount(after, "probe_once", "on_add") === 1, sectionCount(after, "probe_once", "on_add"));
    }

    console.log("\n-- control: a spirit with one copy is not given a second --");
    {
      const mod = mkMod(FIXTURE);
      const r = await saveSpirit(mod, "probe_once");
      const after = fileOf(mod);
      rec("the save is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("CONTROL: ⭐ on_add is still single", sectionCount(after, "probe_once", "on_add") === 1, sectionCount(after, "probe_once", "on_add"));
      rec("CONTROL: its effect is intact", /add_political_power\s*=\s*10/.test(after), after);
    }

    console.log("\n-- control: CLEARING the box still clears every copy --");
    {
      const mod = mkMod(FIXTURE);
      const r = await saveSpirit(mod, "probe_twice", (box, drawn) => {
        box.on_add = "";           // the user emptied the On-add box…
        drawn.add("on_add");       // …and the form definitely drew it
      });
      const after = fileOf(mod);
      rec("the save is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("CONTROL: ⭐ emptying the box removes ALL copies, not just the first",
        sectionCount(after, "probe_twice", "on_add") === 0, sectionCount(after, "probe_twice", "on_add"));
      rec("CONTROL: and the untouched equipment_bonus copies are still there",
        sectionCount(after, "probe_twice", "equipment_bonus") === 3, sectionCount(after, "probe_twice", "equipment_bonus"));
    }

    console.log("\n-- control: EDITING the box writes the edit and keeps the rest --");
    {
      const mod = mkMod(FIXTURE);
      const r = await saveSpirit(mod, "probe_twice", (box) => {
        box.on_add = "add_stability = 0.05";
      });
      const after = fileOf(mod);
      rec("the save is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("CONTROL: ⭐ the edit is written", /add_stability\s*=\s*0\.05/.test(after), after);
      rec("CONTROL: ⭐ and the copy the box never showed survives", /block_defence_decrease\s*=\s*yes/.test(after), after);
      rec("CONTROL: the box's original content is gone, replaced by the edit",
        !/probe_twice added/.test(after), after);
    }

    console.log("\n-- the corpora this came from --");
    const { spirits, dup, corpora } = countDuplicateSpirits();
    console.log("     " + dup + " of " + spirits + " spirits declare a duplicated section across " + corpora + " installed corpora");
    rec("CONTROL: the corpora really do carry this shape", corpora >= 1 && dup >= 20, { dup, spirits, corpora });

    if (!fs.existsSync(VAN_SWEDEN)) {
      rec("vanilla is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(VAN_SWEDEN, "utf8");
      rec("CONTROL: vanilla really ships four equipment_bonus blocks in one spirit",
        sectionCount(src, "SWE_let_fly_all_guns_idea", "equipment_bonus") === 4,
        sectionCount(src, "SWE_let_fly_all_guns_idea", "equipment_bonus"));
      const mod = mkMod(src);
      const r = await saveSpirit(mod, "SWE_let_fly_all_guns_idea");
      const after = fileOf(mod);
      rec("the real save is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("RUN: ⭐ all four survive a no-edit save",
        sectionCount(after, "SWE_let_fly_all_guns_idea", "equipment_bonus") === 4,
        sectionCount(after, "SWE_let_fly_all_guns_idea", "equipment_bonus"));
      // The six leaf assignments the collapse used to take.
      const leaves = (t) => (t.match(/instant\s*=\s*yes/g) || []).length;
      console.log("     `instant = yes` inside that spirit: file " + leaves(src) + " -> " + leaves(after));
      rec("RUN: not one leaf assignment was lost", leaves(after) === leaves(src), { before: leaves(src), after: leaves(after) });
    }

    rec("the fixture was measured whatever is installed", checks >= 15, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== spirit keeps every copy of a section: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
