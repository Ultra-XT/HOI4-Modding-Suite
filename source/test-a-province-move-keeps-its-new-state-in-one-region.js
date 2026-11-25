// Moving a province into another state must not split that state across strategic regions without asking.
// #a-state-move-splits-the-region-in-silence
//
// The Move tool (and Fill mode after "New state") stages POST /api/map/move-province, and moveProvince carries
// the province's victory point, its province buildings and its buildings.txt anchors — every consistency concern
// except the one Nova's own validator names for this exact edit: "the classic result of moving a province into a
// state that's in a different strategic region without also moving its region assignment"
// (state_split_strategic_regions). doMoveProvince never touched provinceToRegion and never staged a region move.
//
// The mirror direction was already fixed in the same file: the Strat. region dropdown
// (#a-region-move-splits-the-state-in-silence) works out what a region move would leave behind and asks, offering
// the shape every shipping map has. This adopts that for the state move — the same regionMoveStrays decision, the
// same two-choice novaConfirm, the same staged /api/map/move-province-region write, through one shared helper.
//
// Measured on the six shipping maps: 0 of 7,494 states span more than one strategic region, while 27.3%-45.9% of
// adjacent state pairs sit in different regions (vanilla 1,083 of 2,362; Millennium Dawn 821 of 2,649). So roughly
// one border move in three produced a shape no shipping map has, and Save reported success.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statemove-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
// Lift one of the map page's functions by name: declared at two-space indent inside the page's IIFE, closed by the
// first line that starts with two spaces and a brace. A function that does not exist lifts as "" — so running the
// page's code as it stood shows the behaviour, not a harness error.
const lift = (name) => {
  const s = MASKED.indexOf("\n  function " + name + "(");
  if (s < 0) return "";
  const e = MASKED.indexOf("\n  }", s + 1);
  return e < 0 ? "" : MAP.slice(s + 1, e + 4);
};

// The page as doMoveProvince sees it: two states in two regions, and a third in the first region.
//   state 1 = {1 3}  region 10        state 2 = {2 4}  region 20        state 3 = {5}  region 10
function world() {
  const ctx = {
    console,
    window: {},
    status: "", undoLabels: [], asked: null, confirmFallback: 0,
    pendingWrites: [],
    autoFix: true, statusEl: null, paintDiff: new Map(), moveSource: null, moveTarget: null,
    provinceType: new Map([[1, "land"], [2, "land"], [3, "land"], [4, "land"], [5, "land"]]),
    provinceToOwner: { 1: "AAA", 3: "AAA", 2: "BBB", 4: "BBB", 5: "CCC" },
    model: {
      states: [{ id: 1, owner: "AAA", provinces: [1, 3] }, { id: 2, owner: "BBB", provinces: [2, 4] }, { id: 3, owner: "CCC", provinces: [5] }],
      provinceToState: { 1: 1, 3: 1, 2: 2, 4: 2, 5: 3 },
      provinceToRegion: { 1: 10, 3: 10, 2: 20, 4: 20, 5: 10 },
      strategicRegions: [{ id: 10, provinces: [1, 3, 5] }, { id: 20, provinces: [2, 4] }],
      capitals: {},
    },
  };
  ctx.stateById = new Map(ctx.model.states.map((s) => [s.id, s]));
  ctx.setStatus = (m) => { ctx.status = String(m); };
  ctx.pushUndo = (label) => { ctx.undoLabels.push(label); };
  ctx.queueWrite = (url, body, meta) => { ctx.pendingWrites.push({ url, body: body || {}, meta: meta || {} }); return { ok: true, deferred: true }; };
  ctx.setMapDirty = () => {}; ctx.recolorAll = () => {}; ctx.draw = () => {};
  ctx.deleteEmptiedStates = () => ({ deleted: [], keptCapitals: [], keptInherited: [] });
  ctx.inheritedEmptyWarning = () => "";
  ctx.window.novaConfirm = (msg, onYes, opts) => { ctx.asked = { msg: String(msg), onYes, opts: opts || {} }; };
  ctx.window.confirm = () => { ctx.confirmFallback++; return false; };
  vm.createContext(ctx);
  // (⛔ #a-moved-coast-takes-its-dockyards — doMoveProvince asks coastDockyardsThatGo, which reads the page's NAVAL_ONLY_STATE_KEYS; these
  // states hold no dockyard, so it asks nothing of the coast; and the discard below gives back what a cancelled move's click moved,
  // through unmirrorDroppedMove and reconcileNavalCarry)
  const navalKeys = (MASKED.match(/\n  const NAVAL_ONLY_STATE_KEYS = [^\n]*/) || [""])[0];
  vm.runInContext(["regionMoveStrays", "stateMoveRegionTarget", "setProvinceRegionLocally", "stageProvinceRegionMove", "doMoveProvince", "handleMoveClick", "coastDockyardsThatGo",
    "unmirrorDroppedMove", "reconcileNavalCarry", "stateNavalLevels", "navalLevelsWords", "navalDatedAfterCarry", "giveNavalDated", "moveProvinceLevels"]   // (the four before the last: ⛔ #a-deleted-state-says-every-dockyard-it-takes)
    .map(lift).join("\n") + navalKeys.replace(/^\n  const /, "\nvar "), ctx);
  return ctx;
}
const urls = (w) => w.pendingWrites.map((x) => x.url);
const regionsListing = (w, pid) => w.model.strategicRegions.filter((r) => r.provinces.includes(pid)).map((r) => r.id);

try {
  console.log("=== 🈯 why it matters, on the base game's own map ===");
  {
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(path.join(GAME, "map", "strategicregions"))) {
      console.log("  ..   (the base game is not installed — the corpus half cannot run)");
    } else {
      const m = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      const p2r = m.provinceToRegion || {};
      const regionsOf = (s) => new Set((s.provinces || []).map((p) => p2r[p]).filter((r) => r != null));
      const states = (m.states || []).filter((s) => (s.provinces || []).length);
      rec("⭐⭐ no base-game state is split across strategic regions", states.filter((s) => regionsOf(s).size > 1).length === 0,
        states.filter((s) => regionsOf(s).size > 1).length);
      const sb = { console };
      vm.createContext(sb);
      vm.runInContext(lift("regionMoveStrays") + "\n" + lift("stateMoveRegionTarget"), sb);
      const one = states.filter((s) => regionsOf(s).size === 1);
      const a = one[0];
      const ra = [...regionsOf(a)][0];
      const b = one.find((s) => [...regionsOf(s)][0] !== ra);
      const c = one.find((s) => s !== a && [...regionsOf(s)][0] === ra);
      const fn = sb.stateMoveRegionTarget;
      rec("the question is answerable from the page's own model (stateMoveRegionTarget exists)", typeof fn === "function", typeof fn);
      if (typeof fn === "function" && a && b && c) {
        rec(`⭐⭐⭐ a province of state ${a.id} (region ${ra}) moving into state ${b.id} must join region ${[...regionsOf(b)][0]}`,
          String(fn(a.provinces[0], b, p2r)) === String([...regionsOf(b)][0]), fn(a.provinces[0], b, p2r));
        rec(`⚠️ …and moving into state ${c.id}, already in region ${ra}, asks nothing`, fn(a.provinces[0], c, p2r) == null, fn(a.provinces[0], c, p2r));
      }
    }
  }

  console.log("\n=== the pure decision, run ===");
  {
    const sb = { console };
    vm.createContext(sb);
    vm.runInContext(lift("regionMoveStrays") + "\n" + lift("stateMoveRegionTarget"), sb);
    const fn = sb.stateMoveRegionTarget;
    rec("stateMoveRegionTarget was lifted", typeof fn === "function", typeof fn);
    if (typeof fn === "function") {
      const p2r = { 1: 10, 3: 10, 2: 20, 4: 20, 6: 30, 9: undefined };
      rec("⭐⭐⭐ a province from region 10 joining a state in region 20 must take region 20", String(fn(3, { provinces: [2, 4] }, p2r)) === "20", fn(3, { provinces: [2, 4] }, p2r));
      rec("⭐ …a state in the province's own region asks nothing", fn(3, { provinces: [1] }, p2r) == null, fn(3, { provinces: [1] }, p2r));
      rec("⚠️⚠️ …a new state with no provinces yet asks nothing — the first province sets its region", fn(3, { provinces: [] }, p2r) == null, fn(3, { provinces: [] }, p2r));
      rec("⚠️⚠️ …a state that is ALREADY split has no single right answer, so it does not guess", fn(3, { provinces: [2, 6] }, p2r) == null, fn(3, { provinces: [2, 6] }, p2r));
      rec("⚠️ …a province in NO region joining a state in region 20 is offered region 20", String(fn(9, { provinces: [2, 4] }, p2r)) === "20", fn(9, { provinces: [2, 4] }, p2r));
      rec("…and a missing state is handled, not thrown on", fn(3, null, p2r) == null, fn(3, null, p2r));
    }
  }

  console.log("\n=== ⛔ RUN doMoveProvince: a move that would split the state it joins ===");
  {
    const w = world();
    w.moveSource = { provinceId: 3, stateId: 1 };
    rec("doMoveProvince was lifted", typeof w.doMoveProvince === "function", typeof w.doMoveProvince);
    w.doMoveProvince(3, 1, 2);
    rec("⭐⭐⭐ moving province 3 (region 10) into state 2 (region 20) ASKS first", !!w.asked, urls(w));
    rec("⭐⭐ …and stages nothing until it is answered", w.pendingWrites.length === 0 && w.model.provinceToState[3] === 1, urls(w));
    rec("⭐ …naming the region the state is in", !!w.asked && /\b20\b/.test(w.asked.msg), w.asked && w.asked.msg.slice(0, 200));
    rec("⚠️ …with two real choices — the cancel button carries its own action", !!w.asked && typeof w.asked.opts.onCancel === "function", w.asked && Object.keys(w.asked.opts));
    rec("⚠️ …and the Move tool is disarmed while it asks", w.moveSource === null, w.moveSource);
  }
  {
    const w = world();
    w.doMoveProvince(3, 1, 2);
    if (w.asked) w.asked.onYes();
    rec("⭐⭐⭐ “move it with its region” stages the state move AND the region move",
      urls(w).join(",") === "/api/map/move-province,/api/map/move-province-region", urls(w));
    const rw = w.pendingWrites.find((x) => x.url === "/api/map/move-province-region") || {};
    rec("⭐⭐ …the region write carries the fields the dropdown's does", !!rw.body && rw.body.provinceId === 3 && String(rw.body.fromRegionId) === "10" && String(rw.body.toRegionId) === "20", rw.body);
    rec("⭐⭐ …the page now shows province 3 in region 20, and in no other region list",
      String(w.model.provinceToRegion[3]) === "20" && regionsListing(w, 3).join(",") === "20", { p2r: w.model.provinceToRegion[3], lists: regionsListing(w, 3) });
    rec("⭐ …in state 2", w.model.provinceToState[3] === 2 && w.stateById.get(2).provinces.includes(3), w.model.provinceToState[3]);
    rec("⚠️ …as ONE undo step, so a single Undo takes both back", w.undoLabels.length === 1, w.undoLabels);
  }
  {
    const w = world();
    w.doMoveProvince(3, 1, 2);
    if (w.asked && typeof w.asked.opts.onCancel === "function") w.asked.opts.onCancel();
    rec("⭐ “keep its old region” stages the state move only", urls(w).join(",") === "/api/map/move-province", urls(w));
    rec("…and leaves the region as it was", String(w.model.provinceToRegion[3]) === "10" && regionsListing(w, 3).join(",") === "10", regionsListing(w, 3));
    rec("…but the province did move", w.model.provinceToState[3] === 2, w.model.provinceToState[3]);
  }
  {
    const w = world();
    w.doMoveProvince(3, 1, 2);   // …and the dialog is dismissed: neither button runs
    rec("⚠️⚠️ dismissing the question performs no action at all", w.pendingWrites.length === 0 && w.model.provinceToState[3] === 1, urls(w));
  }

  console.log("\n=== …and moves that split nothing do not ask ===");
  {
    const w = world();
    w.doMoveProvince(1, 1, 3);
    rec("⭐ moving province 1 into state 3, already in region 10, is staged at once", !w.asked && urls(w).join(",") === "/api/map/move-province", { asked: !!w.asked, urls: urls(w) });
    const w2 = world();
    w2.model.states.push({ id: -1, owner: "NEW", provinces: [] });
    w2.stateById.set(-1, w2.model.states[w2.model.states.length - 1]);
    w2.doMoveProvince(3, 1, -1);
    rec("⚠️⚠️ the first province into a brand-new state is staged at once", !w2.asked && urls(w2).join(",") === "/api/map/move-province", { asked: !!w2.asked, urls: urls(w2) });
    const w3 = world();
    w3.provinceType.set(3, "sea");
    w3.doMoveProvince(3, 1, 2);
    rec("⚠️ a sea province is still refused before anything is asked", !w3.asked && w3.pendingWrites.length === 0 && /sea/.test(w3.status), w3.status.slice(0, 120));
  }

  console.log("\n=== Fill mode (after “New state”) says “Added” only once it has ===");
  {
    const w = world();
    w.moveTarget = 2;
    if (typeof w.handleMoveClick === "function") w.handleMoveClick(3, 1);
    rec("⭐ a click that would split the state asks", !!w.asked, urls(w));
    rec("⚠️ …and does not already report the province as added", !/Added province 3/.test(w.status), w.status.slice(0, 120));
    if (w.asked) w.asked.onYes();
    rec("⚠️ …then reports it once the answer lands, with the state's real count", /Added province 3/.test(w.status) && /3 provinces/.test(w.status), w.status.slice(0, 160));
    const w2 = world();
    w2.moveTarget = 3;
    if (typeof w2.handleMoveClick === "function") w2.handleMoveClick(1, 1);
    rec("…and a click that splits nothing reports straight away, as before", !w2.asked && /Added province 1/.test(w2.status), w2.status.slice(0, 120));
  }

  console.log("\n=== ⛔ Send what the client sends: replay the staged writes against map-data ===");
  {
    const NOGAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statemove-nogame-")); tmps.push(NOGAME);
    const writeWorld = (root) => {
      mk(path.join(root, "descriptor.mod"), 'name="SM"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="history/states"\n');
      mk(path.join(root, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5].map((i) => `${i};${i};${i};${i};land;false;plains;1`)).join("\r\n") + "\r\n");
      const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
      mk(path.join(root, "map", "strategicregions", "10-A.txt"), rg(10, "1 3 5"));
      mk(path.join(root, "map", "strategicregions", "20-B.txt"), rg(20, "2 4"));
      const st = (id, p, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = ${owner} }\n}\n`;
      mk(path.join(root, "history", "states", "1-S.txt"), st(1, "1 3", "AAA"));
      mk(path.join(root, "history", "states", "2-S.txt"), st(2, "2 4", "BBB"));
      mk(path.join(root, "history", "states", "3-S.txt"), st(3, "5", "CCC"));
    };
    // The same fields the two endpoints hand to map-data (server.js /api/map/move-province and /move-province-region).
    const replay = (root, writes) => {
      for (const x of writes) {
        const b = x.body || {};
        if (x.url === "/api/map/move-province") md.moveProvince({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [], provinceId: b.provinceId, fromStateId: b.fromStateId, toStateId: b.toStateId });
        else if (x.url === "/api/map/move-province-region") md.moveProvinceToRegion({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [], provinceId: b.provinceId, fromRegionId: b.fromRegionId, toRegionId: b.toRegionId });
      }
      md.clearMapLayerCache();
      return md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [], cacheStableLayers: true }));
    };

    const yes = world(); yes.doMoveProvince(3, 1, 2); if (yes.asked) yes.asked.onYes();
    const modYes = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statemove-yes-")); tmps.push(modYes);
    writeWorld(modYes);
    const pYes = replay(modYes, yes.pendingWrites);
    rec("⭐⭐⭐ saved with its region, state 2 is in ONE strategic region on disk", pYes.filter((p) => p.rule === "state_split_strategic_regions").length === 0,
      pYes.filter((p) => p.rule === "state_split_strategic_regions").map((p) => p.regions));
    rec("⭐ …no province is left in no region, and the move itself landed",
      !pYes.some((p) => p.rule === "province_no_region" || p.rule === "province_not_in_region") && md.buildMapModel({ modRoot: modYes, gameRoot: NOGAME, dependencyRoots: [], cacheStableLayers: true }).provinceToState[3] === 2,
      pYes.map((p) => p.rule));

    const no = world(); no.doMoveProvince(3, 1, 2); if (no.asked && no.asked.opts.onCancel) no.asked.opts.onCancel();
    const modNo = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statemove-no-")); tmps.push(modNo);
    writeWorld(modNo);
    const pNo = replay(modNo, no.pendingWrites);
    rec("…the control: saved WITHOUT its region, the validator reports exactly that split",
      pNo.filter((p) => p.rule === "state_split_strategic_regions").length === 1, pNo.map((p) => p.rule));
  }

  console.log("\n=== Discarding an unsaved new state takes back the region move that came with it ===");
  {
    const s = MASKED.indexOf("const PROVISIONAL_ID_FIELDS = [");
    const e = s < 0 ? -1 : MASKED.indexOf("pendingWrites = kept;", s);
    const block = s < 0 || e < 0 ? "" : MAP.slice(s, e + "pendingWrites = kept;".length);
    rec("the discard logic was lifted", block.length > 300, block.length);

    const w = world();
    // New state -1 is staged; province 2 (region 20) goes in first, then province 3 (region 10) with its region.
    w.model.states.push({ id: -1, owner: "NEW", provinces: [] });
    w.stateById.set(-1, w.model.states[w.model.states.length - 1]);
    w.pendingWrites.push({ url: "/api/map/create-state", body: {}, meta: { create: true, provisionalId: -1 } });
    w.doMoveProvince(2, 2, -1);
    w.doMoveProvince(3, 1, -1);
    const askedForThree = !!w.asked;
    if (w.asked) w.asked.onYes();
    // An unrelated region change made with the dropdown, which must survive the discard.
    if (typeof w.stageProvinceRegionMove === "function") w.stageProvinceRegionMove(5, "20");
    rec("setup: the second province into the new state asked, and was taken with its region",
      askedForThree && String(w.model.provinceToRegion[3]) === "20", { asked: askedForThree, region: w.model.provinceToRegion[3] });

    w.sid = -1; w.st = w.stateById.get(-1);   // (the handler's two locals)
    vm.runInContext(block, w);
    const left = w.pendingWrites;
    rec("⭐⭐⭐ the region move staged WITH the move into the discarded state is gone",
      !left.some((x) => x.url === "/api/map/move-province-region" && x.body && x.body.provinceId === 3), left.map((x) => x.url + ":" + (x.body && x.body.provinceId)));
    rec("⭐⭐ …province 3 is back in state 1 AND back in region 10 on the page",
      w.model.provinceToState[3] === 1 && String(w.model.provinceToRegion[3]) === "10" && regionsListing(w, 3).join(",") === "10",
      { state: w.model.provinceToState[3], region: w.model.provinceToRegion[3], lists: regionsListing(w, 3) });
    rec("⚠️ …while the unrelated dropdown region move survives", left.some((x) => x.url === "/api/map/move-province-region" && x.body && x.body.provinceId === 5)
      && String(w.model.provinceToRegion[5]) === "20", left.map((x) => x.url + ":" + (x.body && x.body.provinceId)));
  }

  console.log("\n=== one staging path for both region moves, so they cannot drift ===");
  {
    const handlerAt = MASKED.indexOf('$("miRegionSel").addEventListener("change"');
    const handler = handlerAt < 0 ? "" : MASKED.slice(handlerAt, MASKED.indexOf("\n  });", handlerAt));
    const mover = lift("doMoveProvince");
    rec("the dropdown stages its region moves through stageProvinceRegionMove", /stageProvinceRegionMove\(/.test(handler), handler.length);
    rec("…and so does the state move", /stageProvinceRegionMove\(/.test(maskJsComments(mover)), mover.length);
  }

  console.log(`\n=== a province move keeps its new state in one region: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (err) {
  console.error("HARNESS ERROR", err && err.stack ? err.stack.split("\n").slice(0, 10).join("\n") : err);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
