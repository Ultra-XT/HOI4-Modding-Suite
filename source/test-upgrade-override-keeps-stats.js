// #upgrade-override-wipes-inherited-stats — AN ABSENT FIELD MEANS "CLEARED" ONLY IF THE FORM SHOWED IT.
//
// mergePreservedUpgradeBlock keeps un-modelled NESTED blocks and deliberately drops flat scalars. Its stated
// reason is right for the case it was written for:
//
//   "Every flat scalar in an upgrade is managed … so a stat the edit removed must NOT survive — keeping it
//    here would re-add a cleared stat on every save."
//
// That holds when the author is EDITING an upgrade of their own: the boxes were populated, so an empty one
// means cleared. But the same merge runs on the INHERITED-OVERRIDE path, and that editor is CREATE-ONLY —
// public/army.js:3038 builds { modPath, id, abbreviation, cost, max_level, stats } from a blank draft, with
// no autocomplete and no existing-id warning. There an absent stat means "never displayed".
//
// Measured on a PLAIN mod — no dependency anywhere, so this was never an add-on defect — naming a new
// upgrade after vanilla's plane_gun_upgrade:
//
//     vanilla    air_attack = 0.1, maximum_speed = -0.01, reliability = -0.1, air_agility = -0.05
//     written    { max_level = 5  cost = air  air_attack = 0.2 }
//     response   ok:true, statWarning "", no hint that an existing id was redefined
//
// 🈯 vanilla's air_upgrades.txt (13 upgrades) and naval_upgrades.txt (17) contain ZERO add_stats blocks, so
// every stat in them is flat and every one was lost. land_upgrades.txt nests two, which is why this went
// unnoticed there — the corpus check below asserts that split rather than trusting it.
//
// Same distinction the ideas maker draws with formSections (#spirit-save-deletes-hidden-blocks). The half
// that must NOT change is the edit path: a stat the author really did clear must stay gone, and that has its
// own checks here.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upgkeep-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const UPG = path.join(GAME, "common", "units", "equipment", "upgrades");
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "UK" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "units", "equipment", "upgrades"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
function blockOf(txt, id) {
  const m = new RegExp("(^|\\n)\\s*" + id + "\\s*=\\s*\\{").exec(txt);
  if (!m) return null;
  const open = txt.indexOf("{", m.index + m[0].length - 1);
  let d = 0;
  for (let i = open; i < txt.length; i++) {
    const c = txt[i];
    if (c === "{") d++; else if (c === "}") { d--; if (!d) return txt.slice(open + 1, i); }
  }
  return null;
}
const leafMap = (body) => {
  const o = {};
  for (const m of String(body || "").replace(/#.*$/gm, "").matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(-?[\d.]+|"[^"]*"|[A-Za-z_][A-Za-z0-9_]*)/g)) o[m[1]] = m[2];
  return o;
};
const written = (mod, id) => {
  const d = path.join(mod, "common", "units", "equipment", "upgrades");
  for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) {
    const b = blockOf(fs.readFileSync(path.join(d, f), "utf8"), id);
    if (b) return b;
  }
  return null;
};

let PORT = 50150;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      // Exactly the body public/army.js:3038 (upgSave) builds.
      save: (b) => fetch("http://127.0.0.1:" + PORT + "/api/equipment/upgrade", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(UPG)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] where vanilla puts its upgrade stats");
    let flatFiles = 0, nestedFiles = 0;
    for (const f of fs.readdirSync(UPG).filter((x) => x.endsWith(".txt"))) {
      const t = fs.readFileSync(path.join(UPG, f), "latin1");
      const ids = (t.replace(/#.*$/gm, "").match(/(?:^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/g) || []).length;
      const nested = (t.match(/\badd_stats\s*=\s*\{/g) || []).length;
      if (nested === 0) flatFiles++; else nestedFiles++;
      console.log(`  ${f}: ${ids} upgrades, ${nested} add_stats blocks${nested === 0 ? "   <-- all-flat" : ""}`);
    }
    rec("some vanilla upgrade files are ALL-FLAT — the exposed shape", flatFiles > 0, flatFiles);
    rec("…and some nest, which is why this went unnoticed", nestedFiles > 0, nestedFiles);

    // Pick a real upgrade id from inside the `upgrades = { … }` wrapper. ⚠️ The first `token = {` in the file
    // IS that wrapper, not an upgrade — an earlier version of this probe diffed the wrapper and measured the
    // whole file.
    const airTxt = fs.readFileSync(path.join(UPG, "air_upgrades.txt"), "latin1");
    const wrapper = blockOf(airTxt, "upgrades");
    const victim = (/(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/.exec(wrapper || "") || [, ""])[1];
    const vanillaLeaves = leafMap(blockOf(wrapper || "", victim));
    const vanillaStats = Object.keys(vanillaLeaves).filter((k) => !["max_level", "cost", "abbreviation"].includes(k));
    console.log(`  overriding ${victim}, which carries ${vanillaStats.length} stat modifiers`);
    rec("fixture: the victim really has several flat stats", vanillaStats.length >= 3, vanillaLeaves);

    api = await serve(createApp());

    console.log("\n[a plain mod redefines a vanilla upgrade] the stats it never saw survive");
    {
      const solo = mkMod(null);
      const changed = vanillaStats[0];
      const r = await api.save({ modPath: solo.dir, id: victim, abbreviation: "", cost: "air", max_level: 5,
        stats: { [changed]: 0.99 } });
      rec("the save succeeds", r.ok === true, r);
      const got = leafMap(written(solo.dir, victim));
      rec("…the stat the author typed wins", got[changed] === "0.99", { got: got[changed] });
      const untouched = vanillaStats.filter((k) => k !== changed);
      rec("…and every stat the form never showed is kept",
        untouched.every((k) => got[k] === vanillaLeaves[k]),
        { missing: untouched.filter((k) => got[k] !== vanillaLeaves[k]), got });
      rec("…so the block grew rather than shrank",
        Object.keys(got).length >= Object.keys(vanillaLeaves).length, { after: Object.keys(got).length, before: Object.keys(vanillaLeaves).length });
    }

    console.log("\n[an add-on over a base mod] the same, one layer up");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "upgrades", "zz_base_upg.txt"),
        "upgrades = {\n\tuk_base_upgrade = {\n\t\tmax_level = 4\n\t\tcost = land\n\t\tarmor_value = 0.1\n\t\tdefense = 0.05\n\t\tlinear_cost = { cost_by_level = 1 }\n\t}\n}\n");
      const addon = mkMod(base.name);
      const r = await api.save({ modPath: addon.dir, id: "uk_base_upgrade", abbreviation: "", cost: "land",
        max_level: 4, stats: { armor_value: 0.5 } });
      rec("the save succeeds", r.ok === true, r);
      const got = leafMap(written(addon.dir, "uk_base_upgrade"));
      rec("…the typed stat wins", got.armor_value === "0.5", got);
      rec("…the base mod's other stat survives", got.defense === "0.05", got);
      rec("…and its nested block still does too", /linear_cost/.test(written(addon.dir, "uk_base_upgrade") || ""), "nested lost");
      rec("…while the base mod is untouched",
        /armor_value = 0.1/.test(fs.readFileSync(path.join(base.dir, "common", "units", "equipment", "upgrades", "zz_base_upg.txt"), "utf8")), "base changed");
    }

    console.log("\n[the half that must NOT change] editing your OWN upgrade still clears what you cleared");
    {
      const mod = mkMod(null);
      const r1 = await api.save({ modPath: mod.dir, id: "uk_my_upgrade", abbreviation: "ukm", cost: "land",
        max_level: 3, stats: { armor_value: 0.2, defense: 0.1 } });
      rec("the first save succeeds", r1.ok === true, r1);
      const first = leafMap(written(mod.dir, "uk_my_upgrade"));
      rec("…writing both stats", first.armor_value === "0.2" && first.defense === "0.1", first);

      // Now the author removes `defense` in the editor and saves again. It must NOT come back.
      const r2 = await api.save({ modPath: mod.dir, id: "uk_my_upgrade", abbreviation: "ukm", cost: "land",
        max_level: 3, stats: { armor_value: 0.2 } });
      rec("the second save succeeds", r2.ok === true, r2);
      const second = leafMap(written(mod.dir, "uk_my_upgrade"));
      rec("…and the stat the author CLEARED stays gone", second.defense === undefined, second);
      rec("…while the one they kept remains", second.armor_value === "0.2", second);
    }

    api.stop(); api = null;
    console.log(`\n=== upgrade override keeps stats: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
