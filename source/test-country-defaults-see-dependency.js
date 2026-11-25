// #country-defaults-skip-dependencies — COUNTRY SETUP QUOTED VANILLA'S DEFAULTS AT A TOTAL-CONVERSION MOD.
//
// The stat boxes (stability, war support, research slots) show a country's EFFECTIVE starting value, because
// almost no country scripts them — of Millennium Dawn's 399, only one or two call set_stability. The value
// comes from the DEFINES, and resolveCountryStatDefaults asked the mod, then the base game, and stopped.
//
// An add-on's DEPENDENCY sits between those two, and that is exactly where a total conversion keeps its
// defines. Measured on the installed corpus:
//
//   DEFAULT_STABILITY     vanilla 0.5  · Millennium Dawn 0.65
//   BASE_RESEARCH_SLOTS   vanilla 2    · The Road to 56  3
//
// So an add-on over MD had every country's stability box reading 50% when the game starts them at 65%, and
// an add-on over R56 showed two research slots where the game gives three — wrong for every country in the
// mod, on the boxes the page exists to explain.
//
// ⚠️ getActiveRoots returns [game, …deps, mod] in LOAD order, LOWEST priority first. The fix has to reverse
// it: the highest layer that defines a key wins. Iterating it forwards would let the game root answer first
// and the mod's own override would be the thing never read — the same defect pointing the other way, which
// the two directional controls below are here to catch.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cdef-"));
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
const mkMod = (name, deps, defines) => {
  const M = path.join(ROOT, name);
  fs.mkdirSync(path.join(M, "common", "defines"), { recursive: true });
  fs.mkdirSync(path.join(M, "common", "country_tags"), { recursive: true });
  fs.mkdirSync(path.join(M, "common", "countries"), { recursive: true });
  fs.mkdirSync(path.join(M, "history", "countries"), { recursive: true });
  const depBlock = deps && deps.length ? `dependencies={\n${deps.map((d) => `\t"${d}"`).join("\n")}\n}\n` : "";
  fs.writeFileSync(path.join(M, "descriptor.mod"), `name="${name}"\n${depBlock}supported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(ROOT, name + ".mod"), `name="${name}"\npath="${toPosix(M)}"\n${depBlock}supported_version="1.19.*"\n`);
  if (defines) fs.writeFileSync(path.join(M, "common", "defines", "zz_nova_defines.lua"), defines);
  fs.writeFileSync(path.join(M, "common", "country_tags", "zz_nova.txt"), 'CDF = "countries/Cdf.txt"\n');
  fs.writeFileSync(path.join(M, "common", "countries", "Cdf.txt"), "graphical_culture = western_european_gfx\n");
  fs.writeFileSync(path.join(M, "history", "countries", "CDF - Cdf.txt"), "capital = 1\n");
  return M;
};

// A base mod that raises the defaults, the way Millennium Dawn and The Road to 56 do.
const BASE = mkMod("CdfBase", null,
  "NDefines = {\n\tNCountry = {\n\t\tDEFAULT_STABILITY = 0.65,\t\t-- a total conversion's own footing\n\t\tBASE_RESEARCH_SLOTS = 3,\n\t},\n}\n");
// An add-on over it that overrides NOTHING — so every value must come from the layer below.
const ADDON = mkMod("CdfAddon", ["CdfBase"], null);
// …and one that overrides stability itself, to prove the mod still outranks its dependency.
const OVERRIDE = mkMod("CdfOverride", ["CdfBase"],
  "NDefines = {\n\tNCountry = {\n\t\tDEFAULT_STABILITY = 0.9,\n\t},\n}\n");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const PORT = 53045;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const details = async (root) => fetch(`http://127.0.0.1:${PORT}/api/history/country-details?modPath=${encodeURIComponent(root)}&tag=CDF`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const defs = (j) => (j && (j.defaults || j.statDefaults)) || {};

    console.log("\n[CONTROL] vanilla's own defaults, so the fixture has a baseline to differ from");
    {
      const j = await details(GAME);
      const d = defs(j);
      console.log(`     vanilla: stability=${d.stability} warSupport=${d.warSupport} researchSlots=${d.researchSlots}`);
      rec("the endpoint reports defaults at all", d && d.stability != null, j && Object.keys(j).slice(0, 8));
      rec("vanilla stability is 0.5", Number(d.stability) === 0.5, d.stability);
      rec("…and vanilla gives 2 research slots", Number(d.researchSlots) === 2, d.researchSlots);
      // Anchor on the real file, so a future HOI4 patch changes this test rather than sliding past it.
      let lua = ""; try { lua = fs.readFileSync(path.join(GAME, "common", "defines", "00_defines.lua"), "utf8"); } catch (_) {}
      const m = /DEFAULT_STABILITY\s*=\s*(-?[\d.]+)/.exec(lua.replace(/--.*$/gm, ""));
      rec("…because that is what vanilla's 00_defines.lua declares", m && Number(m[1]) === 0.5, m && m[1]);
    }

    console.log("\n[the defect] an add-on must inherit its DEPENDENCY's defines");
    {
      const d = defs(await details(ADDON));
      console.log(`     add-on over CdfBase: stability=${d.stability} researchSlots=${d.researchSlots}`);
      // THE BUG: both came back as vanilla's, because the dependency layer was never consulted.
      rec("the base mod's stability is used", Number(d.stability) === 0.65, d.stability);
      rec("…and its research-slot count", Number(d.researchSlots) === 3, d.researchSlots);
      // …while a key NOBODY overrides still falls through to the game.
      rec("…and an unoverridden key still comes from vanilla", Number(d.warSupport) === 0.5, d.warSupport);
    }

    console.log("\n[⭐ THE OTHER DIRECTION] the mod itself must still outrank its dependency");
    {
      // getActiveRoots hands back [game, …deps, mod], lowest priority FIRST. Walking it forwards would fix
      // the case above and break this one — the game would answer before the mod ever got asked.
      const d = defs(await details(OVERRIDE));
      console.log(`     add-on that overrides: stability=${d.stability} researchSlots=${d.researchSlots}`);
      rec("the mod's own override wins over the base mod's", Number(d.stability) === 0.9, d.stability);
      rec("…while the base mod still supplies what the mod does not set", Number(d.researchSlots) === 3, d.researchSlots);
    }

    console.log("\n[the corpus] the real mods this was misreporting");
    {
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const rows = [];
      try {
        for (const d of fs.readdirSync(WS)) {
          let nm = ""; try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
          let stab = null, slots = null;
          try {
            for (const f of fs.readdirSync(path.join(WS, d, "common", "defines"))) {
              const t = fs.readFileSync(path.join(WS, d, "common", "defines", f), "latin1").replace(/--.*$/gm, "");
              const a = /DEFAULT_STABILITY\s*=\s*(-?[\d.]+)/.exec(t); if (a) stab = Number(a[1]);
              const b = /BASE_RESEARCH_SLOTS\s*=\s*(-?[\d.]+)/.exec(t); if (b) slots = Number(b[1]);
            }
          } catch (_) {}
          if (stab != null || slots != null) rows.push(`${nm.slice(0, 24)} stability=${stab} slots=${slots}`);
        }
      } catch (_) {}
      rows.forEach((r) => console.log("     " + r));
      if (rows.length) {
        rec("at least one installed base mod differs from vanilla",
          rows.some((r) => /stability=0\.65|slots=3/.test(r)), rows);
      } else {
        rec("no base mods installed to compare against", true, "skipped");
      }
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== country defaults see dependency: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
