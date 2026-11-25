// #icon-picker-never-shows-new-upload — an icon uploaded after a picker has been opened must appear in it.
//
// The upload handler deliberately does NOT clear spriteMapCache: that map holds ~163k entries and clearing it
// forced a multi-second synchronous rebuild on the next icon request. Instead it writes the new sprite
// straight into the map. But filteredSpriteCache holds the pre-filtered LISTS the icon browsers actually
// render, and those are derived — writing into spriteMapCache does not touch them, and they are only ever
// invalidated by the cascade on spriteMapCache.clear(), which that optimisation exists to avoid.
//
// So once a picker had been opened, its list was frozen for the rest of the session and no icon uploaded
// afterwards ever showed up. No concurrency needed — a single user hits this by uploading a second icon.
//
// The test asserts the cache is genuinely WARM first (a first request, then a second one that must return the
// same list). Without that, "the icon appears after upload" would pass even if caching were broken entirely,
// which is the vacuous pass this whole bug hides behind.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-iconcache-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240));
  }
}

const MOD = path.join(ROOT, "iconmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="IconMod"\nsupported_version="1.18.*"\n', "utf8");

// A minimal valid 1x1 PNG, built here so the test carries no binary fixture.
function makePng() {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);   // width
  ihdr.writeUInt32BE(1, 4);   // height
  ihdr[8] = 8;                // bit depth
  ihdr[9] = 6;                // colour type RGBA
  const raw = Buffer.from([0, 255, 0, 0, 255]); // filter byte + one red pixel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PORT = 42143;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const sprites = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/sprites?modPath=${q}`);
    const b = await r.json().catch(() => null);
    const arr = Array.isArray(b) ? b : (b && (b.sprites || b.items)) || [];
    return { status: r.status, names: arr.map((s) => (typeof s === "string" ? s : (s && (s.name || s.key || s.sprite)) || "")).filter(Boolean) };
  };
  const upload = async (name) => {
    const fd = new FormData();
    fd.append("image", new Blob([makePng()], { type: "image/png" }), name + ".png");
    fd.append("type", "idea");
    fd.append("name", name);
    fd.append("modPath", MOD);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/upload-gfx`, { method: "POST", body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── The cache must actually be warm, or the rest of this test proves nothing ─────────────────
    console.log("\n[warm] the picker's list is cached between requests");
    const first = await sprites();
    rec("the sprite list loads", first.status === 200, first.status);
    const second = await sprites();
    rec("a second request returns the same list", second.names.length === first.names.length,
      { first: first.names.length, second: second.names.length });

    // ── Upload, then re-open the picker ──────────────────────────────────────────────────────────
    console.log("\n[upload] a new icon must appear in the already-opened picker");
    const NAME = "nova_cache_probe";
    rec("the new sprite is not there beforehand",
      !first.names.some((n) => String(n).toLowerCase().includes(NAME)), "already present before upload");

    const up = await upload(NAME);
    rec("the upload succeeded", up.status === 200 && up.body && up.body.ok !== false, up.body || up.status);
    const sprite = up.body && up.body.spriteName;
    rec("the upload reported a sprite name", !!sprite, up.body);

    const after = await sprites();
    rec("the picker now lists the uploaded icon",
      after.names.some((n) => String(n).toLowerCase().includes(NAME)),
      { looking_for: sprite, count: after.names.length, sample: after.names.slice(0, 5) });
    rec("…and the list grew rather than being emptied", after.names.length >= first.names.length,
      { before: first.names.length, after: after.names.length });

    // ── A SECOND upload must also show up — the cache has to stay invalidatable ──────────────────
    console.log("\n[second upload] invalidation is not a one-shot");
    const NAME2 = "nova_cache_probe_two";
    const up2 = await upload(NAME2);
    rec("the second upload succeeded", up2.status === 200 && up2.body && up2.body.ok !== false, up2.body || up2.status);
    const after2 = await sprites();
    rec("the picker lists the second icon too",
      after2.names.some((n) => String(n).toLowerCase().includes(NAME2)),
      { count: after2.names.length, sample: after2.names.slice(0, 5) });
    rec("…and still lists the first one", after2.names.some((n) => String(n).toLowerCase().includes(NAME)),
      "the first upload fell out of the list");

    console.log(`\n=== icon picker cache invalidation: ${checks} checks, ${fails.length} failed ===`);
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
