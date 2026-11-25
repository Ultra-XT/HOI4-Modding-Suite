// "Place hubs on your new land in the Supply view." There is no Supply view.
// #a-validator-must-name-a-control-that-exists
//
// THE DEFECT. supply_nodes_empty and railways_empty both closed by telling the modder where to go, and the place
// they named is not in Nova. The Map editor's tools are listed in public/map.html and two of them are exactly
// right — 🏭 Supply hub ("click a province to add a supply hub") and 🛤 Railway — and neither message named
// either.
//
// It is not a harmless paraphrase, for two reasons measured out of the source here:
//
//   1. "the Supply view" IS a real thing, and it is HOI4's. map-data.js uses the phrase three other times, all
//      correctly, about the game's own supply map mode: "a supply hub or railway on sea can crash HOI4 when a
//      game starts or the Supply view opens". So the same words point at the game in three places and at nothing
//      in two, in the one file a modder reads when something is wrong.
//   2. The Map editor's "Color by" list offers "Supply area" — a DIFFERENT feature, which groups states for
//      attrition and places no hubs at all. A modder hunting for a "Supply view" finds a plausible wrong answer
//      and stops there.
//
// A validator's closing sentence is its fix affordance: #makers-judged-by-the-validator is about a fix button
// that writes to the wrong place, and this is the same failure with the button left out — the only instruction
// the modder gets, naming a control that does not exist.
//
// HOW IT IS CHECKED, AND WHY IT IS DERIVED. The control names are read out of public/map.html — the tool buttons
// by their own `class="map-tool"` markup, the views by the `Color by` <option> list — so a tool that is renamed or
// removed fails this test instead of silently making the message wrong again. Nothing is typed in but the two
// rule names. The messages themselves come from a real validate run over a real fixture, not from a regex over
// the source: the sentence has to reach the modder, not merely exist.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const lib = require("./testlib-two-layer-map.js");
const W = lib.makeWorld("namescontrol");
const md = require("./map-data.js");

// ── The controls the Map editor actually has, read off the page. ─────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const TOOLS = [...HTML.matchAll(/class="map-tool"[\s\S]*?<span class="tool-name">([^<]+)<\/span>/g)].map((m) => m[1].trim());
const VIEWS = (() => {
  const sel = /<select id="mapColorBy"[\s\S]*?<\/select>/.exec(HTML);
  return sel ? [...sel[0].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim()) : [];
})();
const PANELS = [...HTML.matchAll(/<button id="map\w+"[^>]*>([^<]*(?:&amp;|and)[^<]*)<\/button>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());

// ── The two messages, from a real validate over a fixture whose map has land and whose own two files are empty. ──
const mod = W.mod("EmptySupply", { "map/supply_nodes.txt": "", "map/railways.txt": "" });
const problems = md.validateMapFiles({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [] });
const msgOf = (rule) => { const p = problems.find((q) => q.rule === rule); return p ? String(p.message || "") : ""; };
const RULES = ["supply_nodes_empty", "railways_empty"];

try {
  console.log("=== 0. THE CONTROLS: the page's control names were read, and the two rules fire on the fixture ===");
  rec("the Map editor's tool names were read out of public/map.html", TOOLS.length >= 8, TOOLS);
  rec("…and its 'Color by' view names", VIEWS.length >= 4, VIEWS);
  for (const r of RULES) rec(`${r} fires on a mod whose own ${r === "railways_empty" ? "railways" : "supply_nodes"}.txt is empty`, msgOf(r).length > 100, msgOf(r).slice(0, 120));

  console.log("\n=== 1. ⭐⭐⭐ THE DEFECT: there is no view called Supply, and a near-miss is there instead ===");
  rec("no Map editor view is called 'Supply'", !VIEWS.includes("Supply"), VIEWS);
  rec("⭐⭐ …but 'Supply area' is, which is the wrong answer a modder would find", VIEWS.includes("Supply area"), VIEWS);
  rec("⭐⭐ …and no tool is called 'Supply' either", !TOOLS.includes("Supply"), TOOLS);
  for (const r of RULES) rec(`⭐⭐⭐ ${r} no longer sends the modder to a "Supply view" Nova does not have`, !/Supply view/.test(msgOf(r)), msgOf(r));

  console.log("\n=== 2. …and each message names controls that DO exist, read off the page ===");
  // ⚠️ SCOPED TO THE CLOSING INSTRUCTION, NOT THE WHOLE MESSAGE. The railways message opens "Railways are what
  // carry supply out of a hub", and a scan of the whole text therefore found the string "Railway" in ordinary
  // prose and passed while the instruction still said "the Supply view" — the back-out control caught this test
  // not biting. What has to name a control is the sentence that tells the modder what to do.
  const fixSentence = (m) => { const i = m.indexOf("To fix it,"); return i < 0 ? "" : m.slice(i); };
  for (const r of RULES) {
    const fixIt = fixSentence(msgOf(r));
    rec(`THE CONTROL: ${r} closes with an instruction to isolate`, fixIt.length > 40, fixIt);
    const named = TOOLS.filter((t) => fixIt.indexOf(t) >= 0);
    rec(`⭐⭐⭐ ${r}'s instruction names at least one real Map editor tool`, named.length > 0, { named, fixIt });
    rec(`⭐⭐ …including the one for the thing it is about`, named.includes(r === "railways_empty" ? "Railway" : "Supply hub"), { named, fixIt });
    rec(`…and the panel that lists what is already placed`, PANELS.some((p) => p && fixIt.indexOf(p) >= 0), PANELS);
  }

  console.log("\n=== 3. THE CONTROL: the phrase is still used where it IS right — for HOI4's own view ===");
  {
    // Not a grep of the whole file: the message that says the GAME crashes when its Supply view opens is a
    // different rule, and it must keep saying so. Taken from a real validate too, on a fixture with a hub on sea.
    const bad = W.mod("HubOnSea", { "map/supply_nodes.txt": "1 1\n" });
    const pb = md.validateMapFiles({ modRoot: bad, gameRoot: W.GAME, dependencyRoots: [] })
      .concat(md.validateMapModel(md.buildMapModel({ modRoot: bad, gameRoot: W.GAME, dependencyRoots: [] })));
    const hub = pb.find((p) => /supply hub\(s\) sit on an invalid province/.test(String(p.message || "")));
    rec("⭐⭐⭐ the rule about HOI4's own Supply view still names it — the phrase was wrong here, not everywhere",
      !!hub && /the Supply view opens/.test(hub.message), hub && hub.message ? hub.message.slice(0, 200) : pb.map((p) => p.rule));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  W.cleanup();
}
console.log(`\n=== a map message names a control Nova has: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
