// #replace-path — THE EFFECT AND TRIGGER PICKERS OFFERED 2,459 SCRIPTED NAMES A TOTAL CONVERSION DROPS.
//
// /api/scripted-effects and /api/scripted-triggers resolve every `<name> = { … }` in common/scripted_effects
// and common/scripted_triggers so Genesis, the focus editor and the decision editor can offer them by name.
// Both merged vanilla's unconditionally.
//
// Millennium Dawn declares `replace_path = "common/scripted_effects"` AND
// `replace_path = "common/scripted_triggers"`, and ships its own. Measured: 1,535 vanilla effects and 924
// vanilla triggers were offered to a mod that loads none of them. Calling one writes a name HOI4 does not
// define — it logs the miss and skips the statement, so the focus reward or decision quietly does nothing.
//
// The other half must not change: an ordinary overlay mod DOES load vanilla's, and both pickers would be
// empty without them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-screp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VROOT = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MDROOT = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const HAVE_VANILLA = fs.existsSync(path.join(VROOT, "common", "scripted_effects"));

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

function mkMod(name, replacePaths) {
  const dir = path.join(ROOT, name);
  for (const sub of ["scripted_effects", "scripted_triggers"]) fs.mkdirSync(path.join(dir, "common", sub), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n` + (replacePaths || []).map((p) => `replace_path = "${p}"\n`).join(""), "utf8");
  fs.writeFileSync(path.join(dir, "common", "scripted_effects", "own.txt"),
    `${name}_own_effect = {\n\tadd_political_power = 10\n}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "common", "scripted_triggers", "own.txt"),
    `${name}_own_trigger = {\n\thas_war = yes\n}\n`, "utf8");
  return dir;
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-se-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43911;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  const api = await serve(createApp());
  const names = (a, ep, key, dir) => a.get(`${ep}?modPath=${encodeURIComponent(dir)}`)
    .then((c) => Object.keys(((c.b || {})[key]) || {}));
  try {
    console.log("\n[ground truth] Millennium Dawn replaces both scripted folders");
    if (!HAVE_VANILLA || !fs.existsSync(path.join(MDROOT, "descriptor.mod"))) console.log("  (skipped — corpora not installed)");
    else {
      const desc = fs.readFileSync(path.join(MDROOT, "descriptor.mod"), "utf8");
      rec("MD replace_path's common/scripted_effects", /replace_path\s*=\s*"common\/scripted_effects"/.test(desc), "not found");
      rec("…and common/scripted_triggers", /replace_path\s*=\s*"common\/scripted_triggers"/.test(desc), "not found");
    }

    if (!HAVE_VANILLA) console.log("\n(vanilla not installed — the behaviour sections need vanilla scripts to hide)");
    else {
      console.log("\n[control] a mod that does NOT replace them still sees every vanilla script");
      const plain = mkMod("plain", []);
      let eff = await names(api, "/api/scripted-effects", "effects", plain);
      let trg = await names(api, "/api/scripted-triggers", "triggers", plain);
      rec("vanilla's scripted effects are offered", eff.length > 1000, eff.length);
      rec("vanilla's scripted triggers are offered", trg.length > 500, trg.length);
      rec("…alongside the mod's own effect", eff.includes("plain_own_effect"), eff.slice(0, 6));
      rec("…and the mod's own trigger", trg.includes("plain_own_trigger"), trg.slice(0, 6));
      const vanillaEffects = eff.filter((n) => n !== "plain_own_effect");
      const vanillaTriggers = trg.filter((n) => n !== "plain_own_trigger");

      console.log("\n[the bug] a mod that replaces them loads none of vanilla's");
      const rp = mkMod("rp", ["common/scripted_effects", "common/scripted_triggers"]);
      eff = await names(api, "/api/scripted-effects", "effects", rp);
      trg = await names(api, "/api/scripted-triggers", "triggers", rp);
      rec("not one vanilla effect is offered", eff.filter((n) => vanillaEffects.includes(n)).length === 0,
        eff.filter((n) => vanillaEffects.includes(n)).slice(0, 6));
      rec("not one vanilla trigger is offered", trg.filter((n) => vanillaTriggers.includes(n)).length === 0,
        trg.filter((n) => vanillaTriggers.includes(n)).slice(0, 6));
      rec("…and the mod's own effect still is", eff.includes("rp_own_effect"), eff);
      rec("…and the mod's own trigger still is", trg.includes("rp_own_trigger"), trg);

      console.log("\n[control] replacing ONE folder does not silence the other — replace_path is per folder");
      const half = mkMod("half", ["common/scripted_effects"]);
      eff = await names(api, "/api/scripted-effects", "effects", half);
      trg = await names(api, "/api/scripted-triggers", "triggers", half);
      rec("effects are hidden", eff.filter((n) => vanillaEffects.includes(n)).length === 0, eff.length);
      rec("…and triggers are NOT", trg.filter((n) => vanillaTriggers.includes(n)).length > 500, trg.length);

      console.log("\n[back-out] scan vanilla unconditionally again");
      const built = controlApp("skipvanilla", [
        ["      if (!skipVanillaEffects) Object.assign(merged, scanScriptedEffectsInRoot(gameRoot));          // vanilla",
          "      Object.assign(merged, scanScriptedEffectsInRoot(gameRoot));          // vanilla"],
        ["      if (!skipVanillaTriggers) Object.assign(merged, scanScriptedTriggersInRoot(gameRoot));          // vanilla",
          "      Object.assign(merged, scanScriptedTriggersInRoot(gameRoot));          // vanilla"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const e2 = await names(capi, "/api/scripted-effects", "effects", rp);
          const t2 = await names(capi, "/api/scripted-triggers", "triggers", rp);
          rec("…and vanilla's effects come back for a mod that replaces the folder",
            e2.filter((n) => vanillaEffects.includes(n)).length > 1000, e2.length);
          rec("…and vanilla's triggers too", t2.filter((n) => vanillaTriggers.includes(n)).length > 500, t2.length);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== scripted effects/triggers replace_path: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.rmSync(p, { force: true }); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
