// A tiny province is judged by the minimum the GAME uses, only when it is the mod's own, and without claiming it
// cannot be used. #a-tiny-province-is-judged-by-the-games-own-define
//
// province_too_small hard-coded 8 pixels and said the provinces "can't be used in-game". Measured by the 2026-09-11
// engine gap analysis and an adversarial verifier:
//
//   * The threshold is a define, NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS. Vanilla sets 8 inside the NGraphics table
//     of common/defines/00_graphics.lua (line 1197), whose own comment says it "doesn't affect the game, just informs
//     in the error.log". Rise of Nations sets `NDefines.NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS = 2` (01_RON.lua:3,
//     "just to make the game stop complaining") — and Nova still warned about its nine microstates, which are real
//     states with victory points (Vatican, San Marino, Melilla, …).
//   * hoi4.exe logs " has only N pixels around (x=…,y=…). Should have at least M" — no MAP_ERROR prefix, no crash.
//   * An add-on with no map folder at all, over Old World Blues or Rise of Nations, was told about the base map's nine.
//
// So: read the define the way the game reads defines (every layer's common/defines/*.lua, a same-named file in a higher
// layer replacing the lower one, run in filename order, the last assignment winning); report only a mod that ships
// provinces.bmp, and only provinces that are not already that small in the layer below; and say what the game does.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tinyprov-home-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;
process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const tmps = [SANDBOX];

// 256x256 tiled into 64 blocks of 32x32 — province id 1..64, colour R = id. Extra ids are painted as a few pixels.
const W = 256, H = 256, BS = 32, GX = W / BS;
function buildBmp(extra) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, ds = rs * H, buf = Buffer.alloc(54 + ds);
  buf.write("BM", 0); buf.writeUInt32LE(54 + ds, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(ds, 34);
  const px = (x, y) => { for (const e of extra) if (e.pixels.some(([ex, ey]) => ex === x && ey === y)) return e.id; return Math.floor(y / BS) * GX + Math.floor(x / BS) + 1; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const id = px(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = id; }
  return buf;
}
const run = (x0, y0, n) => Array.from({ length: n }, (_, i) => [x0 + i, y0]);
const defRows = (maxId) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: maxId }, (_, i) => `${i + 1};${i + 1};0;0;land;false;plains;1`)).join("\n") + "\n";
const mkRoot = (label, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nova-tinyprov-${label}-`)); tmps.push(root);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return root;
};
const small = (opts) => md.validateMapFiles(opts).find((p) => p.rule === "province_too_small");
const TINY65 = { id: 65, pixels: run(100, 100, 3) };   // 3 px
const MID66 = { id: 66, pixels: run(100, 140, 5) };    // 5 px
const DOT67 = { id: 67, pixels: run(100, 180, 1) };    // 1 px

try {
  console.log("1. With no define anywhere, the game's default of 8 applies — and the message says what the game does");
  {
    const mod = mkRoot("default", { "descriptor.mod": 'name="Tiny"\n', "map/provinces.bmp": buildBmp([TINY65]), "map/definition.csv": defRows(65) });
    const p = small({ modRoot: mod, gameRoot: path.join(os.tmpdir(), "nova-no-game-dir"), dependencyRoots: [] });
    rec("a 3-pixel province is reported", !!p && p.provinces.includes(65), p && p.provinces);
    rec("⭐⭐ the message no longer says it can't be used in-game", !!p && !/can't be used in-game|cannot be used/i.test(p.message), p && p.message);
    rec("⭐ …it says HOI4 notes it in error.log", !!p && /error\.log/.test(p.message), p && p.message);
    rec("…and names the define", !!p && /MINIMUM_PROVINCE_SIZE_IN_PIXELS/.test(p.message), p && p.message);
  }

  console.log("\n2. ⛔ A mod that lowers the define is judged by its own value (Rise of Nations sets 2)");
  {
    const mod = mkRoot("lowered", {
      "descriptor.mod": 'name="Lowered"\n',
      "map/provinces.bmp": buildBmp([TINY65, DOT67]),
      "map/definition.csv": defRows(67),
      "common/defines/01_mine.lua": "NDefines.NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS = 2\t\t\t-- just to make the game stop complaining\n",
    });
    const p = small({ modRoot: mod, gameRoot: path.join(os.tmpdir(), "nova-no-game-dir"), dependencyRoots: [] });
    rec("⭐⭐⭐ a 3-pixel province is NOT reported under a minimum of 2", !p || !p.provinces.includes(65), p && p.provinces);
    rec("⭐⭐ …while a 1-pixel province still is — the define is read, not switched off", !!p && p.provinces.includes(67), p && p.provinces);
  }

  console.log("\n3. The base game's own table form is read, and a later-sorting mod file overrides it");
  {
    const game = mkRoot("game", {
      "map/provinces.bmp": buildBmp([]),
      "map/definition.csv": defRows(64),
      "common/defines/00_graphics.lua": "NGraphics = {\n\tSOMETHING_ELSE = 3,\n\tMINIMUM_PROVINCE_SIZE_IN_PIXELS = 4,\t\t\t-- informs in the error.log\n}\n",
    });
    const mod = mkRoot("table", { "descriptor.mod": 'name="Table"\n', "map/provinces.bmp": buildBmp([TINY65, MID66]), "map/definition.csv": defRows(66) });
    const p = small({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    rec("⭐⭐ under the base game's 4, the 3-pixel province is reported", !!p && p.provinces.includes(65), p && p.provinces);
    rec("⭐⭐ …and the 5-pixel one is not", !p || !p.provinces.includes(66), p && p.provinces);
    fs.mkdirSync(path.join(mod, "common", "defines"), { recursive: true });
    fs.writeFileSync(path.join(mod, "common", "defines", "01_mine.lua"), "-- NDefines.NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS = 99\nNDefines.NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS = 2\n");
    const q = small({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    rec("⭐⭐ the mod's 01_mine.lua runs after 00_graphics.lua, so its 2 wins — and the commented-out 99 is ignored", !q || !q.provinces.includes(65), q && q.provinces);
  }

  console.log("\n4. ⛔ Only what the mod owns");
  {
    const game = mkRoot("base", { "map/provinces.bmp": buildBmp([TINY65]), "map/definition.csv": defRows(66) });
    const addon = mkRoot("addon", { "descriptor.mod": 'name="Addon"\n' });
    const a = small({ modRoot: addon, gameRoot: game, dependencyRoots: [] });
    rec("⭐⭐⭐ an add-on with no provinces.bmp is not told about the base map's tiny province", !a, a && a.provinces);
    const painter = mkRoot("painter", { "descriptor.mod": 'name="Painter"\n', "map/provinces.bmp": buildBmp([TINY65, MID66]), "map/definition.csv": defRows(66) });
    const b = small({ modRoot: painter, gameRoot: game, dependencyRoots: [] });
    rec("⭐⭐⭐ a mod that ships provinces.bmp is not blamed for the base's tiny province it only copied", !b || !b.provinces.includes(65), b && b.provinces);
    rec("⭐⭐ …but its own new tiny province is reported", !!b && b.provinces.includes(66), b && b.provinces);
  }

  console.log(`\n=== a tiny province is judged by the game's own define: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
