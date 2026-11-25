// A deleted state must not stay listed in a supply area — and nothing may quietly leave one there.
// #a-deleted-state-leaves-no-supply-area-behind
//
// THE INVARIANT, measured 2026-09-10 through Nova's own buildMapModel on every shipping map (vanilla and the
// five workshop mods that ship a map/): 1,395 supply-area member ids, 1,395 resolve to a real state,
// 0 dangling. Vanilla 4; Road to 56 4 and Rise of Nations 4 (both inherit vanilla's area); Old World Blues
// 1,382 across 321 areas; Millennium Dawn 1; Novum Vexillum 0 (it replaces map/supplyareas with nothing).
// It is the one supply-area invariant with no exception anywhere in the corpus.
//
// ⛔ AND NOVA BROKE IT, SILENTLY, THREE WAYS:
//   1. deleteState cut the state's block out of history/states and touched nothing else. The erase brush
//      calls it the moment it takes a state's last province, so painting was enough. moveStateToSupplyArea
//      already had the overlap-proof removal loop; deleteState never adopted it.
//   2. mergeState ends in deleteState, so a merge left the source listed and the target — now holding the
//      source's land — in no area at all: the membership neither moved nor disappeared. Merging the highest
//      id into a state with no area produced no validator output whatsoever.
//   3. No rule asked whether a supply area's members exist, while the same question one level down
//      (state_province_not_in_definition) has been asked for months.
//   …and Auto-fix made it worse: closeStateIdGaps slides the highest state down into the deleted id, and a
//   stale reference to that id silently starts naming a DIFFERENT state (the verifier measured
//   `states={ 1 2 3 2 }` after a merge and one Auto-fix click).
//
// WHOSE FILE (#inherited-problem-not-yours), tested on both layers below:
//   • an area the mod ships is edited in place;
//   • an area the mod INHERITS, when the mod replaces history/states, can only name states the mod removed —
//     so deleting one takes it out of that area too, by copying that one area's file in under its own name,
//     exactly as moveStateToSupplyArea already does to move a state;
//   • an add-on that does not replace history/states is never handed its base's areas, and a dangling id the
//     base game ships is the base game's.
//   The bulk fixer is stricter than a single delete: it edits only files the mod already ships. An add-on that
//   replaces a 321-area dependency's states would otherwise copy hundreds of files in on one click — the shape
//   fixSupplyAreaRegionSplits was just stopped from producing.
//
// A WARNING, not an error: supply areas are deprecated since HOI4 1.11, the same reason the neighbouring
// state_in_two_supply_areas is a warning. No crash is claimed.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dsa-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const read = (p) => fs.readFileSync(p, "utf8");
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dsa-" + tag + "-")); tmps.push(d); return d; };
const NOGAME = path.join(os.tmpdir(), "__nova_dsa_no_game__");
const RULE = "supply_area_state_missing";

const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
const area = (id, states) => `supply_area = {\n\tid = ${id}\n\tname = "SUPPLYAREA_${id}"\n\tvalue = 1\n\tstates = { ${states} }\n}\n`;
// Six land provinces in ONE strategic region, so no region rule joins in. Each state owns the province of its id.
function writeMap(root) {
  mk(path.join(root, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${i * 20};0;0;land;false;plains;1`)).join("\r\n") + "\r\n");
  mk(path.join(root, "map", "strategicregions", "10-R10.txt"), 'strategic_region = {\n\tid = 10\n\tname = "R10"\n\tprovinces = { 1 2 3 4 5 6 }\n}\n');
}
function writeStates(root, ids) { for (const id of ids) mk(path.join(root, "history", "states", `${id}-S.txt`), st(id, id)); }
const OWNS_ALL = 'name="Own"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="history/states"\n';
function ownMod(tag, stateIds, areas) {
  const mod = tmp(tag);
  mk(path.join(mod, "descriptor.mod"), OWNS_ALL);
  writeMap(mod);
  writeStates(mod, stateIds);
  for (const [f, body] of Object.entries(areas)) mk(path.join(mod, "map", "supplyareas", f), body);
  return mod;
}
const modelOf = (mod, game) => md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: false });
const dangling = (m) => { const ids = new Set(m.states.map((s) => s.id)); const out = []; for (const a of m.supplyAreas) for (const s of a.states) if (!ids.has(s)) out.push(`${a.id}:${s}`); return out; };
const areasOf = (m, sid) => m.supplyAreas.filter((a) => a.states.includes(sid)).map((a) => a.id);
const statesOf = (m, aid) => ((m.supplyAreas.find((a) => a.id === aid) || {}).states || []).slice().sort((a, b) => a - b);
const reportsOf = (mod, game) => md.validateMapModel(modelOf(mod, game)).filter((p) => p.rule === RULE);
const twoAreas = (mod, game) => md.validateMapModel(modelOf(mod, game)).filter((p) => p.rule === "state_in_two_supply_areas");
const hasFixer = typeof md.fixSupplyAreaMissingStates === "function";

try {
  console.log("1. ⛔ Deleting a state takes it out of the supply area the mod ships");
  {
    const commented = 'supply_area = {\n\tid = 1\n\tname = "SUPPLYAREA_1"\n\tvalue = 7\n\tstates = {\n\t\t1 2 # the coast\n\t\t4\n\t}\n}\n';
    const mod = ownMod("own", [1, 2, 3, 4], { "1-SupplyArea.txt": commented, "2-SupplyArea.txt": area(2, "3") });
    rec("setup: every member resolves", dangling(modelOf(mod, NOGAME)).length === 0, dangling(modelOf(mod, NOGAME)));
    // What the client sends: public/map.js queues POST /api/map/delete-state { stateId } — from the erase
    // brush's deleteEmptiedStates and from the Delete button alike — and server.js hands deleteState modRoot,
    // gameRoot, dependencyRoots and that stateId, nothing more.
    const r = md.deleteState({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], stateId: 4 });
    rec("the delete ran", !!r && r.changed === true, r);
    const m = modelOf(mod, NOGAME);
    rec("⭐⭐⭐ no supply area lists the deleted state any more", areasOf(m, 4).length === 0, m.supplyAreas.map((a) => [a.id, a.states]));
    rec("⭐⭐⭐ …so nothing dangles", dangling(m).length === 0, dangling(m));
    const txt = read(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt"));
    rec("⭐⭐ the area keeps its other states", JSON.stringify(statesOf(m, 1)) === "[1,2]", statesOf(m, 1));
    rec("⭐⭐ …and the author's comment, still beside state 2", /2 # the coast/.test(txt), txt);
    rec("…and its name and value", /name = "SUPPLYAREA_1"/.test(txt) && /value = 7/.test(txt), txt);
    rec("the area that never listed it is byte-identical", read(path.join(mod, "map", "supplyareas", "2-SupplyArea.txt")) === area(2, "3"));
    rec("the result names the area it cleared", !!r && Array.isArray(r.supplyAreasCleared) && r.supplyAreasCleared.includes(1), r);
  }
  {
    // ⚠️ A state defined TWICE (Millennium Dawn ships <id>-restored.txt stubs beside the real file) survives the
    // deletion of one copy — so it keeps its supply area. Only an id that is really gone is taken out.
    const mod = ownMod("dup", [1, 2, 3, 4], { "1-SupplyArea.txt": area(1, "1 4") });
    mk(path.join(mod, "history", "states", "4-restored.txt"), st(4, 4));
    const r = md.deleteState({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], stateId: 4 });
    rec("setup: one copy of the twice-defined state deletes", !!r && r.changed === true, r);
    const m = modelOf(mod, NOGAME);
    rec("…and state 4 still exists through its other definition", m.states.some((s) => s.id === 4), m.states.map((s) => s.id));
    rec("⭐⭐ …so it is still in its supply area", JSON.stringify(areasOf(m, 4)) === "[1]", m.supplyAreas.map((a) => [a.id, a.states]));
  }

  console.log("\n2. ⛔⛔ …so the gap-closer cannot slide a different state into the stale reference");
  {
    const mod = ownMod("gap", [1, 2, 3, 4], { "1-SupplyArea.txt": area(1, "1 2"), "2-SupplyArea.txt": area(2, "3 4") });
    const r = md.deleteState({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], stateId: 2 });
    rec("the mid-range delete ran", !!r && r.changed === true, r);
    // Exactly what autoFixMap runs next for the state_id_gap that delete opened.
    const g = md.closeStateIdGaps(mod, { gameRoot: NOGAME, dependencyRoots: [] });
    rec("the gap-closer moved state 4 into id 2", (g.renumbered || []).some((x) => x.from === 4 && x.to === 2), g);
    const m = modelOf(mod, NOGAME);
    rec("⭐⭐⭐ the renumbered state is in ONE area — its own — not also in the deleted state's",
      JSON.stringify(areasOf(m, 2)) === "[2]", m.supplyAreas.map((a) => [a.id, a.states]));
    rec("⭐⭐ …area 1 kept only state 1", JSON.stringify(statesOf(m, 1)) === "[1]", statesOf(m, 1));
    rec("…and the validator agrees", twoAreas(mod, NOGAME).length === 0 && reportsOf(mod, NOGAME).length === 0,
      twoAreas(mod, NOGAME).concat(reportsOf(mod, NOGAME)).map((p) => p.rule));
  }

  console.log("\n3. ⛔ A merge carries the membership to the state that now holds the land");
  {
    // The verifier's fully silent case: merge the highest id into a state that is in no area.
    const mod = ownMod("merge", [1, 2, 3, 4], { "1-SupplyArea.txt": area(1, "1 2"), "2-SupplyArea.txt": area(2, "4") });
    rec("setup: state 3 is in no supply area", areasOf(modelOf(mod, NOGAME), 3).length === 0);
    // What the client sends: POST /api/map/merge-state { sourceStateId, targetStateId } (public/map.js doMergeState).
    const r = md.mergeState({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], sourceStateId: 4, targetStateId: 3 });
    rec("the merge ran", !!r && r.changed === true, r && (r.error || r));
    const m = modelOf(mod, NOGAME);
    rec("⭐⭐⭐ the merged-away state is listed nowhere", areasOf(m, 4).length === 0, m.supplyAreas.map((a) => [a.id, a.states]));
    rec("⭐⭐⭐ …and the state holding its land took its place in area 2", JSON.stringify(areasOf(m, 3)) === "[2]", areasOf(m, 3));
    rec("…the area that never listed either is byte-identical", read(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt")) === area(1, "1 2"));
    rec("…the result says where the membership went", !!r && !!r.supplyArea && r.supplyArea.carriedTo === 2, r && r.supplyArea);
    rec("⭐ …and nothing dangles or doubles", dangling(m).length === 0 && twoAreas(mod, NOGAME).length === 0, dangling(m));
  }
  {
    // A target that already has an area keeps it: a state belongs to exactly one.
    const mod = ownMod("merge2", [1, 2, 3, 4], { "1-SupplyArea.txt": area(1, "1 2"), "2-SupplyArea.txt": area(2, "3 4") });
    const r = md.mergeState({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], sourceStateId: 4, targetStateId: 1 });
    rec("the merge into a state with its own area ran", !!r && r.changed === true, r && (r.error || r));
    const m = modelOf(mod, NOGAME);
    rec("⭐⭐ the merged-away state is listed nowhere", areasOf(m, 4).length === 0, m.supplyAreas.map((a) => [a.id, a.states]));
    rec("⭐⭐ …the target stays in its own area only", JSON.stringify(areasOf(m, 1)) === "[1]", areasOf(m, 1));
    rec("…the source's area keeps its other state", JSON.stringify(statesOf(m, 2)) === "[3]", statesOf(m, 2));
    rec("…and nothing was carried, because the target already had an area", !!r && !!r.supplyArea && r.supplyArea.carriedTo == null, r && r.supplyArea);
  }

  console.log("\n4. ⭐⭐ A supply area naming a state that does not exist is reported — and Auto-fix removes it");
  {
    const mod = ownMod("rule", [1, 2, 3], { "1-SupplyArea.txt": area(1, "1 2 9"), "2-SupplyArea.txt": area(2, "3") });
    const rep = reportsOf(mod, NOGAME);
    rec("⭐⭐⭐ the dangling member is reported, once", rep.length === 1, rep.map((p) => p.message));
    const p = rep[0] || {};
    rec("⚠️ …as a WARNING, like state_in_two_supply_areas", p.severity === "warning", p.severity);
    rec("…naming the area and the state", p.supplyArea === 1 && Array.isArray(p.states) && p.states.includes(9), { supplyArea: p.supplyArea, states: p.states });
    rec("…saying supply areas are deprecated since 1.11, and claiming no crash", /1\.11/.test(String(p.message)) && !/crash/i.test(String(p.message)), p.message);
    rec("…NOT in the curated fatal set, so Save is not gated on it", labels.isFatalRule(RULE) === false);
    rec("…with a real label and a fix hint", !!labels.LABELS[RULE] && labels.mapRuleFixHint(RULE).length > 15,
      { label: labels.LABELS[RULE], hint: labels.mapRuleFixHint(RULE) });
    rec("the deterministic fixer exists", hasFixer);
    if (hasFixer) {
      const before2 = read(path.join(mod, "map", "supplyareas", "2-SupplyArea.txt"));
      const r = md.fixSupplyAreaMissingStates({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
      rec("⭐⭐ the fixer removes exactly the missing id", !!r && r.changed === true && JSON.stringify(statesOf(modelOf(mod, NOGAME), 1)) === "[1,2]",
        { r, states: statesOf(modelOf(mod, NOGAME), 1) });
      rec("…leaves the other area byte-identical", read(path.join(mod, "map", "supplyareas", "2-SupplyArea.txt")) === before2);
      rec("…and the rule is satisfied", reportsOf(mod, NOGAME).length === 0);
      const once = fs.readFileSync(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt"));
      const r2 = md.fixSupplyAreaMissingStates({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
      rec("…and a second run changes nothing", !!r2 && r2.changed === false
        && Buffer.compare(once, fs.readFileSync(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt"))) === 0, r2);
    }
  }
  {
    // A hand-built model (no mod, no file) is attributed to the mod, as every other rule's unit contract is.
    const rep = md.validateMapModel({ states: [{ id: 1, provinces: [1] }], provinceToRegion: {}, supplyAreas: [{ id: 1, name: "A", states: [1, 5] }] })
      .filter((x) => x.rule === RULE);
    rec("a hand-built model with a dangling member is reported", rep.length === 1, rep);
    const none = md.validateMapModel({ states: [], provinceToRegion: {}, supplyAreas: [{ id: 1, name: "A", states: [1, 5] }] })
      .filter((x) => x.rule === RULE);
    rec("…but with no states loaded at all there is nothing to judge against", none.length === 0, none);
  }

  console.log("\n5. ⛔⛔ Whose file — both layers");
  const GAME = tmp("game");
  writeMap(GAME);
  writeStates(GAME, [1, 2, 3, 4]);
  mk(path.join(GAME, "map", "supplyareas", "1-SupplyArea.txt"), area(1, "1 2 3 4"));
  const gameAreaPath = path.join(GAME, "map", "supplyareas", "1-SupplyArea.txt");
  const gameArea = read(gameAreaPath);
  {
    // Road to 56 / Rise of Nations: the mod replaces history/states and inherits the base game's area.
    const mod = tmp("rp");
    mk(path.join(mod, "descriptor.mod"), 'name="RP"\nreplace_path="history/states"\n');
    writeStates(mod, [1, 2, 3, 4]);
    rec("setup: the mod ships no supply areas", !fs.existsSync(path.join(mod, "map", "supplyareas")));
    const r = md.deleteState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 4 });
    rec("the delete ran", !!r && r.changed === true, r);
    const m = modelOf(mod, GAME);
    rec("⭐⭐⭐ the inherited area no longer names the state the mod deleted", areasOf(m, 4).length === 0 && dangling(m).length === 0,
      m.supplyAreas.map((a) => [a.id, a.states, a.file]));
    const own = path.join(mod, "map", "supplyareas", "1-SupplyArea.txt");
    rec("⭐⭐ …by taking its own copy under the SAME name, which is how HOI4 overrides it",
      fs.existsSync(own) && JSON.stringify(statesOf(m, 1)) === "[1,2,3]", fs.existsSync(own) ? read(own) : "(no copy)");
    rec("⭐⭐ …and the base game's file is untouched", read(gameAreaPath) === gameArea);
    rec("…and nothing is reported", reportsOf(mod, GAME).length === 0, reportsOf(mod, GAME));
  }
  {
    // An add-on that does not replace history/states: its own new state is in no inherited area.
    const mod = tmp("addon");
    mk(path.join(mod, "descriptor.mod"), 'name="Addon"\n');
    writeStates(mod, [5]);
    const r = md.deleteState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 5 });
    rec("an add-on's own state deletes", !!r && r.changed === true, r);
    rec("⭐⭐⭐ …and no supply-area file is materialised into the add-on", !fs.existsSync(path.join(mod, "map", "supplyareas")),
      fs.existsSync(path.join(mod, "map", "supplyareas")) ? fs.readdirSync(path.join(mod, "map", "supplyareas")) : "(none)");
    rec("…the base game's file is untouched", read(gameAreaPath) === gameArea);
  }
  {
    // The base game ships its OWN dangling member — the add-on did not write it and cannot fix it.
    const GAME2 = tmp("game2");
    writeMap(GAME2);
    writeStates(GAME2, [1, 2, 3, 4]);
    mk(path.join(GAME2, "map", "supplyareas", "1-SupplyArea.txt"), area(1, "1 2 9"));
    const mod = tmp("addon2");
    mk(path.join(mod, "descriptor.mod"), 'name="Addon2"\n');
    rec("⚠️ CONTROL: validated as itself, that base game's dangling member IS reported", reportsOf(GAME2, GAME2).length === 1, reportsOf(GAME2, GAME2));
    rec("⭐⭐⭐ …but not to an add-on that merely inherits it", reportsOf(mod, GAME2).length === 0, reportsOf(mod, GAME2).map((p) => p.message));
    if (hasFixer) {
      const r = md.fixSupplyAreaMissingStates({ modRoot: mod, gameRoot: GAME2, dependencyRoots: [] });
      rec("⭐⭐⭐ …and the fixer writes nothing into the add-on", !!r && r.changed === false && !fs.existsSync(path.join(mod, "map", "supplyareas")), r);
    }
  }
  {
    // The mod replaces history/states and dropped a state the inherited area names: that IS the mod's doing,
    // so it is reported — but the bulk fixer does not copy an inherited file in to repair it.
    const mod = tmp("rp2");
    mk(path.join(mod, "descriptor.mod"), 'name="RP2"\nreplace_path="history/states"\n');
    writeStates(mod, [1, 2, 3]);
    const rep = reportsOf(mod, GAME);
    rec("⭐⭐ a state the mod's replace_path dropped, still named by an inherited area, IS reported",
      rep.length === 1 && (rep[0].states || []).includes(4), rep);
    if (hasFixer) {
      const r = md.fixSupplyAreaMissingStates({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
      rec("⚠️ …but the bulk fixer copies no inherited file in to repair it", !!r && r.changed === false && !fs.existsSync(path.join(mod, "map", "supplyareas")), r);
    }
  }

  console.log("\n6. ⭐ Auto-fix clears a stale member BEFORE the gap-closer can renumber a state into it");
  {
    // What an older Nova left behind: state 3 deleted, still listed in area 1, and the id gap still open.
    const mod = ownMod("autofix", [1, 2, 4], { "1-SupplyArea.txt": area(1, "1 3"), "2-SupplyArea.txt": area(2, "4") });
    const r = md.autoFixMap({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    rec("Auto-fix ran", !!r && r.ok === true, r && r.error);
    const m = modelOf(mod, NOGAME);
    rec("the gap is closed (state 4 became 3)", m.states.some((s) => s.id === 3) && !m.states.some((s) => s.id === 4), m.states.map((s) => s.id));
    rec("⭐⭐⭐ state 3 is in exactly one area — the one state 4 was in", JSON.stringify(areasOf(m, 3)) === "[2]", m.supplyAreas.map((a) => [a.id, a.states]));
    rec("…and nothing is reported about either", twoAreas(mod, NOGAME).length === 0 && reportsOf(mod, NOGAME).length === 0,
      twoAreas(mod, NOGAME).concat(reportsOf(mod, NOGAME)).map((x) => x.rule));
  }

  console.log("\n7. ⚠️ The rule is silent on every map that ships");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    if (!fs.existsSync(path.join(VAN, "map", "definition.csv"))) console.log("  ..   (the base game is not installed)");
    else {
      const roots = [["vanilla", VAN]];
      if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
        const p = path.join(WS, id);
        if (fs.existsSync(path.join(p, "map", "definition.csv"))) roots.push(["ws-" + id, p]);
      }
      let members = 0;
      for (const [label, root] of roots) {
        const m = md.buildMapModel({ modRoot: root, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true });
        for (const a of m.supplyAreas) members += a.states.length;
        const rep = md.validateMapModel(m).filter((x) => x.rule === RULE);
        rec(`⭐⭐ ${label}: nothing reported (${m.supplyAreas.length} area(s))`, rep.length === 0, rep.map((x) => String(x.message).slice(0, 120)));
        rec(`…and nothing dangles there`, dangling(m).length === 0, dangling(m).slice(0, 10));
      }
      rec(`${roots.length} shipping map(s), ${members} supply-area members examined — not a vacuous pass`,
        roots.length >= 2 && members > 1000, { maps: roots.length, members });
    }
  }

  console.log(`\n=== a deleted state leaves no supply area behind: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
