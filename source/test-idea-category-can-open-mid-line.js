// #category-opens-mid-line — A CATEGORY THAT OPENS AFTER A `}` ON THE SAME LINE WAS INVISIBLE.
//
// HOI4 script has no statement separator: `} aircraft_manufacturer = {` is exactly as valid as putting
// the key on its own line. Every block locator in the ideas reader was anchored at `(^|\n)\s*`, which
// cannot match a key whose line begins with the previous block's closing brace.
//
// The consequence is not that the category is skipped — it is that the scan walks INTO it. The container
// loop advances past each container it recognises; one it cannot see is never stepped over, so the ideas
// inside it are read as containers of their own. Road to 56's china_shared.txt (line 1002,
// `\t}\taircraft_manufacturer = { #`) came back as:
//
//     aircraft_manufacturer          absent from the category list
//     CHI_camco_1                    listed as a CATEGORY, holding 1 idea
//     CHI_camco_1 … CHI_sinaw        5 designer spirits missing from the maker entirely
//
// The write side shares the anchor, and there it is worse than a missing row: upsertIdeaDefinitionInIdeasFile
// falls through to an else-branch that APPENDS A NEW CATEGORY when it cannot find the named one, so saving
// into such a category would have written a second container beside it.
//
// All four locators now accept `}` as a statement boundary, the same way they accept a newline.
//
// Swept across all six installed corpora and seven subsystems (ideas, technologies, decisions, units,
// national_focus, characters, equipment): this shape occurs once, in that one Road to 56 file. Rare — but
// nothing warns you, and the maker shows a category that does not exist.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-midline-"));
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

const PORT = 53535;
const BASE = "http://127.0.0.1:" + PORT;
const R56_SHARED = "D:/SteamLibrary/steamapps/workshop/content/394360/820260968/common/ideas/china_shared.txt";

// `naval_manufacturer` closes and `aircraft_manufacturer` opens on the SAME line — the shape.
const MIDLINE = [
  "ideas = {",
  "\tnaval_manufacturer = {",
  "\t\tdesigner = yes",
  "",
  "\t\tprobe_shipyard = {",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tresearch_bonus = { naval_equipment = 0.10 }",
  "\t\t}",
  "\t}\taircraft_manufacturer = {",
  "",
  "\t\tdesigner = yes",
  "",
  "\t\tprobe_aero_one = {",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tresearch_bonus = { air_equipment = 0.10 }",
  "\t\t}",
  "",
  "\t\tprobe_aero_two = {",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tresearch_bonus = { air_equipment = 0.15 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// The identical file with the key moved onto its own line — the only difference.
const ONOWNLINE = MIDLINE.replace("\t}\taircraft_manufacturer = {", "\t}\n\taircraft_manufacturer = {");

let seq = 0;
function mkMod(text) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova mid-line"\n');
  fs.writeFileSync(path.join(mod, "common", "ideas", "probe.txt"), text, "utf8");
  return mod;
}
const fileOf = (mod) => fs.readFileSync(path.join(mod, "common", "ideas", "probe.txt"), "utf8");
async function catalogOf(mod) {
  const q = encodeURIComponent(mod);
  const r = await fetch(`${BASE}/api/ideas/catalog?includeVanilla=0&includeWorkshop=0&includeActiveMod=1&includeModsRoot=0&sourcePath=${q}&modPath=${q}`);
  return r.json();
}
const catsOf = (j) => {
  const m = new Map();
  (j.items || []).forEach((i) => m.set(i.category, (m.get(i.category) || 0) + 1));
  return m;
};
const blockCount = (t, name) =>
  (t.match(new RegExp("(?:^|[\\s}])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*=[ \\t]*\\{", "g")) || []).length;

// The boxes public/ideas.js draws for a DESIGNER spirit — every save below is in a designer category.
// The server treats a section the form never showed as "not cleared", so omitting this field is not a
// smaller payload, it is a DIFFERENT instruction. #spirit-save-deletes-hidden-blocks
const DESIGNER_SECTIONS = ["allowed", "equipment_bonus", "visible", "on_add", "available", "research_bonus"];

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  let corpusMeasured = false;

  try {
    console.log("\n-- a category that opens on the closing brace's line --");
    // ⭐ CONTROL: the fixture must really carry the shape, and its twin must really not.
    rec("CONTROL: the fixture opens a category after `}` on one line", /\}\taircraft_manufacturer = \{/.test(MIDLINE), "");
    rec("CONTROL: the twin differs only by that newline",
      ONOWNLINE !== MIDLINE && ONOWNLINE.replace(/\n\taircraft/, "\taircraft") === MIDLINE, "");

    const modA = mkMod(MIDLINE);
    const modB = mkMod(ONOWNLINE);
    const jA = await catalogOf(modA);
    const jB = await catalogOf(modB);
    const cA = catsOf(jA), cB = catsOf(jB);
    console.log("     mid-line: " + (jA.items || []).length + " ideas in " + cA.size + " categories · own line: " + (jB.items || []).length + " in " + cB.size);

    rec("READ: ⭐ the category is seen at all", cA.has("aircraft_manufacturer"), [...cA.keys()]);
    rec("READ: ⭐ both of its ideas belong to it", cA.get("aircraft_manufacturer") === 2, cA.get("aircraft_manufacturer"));
    rec("READ: ⭐ no idea was promoted to a category of its own",
      !cA.has("probe_aero_one") && !cA.has("probe_aero_two"), [...cA.keys()]);
    rec("READ: the earlier category is unaffected", cA.get("naval_manufacturer") === 1, cA.get("naval_manufacturer"));
    rec("READ: every idea in the file came back", (jA.items || []).length === 3, (jA.items || []).map((i) => i.ideaId));

    // ⭐ THE CONTROL THAT MATTERS: the newline must decide nothing.
    const norm = (j) => (j.items || []).map((i) => i.ideaId + "@" + i.category).sort().join(",");
    rec("CONTROL: ⭐ the mid-line file and its own-line twin read identically", norm(jA) === norm(jB), { a: norm(jA), b: norm(jB) });

    // -------------------------------------------------- the write side
    console.log("\n-- saving into it must not append a second container --");
    {
      const mod = mkMod(MIDLINE);
      const before = fileOf(mod);
      const cat = await catalogOf(mod);
      const item = (cat.items || []).find((i) => i.ideaId === "probe_aero_one");
      rec("the spirit is loadable", !!item, (cat.items || []).map((i) => i.ideaId));
      if (item) {
        const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod, ideaId: item.ideaId, targetRelativeFile: "common/ideas/probe.txt",
            targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
            name: item.localizedName || item.ideaId, desc: "",
            picture: item.pictureToken || "",
            // designer kind: research_bonus is its box, modifier is hidden
            selectedEffects: ["allowed = {\nalways = yes\n}", "research_bonus = {\nair_equipment = 0.10\n}"],
            mode: "edit", category: item.category,
            formSections: DESIGNER_SECTIONS,
            cost: "", removalCost: "", ledger: "", traits: "",
          }),
        });
        const body = await r.json();
        const after = fileOf(mod);
        rec("the save is accepted", r.status === 200 && body && body.ok, body);
        rec("WRITE: ⭐ the category was not duplicated", blockCount(after, "aircraft_manufacturer") === 1, {
          before: blockCount(before, "aircraft_manufacturer"), after: blockCount(after, "aircraft_manufacturer"),
        });
        rec("WRITE: the sibling spirit is still there", /probe_aero_two\s*=\s*\{/.test(after), "");
        rec("WRITE: the earlier category is untouched", blockCount(after, "naval_manufacturer") === 1, blockCount(after, "naval_manufacturer"));
      }
    }

    // -------------------------------------------------- CREATING into it
    // The read path is not the only anchored one. When a save has to PLACE a block, it looks the container
    // up by name and, failing to find it, appends a fresh one. Editing a spirit that is already there never
    // reaches that branch, so this creates a NEW spirit in the mid-line category instead.
    console.log("\n-- creating a new spirit in it must not append a second container --");
    {
      const mod = mkMod(MIDLINE);
      const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, ideaId: "probe_aero_new", targetRelativeFile: "common/ideas/probe.txt",
          targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
          name: "Probe Aero New", desc: "",
          picture: "GFX_idea_probe_aero_new",
          selectedEffects: ["allowed = {\nalways = yes\n}", "research_bonus = {\nair_equipment = 0.20\n}"],
          mode: "create", category: "aircraft_manufacturer",
          formSections: DESIGNER_SECTIONS,
          cost: "", removalCost: "", ledger: "", traits: "",
        }),
      });
      const body = await r.json();
      const after = fileOf(mod);
      rec("the create is accepted", r.status === 200 && body && body.ok, body);
      rec("CREATE: ⭐ the mid-line container was not duplicated",
        blockCount(after, "aircraft_manufacturer") === 1, blockCount(after, "aircraft_manufacturer"));
      rec("CREATE: ⭐ the new spirit landed inside it",
        /aircraft_manufacturer\s*=\s*\{[\s\S]*?probe_aero_new\s*=\s*\{/.test(after), after.slice(-500));
      rec("CREATE: the spirits already there are untouched",
        /probe_aero_one\s*=\s*\{/.test(after) && /probe_aero_two\s*=\s*\{/.test(after), "");
    }

    // -------------------------------------------------- the designer flag must land in the RIGHT block
    console.log("\n-- the designer flag goes on the mid-line container, not a new one --");
    {
      // Same file with the flag removed, so writing it is observable.
      const noFlag = MIDLINE.replace("\t}\taircraft_manufacturer = {\n\n\t\tdesigner = yes\n", "\t}\taircraft_manufacturer = {\n");
      rec("CONTROL: the variant really has no designer flag on that container",
        noFlag !== MIDLINE && (noFlag.match(/designer = yes/g) || []).length === 1, (noFlag.match(/designer = yes/g) || []).length);
      const mod = mkMod(noFlag);
      const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, ideaId: "probe_aero_one", targetRelativeFile: "common/ideas/probe.txt",
          targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
          name: "Probe Aero One", desc: "", picture: "",
          selectedEffects: ["allowed = {\nalways = yes\n}", "research_bonus = {\nair_equipment = 0.10\n}"],
          mode: "edit", category: "aircraft_manufacturer",
          formSections: DESIGNER_SECTIONS,
          cost: "", removalCost: "", ledger: "", traits: "",
        }),
      });
      const body = await r.json();
      const after = fileOf(mod);
      rec("the save is accepted", r.status === 200 && body && body.ok, body);
      rec("FLAG: ⭐ the container is still single", blockCount(after, "aircraft_manufacturer") === 1, blockCount(after, "aircraft_manufacturer"));
      rec("FLAG: ⭐ designer = yes went into the mid-line container",
        /aircraft_manufacturer\s*=\s*\{[^}]*designer\s*=\s*yes/.test(after), after.slice(0, 700));
    }

    // -------------------------------------------------- moving INTO it
    console.log("\n-- moving a spirit into it must find the existing container --");
    {
      const mod = mkMod(MIDLINE);
      const r = await fetch(`${BASE}/api/ideas/upsert-definition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, ideaId: "probe_shipyard", targetRelativeFile: "common/ideas/probe.txt",
          targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
          name: "Probe Shipyard", desc: "", picture: "",
          selectedEffects: ["allowed = {\nalways = yes\n}", "research_bonus = {\nnaval_equipment = 0.10\n}"],
          mode: "edit", category: "aircraft_manufacturer",
          formSections: DESIGNER_SECTIONS,
          cost: "", removalCost: "", ledger: "", traits: "",
        }),
      });
      const body = await r.json();
      const after = fileOf(mod);
      rec("the move is accepted", r.status === 200 && body && body.ok, body);
      rec("MOVE: ⭐ the mid-line container was not duplicated",
        blockCount(after, "aircraft_manufacturer") === 1, blockCount(after, "aircraft_manufacturer"));
      rec("MOVE: ⭐ the spirit landed in the existing container",
        /aircraft_manufacturer\s*=\s*\{[\s\S]*?probe_shipyard\s*=\s*\{/.test(after), after.slice(0, 800));
    }

    // -------------------------------------------------- the corpus this came from
    console.log("\n-- Road to 56's china_shared.txt --");
    if (!fs.existsSync(R56_SHARED)) {
      rec("Road to 56 is not installed — the corpus check is skipped", true, "");
    } else {
      corpusMeasured = true;
      const src = fs.readFileSync(R56_SHARED, "utf8");
      // ⭐ CONTROL: assert the corpus really has the shape, or a clean run says nothing.
      rec("CONTROL: Road to 56 really does open a category mid-line",
        /\}\taircraft_manufacturer\s*=\s*\{/.test(src), "");
      const mod = mkMod(src);
      const j = await catalogOf(mod);
      const c = catsOf(j);
      console.log("     " + (j.items || []).length + " ideas in " + c.size + " categories: " + [...c.keys()].join(", "));
      rec("RUN: ⭐ aircraft_manufacturer is in the list", c.has("aircraft_manufacturer"), [...c.keys()]);
      rec("RUN: ⭐ its five spirits are attributed to it", c.get("aircraft_manufacturer") === 5, c.get("aircraft_manufacturer"));
      rec("RUN: ⭐ no spirit is masquerading as a category", !c.has("CHI_camco_1"), [...c.keys()]);
      ["CHI_camco_1", "CHI_camco_2", "CHI_camco_3", "CHI_camco_SEA", "CHI_sinaw"].forEach((id) => {
        const e = (j.items || []).find((x) => x.ideaId === id);
        rec("RUN: " + id + " is in aircraft_manufacturer", !!e && e.category === "aircraft_manufacturer", e && e.category);
      });
    }

    rec("the fixture was measured whatever is installed", checks >= 12, checks);
    console.log("     corpus measured: " + corpusMeasured);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== idea category can open mid-line: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
