// A province painted the dummy's black that still OWNS black pixels is not reported as a crash; one that
// cannot own any still is. #a-black-province-that-owns-pixels-loads
//
// THE DEFECT. province_reserved_black fired on ANY real province (id > 0) whose definition.csv colour is 0,0,0,
// with the message "these resolve to zero pixels and HOI4 divides by zero loading the map (silent CTD)".
//
// THE EVIDENCE, re-measured 2026-09-11:
//   * The Millennium Dawn copy in the shipping corpus carries exactly one: `16257;0;0;0;land;true;unknown;5`,
//     with 14 black pixels at (3972,2015). The rule fired on it as an error claiming a silent CTD — on a map in
//     the corpus every one of which launches. Its premise is measurably false there: the province does not
//     have zero pixels; its pixels exist.
//   * The HOI4 wiki (Map modding) says what happens when colours are shared: "the game will assign each pixel of
//     the colour to only one of the provinces". So a black province is left pixel-less only when it CANNOT own
//     the black pixels — when another real province is black too, or when the bitmap has no black pixel.
//   * The crash the message describes was the 2026-06-19 reading of an INT_DIVIDE_BY_ZERO on the owner's MD. The
//     recolour Nova applied did not stop that crash; `-debug` then named two other causes (a state-id gap and
//     coastal provinces with no port). It was never isolated.
//   * ⚠️ That MD copy is not Steam-pristine: its definition.csv and provinces.bmp were rewritten on 2026-07-19
//     (every untouched Steam file there is dated 2026-06-06), and its definition.csv.bak holds
//     `16257;255;255;255;land;true;plains;5` — exactly what Nova's recolour writes. Steam's own workshop manifest
//     dates MD's last update 2026-04-07, while definition.csv, provinces.bmp, rivers.bmp and buildings.txt share
//     one timestamp to the tenth of a microsecond (2026-07-19 21:14:08.8303290) — a copy, not a download. So "MD
//     ships it" is not proven. What is: a map carrying a black province that owns black pixels is one the corpus
//     launches, and nothing on this machine records a crash that isolates it.
//
// So the rule is narrowed to the case that certainly leaves a province with NO pixels (the condition
// province_no_pixels gates on). It stays an error and stays out of the FATAL set; it never gated a Save.
// With no bitmap to consult it still reports — a province with no bitmap owns no pixels — which keeps the
// ownership contract in test-an-add-on-is-not-blamed-for-the-mod-it-sits-on.js exactly as it was.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-black-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-black-" + tag + "-")); tmps.push(d); return d; };

function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const W = 16, H = 16;
const ROWS = ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;land;false;plains;1"];
const csv = (extra) => ROWS.concat(extra || []).join("\r\n") + "\r\n";
// Three coloured bands; with `black`, the right-most quarter is painted 0,0,0.
const bands = (black) => bmp24(W, H, (x) => (black && x >= 12 ? [0, 0, 0] : x < 4 ? [200, 0, 0] : x < 8 ? [0, 200, 0] : [0, 0, 200]));
// What /api/map/validate runs for the model rules.
const modelRules = (modRoot, gameRoot, deps) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: deps || [], cacheStableLayers: true }));
const black = (probs) => probs.find((p) => p.rule === "province_reserved_black");

try {
  const GAME = tmp("game");
  mk(path.join(GAME, "map", "definition.csv"), csv());
  mk(path.join(GAME, "map", "provinces.bmp"), bands(false));

  console.log("1. ⛔ The Millennium Dawn shape: one black province that owns black pixels");
  {
    const mod = tmp("owns");
    mk(path.join(mod, "descriptor.mod"), 'name="Owns"\n');
    mk(path.join(mod, "map", "definition.csv"), csv(["4;0;0;0;land;true;unknown;1"]));
    mk(path.join(mod, "map", "provinces.bmp"), bands(true));
    const p = black(modelRules(mod, GAME));
    rec("⭐⭐⭐ it is NOT reported as a crash", !p, p && p.message);
    const bm = md.validateMapBitmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("…and the bitmap check agrees it is not pixel-less", !bm.some((x) => x.rule === "province_no_pixels"), bm.map((x) => x.rule));
  }

  console.log("\n2. The same province when the bitmap has NO black pixel — it owns nothing");
  {
    const mod = tmp("nopx");
    mk(path.join(mod, "descriptor.mod"), 'name="NoPixels"\n');
    mk(path.join(mod, "map", "definition.csv"), csv(["4;0;0;0;land;true;unknown;1"]));
    mk(path.join(mod, "map", "provinces.bmp"), bands(false));
    const p = black(modelRules(mod, GAME));
    rec("⭐⭐ it IS reported", !!p);
    rec("…naming it", !!p && Array.isArray(p.provinces) && p.provinces.includes(4), p && p.provinces);
    rec("…as an error", !!p && p.severity === "error", p && p.severity);
    rec("…saying why: there is no black pixel for it to own", !!p && /no black pixel/i.test(p.message), p && p.message);

    // An inherited bitmap is the one that counts: the same mod shipping only definition.csv.
    const defOnly = tmp("defonly");
    mk(path.join(defOnly, "descriptor.mod"), 'name="DefOnly"\n');
    mk(path.join(defOnly, "map", "definition.csv"), csv(["4;0;0;0;land;true;unknown;1"]));
    rec("…and so is a mod that inherits a bitmap with no black in it", !!black(modelRules(defOnly, GAME)));
  }

  console.log("\n3. TWO black provinces over black pixels — only one of them can own them");
  {
    const mod = tmp("two");
    mk(path.join(mod, "descriptor.mod"), 'name="Two"\n');
    mk(path.join(mod, "map", "definition.csv"), csv(["4;0;0;0;land;true;unknown;1", "5;0;0;0;land;false;unknown;1"]));
    mk(path.join(mod, "map", "provinces.bmp"), bands(true));
    const p = black(modelRules(mod, GAME));
    rec("⭐⭐ reported", !!p);
    rec("…naming both", !!p && p.provinces.includes(4) && p.provinces.includes(5), p && p.provinces);
    rec("…saying they share the colour", !!p && /share/i.test(p.message), p && p.message);
  }

  console.log("\n4. Nothing to consult is nothing owned — the bitmap-less contract is unchanged");
  {
    const G2 = tmp("game-nobmp");
    mk(path.join(G2, "map", "definition.csv"), csv());
    const mod = tmp("nobmp");
    mk(path.join(mod, "descriptor.mod"), 'name="NoBitmap"\n');
    mk(path.join(mod, "map", "definition.csv"), csv(["4;0;0;0;land;true;unknown;1"]));
    rec("a black province with no bitmap anywhere is still reported", !!black(modelRules(mod, G2)));
  }

  console.log("\n5. ⚠️ Ownership still applies: an add-on is not told about the mod beneath it");
  {
    const dep = tmp("dep");
    mk(path.join(dep, "descriptor.mod"), 'name="Dep"\n');
    mk(path.join(dep, "map", "definition.csv"), csv(["4;0;0;0;land;true;unknown;1"]));
    mk(path.join(dep, "map", "provinces.bmp"), bands(false));
    const addon = tmp("addon");
    mk(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
    mk(path.join(addon, "common", "characters", "c.txt"), "characters = {\n}\n");
    rec("THE CONTROL: the dependency is told about its own pixel-less black province", !!black(modelRules(dep, GAME)));
    rec("the add-on is not", !black(modelRules(addon, GAME, [dep])));
  }

  console.log("\n6. It never was, and is not, a Save-gating crash");
  rec("province_reserved_black is not in the FATAL set", labels.isFatalRule("province_reserved_black") === false);

  console.log(`\n=== a black province that owns its pixels is not called a crash: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
