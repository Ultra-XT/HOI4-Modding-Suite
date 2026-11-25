// Regression: the Country Setup flag upload (/api/flags/upload-country-flag) writes a country's base flag —
// gfx/flags/<TAG>.tga + medium/small sizes + the communism/democratic/fascism/neutrality variants — from an
// uploaded PNG (a non-coder shouldn't have to convert to TGA first). Built for the 1.0.5 country-flag feature.
// Run: node test-flag-upload.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let sharp; try { sharp = require("sharp"); } catch (_) { sharp = null; }
const PORT = 3502, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  if (!sharp) { console.log("  (sharp not installed — skipping flag-upload test, treated as pass)"); process.exitCode = 0; return; }
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Flag"\n');
  const flagsRoot = path.join(mod, "gfx", "flags");
  const exists = (p) => fs.existsSync(path.join(flagsRoot, p));
  // a valid PNG (16x12, solid colour) — proves PNG is accepted without a TGA conversion step
  const png = await sharp({ create: { width: 16, height: 12, channels: 4, background: { r: 200, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
  const postFlag = async (tag, buf, type = "image/png", name = "flag.png") => {
    const fd = new FormData();
    fd.append("image", new Blob([buf], { type }), name);
    fd.append("tag", tag);
    fd.append("modPath", mod);
    const r = await fetch(BASE + "/api/flags/upload-country-flag", { method: "POST", body: fd });
    return { status: r.status, body: await r.json() };
  };
  try {
    const r = await postFlag("ZZA", png);
    ok(r.body && r.body.ok, "PNG upload accepted + ok", r);
    // base flag at all three HOI4 sizes
    ok(exists("ZZA.tga"), "main flag gfx/flags/ZZA.tga written");
    ok(exists(path.join("medium", "ZZA.tga")), "medium flag gfx/flags/medium/ZZA.tga written");
    ok(exists(path.join("small", "ZZA.tga")), "small flag gfx/flags/small/ZZA.tga written");
    // ideology variants (HOI4 resolves these on some UI/map paths)
    ok(["communism", "democratic", "fascism", "neutrality"].every((i) => exists(`ZZA_${i}.tga`)), "all 4 ideology variants written");
    // the main file is a valid uncompressed 32-bit TGA at 82x52 (header: type 2, 32bpp, width/height)
    const buf = fs.readFileSync(path.join(flagsRoot, "ZZA.tga"));
    ok(buf[2] === 2 && buf[16] === 32, "main TGA is uncompressed true-colour 32bpp (type 2)", { type: buf[2], bpp: buf[16] });
    ok(buf.readUInt16LE(12) === 82 && buf.readUInt16LE(14) === 52, "main TGA is 82x52 (HOI4 flag size)", { w: buf.readUInt16LE(12), h: buf.readUInt16LE(14) });

    // a bad tag is rejected, nothing written
    const bad = await postFlag("1bad tag!", png);
    ok(bad.status === 400 && bad.body && bad.body.error, "invalid tag rejected (400)", bad);

    // a non-image upload is rejected cleanly (not a crash)
    const notImg = await postFlag("ZZB", Buffer.from("not an image"), "image/png", "x.png");
    ok(notImg.status === 400 && notImg.body && notImg.body.error, "non-image upload rejected (400)", notImg);
    ok(!exists("ZZB.tga"), "the rejected upload wrote nothing");
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
