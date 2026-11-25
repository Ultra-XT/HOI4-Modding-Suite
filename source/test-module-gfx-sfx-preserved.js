// #module-gfx-sfx-unreadable — OWNED IS NOT THE SAME AS SUPPLIED.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `gfx` and `sfx` are in MODULE_OWNED_KEYS, and that is correct: an owned key the author CLEARED must not be
// resurrected by the preserve pass — that is the guard's whole purpose. But "owned" was applied on every
// re-save, including the ones that never mentioned the key. And nothing could mention it:
//   · the module catalogue (`scanEquipmentModules`) returned id/category/guiCategory/abbreviation/addStats/
//     multiplyStats/dlc — neither gfx nor sfx, so no client could prefill them
//   · the editor's gfx box starts blank, because the form is create-only
//   · the editor has no sfx box at all, and the only client caller never posts one
//
// So a re-save deleted both while carrying genuinely un-modelled keys like `xp_cost` across perfectly.
// tank_gasoline_engine lost `sfx = sfx_ui_sd_module_engine`; ship_super_heavy_battery_1 lost its sound AND
// its icon. Vanilla declares gfx on 42 modules and sfx on 280, with no category-level fallback — and because
// Nova writes sfx itself, a second save of a Nova-authored module deleted the sfx Nova had just written.
//
// Two halves to the fix, and both are needed: the catalogue now reads them back, and an optional owned key is
// only treated as owned when the request actually carries it. Absent means "I have nothing to say about this"
// and the old value stands; present-and-empty still means cleared.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modgfx-"));
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
  const p = path.join(__dirname, `.ctl-modgfx-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "units", "equipment", "modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  return dir;
}
const MODFILE = "zz_mods.txt";
const modPathOf = (dir) => path.join(dir, "common", "units", "equipment", "modules", MODFILE);
function seedModule(dir, extra) {
  fs.writeFileSync(modPathOf(dir), [
    "equipment_modules = {",
    "\tnua_engine = {",
    "\t\tcategory = tank_engine_type",
    "\t\tgfx = a_gfx",
    "\t\tsfx = a_sfx",
    "\t\txp_cost = 5",
    ...(extra || []),
    "\t\tadd_stats = { maximum_speed = 1 }",
    "\t\tmultiply_stats = { }",
    "\t}",
    "}", ""].join("\n"), "utf8");
}

let PORT = 46700;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      save: (dir, body) => fetch(`http://127.0.0.1:${PORT}/api/equipment/module`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({
          modPath: dir, fileName: MODFILE, id: "nua_engine", category: "tank_engine_type",
          add_stats: { maximum_speed: 1 },
        }, body)),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] how much of the game declares these at all");
    if (fs.existsSync(path.join(VANILLA, "common", "units", "equipment", "modules"))) {
      const dir = path.join(VANILLA, "common", "units", "equipment", "modules");
      let gfx = 0, sfx = 0;
      for (const f of fs.readdirSync(dir)) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#.*$/gm, "");
        gfx += (t.match(/(?:^|\n)\s*gfx\s*=/g) || []).length;
        sfx += (t.match(/(?:^|\n)\s*sfx\s*=/g) || []).length;
      }
      rec("vanilla modules declare gfx, so losing it loses real art", gfx >= 30, gfx);
      rec("…and declare sfx far more often still", sfx >= 200, sfx);
      console.log(`  --   measured: gfx on ${gfx} modules, sfx on ${sfx}`);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[the catalogue] can be read back, which is half the fix");
    const dir0 = mkMod();
    seedModule(dir0);
    const cat = await api.get(`/api/equipment/modules?modPath=${encodeURIComponent(dir0)}`);
    const row = (cat.b.modules || []).find((m) => m.id === "nua_engine");
    rec("the module is listed", !!row, (cat.b.modules || []).map((m) => m.id).slice(0, 5));
    rec("…carrying its gfx", row && row.gfx === "a_gfx", row);
    rec("…and its sfx", row && row.sfx === "a_sfx", row);

    console.log("\n[a re-save that says nothing about them] leaves them alone");
    const dir1 = mkMod(); seedModule(dir1);
    const r1 = await api.save(dir1, {});
    rec("the save succeeds", r1.b.ok === true, r1.b);
    const t1 = fs.readFileSync(modPathOf(dir1), "utf8");
    rec("…gfx survives", /gfx\s*=\s*a_gfx/.test(t1), t1);
    rec("…sfx survives", /sfx\s*=\s*a_sfx/.test(t1), t1);
    rec("…and the genuinely un-modelled key still survives too", /xp_cost\s*=\s*5/.test(t1), t1);
    rec("…the file is still brace-balanced", (t1.match(/\{/g) || []).length === (t1.match(/\}/g) || []).length, t1.length);

    console.log("\n[a re-save that clears them] still clears — that is what OWNED is for");
    const dir2 = mkMod(); seedModule(dir2);
    await api.save(dir2, { gfx: "", sfx: "" });
    const t2 = fs.readFileSync(modPathOf(dir2), "utf8");
    rec("gfx is gone", !/gfx\s*=/.test(t2), t2);
    rec("sfx is gone", !/sfx\s*=/.test(t2), t2);
    rec("…and clearing them did not take the un-modelled key with it", /xp_cost\s*=\s*5/.test(t2), t2);

    console.log("\n[a re-save that changes them] replaces, never doubles");
    const dir3 = mkMod(); seedModule(dir3);
    await api.save(dir3, { gfx: "b_gfx", sfx: "b_sfx" });
    const t3 = fs.readFileSync(modPathOf(dir3), "utf8");
    rec("the new gfx is written", /gfx\s*=\s*b_gfx/.test(t3), t3);
    rec("the new sfx is written", /sfx\s*=\s*b_sfx/.test(t3), t3);
    rec("…and the old values are gone, not kept alongside", !/a_gfx/.test(t3) && !/a_sfx/.test(t3), t3);
    rec("…exactly one of each", (t3.match(/gfx\s*=/g) || []).length === 1 && (t3.match(/sfx\s*=/g) || []).length === 1, t3);

    console.log("\n[twice over] the shape that made this bite Nova's own modules");
    // Nova writes sfx itself, so a second save of a Nova-authored module was deleting Nova's own work.
    const dir4 = mkMod(); seedModule(dir4);
    await api.save(dir4, { gfx: "c_gfx", sfx: "c_sfx" });
    await api.save(dir4, {});
    const t4 = fs.readFileSync(modPathOf(dir4), "utf8");
    rec("what Nova wrote on the first save survives the second", /gfx\s*=\s*c_gfx/.test(t4) && /sfx\s*=\s*c_sfx/.test(t4), t4);
    api.stop(); api = null;

    console.log("\n[back-out] treat them as owned whether or not they were supplied");
    {
      const built = controlApp("alwaysowned", [[
        "      const file = writeEquipmentModuleToFile(activeRoot, b.fileName || \"nova_custom_modules.txt\", module, moduleOwnedKeysFor(b));",
        "      const file = writeEquipmentModuleToFile(activeRoot, b.fileName || \"nova_custom_modules.txt\", module, MODULE_OWNED_KEYS);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod(); seedModule(cdir);
          const c = await capi.save(cdir, {});
          const ct = fs.readFileSync(modPathOf(cdir), "utf8");
          rec("…the control still reports success", c.b.ok === true, c.b);
          rec("…and deletes the icon and the sound", !/gfx\s*=/.test(ct) && !/sfx\s*=/.test(ct), ct);
          rec("…while keeping the un-modelled key, which is what made this so easy to miss",
            /xp_cost\s*=\s*5/.test(ct), ct);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== module gfx/sfx preserved: ${checks} checks, ${fails.length} failed ===`);
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
