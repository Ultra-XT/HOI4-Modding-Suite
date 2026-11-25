// Four defects across the equipment-family and variant endpoints.
//
//  #7  chassis-new defaulted build_cost_ic and reliability only when baseStats was COMPLETELY empty. A chassis
//      TIER is the buildable entity and the archetype carries no stats, so supplying any ONE other stat
//      (armor_value, maximum_speed) produced equipment that costs nothing to build and never breaks down.
//      Every real modular tier resolves both through the archetype chain: 51/51 vanilla, 79/79 MD.
//  #27 An equipment `type` outside an 8-item whitelist was silently rewritten to fighter/infantry, so the
//      modder got a different game object than they asked for. `type` is an engine enum; counted directly in
//      common/units/equipment, the whitelist was missing rocket, flame, amphibious, train and railway_gun
//      (land) and interceptor, heavy_fighter, maritime_patrol_plane and air_transport (air) — all real.
//  #40 The response's `file` echoed the REQUESTED filename, not the one written. sanitizeModFileName may add
//      .txt, strip characters or fall back entirely, so Nova told the user their equipment was in a file that
//      does not exist.
//  #41 A delete that removed NOTHING still wrote, and writeCountryVariants creates the country's history file
//      when the mod has none — copying a whole vanilla country file into the mod, which shadows and freezes
//      that country in game.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqfam-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "eqmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EqMod"\nsupported_version="1.18.*"\n', "utf8");

const EQDIR = path.join(MOD, "common", "units", "equipment");
const eqFiles = () => { try { return fs.readdirSync(EQDIR).filter((f) => f.endsWith(".txt")); } catch (_) { return []; } };
const readEq = (f) => { try { return fs.readFileSync(path.join(EQDIR, f), "utf8"); } catch (_) { return ""; } };
const allEq = () => eqFiles().map(readEq).join("\n");

const PORT = 42439;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[#7 chassis defaults] one supplied stat must not remove cost and reliability");
    let r = await post("/api/equipment/chassis-new", {
      modPath: MOD, id: "nova_tank_chassis", domain: "land", type: "armor",
      baseStats: { armor_value: 30 },   // one stat, and NOT one of the two defaults
      slots: [{ name: "main_armament_slot", required: false, categories: ["tank_main_gun"] }],
    });
    rec("the chassis was created", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    let txt = allEq();
    rec("the supplied stat is present", /armor_value\s*=\s*30/.test(txt), txt.slice(0, 600));
    rec("build_cost_ic was still defaulted", /build_cost_ic\s*=\s*5/.test(txt), txt.slice(0, 600));
    rec("reliability was still defaulted", /reliability\s*=\s*0\.8/.test(txt), txt.slice(0, 600));

    console.log("\n[#7 control] an explicitly supplied value must NOT be overwritten by the default");
    r = await post("/api/equipment/chassis-new", {
      modPath: MOD, id: "nova_cheap_chassis", domain: "land", type: "armor",
      baseStats: { build_cost_ic: 12, reliability: 0.5 },
      slots: [{ name: "main_armament_slot", required: false, categories: ["tank_main_gun"] }],
    });
    txt = allEq();
    rec("the supplied build_cost_ic stands", /build_cost_ic\s*=\s*12/.test(txt), txt.slice(-800));
    rec("the supplied reliability stands", /reliability\s*=\s*0\.5/.test(txt), txt.slice(-800));

    console.log("\n[#27 real types] a real type must be written, not coerced");
    for (const [id, domain, type] of [
      ["nova_rocket_eq", "land", "rocket"],
      ["nova_flame_eq", "land", "flame"],
      ["nova_interceptor_eq", "air", "interceptor"],
      ["nova_hfighter_eq", "air", "heavy_fighter"],
    ]) {
      r = await post("/api/equipment/family", { modPath: MOD, id, domain, type });
      const ok = r.status === 200 && r.body && r.body.ok !== false;
      const written = allEq();
      rec(`${type} was accepted and written as ${type}`,
        ok && new RegExp(`type\\s*=\\s*${type}\\b`).test(written), { body: r.body, found: new RegExp(`type\\s*=\\s*${type}\\b`).test(written) });
    }
    rec("…and none of them was rewritten to infantry/fighter",
      !/nova_rocket_eq[\s\S]{0,400}?type\s*=\s*infantry/.test(allEq()), "coerced");

    console.log("\n[#27 refusal] an unrecognised type is refused, not silently changed");
    r = await post("/api/equipment/family", { modPath: MOD, id: "nova_bogus_eq", domain: "land", type: "not_a_real_type" });
    rec("the request was refused", r.body && r.body.ok === false, r.body);
    rec("…and the error lists the real types", !!(r.body && /infantry/.test(String(r.body.error || ""))), r.body && r.body.error);
    rec("nothing was written for it", !/nova_bogus_eq/.test(allEq()), "it was written anyway");

    console.log("\n[#27 control] an OMITTED type still takes the domain default");
    r = await post("/api/equipment/family", { modPath: MOD, id: "nova_default_eq", domain: "air" });
    rec("an omitted type is accepted", r.status === 200 && r.body && r.body.ok !== false, r.body);
    rec("…and defaults to fighter", /nova_default_eq[\s\S]{0,400}?type\s*=\s*fighter/.test(allEq()), "no default applied");

    console.log("\n[#40 response fidelity] `file` must name the file actually written");
    r = await post("/api/equipment/family", { modPath: MOD, id: "nova_named_eq", domain: "land", type: "infantry", fileName: "my_guns" });
    rec("the family was created", r.status === 200 && r.body && r.body.ok !== false, r.body);
    rec("the reported file actually exists on disk",
      !!(r.body && r.body.file && eqFiles().includes(r.body.file)), { reported: r.body && r.body.file, onDisk: eqFiles() });
    rec("…and it is the sanitised name, not the raw request", r.body && r.body.file !== "my_guns", r.body && r.body.file);

    console.log("\n[#41 no-op delete] deleting a variant that isn't there must not fork a country file");
    // GER exists in vanilla but NOT in this mod. The bug: the delete created (and reformatted) a mod copy.
    const histDir = path.join(MOD, "history", "countries");
    const before = fs.readdirSync(histDir);
    r = await post("/api/equipment/variant/delete", { modPath: MOD, tag: "GER", name: "A Variant That Does Not Exist" });
    rec("the delete answered ok", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and reported it removed nothing", r.body && r.body.removed === 0, r.body);
    rec("NO country history file was created", fs.readdirSync(histDir).length === before.length,
      { before, after: fs.readdirSync(histDir) });
    rec("…specifically not a GER fork", !fs.readdirSync(histDir).some((f) => /^GER/i.test(f)), fs.readdirSync(histDir));

    console.log("\n[#41 control] a delete that DOES remove something still writes");
    // Without this the guard could be "never write", which would break deleting entirely.
    // NO `if (setup worked)` guard here on purpose. A skipped control reads as a pass, and this control is
    // the only thing standing between the #41 fix and "never write anything" — which would satisfy every
    // other check in this section. If the setup breaks, this must go RED, not quiet.
    // The chassis created at the top of this test yields the buildable tier `nova_tank_chassis_1`.
    const saveRes = await post("/api/equipment/variant/save", {
      modPath: MOD, tag: "NVA", name: "Nova Test Variant", chassisType: "nova_tank_chassis_1",
      // The maker requires a no-DLC fallback so players without the DLC still get a working variant.
      fallbackType: "infantry_equipment_1",
    });
    rec("(setup) the variant save succeeded", saveRes.status === 200 && saveRes.body && saveRes.body.ok !== false,
      saveRes.body || saveRes.status);
    rec("(setup) the save created the country file",
      fs.readdirSync(histDir).some((f) => /^NVA/i.test(f)), fs.readdirSync(histDir));

    r = await post("/api/equipment/variant/delete", { modPath: MOD, tag: "NVA", name: "Nova Test Variant" });
    rec("the real delete succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body);
    rec("…and reported it removed something", r.body && r.body.removed !== 0, r.body);
    const nvaFile = fs.readdirSync(histDir).find((f) => /^NVA/i.test(f));
    const nvaTxt = nvaFile ? fs.readFileSync(path.join(histDir, nvaFile), "utf8") : "";
    rec("…and the variant is gone from the file", !!nvaFile && !/Nova Test Variant/.test(nvaTxt), nvaTxt.slice(0, 400));

    console.log(`\n=== equipment family defaults: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
