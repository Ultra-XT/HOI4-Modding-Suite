// A colour painted in provinces.bmp that definition.csv does not define is reported.
// #a-painted-colour-needs-a-definition-row
//
// THE DEFECT. validateMapFiles scans every pixel of provinces.bmp into `count` (each colour present) and reads
// definition.csv into `defColors` (each colour defined), and then walks them in ONE direction only: a defined
// colour with no pixels is province_no_pixels, which is in the FATAL set and gates a Save. The mirror — a colour
// somebody painted that has no row — was never computed, although both sets were already in hand ten lines up.
// Hand-painting provinces.bmp in an image editor is the ordinary HOI4 workflow, and forgetting the row is the
// ordinary mistake: the "Will it crash?" panel said nothing at all.
//
// THE EVIDENCE, re-measured 2026-09-11 on vanilla and five workshop maps: 0 of 95,434 painted colours lack a
// definition row, 6 of 6 maps. (The direction Nova already gates on has five exceptions — every one the id-0
// dummy, which the rule excludes.) HOI4 wiki, Map modding → Provinces: when the definitions are incomplete "the
// game creates a 'corrected' copy of this file in the user directory", as map/definition.csv.fixed, with each
// missing colour given "a default entry as a land province with no continent and unknown terrain" — and a land
// province with no continent is what province_no_continent reports. The wiki adds: "It might be necessary to
// delete this copy after making changes to the original file."
//
// That is a chain of documented behaviour, not an observed crash, so the rule is an ERROR and NOT in the FATAL
// set. It fires 0 times on all six shipping maps.
//
// ⚠️ A MOD IS AN OVERLAY. Only a mod that ships provinces.bmp or definition.csv can have caused the mismatch;
// an add-on that ships neither is not told about the layer below (#inherited-problem-not-yours).
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-undefcol-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-undefcol-" + tag + "-")); tmps.push(d); return d; };

function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
// Four 128x128 quadrants; the bottom-right one is painted `c4`.
const quad = (c4) => bmp24(256, 256, (x, y) => (x < 128 ? (y < 128 ? [200, 0, 0] : [0, 0, 200]) : (y < 128 ? [0, 200, 0] : c4)));
const defRows = (extra) => ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;land;false;plains;1"]
  .concat(extra || []).join("\r\n") + "\r\n";
const NOGAME = path.join(os.tmpdir(), "nova-no-game-dir");
const validate = (modRoot, gameRoot, deps) => md.validateMapBitmap({ modRoot, gameRoot, dependencyRoots: deps || [] });
const find = (probs) => probs.find((p) => p.rule === "province_color_not_defined");

try {
  console.log("1. ⛔ A quadrant painted a colour definition.csv never mentions");
  {
    const mod = tmp("undef");
    mk(path.join(mod, "descriptor.mod"), 'name="Undef"\n');
    mk(path.join(mod, "map", "provinces.bmp"), quad([40, 50, 60]));
    mk(path.join(mod, "map", "definition.csv"), defRows());
    const probs = validate(mod, NOGAME);
    const p = find(probs);
    rec("⭐⭐⭐ the painted-but-undefined colour is reported", !!p, probs.map((x) => x.rule));
    const q = p || {};
    rec("…naming the colour", Array.isArray(q.colors) && q.colors.length === 1 && String(q.colors[0].color) === "40,50,60", q.colors);
    rec("…with how many pixels carry it", Array.isArray(q.colors) && q.colors[0] && q.colors[0].pixels === 128 * 128, q.colors);
    rec("…and where to find them", Array.isArray(q.colors) && q.colors[0] && q.colors[0].x >= 128 && q.colors[0].y >= 128, q.colors);
    rec("…in the message too", /40,50,60/.test(String(q.message)), String(q.message).slice(0, 200));
    rec("…as an error", q.severity === "error", q.severity);
    rec("⚠️ …but NOT in the FATAL set: the consequence is documented, the crash is not", labels.isFatalRule("province_color_not_defined") === false);
    // The rule that already existed is the mirror; it must be unaffected.
    rec("province_no_pixels does not fire — every defined colour is painted", !probs.some((x) => x.rule === "province_no_pixels"), probs.map((x) => x.rule));
  }

  console.log("\n2. The controls — nothing to report");
  {
    const mod = tmp("defined");
    mk(path.join(mod, "map", "provinces.bmp"), quad([40, 50, 60]));
    mk(path.join(mod, "map", "definition.csv"), defRows(["4;40;50;60;land;false;plains;1"]));
    rec("the same map WITH the row says nothing", !find(validate(mod, NOGAME)));

    const blk = tmp("black");
    mk(path.join(blk, "map", "provinces.bmp"), quad([0, 0, 0]));
    mk(path.join(blk, "map", "definition.csv"), defRows());
    rec("black pixels are the id-0 dummy's colour, which has a row", !find(validate(blk, NOGAME)));
  }

  console.log("\n3. ⚠️ Only the mod that painted it is told");
  {
    // A base layer with the broken pair, and one with a clean pair.
    const BROKEN = tmp("gamebroken");
    mk(path.join(BROKEN, "map", "provinces.bmp"), quad([40, 50, 60]));
    mk(path.join(BROKEN, "map", "definition.csv"), defRows());
    const CLEAN = tmp("gameclean");
    mk(path.join(CLEAN, "map", "provinces.bmp"), quad([40, 50, 60]));
    mk(path.join(CLEAN, "map", "definition.csv"), defRows(["4;40;50;60;land;false;plains;1"]));

    const addon = tmp("addon");
    mk(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
    mk(path.join(addon, "common", "characters", "c.txt"), "characters = {\n}\n");
    rec("⭐⭐ an add-on that ships neither file is not blamed for the layer below", !find(validate(addon, BROKEN)));
    rec("THE CONTROL: editing that base layer directly reports it", !!find(validate(BROKEN, BROKEN)));

    const painter = tmp("painter");
    mk(path.join(painter, "descriptor.mod"), 'name="Painter"\n');
    mk(path.join(painter, "map", "provinces.bmp"), quad([41, 51, 61]));   // its own bitmap, a colour nobody defines
    const p = find(validate(painter, CLEAN));
    rec("⭐⭐ a mod that paints its own bitmap over an inherited definition.csv IS told", !!p);
    rec("…about its colour", !!p && String(p.colors[0].color) === "41,51,61", p && p.colors);
  }

  console.log("\n4. Label and fix hint");
  rec("'province_color_not_defined' has a friendly label", !!labels.LABELS.province_color_not_defined, labels.LABELS.province_color_not_defined);
  rec("'province_color_not_defined' has a fix hint", labels.mapRuleFixHint("province_color_not_defined").length > 15);

  console.log(`\n=== a colour painted with no definition row is reported: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
