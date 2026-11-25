// #defines-scanned-for-txt-but-they-are-lua — A LOOP THAT HAS NEVER READ A SINGLE FILE.
//
// buildingMeta scans each root's common/defines for MAX_SHARED_SLOTS with walkTxtFilesUnder, which collects
// `.txt` only. common/defines contains nothing but `.lua`: vanilla ships 00_defines.lua, 00_graphics.lua and
// 01_career_profile.lua, and zero .txt. So the file list was always empty, the regex never ran, and
// sharedSlotsMax kept its hardcoded 25 for every mod.
//
// ⭐ WHY IT STAYED INVISIBLE: vanilla's own MAX_SHARED_SLOTS *is* 25 (00_defines.lua:754), so against the
// base game the hardcoded default is indistinguishable from a correct read. Every base mod raises it —
// Millennium Dawn 56, Rise of Nations 100, Novum Vexillum 40, Old World Blues 30 — so Nova's shared-slot
// arithmetic was off by more than half on MD and by 4× on Rise of Nations.
//
// This is the shape worth remembering: a default that happens to equal the value it fails to read.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-defines-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "defmod");
fs.mkdirSync(path.join(MOD, "common", "defines"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DefMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "defmod.mod"), 'name="DefMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
// A .lua define, shaped like the real thing — this is the ONLY extension the folder ever contains.
fs.writeFileSync(path.join(MOD, "common", "defines", "zz_nova_defines.lua"),
  "NDefines = {\n\tNBuildings = {\n\t\tMAX_SHARED_SLOTS = 1,\t\t\t\t-- Max slots shared by factories\n\t},\n}\n");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const PORT = 53035;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    // The user-visible consequence is a state's shared-slot CAP, so measure that rather than an internal
    // field — and measure it DIFFERENTIALLY, the same state under two roots, so the test never has to model
    // the slot formula itself.
    const catalog = async (root) => fetch(`http://127.0.0.1:${PORT}/api/buildings/state-catalog?modPath=${encodeURIComponent(root)}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    // ⚠️ MEASURE THE FIELD THE VALUE ACTUALLY FEEDS. `slots.cap` is base + sharedAdded and never consults
    // MAX_SHARED_SLOTS at all, so a differential on cap moved by 0 whether the define was read or not — a
    // check that could not fail in either direction. The value reaches the user as `slots.sharedMax`, which
    // public/app.js:9321 prints as "Global max N", app.js:9325 as "MAX_SHARED_SLOTS N", and app.js:16179
    // uses to refuse a focus with "State X exceeds MAX_SHARED_SLOTS (N)".
    const sharedMaxOf = (j) => {
      const items = (j && (j.items || j.states)) || (Array.isArray(j) ? j : []);
      const seen = new Set();
      for (const it of items) if (it && it.slots && it.slots.sharedMax != null) seen.add(Number(it.slots.sharedMax));
      return [...seen];
    };

    console.log("\n[the defect] a .lua define must reach the number the user is shown");
    {
      const vanilla = sharedMaxOf(await catalog(GAME));
      const mod = sharedMaxOf(await catalog(MOD));
      console.log(`     vanilla sharedMax = ${JSON.stringify(vanilla)} · the fixture mod's = ${JSON.stringify(mod)}`);
      rec("the catalogue reports a shared max at all", vanilla.length === 1 && mod.length === 1, { vanilla, mod });
      rec("vanilla reports 25", vanilla[0] === 25, vanilla);
      // THE BUG: this was 25 too, because the .txt-only walk never opened the .lua.
      rec("the mod's own .lua value is read", mod[0] === 1, mod);
    }

    console.log("\n[⚠️ WHY IT HID] vanilla's own value IS the hardcoded default");
    {
      // Assert the fact the whole story rests on, so a future HOI4 patch that changes it makes this test
      // say so rather than quietly agreeing with a stale default.
      let vanLua = "";
      try { vanLua = fs.readFileSync(path.join(GAME, "common", "defines", "00_defines.lua"), "utf8"); } catch (_) {}
      if (vanLua) {
        const m = /MAX_SHARED_SLOTS\s*=\s*(\d+)/.exec(vanLua);
        console.log(`     vanilla's 00_defines.lua says MAX_SHARED_SLOTS = ${m && m[1]}`);
        rec("vanilla declares 25, which is exactly the hardcoded fallback", m && Number(m[1]) === 25, m && m[1]);
      } else {
        rec("vanilla's defines file is present to check against", false, "00_defines.lua unreadable");
      }
      // …and the base mods do NOT, which is what made this a real defect rather than a tidy-up.
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const found = [];
      try {
        for (const d of fs.readdirSync(WS)) {
          let nm = ""; try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
          let v = null;
          try {
            for (const f of fs.readdirSync(path.join(WS, d, "common", "defines"))) {
              const m = /MAX_SHARED_SLOTS\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(WS, d, "common", "defines", f), "latin1"));
              if (m) v = Number(m[1]);
            }
          } catch (_) {}
          if (v != null) found.push(`${nm.slice(0, 22)}=${v}`);
        }
      } catch (_) {}
      console.log(`     base mods: ${found.join(", ") || "(none installed)"}`);
      if (found.length) rec("…while the base mods raise it, so 25 was wrong for all of them", found.some((f) => !/=25$/.test(f)), found);
      else rec("no base mods installed to compare against", true, "skipped");
    }

    console.log("\n[the folder] contains no .txt at all, which is the whole point");
    {
      let files = [];
      try { files = fs.readdirSync(path.join(GAME, "common", "defines")); } catch (_) {}
      console.log(`     vanilla common/defines: ${files.join(", ") || "(unreadable)"}`);
      if (files.length) {
        rec("every file there is .lua", files.every((f) => /\.lua$/i.test(f)), files);
        rec("…and not one is .txt", !files.some((f) => /\.txt$/i.test(f)), files);
      } else {
        rec("the defines folder is readable", false, "cannot verify the extension claim");
      }
    }

    console.log("\n[CONTROL] the .txt walker still works where files really are .txt");
    {
      // walkTxtFilesUnder was left in place as a thin wrapper, so every other caller — state_category,
      // technology_tags, decisions — keeps its existing behaviour. If this broke, the change was too broad.
      // common/state_category IS .txt, and its local_building_slots feed the same slot maths, so a state
      // with a real base cap proves that path still reads.
      const j = await catalog(GAME);
      const items = (j && (j.items || j.states)) || [];
      const withBase = items.filter((it) => it && it.slots && Number(it.slots.base) > 0);
      console.log(`     states with a base slot count from .txt state_category: ${withBase.length} of ${items.length}`);
      rec("common/state_category is still parsed from .txt", withBase.length > 50, withBase.length);
      rec("…and a category name came through too", items.some((it) => it && String(it.stateCategory || "").length > 0), items.slice(0, 2));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== defines are lua not txt: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
