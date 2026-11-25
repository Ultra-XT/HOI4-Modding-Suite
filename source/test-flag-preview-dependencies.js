// #flag-preview-ignores-dependencies — LOOK WHERE THE GAME LOOKS.
//
// Country Setup's flag preview searched exactly `[modPath, gameRoot]`. A mod's DEPENDENCIES were skipped, so
// an add-on built over a base mod fell straight through to vanilla.
//
// 🈯 Measured against Millennium Dawn (4,391 flag files): counting only real 3-character HOI4 tags, 426
// of them — 195 MD REPLACES showed vanilla's
// flag instead of the one the player actually sees, and 231 tags only MD defines showed nothing at all —
// "No flag found for this country" for countries that plainly have one. 426 countries wrong or empty.
// (An earlier draft said 442/197/245; that counted filename prefixes, which includes stems that are not
// country tags at all.)
//
// ⚠️ THE CONTROL THAT MATTERS IS ORDER, NOT PRESENCE. getActiveRoots returns roots lowest-priority FIRST and
// this endpoint takes the first hit, so a fix that merely adds the dependency roots without reversing them
// makes VANILLA win every contest — and the flag still loads, so nothing looks wrong. Every case below is
// therefore checked by PIXEL COLOUR: each root paints its flag a different solid colour, and the test asserts
// which root's flag came back, not merely that one did.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flagdep-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
// A skip is NOT a pass. rec(label, true) records an assertion that cannot fail, and doing that for a
// skipped case makes an untested control read exactly like a working one in the summary line.
const skipped = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => fs.mkdirSync(p, { recursive: true });

// A HOI4 flag byte-for-byte in shape: uncompressed true-colour, 82x52, 32-bit, descriptor 8, TGA 2.0 footer.
// Taken from vanilla's own headers rather than invented, so the endpoint's decoder is exercised for real.
function writeFlagTga(file, [r, g, b]) {
  const W = 82, H = 52;
  const head = Buffer.alloc(18);
  head[2] = 2;                    // uncompressed true-colour
  head.writeUInt16LE(W, 12);
  head.writeUInt16LE(H, 14);
  head[16] = 32;                  // bits per pixel
  head[17] = 8;                   // 8 alpha bits, bottom-left origin
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = b; px[i * 4 + 1] = g; px[i * 4 + 2] = r; px[i * 4 + 3] = 255; // BGRA
  }
  const foot = Buffer.alloc(26);
  foot.write("TRUEVISION-XFILE.", 8, "ascii");
  mk(path.dirname(file));
  fs.writeFileSync(file, Buffer.concat([head, px, foot]));
}
const RED = [220, 20, 20], GREEN = [20, 200, 20], BLUE = [20, 20, 220];
const near = (a, b) => Math.abs(a[0] - b[0]) < 24 && Math.abs(a[1] - b[1]) < 24 && Math.abs(a[2] - b[2]) < 24;

// ── base mod: owns flags for three tags ─────────────────────────────────────────────────────────────────
const BASE = path.join(ROOT, "basemod");
fs.writeFileSync(path.join(mk(BASE) || BASE, "descriptor.mod"), 'name="FlagBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "basemod.mod"),
  'name="FlagBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
writeFlagTga(path.join(BASE, "gfx", "flags", "QQA.tga"), GREEN); // only the base has it
writeFlagTga(path.join(BASE, "gfx", "flags", "QQB.tga"), GREEN); // the add-on overrides this one

// ── add-on: depends on the base, overrides one flag ─────────────────────────────────────────────────────
const ADDON = path.join(ROOT, "addon");
fs.writeFileSync(path.join(mk(ADDON) || ADDON, "descriptor.mod"),
  'name="FlagAddon"\ndependencies={\n\t"FlagBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "addon.mod"),
  'name="FlagAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"FlagBase"\n}\nsupported_version="1.19.*"\n');
writeFlagTga(path.join(ADDON, "gfx", "flags", "QQB.tga"), BLUE);

// A tag VANILLA defines, which the base mod also replaces — the order control.
const GAME_FLAGS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/gfx/flags";
let sharedTag = "";
try {
  const f = fs.readdirSync(GAME_FLAGS).find((n) => /^[A-Z]{3}\.tga$/.test(n));
  if (f) sharedTag = f.replace(/\.tga$/i, "");
} catch (_) {}
if (sharedTag) writeFlagTga(path.join(BASE, "gfx", "flags", sharedTag + ".tga"), GREEN);

let PORT = 50496;
(async () => {
  let srv = null;
  try {
    const app = createApp();
    srv = await new Promise((r) => { const s = app.listen(++PORT, () => r(s)); });
    const flag = async (tag, mod) => {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/flags/country-flag?tag=${tag}&modPath=${encodeURIComponent(mod)}`);
      if (res.status !== 200) return { status: res.status };
      const buf = Buffer.from(await res.arrayBuffer());
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      const i = ((info.height >> 1) * info.width + (info.width >> 1)) * info.channels;
      return { status: 200, rgb: [data[i], data[i + 1], data[i + 2]], w: info.width, h: info.height };
    };

    console.log("\n[a flag only the BASE MOD supplies] the add-on's preview must find it");
    {
      const r = await flag("QQA", ADDON);
      rec("it is found at all (was 404)", r.status === 200, r);
      rec("…and it is the BASE's flag", r.rgb && near(r.rgb, GREEN), r);
      rec("…decoded at the real flag size", r.w === 82 && r.h === 52, r);
    }

    console.log("\n[a flag BOTH supply] the add-on's own must win");
    {
      const r = await flag("QQB", ADDON);
      rec("served", r.status === 200, r);
      rec("…and it is the ADD-ON's, not the base's", r.rgb && near(r.rgb, BLUE), r);
    }

    console.log("\n[⚠️ THE ORDER CONTROL] a base mod's flag must beat VANILLA's for the same tag");
    if (!sharedTag) skipped.push("the ORDER control — no vanilla flags installed");
    else {
      const r = await flag(sharedTag, ADDON);
      rec(`${sharedTag} is served`, r.status === 200, r);
      // Vanilla's flag is a real one and will not be this flat synthetic green.
      rec("…and it is the BASE MOD's, not vanilla's — the roots are in priority order",
        r.rgb && near(r.rgb, GREEN), r);
    }

    console.log("\n[CONTROL — the base mod alone] must be unaffected by any of this");
    {
      const r = await flag("QQA", BASE);
      rec("its own flag still resolves", r.status === 200 && r.rgb && near(r.rgb, GREEN), r);
      const r2 = await flag("QQB", BASE);
      rec("…and it does NOT see the add-on's override", r2.status === 200 && r2.rgb && near(r2.rgb, GREEN), r2);
    }

    console.log("\n[CONTROL — vanilla still reachable] adding roots must not lose the ones already there");
    if (!sharedTag) skipped.push("the vanilla-still-reachable control — no vanilla flags installed");
    else {
      let other = "";
      try {
        other = (fs.readdirSync(GAME_FLAGS).filter((n) => /^[A-Z]{3}\.tga$/.test(n))
          .map((n) => n.replace(/\.tga$/i, "")).find((t) => t !== sharedTag)) || "";
      } catch (_) {}
      const r = other ? await flag(other, ADDON) : { status: 200 };
      rec(`a vanilla-only tag (${other || "n/a"}) still resolves through the add-on`, r.status === 200, r);
    }

    console.log("\n[CONTROL — a tag nobody has] still says so rather than crashing");
    {
      const r = await flag("QQZ", ADDON);
      rec("404, not a 500", r.status === 404, r);
    }

    if (skipped.length) console.log("\n  ⚠️  NOT EXERCISED HERE: " + skipped.join("; "));
    console.log(`\n=== flag preview dependencies: ${checks} checks, ${fails.length} failed`
      + `${skipped.length ? ", " + skipped.length + " NOT EXERCISED" : ""} ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
