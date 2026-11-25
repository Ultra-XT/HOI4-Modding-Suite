// Two gfx findings recorded 2026-08-02, still real on re-verification.
//
// #sprite-name-prefix-match — importing a focus icon wrote NO spriteType when another focus id was a strict
// PREFIX of this one. The presence check was `\bname\s*=\s*"?NAME"?`, and `_` is a word character, so `\b`
// never fires between `GFX_nova_alpha` and `GFX_nova_alpha_extra`; the optional closing quote then lets the
// match stop early inside the longer name. So the import copied the .dds, answered ok, and the tree drew
// nothing. Order-dependent and therefore baffling in use: short-then-long worked, long-then-short did not.
// Millennium Dawn has 509 strict-prefix pairs among its 21,409 focus ids. The `(?![A-Za-z0-9_])` guard was
// already written elsewhere in the file for the same shape and had simply never been adopted here.
//
// #vanilla-folder-redefined — a mod entry in technology_folders REPLACES the base game's whole definition
// for that key. Changing a base-game research tab's ICON, which needs no folder definition at all, wrote
// `mtgnavalfolder = { ledger = army }` into the mod: ledger navy became army and
// `available = { has_dlc = "Man the Guns" }` was dropped. An override now copies the real block and changes
// only what was asked for.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sprfx-"));
process.env.HOI4_MODS_ROOT = ROOT;
const srv = require("./server.js");
const { createApp } = srv;

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

const MOD = path.join(ROOT, "sprfxmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SprfxMod"\nsupported_version="1.19.*"\n', "utf8");

const GFX = path.join(MOD, "interface", "focus_editor_generated.gfx");
const folderFile = path.join(MOD, "common", "technology_tags", "zz_nova_custom_folders.txt");
const readGfx = () => { try { return fs.readFileSync(GFX, "utf8"); } catch (_) { return ""; } };
const readFolders = () => { try { return fs.readFileSync(folderFile, "utf8"); } catch (_) { return ""; } };
const spriteNames = () => (readGfx().match(/name\s*=\s*"([^"]+)"/g) || []).map((s) => s.replace(/.*"([^"]+)".*/, "$1"));

const PORT = 42507;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[sprite prefix] the LONG id first, then its strict PREFIX — the order that failed");
    // Driven through the REAL endpoint (/api/gfx/import-dds), which is the path a user takes. It writes into
    // the ACTIVE root, so point that at the probe mod first.
    if (typeof srv.setActiveRoot === "function") srv.setActiveRoot(MOD);
    const src = path.join(ROOT, "source_icon.dds");
    fs.writeFileSync(src, Buffer.alloc(128));

    const importDds = (focusId) => post("/api/gfx/import-dds", { modPath: MOD, sourcePath: src, focusId });

    // ORDER MATTERS and is the whole bug: long id first, then its strict prefix.
    let i1 = await importDds("nova_alpha_extra");
    rec("the long focus id imported", i1.s === 200 && i1.b && !i1.b.error, i1.b || i1.s);
    let i2 = await importDds("nova_alpha");
    rec("the prefix focus id imported", i2.s === 200 && i2.b && !i2.b.error, i2.b || i2.s);

    const names = spriteNames();
    rec("the long id got its sprite", names.includes("GFX_nova_alpha_extra"), names);
    // THE BUG: this was absent, because the presence check matched inside the longer name — the import
    // reported success and copied the .dds, but the tree drew nothing.
    rec("the PREFIX id also got its sprite", names.includes("GFX_nova_alpha"), names);
    rec("…and both shine variants exist",
      names.includes("GFX_nova_alpha_shine") && names.includes("GFX_nova_alpha_extra_shine"), names);

    // CONTROL: re-importing a name already registered must not duplicate it.
    const before = spriteNames().length;
    await importDds("nova_alpha");
    rec("re-importing the same id adds no duplicate sprite", spriteNames().length === before,
      { before, after: spriteNames().length });

    console.log("\n[vanilla folder] changing a base-game tab must not truncate its definition");
    // mtgnavalfolder is vanilla's, with ledger = navy and a Man the Guns gate.
    let r = await post("/api/research/create-custom-folder", { modPath: MOD, folderKey: "mtgnavalfolder", ledger: "army" });
    rec("the request was accepted", r.s === 200, r.b || r.s);
    const folders = readFolders();
    if (folders) {
      // If Nova writes a definition at all, it must be the REAL one, not a two-line stub.
      rec("the DLC gate vanilla declares was carried over", /has_dlc/.test(folders), folders.slice(0, 400));
      rec("…and the block is not a bare ledger stub",
        !/mtgnavalfolder\s*=\s*\{\s*ledger\s*=\s*army\s*\}/.test(folders), folders.slice(0, 400));
      rec("the file is brace-balanced",
        (folders.match(/\{/g) || []).length === (folders.match(/\}/g) || []).length,
        { open: (folders.match(/\{/g) || []).length, close: (folders.match(/\}/g) || []).length });
    } else {
      // Writing nothing at all is also a correct answer — an icon change needs no folder definition.
      rec("no folder definition was written for a base-game key (also correct)", true);
    }

    console.log("\n[control] a genuinely NEW folder key is still created normally");
    r = await post("/api/research/create-custom-folder", { modPath: MOD, folderKey: "nova_probe_folder", ledger: "navy" });
    rec("the new folder was accepted", r.s === 200, r.b || r.s);
    const f2 = readFolders();
    rec("…and written with the ledger asked for", /nova_probe_folder\s*=\s*\{[\s\S]*?ledger\s*=\s*navy/.test(f2), f2.slice(0, 500));
    rec("…and did not pick up a has_dlc gate from anywhere",
      !/nova_probe_folder\s*=\s*\{[\s\S]*?has_dlc[\s\S]*?\}/.test(f2), f2.slice(0, 500));

    console.log(`\n=== sprite prefix and vanilla folder: ${checks} checks, ${fails.length} failed ===`);
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
