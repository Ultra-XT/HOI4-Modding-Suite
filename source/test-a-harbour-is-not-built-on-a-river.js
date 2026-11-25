// A port Auto-fix gives a coastal province stands on a coast pixel that is not a river's, when the province has one.
// #a-harbour-is-not-built-on-a-river (batch B, B3)
//
// THE DEFECT, measured on the owner's flow (New mod → Delete map → Generate land 35% seed 1 → Auto-fix → Redraw regions) with
// Generate land drawing rivers: fixCoastalNoPort put 46 of its 726 ports on a river pixel (6.3%; vanilla 26 of 2,362, 1.1%). It
// takes the province's FIRST coast pixel in the raster, and that is usually where the province's border meets the coast — where a
// river running along that border has its mouth. Keeping rivers away from ports would cost 30% of the rivers (PLAN §6.7); the port
// taking the first coast pixel that is NOT a river's costs none: 44 ports moved a pixel or two, 2 of 726 left on a river (0.28%).
// ⚠️ MOVED with #a-harbour-stands-on-its-coast-not-its-corner (test-a-harbour-stands-on-its-coast-not-its-corner.js): the port no
// longer takes the FIRST coast pixel in the raster but harbourSpot's — the one nearest its depot, the province's middle where it has
// none, as here — and a river's pixel only where every other is one too. So the expected pixel is derived from the middle, not the
// raster, and the river here runs down the coast beside the middle, which is where the port would stand without it.
//
// ⚠️ THE TRADE (review of wave 6, F1): the river is not harbourSpot's first key. A pixel whose turned model holds more than
// PORT_OVER_NEIGHBOUR of another state's land, or more than PORT_OVER_MODEL of a model standing round it (#a-harbour-keeps-off-its-
// states-models), loses to a river's pixel that holds neither: on the owner's flow 6 of 2,128 ports stand on a river in a province
// with a coast pixel off one (18 on a river in all, 0.85%; the base game 26 of 2,362, 1.1%) — before the model share, 2 and 14, those
// 2 kept off it at a 7.8% or 24.5% share of the neighbour's land.
// Fixture: a land province with a sea either side, a river down one coast column. Read back: the port's pixel, its province, its sea.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harbour-river-"));
// ⛔ private app data BEFORE map-data.js loads: the copies of buildings.txt safeModWrite keeps are this test's, never yours
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

// 12×6: province 1 (land) 4 <= x < 8, province 2 (sea) on both sides of it and across the seam — one sea. Every pixel of columns 4
// and 7 is a coast pixel; in the raster (row by row, west to east) a row's column 4 comes before its column 7
const W = 12, H = 6, N = W * H;
const isLand = (k) => k % W >= 4 && k % W < 8;
const world = { W, H, N, pid: Int32Array.from({ length: N }, (_, k) => (isLand(k) ? 1 : 2)), type: Uint8Array.from({ length: N }, (_, k) => (isLand(k) ? 1 : 2)),
  height: Uint8Array.from({ length: N }, (_, k) => (isLand(k) ? 100 : 89)) };
const fixture = (name, rivers) => {
  const d = path.join(TMP, name);
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\n`);
  // `rivers`: [column, [rows]] — a river down that column over those rows (its green at the top), the rest background
  const idx = Uint8Array.from({ length: N }, (_, k) => (isLand(k) ? RW.BG : RW.SEA_BG));
  for (const [x, rows] of rivers) for (const y of rows) idx[y * W + x] = y === rows[0] ? RW.GREEN : 3;
  RW.writeMap(d, world, { idx });
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), "1;arms_factory;5.00;9.50;1.00;0.00;0\r\n");
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  return { d, idx };
};
const portOf = (d) => {
  const line = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).find((l) => /;naval_base_spawn;/.test(l));
  if (!line) return null;
  const c = line.split(";"), x = Math.floor(parseFloat(c[2])), y = md.buildingZToPixelY(H, parseFloat(c[4]));
  return { line, x, y, sea: parseInt(c[6], 10), rot: parseFloat(c[5]), at: [parseFloat(c[2]), parseFloat(c[4])] };
};
// the province's coast pixels nearest its middle (it has no depot), of those `ok(idx)` lets through: ties to the lower row, then x
const nearestMiddle = (ok) => {
  let sx = 0, sy = 0, n = 0;
  for (let k = 0; k < N; k++) if (world.pid[k] === 1) { sx += k % W; sy += Math.floor(k / W); n++; }
  const mx = sx / n, my = sy / n, coastPx = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (world.pid[y * W + x] === 1 && (world.pid[y * W + (x + 1) % W] === 2 || world.pid[y * W + (x - 1 + W) % W] === 2) && ok(y * W + x)) coastPx.push({ x, y, d: (x - mx) ** 2 + (y - my) ** 2 });
  coastPx.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return coastPx[0] || null;
};
// which way coastFacing turns a coast model standing at that point of this world (the turn the port must carry)
const facingAt = ([x, z]) => md.coastFacing({ W, H, pidAt: (px, py) => world.pid[py * W + px] }, (id) => (id === 2 ? "sea" : "land"), x, z);

try {
  console.log("1. The coast pixels nearest the province's middle are a river's, others are dry");
  {
    const { d, idx } = fixture("Mouth", [[4, [1, 2, 3, 4]]]);
    const r = md.fixCoastalNoPort({ modRoot: d });
    const p = portOf(d);
    const wet = nearestMiddle(() => true), dry = nearestMiddle((k) => !RW.isRiverIndex(idx[k]));
    rec("THE CONTROL: one port added, and the coast pixel nearest the middle is a river's", r.added === 1 && !!p && !!wet && RW.isRiverIndex(idx[wet.y * W + wet.x]), { r, wet });
    rec("⭐ the port does not stand on a river pixel", p && !RW.isRiverIndex(idx[p.y * W + p.x]), p);
    rec("…it stands on its own province, on the coast, facing the sea it names", p && world.pid[p.y * W + p.x] === 1 && (world.pid[p.y * W + p.x + 1] === 2 || world.pid[p.y * W + p.x - 1] === 2) && p.sea === 2, p);
    rec("…the dry coast pixel nearest the province's middle", p && !!dry && p.x === dry.x && p.y === dry.y, { p, dry });
    // ⛔ coastFacing turns the quay from the pixel chosen, not from the river's: the two coasts face opposite seas
    const turned = p && facingAt(p.at), atMouth = facingAt([wet.x, p ? p.at[1] : 0]);
    rec("THE CONTROL: a quay at the river's mouth would turn another way", turned != null && atMouth != null && turned !== atMouth, { turned, atMouth });
    rec("⭐ …and the port is turned to the sea beside the pixel it stands on", p && p.rot === turned, { rot: p && p.rot, turned });
  }

  console.log("\n2. Every coast pixel is a river's: the port still goes in — a coast without one is the crash this repair exists for");
  {
    const { d } = fixture("All River", [[4, [0, 1, 2, 3, 4, 5]], [7, [0, 1, 2, 3, 4, 5]]]);
    const r = md.fixCoastalNoPort({ modRoot: d });
    const p = portOf(d), any = nearestMiddle(() => true);
    rec("⭐ one port added, on the coast pixel nearest the province's middle, as with no river", r.added === 1 && p && p.x === any.x && p.y === any.y && p.sea === 2, { p: p || r, any });
  }

  console.log("\n3. No river at all: the coast pixel nearest the province's middle");
  {
    const { d } = fixture("Dry", []);
    md.fixCoastalNoPort({ modRoot: d });
    const p = portOf(d), any = nearestMiddle(() => true);
    rec("the coast pixel nearest the middle", p && p.x === any.x && p.y === any.y, { p, any });
  }

  console.log("\n4. The dry run asks which provinces, never where: it reads no rivers.bmp");
  {
    const { d } = fixture("Dry Run", [[4, [0, 1]]]);
    fs.writeFileSync(path.join(d, "map", "rivers.bmp"), "not a bitmap");   // unreadable: a write would fall back, a dry run must not care
    const dry = md.fixCoastalNoPort({ modRoot: d, dryRun: true });
    rec("the dry run finds the province and writes nothing", dry.added === 0 && dry.targets && dry.targets[0] === 1 && !/naval_base_spawn/.test(fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8")), dry);
    const r = md.fixCoastalNoPort({ modRoot: d });
    const p = portOf(d), any = nearestMiddle(() => true);
    rec("…and a write over an unreadable rivers.bmp still places the port (on the coast pixel nearest the middle)", r.added === 1 && p && p.x === any.x && p.y === any.y, p || r);
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
