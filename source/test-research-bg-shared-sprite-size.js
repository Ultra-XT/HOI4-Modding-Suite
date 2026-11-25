// #shared-bg-sized-to-one-folder — A TAB'S BACKGROUND DID NOT FILL THE TAB.
//
// Reported from play: the air, navy and naval-support backgrounds do not fill their tab.
//
// A tech-tree background SPRITE belongs to several folders, not one. Vanilla ships SEVEN of them for its
// folders: GFX_air_techtree_bg is drawn by air_techs_folder AND bba_air_techs_folder, GFX_naval_techtree_bg
// by three naval folders, and in Millennium Dawn GFX_engineering_techtree_bg by four.
//
// Nova sized an uploaded image to the container box of the folder it was uploaded FROM. Measured on vanilla,
// air_techs_folder wants 2500x1300 and bba_air_techs_folder 2240x1300 — so uploading from one leaves the
// other 260px short of full. HOI4 draws a sprite at its native .dds size with no runtime stretch, so a
// too-small image simply shows bare tab around it.
//
// The fix takes the LARGEST box among every folder that draws the sprite. Oversizing is safe (the container
// clips the overhang); undersizing is the bug. The ceiling also moved 2560 → 4096, because Millennium Dawn's
// artillery_folder authors a 2739-wide content layer that the old clamp cut 179px short — the same failure
// reached from the other direction.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bgsize-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-bgsize-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// A .dds written by generateUncompressedDDS: width at byte 16, height at byte 12 (DDS header is
// magic(4) + size + flags + height + width …).
function ddsSize(file) {
  const b = fs.readFileSync(file);
  return { h: b.readUInt32LE(12), w: b.readUInt32LE(16) };
}
// A real PNG to upload — built with the same library the server reads it back with, so the test cannot
// fail on a hand-rolled byte string rather than on the thing it is measuring. Content is irrelevant; only
// the resize matters.
let _png = null;
async function pngBytes() {
  if (_png) return _png;
  const { Jimp } = require("jimp");
  _png = await new Jimp({ width: 8, height: 8, color: 0xffffffff }).getBuffer("image/png");
  return _png;
}

let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "interface"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="m${seq}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}
let PORT = 45500;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      upload: async (mod, folder, sprite) => {
        const fd = new FormData();
        fd.append("image", new Blob([await pngBytes()], { type: "image/png" }), "bg.png");
        fd.append("modPath", mod);
        fd.append("folder", folder);
        if (sprite) fd.append("spriteKey", sprite);
        const r = await fetch(`http://127.0.0.1:${PORT}/api/research/set-folder-background`, { method: "POST", body: fd });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      },
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const ddsOf = (mod, folder) => path.join(mod, "gfx", "interface", "nova_research_bg", `${folder}.dds`);

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] the game shares one background sprite across several tabs");
    const guiPath = path.join(V, "interface", "countrytechtreeview.gui");
    const haveGame = fs.existsSync(guiPath);
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    let airBig = 0;
    if (haveGame) {
      const gui = fs.readFileSync(guiPath, "utf8");
      const sprites = [...gui.matchAll(/"(GFX_[A-Za-z0-9_]*techtree_bg)"/g)].map((m) => m[1]);
      rec("vanilla declares only a handful of tech-tree background sprites",
        new Set(sprites).size >= 5 && new Set(sprites).size <= 10, [...new Set(sprites)]);
      // the two air folders and their authored content-layer widths
      const widthOf = (key) => {
        const i = gui.indexOf(`name = "${key}"`);
        if (i === -1) return 0;
        let d = 0, end = gui.length;
        for (let k = gui.lastIndexOf("{", i); k < gui.length; k++) {
          if (gui[k] === "{") d++;
          else if (gui[k] === "}") { d--; if (!d) { end = k; break; } }
        }
        const inner = gui.slice(i, end);
        let best = 0;
        for (const m of inner.matchAll(/\bsize\s*=\s*\{[^{}]*?\bwidth\s*=\s*(\d+)(?![\d%])[^{}]*?\bheight\s*=\s*(\d+)(?![\d%])/gi)) {
          const w = +m[1], h = +m[2];
          if (w >= 1000 && h >= 700 && w > best) best = w;
        }
        return best;
      };
      const a1 = widthOf("air_techs_folder"), a2 = widthOf("bba_air_techs_folder");
      airBig = Math.max(a1, a2);
      rec("the two air folders authored DIFFERENT content widths", a1 > 0 && a2 > 0 && a1 !== a2, { air_techs_folder: a1, bba_air_techs_folder: a2 });
      rec("…and both draw the same sprite",
        /air_techs_folder[\s\S]{0,4000}?GFX_air_techtree_bg/.test(gui), "could not confirm from the gui");
    }

    api = await serve(createApp());

    console.log("\n[the bug] uploading from the SMALLER air tab must still fill the bigger one");
    if (haveGame) {
      const mod = mkMod();
      const r = await api.upload(mod, "bba_air_techs_folder", "GFX_air_techtree_bg");
      rec("the upload succeeds", r.s === 200 && r.b.ok !== false, r.b);
      const f = ddsOf(mod, "bba_air_techs_folder");
      rec("…and wrote a .dds", fs.existsSync(f), f);
      if (fs.existsSync(f)) {
        const sz = ddsSize(f);
        rec(`…sized to the LARGEST folder sharing the sprite (${airBig}px), not its own`,
          sz.w === airBig, { got: `${sz.w}x${sz.h}`, expected_width: airBig });
      }
    }

    console.log("\n[no over-reach] a folder that shares its sprite with nobody is unchanged");
    if (haveGame) {
      const mod = mkMod();
      const r = await api.upload(mod, "infantry_folder", "GFX_infantry_techtree_bg");
      rec("the upload succeeds", r.s === 200 && r.b.ok !== false, r.b);
      const f = ddsOf(mod, "infantry_folder");
      if (fs.existsSync(f)) {
        const sz = ddsSize(f);
        // vanilla's infantry content layer is 1400x1275 and no other folder draws that sprite
        rec("…still sized to its own authored box", sz.w === 1400 && sz.h === 1275, `${sz.w}x${sz.h}`);
      } else rec("…wrote a .dds", false, f);
    }

    console.log("\n[the ceiling] a folder wider than the old clamp is no longer cut short");
    {
      const mod = mkMod();
      // A gui whose folder authors a content layer wider than the old 2560 limit.
      fs.writeFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), [
        "guiTypes = {", "\tcontainerWindowType = {", '\t\tname = "countrytechtreeview"',
        "\t\tcontainerWindowType = {", '\t\t\tname = "wide_folder"',
        "\t\t\tbackground = { name = \"Background\" quadTextureSprite = \"GFX_wide_techtree_bg\" }",
        "\t\t\tcontainerWindowType = {", '\t\t\t\tname = "techtree_stripes"',
        "\t\t\t\tsize = { width = 2739 height = 1390 }", "\t\t\t}", "\t\t}", "\t}", "}", ""].join("\n"), "utf8");
      const r = await api.upload(mod, "wide_folder", "GFX_wide_techtree_bg");
      rec("the upload succeeds", r.s === 200 && r.b.ok !== false, r.b);
      const f = ddsOf(mod, "wide_folder");
      if (fs.existsSync(f)) {
        const sz = ddsSize(f);
        rec("…and the full 2739px width survives the clamp", sz.w === 2739, `${sz.w}x${sz.h}`);
      } else rec("…wrote a .dds", false, f);
    }
    api.stop(); api = null;

    console.log("\n[back-out] size to the uploading folder's own box again");
    if (haveGame) {
      const built = controlApp("ownbox", [[
        "          const b = folderBgTargetBox(gt, folderClean);",
        "          const b = findFolderBgContainerBox(gt, folderClean);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod();
        try {
          await capi.upload(cmod, "bba_air_techs_folder", "GFX_air_techtree_bg");
          const f = ddsOf(cmod, "bba_air_techs_folder");
          const sz = fs.existsSync(f) ? ddsSize(f) : { w: 0, h: 0 };
          rec("…and the other air tab is left short of full again",
            sz.w > 0 && sz.w < airBig, { got: sz.w, needed: airBig });
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== research bg shared sprite size: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
