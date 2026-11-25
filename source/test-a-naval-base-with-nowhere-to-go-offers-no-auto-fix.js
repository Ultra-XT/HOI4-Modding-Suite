// ⛔ #a-naval-base-with-nowhere-to-go-offers-no-auto-fix (B4-12) — naval_base_non_coastal offers 🔧 only for a base the click would move.
//
// A sea made land took Poland's only coast (2309 raised): Gdynia's naval base had nowhere to go, the warning's message named Auto-fix, so
// Map Errors offered 🔧 Auto-fix all, and each click wrote nothing and left the same rule, still offered. The page's own rule says a button
// that then does nothing is not an offer. Both pushes now ask fixNavalBuildingsWithoutCoast's own plan (`plan: true`, which writes
// nothing): every base stuck -> autoFix:false and the message names the hand step a Map tool performs; some movable -> still offered.
//
// World (owns its map), one row of 10-px cells, the map wrapping east to west:  [1][3][5][4][6]
//   1 land, AAA's state 1, naval_base = 3 on 1 — no sea beside it (3 east, 6 across the seam)
//   3, 6 land of BBB's state 2;  4 the sea;  5 land beside the sea: BBB's (stuck world) or AAA's own state 3 (movable world)
// Run: node test-a-naval-base-with-nowhere-to-go-offers-no-auto-fix.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-naval-nowhere-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true }); fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 900) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const CELLS = [1, 3, 5, 4, 6], CELL = 10, W = CELLS.length * CELL, H = 10;
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const state = (id, owner, provs, extra = "") => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tbuildings={\n\t\t\tinfrastructure=1\n${extra}\t\t}\n\t}\n}\n`;
function world(label, movable) {
  const mod = path.join(ROOT, label);
  write(mod, "descriptor.mod", 'name="NavalNowhere"\nreplace_path="map"\nreplace_path="history/states"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x) => colour(CELLS[Math.floor(x / CELL)])));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};land;false;plains;1`, `3;${colour(3).join(";")};land;false;plains;1`,
    `4;${colour(4).join(";")};sea;true;ocean;0`, `5;${colour(5).join(";")};land;true;plains;1`, `6;${colour(6).join(";")};land;false;plains;1`].join("\n") + "\n");
  write(mod, "history/states/1-A.txt", state(1, "AAA", [1], "\t\t\t1 = { naval_base = 3 }\n"));
  write(mod, "history/states/2-B.txt", state(2, "BBB", movable ? [3, 6] : [3, 5, 6]));
  if (movable) write(mod, "history/states/3-A2.txt", state(3, "AAA", [5]));
  return mod;
}
const navalRules = (mod) => {
  const opts = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const model = md.buildMapModel(opts);
  return [].concat(md.validateMapFiles(opts), md.validateMapModel(model)).filter((p) => p && p.rule === "naval_base_non_coastal");
};
const hash = (dir) => {
  const h = crypto.createHash("sha1");
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else h.update(e.name).update(fs.readFileSync(f)); } };
  walk(dir); return h.digest("hex");
};

console.log("1. ⭐⭐⭐ A base with nowhere to go: the warning stays, and offers no Auto-fix");
{
  const mod = world("stuck", false);
  const ps = navalRules(mod);
  ok(ps.length === 1 && ps[0].items.length === 1 && ps[0].items[0].province === 1, "naval_base_non_coastal reports the base on 1, once", ps);
  const p = ps[0] || {};
  ok(p.autoFix === false, "⭐⭐⭐ …with autoFix:false", p);
  ok(labels.autoFixOffered(ps) === false, "⭐⭐⭐ …so the popup offers no 🔧 for it (autoFixOffers)", { offered: labels.autoFixOffered(ps) });
  ok(Array.isArray(p.stuck) && p.stuck.length === 1 && p.stuck[0].province === 1 && /AAA/.test(p.stuck[0].why), "…and names why: no other state of AAA has a coast", p.stuck);
  ok(/nowhere to go/.test(p.message) && /Naval base to 0/.test(p.message) && /give the state a coast/.test(p.message), "⭐⭐ the message names the hand step a Map tool performs", p.message);
  ok(!/Auto-fix moves each/.test(String(p.message)), "…and does not promise the move Auto-fix will not make", p.message);
  const before = hash(mod);
  const r = md.fixNavalBuildingsWithoutCoast({ modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], plan: true });
  ok(r && r.plan === true && (r.left || []).some((l) => l.province === 1 && l.key === "naval_base"), "the plan names the base it would leave", r);
  ok(hash(mod) === before, "⭐⭐ the plan writes nothing", { before, after: hash(mod) });
  const fx = md.fixNavalBuildingsWithoutCoast({ modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(hash(mod) === before && (fx.left || []).some((l) => l.province === 1), "THE CONTROL: the click itself leaves it too, and writes nothing — the offer was empty", { fx, same: hash(mod) === before });
}

console.log("\n2. ⭐⭐ A base its country has a coast for: still offered, and the click moves it");
{
  const mod = world("movable", true);
  const ps = navalRules(mod);
  const p = ps[0] || {};
  ok(ps.length === 1 && p.autoFix !== false && !p.stuck, "naval_base_non_coastal is offered (no autoFix:false, nothing stuck)", p);
  ok(labels.autoFixOffered(ps) === true && /Auto-fix moves each/.test(String(p.message)), "…and the popup offers 🔧, the message saying what it does", { offered: labels.autoFixOffered(ps), message: p.message });
  const fx = md.fixNavalBuildingsWithoutCoast({ modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(fx && !(fx.left || []).length && navalRules(mod).length === 0, "THE CONTROL: one click moves it onto 5, and the warning is gone", fx);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
