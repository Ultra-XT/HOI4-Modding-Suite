// /api/upload-gfx accepts a multipart form with `image`, `type`, `name` and `modPath`. Two of those were
// handled inconsistently:
//
//  * `name` is defaulted on the very first line (`String(name || "custom_image")`), and every branch works
//    from that sanitised value — except the leader/character branch, which read the RAW `name` to derive a
//    country tag. A portrait upload without a name therefore threw "Cannot read properties of undefined
//    (reading 'split')", and Nova handed that raw JavaScript error to the user as the failure message.
//  * `type` was interpolated raw into the .gfx definition FILE NAME, so an upload without one wrote a file
//    literally called `custom_undefined_<name>.gfx` into the modder's interface/ folder. An unrecognised type
//    already falls through to sensible interface/ + GFX_ defaults, so the name was the only place it leaked.
//
// Neither is reachable from the shipped UI (all nine in-app call sites send both fields), so this is
// robustness for scripts, add-ons and future callers rather than a bug a modder hits by clicking. The value
// is that a missing field now degrades predictably instead of crashing or writing `undefined` into the mod.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upgfx-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "upmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="UpMod"\nsupported_version="1.18.*"\n', "utf8");

// A genuinely valid 1x1 RGBA PNG, built with real CRCs — the same generator test-sprite-warm-drops-upload
// uses. A hand-typed hex blob is rejected by the image decoder, and because this endpoint answers HTTP 200
// with an `error` body, that rejection reads as success unless the assertions check for `error` (which is
// how the first version of this test passed vacuously).
const zlib = require("zlib");
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

const PORT = 42435;
const app = createApp();
const server = app.listen(PORT, async () => {
  const upload = async (fields) => {
    const fd = new FormData();
    fd.append("image", new Blob([makePng()], { type: "image/png" }), "art.png");
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
    fd.append("modPath", MOD);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/upload-gfx`, { method: "POST", body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // This endpoint answers HTTP 200 even when it failed, putting the reason in `error`. Checking only the
  // status (or only `ok !== false`) therefore reads a total failure as a pass.
  const succeeded = (r) => r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
  const gfxFiles = () => {
    try { return fs.readdirSync(path.join(MOD, "interface")).filter((f) => f.endsWith(".gfx")); } catch (_) { return []; }
  };

  try {
    console.log("\n[control] a normal upload still works and still names its file the same way");
    // This is what stops the fixes from quietly renaming every .gfx a real mod already references.
    let r = await upload({ type: "idea", name: "nova_test_idea" });
    rec("a normal upload succeeded", succeeded(r), r.body || r.status);
    rec("its .gfx keeps the exact historical name",
      gfxFiles().includes("custom_idea_nova_test_idea.gfx"), gfxFiles());

    console.log("\n[missing name] a portrait upload with no name must not crash");
    r = await upload({ type: "leader" });
    rec("it did NOT return a raw JavaScript error",
      !(r.body && /Cannot read propert|undefined \(reading/i.test(String(r.body.error || ""))),
      r.body);
    rec("it succeeded rather than failing", succeeded(r), r.body || r.status);
    rec("…and fell back to the generic portrait folder",
      !!(r.body && /leaders[\\/]GENERIC|leaders[\\/]generic/i.test(String(r.body.ddsPath || r.body.spriteName || JSON.stringify(r.body)))),
      r.body);

    console.log("\n[missing type] must not write `undefined` into the mod's interface folder");
    r = await upload({ name: "nova_no_type" });
    rec("the upload succeeded", succeeded(r), r.body || r.status);
    rec("NO file named custom_undefined_* was written",
      !gfxFiles().some((f) => /custom_undefined_/.test(f)), gfxFiles());
    rec("…it used a readable fallback token instead",
      gfxFiles().includes("custom_image_nova_no_type.gfx"), gfxFiles());

    console.log("\n[missing both] the two defaults compose");
    r = await upload({});
    rec("the upload succeeded", succeeded(r), r.body || r.status);
    rec("no `undefined` anywhere in the interface folder",
      !gfxFiles().some((f) => /undefined/.test(f)), gfxFiles());

    console.log("\n[control] every recognised type keeps its historical file name");
    // A sanitised recognised token equals itself, so nothing a mod already ships gets renamed.
    for (const t of ["event", "decision", "focus", "technology"]) {
      r = await upload({ type: t, name: `nova_${t}_art` });
      rec(`type "${t}" still writes custom_${t}_nova_${t}_art.gfx`,
        gfxFiles().includes(`custom_${t}_nova_${t}_art.gfx`), gfxFiles());
    }

    console.log(`\n=== upload-gfx missing fields: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
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
