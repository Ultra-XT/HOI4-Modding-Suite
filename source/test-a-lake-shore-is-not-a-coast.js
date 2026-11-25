// ⛔ #a-lake-shore-is-not-a-coast (B4-10, B4-11, B1-1, B1-18, B1-19) and #a-lake-made-sea-reaches-the-ocean (B1-26).
//
// HOI4's coastal flag means a border with a SEA province, not a lake (the wiki, quoted where the validator and fixCoastalFlags
// count it). The page's guards counted a lake as water in three places:
//   · the inspector's Coastal box (computeSeaAdjacency): a lake-only shore was ticked with no question, the Save then warned
//     coastal_province_has_no_sea and 🔧 un-ticked it (B4-10, vanilla 7696 beside lake 8653);
//   · …and its cache was built once a load, so after 🧹 Erase made a coast the box still said the province behind it "doesn't
//     border any sea or lake province" (B4-11, vanilla 13058 behind 10245);
//   · the Erase brush's isolated-water guard (and the server's provinceTouchesWater behind it): land whose only water is a lake
//     was made a sea no ship can reach (B1-1, vanilla 751 on the Great Lakes).
// And a lake made sea through the inspector had no guard at all: an inland lake became an isolated sea (B1-26, vanilla 2703,
// lone_sea_nobody_uses and fractioned_naval_region).
//
// This RUNS the page's own computeSeaAdjacency, eraseProvinceLocal and saveProvinceTerrain (lifted from public/map.js) on a small
// grid, and the server's own provinceTouchesWater on a small provinces.bmp.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ✓ " + m); else { fails.push(m); console.log("  ✗ " + m + (d !== undefined ? "  " + JSON.stringify(d).slice(0, 400) : "")); } };

// A 4x2 grid of provinces, each a 2x2 block:  [1 land][2 lake][5 land][4 sea]
//                                              [3 land][6 land][7 land][8 lake]
// 1 touches lake 2 and land 3 only; 5 touches lake 2, sea 4 and land 7; 6 and 7 touch lakes (2, 8) and land only; lake 8 touches sea 4.
const W = 8, H = 4;
const layout = [[1, 2, 5, 4], [3, 6, 7, 8]];
const pidGrid = Array.from({ length: W * H }, (_, i) => layout[Math.floor((i / W) / 2)][Math.floor((i % W) / 2)]);
const TYPES = { 1: "land", 2: "lake", 3: "land", 4: "sea", 5: "land", 6: "land", 7: "land", 8: "lake" };
const neighbours = () => {
  const adj = new Map();
  const add = (a, b) => { if (a === b) return; if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a).add(b); adj.get(b).add(a); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = pidGrid[y * W + x]; if (x + 1 < W) add(p, pidGrid[y * W + x + 1]); if (y + 1 < H) add(p, pidGrid[(y + 1) * W + x]); }
  return adj;
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lake-shore-"));
  try {
    const types = () => new Map(Object.entries(TYPES).map(([k, v]) => [Number(k), v]));
    const defs = () => new Map(Object.entries(TYPES).map(([k, v]) => [Number(k), { id: Number(k), type: v, coastal: false, terrain: v === "land" ? "plains" : v === "sea" ? "ocean" : "lakes", r: Number(k), g: 0, b: 0 }]));

    console.log("\n-- 1. THE COASTAL BOX COUNTS SEA, NOT LAKE (B4-10) --");
    const a = P.runPage(["function computeSeaAdjacency()"], P.loadGlobals({ seaAdjacent: null, pidGrid, imgW: W, imgH: H, provinceType: types() }));
    a.sb.computeSeaAdjacency();
    const sa = a.sb.seaAdjacent;
    ok(sa && sa.has(5) && sa.size === 1, "THE CONTROL: land beside the sea (5) borders the sea", sa && [...sa]);
    ok(sa && !sa.has(1) && !sa.has(6) && !sa.has(7), "⭐⭐⭐ land whose only water is a lake (1, 6, 7) does not", sa && [...sa]);
    const src = maskJsComments(P.lift("async function saveProvinceTerrain()"));
    ok(/doesn't border any sea province, so it isn't really coastal/.test(src) && !/any sea or lake province/.test(src), "⭐ the box's question says sea, as the rule does");

    console.log("\n-- 2. THE ERASE GUARD: A LAKE SHORE IS INLAND (B1-1), AND A NEW COAST IS ASKED AGAIN (B4-11) --");
    const LIFTS = ["function eraseProvinceLocal(pid)", "function computeSeaAdjacency()", "function queueWrite(url, body, meta)"];
    const pg = () => P.runPage(LIFTS, P.loadGlobals({
      seaAdjacent: null, pidGrid, imgW: W, imgH: H, provinceType: types(), provinceDef: defs(), provNeighborsCache: neighbours(), buildProvNeighbors: () => {},
      model: { states: [{ id: 9, provinces: [1, 3, 5, 6, 7] }], provinceToState: { 1: 9, 3: 9, 5: 9, 6: 9, 7: 9 }, supplyNodes: [], railways: [] }, stateById: new Map(),
      provinceToOwner: {}, pendingWrites: [], erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(), eraseSupplyRail: null,
      pushUndo: () => {}, paintDropRefusal: () => "", unmirrorDroppedMove: () => {}, moveProvinceLevels: () => {}, setProvinceRegionLocally: () => {},
    }));
    const b = pg();
    ok(b.sb.eraseProvinceLocal(1) === false && b.sb.eraseSkippedInland.has(1) && !b.sb.pendingWrites.length, "⭐⭐⭐ land whose only water is a lake is refused as inland: nothing queued", b.sb.pendingWrites);
    ok(b.sb.eraseProvinceLocal(5) === true && b.sb.pendingWrites.some((w) => w.url === "/api/map/flip-province-sea" && w.body.provinceId === 5), "THE CONTROL: land beside the sea is erased");
    const c = pg();
    c.sb.computeSeaAdjacency();
    ok(c.sb.seaAdjacent && !c.sb.seaAdjacent.has(7), "THE CONTROL: before the erase, 7 (behind 5) does not border the sea", c.sb.seaAdjacent && [...c.sb.seaAdjacent]);
    c.sb.eraseProvinceLocal(5);
    ok(c.sb.seaAdjacent === null, "⭐⭐ the erase forgets which land borders the sea");
    c.sb.computeSeaAdjacency();
    ok(c.sb.seaAdjacent && c.sb.seaAdjacent.has(7) && !c.sb.seaAdjacent.has(6), "⭐⭐ …so the province behind the new sea is a coast when the box asks next", c.sb.seaAdjacent && [...c.sb.seaAdjacent]);
    const M = maskJsComments(P.MAP);
    const sets = (M.match(/provinceType\.set\(pid, [^)]*\);[^\n]*/g) || []);
    ok(sets.length >= 4 && sets.every((l) => /seaAdjacent = null/.test(l)), `⭐ every one of the page's ${sets.length} type changes of one province forgets it`, sets);
    ok(/provinceType = new Map\(s\.provinceType\); seaAdjacent = null;/.test(M), "⭐ …and so does Undo / Redo (applyMapSnapshot)");

    console.log("\n-- 3. THE SERVER'S GUARD ASKS THE SAME (B1-1, map-data.js provinceTouchesWater) --");
    const MD = require("./map-data.js");
    const model = { provinces: Object.entries(TYPES).map(([k, v]) => ({ id: Number(k), type: v, r: Number(k) * 20, g: 10, b: 30 })) };
    const mod = path.join(tmp, "mod");
    fs.mkdirSync(path.join(mod, "map"), { recursive: true });
    const row = W * 3, pad = (4 - (row % 4)) % 4, stride = row + pad, size = 54 + stride * H;
    const bmp = Buffer.alloc(size);
    bmp.write("BM", 0); bmp.writeUInt32LE(size, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(stride * H, 34);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = pidGrid[y * W + x]; const o = 54 + (H - 1 - y) * stride + x * 3; bmp[o] = 30; bmp[o + 1] = 10; bmp[o + 2] = p * 20; }
    fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp);
    const touches = (id) => MD.provinceTouchesWater ? MD.provinceTouchesWater({ modRoot: mod, provinceId: id, model }) : null;
    if (typeof MD.provinceTouchesWater !== "function") {
      // not exported: the function's own text, comments masked, must ask for a sea neighbour and nothing else
      const MDS = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r\n/g, "\n"));
      const at = MDS.indexOf("function provinceTouchesWater(");
      const body = MDS.slice(at, MDS.indexOf("\n}\n", at));
      ok(at > 0 && /if \(t === "sea"\) return true;/.test(body) && !/"lake"/.test(body), "⭐⭐ provinceTouchesWater (flipProvinceToSea's map question) counts a SEA neighbour only", body.slice(-300));
    } else {
      ok(touches(5) === true, "THE CONTROL: the server finds the sea beside 5");
      ok(touches(1) === false, "⭐⭐ …and no sea beside 1, whose only water is a lake", touches(1));
    }

    console.log("\n-- 4. A LAKE MADE SEA MUST BORDER THE SEA (B1-26) --");
    const els = {};
    const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
    const run = (pid) => {
      const page = P.runPage(["async function saveProvinceTerrain()", "function queueWrite(url, body, meta)"], P.loadGlobals({
        $: (id) => els[id] || el(id), selected: { provinceId: pid }, provinceDef: defs(), provinceType: types(), pendingWrites: [], model: { states: [], terrainCategories: [] },
        provNeighborsCache: neighbours(), buildProvNeighbors: () => {}, pushUndo: () => {}, computeSeaAdjacency: () => {}, seaAdjacent: null,
        beginEraseStroke: () => {}, eraseProvinceLocal: () => false, commitEraseStroke: () => {},
      }));
      el("miTypeSel", { value: "sea" }); el("miTerrainSel", { value: "lakes" }); el("miCoastalChk", { checked: false });
      return page.sb.saveProvinceTerrain().then(() => page);
    };
    const inland = await run(2);
    ok(!inland.sb.pendingWrites.length && els.miTypeSel.value === "lake", "⭐⭐⭐ an inland lake (2: no sea beside it) is refused at the click, and the box goes back to lake", inland.sb.pendingWrites);
    ok(/is a lake with no sea province beside it/.test(String(inland.statuses[inland.statuses.length - 1])) && /Nothing was changed/.test(String(inland.statuses[inland.statuses.length - 1])), "⭐ …in one sentence that says why", inland.statuses.slice(-1));
    const coastLake = await run(8);
    ok(coastLake.sb.pendingWrites.length === 1 && coastLake.sb.pendingWrites[0].body.type === "sea", "THE CONTROL: a lake beside the sea (8, beside 4) is retyped as before", coastLake.sb.pendingWrites.map((w) => w.body));
  } catch (e) {
    ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a lake shore is not a coast: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
