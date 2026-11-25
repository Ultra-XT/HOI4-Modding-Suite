// #flag-tga-truecolor — importing a real HOI4 flag must work.
//
// HOI4 flags are almost all UNCOMPRESSED TRUE-COLOUR TGA (image type 2, 24/32 bpp). sharp/libvips in this
// build has no TGA loader at all — metadata() throws on every TGA — so the handler's fallback decoder is the
// only one that ever runs, and it decoded PALETTE TGAs only. That is exactly the format the endpoint's own
// error message tells the user NOT to use:
//
//   "Convert PNG/JPEG to uncompressed true-color type-2 TGA (24 or 32 bpp), not indexed or RLE."
//
// So every genuine flag was rejected with "Input file contains unsupported image format" — including flags
// Nova itself had just written — while the only file that imported was the one the message forbids. Nova
// already owned a working decoder (decodeFlagTgaToRgba, used by /api/flags/country-flag to serve these same
// bytes); the import path simply never called it.
//
// Both directions: true-colour must now work, and palette must KEEP working — it was the one thing that did.
//
// Hermetic: both TGAs are built here byte by byte, so the real install is never read.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tga-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "flagmod");
fs.mkdirSync(path.join(MOD, "gfx", "flags"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FlagMod"\nsupported_version="1.18.*"\n', "utf8");

// TGA header: idlen, cmapType, imgType, cmapStart(2), cmapLen(2), cmapDepth, xorg(2), yorg(2), w(2), h(2), bpp, desc
function tgaHeader({ cmapType, imgType, cmapLen = 0, cmapDepth = 0, w, h, bpp, desc = 0 }) {
  const b = Buffer.alloc(18);
  b[1] = cmapType; b[2] = imgType;
  b.writeUInt16LE(cmapLen, 5); b[7] = cmapDepth;
  b.writeUInt16LE(w, 12); b.writeUInt16LE(h, 14);
  b[16] = bpp; b[17] = desc;
  return b;
}

// The format every real HOI4 flag uses, and the one that was rejected.
const W = 4, H = 4;
const TRUECOLOR = path.join(ROOT, "truecolor.tga");
{
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { px[i * 4] = 0x20; px[i * 4 + 1] = 0x40; px[i * 4 + 2] = 0xc0; px[i * 4 + 3] = 0xff; }
  fs.writeFileSync(TRUECOLOR, Buffer.concat([tgaHeader({ cmapType: 0, imgType: 2, w: W, h: H, bpp: 32, desc: 0x20 }), px]));
}

// The palette form — the ONLY one that used to import, kept as the regression control.
const PALETTE = path.join(ROOT, "palette.tga");
{
  const cmap = Buffer.from([0xc0, 0x40, 0x20]); // one BGR entry
  const px = Buffer.alloc(W * H, 0);
  fs.writeFileSync(PALETTE, Buffer.concat([
    tgaHeader({ cmapType: 1, imgType: 1, cmapLen: 1, cmapDepth: 24, w: W, h: H, bpp: 8, desc: 0x20 }),
    cmap, px,
  ]));
}

const PORT = 42179;
const app = createApp();
const server = app.listen(PORT, async () => {
  const importFlag = async (stem, sourcePath) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/flags/import-custom-image`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stem, sourcePath, modRoot: MOD }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const wrote = (stem) => {
    const dir = path.join(MOD, "gfx", "flags");
    try { return fs.readdirSync(dir).some((f) => f.toLowerCase().startsWith(stem.toLowerCase())); } catch (_) { return false; }
  };

  try {
    console.log("\n[true-colour] the format every real HOI4 flag uses");
    const tc = await importFlag("nua_truecolor", TRUECOLOR);
    rec("the import succeeded", tc.status === 200 && tc.body && tc.body.ok !== false, tc.body || tc.status);
    rec("…and flag files were written", wrote("nua_truecolor"),
      (() => { try { return fs.readdirSync(path.join(MOD, "gfx", "flags")); } catch (_) { return "(none)"; } })());

    console.log("\n[palette] the form that always worked must keep working");
    const pal = await importFlag("nua_palette", PALETTE);
    rec("the import succeeded", pal.status === 200 && pal.body && pal.body.ok !== false, pal.body || pal.status);
    rec("…and flag files were written", wrote("nua_palette"),
      (() => { try { return fs.readdirSync(path.join(MOD, "gfx", "flags")); } catch (_) { return "(none)"; } })());

    console.log("\n[still refused] something that genuinely is not an image");
    const junk = path.join(ROOT, "notanimage.tga");
    fs.writeFileSync(junk, Buffer.from("this is not a TGA at all, not even close", "utf8"));
    const bad = await importFlag("nua_junk", junk);
    rec("a non-image is still refused", !(bad.body && bad.body.ok === true), bad.body || bad.status);
    rec("…with a message, not a crash", bad.status === 400 && bad.body && bad.body.error, bad.body || bad.status);

    console.log(`\n=== flag TGA true-colour import: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
