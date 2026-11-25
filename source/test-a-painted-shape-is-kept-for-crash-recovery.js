// ⛔ #a-painted-shape-is-kept-for-crash-recovery — A 🎨 PAINT SHAPE STROKE IS KEPT FOR CRASH RECOVERY, AND RESTORE PUTS IT BACK ON THE MAP.
//
// B6-14 (tool campaign, CONFIRMED, low): with only a stroke staged ("💾 Save changes (1)"), localStorage held no recovery entry and the
// next page of the same mod showed no bar. saveMapBackup kept pendingWrites only; paintDiff was left out, which only a code comment said.
//
// The fix (public/map.js saveMapBackup, checkMapBackup, showRestoreBar): the stroke's pixels are kept beside the writes as flat
// [x, y, rgb] triples with the size of the bitmap they were painted on — written a moment after the stroke's last change, since a drag
// changes paintDiff on every mousemove. The bar names the stroke, and Restore puts it back on the map pixel by pixel, unless the map
// shown now is another size or lacks one of its province colours. A stroke larger than localStorage takes is left out, the writes are
// kept, and the bar says the stroke is lost.
//
// Run, not read: the page's own saveMapBackup, readMapBackup, checkMapBackup and showRestoreBar, lifted out of public/map.js into two
// sandboxes that share one localStorage (the page that made the stroke, and the next page of the same mod).
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const FNS = [["const MAP_BACKUP_KEY = ", "\n"], "function saveMapBackup()", "function readMapBackup()", "function checkMapBackup(", "function showRestoreBar(b)"];
const KEY = "nova_map_unsaved_backup";
const W = 64, H = 48;
const PROV = { a: [10, 20, 30], b: [200, 100, 50] };
const pack = (c) => (c[0] << 16) | (c[1] << 8) | c[2];

function storage(limit = Infinity) {
  const store = new Map();
  return { store, setItem: (k, v) => { if (String(v).length > limit) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } store.set(k, String(v)); }, getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: (k) => store.delete(k) };
}
function page(ls, over = {}) {
  const els = new Map();
  const $ = (id) => { if (id === "mapRestoreBar" && !els.has(id)) return null; if (!els.has(id)) els.set(id, T.element()); return els.get(id); };
  const calls = { recolor: 0, grid: 0, dirty: [] };
  const g = Object.assign({
    localStorage: ls, $, modPath: () => "D:/fixture/mod", model: { states: [] },
    pendingWrites: [], paintDiff: new Map(), imgW: W, imgH: H,
    colorToProvince: new Map([[pack(PROV.a), 1], [pack(PROV.b), 2]]),
    baseImageData: { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) },
    buildPidGrid: () => { calls.grid++; }, computeCentroids: () => {}, recolorAll: () => { calls.recolor++; }, draw: () => {},
    setMapDirty: (d) => { calls.dirty.push(d); }, rebuildStagedRiversFromPending: () => {}, loadRiversOverlay: () => {}, stagedRiverEdits: [], riversShow: false,
  }, over);
  const p = T.runPage(FNS, g);
  // showRestoreBar makes its bar with document.createElement: the last overlay is it
  return { sb: p.sb, statuses: p.statuses, els, calls, bar: () => p.overlays[p.overlays.length - 1] || null, last: () => p.statuses[p.statuses.length - 1] || "" };
}
const stroke = (sb, pixels) => { for (const [x, y, c] of pixels) sb.paintDiff.set(x + "," + y, { x, y, r: c[0], g: c[1], b: c[2] }); };
const STROKE = [[5, 6, PROV.b], [6, 6, PROV.b], [7, 6, PROV.b]];
const ONE_WRITE = [{ url: "/api/map/set-owner", body: { stateId: 29, owner: "GER" }, meta: {} }];
const clickRestore = (P) => { const b = P.els.get("mapRestoreBtn"); const fn = b && (b.listeners.click || [])[0]; if (fn) fn(); return typeof fn === "function"; };
const px = (sb, x, y) => { const o = (y * W + x) * 4, d = sb.baseImageData.data; return [d[o], d[o + 1], d[o + 2]]; };

(async () => {
  // ── 1. the page that made the stroke ──
  let ls = storage();
  let A = null;
  try { A = page(ls); } catch (e) { rec("saveMapBackup / readMapBackup / checkMapBackup / showRestoreBar lift out of public/map.js", false, e.message); }
  if (A) {
    stroke(A.sb, STROKE);
    A.sb.saveMapBackup();
    rec("while a stroke is being drawn the backup waits for its last change (not one write per mousemove)", !ls.store.has(KEY), ls.store.get(KEY));
    await settle(450);
    const b = JSON.parse(ls.store.get(KEY) || "null");
    rec("⭐⭐⭐ a staged stroke alone leaves a recovery entry, with its pixels and the bitmap's size", !!b && Array.isArray(b.paint) && b.paint.length === 9 && b.paint[2] === pack(PROV.b) && JSON.stringify(b.paintSize) === JSON.stringify([W, H]) && Array.isArray(b.writes) && b.writes.length === 0, b);

    // ── 2. the next page of the same mod ──
    const B = page(ls);
    B.sb.checkMapBackup(B.sb.readMapBackup());
    const bar = B.bar();
    const said = bar ? String(bar.innerHTML) : "";
    rec("⭐⭐⭐ the next page of the mod shows the bar for it, naming the painted shape", !!bar && bar.style.display === "flex" && /painted province shape of 3 pixels was kept/.test(said) && /Restore puts it back on the map, unsaved/.test(said), said.slice(0, 600));
    rec("…with a Restore button", clickRestore(B));
    rec("⭐⭐⭐ Restore puts the stroke back in paintDiff, pixel for pixel", B.sb.paintDiff.size === 3 && STROKE.every(([x, y, c]) => { const p = B.sb.paintDiff.get(x + "," + y); return p && p.r === c[0] && p.g === c[1] && p.b === c[2]; }), [...B.sb.paintDiff.values()]);
    rec("⭐⭐ …and on the map: the bitmap the page draws holds its colour, and the map is recoloured", STROKE.every(([x, y, c]) => JSON.stringify(px(B.sb, x, y)) === JSON.stringify(c)) && B.calls.recolor === 1 && B.calls.grid === 1, { px: STROKE.map(([x, y]) => px(B.sb, x, y)), calls: B.calls });
    rec("⭐ …says so, unsaved, and marks the page dirty", /^Restored your painted province shape \(3 pixels\): it is back on the map, unsaved/.test(B.last()) && B.calls.dirty.indexOf(true) !== -1 && bar.style.display === "none", B.last());
    rec("…and does not mark a reload after the Save: there are no writes to show", !B.sb.model.recoveredQueue, B.sb.model);
  }

  // ── 3. THE CONTROL: writes alone are written at once, as before ──
  {
    const ls2 = storage();
    const C = page(ls2, { pendingWrites: ONE_WRITE.slice() });
    C.sb.saveMapBackup();
    const b = JSON.parse(ls2.store.get(KEY) || "null");
    rec("THE CONTROL: a queue of writes with no stroke is written at once, with no paint in it", !!b && b.writes.length === 1 && b.paint === undefined, b);
  }

  // ── 4. a stroke with writes: both come back, and the line says which is on the map ──
  {
    const ls3 = storage();
    const D = page(ls3, { pendingWrites: ONE_WRITE.slice() });
    stroke(D.sb, STROKE);
    D.sb.saveMapBackup(true);   // the deferred write itself (what the timer and the page's pagehide call)
    const E = page(ls3);
    E.sb.checkMapBackup(E.sb.readMapBackup());
    const said = String((E.bar() || {}).innerHTML || "");
    rec("a stroke kept with writes: the bar counts the edits and names the shape with them", /<b>1<\/b> unsaved map edit from a previous session/.test(said) && /With them, a painted province shape of 3 pixels was kept/.test(said), said.slice(0, 600));
    clickRestore(E);
    rec("⭐⭐ Restore puts back both: the write in the queue, the stroke on the map", E.sb.pendingWrites.length === 1 && E.sb.paintDiff.size === 3 && E.sb.model.recoveredQueue === true && /Your painted province shape \(3 pixels\) is back on the map too/.test(E.last()), { q: E.sb.pendingWrites.length, paint: E.sb.paintDiff.size, said: E.last() });
  }

  // ── 5. the map shown now is not the one the stroke was painted on ──
  for (const [label, over, why] of [
    ["another size", { imgW: W + 8 }, /the province map is 72×48 now, not the 64×48 it was painted on/],
    ["a colour no province has", { colorToProvince: new Map([[pack(PROV.a), 1]]) }, /3 of its pixels are of a province this map no longer has/],
  ]) {
    const ls4 = storage();
    const F = page(ls4); stroke(F.sb, STROKE); F.sb.saveMapBackup(true);
    const G = page(ls4, over);
    G.sb.checkMapBackup(G.sb.readMapBackup());
    clickRestore(G);
    rec(`⭐⭐ a stroke is not put back on a map of ${label}, and the line says why`, G.sb.paintDiff.size === 0 && why.test(G.last()) && G.calls.recolor === 0, { paint: G.sb.paintDiff.size, said: G.last() });
  }

  // ── 6. the map is still being drawn ──
  {
    const ls5 = storage();
    const F = page(ls5); stroke(F.sb, STROKE); F.sb.saveMapBackup(true);
    const G = page(ls5, { baseImageData: null });
    G.sb.checkMapBackup(G.sb.readMapBackup());
    clickRestore(G);
    rec("a Restore clicked before the map is drawn waits, and keeps the bar", G.sb.paintDiff.size === 0 && /still being drawn/.test(G.last()) && G.bar().style.display === "flex", { said: G.last() });
  }

  // ── 7. a stroke larger than localStorage takes ──
  {
    const ls6 = storage(1500);
    const big = []; for (let x = 0; x < 60; x++) for (let y = 0; y < 8; y++) big.push([x, y, PROV.a]);
    const F = page(ls6, { pendingWrites: ONE_WRITE.slice() }); stroke(F.sb, big); F.sb.saveMapBackup(true);
    const b = JSON.parse(ls6.store.get(KEY) || "null");
    rec("⭐⭐ a stroke larger than the quota is left out, the writes are kept, and the record counts the lost pixels", !!b && b.writes.length === 1 && b.paint === undefined && b.paintNotKept === 480, b);
    const G = page(ls6);
    G.sb.checkMapBackup(G.sb.readMapBackup());
    rec("⭐ …and the bar says the shape was too large to keep", /painted province shape of 480 pixels was too large to keep, and is lost/.test(String((G.bar() || {}).innerHTML || "")), String((G.bar() || {}).innerHTML || "").slice(0, 600));
    const ls7 = storage(1500);
    const F2 = page(ls7); stroke(F2.sb, big); F2.sb.saveMapBackup(true);
    const G2 = page(ls7);
    G2.sb.checkMapBackup(G2.sb.readMapBackup());
    const said = String((G2.bar() || {}).innerHTML || "");
    rec("…even with no writes: the bar still says so, and offers no Restore of nothing", /480 pixels was too large to keep/.test(said) && !/id="mapRestoreBtn"/.test(said), said.slice(0, 600));
  }

  // ── 8. derived from the source, comments masked: every store the 💾 Save button counts as unsaved work is in the backup ──
  {
    const M = T.MASKED;
    const at = M.indexOf("\n  function updateSaveButton()");
    const line = at === -1 ? "" : (/const n = ([^;]+);/.exec(M.slice(at, M.indexOf("\n  }", at))) || [])[1] || "";
    const stores = [...new Set([...line.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:&&\s*\1\s*)?\.(?:length|size)\b/g)].map((m) => m[1]))];
    const sAt = M.indexOf("\n  function saveMapBackup()");
    const body = sAt === -1 ? "" : M.slice(sAt, M.indexOf("\n  }", sAt));
    rec("the Save button counts its stores (the probe: pendingWrites and paintDiff)", stores.indexOf("pendingWrites") !== -1 && stores.indexOf("paintDiff") !== -1, { line, stores });
    const missing = stores.filter((s) => !new RegExp("\\b" + s + "\\b").test(body));
    rec("⭐⭐ every store the 💾 Save button counts is read by saveMapBackup", missing.length === 0, missing);
  }

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
  console.log("All green");
  process.exit(0);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
