// ⛔ #a-discarded-new-state-gives-its-water-back (review of B1-29's Move twin, P1) — A NEW STATE A MOVE OR AN ERASE LEAVES HOLDING ONLY WATER IS
// DISCARDED, AND THE WATER GOES WHERE THE SAVE LEAVES IT.
//
// The Move twin's fix (#a-move-that-leaves-only-water-empties-the-state) counts land, so a "＋ New state" filled with a lake and some land, then
// emptied of its land, is now an emptied state, and Auto-fix discards it: a new state is never merged, its create leaves the queue, and the
// Save's purge (orphanedQueuedWrites) drops every move into it, so the files keep the lake where it was. The page took the lake out of every
// state and said "the water of province 13 stays where it is, in no state": after the Save the page had 13 in no state and the disk in state 5,
// until a reload, and the line was false. The erase's wet branch (B1-29) said the same of the same case. Now deleteEmptiedStates puts that water
// where the Save leaves it (the state its last move that still goes out took it to, or the one its first move took it from, followed through
// the merges queued since), and both lines name that state. A state of the mod's own that is deleted keeps the old words: its water is in no
// state on disk too.
//
// RUN, not grepped: the page's own doMoveProvince, eraseProvinceLocal, commitEraseStroke, deleteEmptiedStates and flushMapSaves (lifted by
// testlib-state-panel-page.js), each write sent to map-data.js as server.js's handler passes it, on a small world whose province 13 is a lake.
// Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-new-state-water-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
let seq = 0;
/** testlib's world (state 5 = [9, 13], 6 = [10, 11], 4 = [8, 12] …) with 13 a lake in definition.csv, as buildMapModel then reads it; with
 *  `regions`, state 6's provinces 10 and 11 in a strategic region 20 of their own and the rest in testlib's region 10. */
function world({ regions = false } = {}) {
  const roots = L.makeWorld(ROOT, `w${++seq}`);
  const def = path.join(roots.modRoot, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => { const c = l.split(";"); return Number(c[0]) === 13 ? [c[0], c[1], c[2], c[3], "lake", "false", "lakes", c[7]].join(";") : l; }).join("\n"));
  if (regions) {
    const ten = path.join(roots.modRoot, "map", "strategicregions", "10-R.txt");
    fs.writeFileSync(ten, fs.readFileSync(ten, "utf8").replace(/provinces = \{([^}]*)\}/, (m, ps) => "provinces = {" + ps.split(/(\s+)/).filter((t) => t !== "10" && t !== "11").join("") + "}"));
    L.write(roots.modRoot, "map/strategicregions/20-R.txt", "strategic_region = {\n\tid = 20\n\tname = \"STRATEGICREGION_20\"\n\tprovinces = {\n\t\t10 11\n\t}\n}\n");
  }
  const model = md.buildMapModel({ ...roots, cacheStableLayers: false });
  return { roots, pg: L.openPage(md, roots, model, { autoFix: true }) };
}
const provsOnDisk = (roots, sid) => ((/provinces\s*=\s*\{([^}]*)\}/.exec(L.stateText(roots, sid)) || [])[1] || "").trim().split(/\s+/).filter(Boolean).map(Number).sort((a, b) => a - b);
const diskStateOf = (roots, pid) => { for (let sid = 1; sid <= 12; sid++) if (provsOnDisk(roots, sid).includes(pid)) return sid; return null; };
const pageStateOf = (pg, pid) => { const sid = pg.ctx.model.provinceToState[pid]; return sid === undefined ? null : sid; };
const listedBy = (pg, pid) => pg.ctx.model.states.filter((s) => (s.provinces || []).includes(pid)).map((s) => s.id);
const diskRegionOf = (roots, pid) => {
  const d = path.join(roots.modRoot, "map", "strategicregions");
  for (const f of fs.readdirSync(d)) {
    const t = fs.readFileSync(path.join(d, f), "utf8");
    if (((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).includes(pid)) return Number((/\bid\s*=\s*(\d+)/.exec(t) || [])[1]);
  }
  return null;
};
const regionMovesOf = (pg, pid) => pg.queue().filter((w) => w.url === "/api/map/move-province-region" && w.body && w.body.provinceId === pid);

console.log("\n-- THE CONTROL: the world reads 13 as a lake, in state 5 with land 9 --");
{
  const { pg } = world();
  ok(pg.ctx.provinceType.get(13) === "lake" && JSON.stringify(pg.state(5).provinces.slice().sort((a, b) => a - b)) === "[9,13]", "province 13 is a lake on the page, in state 5 = [9, 13]", pg.state(5).provinces);
}

(async () => {
  console.log("\n-- 1. ↔ MOVE: A NEW STATE FILLED WITH LAKE 13 AND LAND 10, ITS LAND MOVED BACK OUT --");
  {
    const { roots, pg } = world();
    const N = pg.newState("AAA");
    pg.move(13, N); pg.move(10, N);
    ok(JSON.stringify(pg.state(N).provinces) === "[13,10]", "THE CONTROL: the new state holds the lake and the land", pg.state(N).provinces);
    const line = pg.move(10, 6);
    ok(!pg.ctx.stateById.has(N) && !pg.urls().includes("create-state"), "THE CONTROL: with no land left the new state is discarded (its create leaves the queue)", pg.urls());
    ok(pageStateOf(pg, 13) === 5 && JSON.stringify(listedBy(pg, 13)) === "[5]", "⭐⭐⭐ the page has the lake back in state 5, where the Save leaves it", { at: pageStateOf(pg, 13), listedBy: listedBy(pg, 13) });
    ok(/deleted New state 1, which had no land left: the water of province 13 goes to STATE_5, where 💾 Save leaves it/.test(line), "⭐⭐ the line says where the lake goes", line);
    ok(!/in no state/.test(line), "⭐ …and no longer that it is in no state", line);
    await pg.flush();
    ok(diskStateOf(roots, 13) === 5, "⭐⭐⭐ after the page's own 💾 Save the file lists 13 in state 5", { disk: diskStateOf(roots, 13), last: pg.last().slice(0, 300) });
    ok(diskStateOf(roots, 13) === pageStateOf(pg, 13), "⭐⭐⭐ …which is where the page has it", { disk: diskStateOf(roots, 13), page: pageStateOf(pg, 13) });
  }

  console.log("\n-- 2. ↔ MOVE: …AND WHEN THE STATE IT CAME FROM WAS MERGED AWAY SINCE, IT GOES WHERE THAT MERGE TOOK THE STATE --");
  {
    const { roots, pg } = world();
    const N = pg.newState("AAA");
    pg.move(13, N);
    pg.move(9, 4);   // state 5's last province: Auto-fix merges state 5 into state 4
    ok(!pg.ctx.stateById.has(5) && pg.urls().includes("merge-state"), "THE CONTROL: state 5 was merged into state 4", pg.urls());
    pg.move(10, N);
    const line = pg.move(10, 6);
    ok(pageStateOf(pg, 13) === 4 && JSON.stringify(listedBy(pg, 13)) === "[4]", "⭐⭐ the lake goes to state 4 on the page: the merge of state 5 takes it there on disk", { at: pageStateOf(pg, 13), listedBy: listedBy(pg, 13) });
    ok(/the water of province 13 goes to STATE_4, where 💾 Save leaves it/.test(line), "⭐ …and the line says so", line);
    await pg.flush();
    ok(diskStateOf(roots, 13) === 4 && diskStateOf(roots, 13) === pageStateOf(pg, 13), "⭐⭐⭐ after the Save the file lists 13 in state 4, as the page does", { disk: diskStateOf(roots, 13), page: pageStateOf(pg, 13), last: pg.last().slice(0, 300) });
  }

  console.log("\n-- 3. 🧹 ERASE: THE SAME NEW STATE, ITS LAND ERASED --");
  {
    const { roots, pg } = world();
    const N = pg.newState("AAA");
    pg.move(13, N); pg.move(10, N);
    pg.erase(10);
    const line = pg.last();
    ok(pg.ctx.provinceType.get(10) === "sea" && !pg.ctx.stateById.has(N), "THE CONTROL: 10 was erased, and the new state is discarded", { type: pg.ctx.provinceType.get(10), q: pg.urls() });
    ok(pageStateOf(pg, 13) === 5 && JSON.stringify(listedBy(pg, 13)) === "[5]", "⭐⭐⭐ the page has the lake back in state 5", { at: pageStateOf(pg, 13), listedBy: listedBy(pg, 13) });
    ok(/the water of province 13 goes to STATE_5, where 💾 Save leaves it/.test(line) && !/in no state/.test(line), "⭐⭐ the line says where it goes, and not that it is in no state", line);
    await pg.flush();
    ok(diskStateOf(roots, 13) === 5 && diskStateOf(roots, 13) === pageStateOf(pg, 13), "⭐⭐⭐ after the Save the file lists 13 in state 5, as the page does", { disk: diskStateOf(roots, 13), page: pageStateOf(pg, 13), last: pg.last().slice(0, 300) });
  }

  console.log("\n-- 4. THE CONTROL: A STATE OF THE MOD'S OWN DELETED WITH ITS LAKE LEAVES THE LAKE IN NO STATE, AS ITS FILE GOES --");
  {
    const { roots, pg } = world();
    pg.erase(9);
    const line = pg.last();
    ok(pg.urls().includes("delete-state") && !pg.ctx.stateById.has(5), "THE CONTROL: erasing state 5's last land queues its delete", pg.urls());
    ok(pageStateOf(pg, 13) === null && listedBy(pg, 13).length === 0, "⭐ its lake is in no state on the page", { at: pageStateOf(pg, 13), listedBy: listedBy(pg, 13) });
    ok(/the water of province 13 stays where it is, in no state\./.test(line), "⭐ …and the line says so, as before", line);
    await pg.flush();
    ok(diskStateOf(roots, 13) === null, "⭐ …and after the Save no file lists it", { disk: diskStateOf(roots, 13), last: pg.last().slice(0, 300) });
  }

  console.log("\n-- 5. ↔ MOVE ACROSS TWO STRATEGIC REGIONS: THE REGION MOVE MADE WITH THE LAKE'S MOVE GOES BACK WITH IT --");
  // The lake went into the new state with "Move it into region 20 too" (the harness answers yes). That region move names no state, so the Save's
  // purge kept it: the files then had lake 13 in state 5 and in region 20, state 5 split across two strategic regions (in the fatal set).
  {
    const { roots, pg } = world({ regions: true });
    const p2r = pg.ctx.model.provinceToRegion;
    ok(String(p2r[10]) === "20" && String(p2r[11]) === "20" && String(p2r[9]) === "10" && String(p2r[13]) === "10", "THE CONTROL: the page reads 10, 11 in region 20 and state 5 (9, 13) in region 10", { 9: p2r[9], 10: p2r[10], 11: p2r[11], 13: p2r[13] });
    const N = pg.newState("AAA");
    pg.move(10, N); pg.move(13, N);
    ok(String(pg.ctx.model.provinceToRegion[13]) === "20" && regionMovesOf(pg, 13).some((w) => w.meta && w.meta.forStateId === N), "THE CONTROL: the lake went into region 20 with its move into the new state", { at: pg.ctx.model.provinceToRegion[13], q: pg.urls() });
    const line = pg.move(10, 6);
    ok(!pg.ctx.stateById.has(N) && pageStateOf(pg, 13) === 5, "THE CONTROL: the new state is discarded and the lake is back in state 5", { at: pageStateOf(pg, 13), q: pg.urls() });
    ok(String(pg.ctx.model.provinceToRegion[13]) === "10" && regionMovesOf(pg, 13).length === 0, "⭐⭐⭐ the region move made with it is taken back: 13 is in region 10 again, with the rest of state 5", { at: pg.ctx.model.provinceToRegion[13], moves: regionMovesOf(pg, 13) });
    ok(/the water of province 13 goes to STATE_5, where 💾 Save leaves it: .* nor the move into strategic region 20 made with it/.test(line), "⭐⭐ …and the line says so", line);
    // the Save, each region move sent as server.js's handler passes it to map-data.js (the harness replays none)
    const send = pg.ctx.fetch;
    pg.ctx.fetch = async (url, o) => {
      if (String(url) !== "/api/map/move-province-region") return send(url, o);
      const b = JSON.parse(o.body), r = md.moveProvinceToRegion({ ...roots, provinceId: b.provinceId, fromRegionId: b.fromRegionId, toRegionId: b.toRegionId });
      return { json: async () => Object.assign({ ok: !r.error }, r) };
    };
    await pg.flush();
    ok(diskStateOf(roots, 13) === 5 && diskRegionOf(roots, 13) === 10 && diskRegionOf(roots, 9) === 10, "⭐⭐⭐ after the Save the files keep 13 in state 5 and in region 10, with 9: state 5 is in one strategic region", { state: diskStateOf(roots, 13), region13: diskRegionOf(roots, 13), region9: diskRegionOf(roots, 9), last: pg.last().slice(0, 300) });
    ok(diskRegionOf(roots, 10) === 20 && diskStateOf(roots, 10) === 6, "THE CONTROL: …and 10 is back in state 6, in region 20", { state: diskStateOf(roots, 10), region: diskRegionOf(roots, 10) });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("  FAIL harness threw: " + (e && e.stack)); process.exit(1); });
