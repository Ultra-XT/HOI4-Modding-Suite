// #equipment-writer-shadows-vanilla — FOUR WRITERS EMITTED A STUB THAT DELETED A VANILLA FILE.
//
// HOI4 replaces a base-game file wholesale when a mod ships one with the same relative path. So writing a
// small file at `common/units/equipment/tank_chassis.txt` does not ADD a chassis — it deletes vanilla's
// 1,489-line original and leaves 23 lines behind. All four writers returned ok:true.
//
// Measured with the stubs in place, Nova's own readers reported the damage: /api/equipment/list fell from 612
// items to 501 — infantry_equipment and all four of its tiers gone, all 23 tank_chassis* entries gone — and
// /api/equipment/upgrades reported land_upgrades.txt contributing exactly 1 upgrade instead of 111.
// Restoring the files brought all 111 back.
//
// Nova already had TWO answers to this and these four adopted neither: writeEquipmentToFile does
// copy-then-upsert (#dep-equip-preserve, verified in the original report to seed vanilla's whole 37-line
// support.txt with its comments and append the new weapon), and writeTechnologyToFile redirects to a
// non-shadowing name (#tech-file-shadows-base). The seeding is now shared.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqshadow-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "eqshadow");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EqShadow"\nsupported_version="1.19.*"\n', "utf8");

const lines = (p) => { try { return fs.readFileSync(p, "utf8").split("\n").length; } catch (_) { return 0; } };
const vanillaLines = (rel) => lines(path.join(V, "common", "units", "equipment", rel));
const modLines = (rel) => lines(path.join(MOD, "common", "units", "equipment", rel));
const modText = (rel) => { try { return fs.readFileSync(path.join(MOD, "common", "units", "equipment", rel), "utf8"); } catch (_) { return ""; } };

const PORT = 43201;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the vanilla files these would shadow are large");
    rec("vanilla ships tank_chassis.txt", vanillaLines("tank_chassis.txt") > 500, vanillaLines("tank_chassis.txt"));
    rec("…and modules/00_tank_modules.txt", vanillaLines(path.join("modules", "00_tank_modules.txt")) > 500,
      vanillaLines(path.join("modules", "00_tank_modules.txt")));
    rec("…and upgrades/land_upgrades.txt", vanillaLines(path.join("upgrades", "land_upgrades.txt")) > 50,
      vanillaLines(path.join("upgrades", "land_upgrades.txt")));
    rec("…and infantry.txt", vanillaLines("infantry.txt") > 50, vanillaLines("infantry.txt"));

    console.log("\n[the bug] a chassis written at a vanilla basename must not replace it");
    let r = await post("/api/equipment/chassis-new", {
      fileName: "tank_chassis.txt", id: "nova_probe_chassis", type: "armor",
      domain: "armor", name: "Nova Probe Chassis", year: 1936,
      slots: [{ name: "main_armament_slot", required: true, categories: ["tank_gun"] }],
    });
    // Assert SUCCESS, not merely "responded" — my first version accepted 200 OR 400 and so passed while
    // nothing was written at all. A save that did not happen cannot demonstrate anything about shadowing.
    rec("the chassis save SUCCEEDED", r.s === 200 && !r.b.error, r.b || r.s);
    {
      rec("…and the mod file is NOT a stub", modLines("tank_chassis.txt") > 500,
        { mod: modLines("tank_chassis.txt"), vanilla: vanillaLines("tank_chassis.txt") });
      rec("…vanilla's own entries survived", /tank_chassis\s*=\s*\{/.test(modText("tank_chassis.txt")), modText("tank_chassis.txt").slice(0, 200));
      rec("…and the new chassis is in there too", /nova_probe_chassis/.test(modText("tank_chassis.txt")), "not added");
    }

    console.log("\n[the bug] a module written at a vanilla basename must not replace it");
    r = await post("/api/equipment/module", {
      fileName: "00_tank_modules.txt", id: "nova_probe_module", category: "tank_gun",
      name: "Nova Probe Module", abbreviation: "npm",
    });
    rec("the module save SUCCEEDED", r.s === 200 && !r.b.error, r.b || r.s);
    {
      rec("…and the mod file is NOT a stub", modLines(path.join("modules", "00_tank_modules.txt")) > 500,
        { mod: modLines(path.join("modules", "00_tank_modules.txt")) });
      rec("…and the new module is in there", /nova_probe_module/.test(modText(path.join("modules", "00_tank_modules.txt"))), "not added");
    }

    console.log("\n[the bug] an upgrade written at a vanilla basename must not replace it");
    r = await post("/api/equipment/upgrade", {
      fileName: "land_upgrades.txt", id: "nova_probe_upgrade", cost: "land", max_level: 5,
      stats: { armor_value: 0.1 },
    });
    rec("the upgrade save SUCCEEDED", r.s === 200 && !r.b.error, r.b || r.s);
    {
      rec("…and the mod file is NOT a stub", modLines(path.join("upgrades", "land_upgrades.txt")) > 50,
        { mod: modLines(path.join("upgrades", "land_upgrades.txt")) });
      rec("…and the new upgrade is in there", /nova_probe_upgrade/.test(modText(path.join("upgrades", "land_upgrades.txt"))), "not added");
    }

    console.log("\n[the reader agrees] the catalogue must not shrink");
    const list = await fetch(`http://127.0.0.1:${PORT}/api/equipment/list?modPath=${encodeURIComponent(MOD)}`)
      .then((x) => x.json()).catch(() => ({}));
    const items = (list && (list.equipment || [])) || [];
    rec("the equipment catalogue is still large", Array.isArray(items) ? items.length > 400 : true,
      Array.isArray(items) ? items.length : Object.keys(list || {}));

    console.log("\n[safety] every file written is still parseable");
    for (const rel of ["tank_chassis.txt", path.join("modules", "00_tank_modules.txt"), path.join("upgrades", "land_upgrades.txt")]) {
      const t = modText(rel);
      if (!t) continue;
      let d = 0, ok = true;
      for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
      rec(`${rel} is brace-balanced`, ok && d === 0, d);
    }

    console.log(`\n=== equipment writers no shadow: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
