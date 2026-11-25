// A river the modder cut away from its source is reported, and Auto-fix gives it one — while a river the base game already
// ships without a source stays Paradox's. #a-river-the-mod-cut-from-its-source
//
// THE DEFECT. fixMalformedRivers (map-data.js) skips a sourceless river component as inherited ("Paradox's river, not the
// modder's") when every one of its pixels is byte-identical to the base layer's rivers.bmp. That tests the PIECE's pixels, not
// whether the mod removed the pixels that joined it to its source. Erase a gap in the middle of a base-game river and the
// half beyond the gap has no source, yet every pixel of it is still the base game's — so it was skipped. The rule
// river_no_source reads the same dry run, so Map Errors said nothing, and Auto-fix (which adds a source to a sourceless river)
// left it alone: `inheritedSkipped` simply went up by one.
//
// Measured by batch 8's discovery (scratchpad/batch8/discover f1d.js Save 7, r7-river-rail.js) on a vanilla-based mod: the Rivers
// tool's Erase (palette 254) over 3 pixels of a 9-pixel run at 4358..4360,300. Vanilla's river there is one component of
// 3,076 px with 1 source; after the erase a 2,939 px piece kept the source and a 134 px piece (x 4361-4453, y 298-329) had none.
// GET /api/map/validate: no river_no_source. Two Auto-fix clicks: malformedRivers { addedSources: 0, inheritedSkipped: 13 },
// where the click before read 12, and the piece stayed sourceless.
//
// THE FIX judges the piece the way the discovery did: a sourceless piece whose pixels are all the base game's is inherited only
// if the base game's own river at that place had no source either. A piece the base game drew with a source is one the mod cut.
//
// Driven through the page's requests: GET /api/map/rivers-info, the page's own classifyRiverPalette (lifted from public/map.js)
// to pick the Erase index, POST /api/map/rivers-paint as flushMapSaves posts it, GET /api/map/validate, POST /api/map/auto-fix.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("rivercut");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const P = require("./testlib-map-page.js");
const md = require("./map-data.js");
const { createApp } = require("./server.js");

// An 8-bit rivers.bmp with vanilla's palette layout: 0 source (green), 1 flow-in (red), 2 flow-out (yellow), 3..11 river widths
// (vanilla's exact colours), 254 grey, 255 white background — the same 256x256 as the world's provinces.bmp.
const W = 256, H = 256;
const BLUES = [[0, 225, 255], [0, 200, 255], [0, 150, 255], [0, 100, 255], [0, 0, 255], [0, 0, 225], [0, 0, 200], [0, 0, 150], [0, 0, 100]];
const PAL = Array.from({ length: 256 }, (_, i) => (i === 0 ? [0, 255, 0] : i === 1 ? [255, 0, 0] : i === 2 ? [255, 252, 0]
  : i >= 3 && i <= 11 ? BLUES[i - 3] : i === 254 ? [122, 122, 122] : i === 255 ? [255, 255, 255] : [2, 0, 1]));
function riversBmp(pixels) {
  const stride = Math.ceil(W / 4) * 4, off = 14 + 40 + 1024, size = off + stride * H;
  const b = Buffer.alloc(size, 0);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(off, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28);
  b.writeUInt32LE(0, 30); b.writeUInt32LE(stride * H, 34); b.writeUInt32LE(256, 46);
  PAL.forEach(([r, g, bl], i) => { b[54 + i * 4] = bl; b[55 + i * 4] = g; b[56 + i * 4] = r; });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * stride + x] = 255;
  for (const [x, y, v] of pixels) b[off + (H - 1 - y) * stride + x] = v;
  return b;
}
// River A: a source at 20,120 and a body 21..60 on row 120 (land province 2). River C: a body 20..30 on row 220 with NO source
// (land province 5) — the shape of the twelve sourceless rivers vanilla itself ships.
const A = [[20, 120, 0]].concat(Array.from({ length: 40 }, (_, i) => [21 + i, 120, 11]));
const C = Array.from({ length: 11 }, (_, i) => [20 + i, 220, 11]);
L2.write(world.GAME, { "map/rivers.bmp": riversBmp(A.concat(C)) });

const idxAt = (file, x, y) => { const buf = fs.readFileSync(file); const bmp = md.readIndexedBmp(buf); return buf[bmp.pixelOffset(x, y)]; };
const row = (file, y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => idxAt(file, x0 + i, y));
const noSource = (v) => ((v && v.problems) || []).filter((p) => p.rule === "river_no_source");

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    // The page's Erase index, from the page's own palette classifier.
    const page = P.runPage([["const riverGrey = ", "\n    return items;\n  }"]]);
    const eraseFor = async (mod) => {
      const info = await fetch(`${srv.base}/api/map/rivers-info?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const items = page.sb.classifyRiverPalette(info.palette);
      const er = items.find((it) => it.role === "erase");
      return er ? er.i : -1;
    };

    console.log("1. ⛔ The modder erases a gap in the middle of a base-game river");
    {
      const MOD = world.mod("River Cut", {});
      const erase = await eraseFor(MOD);
      rec("THE CONTROL: the page's classifier picks the grey Erase index vanilla's palette has", erase === 254, erase);
      const r = await srv.post("/api/map/rivers-paint", { edits: [40, 41, 42].map((x) => ({ x, y: 120, index: erase })) }, MOD);
      rec("the erase stroke saved", r.status === 200 && r.body && r.body.ok === true, r.body);
      const file = path.join(MOD, "map", "rivers.bmp");
      rec("…and the mod now owns rivers.bmp with the gap in it", fs.existsSync(file) && row(file, 120, 39, 43).join(",") === "11,254,254,254,11", fs.existsSync(file) && row(file, 120, 36, 46));
      rec("THE CONTROL: the half beyond the gap is still the base game's pixels, and has no source", row(file, 120, 43, 60).every((v) => v === 11));

      const v = await srv.validate(MOD);
      const p = noSource(v);
      const coords = p.flatMap((x) => x.coords || []);
      rec("⭐⭐⭐ Map Errors reports the river the modder cut from its source", p.length === 1 && coords.some((c) => c.y === 120 && c.x >= 43 && c.x <= 60), { rules: L2.rulesIn(v), coords });
      rec("⭐⭐ …and only that one: not the half that kept its source, not the base game's own sourceless river on row 220",
        coords.length === 1 && !coords.some((c) => c.y === 220) && !coords.some((c) => c.y === 120 && c.x < 40), coords);

      const fix = await srv.autoFix(MOD);
      const mr = fix.body && fix.body.fixes && fix.body.fixes.malformedRivers;
      rec("⭐⭐⭐ one Auto-fix click gives it a source", fix.status === 200 && mr && mr.addedSources === 1, mr || fix.body);
      const cut = row(file, 120, 43, 60);
      rec("⭐⭐ …exactly one green source pixel, at an end of the piece", cut.filter((x) => x === 0).length === 1 && (cut[0] === 0 || cut[cut.length - 1] === 0), cut);
      rec("⚠️ …the half that kept its source is untouched", row(file, 120, 20, 39).join(",") === [0].concat(Array(19).fill(11)).join(","), row(file, 120, 20, 39));
      rec("⚠️ …and the base game's own sourceless river is left exactly as Paradox ships it", row(file, 220, 20, 30).every((x) => x === 11), row(file, 220, 20, 30));
      const after = await srv.validate(MOD);
      rec("⭐ afterwards Map Errors has no sourceless river to report", noSource(after).length === 0, noSource(after));
    }

    console.log("\n2. ⚠️ Controls: a base river the mod did not cut stays Paradox's");
    {
      // A new river drawn well away from both: the mod owns rivers.bmp, and the paint path gives the new river its own source.
      const MOD = world.mod("River New", {});
      const small = page.sb.classifyRiverPalette((await fetch(`${srv.base}/api/map/rivers-info?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json())).palette).find((it) => it.role === "small");
      const r = await srv.post("/api/map/rivers-paint", { edits: Array.from({ length: 10 }, (_, i) => ({ x: 180 + i, y: 230, index: small.i })) }, MOD);
      rec("a new river on its own saved, with the source the paint path adds", r.status === 200 && r.body.ok === true && r.body.addedSource === 1, r.body);
      const v = await srv.validate(MOD);
      rec("⭐⭐ the base game's sourceless river is not reported to a mod that never touched it", noSource(v).length === 0, noSource(v));
    }
    {
      // A cut through the river the base game ALREADY ships without a source: both halves were sourceless before the mod did anything.
      const MOD = world.mod("River Cut Sourceless", {});
      const erase = await eraseFor(MOD);
      const r = await srv.post("/api/map/rivers-paint", { edits: [{ x: 25, y: 220, index: erase }] }, MOD);
      rec("a gap erased in the base game's sourceless river saved", r.status === 200 && r.body.ok === true, r.body);
      const v = await srv.validate(MOD);
      rec("⭐⭐ …and neither half is blamed on the mod: the base game drew that river with no source", noSource(v).length === 0, noSource(v).flatMap((x) => x.coords || []));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== a river the mod cut from its source is reported and given one: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
