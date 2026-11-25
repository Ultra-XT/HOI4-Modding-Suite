// #idea-scalar-note-deleted + #idea-save-mixes-line-endings — TWO THINGS A NO-EDIT SPIRIT SAVE DID TO A
// FILE IT WAS ASKED TO LEAVE ALONE.
//
// Found by round-tripping real ideas files through the endpoints the Ideas page actually uses —
// /api/ideas/catalog, /api/ideas/edit-payload, /api/ideas/entry-block, /api/ideas/upsert-definition —
// with the payload public/ideas.js assembles, formSections included.
//
// (1) THE NOTE ON A VALUE LINE. mergePictureIntoIdeaBlock and mergeKeysIntoIdeaBlock rebuild
//     `picture` / `cost` / `removal_cost` from the model and replace the line to its end, so the note the
//     modder left on it went with it:
//
//         picture = berna #SWI_berna #latter is vanillas icon, which seems improvised …   ->  picture = berna
//         cost = 150 #was 300                                                              ->  cost = 150
//         removal_cost = -1 # Or make removable, with high cost?                           ->  removal_cost = -1
//
//     Measured across all six installed corpora: 171 such notes — 150 on picture, 15 on cost, 6 on
//     removal_cost. `name` is NOT rewritten this way and keeps its note, which is the natural control:
//     vanilla's ITA_hidden_research_penalties_ns carries a note on BOTH, and only the picture one died.
//
//     The same shape, found by grepping the pattern rather than the symptom, is in the decision-category
//     icon writer — `icon = <sprite>` replaced to end of line, 24 annotated icon lines in the corpora.
//     That path is live: public/decisions.js:1801 sends `categoryIcon` on EVERY decision save.
//
//     The technology writer already keeps these (scalarComments + noteT). This is that mechanism for the
//     other two makers. A note is preserved even when the value CHANGES: the editor has no box for it, so
//     a modder who lost it could not put it back, while a note left beside a changed value is at least
//     visible and editable.
//
// (2) THE LINE ENDINGS. Every section writer emits "\n". Saving ONE spirit in a CRLF file left the lines
//     it rewrote LF and every other line CRLF — one no-edit save of SWI_Berna turned 21 of Road to 56's
//     switzerland.txt lines into lone LF. That is a 21-line diff the modder did not make. Normalised at
//     the single point that writes the file, from the file's OWN ending.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-note-"));
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

const PORT = 53551;
const BASE = "http://127.0.0.1:" + PORT;
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];
const R56_SWI = W + "820260968/common/ideas/switzerland.txt";
const MD_LAWS = W + "2777392649/common/ideas/AA_law_military_ideas.txt";

// A spirit carrying a note on each of the three rewritten keys, plus one on `name` as the control.
const FIXTURE_LINES = [
  "ideas = {",
  "\tpolitical_advisor = {",
  "",
  "\t\tprobe_minister = {",
  "\t\t\tname = PROBE_minister_name #keep: name is not rewritten, so this one must survive too",
  "\t\t\tpicture = probe_face #Marijn_TODO Request unique icon?",
  "\t\t\tcost = 150 #was 300",
  "\t\t\tremoval_cost = -1 # Or make removable, with high cost?",
  "\t\t\tallowed = { always = yes }",
  "\t\t\ttraits = { probe_trait }",
  "\t\t}",
  "\t}",
  "}",
  "",
];
const FIXTURE_LF = FIXTURE_LINES.join("\n");
const FIXTURE_CRLF = FIXTURE_LINES.join("\r\n");

// ---- mirrors of public/ideas.js so the payload is the one the page sends ----
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
function mkIdeasMod(text) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova note"\n');
  fs.writeFileSync(path.join(mod, "common", "ideas", "probe.txt"), text, "utf8");
  return mod;
}
const ideasFileOf = (mod) => fs.readFileSync(path.join(mod, "common", "ideas", "probe.txt"), "utf8");
const eolStats = (t) => {
  const crlf = (t.match(/\r\n/g) || []).length;
  return { crlf, lf: (t.match(/\n/g) || []).length - crlf };
};

// One no-edit save of `ideaId`, exactly as the page would send it. `overridePicture` simulates the user
// typing a different icon into the Picture box.
async function saveSpirit(mod, ideaId, overridePicture) {
  const q = encodeURIComponent(mod);
  const cat = await fetch(`${BASE}/api/ideas/catalog?includeVanilla=0&includeWorkshop=0&includeActiveMod=1&includeModsRoot=0&sourcePath=${q}&modPath=${q}`).then((r) => r.json());
  const item = (cat.items || []).find((i) => i.ideaId === ideaId);
  if (!item) return { error: "not in catalogue", have: (cat.items || []).map((i) => i.ideaId) };
  const sr = encodeURIComponent(item.sourceRoot || mod);
  const df = encodeURIComponent(item.definitionFile);
  const ed = await fetch(`${BASE}/api/ideas/edit-payload?ideaId=${item.ideaId}&definitionFile=${df}&sourceRoot=${sr}`).then((r) => r.json());
  const blk = await fetch(`${BASE}/api/ideas/entry-block?ideaId=${item.ideaId}&definitionFile=${df}&sourceRoot=${sr}`).then((r) => r.json());
  const full = blk.blockText || "";
  const kind = categoryKind(item.category);
  const se = [];
  const push = (k, v) => { if (v) se.push(`${k} = {\n${v}\n}`); };
  push("allowed", extractBraceBlock(full, "allowed") || "always = yes");
  if (kind === "country") push("allowed_civil_war", extractBraceBlock(full, "allowed_civil_war"));
  push("available", extractBraceBlock(full, "available"));
  if (kind === "designer") push("research_bonus", extractBraceBlock(full, "research_bonus"));
  if (kind !== "designer") push("modifier", extractBraceBlock(full, "modifier"));
  push("equipment_bonus", extractBraceBlock(full, "equipment_bonus"));
  push("visible", extractBraceBlock(full, "visible"));
  push("on_add", extractBraceBlock(full, "on_add"));
  // The page's own picture regex — it stops at the token, so the note is never in the box.
  const picM = full.match(/^\s*picture\s*=\s*"?([A-Za-z0-9_.:-]+)"?(?:\s*#.*)?$/m);
  const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modPath: mod, ideaId: item.ideaId, targetRelativeFile: "common/ideas/probe.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: ed.localizedName || item.ideaId, desc: ed.localizedDesc || "",
      picture: overridePicture || (picM ? picM[1] : (ed.pictureToken || "")),
      selectedEffects: se, mode: "edit", category: item.category,
      formSections: [
        "allowed", "equipment_bonus", "visible", "on_add",
        ...(kind === "designer" ? [] : ["modifier"]),
        ...(kind === "country" ? [] : ["available"]),
        ...(kind === "designer" ? ["research_bonus"] : []),
        ...(kind === "country" ? ["allowed_civil_war"] : []),
      ],
      cost: ed.cost || "", removalCost: ed.removalCost || "", ledger: ed.ledger || "", traits: ed.traits || "",
    }),
  });
  return { status: r.status, body: await r.json() };
}

// Derive the corpus count rather than typing it in.
function countAnnotatedScalars() {
  const KEYS = new Set(["picture", "cost", "removal_cost"]);
  let total = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, "common", "ideas");
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      let raw;
      try { raw = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
      // split on /\r?\n/: a trailing \r is a line terminator to JS regex, so `#.+$` silently fails on
      // every CRLF file — that mistake halved this count the first time it was measured.
      for (const line of raw.split(/\r?\n/)) {
        const m = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*("[^"]*"|[^\s{}#]+)[ \t]*(#.+)$/.exec(line);
        if (m && KEYS.has(m[1])) total++;
      }
    }
  }
  return { total, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    // ---------------------------------------------------------------- the fixture
    console.log("\n-- a spirit whose value lines carry notes --");
    {
      const mod = mkIdeasMod(FIXTURE_LF);
      const before = ideasFileOf(mod);
      // ⭐ CONTROL: the fixture must really carry all four notes.
      rec("CONTROL: the fixture carries a note on name, picture, cost and removal_cost",
        (before.match(/#/g) || []).length === 4, (before.match(/#[^\n]*/g) || []));

      const r = await saveSpirit(mod, "probe_minister");
      rec("the save is accepted", r.status === 200 && r.body && r.body.ok, r);
      const after = ideasFileOf(mod);
      rec("RUN: ⭐ the note on picture survives", /picture = probe_face[ \t]*#Marijn_TODO Request unique icon\?/.test(after), after);
      rec("RUN: ⭐ the note on cost survives", /cost = 150[ \t]*#was 300/.test(after), after);
      rec("RUN: ⭐ the note on removal_cost survives", /removal_cost = -1[ \t]*# Or make removable, with high cost\?/.test(after), after);
      rec("CONTROL: the note on name — never rewritten — survives too",
        /name = PROBE_minister_name[ \t]*#keep/.test(after), after);
      rec("RUN: not one of the four notes was lost", (after.match(/#/g) || []).length === 4, (after.match(/#[^\n]*/g) || []));
      rec("the values themselves are unchanged",
        /picture = probe_face\b/.test(after) && /cost = 150\b/.test(after) && /removal_cost = -1\b/.test(after), after);
    }

    // ---------------------------------------------------------------- a changed value still writes
    console.log("\n-- control: changing the picture still changes it --");
    {
      const mod = mkIdeasMod(FIXTURE_LF);
      const r = await saveSpirit(mod, "probe_minister", "different_face");
      const after = ideasFileOf(mod);
      rec("the save is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("CONTROL: ⭐ the new picture is written", /picture = different_face/.test(after), after);
      rec("CONTROL: the old value is gone", !/picture = probe_face/.test(after), after);
      rec("CONTROL: and the note is still beside it", /picture = different_face[ \t]*#Marijn_TODO/.test(after), after);
    }

    // ---------------------------------------------------------------- line endings
    console.log("\n-- the file's own line endings --");
    {
      const modC = mkIdeasMod(FIXTURE_CRLF);
      const beforeC = eolStats(ideasFileOf(modC));
      rec("CONTROL: the CRLF fixture really is all CRLF", beforeC.lf === 0 && beforeC.crlf > 5, beforeC);
      await saveSpirit(modC, "probe_minister");
      const afterC = eolStats(ideasFileOf(modC));
      rec("RUN: ⭐ a CRLF file stays all CRLF", afterC.lf === 0, { before: beforeC, after: afterC });

      const modL = mkIdeasMod(FIXTURE_LF);
      await saveSpirit(modL, "probe_minister");
      const afterL = eolStats(ideasFileOf(modL));
      rec("CONTROL: ⭐ an LF file is not converted to CRLF", afterL.crlf === 0, afterL);
    }

    // ---------------------------------------------------------------- the decision-category icon
    console.log("\n-- the same shape in the decision-category icon writer --");
    {
      const mod = path.join(ROOT, "dec" + (++seq));
      fs.mkdirSync(path.join(mod, "common", "decisions", "categories"), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova note"\n');
      const catFile = path.join(mod, "common", "decisions", "categories", "probe_categories.txt");
      const catText = [
        "probe_category = {",
        "\ticon = GFX_decision_category_old #the art brief lives here — do not lose this line",
        "}",
        "",
      ].join("\n");
      fs.writeFileSync(catFile, catText, "utf8");
      rec("CONTROL: the category file really carries a note on its icon line",
        /icon = GFX_decision_category_old[ \t]*#/.test(fs.readFileSync(catFile, "utf8")), "");

      const r = await fetch(`${BASE}/api/decisions/define-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The live caller is /api/decisions/save, which sends categoryIcon on EVERY save
        // (public/decisions.js:1801); this route reaches the same ensureDecisionCategoryDefined branch.
        body: JSON.stringify({ modPath: mod, categoryId: "probe_category", categoryIcon: "GFX_decision_category_new" }),
      });
      const body = await r.json();
      const after = fs.readFileSync(catFile, "utf8");
      rec("the category call is accepted", r.status === 200 && !body.error, body);
      rec("RUN: ⭐ the icon was retargeted", /icon = GFX_decision_category_new/.test(after), after);
      rec("RUN: ⭐ and its note survived", /icon = GFX_decision_category_new[ \t]*#the art brief lives here/.test(after), after);
    }

    // ---------------------------------------------------------------- the corpora this came from
    console.log("\n-- the real files --");
    const { total, corpora } = countAnnotatedScalars();
    console.log("     " + total + " annotated picture/cost/removal_cost lines across " + corpora + " installed corpora");
    rec("CONTROL: the corpora really do carry these notes in quantity", corpora >= 1 && total >= 50, { total, corpora });

    if (!fs.existsSync(R56_SWI)) {
      rec("Road to 56 is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(R56_SWI, "utf8");
      rec("CONTROL: switzerland.txt really carries the note and really is CRLF",
        /picture = berna[ \t]*#SWI_berna/.test(src) && eolStats(src).lf === 0, eolStats(src));
      const mod = mkIdeasMod(src);
      const b = eolStats(ideasFileOf(mod));
      const r = await saveSpirit(mod, "SWI_Berna");
      const after = ideasFileOf(mod);
      const a = eolStats(after);
      console.log("     switzerland.txt  CRLF " + b.crlf + "/LF " + b.lf + "  ->  CRLF " + a.crlf + "/LF " + a.lf);
      rec("the real save is accepted", r.status === 200 && r.body && r.body.ok, r);
      // COUNT them. switzerland.txt carries `picture = berna #SWI_berna …` TWICE, so asserting the string
      // is still present passed even when the saved spirit's copy had been deleted — the other one matched.
      const annotated = (t) => (t.match(/picture = berna[ \t]*#SWI_berna/g) || []).length;
      console.log("     `picture = berna #SWI_berna` lines: " + annotated(src) + " -> " + annotated(after));
      rec("CONTROL: that note really appears more than once, so a bare match proves nothing", annotated(src) === 2, annotated(src));
      rec("RUN: ⭐ SWI_Berna keeps its picture note", annotated(after) === annotated(src), { before: annotated(src), after: annotated(after) });
      rec("RUN: ⭐ and the file gains no lone LF", a.lf === 0, { before: b, after: a });
    }

    if (!fs.existsSync(MD_LAWS)) {
      rec("Millennium Dawn is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(MD_LAWS, "utf8");
      rec("CONTROL: Millennium Dawn really annotates a cost", /cost = 150[ \t]*#was 300/.test(src), "");
      const mod = mkIdeasMod(src);
      const r = await saveSpirit(mod, "no_military");
      const after = ideasFileOf(mod);
      rec("the real save is accepted", r.status === 200 && r.body && r.body.ok, r);
      // Counted, not matched — this note also appears twice in that file.
      const annotated = (t) => (t.match(/cost = 150[ \t]*#was 300/g) || []).length;
      console.log("     `cost = 150 #was 300` lines: " + annotated(src) + " -> " + annotated(after));
      rec("CONTROL: that note really appears more than once", annotated(src) >= 2, annotated(src));
      rec("RUN: ⭐ no_military keeps `cost = 150 #was 300`", annotated(after) === annotated(src), { before: annotated(src), after: annotated(after) });
    }

    rec("the fixture was measured whatever is installed", checks >= 18, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== spirit save keeps the note on a value: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
