// MAP country thumbnail (integration): GET /api/map/country-thumb renders a PNG of a country's territory,
// cropped to its bounding box and highlighted in its colors.txt colour, for the Country Setup minimap. Builds
// a clean total-conversion temp mod (replace_path so vanilla doesn't leak), renders AAA, decodes the PNG and
// asserts AAA's colour dominates while a non-owner returns 404. Run: npm run test:map-country-thumb
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { Jimp } = require("jimp");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-thumb-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Thumb E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "2.txt"), 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  // AAA = orange, BBB = blue — so we can assert AAA's colour dominates and BBB's does NOT appear.
  mk(path.join(mod, "common", "countries", "colors.txt"),
    "AAA = {\n\tcolor = rgb { 240 130 20 }\n}\nBBB = {\n\tcolor = rgb { 20 130 240 }\n}\n");
  return mod;
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: route }, (res) => {
      const chunks = []; res.on("data", (d) => chunks.push(d)); res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}
const near = (a, b, t) => Math.abs(a - b) <= t;

(async () => {
  console.log("=== MAP country thumbnail (integration) ===");
  const mod = buildMod();
  const PORT = 3659;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mp = encodeURIComponent(mod);
  try {
    // AAA owns territory → a PNG.
    const r = await get(PORT, `/api/map/country-thumb?modPath=${mp}&tag=AAA`);
    ok("AAA thumbnail: HTTP 200", r.status === 200, r.status);
    ok("AAA thumbnail: content-type image/png", /image\/png/.test(r.type), r.type);
    ok("AAA thumbnail: non-trivial PNG bytes", r.body.length > 100, r.body.length);

    const img = await Jimp.read(r.body);
    ok("AAA thumbnail decodes as an image", img.bitmap.width > 0 && img.bitmap.height > 0, [img.bitmap.width, img.bitmap.height]);
    // Count AAA's colour (240,130,20) and BBB's (20,130,240) in the output.
    let aaaPx = 0, bbbPx = 0; const d = img.bitmap.data;
    for (let i = 0; i < d.length; i += 4) {
      if (near(d[i], 240, 12) && near(d[i + 1], 130, 12) && near(d[i + 2], 20, 12)) aaaPx++;
      if (near(d[i], 20, 12) && near(d[i + 1], 130, 12) && near(d[i + 2], 240, 12)) bbbPx++;
    }
    ok("AAA's colour (240,130,20) is painted in the thumbnail", aaaPx > 0, aaaPx);
    ok("BBB's colour does NOT appear (other land is dimmed grey, not its colour)", bbbPx === 0, bbbPx);

    // A country that owns no territory → 404 JSON, not a broken image.
    const z = await get(PORT, `/api/map/country-thumb?modPath=${mp}&tag=ZZZ`);
    ok("non-owner ZZZ → HTTP 404", z.status === 404, z.status);
    ok("non-owner ZZZ → JSON error (not an image)", /application\/json/.test(z.type) && /owns no territory/i.test(z.body.toString()), z.body.toString().slice(0, 80));

    // Missing tag → 400.
    const b = await get(PORT, `/api/map/country-thumb?modPath=${mp}`);
    ok("missing tag → HTTP 400", b.status === 400, b.status);

    // The cache serves a repeat request correctly (same bytes-ish, still a valid PNG).
    const r2 = await get(PORT, `/api/map/country-thumb?modPath=${mp}&tag=AAA`);
    ok("repeat request (cached context) still returns a PNG", r2.status === 200 && /image\/png/.test(r2.type), [r2.status, r2.type]);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-COUNTRY-THUMB: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
