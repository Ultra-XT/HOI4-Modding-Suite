// ⛔ #a-row-nova-retyped-is-not-the-modders (B4-6, the integration of the b2b4 fixes) — a row of map/adjacencies.csv that NOVA's own
// retype wrote is not reported as the modder's.
//
// B4-6 added adjacency_shape_no_map_ships: a row the mod wrote as `impassable` with a sea end ("a wall in the sea") is said, and the
// modder is told to Remove it with 🔗 Adjacency and add it again. But fixAdjacenciesForProvinceTypes (🔧 Auto-fix all, Generate land's
// repair, every generated world) writes exactly that shape: a strait of the layer below whose one shore became sea and whose pair does
// not touch becomes `impassable`, Through -1 (retypeAdjacencyRow's one-shore case). On the campaign's G0 world the new rule said 8 such
// rows (Panama, Lolland-Själland, Jylland-Samsö, Fyn, Stralsund-Rügen, Hawaii-Maui, Tahiti-Raiatea, Orkney-Thurso), so a world Nova
// had just made and fixed was no longer clean, and the 🔗 step the warning names would only write the row again.
//
// The guard runs the REAL writer, then the REAL validator, so a change to either side of the seam shows here. A row the modder wrote
// by hand in any other shape is still said (the three decoys pin each clause of the exemption).
//
// Fixture: a 12×4 provinces.bmp, two columns a province: 1 2 3 4 5 6 in a row; in the game 1-3 land, 4-6 sea (6 touches 1 across the
// wrap seam; 1 and 3 do not touch). The base strait is 1-3 through 4. The add-on turns 3 to sea.
// Run: node test-a-row-nova-retyped-is-not-the-modders.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-retyped-home-"));
process.env.APPDATA = SANDBOX; process.env.XDG_CONFIG_HOME = SANDBOX; process.env.NOVA_APP_DATA_DIR = SANDBOX; process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const tmps = [SANDBOX];

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const COL = { 1: [10, 0, 0], 2: [20, 0, 0], 3: [30, 0, 0], 4: [40, 0, 0], 5: [50, 0, 0], 6: [60, 0, 0] };
const GAME_TYPE = { 1: "land", 2: "land", 3: "land", 4: "sea", 5: "sea", 6: "sea" };
const MOD_TYPE = Object.assign({}, GAME_TYPE, { 3: "sea" });
const def = (types) => "0;0;0;0;land;false;unknown;0;\n" + [1, 2, 3, 4, 5, 6].map((i) => `${i};${COL[i].join(";")};${types[i]};false;${types[i] === "sea" ? "ocean;0" : "plains;1"};`).join("\n") + "\n";
const HDR = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const BMP = bmp24(12, 4, (x) => COL[1 + Math.floor(x / 2)]);
const csv = (rows) => [HDR].concat(rows, ["-1;-1;;-1;-1;-1;-1;-1;;", ""]).join("\n");
const STRAIT = "1;3;sea;4;-1;-1;-1;-1;;a strait";            // the base's: land/land through sea; 3 turns sea, 1 and 3 do not touch
const BASE = [STRAIT, "4;6;sea;-1;-1;-1;-1;-1;;sea link", "2;5;;-1;-1;-1;-1;-1;;plain"];
// decoys the MODDER wrote, one per clause of the exemption:
const HAND_NO_BASE = "2;4;impassable;-1;-1;-1;-1;-1;;hand wall, no row below";        // land|sea, nothing below for the pair
const HAND_TWO_SEAS = "4;6;impassable;-1;-1;-1;-1;-1;;hand wall, two seas";         // the pair is `sea` below, but both ends are sea
const HAND_NOT_SEA_BELOW = "2;5;impassable;-1;-1;-1;-1;-1;;hand wall, plain below"; // land|sea, the pair is a plain link below
const mkRoot = (label, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nova-retyped-${label}-`)); tmps.push(root);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return root;
};
const shapeRule = (opts) => md.validateMapFiles(opts).find((p) => p.rule === "adjacency_shape_no_map_ships") || null;
const pairs = (p) => (p && p.items ? p.items.map((i) => `${i.from}-${i.to}:${i.shape}`).sort() : []);
const rowOf = (text, a, b) => String(text).split(/\r?\n/).find((l) => l.startsWith(`${a};${b};`)) || "";

try {
  console.log("1. ⭐⭐⭐ Nova's own retype writes a one-shore wall, and the rule does not say it");
  {
    const game = mkRoot("game", { "map/provinces.bmp": BMP, "map/definition.csv": def(GAME_TYPE), "map/adjacencies.csv": csv(BASE) });
    const mod = mkRoot("mod", { "descriptor.mod": 'name="Retyped"\n', "map/definition.csv": def(MOD_TYPE) });
    const opts = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const fx = md.fixAdjacenciesForProvinceTypes(opts);
    const written = fs.existsSync(path.join(mod, "map", "adjacencies.csv")) ? fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8") : "";
    rec("the REAL writer retyped the strait as a one-shore row that does not touch", !!fx && fx.changed === true && fx.oneShore === 1 && fx.oneShoreTouching === 0, fx);
    rec("…and wrote it as `impassable`, Through -1", /^1;3;impassable;-1;/.test(rowOf(written, 1, 3)), rowOf(written, 1, 3));
    rec("CONTROL: the predicate calls that row a wall in the sea (so only the exemption keeps it out)", (md.adjacencyShapeNoMapShips({ type: "impassable", from: 1, to: 3, through: -1 }, (p) => MOD_TYPE[p]) || {}).shape === "wall-in-the-sea");
    const p = shapeRule(opts);
    rec("⭐⭐⭐ the rule says nothing of the row Nova wrote", p === null, p && p.items);
  }

  console.log("\n2. ⭐⭐ A wall the modder wrote by hand is still said, one decoy per clause");
  {
    const game = mkRoot("game2", { "map/provinces.bmp": BMP, "map/definition.csv": def(GAME_TYPE), "map/adjacencies.csv": csv(BASE) });
    const mod = mkRoot("mod2", { "descriptor.mod": 'name="Retyped and hand"\n', "map/definition.csv": def(MOD_TYPE), "map/adjacencies.csv": csv(BASE.concat([HAND_NO_BASE, HAND_TWO_SEAS, HAND_NOT_SEA_BELOW])) });
    const opts = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const fx = md.fixAdjacenciesForProvinceTypes(opts);
    const written = fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");
    rec("the writer retyped the strait in the mod's own file, and no decoy", !!fx && fx.retyped === 1 && fx.oneShore === 1 && /^1;3;impassable;-1;/.test(rowOf(written, 1, 3))
      && written.includes(HAND_NO_BASE) && written.includes(HAND_TWO_SEAS) && written.includes(HAND_NOT_SEA_BELOW), fx);
    const p = shapeRule(opts);
    rec("⭐⭐ the three hand walls are said, and the retyped row is not", JSON.stringify(pairs(p)) === JSON.stringify(["2-4:wall-in-the-sea", "2-5:wall-in-the-sea", "4-6:wall-in-the-sea"]), p && p.items);
    rec("…still a warning", !!p && p.severity === "warning", p && p.severity);
  }

  console.log(`\n=== a row Nova retyped is not the modder's: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
