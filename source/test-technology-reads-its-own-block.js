// #raw-block-wrong-depth — A TECHNOLOGY READ ANOTHER TECHNOLOGY'S BLOCK, AND A SAVE WROTE IT BACK.
//
// The technology reader locates a tech twice. collectTechBlocksFromText walks the body of
// `technologies = { … }` and tells a technology from a nested block — by INDENTATION (tabs <= 1,
// spaces <= 4) when this was written, by BRACE DEPTH since #tech-catalog-lists-nested-blocks, because
// Millennium Dawn nests blocks at a technology's indentation. rawBlockFor then re-finds the SAME tech
// in the un-stripped file text, to read the things the comment-stripped copy cannot give: inline notes,
// `modifier = { … }` text, the verbatim
// `enable_equipments`, and extraScript — the block that carries every key the model has no field for.
//
// rawBlockFor searched for the FIRST `<id> = {` at ANY indentation. But a technology id is very often
// also a SUBUNIT name, and a technology's subunit modifier blocks — `camelry = { soft_attack = 0.05 }` —
// are nested two tabs deep inside OTHER technologies, which usually appear earlier in the file.
//
// So the two locators disagreed about which block a technology is, and everything read through the raw
// one came from a stranger. Road to 56's `camelry` technology (infantry.txt line 3511) read its raw block
// from line 241 — a modifier block inside a different tech. Round-tripping that file through the two
// endpoints the Research maker actually uses:
//
//     enable_subunits = { camelry }   DELETED     — the technology stopped unlocking the subunit
//                                                   it exists to unlock
//     soft_attack = 0.05              INJECTED    — a stat the author never wrote on that tech
//
// A no-edit save. Both directions at once, silently, and reported ok.
//
// Measured across every installed corpus — vanilla, Millennium Dawn, Road to 56, Old World Blues,
// Rise of Nations, Novum Vexillum — 1 technology of 6,513 is mis-located today. Rare, but it is a
// landmine rather than a curiosity: naming a technology after the unit it unlocks is ordinary practice,
// and the reader gives no sign it happened.
//
// THE FIX IS TO MAKE THE TWO LOCATORS AGREE: rawBlockFor now applies collectTechBlocksFromText's own
// rule, whichever that is (see test-a-block-nested-in-a-technology-is-not-a-technology.js). Nothing
// catalogued can be excluded by it — a tech only entered the catalogue by passing that same rule — and this file asserts that, because a guard that rejects real blocks would
// silently cost every technology its comments instead.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const PORT = 53514;
const BASE = "http://127.0.0.1:" + PORT;
const R56_INF = "D:/SteamLibrary/steamapps/workshop/content/394360/820260968/common/technologies/infantry.txt";

// A file with the trap in it: the technology `probe_camel` is preceded by a nested block of the same
// name, two tabs deep, inside another technology. `keeps_notes` is an ordinary technology and exists to
// prove the raw-block guard does not reject normal blocks.
const FIXTURE = [
  "technologies = {",
  "",
  "\tprobe_parent = {",
  "",
  "\t\tprobe_camel = {",
  "\t\t\tsoft_attack = 0.05",
  "\t\t}",
  "",
  "\t\tresearch_cost = 2",
  "\t\tstart_year = 1936",
  "",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 0 y = 0 }",
  "\t\t}",
  "\t}",
  "",
  "\tprobe_camel = {",
  "",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "",
  "\t\tenable_subunits = {",
  "\t\t\tprobe_camel",
  "\t\t}",
  "",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 2 y = 0 }",
  "\t\t}",
  "\t}",
  "",
  "\tkeeps_notes = {",
  "",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "",
  "\t\ton_research_complete = { #keep this note",
  "\t\t\tcustom_effect_tooltip = probe_tt",
  "\t\t}",
  "",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 4 y = 0 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

function mkMod(text) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rawblk-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova raw block probe"\n');
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "common", "technologies", "probe.txt"), text, "utf8");
  return mod;
}
const readBack = (mod) => fs.readFileSync(path.join(mod, "common", "technologies", "probe.txt"), "utf8");

async function catalog(mod) {
  const r = await fetch(BASE + "/api/technologies/catalog?modPath=" + encodeURIComponent(mod) + "&lite=1");
  return r.json();
}
async function saveBack(mod, cat, mutate) {
  const mine = (cat.technologies || []).filter((t) => t && t.isMod);
  if (mutate) mutate(mine);
  const r = await fetch(BASE + "/api/technologies/save-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      technologies: mine,
      equipments: cat.equipments || {},
      customTabs: [],
      modPath: mod,
      countryTag: null,
      countryTechIds: null,
      deletions: [],
      newTechIds: [],
    }),
  });
  return r.json();
}

// The direct children of `technologies = { }`, by the indentation rule the reader used when this was written (it
// reads brace depth now). The fixture's probe_camel sits at the top level and two tabs deep, where the two agree.
function techBlockText(src, id) {
  const re = new RegExp("(?:^|\\n)([ \\t]*)" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*=[ \\t]*\\{", "g");
  let m;
  while ((m = re.exec(src)) !== null) {
    const ws = m[1] || "";
    if ((ws.match(/\t/g) || []).length > 1 || (ws.match(/ /g) || []).length > 4) continue;
    const open = m.index + m[0].length - 1;
    let d = 0, inC = false;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (inC) { if (c === "\n") inC = false; continue; }
      if (c === "#") { inC = true; continue; }
      if (c === "{") d++;
      else if (c === "}") { d--; if (!d) return src.slice(open + 1, i); }
    }
  }
  return null;
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  let corporaMeasured = 0;

  try {
    // ---------------------------------------------------------------- the fixture, end to end
    console.log("\n-- a technology whose id is also a nested block name --");
    {
      const mod = mkMod(FIXTURE);
      try {
        // ⭐ CONTROL: the fixture must actually contain the trap, or passing proves nothing. The
        // nested occurrence has to come FIRST — that is the whole bug.
        const firstNested = FIXTURE.indexOf("\t\tprobe_camel = {");
        const realTech = FIXTURE.indexOf("\n\tprobe_camel = {");
        rec("CONTROL: the fixture's nested block really does come before the technology",
          firstNested !== -1 && realTech !== -1 && firstNested < realTech, { firstNested, realTech });

        const cat = await catalog(mod);
        const camel = (cat.technologies || []).find((t) => t.id === "probe_camel");
        const notes = (cat.technologies || []).find((t) => t.id === "keeps_notes");
        rec("the technology is in the catalogue", !!camel, Object.keys(cat));
        rec("READ: it carries its OWN extraScript", !!camel && /enable_subunits/.test(camel.extraScript || ""), camel && camel.extraScript);
        rec("READ: ⭐ it did not take the stranger's modifier", !!camel && !/soft_attack/.test(camel.extraScript || ""), camel && camel.extraScript);

        // The indentation guard must not reject ordinary blocks: this tech's note lives in extraScript,
        // which only exists when rawBlockFor found the block at all.
        rec("READ: an ordinary technology still finds its raw block", !!notes && /keep this note/.test(notes.extraScript || ""), notes && notes.extraScript);

        await saveBack(mod, cat);
        const after = readBack(mod);
        const camelAfter = techBlockText(after, "probe_camel");
        rec("SAVE: the technology survives the round trip", !!camelAfter, after.slice(0, 200));
        rec("SAVE: ⭐ enable_subunits is still there", !!camelAfter && /enable_subunits/.test(camelAfter) && /probe_camel/.test(camelAfter), camelAfter);
        rec("SAVE: ⭐ no stat was injected into it", !!camelAfter && !/soft_attack/.test(camelAfter), camelAfter);
        rec("SAVE: the stranger keeps its own modifier block",
          /probe_parent[\s\S]*?soft_attack\s*=\s*0\.05/.test(after), after.slice(0, 400));
        rec("SAVE: the ordinary technology keeps its note", /keep this note/.test(after), after.slice(0, 400));
      } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
    }

    // ---------------------------------------------------------------- a real edit still lands
    console.log("\n-- control: an edit is still written --");
    {
      const mod = mkMod(FIXTURE);
      try {
        const cat = await catalog(mod);
        await saveBack(mod, cat, (mine) => {
          const c = mine.find((t) => t.id === "probe_camel");
          if (c) { c.researchCost = 7; c.researchCostRaw = undefined; }
        });
        const blk = techBlockText(readBack(mod), "probe_camel");
        rec("CONTROL: a changed research_cost is written", !!blk && /research_cost\s*=\s*7\b/.test(blk), blk);
        rec("CONTROL: and the edit did not cost it enable_subunits", !!blk && /enable_subunits/.test(blk), blk);
      } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
    }

    // ---------------------------------------------------------------- the real file this came from
    console.log("\n-- Road to 56, the corpus this was found in --");
    if (!fs.existsSync(R56_INF)) {
      rec("Road to 56 is not installed — that corpus check is skipped", true, "");
    } else {
      corporaMeasured++;
      const src = fs.readFileSync(R56_INF, "utf8");
      // ⭐ CONTROL: assert the corpus really has the shape the fixture models.
      const nested = /\n\t\tcamelry[ \t]*=[ \t]*\{/.exec(src);
      const tech = /\n\tcamelry[ \t]*=[ \t]*\{/.exec(src);
      rec("CONTROL: Road to 56 really does name a technology after a subunit it modifies",
        !!nested && !!tech && nested.index < tech.index, { nested: nested && nested.index, tech: tech && tech.index });

      const mod = mkMod(src);
      try {
        const cat = await catalog(mod);
        const camel = (cat.technologies || []).find((t) => t.id === "camelry");
        rec("the real technology is read", !!camel, "");
        rec("RUN: ⭐ camelry keeps enable_subunits", !!camel && /enable_subunits/.test(camel.extraScript || ""), camel && camel.extraScript);
        rec("RUN: ⭐ camelry is not given soft_attack", !!camel && !/soft_attack/.test(camel.extraScript || ""), camel && camel.extraScript);

        // And no OTHER technology in that file lost its raw block to the new guard: every tech that has
        // an extraScript-bearing key in its own block must still report one.
        let expected = 0, got = 0;
        for (const t of (cat.technologies || []).filter((t) => t.isMod)) {
          const own = techBlockText(src, t.id);
          if (!own) continue;
          if (!/on_research_complete|enable_subunits|equipment_bonus|enable_equipment_modules/.test(own)) continue;
          expected++;
          if (String(t.extraScript || "").trim()) got++;
        }
        console.log("     " + (cat.technologies || []).filter((t) => t.isMod).length + " technologies · " + expected + " carry an extraScript-bearing block");
        rec("the file really does exercise this", expected >= 10, expected);
        rec("RUN: ⭐ every one of them still found its raw block", got === expected, { expected, got });
      } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
    }

    // A skip must not read as a pass: the fixture checks always run, so require them to have run.
    rec("the fixture was measured whatever is installed", checks >= 12, checks);
    console.log("     corpora measured: " + corporaMeasured);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
  }

  console.log("\n=== technology reads its own block: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
