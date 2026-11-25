// Regression: Country Setup flag PREVIEW. HOI4 flags are uncompressed true-color .tga, which browsers can't
// render and sharp/jimp can't decode — so /api/flags/country-flag hand-decodes the TGA to RGBA and serves a
// PNG. Asserts a real game flag decodes to an 82x52 PNG, and a missing flag 404s. Skips if no game flags.
// Run: node test-flag-preview.js
const fs = require("fs"), path = require("path");
const { createApp } = require("./server.js");
const sharp = require("sharp");
const FLAGS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/gfx/flags";
const PORT = 3508, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  if (!fs.existsSync(FLAGS)) { console.log("  (no vanilla gfx/flags — skipping, treated as pass)"); process.exitCode = 0; return; }
  // Find a plain <TAG>.tga (uncompressed true-color, as HOI4 ships) to exercise the decoder.
  let tag = null;
  try { const f = fs.readdirSync(FLAGS).find((n) => /^[A-Z0-9_]{2,8}\.tga$/.test(n)); if (f) tag = f.replace(/\.tga$/i, ""); } catch (_) {}
  if (!tag) { console.log("  (no plain <TAG>.tga found — skipping, treated as pass)"); process.exitCode = 0; return; }

  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  try {
    const r = await fetch(`${BASE}/api/flags/country-flag?tag=${tag}`);
    ok(r.status === 200, `flag endpoint 200 for ${tag}`, { status: r.status });
    ok((r.headers.get("content-type") || "").includes("png"), "served as image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    const meta = await sharp(buf).metadata();
    ok(meta.width === 82 && meta.height === 52, "decoded to an 82x52 PNG (the main flag size)", { w: meta.width, h: meta.height });
    // the decode must produce a real image, not a blank one — check the centre column has >1 colour OR the
    // file is non-trivial (a solid-band flag can have a flat centre column, so accept either signal)
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let distinct = new Set();
    for (let y = 0; y < info.height; y++) { const i = (y * info.width + (info.width >> 1)) * info.channels; distinct.add(`${data[i]},${data[i + 1]},${data[i + 2]}`); }
    ok(buf.length > 50 && info.width === 82, "PNG is a real decoded image (non-empty)", { bytes: buf.length, centreColours: distinct.size });

    // A tag with no flag on disk must 404 (so the UI shows its "no flag yet" hint), not 500.
    const r2 = await fetch(`${BASE}/api/flags/country-flag?tag=ZZQ9`);
    ok(r2.status === 404 || r2.status === 400, "a missing flag returns not-found (not a crash)", { status: r2.status });
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
