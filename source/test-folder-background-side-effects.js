// #folder-bg-silent-side-effects — uploading a research-tree background must not report plain success when
// the result is not what the caller asked for.
//
// Two cases, both answered {ok:true} with nothing else:
//
//  (a) Several vanilla folders SHARE one background sprite — naval_folder, mtgnavalfolder and
//      mtgnavalsupportfolder are all GFX_naval_techtree_bg, and the same holds for the two armour folders and
//      the two air ones. Overriding it for one tab repoints all of them. The route's own comment says
//      "Per folder."
//  (b) A Nova-created custom folder's container has no techtree_bg element at all, so the sprite written here
//      is referenced by no gui element and the game never draws it — while Nova's editor showed it anyway,
//      because the client sets guiLayout[folder].bgSprite from the returned name.
//
// The write still happens: the bytes are valid and the user may be about to add the element by hand. What
// changed is that the response no longer implies an effect that is not there.
//
// Hermetic: fake mod under tmpdir with its own gui.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-folderbg-"));
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

const MOD = path.join(ROOT, "bgmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BgMod"\nsupported_version="1.18.*"\n', "utf8");

// Two folders sharing one sprite, and one custom folder with no background element — the exact shapes.
fs.writeFileSync(path.join(MOD, "interface", "countrytechtreeview.gui"), [
  "guiTypes = {",
  // The real gui puts `name` on its own line inside the container; the layout parser expects that shape.
  "\tcontainerWindowType = {",
  '\t\tname = "nua_shared_a_folder"',
  "\t\ticonType = {",
  '\t\t\tname = "bg"',
  '\t\t\tspriteType = "GFX_nua_shared_techtree_bg"',
  "\t\t\tposition = { x = 0 y = 0 }",
  "\t\t}",
  "\t}",
  "\tcontainerWindowType = {",
  '\t\tname = "nua_shared_b_folder"',
  "\t\ticonType = {",
  '\t\t\tname = "bg"',
  '\t\t\tspriteType = "GFX_nua_shared_techtree_bg"',
  "\t\t\tposition = { x = 0 y = 0 }",
  "\t\t}",
  "\t}",
  "\tcontainerWindowType = {",
  '\t\tname = "nua_custom_folder"',
  "\t\tbackground = {",
  '\t\t\tname = "Background"',
  '\t\t\tquadTextureSprite = "GFX_tiled_window_2b_border"',
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

function makePng() {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(ty, "ascii"), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(4, 0); ih.writeUInt32BE(4, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(16, 200)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PORT = 42209;
const app = createApp();
const server = app.listen(PORT, async () => {
  const upload = async (folder, spriteKey) => {
    const fd = new FormData();
    fd.append("image", new Blob([makePng()], { type: "image/png" }), "bg.png");
    fd.append("modPath", MOD);
    fd.append("folder", folder);
    if (spriteKey) fd.append("spriteKey", spriteKey);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/research/set-folder-background`, { method: "POST", body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[shared sprite] the other tabs it repoints must be named");
    const shared = await upload("nua_shared_b_folder", "GFX_nua_shared_techtree_bg");
    rec("the upload succeeded", shared.status === 200 && shared.body && shared.body.ok !== false,
      shared.body || shared.status);
    rec("the sprite IS referenced by the gui", shared.body && shared.body.referencedByGui === true, shared.body);
    rec("…and the other folder sharing it is named",
      (shared.body && shared.body.alsoAffects || []).includes("nua_shared_a_folder"), shared.body && shared.body.alsoAffects);
    rec("…with a warning that says so", /also the background of/i.test(String((shared.body && shared.body.sharedWarning) || "")),
      shared.body && shared.body.sharedWarning);

    console.log("\n[unreferenced sprite] a custom folder with no background element");
    const custom = await upload("nua_custom_folder");
    rec("the upload succeeded", custom.status === 200 && custom.body && custom.body.ok !== false,
      custom.body || custom.status);
    rec("it reports the sprite is NOT referenced", custom.body && custom.body.referencedByGui === false, custom.body);
    rec("…and explains the game will not draw it",
      /will not draw it/i.test(String((custom.body && custom.body.warning) || "")), custom.body && custom.body.warning);
    rec("…and says how to fix it", /iconType/.test(String((custom.body && custom.body.warning) || "")),
      custom.body && custom.body.warning);
    rec("no other folder is falsely blamed", (custom.body && custom.body.alsoAffects || []).length === 0,
      custom.body && custom.body.alsoAffects);

    console.log("\n[the write still happens]");
    const dds = path.join(MOD, "gfx", "interface", "nova_research_bg");
    rec("the image was still written", fs.existsSync(dds) && fs.readdirSync(dds).length > 0,
      fs.existsSync(dds) ? fs.readdirSync(dds) : "(no dir)");

    console.log(`\n=== folder background side effects: ${checks} checks, ${fails.length} failed ===`);
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
