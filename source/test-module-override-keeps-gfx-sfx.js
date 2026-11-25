// #module-override-drops-gfx-and-sfx — TWO CAUSES, ONE SYMPTOM.
//
// 1. writeEquipmentModuleToFile RECEIVES an ownedKeys set and uses it on the same-file branch, but the
//    inherited-seed branch called the merge WITHOUT it, so that path fell back to denying the FULL
//    MODULE_OWNED_KEYS set — gfx and sfx included. The guard existed; one branch adopted it, its sibling did
//    not, which is the shape most of this week's defects share.
//
// 2. public/army.js — the ONLY caller of /api/equipment/module — sent `gfx: (value || "").trim()`
//    unconditionally while never sending `sfx` at all. The server's optional-owned test is `hasOwnProperty`,
//    so gfx was always "owned" (and cleared) and sfx never was (and survived). That asymmetry was an accident
//    of the request body, not a choice anyone made.
//
//    ⚠️ MY FIRST FIX FOR THIS WAS WRONG, AND AN EXISTING TEST CAUGHT IT. I redefined the server so a
//    present-but-EMPTY optional key meant "not supplied" — and test-module-gfx-sfx-preserved.js failed,
//    correctly: it pins that sending { gfx: "" } CLEARS the icon, "that is what OWNED is for". That is a
//    deliberate contract worth keeping; an author overriding a module may want it to have no icon. The fault
//    was in the caller, so the caller is where the fix belongs — army.js now omits the key when the box is
//    blank, and the server contract is untouched.
//
// The box cannot mean "cleared", and this was checked rather than assumed: openModuleEditor is reached only
// from the `.mp-new` button (army.js:4152), NOTHING ever populates #meGfx from an existing module — it is
// written only by the icon browser — and its placeholder reads "none — inherits its category's icon". The
// form is create-only, so a blank box means NOT SPECIFIED.
//
// Hand-measured, overriding a module with the exact client body:
//
//     before   keeps gfx? NO   keeps sfx? NO   keeps xp_cost/add_equipment_type/critical_parts? yes
//
// — the seed demonstrably ran, and the loss was selective to the owned set. A STANDALONE mod overriding a
// module in its own base file lost the same pair, so this was never an add-on defect.
//
// 🈯 vanilla declares gfx on 42 modules and sfx on 280, with no category fallback: the redefined module loses
// its designer icon and its UI click sound in game.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modkeep-"));
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
const MODDIR = path.join(GAME, "common", "units", "equipment", "modules");
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "MK" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "units", "equipment", "modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const MODULE = [
  "equipment_modules = {",
  "\tmk_heavy_battery = {",
  "\t\tcategory = ship_heavy_battery",
  "\t\tgui_category = ship_gui_heavy_battery",
  "\t\tsfx = sfx_ui_sd_module_turret",
  "\t\tgfx = ship_heavy_battery_5",
  "\t\txp_cost = 7",
  "\t\tadd_equipment_type = capital_ship",
  "\t\tadd_stats = { build_cost_ic = 2000 hg_attack = 30 }",
  "\t\tcritical_parts = { critical_hit_chance = 0.1 }",
  "\t}",
  "}",
  "",
].join("\n");
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
const written = (mod, id) => {
  const d = path.join(mod, "common", "units", "equipment", "modules");
  for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) {
    const b = blockOf(fs.readFileSync(path.join(d, f), "utf8"), id);
    if (b) return b;
  }
  return null;
};
const shows = (b, k) => new RegExp("(^|\\n)\\s*" + k + "\\s*=").test(String(b || ""));
// Exactly what public/army.js sends: sfx is never sent, and gfx is sent ONLY when the box has a value.
// (It used to be sent unconditionally as a trimmed string, which is precisely the bug — a blank box reached
// the server as an explicit clear.)
const clientBody = (modPath, id, over) => {
  const body = Object.assign({
    modPath, id, category: "ship_heavy_battery", gui_category: "ship_gui_heavy_battery",
    abbreviation: "", add_stats: { hg_attack: 30 }, multiply_stats: {},
  }, over || {});
  if (!String(body.gfx || "").trim()) delete body.gfx;
  return body;
};

let PORT = 50190;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      save: (b) => fetch("http://127.0.0.1:" + PORT + "/api/equipment/module", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[the corpus] how much vanilla content carries these keys");
    if (fs.existsSync(MODDIR)) {
      let gfx = 0, sfx = 0;
      for (const f of fs.readdirSync(MODDIR).filter((x) => x.endsWith(".txt"))) {
        const t = fs.readFileSync(path.join(MODDIR, f), "latin1").replace(/#.*$/gm, "");
        gfx += (t.match(/(?:^|\n)\s*gfx\s*=/g) || []).length;
        sfx += (t.match(/(?:^|\n)\s*sfx\s*=/g) || []).length;
      }
      console.log(`  vanilla modules declare gfx ${gfx} times and sfx ${sfx} times`);
      rec("both keys are widely used, so losing them matters", gfx > 10 && sfx > 50, { gfx, sfx });
    } else console.log("  (no HOI4 install — corpus skipped)");

    console.log("\n[the client] the form cannot mean \"cleared\"");
    {
      const A = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
      rec("the module editor is reached only from the NEW button", /\.mp-new[\s\S]{0,200}openModuleEditor/.test(A), "an edit path exists now — revisit this rule");
      rec("…and nothing loads an existing module's gfx into the box",
        !/\$\("meGfx"\)\.value\s*=\s*(?!key)/.test(A) || /openModuleIconPicker/.test(A), "meGfx is populated from somewhere");
      // The fix lives HERE, in the caller: gfx rides along only when the box has a value. The server contract
      // is untouched — an explicitly empty gfx still clears, which test-module-gfx-sfx-preserved.js requires.
      rec("…the request sends gfx only when the box has a value",
        /\(\$\("meGfx"\)\.value \|\| ""\)\.trim\(\) \? \{ gfx:/.test(A), "gfx is sent unconditionally again");
      rec("…and never sends sfx at all", !/\bsfx:/.test(A), "the body shape changed — revisit");
    }

    api = await serve(createApp());

    console.log("\n[an add-on overriding a base mod's module] nothing is lost");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "modules", "base_modules.txt"), MODULE);
      const addon = mkMod(base.name);
      const r = await api.save(clientBody(addon.dir, "mk_heavy_battery"));
      rec("the save succeeds", r.ok === true, r);
      const b = written(addon.dir, "mk_heavy_battery");
      for (const k of ["gfx", "sfx", "xp_cost", "add_equipment_type", "critical_parts"]) {
        rec(`…keeps ${k}`, shows(b, k), b);
      }
      rec("…and the edit the author made is applied", /hg_attack = 30/.test(String(b)), b);
      rec("…while the base mod is untouched",
        /gfx = ship_heavy_battery_5/.test(fs.readFileSync(path.join(base.dir, "common", "units", "equipment", "modules", "base_modules.txt"), "utf8")), "base changed");

      // A SECOND save now takes the same-file branch — the half that used to keep sfx and drop gfx.
      const r2 = await api.save(clientBody(addon.dir, "mk_heavy_battery"));
      rec("re-saving succeeds", r2.ok === true, r2);
      const b2 = written(addon.dir, "mk_heavy_battery");
      rec("…and the second save keeps gfx too", shows(b2, "gfx"), b2);
      rec("…and sfx", shows(b2, "sfx"), b2);
    }

    console.log("\n[a standalone mod] the same — this was never add-on specific");
    {
      const solo = mkMod(null);
      fs.writeFileSync(path.join(solo.dir, "common", "units", "equipment", "modules", "own.txt"), MODULE);
      const r = await api.save(clientBody(solo.dir, "mk_heavy_battery"));
      rec("the save succeeds", r.ok === true, r);
      const b = written(solo.dir, "mk_heavy_battery");
      rec("…keeps gfx", shows(b, "gfx"), b);
      rec("…keeps sfx", shows(b, "sfx"), b);
    }

    console.log("\n[an author who DOES supply them] their values win");
    {
      const solo = mkMod(null);
      fs.writeFileSync(path.join(solo.dir, "common", "units", "equipment", "modules", "own.txt"), MODULE);
      const r = await api.save(clientBody(solo.dir, "mk_heavy_battery",
        { gfx: "ship_light_battery_1", sfx: "sfx_ui_sd_module_engine" }));
      rec("the save succeeds", r.ok === true, r);
      const b = written(solo.dir, "mk_heavy_battery");
      rec("…the supplied gfx replaces the inherited one", /gfx = ship_light_battery_1/.test(String(b)), b);
      rec("…and the supplied sfx does too", /sfx = sfx_ui_sd_module_engine/.test(String(b)), b);
    }

    console.log("\n[a brand-new module] gets exactly what was typed, nothing invented");
    {
      const solo = mkMod(null);
      const r = await api.save(clientBody(solo.dir, "mk_brand_new"));
      rec("the save succeeds", r.ok === true, r);
      const b = written(solo.dir, "mk_brand_new");
      rec("…with no gfx, because none was given and none was inherited", !shows(b, "gfx"), b);
      rec("…and no sfx either", !shows(b, "sfx"), b);
    }

    api.stop(); api = null;
    console.log(`\n=== module override keeps gfx/sfx: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
