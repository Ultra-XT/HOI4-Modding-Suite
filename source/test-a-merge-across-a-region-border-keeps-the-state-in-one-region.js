// A merge across a strategic-region border keeps the merged state in one region.
// #a-merge-keeps-the-state-in-one-region
//
// THE DEFECT. mergeState (map-data.js) moves every province of the source state into the target and deletes the source; the
// page's doMergeState simulates the same and queues /api/map/merge-state after its capital and inBaseLayer refusals. Neither
// looked at strategic regions. Merge a state into a neighbour across a region border and the target straddles two regions:
// state_split_strategic_regions, FATAL ("refuses-to-load": hoi4.exe logs "belonging to different strategic areas" and fails the
// map load), found only after Save had written it.
//
// MEASURED on the six shipping maps (batch 8, census-region-merge.js): neighbouring state pairs in different regions — vanilla
// 1,096 of 2,400 (45.7%), Millennium Dawn 856 of 2,776, Road to 56 1,099 of 2,538, Old World Blues 1,164 of 3,913, Novum
// Vexillum 920 of 3,040, Rise of Nations 865 of 2,558. No shipping state spans two regions.
//
// THE DECISION (the owner's standing order: decide it, and say in the status line what the merge did to regions). The merged
// state ends in ONE region — the choice Move Province's region dialog offers: the source's provinces join the target's region.
// That can cut a naval region in two, the other FATAL shape (a region listing a sea province must be one connected piece, judged
// on the graph hoi4.exe builds): measured, it would for 0-23 of those pair-directions per map. Then the target's provinces join
// the source's region instead; when both would cut one, nothing is written and the merge is refused. Leaving a region with no
// provinces is legal (hoi4.exe checks only a region that lists a sea province) and is said, not refused. The page cannot judge a
// cut (it needs the bitmap graph), so it stages the first choice and adopts what the server wrote.
//
// Requests are the page's: doMergeState (lifted out of public/map.js and run) queues "/api/map/merge-state" { sourceStateId,
// targetStateId }; flushMapSaves posts Object.assign({}, body, { modPath }); then GET /api/map/validate and the Save gate.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b8-merge-regions");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
function lift(src, name) {
  const masked = maskJsComments(src);
  const a = masked.indexOf("function " + name + "(");
  if (a < 0) return null;
  let paren = 0, bodyStart = -1;
  for (let i = masked.indexOf("(", a); i < masked.length; i++) {
    if (masked[i] === "(") paren++;
    else if (masked[i] === ")") { paren--; if (!paren) { bodyStart = masked.indexOf("{", i); break; } }
  }
  if (bodyStart < 0) return null;
  let d = 0, end = -1;
  for (let i = bodyStart; i < masked.length; i++) {
    if (masked[i] === "{") d++;
    else if (masked[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : src.slice(a, end);
}
const LIFT = {};
for (const n of ["setProvinceRegionLocally", "mergeRegionPlan", "adoptMergeRegions", "doMergeState", "stateNavalLevels", "navalDatedAfterCarry", "giveNavalDated", "moveProvinceLevels"]) LIFT[n] = lift(MAP, n);   // (the last three: ⛔ #a-deleted-state-says-every-dockyard-it-takes, how the click sums the dockyards' dated moments)

/** The page's merge click, run against the model the page holds. */
function pageHarness(pageModel) {
  const statuses = [], queued = [];
  const stateById = new Map((pageModel.states || []).map((s) => [s.id, s]));
  const scope = {
    model: pageModel, stateById, provinceToOwner: {}, queueWrite: (url, body, meta) => queued.push({ url, body, meta }),
    setStatus: (s) => statuses.push(String(s)), pushUndo: () => {}, recolorAll: () => {}, draw: () => {},
    selected: null, stateFormBaseline: null, info: { style: {} },
  };
  const body = [LIFT.setProvinceRegionLocally, LIFT.mergeRegionPlan || "", LIFT.adoptMergeRegions || "", LIFT.stateNavalLevels || "", LIFT.navalDatedAfterCarry || "", LIFT.giveNavalDated || "", LIFT.moveProvinceLevels || "", (MAP.match(/const NAVAL_ONLY_STATE_KEYS = [^;]*;/) || [""])[0], LIFT.doMergeState].join("\n")
    + "\nreturn { merge: doMergeState, adopt: (typeof adoptMergeRegions === \"function\") ? adoptMergeRegions : null };";
  const fns = new Function(...Object.keys(scope), body)(...Object.values(scope));
  return { merge: fns.merge, adopt: fns.adopt, statuses, queued, last: () => statuses[statuses.length - 1] || "" };
}

const splits = (v) => ((v && v.problems) || []).filter((p) => p.rule === "state_split_strategic_regions");
const fractions = (v) => ((v && v.problems) || []).filter((p) => p.rule === "fractioned_naval_region");
const sortNum = (a) => a.slice().map(Number).sort((x, y) => x - y);
const regionOf = (m, id) => (m.strategicRegions || []).find((r) => r.id === id) || { provinces: [] };

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code, as this test runs it");
    rec("doMergeState and setProvinceRegionLocally are found in public/map.js", !!LIFT.doMergeState && !!LIFT.setProvinceRegionLocally);
    rec("the page still queues merge-state as { sourceStateId, targetStateId }", /queueWrite\("\/api\/map\/merge-state", \{ sourceStateId: sourceSid, targetStateId: targetSid \}/.test(maskJsComments(MAP)));
    rec("⭐ the page has a region plan for a merge, and adopts what the server wrote", !!LIFT.mergeRegionPlan && !!LIFT.adoptMergeRegions, { plan: !!LIFT.mergeRegionPlan, adopt: !!LIFT.adoptMergeRegions });

    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    /** The click, then the flush, then what the page and the server each hold. */
    async function mergeLikeThePage(mod, source, target) {
      const page = await model(mod);
      const h = pageHarness(page);
      h.merge(source, target);
      const staged = { status: h.last(), queued: h.queued.slice(), p2r: Object.assign({}, page.provinceToRegion) };
      const w = h.queued.find((q) => q.url === "/api/map/merge-state");
      const res = w ? await srv.post(w.url, w.body, mod) : { status: 0, body: {} };
      if (h.adopt && res.body && res.body.regions) h.adopt(res.body.regions);
      const server = await model(mod);
      return { h, page, staged, res, server };
    }
    const mirrors = (page, server, provinces) => provinces.every((p) => String(page.provinceToRegion[p]) === String(server.provinceToRegion[p]));

    console.log("\n1. ⭐⭐⭐ Merge a state into its neighbour across a land-region border");
    {
      // States 2 = { 2 5 } in region 2, 3 = { 3 } and 1 = { 4 } in region 3. Provinces 2 and 3 touch.
      const mod = world.mod("merge land regions", {
        "descriptor.mod": 'name="merge land regions"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        ...lib.GAME_STATES,
        "map/strategicregions/2-Land.txt": lib.region(2, "2 5"),
        "map/strategicregions/3-East.txt": lib.region(3, "3 4"),
      });
      const before = await srv.validate(mod);
      rec("CONTROL: before the merge no state is split", splits(before).length === 0, splits(before));
      const r = await mergeLikeThePage(mod, 3, 2);
      rec("the click queues the merge", r.staged.queued.length === 1 && r.staged.queued[0].body.sourceStateId === 3 && r.staged.queued[0].body.targetStateId === 2, r.staged.queued);
      rec("⭐⭐ the click shows province 3 in region 2 at once", String(r.staged.p2r[3]) === "2", r.staged.p2r);
      rec("⭐⭐ …and says so in the status line", /strategic region 2/.test(r.staged.status) && /Merged/.test(r.staged.status), r.staged.status);
      rec("the server merges", r.res.status === 200 && r.res.body.ok === true, { status: r.res.status, error: r.res.body.error });
      rec("⭐⭐ …and says it carried province 3 into region 2", r.res.body.regions && r.res.body.regions.to === 2 && JSON.stringify(r.res.body.regions.moved) === "[3]", r.res.body.regions);
      const s2 = (r.server.states || []).find((s) => s.id === 2) || {};
      rec("state 2 now holds 2, 3 and 5", JSON.stringify(sortNum(s2.provinces || [])) === "[2,3,5]", s2.provinces);
      rec("⭐⭐⭐ …all in strategic region 2", (s2.provinces || []).every((p) => r.server.provinceToRegion[p] === 2), (s2.provinces || []).map((p) => [p, r.server.provinceToRegion[p]]));
      rec("⚠️ region 3 keeps state 1's province 4", JSON.stringify(sortNum(regionOf(r.server, 3).provinces)) === "[4]", regionOf(r.server, 3).provinces);
      const after = await srv.validate(mod);
      rec("⭐⭐⭐ the validator reports no split state", splits(after).length === 0, splits(after));
      const g = await lib.saveGate(after);
      rec("⭐⭐ Save stops for nothing", g.crashes === 0, g.status);
      rec("⭐ the page's regions match what the server wrote", mirrors(r.page, r.server, [2, 3, 4, 5]), { page: r.page.provinceToRegion, server: r.server.provinceToRegion });
    }

    console.log("\n2. ⭐⭐⭐ Carrying the source out would cut a naval region in two: the target's provinces join the source's region instead");
    {
      // Region 1 (naval) = { sea 1, land 3, land 4 }: 3 joins sea 1 to 4. States 3 = { 3 } and 1 = { 4 } are in it; state 2 = { 2 5 }
      // is in region 2. Taking province 3 out of region 1 leaves { 1 } and { 4 } apart; moving 2 and 5 in keeps region 1 whole.
      const mod = world.mod("merge naval regions", {
        "descriptor.mod": 'name="merge naval regions"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        ...lib.GAME_STATES,
        "map/strategicregions/1-Sea.txt": lib.region(1, "1 3 4"),
        "map/strategicregions/2-Land.txt": lib.region(2, "2 5"),
      });
      const before = await srv.validate(mod);
      rec("CONTROL: before the merge nothing is split or cut", splits(before).length === 0 && fractions(before).length === 0, { splits: splits(before), fractions: fractions(before) });
      const r = await mergeLikeThePage(mod, 3, 2);
      rec("the click stages the first choice: province 3 into region 2", String(r.staged.p2r[3]) === "2" && /strategic region 2/.test(r.staged.status), { p2r: r.staged.p2r, status: r.staged.status });
      rec("the server merges", r.res.status === 200 && r.res.body.ok === true, { status: r.res.status, error: r.res.body.error });
      const reg = r.res.body.regions || {};
      rec("⭐⭐⭐ …carrying state 2's provinces into region 1 instead", reg.to === 1 && reg.direction === "target" && JSON.stringify(sortNum(reg.moved || [])) === "[2,5]", reg);
      rec("⭐⭐ …and says why, for the Save line", /region 1/.test(String(reg.note || "")) && /cut/.test(String(reg.note || "")), reg.note);
      const after = await srv.validate(mod);
      rec("⭐⭐⭐ no split state and no naval region cut in two", splits(after).length === 0 && fractions(after).length === 0, { splits: splits(after), fractions: fractions(after) });
      const g = await lib.saveGate(after);
      rec("⭐⭐ Save stops for nothing", g.crashes === 0, g.status);
      rec("⭐⭐ the page adopted the server's regions", mirrors(r.page, r.server, [1, 2, 3, 4, 5]), { page: r.page.provinceToRegion, server: r.server.provinceToRegion });
    }

    console.log("\n3. A region the merge empties is said, not refused");
    {
      const mod = world.mod("merge empties a region", {
        "descriptor.mod": 'name="merge empties a region"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        ...lib.GAME_STATES,
        "map/strategicregions/2-Land.txt": lib.region(2, "2 5"),
        "map/strategicregions/3-East.txt": lib.region(3, "3"),
        "map/strategicregions/4-South.txt": lib.region(4, "4"),
      });
      const r = await mergeLikeThePage(mod, 3, 2);
      rec("the click says region 3 is left with no provinces", /[Rr]egion 3 is left with no provinces/.test(r.staged.status), r.staged.status);
      rec("the server merges and names region 3 as emptied", r.res.status === 200 && r.res.body.ok === true && JSON.stringify((r.res.body.regions || {}).emptied) === "[3]", r.res.body.regions);
      const after = await srv.validate(mod);
      rec("⭐⭐ no split state, and Save stops for nothing", splits(after).length === 0 && (await lib.saveGate(after)).crashes === 0, (after.problems || []).map((p) => p.rule));
    }

    console.log("\n4. ⚠️ Both choices would cut a naval region: the plan refuses (the graph hoi4.exe floods)");
    {
      rec("mapData.mergeRegionPlan exists", typeof md.mergeRegionPlan === "function");
      if (typeof md.mergeRegionPlan === "function") {
        // Region 10 = { sea 1, land 2, sea 3 } joined only through 2; region 20 = { sea 4, land 5, sea 6 } joined only through 5. State 7 = { 2 },
        // state 8 = { 5 }, and 2 touches 5.
        const m = {
          provinces: [[1, "sea"], [2, "land"], [3, "sea"], [4, "sea"], [5, "land"], [6, "sea"]].map(([id, type]) => ({ id, type })),
          strategicRegions: [{ id: 10, provinces: [1, 2, 3] }, { id: 20, provinces: [4, 5, 6] }],
          provinceToRegion: { 1: 10, 2: 10, 3: 10, 4: 20, 5: 20, 6: 20 },
          states: [{ id: 7, provinces: [2] }, { id: 8, provinces: [5] }],
        };
        const nb = (extra = []) => { const g = new Map(); const link = (a, b) => { if (!g.has(a)) g.set(a, new Set()); if (!g.has(b)) g.set(b, new Set()); g.get(a).add(b); g.get(b).add(a); }; for (const [a, b] of [[1, 2], [2, 3], [4, 5], [5, 6], [2, 5], ...extra]) link(a, b); return g; };
        const refused = md.mergeRegionPlan(m, m.states[0], m.states[1], () => nb());
        rec("⚠️⚠️ merging 7 into 8 is refused, naming both cuts", refused.refused === true && refused.move.length === 0 && (refused.cuts || []).length === 2, refused);
        const reversed = md.mergeRegionPlan(m, m.states[0], m.states[1], () => nb([[4, 6]]));
        rec("CONTROL: with 4 and 6 joined, state 8's province joins region 10 instead", reversed.direction === "target" && reversed.to === 10 && JSON.stringify(reversed.move) === "[5]" && !reversed.refused, reversed);
        const land = JSON.parse(JSON.stringify(m)); for (const p of land.provinces) p.type = "land";
        const carried = md.mergeRegionPlan(land, land.states[0], land.states[1], () => { throw new Error("a land-only region needs no graph"); });
        rec("CONTROL: land-only regions are never judged — the source joins the target's region", carried.direction === "source" && carried.to === 20 && JSON.stringify(carried.move) === "[2]", carried);
      }
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a merge across a region border keeps the state in one region: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
