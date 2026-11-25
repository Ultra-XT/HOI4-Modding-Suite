// #unnamed-designer-content / #family-tiers-unlocalised / #new-trait-has-no-name
//
// THREE MAKERS CREATED CONTENT AND GAVE IT NO NAME, so the game — and Nova's own readers — showed the raw
// token. Reproduced by hand before anything was changed, with a positive control in the same mod:
//
//   POST /api/equipment/family  {id:"lens_rifle", name:"Lens Rifle", tierCount:3, …}   (body copied
//        field-for-field from public/army.js createFamily, which sends `tierCount` and NEVER a `tiers` array)
//     → localisation held ONLY `lens_rifle:0 "Lens Rifle"`, the archetype, which carries `is_buildable = no`.
//       /api/equipment/list answered name:null for lens_rifle_0/_1/_2 — the three entries the player actually
//       researches and puts in the production queue. The endpoint's tier-naming loop reads `t.name`, which is
//       "" for every tier the only client can produce, so it fired zero times.
//   POST /api/equipment/module  {id:"lens_mod_x", …}   (public/army.js module editor — no name field exists)
//   POST /api/equipment/upgrade {id:"lens_upg_x", …}   (public/army.js upgSave — no name field exists)
//     → no loc at all. A module/upgrade block has NO name field either, so the loc key is the only source of
//       the displayed name. Vanilla localises 312 of 312 module ids AND 312 of 312 <id>_desc.
//   POST /api/characters/trait  {id:"lens_trait_x", …}  (public/characters.js "Create custom trait")
//     → the mod ended up with NO localisation directory. The trait row came back label:"" and the picker's
//       labels map had no entry — the exact raw-token case #trait-picker-shows-raw-tokens fixed on the READER
//       side 160 lines above this writer. Vanilla names 193 of 194 trait ids and 193 <id>_desc keys.
//
// The positive control, POST /api/equipment/chassis-new in the SAME mod, wrote both its keys into the same
// yml — so "nothing was written" was never a measurement failure.
//
// The fix names what Nova creates and NOTHING ELSE: a key that already resolves (through the mod, a
// dependency or the base game) is left alone, because these endpoints also EDIT existing blocks.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-named-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

// A copy of server.js with the fix's own lines reverted, loaded as its own app. Refuses an ambiguous match.
const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 120) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 120) };
    out = out.replace(from, () => to); // FUNCTION replacement — a `$` in the text is not a backreference
  }
  const p = path.join(__dirname, `.ctl-named-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  return dir;
}
function locText(dir) {
  const d = path.join(dir, "localisation", "english");
  if (!fs.existsSync(d)) return "";
  return fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), "utf8")).join("\n");
}
function modText(dir, ...rel) {
  const p = path.join(dir, ...rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}
const hasKey = (txt, key, val) =>
  new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"${val === undefined ? '.*' : val}"[ \\t]*$`, "m").test(txt);

let PORT = 53559; // this run is confined to 53560-53579
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Bodies copied field-for-field from the pages that send them.
const famBody = (dir) => ({
  modPath: dir, id: "lens_rifle", name: "Lens Rifle", type: "infantry", domain: "land",
  tierCount: 3, year: "1936", build_cost_ic: "5", soft_attack: "5", defense: "3",
});
const modBody = (dir, id) => ({
  modPath: dir, id: id || "lens_mod_x", category: "tank_engine_type", gui_category: "",
  abbreviation: "lx", add_stats: { maximum_speed: 1 }, multiply_stats: {},
});
const upgBody = (dir) => ({
  modPath: dir, id: "lens_upg_x", abbreviation: "lx", cost: "land", max_level: 3, stats: { armor_value: 0.1 },
});
const traitBody = (dir) => ({
  modPath: dir, id: "lens_trait_x", type: "land", trait_type: "personality_trait", cost: "1",
  modifier: { defence: 0.05 },
});

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] the game reads these names out of localisation, not out of the block");
    {
      const locDir = path.join(VANILLA, "localisation", "english");
      if (fs.existsSync(locDir)) {
        let all = "";
        for (const f of fs.readdirSync(locDir)) {
          if (!f.toLowerCase().endsWith(".yml")) continue;
          try { all += fs.readFileSync(path.join(locDir, f), "utf8") + "\n"; } catch (_) {}
        }
        rec("a vanilla module is named in loc", hasKey(all, "tank_gasoline_engine"), "not found");
        rec("…and carries a <id>_desc too", hasKey(all, "tank_gasoline_engine_desc"), "not found");
        rec("a vanilla upgrade is named in loc", hasKey(all, "tank_armor_upgrade"), "not found");
        rec("a vanilla commander trait is named", hasKey(all, "panzer_leader"), "not found");
        rec("…and carries a <id>_desc too", hasKey(all, "panzer_leader_desc"), "not found");
        rec("a vanilla BUILDABLE tier is named, not just its archetype",
          hasKey(all, "infantry_equipment") && hasKey(all, "infantry_equipment_1"), "not found");
        // …and the module block itself has no name field, so loc is the ONLY source. Check the fixture, not memory.
        const modFile = path.join(VANILLA, "common", "units", "equipment", "modules", "00_tank_modules.txt");
        if (fs.existsSync(modFile)) {
          const t = fs.readFileSync(modFile, "utf8");
          rec("…and the module block declares tank_gasoline_engine but no name of its own",
            /tank_gasoline_engine\s*=\s*\{/.test(t) && !/^\s*name\s*=/m.test(t), "a `name =` was found in the module file");
        }
      } else console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());
    const dir = mkMod();

    console.log("\n[a new equipment family] every buildable tier is named, not just the archetype");
    const fam = await api.post("/api/equipment/family", famBody(dir));
    rec("the family is created", fam.b.ok === true, fam.b);                       // read the body before the disk
    rec("…and reports the three tiers it wrote", JSON.stringify(fam.b.tiers) === '["lens_rifle_0","lens_rifle_1","lens_rifle_2"]', fam.b);
    // FIXTURE CONTROL: the tiers really are on disk, so the loc checks below are not vacuous.
    const eqTxt = modText(dir, "common", "units", "equipment", "zz_nova_equipment.txt");
    rec("the fixture really has three buildable tiers on disk",
      /lens_rifle_0\s*=\s*\{/.test(eqTxt) && /lens_rifle_1\s*=\s*\{/.test(eqTxt) && /lens_rifle_2\s*=\s*\{/.test(eqTxt), eqTxt.slice(0, 300));
    rec("…and the archetype it names is the UNBUILDABLE one", /is_buildable\s*=\s*no/.test(eqTxt), eqTxt.slice(0, 300));
    let loc = locText(dir);
    rec("the archetype is still named", hasKey(loc, "lens_rifle", "Lens Rifle"), loc);
    rec("tier 0 is named", hasKey(loc, "lens_rifle_0", "Lens Rifle I"), loc);
    rec("tier 1 is named", hasKey(loc, "lens_rifle_1", "Lens Rifle II"), loc);
    rec("tier 2 is named", hasKey(loc, "lens_rifle_2", "Lens Rifle III"), loc);
    rec("…one key each, not a duplicated pair",
      (loc.match(/^\s*lens_rifle_0:/gm) || []).length === 1, loc);

    console.log("\n[Nova's own arsenal reader] agrees — no row shows a raw token");
    const list = await api.get(`/api/equipment/list?modPath=${encodeURIComponent(dir)}`);
    const rows = (list.b.equipment || list.b.items || list.b.list || []).filter((e) => String(e.id).startsWith("lens_rifle"));
    rec("all four entries are listed", rows.length === 4, rows.map((e) => e.id));
    rec("…and none of them comes back nameless", rows.every((e) => e.name), rows.map((e) => [e.id, e.name]));

    console.log("\n[a module and an upgrade made from scratch] are named, with a desc key");
    const mod = await api.post("/api/equipment/module", modBody(dir));
    rec("the module is created", mod.b.ok === true, mod.b);
    rec("the fixture really has the module block on disk",
      /lens_mod_x\s*=\s*\{/.test(modText(dir, "common", "units", "equipment", "modules", "nova_custom_modules.txt")), "not written");
    const upg = await api.post("/api/equipment/upgrade", upgBody(dir));
    rec("the upgrade is created", upg.b.ok === true, upg.b);
    rec("the fixture really has the upgrade block on disk",
      /lens_upg_x\s*=\s*\{/.test(modText(dir, "common", "units", "equipment", "upgrades", "nova_custom_upgrades.txt")), "not written");
    loc = locText(dir);
    rec("the module has a readable name", hasKey(loc, "lens_mod_x", "Lens Mod X"), loc);
    rec("…and a desc key, so no tooltip shows lens_mod_x_desc", hasKey(loc, "lens_mod_x_desc", ""), loc);
    rec("the upgrade has a readable name", hasKey(loc, "lens_upg_x", "Lens Upg X"), loc);
    rec("…and a desc key", hasKey(loc, "lens_upg_x_desc", ""), loc);

    console.log("\n[a custom commander trait] is named, and Nova's picker sees the name");
    const tr = await api.post("/api/characters/trait", traitBody(dir));
    rec("the trait is created", tr.b.ok === true, tr.b);
    rec("the fixture really has the trait block on disk",
      /lens_trait_x\s*=\s*\{/.test(modText(dir, "common", "unit_leader", "nova_custom_traits.txt")), "not written");
    loc = locText(dir);
    rec("the trait has a readable name", hasKey(loc, "lens_trait_x", "Lens Trait X"), loc);
    rec("…and a desc key", hasKey(loc, "lens_trait_x_desc", ""), loc);
    const traits = await api.get(`/api/characters/traits?modPath=${encodeURIComponent(dir)}`);
    const row = (traits.b.unit || []).find((u) => u.name === "lens_trait_x");
    rec("the trait picker lists it", !!row, (traits.b.unit || []).slice(0, 4));
    rec("…with a label instead of a bare token", !!(row && row.label) && row.label !== "lens_trait_x", row);
    rec("…and the labels map the chips render from has it too",
      (traits.b.labels || {})["lens_trait_x"] === "Lens Trait X", (traits.b.labels || {})["lens_trait_x"]);

    console.log("\n[must NOT change] a name that already exists is never overwritten");
    {
      // These endpoints also EDIT: re-saving a module merges into the block it already wrote. If the naming
      // were unconditional, the modder's own wording would be replaced by the humanised id on every save.
      const locFile = path.join(dir, "localisation", "english", "custom_equipment_l_english.yml");
      let t = fs.readFileSync(locFile, "utf8");
      t = t.replace(/lens_mod_x:0 ".*"/, () => 'lens_mod_x:0 "Whirlwind Diesel"');
      fs.writeFileSync(locFile, t, "utf8");
      rec("the fixture really carries the hand-written name",
        hasKey(fs.readFileSync(locFile, "utf8"), "lens_mod_x", "Whirlwind Diesel"), "setup failed");
      const again = await api.post("/api/equipment/module", modBody(dir));
      rec("…the module saves again", again.b.ok === true, again.b);
      rec("…and the hand-written name survives the save",
        hasKey(fs.readFileSync(locFile, "utf8"), "lens_mod_x", "Whirlwind Diesel"), fs.readFileSync(locFile, "utf8"));
      rec("…without appending a second definition of the key",
        (fs.readFileSync(locFile, "utf8").match(/^\s*lens_mod_x:/gm) || []).length === 1, fs.readFileSync(locFile, "utf8"));
    }
    api.stop(); api = null;

    console.log("\n[back-out 1] the family names the archetype only, as before");
    {
      const built = controlApp("fam", [[
        `      const familyName = (b.name && String(b.name).trim()) || humanizeIdForLoc(id);
      const TIER_MARK = ["I", "II", "III", "IV", "V", "VI"];
      upsertEquipmentLocIfMissing(activeRoot, tiers.map((t, i) => [
        t.id, t.name || (tiers.length > 1 ? \`\${familyName} \${TIER_MARK[i]}\` : familyName),
      ]));`,
        `      for (const t of tiers) if (t.name) upsertEquipmentLoc(activeRoot, t.id, t.name);`]]);
      if (built.error) rec("the family control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const c = await capi.post("/api/equipment/family", famBody(cdir));
          const cloc = locText(cdir);
          rec("…the control still creates the family", c.b.ok === true, c.b);
          rec("…still names the archetype", hasKey(cloc, "lens_rifle", "Lens Rifle"), cloc);
          rec("…and leaves every buildable tier a raw token",
            !/lens_rifle_[0-2]:/.test(cloc), "a tier was localised — the control did not reproduce the bug");
        } finally { capi.stop(); }
      }
    }

    console.log("\n[back-out 2] the module and the upgrade write no loc, as before");
    {
      const built = controlApp("eq", [
        [`      upsertEquipmentLocIfMissing(activeRoot, [
        [id, String(b.name || "").trim() || humanizeIdForLoc(id)],
        [id + "_desc", ""],
      ]);
      res.json({ ok: true, id, category, file });`, `      res.json({ ok: true, id, category, file });`],
        [`      upsertEquipmentLocIfMissing(activeRoot, [
        [id, String(b.name || "").trim() || humanizeIdForLoc(id)],
        [id + "_desc", ""],
      ]);
      const statWarning = unknown.length`, `      const statWarning = unknown.length`],
      ]);
      if (built.error) rec("the equipment control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const cm = await capi.post("/api/equipment/module", modBody(cdir));
          const cu = await capi.post("/api/equipment/upgrade", upgBody(cdir));
          rec("…the control still creates both", cm.b.ok === true && cu.b.ok === true, [cm.b, cu.b]);
          const cloc = locText(cdir);
          rec("…and neither gets a name", !/lens_mod_x:/.test(cloc) && !/lens_upg_x:/.test(cloc),
            "a name was written — the control did not reproduce the bug: " + cloc);
        } finally { capi.stop(); }
      }
    }

    console.log("\n[back-out 3] the trait writes no loc at all, as before");
    {
      const built = controlApp("trait", [[
        `        if (entries.length) upsertLocalizationLines(path.join(activeRoot, "localisation", "english", "nova_custom_traits_l_english.yml"), entries, "unit-leader-trait-loc");`,
        `        if (entries.length && false) { /* backed out */ }`]]);
      if (built.error) rec("the trait control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const c = await capi.post("/api/characters/trait", traitBody(cdir));
          rec("…the control still creates the trait", c.b.ok === true, c.b);
          rec("…and the mod ends up with no localisation for it", !/lens_trait_x:/.test(locText(cdir)),
            "the trait was localised — the control did not reproduce the bug");
          const ct = await capi.get(`/api/characters/traits?modPath=${encodeURIComponent(cdir)}`);
          const crow = (ct.b.unit || []).find((u) => u.name === "lens_trait_x");
          rec("…so the picker shows it as a bare token", !!crow && !crow.label, crow);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== new content is named: ${checks} checks, ${fails.length} failed ===`);
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
