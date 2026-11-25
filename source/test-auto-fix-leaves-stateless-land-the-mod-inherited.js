// Auto-fix leaves land the layer below already keeps in no state alone: one click never files it into a state — and copies that
// state's file into the mod to do it — when land_not_in_state does not report it. #auto-fix-leaves-stateless-land-the-mod-inherited
//
// THE DEFECT. land_not_in_state reports a land province in no state only when the mod could have caused it: a layer below had it in
// a state the mod's copy no longer lists, or the mod's definition.csv made it land. fixStatelessLand, which autoFixMap runs on every
// click and again after the inland-sea pass, asked neither question: it filed every stateless land province into a neighbouring
// state, copying that state's file into the mod.
//
// MEASURED on the base commit 21808ba, while building the fixture for #a-warning-auto-fix-leaves-alone-offers-no-auto-fix: a map
// whose game layer leaves two land provinces in no state, with a mod shipping one state of its own. The validator reported no
// land_not_in_state, and one Auto-fix click added both provinces to the mod's state (statelessLand fixed 2) — after which the
// validator reported coastal_no_port for one of them, a problem the click created. In the installed-mod sweep the same fixer wrote
// Millennium Dawn's 411-Badakhstan.txt and Old World Blues' 1174-State.txt into add-ons, filing land that fixInlandSeas had just made
// out of the dependency's sea.
//
// THE FIX. The rule's question is one helper, statelessLandIsTheModsOwn, and the fixer files only the provinces it answers yes for.
// Land the mod's own state file dropped is still filed back (section 2).
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhstateless-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhstateless-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
// 256x256: a sea strip on top (1); under it land 2 on the left — in no state in the game — and state 1: land 3 (on the sea) over land 4.
const W = 256, H = 256;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
const provAt = (x, y) => (y < 64 ? 1 : x < 128 ? 2 : y < 160 ? 3 : 4);
const st = (provs, manpower = 1000) => `state={\n\tid=1\n\tname="STATE_1"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces={ ${provs} }\n}\n`;
const GAME = dir("game", {
  "map/provinces.bmp": bmp24(W, H, (x, y) => COL[provAt(x, y)]),
  "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\r\n") + "\r\n",
  // state 1's air base and rocket site on 4 (pixel 192,208 -> z 47), and its port on 3 (pixel 192,64 -> z 191) facing sea 1
  "map/buildings.txt": ["1;air_base;192.00;9.50;47.00;0.00;0", "1;rocket_site_spawn;192.00;9.50;47.00;0.00;0", "1;naval_base_spawn;192.00;9.50;191.00;0.00;1"].join("\n"),
  "history/states/1-Inland.txt": st("3 4"),
});
const stateless = (modRoot) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }))
  .filter((p) => p.rule === "land_not_in_state").flatMap((p) => p.provinces || []);
const listed = (d) => { const p = path.join(d, "history", "states", "1-Inland.txt"); if (!fs.existsSync(p)) return null; const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(p, "utf8")); return m ? m[1].trim().split(/\s+/).map(Number).sort((a, b) => a - b) : null; };

try {
  console.log("\n=== THE CONTROL: the game carries land in no state ===");
  {
    const own = md.validateMapModel(md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }))
      .filter((p) => p.rule === "land_not_in_state").flatMap((p) => p.provinces || []);
    rec("the game, judged as the map being edited, reports its stateless province 2", own.join() === "2", own);
  }

  console.log("\n=== 1. a mod over it: the game's stateless land is neither reported nor filed into a state ===");
  {
    const bare = dir("bare", { "descriptor.mod": 'name="Bare"\n' });
    rec("THE CONTROL: the validator tells the mod nothing about province 2 (land_not_in_state's gate)", stateless(bare).length === 0, stateless(bare));
    const r = md.fixStatelessLand({ modRoot: bare, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ fixStatelessLand files none of it", !!r && !r.error && (r.fixed || 0) === 0, r);
    rec("⭐⭐⭐ …and copies no state file into the mod", !fs.existsSync(path.join(bare, "history", "states")), fs.existsSync(path.join(bare, "history", "states")) ? fs.readdirSync(path.join(bare, "history", "states")) : "");
    const c = dir("click", { "descriptor.mod": 'name="Click"\n', "history/states/1-Inland.txt": st("3 4", 0) });
    const r1 = md.autoFixMap({ modRoot: c, gameRoot: GAME, dependencyRoots: [] });
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the mod's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click files no inherited land into the mod's state", ((r1.fixes || {}).statelessLand || { fixed: 0 }).fixed === 0 && JSON.stringify(listed(c)) === "[3,4]",
      { statelessLand: (r1.fixes || {}).statelessLand, provinces: listed(c) });
    rec("⭐⭐ …so it leaves no new portless coast behind", !md.validateMapBitmap({ modRoot: c, gameRoot: GAME, dependencyRoots: [] }).some((p) => p.rule === "coastal_no_port"));
  }

  console.log("\n=== 2. …but land the mod's own state file dropped IS reported and filed back ===");
  {
    const a = dir("own", { "descriptor.mod": 'name="Own"\n', "history/states/1-Inland.txt": st("4") });
    rec("THE CONTROL: the validator reports province 3, which the game kept in state 1, and not 2", stateless(a).join() === "3", stateless(a));
    const r = md.fixStatelessLand({ modRoot: a, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ fixStatelessLand files province 3, and only it", !!r && r.fixed === 1 && (r.details || []).map((x) => x.province).join() === "3", r);
    rec("⭐⭐ …into the mod's state 1, which now lists 3 and 4 and not 2", JSON.stringify(listed(a)) === "[3,4]", listed(a));
    rec("…and the validator has nothing left to report", stateless(a).length === 0, stateless(a));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves stateless land the mod inherited: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
