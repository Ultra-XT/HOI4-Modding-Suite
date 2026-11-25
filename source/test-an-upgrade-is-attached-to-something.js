// ⛔ #an-upgrade-attached-to-nothing — THE UPGRADE WAS WRITTEN AND THE GAME NEVER OFFERED IT.
//
// HOI4 only offers an upgrade on a design if the EQUIPMENT lists it:
//     mechanized = { … upgrades = { tank_reliability_upgrade tank_engine_upgrade … } … }
// 23 of the base game's equipment files declare such a block. Nova wrote the upgrade definition into
// common/units/equipment/upgrades/ and stopped: the id existed, the file parsed, and no designer anywhere in
// the game had a slider for it. Nothing else in Nova attached one either — the variant viewer can only edit
// levels of upgrades a variant ALREADY has — so the feature ended at the file rather than at the game.
//
// And the help text said the missing half was covered:
//     "Assigning levels to a specific variant is done in the designer / arsenal, which already supports it."
// You cannot assign a level to an upgrade the equipment does not declare.
//
// Only the mod's OWN equipment is written. A mod file replaces a common/ file of the same basename WHOLESALE,
// so materialising vanilla's mechanized.txt to add one line would freeze every other equipment in it at
// today's version — the same reason /api/equipment/save refuses base-game edits. Those come back as skipped,
// with the reason, rather than as a silent no-op.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53700);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 340) : "")); }
};

const roots = [];
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upg-ad-")); roots.push(appdata);
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upg-")); roots.push(mod);
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Upg"\n', "utf8");

const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: Object.assign({}, process.env, {
    PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
  }),
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

const eqDir = () => path.join(mod, "common", "units", "equipment");

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 160; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    console.log("\n-- ⭐ the premise: the game reads upgrades off the EQUIPMENT, not off the upgrade file --");
    {
      // Derived from the shipped files: if no vanilla equipment declared an `upgrades = { }` block, this
      // whole fix would be built on a misreading.
      const dir = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/units/equipment";
      if (!fs.existsSync(dir)) ok(true, "(base game not installed — premise check skipped)");
      else {
        let files = 0, decls = 0;
        for (const f of fs.readdirSync(dir)) {
          if (!f.toLowerCase().endsWith(".txt")) continue;
          const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#.*$/gm, "");
          const n = (t.match(/(^|[\s}])upgrades\s*=\s*\{/g) || []).length;
          if (n) { files++; decls += n; }
        }
        ok(files >= 10, `${files} base-game equipment files declare an upgrades block (${decls} blocks)`, { files, decls });
        const mech = fs.readFileSync(path.join(dir, "mechanized.txt"), "utf8");
        ok(/upgrades\s*=\s*\{[^}]*tank_engine_upgrade/.test(mech.replace(/#.*$/gm, "")),
          "…mechanized lists tank_engine_upgrade by name, which is how the designer knows to offer it");
      }
    }

    const post = async (url, body) => (await fetch(`http://127.0.0.1:${PORT}${url}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })).json();
    // Exactly the body public/army.js builds in upgSave.
    const mkUpgrade = (id, attachTo) => post("/api/equipment/upgrade", {
      modPath: mod, id, abbreviation: "up", cost: "land", max_level: 5,
      stats: { armor_value: 0.1 }, attachTo: attachTo || [],
    });

    console.log("\n-- a family to attach to --");
    let fam;
    {
      fam = await post("/api/equipment/family", {
        modPath: mod, id: "nova_upg_tank", name: "Upg Tank", type: "armor", domain: "land",
        tierCount: 2, year: 1936, build_cost_ic: 5, soft_attack: 3, defense: 20,
      });
      ok(fam && fam.ok === true, "created", fam && fam.error);
    }

    console.log("\n-- ⛔ an upgrade attached to nothing SAYS so --");
    {
      const r = await mkUpgrade("nova_orphan_upgrade", []);
      ok(r && r.ok === true, "the upgrade is still written — this is advice, not a refusal", r && r.error);
      ok((r.attachedTo || []).length === 0, "…attached to nothing", r.attachedTo);
      const note = (r.notes || []).join(" ");
      ok(/never offer it/.test(note), "…and the response says the game will never offer it", note);
      ok(/upgrades = \{ nova_orphan_upgrade \}/.test(note), "…showing the line the game actually reads", note);
    }

    console.log("\n-- ⭐ attaching it writes the line into the equipment --");
    {
      const r = await mkUpgrade("nova_armor_upgrade", ["nova_upg_tank"]);
      ok(r && r.ok === true, "the upgrade saves", r && r.error);
      ok((r.attachedTo || []).includes("nova_upg_tank"), "…and reports the attachment", r);
      const text = fs.readFileSync(path.join(eqDir(), fam.file), "utf8");
      ok(/upgrades\s*=\s*\{[\s\S]*?nova_armor_upgrade[\s\S]*?\}/.test(text),
        "…and the equipment now declares it", text.slice(0, 400));
      ok(!(r.notes || []).some((n) => /never offer it/.test(n)), "…and is not told it is orphaned", r.notes);

      // It must go in the ARCHETYPE's block, which is what the designer reads.
      const at = text.indexOf("\tnova_upg_tank = {");
      let d = 0, close = -1;
      for (let i = text.indexOf("{", at); i < text.length; i++) {
        if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (!d) { close = i; break; } }
      }
      ok(at !== -1 && close !== -1 && text.slice(at, close).includes("nova_armor_upgrade"),
        "…inside the archetype's own block, not loose in the file");
    }

    console.log("\n-- ⭐ a second upgrade joins the block rather than replacing it --");
    {
      const r = await mkUpgrade("nova_speed_upgrade", ["nova_upg_tank"]);
      ok(r && r.ok === true, "the second upgrade saves", r && r.error);
      const text = fs.readFileSync(path.join(eqDir(), fam.file), "utf8");
      ok(/nova_armor_upgrade/.test(text), "the first is still there — this is a splice, not a rebuild");
      ok(/nova_speed_upgrade/.test(text), "…and the second was added");
      ok((text.match(/upgrades\s*=\s*\{/g) || []).length === 1, "…in ONE upgrades block, not two",
        (text.match(/upgrades\s*=\s*\{/g) || []).length);
    }

    console.log("\n-- ⭐ CONTROL: attaching the same one twice does not duplicate it --");
    {
      const before = fs.readFileSync(path.join(eqDir(), fam.file), "utf8");
      const r = await mkUpgrade("nova_armor_upgrade", ["nova_upg_tank"]);
      ok(r && r.ok === true, "re-saving is fine", r && r.error);
      const after = fs.readFileSync(path.join(eqDir(), fam.file), "utf8");
      ok((after.match(/nova_armor_upgrade/g) || []).length === 1, "…and the id appears exactly once",
        (after.match(/nova_armor_upgrade/g) || []).length);
      ok(after === before, "…and the equipment file was not rewritten at all", { changed: after !== before });
    }

    console.log("\n-- ⭐ CONTROL: base-game equipment is refused, with the reason --");
    {
      // Writing a mod file named infantry.txt would replace the WHOLE vanilla file. The skip must say that,
      // not fail silently.
      const r = await mkUpgrade("nova_vanilla_upgrade", ["infantry_equipment"]);
      ok(r && r.ok === true, "the upgrade itself is still written", r && r.error);
      ok(!(r.attachedTo || []).includes("infantry_equipment"), "…but vanilla equipment is not touched", r.attachedTo);
      const why = ((r.attachSkipped || [])[0] || {}).why || "";
      ok(/base-game/.test(why), "…and the skip says it is base-game equipment", r.attachSkipped);
      ok(/replaces the whole vanilla file/.test(why), "…and why that matters", why);
      ok(!fs.existsSync(path.join(eqDir(), "infantry.txt")), "…and no infantry.txt was materialised into the mod");
    }

    console.log("\n-- an id that does not exist is reported, not invented --");
    {
      const r = await mkUpgrade("nova_ghost_upgrade", ["no_such_equipment_at_all"]);
      ok((r.attachSkipped || []).some((s) => /no equipment with that id/.test(s.why)),
        "the unknown id is named in the skips", r.attachSkipped);
    }

    console.log("\n-- ⭐ CONTROL: the file HOI4 has to read is still valid --");
    {
      const text = fs.readFileSync(path.join(eqDir(), fam.file), "utf8");
      const clean = text.replace(/#.*$/gm, "");
      ok((clean.match(/\{/g) || []).length === (clean.match(/\}/g) || []).length,
        "the equipment file is brace-balanced after four attach passes");
      // …and the catalogue still parses it, which is the reader HOI4's behaviour is being modelled on.
      const list = await (await fetch(`http://127.0.0.1:${PORT}/api/equipment/list?modPath=${encodeURIComponent(mod)}`)).json();
      const ids = ((list && list.equipment) || []).map((e) => e && e.id);
      ok(ids.includes("nova_upg_tank"), "…and the archetype still reads back", ids.filter((x) => /nova_upg/.test(x)));
      ok(ids.includes("nova_upg_tank_0") && ids.includes("nova_upg_tank_1"), "…with both its tiers");
    }

    console.log("\n-- the help text no longer claims the missing half is handled --");
    {
      const APP = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
      ok(!/Assigning levels to a specific variant is done in the designer \/ arsenal, which already supports it\./.test(APP),
        "the old claim is gone — you cannot set a level on an upgrade the equipment does not declare");
      ok(/only offers an upgrade on a design if the equipment itself lists it/.test(APP),
        "…and the help says what actually makes an upgrade appear");
      ok(/attachTo: d\.attachTo \|\| \[\]/.test(APP), "the editor sends the chosen equipment");
      ok(/function renderUpgradeAttachList\(/.test(APP), "…and has somewhere to choose it");
      ok(/e\.isMod/.test(APP), "…offering only the mod's own equipment");
      ok(!/onclick=|onerror=/.test(APP), "…without an inline handler, which the CSP kills silently");
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    try { srv.kill(); } catch (_) {}
    setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
    process.exitCode = fail ? 1 : 0;
    setTimeout(() => process.exit(fail ? 1 : 0), 1200);
  }
})();
