// #tab-icon-dims — A RESEARCH TAB IS A TWO-FRAME STRIP, NOT A SQUARE ICON.
//
// Ground truth from the install: all 14 of vanilla's gfx/interface/techtree/techtree_*_tab.dds are 182x61
// (armoury is 182x55) and every GFX_*_folder_tab in interface/countrytechtreeview.gfx declares
// noOfFrames = 2 — so the game draws 91x61 per frame, normal and highlighted. Nova's own injected buttonType
// uses frame = 1 and spaces tabs by 89px.
//
// Nova wrote 32x32 with noOfFrames = 1, so a custom tab's art sat in a 91px slot with no pressed state.
//
// THE TWO HALVES MUST MOVE TOGETHER, which is why this landed as its own change: declaring noOfFrames = 2
// over a texture that is not a strip makes the game draw HALF the icon. So the upload composes the frame
// twice, and the sprite writer MEASURES the .dds rather than trusting a constant — tabs created before this
// change carry 32x32 single-frame art and must keep working untouched.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tabfrm-"));
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

const MOD = path.join(ROOT, "tabfrmmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "gfx", "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TabFrmMod"\nsupported_version="1.19.*"\n', "utf8");

const VANILLA_TECHTREE = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
  "gfx", "interface", "techtree");
const ddsDims = (p) => {
  try {
    const b = fs.readFileSync(p);
    if (b.slice(0, 4).toString("latin1") !== "DDS ") return null;
    return { w: b.readUInt32LE(16), h: b.readUInt32LE(12) };
  } catch (_) { return null; }
};

const PORT = 42513;
const app = createApp();
const server = app.listen(PORT, async () => {
  const upload = async (name) => {
    const { Jimp } = require("jimp");
    const png = await new Jimp({ width: 400, height: 400, color: 0x3388ccff }).getBuffer("image/png");
    const fd = new FormData();
    fd.append("modPath", MOD);
    fd.append("type", "tab");
    fd.append("name", name);
    fd.append("image", new Blob([png], { type: "image/png" }), "probe.png");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/upload-gfx`, { method: "POST", body: fd });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  };

  try {
    console.log("\n[ground truth] what vanilla's own tab sprites look like");
    let vfiles = [];
    try { vfiles = fs.readdirSync(VANILLA_TECHTREE).filter((f) => /_tab\.dds$/i.test(f)); } catch (_) {}
    // If the install is missing this test measures nothing — say so rather than passing vacuously.
    rec("vanilla tab textures were readable", vfiles.length >= 5, vfiles.length);
    const vdims = vfiles.map((f) => ddsDims(path.join(VANILLA_TECHTREE, f))).filter(Boolean);
    rec("…and they are wide strips, not squares", vdims.length > 0 && vdims.every((d) => d.w >= d.h * 2),
      vdims.slice(0, 4));

    console.log("\n[the fix] an uploaded tab is composed as a two-frame strip");
    const up = await upload("nova_probe_tab");
    rec("the upload succeeded", up.s === 200 && up.b && !up.b.error, up.b || up.s);
    const dds = path.join(MOD, "gfx", "interface", "nova_probe_tab.dds");
    const d = ddsDims(dds);
    rec("the .dds was written", !!d, dds);
    rec("…at vanilla's tab size", !!d && d.w === 182 && d.h === 61, d);
    rec("…which is two 91-wide frames", !!d && d.w === 91 * 2, d);

    console.log("\n[the frame count follows the TEXTURE, not a constant]");
    const key = await new Promise((resolve) => {
      // ensureResearchTabSprite runs inside create-custom-folder; drive that.
      fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: MOD, folderKey: "nova_probe_folder", ledger: "army",
          tabDdsPath: "gfx/interface/nova_probe_tab.dds" }),
      }).then((r) => r.json()).then(resolve).catch(() => resolve(null));
    });
    void key;
    const gfxFile = path.join(MOD, "interface", "nova_custom_research.gfx");
    const gfx = fs.existsSync(gfxFile) ? fs.readFileSync(gfxFile, "utf8") : "";
    // Asserted, not conditional. An `if (reached) { … } else { pass }` turns "the route did not run" into a
    // green tick, which is how a broken control reads as a working one.
    rec("the sprite writer was reached", /nova_probe_folder_tab/.test(gfx), gfx.slice(0, 400));
    rec("the strip texture is declared with TWO frames", /noOfFrames\s*=\s*2/.test(gfx), gfx.slice(0, 400));

    console.log("\n[control] a NON-strip texture must still declare ONE frame");
    // Tabs Nova created before this change carry 32x32 art. Declaring 2 over one of those would draw a
    // 16x32 half-icon, so the measurement — not a constant — is what keeps them working.
    const squareDds = path.join(MOD, "gfx", "interface", "nova_legacy_tab.dds");
    // Minimal 32x32 DDS header: magic + size + flags + height + width.
    const hdr = Buffer.alloc(128);
    hdr.write("DDS ", 0, "latin1");
    hdr.writeUInt32LE(124, 4);
    hdr.writeUInt32LE(32, 12); // height
    hdr.writeUInt32LE(32, 16); // width
    fs.writeFileSync(squareDds, Buffer.concat([hdr, Buffer.alloc(32 * 32 * 4)]));
    await fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, folderKey: "nova_legacy_folder", ledger: "army",
        tabDdsPath: "gfx/interface/nova_legacy_tab.dds" }),
    }).then((r) => r.json()).catch(() => null);
    const gfx2 = fs.existsSync(gfxFile) ? fs.readFileSync(gfxFile, "utf8") : "";
    const legacyBlock = /spriteType\s*=\s*\{[^}]*nova_legacy_folder_tab[^}]*\}/.exec(gfx2) ||
      /nova_legacy_folder_tab[\s\S]{0,200}/.exec(gfx2);
    rec("the legacy sprite was written", !!legacyBlock, gfx2.slice(0, 300));
    rec("a 32x32 texture keeps noOfFrames = 1",
      !!legacyBlock && /noOfFrames\s*=\s*1/.test(legacyBlock[0]), legacyBlock && legacyBlock[0]);

    console.log(`\n=== research tab two frames: ${checks} checks, ${fails.length} failed ===`);
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
