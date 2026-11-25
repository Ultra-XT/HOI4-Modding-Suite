// Two upload findings recorded 2026-08-02, still real on re-verification.
//
// #upload-sprite-relative-path — every value in the sprite map is an ABSOLUTE path, because they all come
// from resolveTexturefilePath which path.resolve()s. The upload handler injected a RELATIVE
// "gfx/<subdir>/<file>" instead. The client feeds these straight to /api/buildings/icon-file?path=, so the
// icon you had just uploaded answered 404 while all 4,184 of its peers rendered. A comment above the line
// asserted the relative format, which is how the mismatch survived review.
//
// #upload-sprite-cache-poison — the injection looped over every cached sprite map regardless of its key, so
// uploading into mod A also put the sprite into mod B's picker, for a file mod B does not have. Picking it
// there writes a sprite name that resolves to nothing in game. The cache key is
// `${root}|${includeDlcs}|${assetRoots}`, so a map should only see the sprite when it IS this mod or when
// this mod is among its asset roots — a dependent add-on, which genuinely does inherit it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upsprite-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const mk = (name) => {
  const m = path.join(ROOT, name);
  fs.mkdirSync(path.join(m, "gfx", "interface", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return m;
};
const MOD_A = mk("upsprite_a");
const MOD_B = mk("upsprite_b");

// A tiny real PNG (1x1) — hand-built bytes, because a hand-typed placeholder is rejected by the decoder and
// the endpoint answers HTTP 200 with an error body, which would make every check below pass vacuously.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

const PORT = 42505;
const app = createApp();
const server = app.listen(PORT, async () => {
  const sprites = async (mod) =>
    (await fetch(`http://127.0.0.1:${PORT}/api/sprites?type=idea&modPath=${encodeURIComponent(mod)}`)).json();

  const upload = async (mod, name) => {
    const fd = new FormData();
    fd.append("modPath", mod);
    fd.append("type", "idea");
    fd.append("name", name);
    fd.append("image", new Blob([PNG], { type: "image/png" }), "probe.png");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/upload-gfx`, { method: "POST", body: fd });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  };

  const findSprite = (data, key) =>
    (data.sprites || []).find((s) => String(s.key || "").toLowerCase() === key.toLowerCase());

  try {
    console.log("\n[setup] warm BOTH mods' sprite caches before uploading");
    // The poisoning only happens to a map that is already cached — a mod built cold afterwards is fine. So
    // the caches must be warm before the upload or the bug cannot appear.
    const a0 = await sprites(MOD_A);
    const b0 = await sprites(MOD_B);
    rec("mod A's sprite map built", Array.isArray(a0.sprites), Object.keys(a0));
    rec("mod B's sprite map built", Array.isArray(b0.sprites), Object.keys(b0));
    rec("neither has the probe sprite yet",
      !findSprite(a0, "GFX_idea_upnovaprobe") && !findSprite(b0, "GFX_idea_upnovaprobe"), "pre-existing");

    console.log("\n[upload into mod A only]");
    const up = await upload(MOD_A, "upnovaprobe");
    // The endpoint answers 200 with an `error` body on a rejected image, so check the body, not the status.
    rec("the upload succeeded", up.s === 200 && up.b && !up.b.error, up.b || up.s);
    rec("…and wrote a .dds into mod A", fs.existsSync(path.join(MOD_A, "gfx", "interface", "ideas", "upnovaprobe.dds")),
      fs.readdirSync(path.join(MOD_A, "gfx", "interface", "ideas")));

    // LIMIT OF THIS TEST, stated rather than implied: injecting into NO map at all still leaves mod A
    // correct, because the write-epoch bump makes A's map rebuild from disk on the next request. So the
    // injection is a latency optimisation, not the source of truth, and a control that removes the
    // "this mod owns it" branch does NOT fail here. What the checks below do pin is the user-visible
    // outcome — A resolves, B is not poisoned — which is where both reported bugs actually bit.
    console.log("\n[1] the injected texturefile must be ABSOLUTE, like every peer");
    const a1 = await sprites(MOD_A);
    const mine = findSprite(a1, "GFX_idea_upnovaprobe");
    rec("mod A's map now has the sprite", !!mine, (a1.sprites || []).length);
    rec("…with an absolute path", !!mine && path.isAbsolute(String(mine.texturefile || "")), mine && mine.texturefile);
    rec("…that actually exists on disk", !!mine && fs.existsSync(String(mine.texturefile || "")), mine && mine.texturefile);
    // The control: this is how the peers look, so "absolute" is the house style rather than a guess.
    const peer = (a1.sprites || []).find((s) => s.texturefile && String(s.key).toLowerCase() !== "gfx_idea_upnovaprobe");
    if (peer) rec("…matching its peers, which are absolute too", path.isAbsolute(String(peer.texturefile)), peer.texturefile);
    else rec("(no peer sprite to compare against — vanilla not scanned here)", true);

    console.log("\n[2] mod B must NOT have gained a sprite it does not own");
    const b1 = await sprites(MOD_B);
    const leaked = findSprite(b1, "GFX_idea_upnovaprobe");
    rec("mod B's map did NOT gain the sprite", !leaked, leaked && leaked.texturefile);
    rec("…and mod B really has no such file",
      !fs.existsSync(path.join(MOD_B, "gfx", "interface", "ideas", "upnovaprobe.dds")), "file present in B");

    console.log(`\n=== upload sprite scope and path: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
