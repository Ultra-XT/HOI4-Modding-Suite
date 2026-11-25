// #bg-warnings-never-shown — SETTING ONE RESEARCH TAB'S BACKGROUND SILENTLY CHANGED OTHERS.
//
// A research folder's background is a SPRITE, and several folders can reference the same one. Vanilla's
// GFX_air_techtree_bg is the background of BOTH air_techs_folder and bba_air_techs_folder; Millennium Dawn
// shares industry's across civilian_folder too. So writing a new image for one tab rewrites it for every tab
// that shares the sprite.
//
// The server already worked this out and returned it — `alsoAffects` plus a written-out `sharedWarning` —
// and separately a `warning` for the case where nothing in the .gui references the sprite at all, so the
// game will never draw it (which is exactly what happens for a folder Nova created, since those get no
// background element). The client read only `error`. Both messages went in the bin, and the editor then
// switched the new background on in its own preview — so the user was shown a result that either affected
// more tabs than they meant, or would not appear in game at all.
//
// A guard whose caller never surfaces it is a dead guard. This pins that the server still computes them and
// that the client still reads them.
//
// NOT a bug, checked in the same pass: the sprite NAME. Nova falls back to `GFX_<folder>_techtree_bg` when
// the caller sends no spriteKey, and that name matches 0 of the 19 folders in the two corpora that have a
// background element — vanilla's electronics_folder wants GFX_engineering_techtree_bg, MD's bomber_folder
// wants GFX_bombertechtree_bg. It looked like backgrounds could never apply. They do: /api/research/gui-layout
// reads the real sprite name out of the .gui and the client sends it as spriteKey, so the fallback is only
// ever reached by a caller that skipped it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bgw-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

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
  const p = path.join(__dirname, `.ctl-bgw-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}

let PORT = 44440;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      port: PORT,
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
async function upload(port, mod, folder, spriteKey, png) {
  const fd = new FormData();
  fd.append("folder", folder);
  fd.append("modPath", mod);
  if (spriteKey) fd.append("spriteKey", spriteKey);
  fd.append("image", new Blob([png], { type: "image/png" }), "bg.png");
  const r = await fetch(`http://127.0.0.1:${port}/api/research/set-folder-background`, { method: "POST", body: fd });
  return { s: r.status, b: await r.json().catch(() => ({})) };
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(path.join(GAME, "interface", "countrytechtreeview.gui"))) {
      console.log("\n  (skipped — vanilla not installed)");
      console.log(`\n=== research bg warnings: ${checks} checks, 0 failed ===`);
      return;
    }
    let sharp;
    try { sharp = require("sharp"); } catch (_) {
      console.log("\n  (skipped — sharp unavailable, cannot build a test image)");
      console.log(`\n=== research bg warnings: ${checks} checks, 0 failed ===`);
      return;
    }
    const png = await sharp({ create: { width: 256, height: 128, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();

    console.log("\n[ground truth] vanilla really does share one background across two tabs");
    const gui = fs.readFileSync(path.join(GAME, "interface", "countrytechtreeview.gui"), "utf8");
    rec("GFX_air_techtree_bg appears more than once in the gui",
      (gui.match(/GFX_air_techtree_bg/g) || []).length >= 2, (gui.match(/GFX_air_techtree_bg/g) || []).length);

    api = await serve(createApp());
    const mod = mkMod("m");

    console.log("\n[the bug] a shared sprite must be reported, not silently applied to both");
    const shared = await upload(api.port, mod, "air_techs_folder", "GFX_air_techtree_bg", png);
    rec("the upload succeeds", shared.s === 200 && shared.b.ok, shared.b);
    rec("…the sprite written is the one the gui references",
      shared.b.sprite === "GFX_air_techtree_bg", shared.b.sprite);
    rec("…the gui does reference it, so the game will draw it", shared.b.referencedByGui === true, shared.b);
    rec("…and the other tab it affects is named", (shared.b.alsoAffects || []).includes("bba_air_techs_folder"), shared.b.alsoAffects);
    rec("…in a message written for a human", /also the background of/.test(String(shared.b.sharedWarning || "")), shared.b.sharedWarning);

    console.log("\n[the other half] a sprite nothing references must say so");
    const c = await api.post("/api/research/create-custom-folder", { modPath: mod, folderKey: "nova_bgw_folder", name: "Nova BGW" });
    rec("a custom folder is created", c.s === 200 && c.b.ok, c.b);
    const orphan = await upload(api.port, mod, "nova_bgw_folder", "", png);
    rec("the upload still succeeds", orphan.s === 200 && orphan.b.ok, orphan.b);
    rec("…but reports that nothing references the sprite", orphan.b.referencedByGui === false, orphan.b);
    rec("…and says the game will not draw it", /will not draw it/.test(String(orphan.b.warning || "")), orphan.b.warning);

    console.log("\n[the client must actually show them]");
    const clientSrc = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
    rec("research.js reads sharedWarning", /r\.sharedWarning/.test(clientSrc), "not read");
    rec("research.js reads warning", /r\.warning/.test(clientSrc), "not read");
    rec("…and surfaces them to the user", /nbAlert\(bgNotes\.join/.test(clientSrc), "collected but never shown");
    api.stop(); api = null;

    console.log("\n[back-out] stop computing the shared-sprite warning");
    {
      const built = controlApp("noshared", [[
        "        ...(alsoAffects.length ? {",
        "        ...(false ? {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const r = await upload(capi.port, cmod, "air_techs_folder", "GFX_air_techtree_bg", png);
          rec("…and the second tab is changed with nothing said about it",
            r.s === 200 && r.b.ok && !r.b.sharedWarning, r.b);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== research bg warnings: ${checks} checks, ${fails.length} failed ===`);
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
