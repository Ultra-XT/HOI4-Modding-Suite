// ⛔ #a-baseline-keeps-its-states-names × #delete-map-gives-back-the-cut — A BASELINE WITH NO NAMES LIST TAKES THE NAMES BEFORE THE FOLD
// TAKES THE PIECES' ONES. /api/map/blank-to-sea forgot the victory-point names of the provinces its fold gave back
// (forgetFoldedProvinceNames) and only then handed an older baseline — one with no list of Nova's state-names files — the names as
// they stood (keepStateNamesInOlderBaseline). So that baseline held no name for a point standing on a piece, and 🛟 Restore brought
// world 1 back with those points unnamed: 476 of 1,081 on the owner's world, 4,760 lines over ten languages (review of 5a1af33f, K1).
// Through the real endpoints (listen(0)), with the bodies public/map.js sends: Generate land, Save baseline (its names list then taken
// out, as a baseline from before ec825382 has none), Delete map, Restore baseline — every victory point of the restored world is named.
// Run: node test-an-older-baseline-keeps-the-names-a-fold-takes.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-older-baseline-names-"));
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!cond) fails.push(label);
};
const S = SW.makeShapes();
const game = path.join(ROOT, "game");
SW.makeGame(game, S, {});
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
/** every victory point the mod's own states stand: province ids */
const statePoints = (mod) => {
  const dir = path.join(mod, "history", "states"), out = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\r\n]*/g, "");
    for (const m of t.matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+[\d.]+\s*\}/g)) out.push(+m[1]);
  }
  return out;
};
/** the victory points Nova's own English state-names file names */
const namedPoints = (mod) => {
  const p = path.join(mod, "localisation", "english", "replace", "nova_state_names_l_english.yml");
  return new Set(fs.existsSync(p) ? [...fs.readFileSync(p, "utf8").matchAll(/^\s*VICTORY_POINTS_(\d+):/gm)].map((m) => +m[1]) : []);
};

(async () => {
  process.env.HOI4_ROOT = game;
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const M = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "names"), S, { name: "older baseline names" });
    const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, body, { modPath: M })) })
      .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
    // Generate land's body is the page's: { modPath, count, seed, ownerMode, owner, replacesExistingWorld }; Save/Restore baseline and Delete map send { modPath }
    const g = await post("/api/map/generate-land", { count: COUNT, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true });
    const pieces = new Set(md.readProvinceSplitRecord(M).families.flatMap((f) => f.pieces));
    const world1 = statePoints(M), named1 = namedPoints(M), onPieces = world1.filter((p) => pieces.has(p));
    rec("(control: the click cut, and named every victory point of its world — some of them on pieces)", g.s === 200 && g.b.ok === true && world1.length > 0 && world1.every((p) => named1.has(p)) && onPieces.length > 0,
      { status: g.s, error: g.b.error, points: world1.length, unnamed: world1.filter((p) => !named1.has(p)).length, onPieces: onPieces.length });
    const sv = await post("/api/map/save-baseline", {});
    const list = path.join(sv.b.baselinePath || "", "nova_state_names");
    // a baseline from before the names went into baselines: no list of Nova's files (this test's own temp folder)
    if (fs.existsSync(list)) fs.renameSync(list, list + ".as-an-older-nova-wrote-none");
    rec("(control: the baseline was saved, and holds no names — as an older one)", sv.s === 200 && sv.b.ok === true && !fs.existsSync(path.join(list, "_files.json")), { status: sv.s, error: sv.b.error });
    const bl = await post("/api/map/blank-to-sea", {});
    const pf = (bl.b && bl.b.provinceFold) || {};
    rec("(control: Delete map folded the pieces back, took their names out of Nova's file, and handed the baseline the names first)",
      bl.s === 200 && pf.changed === true && pf.names && pf.names.removed === onPieces.length && bl.b.baselineStateNames && bl.b.baselineStateNames.files > 0, { status: bl.s, names: pf.names, baselineStateNames: bl.b && bl.b.baselineStateNames });
    const rs = await post("/api/map/restore-baseline", {});
    const back = statePoints(M), namedBack = namedPoints(M), unnamed = back.filter((p) => !namedBack.has(p));
    rec("(control: Restore put world 1 back)", rs.s === 200 && rs.b.ok === true && back.length === world1.length, { status: rs.s, error: rs.b.error, points: back.length });
    rec("⭐⭐⭐ every victory point of the restored world is named again — those on the pieces the fold gave back among them",
      unnamed.length === 0, { unnamed: unnamed.length, onPieces: unnamed.filter((p) => pieces.has(p)).length, sample: unnamed.slice(0, 8) });
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 900));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
  }
  console.log(`\n=== an older baseline keeps the names a fold takes: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
