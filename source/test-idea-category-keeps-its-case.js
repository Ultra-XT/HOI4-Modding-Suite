// #category-case-forces-a-move — SAVING A SPIRIT MOVED IT OUT OF ITS OWN CATEGORY.
//
// /api/ideas/upsert-definition reads the category as `String(...).trim().toLowerCase()`. Downstream,
// upsertIdeaDefinitionInIdeasFile decides whether the user changed the spirit's SLOT by comparing that
// value against the category the block is actually in:
//
//     if (hadIdea && wantCat && nowCat && wantCat !== nowCat) { …move the block… }
//
// `nowCat` is the file's own spelling. So for any category a modder capitalised, those two differ on
// EVERY save, and a save with no edit at all was read as a slot change: the spirit was cut out of its
// container and re-added to a second, lower-case container appended to the file. The move path then
// called ensureDesignerFlagInCategoryBlock without the isDesignerIdeaCategory gate its own comment says
// callers apply — so the new container was also stamped `designer = yes`.
//
// Measured across the six installed corpora: 8 idea categories are written in mixed case, 7 of them in
// Millennium Dawn — Military_Spending, Conscription_Law, Military_Status_Women,
// Foreign_Intervention_Law, Officer_Training_Law, Nuclear_Status, Nuclear_Stance — plus RON_Era in Rise
// of Nations. Those seven are Millennium Dawn's LAW system, not an obscure corner of it.
//
// Driving one no-edit save of `defence_00` through the endpoints the Ideas page actually uses, with the
// payload assembled the way public/ideas.js assembles it:
//
//     Military_Spending blocks   1 -> 1      the law group kept its name…
//     military_spending blocks   0 -> 1      …and a second container appeared beside it
//     designer = yes                         stamped onto a `law = yes` container
//
// with `defence_00` now living in the new one, out of the law group it belongs to.
//
// The comparison now folds case, and the move path gates the designer flag like every other caller. The
// controls below are the point of this file: an identical run against the SAME file with the category
// lower-cased must produce the SAME result — if the two runs ever diverge again, the case is deciding
// something — and a REAL slot change must still move the block, or the fix has simply disabled the
// feature that comparison exists for.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-catcase-"));
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

const PORT = 53533;
const BASE = "http://127.0.0.1:" + PORT;
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";

// A compact file with the same shape: a capitalised, non-designer container holding two spirits.
const FIXTURE = [
  "ideas = {",
  "\tProbe_Law_Group = {",
  "\t\tlaw = yes",
  "\t\tuse_list_view = yes",
  "",
  "\t\tprobe_level_one = {",
  "\t\t\tlevel = 1",
  "\t\t\tremoval_cost = -1",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tmodifier = {",
  "\t\t\t\tconscription_factor = -1.00",
  "\t\t\t}",
  "\t\t}",
  "",
  "\t\tprobe_level_two = {",
  "\t\t\tlevel = 2",
  "\t\t\tremoval_cost = -1",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tmodifier = {",
  "\t\t\t\tconscription_factor = -0.50",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// ---- mirrors of public/ideas.js, so the payload is the one the page sends ----
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

const blockCount = (t, name) =>
  (t.match(new RegExp("(?:^|[\\s}])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*=[ \\t]*\\{", "g")) || []).length;

let modSeq = 0;
function mkMod(text) {
  const mod = path.join(ROOT, "mod" + (++modSeq));
  fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova category case"\n');
  fs.writeFileSync(path.join(mod, "common", "ideas", "probe.txt"), text, "utf8");
  return mod;
}
const fileOf = (mod) => fs.readFileSync(path.join(mod, "common", "ideas", "probe.txt"), "utf8");

async function catalogOf(mod) {
  const q = encodeURIComponent(mod);
  return fetch(`${BASE}/api/ideas/catalog?includeVanilla=0&includeWorkshop=0&includeActiveMod=1&includeModsRoot=0&sourcePath=${q}&modPath=${q}`).then((r) => r.json());
}

// One no-edit save of `ideaId`, with the payload the page builds. `overrideCategory` simulates the user
// picking a different slot in the dropdown.
async function saveIdea(mod, ideaId, overrideCategory) {
  const cat = await catalogOf(mod);
  const item = (cat.items || []).find((i) => i.ideaId === ideaId);
  if (!item) return { error: "not in catalogue", items: (cat.items || []).map((i) => i.ideaId) };
  const defFile = item.definitionFile;
  const srcRoot = item.sourceRoot || mod;
  const ed = await fetch(`${BASE}/api/ideas/edit-payload?ideaId=${item.ideaId}&definitionFile=${encodeURIComponent(defFile)}&sourceRoot=${encodeURIComponent(srcRoot)}`).then((r) => r.json());
  const blk = await fetch(`${BASE}/api/ideas/entry-block?ideaId=${item.ideaId}&definitionFile=${encodeURIComponent(defFile)}&sourceRoot=${encodeURIComponent(srcRoot)}`).then((r) => r.json());
  const full = blk.blockText || "";
  const sendCat = overrideCategory || item.category;
  const kind = categoryKind(sendCat);

  const allowed = extractBraceBlock(full, "allowed") || "always = yes";
  const allowedCivilWar = kind === "country" ? extractBraceBlock(full, "allowed_civil_war") : "";
  const available = extractBraceBlock(full, "available");
  const researchBonus = kind === "designer" ? extractBraceBlock(full, "research_bonus") : "";
  const modifiers = extractBraceBlock(full, "modifier");
  const equipment = extractBraceBlock(full, "equipment_bonus");
  const visible = extractBraceBlock(full, "visible");
  const onAdd = extractBraceBlock(full, "on_add");
  const picM = full.match(/^\s*picture\s*=\s*"?([A-Za-z0-9_.:-]+)"?(?:\s*#.*)?$/m);

  const selectedEffects = [];
  if (allowed) selectedEffects.push(`allowed = {\n${allowed}\n}`);
  if (allowedCivilWar) selectedEffects.push(`allowed_civil_war = {\n${allowedCivilWar}\n}`);
  if (available) selectedEffects.push(`available = {\n${available}\n}`);
  if (researchBonus) selectedEffects.push(`research_bonus = {\n${researchBonus}\n}`);
  if (modifiers && kind !== "designer") selectedEffects.push(`modifier = {\n${modifiers}\n}`);
  if (equipment) selectedEffects.push(`equipment_bonus = {\n${equipment}\n}`);
  if (visible) selectedEffects.push(`visible = {\n${visible}\n}`);
  if (onAdd) selectedEffects.push(`on_add = {\n${onAdd}\n}`);

  const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modPath: mod, ideaId: item.ideaId, targetRelativeFile: "common/ideas/probe.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: ed.localizedName || item.ideaId, desc: ed.localizedDesc || "",
      picture: picM ? picM[1] : (ed.pictureToken || ""),
      selectedEffects, mode: "edit", category: sendCat,
      // The page names the boxes it DREW for this kind, so a section it never showed is not read as "the
      // user emptied it" (#spirit-save-deletes-hidden-blocks). Leaving this out is exactly how a probe
      // deletes allowed_civil_war and then reports it as a Nova defect — send what the client sends.
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
  return { status: r.status, body: await r.json(), category: item.category };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  let corpusMeasured = false;

  try {
    // -------------------------------------------------- the fixture, and its lower-case twin
    console.log("\n-- a capitalised category, saved with no edit --");
    const modA = mkMod(FIXTURE);
    const modB = mkMod(FIXTURE.replace(/Probe_Law_Group/g, "probe_law_group"));

    // ⭐ CONTROL: the fixture must actually be mixed case, or it tests nothing.
    rec("CONTROL: the fixture's category really is capitalised",
      /Probe_Law_Group/.test(FIXTURE) && !/probe_law_group/.test(FIXTURE), "");

    const beforeA = fileOf(modA), beforeB = fileOf(modB);
    const rA = await saveIdea(modA, "probe_level_one");
    const rB = await saveIdea(modB, "probe_level_one");
    rec("the capitalised save is accepted", rA.status === 200 && rA.body && rA.body.ok, rA);
    rec("the lower-case save is accepted", rB.status === 200 && rB.body && rB.body.ok, rB);
    rec("the catalogue reported the author's spelling", rA.category === "Probe_Law_Group", rA.category);

    const afterA = fileOf(modA), afterB = fileOf(modB);
    rec("RUN: ⭐ the category is not duplicated", blockCount(afterA, "Probe_Law_Group") === 1, {
      capitalised: blockCount(afterA, "Probe_Law_Group"), lowered: blockCount(afterA, "probe_law_group"),
    });
    rec("RUN: ⭐ no second, lower-case container appeared", blockCount(afterA, "probe_law_group") === 0, afterA.slice(-400));
    rec("RUN: ⭐ the spirit is still inside its own category",
      /Probe_Law_Group\s*=\s*\{[\s\S]*probe_level_one\s*=\s*\{/.test(afterA), afterA.slice(0, 300));
    rec("RUN: ⭐ a law container was not stamped `designer = yes`", !/designer\s*=\s*yes/.test(afterA), afterA.slice(-400));
    rec("the sibling spirit was left alone", /probe_level_two\s*=\s*\{/.test(afterA), "");

    // ⭐ THE CONTROL THAT MATTERS: case must decide nothing. Compare the two runs with the name folded out.
    const foldA = afterA.replace(/Probe_Law_Group/g, "X").replace(/probe_law_group/g, "X");
    const foldB = afterB.replace(/Probe_Law_Group/g, "X").replace(/probe_law_group/g, "X");
    rec("CONTROL: ⭐ the capitalised run and the lower-case run agree exactly",
      foldA === foldB, { lenA: afterA.length, lenB: afterB.length, deltaA: afterA.length - beforeA.length, deltaB: afterB.length - beforeB.length });

    // -------------------------------------------------- a REAL slot change must still move the block
    console.log("\n-- control: a real slot change still moves the spirit --");
    {
      const mod = mkMod(FIXTURE);
      const before = fileOf(mod);
      const r = await saveIdea(mod, "probe_level_one", "country");
      const after = fileOf(mod);
      rec("the slot change is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("CONTROL: ⭐ a genuine slot change still creates the target container",
        blockCount(after, "country") === 1, { country: blockCount(after, "country"), before: blockCount(before, "country") });
      rec("CONTROL: ⭐ and the spirit really moved into it",
        /country\s*=\s*\{[\s\S]*probe_level_one\s*=\s*\{/.test(after), after.slice(0, 500));
      rec("CONTROL: moving into a non-designer slot does not stamp `designer = yes`",
        !/designer\s*=\s*yes/.test(after), after.slice(-400));
    }

    // -------------------------------------------------- a designer slot still gets its flag
    console.log("\n-- control: a designer slot still gets designer = yes --");
    {
      const mod = mkMod(FIXTURE);
      const r = await saveIdea(mod, "probe_level_one", "tank_manufacturer");
      const after = fileOf(mod);
      rec("the designer slot change is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec("CONTROL: ⭐ a designer container is still flagged", /designer\s*=\s*yes/.test(after), after.slice(0, 600));
    }

    // -------------------------------------------------- the corpus this came from
    // ⚠️ MOVED 2026-09-11. This ran on Millennium Dawn's AA_law_military_ideas.txt, whose law groups were written
    // Military_Spending, Conscription_Law, …. The owner reinstalled MD and the fresh copy lower-cases every one of
    // them (`military_spending = {`), so "CONTROL: Millennium Dawn really does capitalise a law category" failed
    // and the run beneath it measured a file without the shape. Rather than name a file, the installed maps are
    // ASKED for the first ideas file holding a mixed-case category with a spirit in it — Millennium Dawn first,
    // then the rest of the workshop folder in order — and the same no-edit save runs on a copy of that file.
    const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // The first category of a top-level `ideas = { … }` whose name carries a capital, with its first spirit —
    // by brace depth, comments masked, so a nested block or a commented-out line cannot pose as either.
    const mixedCaseCategoryIn = (text) => {
      const t = String(text).replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
      const re = /([A-Za-z0-9_.\-]+)[ \t]*=[ \t]*\{|\{|\}/g;
      let depth = 0, inIdeas = false, cat = null, m;
      while ((m = re.exec(t)) !== null) {
        if (m[0] === "}") {
          depth--;
          if (depth === 1) cat = null;
          if (depth <= 0) { depth = 0; inIdeas = false; }
          continue;
        }
        if (m[0] !== "{") {
          if (depth === 0) inIdeas = m[1] === "ideas";
          else if (depth === 1 && inIdeas) cat = /[A-Z]/.test(m[1]) ? m[1] : null;
          else if (depth === 2 && inIdeas && cat) return { category: cat, spirit: m[1] };
        }
        depth++;
      }
      return null;
    };
    const WORKSHOP = path.dirname(MD);
    let SRC = null, shape = null;
    {
      let others = [];
      // Never Road to 56 (820260968): its workshop copy carries files a Nova session wrote into it on 2026-07-19, so
      // a shape found there could be Nova's own writing rather than a mod author's.
      const R56 = path.join(WORKSHOP, "820260968");
      try { others = fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => d !== MD && d !== R56).sort(); } catch (_) {}
      for (const root of [MD].concat(others)) {
        let files = [];
        try { files = fs.readdirSync(path.join(root, "common", "ideas")).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { continue; }
        for (const f of files) {
          let text = "";
          try { text = fs.readFileSync(path.join(root, "common", "ideas", f), "utf8"); } catch (_) { continue; }
          const hit = mixedCaseCategoryIn(text);
          if (hit) { SRC = path.join(root, "common", "ideas", f); shape = hit; break; }
        }
        if (SRC) break;
      }
    }
    console.log("\n-- a real ideas file with a capitalised category --");
    if (!SRC) {
      console.log("     SKIPPED — no installed map ships a mixed-case idea category; only the fixture above shows the fix");
    } else {
      corpusMeasured = true;
      const CAT = shape.category, SPIRIT = shape.spirit;
      console.log(`     ${path.relative(WORKSHOP, SRC)}: category ${CAT}, spirit ${SPIRIT}`);
      const src = fs.readFileSync(SRC, "utf8");
      // ⭐ CONTROL: the corpus really carries the shape.
      rec(`CONTROL: the installed file really does capitalise a category (${CAT})`,
        CAT !== CAT.toLowerCase() && blockCount(src, CAT) >= 1, CAT);
      const mod = mkMod(src);
      const before = fileOf(mod);
      const r = await saveIdea(mod, SPIRIT);
      const after = fileOf(mod);
      console.log("     " + before.length + " -> " + after.length + " bytes");
      rec("the real save is accepted", r.status === 200 && r.body && r.body.ok, r);
      rec(`RUN: ⭐ ${CAT} is not duplicated`, blockCount(after, CAT) === blockCount(before, CAT),
        { before: blockCount(before, CAT), after: blockCount(after, CAT) });
      rec("RUN: ⭐ no lower-case twin was appended", blockCount(after, CAT.toLowerCase()) === blockCount(before, CAT.toLowerCase()),
        { before: blockCount(before, CAT.toLowerCase()), after: blockCount(after, CAT.toLowerCase()) });
      rec(`RUN: ⭐ ${SPIRIT} is still inside ${CAT}`,
        new RegExp("(?:^|\\n)[ \\t]*" + escRe(SPIRIT) + "[ \\t]*=[ \\t]*\\{").test(extractBraceBlock(after, CAT)), "");
      rec("RUN: the category was not marked as a designer",
        !new RegExp(escRe(CAT) + "[\\s\\S]{0,200}designer\\s*=\\s*yes", "i").test(after), "");
    }

    rec("the fixture was measured whatever is installed", checks >= 15, checks);
    console.log("     corpus measured: " + corpusMeasured);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== idea category keeps its case: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
