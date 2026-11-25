// #rename-writes-a-duplicate — renaming a state, strategic region or supply area added a SECOND definition
// of the name key instead of editing the one the mod already had.
//
// All three rename paths wrote unconditionally into a managed nova_*_names_l_english.yml, without checking
// whether the mod already defines that key. Millennium Dawn ships state_names_l_english.yml,
// strategic_region_names_l_english.yml and supply_area_names_l_english.yml — 1221, 220 and 200-odd keys — so
// renaming anything in MD produced a mod carrying the key twice.
//
// What that does in game is NOT "the old name deterministically wins": the wiki says the winner between two
// files "does not seem to have a consistent pattern, but seems to prioritise base game files", and the
// documented way to force an override is a replace/ folder, not a filename prefix. So the result is
// undefined, and the mod ships a duplicate key the wiki says to avoid.
//
// What IS deterministic is Nova's own resolver: getLocalizationMap merges files in sorted order with
// last-wins, so after a reload the Map page showed the OLD name — the save reported success, the UI showed
// the new name optimistically, and then it reverted.
//
// The cross-file duplicate is also invisible to mod-index's loc_duplicate_key rule, which only counts
// duplicates WITHIN one file.
//
// Fixed the way /api/research/set-label-text already did it: edit the key in place in every mod-owned
// english file that defines it, and fall back to the nova_ file only when the key is inherited or new.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-renameplace-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const modIndex = require("./mod-index.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const ENG = path.join(MOD, "localisation", "english");
fs.mkdirSync(ENG, { recursive: true });
fs.mkdirSync(path.join(MOD, "map"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RP"\nsupported_version="1.18.*"\n');

// The mod ships its own names files, exactly as Millennium Dawn does.
fs.writeFileSync(path.join(ENG, "state_names_l_english.yml"),
  "﻿l_english:\n STATE_1:0 \"Old State Name\"\n", "utf8");
fs.writeFileSync(path.join(ENG, "strategic_region_names_l_english.yml"),
  "﻿l_english:\n STRATEGICREGION_1:0 \"Old Region Name\"\n", "utf8");
fs.writeFileSync(path.join(ENG, "supply_area_names_l_english.yml"),
  "﻿l_english:\n SUPPLYAREA_1:0 \"Old Supply Area Name\"\n", "utf8");

// every definition in the mod's English localisation, replace/ included (#a-name-nova-writes-must-win: Nova's own names live there)
const countKey = (key) => {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(path.join(d, e.name)); continue; }
      if (!/\.yml$/i.test(e.name)) continue;
      n += (fs.readFileSync(path.join(d, e.name), "utf8").match(new RegExp(`^\\s*${key}:\\d*\\s*"`, "gm")) || []).length;
    }
  };
  walk(ENG);
  return n;
};

const PORT = 39939, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    ok("precondition: each key is defined exactly once, in the mod's own names file",
      countKey("STATE_1") === 1 && countKey("STRATEGICREGION_1") === 1 && countKey("SUPPLYAREA_1") === 1);

    const rgn = await post("/api/map/set-region-name", { modPath: MOD, nameKey: "STRATEGICREGION_1", name: "New Region Name" });
    ok("renaming a strategic region succeeds", rgn.s === 200 && rgn.b && rgn.b.ok, rgn.b);
    ok("…the key is still defined exactly ONCE (no duplicate added)", countKey("STRATEGICREGION_1") === 1,
      fs.readdirSync(ENG));
    ok("…the mod's own file now holds the new name",
      /New Region Name/.test(fs.readFileSync(path.join(ENG, "strategic_region_names_l_english.yml"), "utf8")),
      fs.readFileSync(path.join(ENG, "strategic_region_names_l_english.yml"), "utf8"));
    ok("…and no nova_region_names file was created for it",
      !fs.existsSync(path.join(ENG, "replace", "nova_region_names_l_english.yml")), fs.readdirSync(ENG));

    const sup = await post("/api/map/set-supplyarea-name", { modPath: MOD, nameKey: "SUPPLYAREA_1", name: "New Supply Name" });
    ok("renaming a supply area succeeds", sup.s === 200 && sup.b && sup.b.ok, sup.b);
    ok("…still exactly one definition", countKey("SUPPLYAREA_1") === 1, fs.readdirSync(ENG));
    ok("…with the new value in the mod's own file",
      /New Supply Name/.test(fs.readFileSync(path.join(ENG, "supply_area_names_l_english.yml"), "utf8")));

    // The contract that actually matters: what Nova (and the game) resolve is the NEW name.
    const names = modIndex.scanLocalization(MOD);
    ok("the name Nova resolves for the region is the new one", names.STRATEGICREGION_1 === "New Region Name", names.STRATEGICREGION_1);
    ok("…and for the supply area", names.SUPPLYAREA_1 === "New Supply Name", names.SUPPLYAREA_1);

    // ── a key the mod does NOT own still gets a mod-side file, or an inherited name could never be changed ──
    const fresh = await post("/api/map/set-region-name", { modPath: MOD, nameKey: "STRATEGICREGION_99", name: "Brand New" });
    ok("renaming a key the mod does not define still succeeds", fresh.s === 200 && fresh.b && fresh.b.ok, fresh.b);
    ok("…and it lands in the managed nova_ file", fs.existsSync(path.join(ENG, "replace", "nova_region_names_l_english.yml"))
      && /Brand New/.test(fs.readFileSync(path.join(ENG, "replace", "nova_region_names_l_english.yml"), "utf8")), fs.readdirSync(ENG));
    ok("…exactly once", countKey("STRATEGICREGION_99") === 1, fs.readdirSync(ENG));

    // ── renaming twice must not start duplicating either ────────────────────────────────────────────
    await post("/api/map/set-region-name", { modPath: MOD, nameKey: "STRATEGICREGION_1", name: "Third Name" });
    ok("a second rename still leaves exactly one definition", countKey("STRATEGICREGION_1") === 1, fs.readdirSync(ENG));
    ok("…with the latest value", modIndex.scanLocalization(MOD).STRATEGICREGION_1 === "Third Name",
      modIndex.scanLocalization(MOD).STRATEGICREGION_1);

    console.log("\ntest-map-rename-in-place: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
