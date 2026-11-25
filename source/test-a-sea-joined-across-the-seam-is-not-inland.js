// A sea that reaches the ocean only across the wrap seam is not an inland sea. #the-wrap-seam-joins-a-region
//
// THE DEFECT. The map is a cylinder: column 0 touches column W-1. provinceNeighbourGraph links them, and so do hoi4.exe's
// floods — but fixInlandSeas built its sea adjacency from a scan that stopped at the edges. Measured read-only on TEST 31: that
// scan called 1,367 sea provinces cut off from the ocean where 213 are, an ocean basin of 1,154 joined to the rest only across
// the seam, which nothing but the "half-water region" rule kept Auto-fix from filling. Vanilla has none, Hearts of Minecraft 44.
//
// THE FIX. The scan links column 0 to column W-1, so the repair, its plan and the dry run the layers below are measured with
// all judge the sea the way the game floods it; and Generate land's own plan reads the graph that already wraps.
//
// The fixture: a 16 x 4 map whose west edge is a strip of sea (2) walled off from the ocean by land inside the map, and
// touching the ocean's eastern province (6) across the seam. Its strategic region is mostly land, so nothing keeps it if it
// IS judged cut off — the twin with that ocean province made land shows the repair then fills it. Section 3 puts the same
// question to Generate land itself: a sea its own click leaves joined to the ocean only across the seam.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seamsea-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// Columns: 2 the west-edge sea | 3, 4 land | 5 ocean, with island-to-be 1 inside it | 6 ocean, the east edge.
// Only 1 and 2 have a strategic region, so Generate land can grow only them; seed 1 takes the first of two (1).
const W = 16, H = 4, SEA = 2, EAST = 6;
const C = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50], 6: [60, 60, 60] };
const at = (x, y) => (x >= 9 && x <= 10 && y >= 1 && y <= 2 ? 1 : x <= 1 ? 2 : x <= 2 ? 3 : x <= 3 ? 4 : x <= 12 ? 5 : 6);
function makeMod(tag, over = {}) {
  const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea", ...over };
  const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(m, "descriptor.mod"), 'name="Seam"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${C[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
  mk(path.join(m, "map", "provinces.bmp"), bmp24(W, H, (x, y) => C[at(x, y)]));
  mk(path.join(m, "map", "strategicregions", "1.txt"), "strategic_region={\n\tid=1\n\tname=\"REGION_1\"\n\tprovinces={ 1 }\n\tweather={}\n}\n");
  mk(path.join(m, "map", "strategicregions", "2.txt"), "strategic_region={\n\tid=2\n\tname=\"REGION_2\"\n\tprovinces={ 2 3 4 }\n\tweather={}\n}\n");
  return m;
}
const typeIn = (m, id) => { const l = fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/).find((x) => x.split(";")[0] === String(id)); return l ? l.split(";")[4] : null; };
const opts = (m) => ({ modRoot: m, gameRoot: null, dependencyRoots: [] });

try {
  console.log("=== a sea joined to the ocean across the wrap seam is not inland ===\n");

  console.log("0. The fixture: the sea touches the ocean ONLY across the seam");
  {
    // walked here off the bitmap itself: which provinces touch inside the map, and which only across x = 0 / W-1
    const inside = new Set(), seam = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = at(x, y);
      if (x + 1 < W && at(x + 1, y) !== a) inside.add([a, at(x + 1, y)].sort().join("-"));
      if (y + 1 < H && at(x, y + 1) !== a) inside.add([a, at(x, y + 1)].sort().join("-"));
    }
    for (let y = 0; y < H; y++) if (at(0, y) !== at(W - 1, y)) seam.add([at(0, y), at(W - 1, y)].sort().join("-"));
    const seaTouches = (set) => [...set].filter((k) => k.split("-").map(Number).includes(SEA)).map((k) => k.split("-").map(Number).find((p) => p !== SEA));
    rec("THE CONTROL: inside the map the sea touches only land", seaTouches(inside).every((p) => p === 3), seaTouches(inside));
    rec("THE CONTROL: …and across the seam it touches the ocean", seaTouches(seam).includes(EAST), seaTouches(seam));
    const twin = makeMod("walled", { [EAST]: "land" });
    const r = md.fixInlandSeas(opts(twin));
    rec("THE CONTROL: with the ocean's east edge made land the sea IS cut off, and the repair fills it — nothing else keeps it",
      r.fixed === 1 && ((r.details || [])[0] || {}).province === SEA && typeIn(twin, SEA) === "land", r);
  }

  console.log("\n1. The repair, its plan and its dry run all see the seam");
  {
    const m = makeMod("repair");
    const dry = md.fixInlandSeas({ ...opts(m), dryRun: true });
    rec("⭐⭐⭐ the dry run (what an add-on above this map inherits) does not count the sea as cut off", !dry.error && Array.isArray(dry.targets) && !dry.targets.includes(SEA), dry);
    const plan = md.fixInlandSeas({ ...opts(m), plan: true });
    rec("⭐⭐⭐ the plan neither fills it nor keeps it — it is not cut off at all",
      !plan.error && plan.plan === true && !(plan.fill || []).includes(SEA) && !Object.values(plan.kept || {}).some((l) => l.includes(SEA)), plan);
    const r = md.fixInlandSeas(opts(m));
    rec("⭐⭐⭐ the repair leaves it sea", !r.error && r.fixed === 0 && typeIn(m, SEA) === "sea", { r, type: typeIn(m, SEA) });
  }

  console.log("\n2. Generate land beside it");
  {
    const m = makeMod("generate");
    const g = md.generateLand({ ...opts(m), count: 1, provincesPerState: 8, seed: 1 });
    rec("THE CONTROL: the click grew the island, not the sea", g.changed === true && typeIn(m, 1) === "land", { err: g.error, one: typeIn(m, 1) });
    rec("⭐⭐⭐ the sea joined across the seam is not filled", typeIn(m, SEA) === "sea" && (g.inlandSeas || {}).filled === 0 && !(g.inlandSeas || {}).alreadyCutOff, { type: typeIn(m, SEA), seas: g.inlandSeas });
    const r = md.fixInlandSeas({ ...opts(m), inUse: md.seaProvincesPutToUse({ modRoot: m }) });
    rec("⭐⭐⭐ …and the Auto-fix repair after the click leaves it sea too", !r.error && r.fixed === 0 && typeIn(m, SEA) === "sea", r);
  }

  console.log("\n3. Generate land DECIDES across the seam: a sea joined inside the map before the click, and only across the seam after it");
  {
    // In 2 the sea is walled off inside the map before the click, so Generate land leaves it for a reason that has nothing to do with
    // the seam (it was cut off before). Here a sea bridge (1) runs through the land under it: before the click the sea (2) reaches the
    // ocean inside the map AND across the seam, and the growth raises the bridge. Whether Generate land then fills the sea is decided
    // by the graph it grew along — so this is the case that asks whether THAT graph wraps (review R-A8-4).
    // Columns: 2 the west-edge sea | 3, 4 land over the bridge 1 (bottom row) | 5, 7 ocean | 6 ocean, the east edge. Two ocean
    // provinces west of the edge, so that with the edge made land the ocean is still the largest body (the plan counts provinces).
    const CB = { ...C, 7: [70, 70, 70] };
    const atB = (x, y) => (x <= 1 ? 2 : x <= 3 ? (y <= 1 ? 3 : y === 2 ? 4 : 1) : x <= 10 ? 5 : x <= 14 ? 7 : 6);
    const BRIDGE = 1;
    const bridgeMod = (tag, over = {}) => {
      const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea", 7: "sea", ...over };
      const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
      mk(path.join(m, "descriptor.mod"), 'name="Bridge"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
      mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6, 7].map((i) => `${i};${CB[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
      mk(path.join(m, "map", "provinces.bmp"), bmp24(W, H, (x, y) => CB[atB(x, y)]));
      mk(path.join(m, "map", "strategicregions", "1.txt"), "strategic_region={\n\tid=1\n\tname=\"REGION_1\"\n\tprovinces={ 1 }\n\tweather={}\n}\n");
      mk(path.join(m, "map", "strategicregions", "2.txt"), "strategic_region={\n\tid=2\n\tname=\"REGION_2\"\n\tprovinces={ 2 3 4 }\n\tweather={}\n}\n");
      return m;
    };
    // walked off the bitmap: what the sea touches inside the map, and what the bridge touches
    const inside = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      for (const [u, v] of [[x + 1, y], [x, y + 1]]) {
        if (u >= W || v >= H) continue;
        const a = atB(x, y), b = atB(u, v);
        if (a === b) continue;
        for (const [p, q] of [[a, b], [b, a]]) { if (!inside.has(p)) inside.set(p, new Set()); inside.get(p).add(q); }
      }
    }
    rec("THE CONTROL: before the click the sea reaches the ocean INSIDE the map, through the bridge",
      inside.get(SEA).has(BRIDGE) && inside.get(BRIDGE).has(5), { sea: [...inside.get(SEA)], bridge: [...inside.get(BRIDGE)] });
    rec("THE CONTROL: …and across the seam it touches the ocean's east edge", atB(0, 0) === SEA && atB(W - 1, 0) === EAST, [atB(0, 0), atB(W - 1, 0)]);
    const walled = bridgeMod("bridge-walled", { [BRIDGE]: "land", [EAST]: "land" });
    const rw = md.fixInlandSeas(opts(walled));
    rec("THE CONTROL: with the bridge AND the ocean's east edge land, the sea is cut off and the repair fills it — nothing else keeps it",
      rw.fixed === 1 && ((rw.details || [])[0] || {}).province === SEA, rw);
    const m = bridgeMod("bridge-generate");
    const g = md.generateLand({ ...opts(m), count: 1, provincesPerState: 8, seed: 1 });
    rec("THE CONTROL: the click raised the bridge, not the sea", g.changed === true && typeIn(m, BRIDGE) === "land", { err: g.error, bridge: typeIn(m, BRIDGE) });
    rec("⭐⭐⭐ the sea that now reaches the ocean only across the seam stays SEA — Generate land judged it joined",
      typeIn(m, SEA) === "sea" && (g.inlandSeas || {}).filled === 0, { type: typeIn(m, SEA), seas: g.inlandSeas });
    const r = md.fixInlandSeas({ ...opts(m), inUse: md.seaProvincesPutToUse({ modRoot: m }) });
    rec("…and the Auto-fix repair after the click agrees", !r.error && r.fixed === 0 && typeIn(m, SEA) === "sea", r);
  }

  console.log(`\n=== a sea joined across the seam is not inland: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
