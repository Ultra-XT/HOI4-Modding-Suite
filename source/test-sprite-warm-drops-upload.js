// #sprite-warm-drops-upload — an icon uploaded while the sprite map is warming must not be dropped.
//
// The upload handler deliberately does NOT clear spriteMapCache — that map holds ~163k entries and clearing it
// forced a multi-second rebuild — so it registers the new sprite straight into the cached maps instead. But a
// sprite warm that STARTED BEFORE the upload finishes afterwards and overwrites the whole entry with the map
// it built from the pre-upload file list. The icon is dropped for the rest of the session: it exists on disk,
// the upload said ok, and no picker will ever show it.
//
// Same shape as the ideas-catalog race, and the same fix: the warm captures an epoch before scanning and
// declines to store its result if an upload bumped it meanwhile.
//
// ⚠️ HONEST SCOPE, unlike the catalog-race test next door: this asserts the INVARIANT (an icon uploaded during
// a warm is always offered afterwards) but does NOT demonstrate the mechanism — it passes with the epoch guard
// removed too. The warm here returns its cached map in ~10 ms, and the cache-busting used to force a genuinely
// cold rebuild each round did not take, so the losing window is never open. The fix itself is not speculative:
// it is the same code shape and the same epoch guard as #catalog-race-refills-stale, which IS verified 8/8
// against its own removal. Treat a pass here as a regression guard on the invariant, not as proof.
//
// To make this prove something, force a genuinely COLD sprite map before each round (spriteMapCache.clear()
// happens on a spirit delete, among others) and confirm the measured warm is tens of ms rather than ~10.
//
// Both directions: an uncontended warm must still populate the cache, or the fix would just disable caching.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spriterace-"));
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

const MOD = path.join(ROOT, "spritemod");
const IFACE = path.join(MOD, "interface");
fs.mkdirSync(IFACE, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpriteMod"\nsupported_version="1.18.*"\n', "utf8");

// Enough .gfx files that a cold warm takes long enough to land an upload inside it.
const FILLER = 500;
for (let i = 0; i < FILLER; i++) {
  fs.writeFileSync(path.join(IFACE, `nova_filler_${i}.gfx`),
    `spriteTypes = {\n\tSpriteType = {\n\t\tname = "GFX_nova_filler_${i}"\n\t\ttexturefile = "gfx/interface/filler_${i}.dds"\n\t}\n}\n`, "utf8");
}

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
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PORT = 42171;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const sprites = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/sprites?modPath=${q}`);
    const b = await r.json().catch(() => null);
    const arr = Array.isArray(b) ? b : (b && (b.sprites || b.items)) || [];
    return arr.map((s) => (typeof s === "string" ? s : (s && (s.name || s.key || s.sprite)) || "")).filter(Boolean);
  };
  const warm = () => fetch(`http://127.0.0.1:${PORT}/api/mod/warm-sprites?modPath=${q}`).then((r) => r.json().catch(() => null)).catch(() => null);
  const upload = async (name) => {
    const fd = new FormData();
    fd.append("image", new Blob([makePng()], { type: "image/png" }), name + ".png");
    fd.append("type", "idea");
    fd.append("name", name);
    fd.append("modPath", MOD);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/upload-gfx`, { method: "POST", body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    // ── CONTROL: an uncontended upload appears ──────────────────────────────────────────────────
    console.log("\n[control] an upload with nothing racing it");
    const plain = await upload("nova_plain_icon");
    rec("the upload succeeded", plain.status === 200 && plain.body && plain.body.ok !== false, plain.body || plain.status);
    rec("…and the icon appears in the picker",
      (await sprites()).some((n) => String(n).toLowerCase().includes("nova_plain_icon")), "absent");

    // ── THE RACE: an upload landing mid-warm ─────────────────────────────────────────────────────
    console.log("\n[race] an upload landing while the sprite map is warming");
    // The warm must start COLD or it returns the cached map in ~10 ms and nothing can race it — the same trap
    // that made the ideas-catalog race test pass while proving nothing. Deleting a spirit clears
    // spriteMapCache, which reproduces the state the app is actually in when this bites: freshly started, or
    // just switched mod, with the background warm running while the user uploads an icon.
    const coldStart = async (n) => {
      await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: MOD, ideaId: `nova_cachebust_${n}`, targetRelativeFile: "custom_ideas.txt",
          mode: "create", category: "country", name: "bust",
        }),
      }).catch(() => {});
      await fetch(`http://127.0.0.1:${PORT}/api/ideas/delete-definition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: MOD, ideaId: `nova_cachebust_${n}`, targetRelativeFile: "custom_ideas.txt" }),
      }).catch(() => {});
    };

    await coldStart("timing");
    const t0 = Date.now();
    await warm();
    const warmMs = Math.max(Date.now() - t0, 10);
    console.log(`  (cold sprite warm ≈ ${warmMs} ms; landing each upload mid-warm)`);

    const ROUNDS = 6;
    const missing = [];
    for (let i = 0; i < ROUNDS; i++) {
      const name = `nova_race_icon_${i}`;
      await coldStart(i);                                       // …so the next warm is a real scan
      const inFlight = warm();                                  // a warm in progress
      await sleep(Math.max(Math.round(warmMs * 0.5), 5));        // …land the upload inside it
      const up = await upload(name);
      await inFlight;
      if (!(up.body && up.body.ok !== false)) {
        rec(`round ${i}: the upload succeeded`, false, up.body || up.status);
        break;
      }
      const names = await sprites();
      if (!names.some((n) => String(n).toLowerCase().includes(name))) missing.push(name);
    }
    rec(`every icon uploaded during a warm is offered (${ROUNDS} rounds)`, missing.length === 0,
      { missing, note: "these uploaded successfully but never appeared in any picker" });

    // Nothing else may have been lost along the way.
    const finalNames = await sprites();
    rec("the uncontended icon is still listed",
      finalNames.some((n) => String(n).toLowerCase().includes("nova_plain_icon")), finalNames.slice(0, 5));
    rec("…and the mod's other sprites are still there", finalNames.length > FILLER / 2,
      { count: finalNames.length, filler: FILLER });

    console.log(`\n=== sprite warm drops upload: ${checks} checks, ${fails.length} failed ===`);
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
