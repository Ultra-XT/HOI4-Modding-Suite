// buildings.txt rows anchored in another state are ONE problem listing every row — not one problem per row, and
// not a crash claim. #a-floating-harbor-is-keyed-by-its-anchor
//
// THE DEFECT. findBuildingAnchorMismatches pushed one `building_anchor_wrong_state` per row. Measured validating each
// shipping map against vanilla: Millennium Dawn 17, Road to 56 165, Old World Blues 23, Novum Vexillum 14 separate
// entries in the Map Errors popup and in Mod Health — Road to 56's alone is 165 identical paragraphs. Every one said
// the mismatch "can crash HOI4 the moment a game starts, with nothing in error.log". hoi4.exe has no text for it (its
// building checks are position-based: "location is not within specified state", "BUILDING IGNORED!"), Road to 56
// launches with all 165, and the Gaza/Negev crash the claim was written from (2026-06-10) was repaired by restoring
// that whole region's states, VPs and ports at once, so the anchors were never isolated as the cause.
//
// Sibling rules aggregate (state_buildings_exceed_slots, non_land_province_in_state: one problem, items[]). This
// one now does too, and the layer-below subtraction — which keyed on the per-row stateId/provinceId — reads the
// items, so an add-on is still not handed its dependency's rows.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchorone-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchorone-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const state = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\thistory = { owner = T${String(id).padStart(2, "0")} }\n\tprovinces = { ${provs.join(" ")} }\n}\n`;
const STATES = {
  "history/states/1-One.txt": state(1, [10, 11]),
  "history/states/2-Two.txt": state(2, [20, 21]),
  "history/states/3-Three.txt": state(3, [30]),
};
const DEFN = ["0;0;0;0;land;false;unknown;0", "10;10;0;0;land;true;plains;1", "11;11;0;0;land;true;plains;1",
  "20;20;0;0;land;true;plains;1", "21;21;0;0;land;true;plains;1", "30;30;0;0;land;true;plains;1"].join("\n") + "\n";
const BUILDINGS = [
  "1;floating_harbor;1.0;2.0;3.0;0.5;20",   // anchored in state 2 — wrong
  "1;floating_harbor;1.5;2.0;3.0;0.5;21",   // anchored in state 2 — wrong
  "2;floating_harbor;4.0;5.0;6.0;0.5;30",   // anchored in state 3 — wrong
  "3;floating_harbor;7.0;8.0;9.0;0.5;30",   // right
  "1;floating_harbor;1.0;2.5;3.0;0.5;10",   // right
  "1;floating_harbor;1.1;2.0;3.0;0.5;20",   // the first row's key again — one mismatch, not two
].join("\n") + "\n";

const GAME = dir("game", {});   // an empty base-game stand-in
const scan = (modRoot, deps) => {
  const model = md.buildMapModel({ modRoot, gameRoot: GAME, dependencyRoots: deps });
  return md.findBuildingAnchorMismatches({ modRoot, gameRoot: GAME, dependencyRoots: deps, model });
};

(async () => {
  try {
    console.log("\n=== 1. three mismatched rows in a mod's own map are ONE problem ===");
    const mod = dir("mod", Object.assign({ "map/definition.csv": DEFN, "map/buildings.txt": BUILDINGS }, STATES));
    const probs = scan(mod, []);
    const p = probs[0];
    rec("THE CONTROL: the rule fires on the fixture", probs.length > 0 && p.rule === "building_anchor_wrong_state", probs.map((x) => x.rule));
    rec("⭐⭐⭐ exactly one problem for three mismatched rows", probs.length === 1, probs.length);
    const items = (p && p.items) || [];
    rec("⭐⭐⭐ …listing all three in items[]", items.length === 3, items);
    const has = (s, a, o) => items.some((i) => i.stateId === s && i.provinceId === a && i.ownerState === o && i.type === "floating_harbor");
    rec("…each with its key, its anchor, the state that anchor is really in, and its type",
      has(1, 20, 2) && has(1, 21, 2) && has(2, 30, 3), items);
    rec("…and the rows that are right are not among them", !items.some((i) => i.provinceId === 10) && !items.some((i) => i.stateId === 3), items);
    rec("still a warning", !!p && p.severity === "warning", p && p.severity);
    rec("not in the curated fatal set", labels.isFatalRule("building_anchor_wrong_state") === false);
    rec("⭐⭐⭐ the message no longer claims a crash", !!p && !/crash/i.test(p.message), p && p.message);
    rec("…says how many, and still says how to put them right", !!p && /\b3\b/.test(p.message) && /re-save the move/i.test(p.message), p && p.message);
    rec("…and names the states, so the panel can zoom to one", !!p && Array.isArray(p.states) && p.states.includes(1) && p.states.includes(2), p && p.states);

    console.log("\n=== 2. the Map editor's panel still finds a state to zoom to — the REAL problemStateId, run ===");
    {
      const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
      const MASKED = maskJsComments(MAP);
      const s = MASKED.indexOf("function problemStateId(p)");
      const e = s < 0 ? -1 : MASKED.indexOf("\n  }", s);
      const fn = s < 0 || e < 0 ? "" : MAP.slice(s, e + 4);
      rec("problemStateId lifted", fn.length > 100, fn.length);
      const sandbox = { model: { provinceToState: {} } };
      vm.createContext(sandbox);
      vm.runInContext(`${fn}\nthis.__f = problemStateId;`, sandbox);
      rec("⭐ it resolves the aggregated problem to a state", !!p && sandbox.__f(p) != null && [1, 2].includes(sandbox.__f(p)), p && sandbox.__f(p));
    }

    console.log("\n=== 3. an add-on holding its dependency's files byte-for-byte is still told nothing ===");
    {
      const base = dir("dep", Object.assign({ "descriptor.mod": 'name="Dep"\n', "map/definition.csv": DEFN, "map/buildings.txt": BUILDINGS }, STATES));
      const own3 = scan(base, []);
      rec("THE CONTROL: the dependency reports its own three", own3.reduce((n, x) => n + ((x && x.items) || [x]).length, 0) === 3, own3.map((x) => x.items || x.message));
      const copies = { "descriptor.mod": 'name="Addon"\n', "map/buildings.txt": BUILDINGS };
      for (const rel of Object.keys(STATES)) copies[rel] = STATES[rel];
      const a = dir("addon", copies);
      const got = scan(a, [base]);
      rec("⭐⭐⭐ the add-on inherits all three, beyond the first, and is told nothing", got.length === 0, got.map((x) => x.items || x.message));

      console.log("\n=== 4. …but a row its own edit made wrong is reported, alone ===");
      const own = dir("addon-own", Object.assign({}, copies, { "map/buildings.txt": BUILDINGS + "3;floating_harbor;7.5;8.0;9.0;0.5;11\n" }));
      const mine = scan(own, [base]);
      const it = ((mine[0] || {}).items) || [];
      rec("⭐⭐⭐ the add-on's own mismatch is one problem with one item", mine.length === 1 && it.length === 1 && it[0].stateId === 3 && it[0].provinceId === 11, mine.map((x) => x.items || x.message));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== harbour anchors in another state are one problem: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
