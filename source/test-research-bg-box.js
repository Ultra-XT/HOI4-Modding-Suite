// Research folder-background upload (/api/research/set-folder-background): a modder's uploaded background must
// FILL the tab, not render as an icon-sized corner sprite. Locks the two fixes:
//   - the .dds is sized to the folder's CONTENT-LAYER box (the LARGEST plausible size, not the FIRST size —
//     which for MD's aircraft folder was a 400x1000 sub-box); when the gui declares no content-layer size,
//     fall back to a large default (1920x1200), never a tiny one;
//   - the folder's bg iconType is reset to position {0,0} scale 1 (a fresh folder's vanilla bg can sit at
//     scale 0.1 / an offset, which renders the new art as a tiny corner — the "shrunk to icon size" bug).
// Run: node test-research-bg-box.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Jimp } = require("jimp");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const ddsDims = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32LE(16), h: b.readUInt32LE(12) }; };

// A folder whose content layer (2200x1000) is preceded by a small sub-box (400x1000), plus a bg iconType at
// the vanilla-style tiny scale. And a second folder with NO large size (only sub-boxes) → default fallback.
const GUI = `guiTypes = {
\tcontainerWindowType = {
\t\tname = "countrytechtreeview"
\t\tcontainerWindowType = {
\t\t\tname = "big_folder"
\t\t\tsize = { width = 100%% height = 100%% }
\t\t\tcontainerWindowType = { name = "sb" size = { width = 400 height = 1000 } }
\t\t\tcontainerWindowType = {
\t\t\t\tname = "big_stripes"
\t\t\t\tsize = { width = 2200 height = 1000 }
\t\t\t\ticonType = {
\t\t\t\t\tname = "big_folder_techtree_bg"
\t\t\t\t\tspriteType = "GFX_big_folder_techtree_bg"
\t\t\t\t\tscale = 0.1
\t\t\t\t\tposition = { x=155 y=210 }
\t\t\t\t}
\t\t\t}
\t\t}
\t\tcontainerWindowType = {
\t\t\tname = "small_folder"
\t\t\tsize = { width = 100%% height = 100%% }
\t\t\tcontainerWindowType = { name = "sb2" size = { width = 400 height = 1000 } }
\t\t\ticonType = {
\t\t\t\tname = "small_folder_techtree_bg"
\t\t\t\tspriteType = "GFX_small_folder_techtree_bg"
\t\t\t\tposition = { x=0 y=0 }
\t\t\t}
\t\t}
\t}
}
`;

async function upload(BASE, mod, folder, pngPath) {
  const fd = new FormData();
  fd.append("image", new Blob([fs.readFileSync(pngPath)], { type: "image/png" }), "bg.png");
  fd.append("modPath", mod);
  fd.append("folder", folder);
  const r = await fetch(`${BASE}/api/research/set-folder-background`, { method: "POST", body: fd });
  return r.json();
}

(async () => {
  console.log("=== RESEARCH folder-background box + scale-reset ===");
  const PORT = 3922, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bgbox-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova BG Box E2E"\n');
  fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
  fs.writeFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), GUI);
  const bigPng = path.join(mod, "src.png");
  await (await new Jimp({ width: 1500, height: 1200, color: 0x3366ccff })).write(bigPng);

  const readGuiBgScale = (folder) => {
    const gt = fs.readFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), "utf8");
    const i = gt.indexOf(`GFX_${folder}_techtree_bg`);
    const seg = gt.slice(i, i + 200);
    const sc = /\bscale\s*=\s*([\d.]+)/.exec(seg);
    const pos = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s*y\s*=\s*(-?\d+)/i.exec(seg);
    return { scale: sc ? +sc[1] : 1, x: pos ? +pos[1] : null, y: pos ? +pos[2] : null };
  };

  try {
    // 1. big_folder: content layer 2200x1000 wins over the 400x1000 sub-box.
    const a = await upload(BASE, mod, "big_folder", bigPng);
    ok("big_folder upload ok", a && a.ok === true, a);
    const ddsA = ddsDims(path.join(mod, "gfx", "interface", "nova_research_bg", "big_folder.dds"));
    ok("big_folder .dds sized to the CONTENT layer (2200x1000), not the 400 sub-box", ddsA.w === 2200 && ddsA.h === 1000, ddsA);
    const gA = readGuiBgScale("big_folder");
    ok("big_folder bg icon reset to scale 1 (scale attr removed)", gA.scale === 1, gA);
    ok("big_folder bg icon reset to position {0,0}", gA.x === 0 && gA.y === 0, gA);

    // 2. small_folder: no content-layer size → large DEFAULT (1920x1200), never the 400 sub-box.
    const b = await upload(BASE, mod, "small_folder", bigPng);
    ok("small_folder upload ok", b && b.ok === true, b);
    const ddsB = ddsDims(path.join(mod, "gfx", "interface", "nova_research_bg", "small_folder.dds"));
    ok("small_folder .dds falls back to the large default (1920x1200), not 400x1000", ddsB.w === 1920 && ddsB.h === 1200, ddsB);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nRESEARCH-BG-BOX: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
