// A new country must be granted a starting technology that exists in the game it is made for, once.
// #new-country-tech-from-an-unloaded-file  +  #wizard-grants-infantry-weapons-twice
//
// 1. findBasicInfantryTech (map-data.js) collected every infantry-enabling technology from EVERY root into one
//    list and sorted it globally by (prerequisites, start_year, id). Root priority was lost, and so was the half
//    of the overlay rule that needs no descriptor line: HOI4 replaces a common/ file WHOLESALE when a
//    higher-priority mod ships one at the same relative path. So a technology defined in a file the game never
//    loads could win.
//
//    Measured on Novum Vexillum (workshop 1827273767), a shipping map that launches: it ships 16 files in
//    common/technologies whose basenames cover all 13 of vanilla's, and declares no replace_path for the folder.
//    The game therefore loads 625 technologies, all NV's own, and `infantry_weapons` is not among them — its
//    infantry tech is `infantry_weapons1` (start_year 1980). 341 of NV's 343 country histories grant
//    infantry_weapons1 and 0 grant infantry_weapons. Yet findBasicInfantryTech([NV, vanilla]) answered
//    `infantry_weapons`: vanilla's copy (1918) sorted ahead of NV's (1980). All three country creators pass
//    exactly that list for NV, so every country made there started with a technology that does not exist —
//    i.e. with none, and the `infantry` battalion is `active = no` until a technology enables it.
//
// 2. The onboarding wizard (/api/mod/create-template) interpolated the DISCOVERED set_technology and then, 18
//    lines further down the same template literal, a second hardcoded `set_technology = { infantry_weapons = 1 }`.
//    On an Old World Blues add-on that is the right `standard_weaponry_tech` AND a dead `infantry_weapons` —
//    OWB declares replace_path = "common/technologies" and loads 1,089 techs, none of that name.
//
// The fixture below is Novum Vexillum's shape, built from the base game's own file list: a base mod that ships a
// file under every basename vanilla ships in common/technologies, with no replace_path, and an add-on on top.
// Every creator is driven over HTTP with the body its client sends.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cc-tech-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const { createApp } = require("./server.js");
const md = require("./map-data.js");

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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const NV = "D:/SteamLibrary/steamapps/workshop/content/394360/1827273767";
const HAVE_GAME = fs.existsSync(path.join(GAME, "common", "technologies")) && fs.existsSync(path.join(GAME, "history", "states"));
const toPosix = (p) => p.split(path.sep).join("/");
const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c, "utf8"); };
const techFile = (id, year, prereq) =>
  `technologies = {\n\t${id} = {\n${prereq ? `\t\tprerequisites = { ${prereq} }\n` : ""}\t\tenable_subunits = {\n\t\t\tinfantry\n\t\t}\n\t\tstart_year = ${year}\n\t\tresearch_cost = 1\n\t}\n}\n`;

// The top-level statements of a script file, comments masked, each with its block body.
function topLevel(text) {
  const t = String(text || "").replace(/#[^\n]*/g, "");
  const out = [];
  let depth = 0, m;
  const re = /([A-Za-z0-9_.\-]+)\s*=\s*(\{)?|\{|\}/g;
  while ((m = re.exec(t)) !== null) {
    if (m[0] === "{") { depth++; continue; }
    if (m[0] === "}") { depth--; continue; }
    if (depth === 0) {
      let body = "";
      if (m[2]) {
        const open = m.index + m[0].length - 1;
        let d = 0, close = -1;
        for (let i = open; i < t.length; i++) {
          if (t[i] === "{") d++;
          else if (t[i] === "}") { d--; if (!d) { close = i; break; } }
        }
        body = close > open ? t.slice(open + 1, close) : "";
      }
      out.push({ key: m[1], body });
    }
    if (m[2]) depth++;
  }
  return out;
}
const histOf = (mod, tag) => {
  const d = path.join(mod, "history", "countries");
  try {
    const f = fs.readdirSync(d).find((x) => x.toUpperCase().startsWith(tag + " "));
    return f ? fs.readFileSync(path.join(d, f), "utf8") : "";
  } catch (_) { return ""; }
};
const techBlocks = (h) => topLevel(h).filter((s) => s.key === "set_technology");
const techIds = (h) => techBlocks(h).flatMap((s) => [...s.body.matchAll(/([A-Za-z_][A-Za-z0-9_.\-]*)\s*=\s*1\b/g)].map((x) => x[1]));

const PORT = 54117;
const post = (p, b) => fetch(`http://127.0.0.1:${PORT}${p}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  .catch((e) => ({ status: 0, body: { error: String(e) } }));

(async () => {
  let srv = null;
  try {
    console.log("\n1. The overlay rule, on files the test controls");
    {
      const game = path.join(ROOT, "u-game");
      w(path.join(game, "common", "technologies", "infantry.txt"), techFile("old_rifles", 1918));

      const shadow = path.join(ROOT, "u-shadow");
      w(path.join(shadow, "common", "technologies", "infantry.txt"), techFile("new_rifles1", 1980));
      const got = md.findBasicInfantryTech([shadow, game]);
      rec("⭐⭐⭐ a mod file with the SAME basename replaces the base file, so its tech is the only candidate",
        got === "new_rifles1", got);

      // CONTROL — the rule is basename shadowing, not "the highest root that has any answer wins". A mod that
      // ADDS a file loads alongside the base game's, and the most basic of the two still wins.
      const adder = path.join(ROOT, "u-adder");
      w(path.join(adder, "common", "technologies", "zz_more_rifles.txt"), techFile("new_rifles1", 1980));
      const both = md.findBasicInfantryTech([adder, game]);
      rec("⭐⭐ …while a mod file with a NEW basename loads beside it, and the most basic of the two still wins",
        both === "old_rifles", both);

      // CONTROL — a prerequisite still ranks after none, across roots.
      const later = path.join(ROOT, "u-later");
      w(path.join(later, "common", "technologies", "zz_early.txt"), techFile("early_but_gated", 1900, "old_rifles"));
      const gated = md.findBasicInfantryTech([later, game]);
      rec("…and a tech with prerequisites still ranks after one without", gated === "old_rifles", gated);
      rec("nothing that enables infantry still answers null", md.findBasicInfantryTech([path.join(ROOT, "u-none")]) === null);
    }

    console.log("\n2. [ground truth] Novum Vexillum");
    if (HAVE_GAME && fs.existsSync(path.join(NV, "common", "technologies"))) {
      const vFiles = fs.readdirSync(path.join(GAME, "common", "technologies")).filter((f) => /\.txt$/i.test(f)).map((f) => f.toLowerCase());
      const nFiles = new Set(fs.readdirSync(path.join(NV, "common", "technologies")).filter((f) => /\.txt$/i.test(f)).map((f) => f.toLowerCase()));
      const shadowed = vFiles.filter((f) => nFiles.has(f));
      console.log(`     NV ships ${nFiles.size} technology files; ${shadowed.length} of vanilla's ${vFiles.length} basenames are among them`);
      const desc = fs.readFileSync(path.join(NV, "descriptor.mod"), "utf8");
      rec("NV declares no replace_path for common/technologies", !/replace_path\s*=\s*"common\/technologies"/.test(desc));
      rec("…and replaces every vanilla technology file by basename instead", shadowed.length === vFiles.length, { shadowed: shadowed.length, vanilla: vFiles.length });
      const got = md.findBasicInfantryTech([NV, GAME]);
      const nvText = fs.readdirSync(path.join(NV, "common", "technologies")).filter((f) => /\.txt$/i.test(f))
        .map((f) => fs.readFileSync(path.join(NV, "common", "technologies", f), "utf8").replace(/#[^\n]*/g, "")).join("\n");
      const definedInNv = !!got && new RegExp(`(^|\\s)${got}\\s*=\\s*\\{`).test(nvText);
      console.log(`     findBasicInfantryTech([NV, vanilla]) = ${got}`);
      rec("⭐⭐⭐ the tech a country there is granted is one NV defines", definedInNv, got);
      rec("…and not vanilla's, whose file NV replaced", got !== md.findBasicInfantryTech([GAME]), got);
    } else console.log("     (Novum Vexillum or the base game is not installed — skipped)");

    if (!HAVE_GAME) {
      console.log("\n  (the base game is not installed — the creators cannot be driven)");
    } else {
      // The base mod: Novum Vexillum's shape, from vanilla's own file list.
      const BASE_NAME = `NovaCCTechBase${process.pid}`; // workshop mods are matched by name first — keep it unique
      const base = path.join(ROOT, "ccbase");
      w(path.join(base, "descriptor.mod"), `name="${BASE_NAME}"\nsupported_version="1.19.*"\n`);
      w(path.join(ROOT, "ccbase.mod"), `name="${BASE_NAME}"\npath="${toPosix(base)}"\nsupported_version="1.19.*"\n`);
      const vanillaTechFiles = fs.readdirSync(path.join(GAME, "common", "technologies")).filter((f) => /\.txt$/i.test(f));
      const vanillaAnswer = md.findBasicInfantryTech([GAME]);
      const vanillaHome = vanillaTechFiles.find((f) =>
        new RegExp(`(^|\\s)${vanillaAnswer}\\s*=\\s*\\{`).test(fs.readFileSync(path.join(GAME, "common", "technologies", f), "utf8"))) || vanillaTechFiles[0];
      for (const f of vanillaTechFiles) {
        w(path.join(base, "common", "technologies", f), f === vanillaHome ? techFile("ccb_rifles1", 1980) : "technologies = {\n}\n");
      }
      console.log(`     base mod shadows all ${vanillaTechFiles.length} vanilla technology files; its infantry tech sits in ${vanillaHome}`);
      const mkAddon = (name) => {
        const dir = path.join(ROOT, name);
        w(path.join(dir, "descriptor.mod"), `name="${name}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
        w(path.join(ROOT, `${name}.mod`), `name="${name}"\npath="${toPosix(dir)}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
        fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
        return dir;
      };
      const capital = (() => {
        const f = fs.readdirSync(path.join(GAME, "history", "states")).map((x) => /^(\d+)-/.exec(x)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b);
        return f[0];
      })();

      srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

      console.log("\n3. The Map's New country, on an add-on");
      {
        const mod = mkAddon("cc-map");
        // exactly what public/map.js submitNewCountry sends
        const r = await post("/api/map/create-country", { modPath: mod, tag: "ZQA", name: "Mapland", rgb: [10, 20, 30], stateIds: [capital], capitalStateId: capital });
        rec("the country is created", r.body && r.body.ok === true, r.body);
        const h = histOf(mod, "ZQA");
        rec("⭐⭐⭐ it is granted the base mod's infantry tech, the only one that game loads", techIds(h).join() === "ccb_rifles1", techIds(h));
        rec("…in exactly one set_technology block", techBlocks(h).length === 1, techBlocks(h).length);
      }

      console.log("\n4. Country Setup's Create country, on an add-on");
      {
        const mod = mkAddon("cc-setup");
        // exactly what public/country-setup.js sends
        const r = await post("/api/countries/create", { modPath: mod, tag: "ZQB", name: "Setupland", color: "10 20 30", graphicalCulture: "western_european_gfx", capitalStateId: capital });
        rec("the country is created", r.body && r.body.ok === true, r.body);
        const h = histOf(mod, "ZQB");
        rec("⭐⭐⭐ it is granted the base mod's infantry tech", techIds(h).join() === "ccb_rifles1", techIds(h));
        rec("…in exactly one set_technology block", techBlocks(h).length === 1, techBlocks(h).length);
      }

      console.log("\n5. The onboarding wizard, making an add-on");
      {
        // exactly what public/app.js sends for the add-on template
        const r = await post("/api/mod/create-template", { modName: "CC Wizard Tech", countryName: "Wizardia", countryTag: "ZQW", capitalStateId: capital, color: "120 10 50", dependencies: [BASE_NAME] });
        rec("the starter mod is created", r.body && r.body.ok === true, r.body);
        const mod = r.body && r.body.modRoot;
        const h = mod ? histOf(mod, "ZQW") : "";
        rec("⭐⭐⭐ the history carries exactly ONE set_technology block", techBlocks(h).length === 1, techBlocks(h).map((b) => b.body.trim()));
        rec("⭐⭐⭐ …naming only the base mod's infantry tech", techIds(h).join() === "ccb_rifles1", techIds(h));
        rec("…and not vanilla's, which that game never loads", !techIds(h).includes(vanillaAnswer), techIds(h));
      }

      console.log("\n6. CONTROL — a standalone starter mod on the base game still gets the base game's tech, once");
      {
        const r = await post("/api/mod/create-template", { modName: "CC Wizard Vanilla", countryName: "Plainia", countryTag: "ZQV", capitalStateId: capital, color: "120 10 50", dependencies: [] });
        rec("the starter mod is created", r.body && r.body.ok === true, r.body);
        const h = r.body && r.body.modRoot ? histOf(r.body.modRoot, "ZQV") : "";
        rec("…granted vanilla's infantry tech", techIds(h).join() === vanillaAnswer, techIds(h));
        rec("…once", techBlocks(h).length === 1, techBlocks(h).length);
      }
    }

    console.log(`\n=== a new country is granted a technology its game loads: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
