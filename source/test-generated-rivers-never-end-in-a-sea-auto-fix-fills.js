// A generated river never ends in a sea Auto-fix is about to fill — and may end in one the mod put to use.
// #a-generated-world-has-rivers (batch B, B3; critic R6)
//
// Auto-fix's fixInlandSeas turns a sea cut off from the ocean into land, unless the mod's own buildings.txt or unitstacks.txt put
// it to use, a mostly-water region holds it, or the layers below already ship it cut off. A river whose mouth opened into such a
// sea would end inland after the next Auto-fix. So the water a generated river may end in is sea and lake LESS the seas
// fixInlandSeas' PLAN (plan: true — the repair's own filters, never the dry run baseInlandSeaProvinces depends on) would fill.
//
// Fixture: the sample of testlib-river-world.js below; the mod owns the Voronoi world raised whole, its round lake typed SEA — a
// sea the new land encloses. Asked twice: as it is (the plan fills it), and with a port facing it (the plan keeps it).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rivers-cut-off-sea-"));
process.env.NOVA_HOME_DIR = path.join(TMP, "home");
process.env.NOVA_APP_DATA_DIR = path.join(TMP, "appdata");
process.env.APPDATA = path.join(TMP, "roaming");
process.env.XDG_CONFIG_HOME = path.join(TMP, "xdg");
for (const d of [process.env.NOVA_HOME_DIR, process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });

const md = require("./map-data.js");
const RW = require("./testlib-river-world.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const GAME = path.join(TMP, "game");
const S = RW.gridSample();
RW.writeMap(GAME, S);
const V = RW.voronoiWorld();
const ENCLOSED = 100001;   // voronoiWorld's round lake, typed sea here
const T = { ...V, type: Uint8Array.from(V.type, (t, k) => (V.pid[k] === ENCLOSED ? 2 : t)) };
const { W, H, N } = T;
const landIds = [...new Set(Array.from(T.pid).filter((p, k) => T.land[k]))];
const blank = Uint8Array.from(T.land, (l) => (l ? RW.BG : RW.SEA_BG));
const mod = (name, buildings = "") => {
  const d = path.join(TMP, "mods", name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${name}"\n`);
  RW.writeMap(d, T, { idx: blank });
  if (buildings) fs.writeFileSync(path.join(d, "map", "buildings.txt"), buildings);
  return d;
};
const readIdx = (file) => { const b = fs.readFileSync(file), m = md.readIndexedBmp(b), a = new Uint8Array(m.width * m.height); for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) a[y * m.width + x] = b[m.pixelOffset(x, y)]; return a; };
// river pixels in the enclosed sea, or 4-beside it
const intoEnclosed = (a) => { let n = 0; for (let k = 0; k < N; k++) if (RW.isRiverIndex(a[k]) && (T.pid[k] === ENCLOSED || RW.nb4(W, N, k).some((j) => T.pid[j] === ENCLOSED))) n++; return n; };

try {
  console.log("1. The enclosed sea, as Auto-fix's own plan judges it");
  const A = mod("Cut Off");
  const plan = md.fixInlandSeas({ modRoot: A, gameRoot: GAME, dependencyRoots: [], plan: true });
  rec("THE CONTROL: fixInlandSeas' plan fills the enclosed sea", plan && Array.isArray(plan.fill) && plan.fill.map(Number).includes(ENCLOSED), plan);

  console.log("\n2. No river ends in it");
  const r = md.generateRivers({ modRoot: A, gameRoot: GAME, dependencyRoots: [], provinceIds: landIds, seed: 1 });
  rec("THE CONTROL: rivers were drawn", r.changed === true && r.systems > 0, r.reason || r.error);
  rec("…and the result counts the sea Auto-fix will fill", r.seasAutoFixWillFill === 1, r.seasAutoFixWillFill);
  const a = readIdx(path.join(A, "map", "rivers.bmp"));
  rec("⭐ no river pixel in the enclosed sea or beside it", intoEnclosed(a) === 0, intoEnclosed(a));

  console.log("\n3. Put to use, it is water a river may end in");
  {
    // a port the modder placed before the click, its ships lying in the enclosed sea (buildings.txt's 7th column)
    const B = mod("Put To Use", `1;naval_base_spawn;330.00;9.50;100.00;0.00;${ENCLOSED}\r\n`);
    const kept = md.fixInlandSeas({ modRoot: B, gameRoot: GAME, dependencyRoots: [], plan: true });
    rec("THE CONTROL: the plan keeps it now", kept && !kept.fill.map(Number).includes(ENCLOSED), kept && kept.kept);
    const rb = md.generateRivers({ modRoot: B, gameRoot: GAME, dependencyRoots: [], provinceIds: landIds, seed: 1 });
    const b = readIdx(path.join(B, "map", "rivers.bmp"));
    rec("⭐ rivers reach it (so section 2's zero is the plan's subtraction, not the fixture's geography)", rb.changed === true && rb.seasAutoFixWillFill === 0 && intoEnclosed(b) > 0, { into: intoEnclosed(b), fill: rb.seasAutoFixWillFill });
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
