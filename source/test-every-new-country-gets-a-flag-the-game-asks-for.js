// Every country creator must leave a flag under a name the game will actually ask for.
// #new-country-flag-named-for-vanilla-ideologies  +  #only-one-creator-writes-a-flag
//
// HOI4 looks a country's flag up as gfx/flags/<TAG>_<ruling ideology>.tga and, failing that, the bare
// gfx/flags/<TAG>.tga. The owner's own launch log says so:
//   [flagtextureatlas.cpp:510]: Error loading flag for country NVA : Ideology neutrality : Path gfx/flags/ : File not found
//
// 1. writePlaceholderCountryFlags (server.js) named its placeholders for a HARDCODED list — communism,
//    democratic, fascism, neutrality — and wrote the bare <TAG>.tga only into small/. The same create call had
//    just discovered the mod's ideologies with findIdeologies. Measured over the corpus: Old World Blues gives a
//    created country ruling_party = people, Novum Vexillum islamist; neither declares any of vanilla's four. So on
//    2 of the 6 shipping maps the Map's New country wrote 13 .tga files and not one of them answered the name
//    the game requests at main or medium size. Of OWB's 344 tags that name a ruling party, 342 have a bare
//    main-size gfx/flags/<TAG>.tga and only 5 a file named for that party, and 130 of its 354 tags carry nothing
//    at main size but the bare file — the engine's fallback, which the wiki's Country creation page documents
//    as the backup for a missing ideology flag. 0 of OWB's 1,021 or NV's 1,512 main-size flag files is named
//    for a vanilla ideology.
//
// 2. That writer had exactly one caller, /api/map/create-country. /api/countries/create (Country Setup) and
//    /api/mod/create-template (the onboarding wizard) register the tag, the definition and the history and
//    write no flag at all — a shape 3 of the 2,428 non-dynamic tags across the six shipping maps have. Mod
//    Health reports it afterwards (country_no_flag, no fix); the Map path fills it and these two did not.
//
// Fixtures: an add-on over a base mod shipping its own ideologies under vanilla's basename (Old World Blues'
// shape), and a plain mod over the base game as the control. Every creator is driven with its client's body.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cc-flag-"));
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
const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
const HAVE_GAME = fs.existsSync(path.join(GAME, "common", "ideologies")) && fs.existsSync(path.join(GAME, "history", "states"));
const toPosix = (p) => p.split(path.sep).join("/");
const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c, "utf8"); };
// Vanilla's flag sizes, read from its own files rather than typed in: main, medium/, small/.
const SIZES = ["", "medium", "small"];

const PORT = 54163;
const post = (p, b) => fetch(`http://127.0.0.1:${PORT}${p}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  .catch((e) => ({ status: 0, body: { error: String(e) } }));

const tgaSize = (abs) => {
  try { const b = fs.readFileSync(abs); return b.length > 18 && b.readUInt8(2) === 2 ? [b.readUInt16LE(12), b.readUInt16LE(14)] : null; } catch (_) { return null; }
};

(async () => {
  let srv = null;
  try {
    if (!HAVE_GAME) {
      console.log("  (the base game is not installed — skipped)");
      return;
    }
    const vanilla = md.findIdeologies([GAME]);
    const vanillaSize = {};
    for (const sub of SIZES) {
      const dir = path.join(GAME, "gfx", "flags", sub);
      const lux = fs.existsSync(path.join(dir, "LUX_neutrality.tga")) ? path.join(dir, "LUX_neutrality.tga") : null;
      vanillaSize[sub] = lux ? tgaSize(lux) : null;
    }
    console.log(`     vanilla flag sizes (from LUX): ${JSON.stringify(vanillaSize)}`);

    console.log("\n1. [ground truth] the engine falls back to the bare <TAG>.tga, and total conversions name flags for their own ideologies");
    if (fs.existsSync(path.join(OWB, "gfx", "flags"))) {
      const names = fs.readdirSync(path.join(OWB, "gfx", "flags")).filter((f) => /\.tga$/i.test(f));
      const bare = names.filter((f) => /^[A-Z][A-Z0-9]{2}\.tga$/.test(f)).length;
      const vanillaNamed = names.filter((f) => vanilla.some((i) => f.toLowerCase().endsWith(`_${i}.tga`))).length;
      const owbIdeo = md.findIdeologies([OWB, GAME]);
      console.log(`     Old World Blues main-size flags: ${names.length}; bare <TAG>.tga: ${bare}; named for a vanilla ideology: ${vanillaNamed}; its ideologies: ${owbIdeo.join(", ")}`);
      rec("Old World Blues names no main-size flag for a vanilla ideology", vanillaNamed === 0, vanillaNamed);
      rec("…and ships the bare <TAG>.tga for hundreds of tags", bare > 300, bare);
    } else console.log("     (Old World Blues not installed)");

    const BASE_NAME = `NovaCCFlagBase${process.pid}`; // workshop mods are matched by name first — keep it unique
    const base = path.join(ROOT, "ccbase");
    w(path.join(base, "descriptor.mod"), `name="${BASE_NAME}"\nsupported_version="1.19.*"\n`);
    w(path.join(ROOT, "ccbase.mod"), `name="${BASE_NAME}"\npath="${toPosix(base)}"\nsupported_version="1.19.*"\n`);
    fs.readdirSync(path.join(GAME, "common", "ideologies")).filter((f) => /\.txt$/i.test(f)).forEach((f, i) =>
      w(path.join(base, "common", "ideologies", f), i === 0
        ? "ideologies = {\n\tpeople = {\n\t\ttypes = {\n\t\t\tpeople_subtype = {\n\t\t\t}\n\t\t}\n\t}\n\truler = {\n\t\ttypes = {\n\t\t\truler_subtype = {\n\t\t\t}\n\t\t}\n\t}\n}\n"
        : "ideologies = {\n}\n"));
    const mkAddon = (name) => {
      const dir = path.join(ROOT, name);
      w(path.join(dir, "descriptor.mod"), `name="${name}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
      w(path.join(ROOT, `${name}.mod`), `name="${name}"\npath="${toPosix(dir)}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
      fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
      return dir;
    };
    const addonIdeologies = md.findIdeologies([mkAddon("cc-probe"), base, GAME]);
    rec("the base mod's game loads its own ideologies, none of vanilla's", addonIdeologies.length > 0 && !addonIdeologies.some((i) => vanilla.includes(i)), addonIdeologies);
    const capital = fs.readdirSync(path.join(GAME, "history", "states")).map((x) => /^(\d+)-/.exec(x)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b)[0];

    // The flag set a created country must have for the game it is in.
    const judge = (label, mod, tag, ideologies, rgb) => {
      const F = path.join(mod, "gfx", "flags");
      for (const sub of SIZES) {
        const dir = path.join(F, sub);
        const where = sub || "main";
        const missing = ideologies.filter((i) => !fs.existsSync(path.join(dir, `${tag}_${i}.tga`)));
        rec(`⭐⭐⭐ ${label}: a ${where}-size flag for every ideology the game loads`, missing.length === 0, { missing, has: fs.existsSync(dir) ? fs.readdirSync(dir) : "(no folder)" });
        rec(`⭐⭐ ${label}: …and the bare ${tag}.tga at ${where} size, the name the engine falls back to`, fs.existsSync(path.join(dir, `${tag}.tga`)), fs.existsSync(dir) ? fs.readdirSync(dir) : "(no folder)");
        const dead = vanilla.filter((i) => !ideologies.includes(i) && fs.existsSync(path.join(dir, `${tag}_${i}.tga`)));
        rec(`${label}: …and no ${where}-size flag named for an ideology that game does not have`, dead.length === 0, dead);
        const sz = tgaSize(path.join(dir, `${tag}.tga`));
        if (vanillaSize[sub]) rec(`${label}: …at vanilla's ${where} size ${vanillaSize[sub].join("x")}`, !!sz && sz[0] === vanillaSize[sub][0] && sz[1] === vanillaSize[sub][1], sz);
      }
      if (rgb) {
        let px = null;
        try { px = [...fs.readFileSync(path.join(F, `${tag}.tga`)).slice(18, 21)]; } catch (_) {}
        rec(`${label}: …painted in the country's own colour`, !!px && px[0] === rgb[2] && px[1] === rgb[1] && px[2] === rgb[0], px);
      }
    };

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("\n2. On an add-on over a total conversion, all three creators");
    {
      const mapMod = mkAddon("cc-map");
      const r1 = await post("/api/map/create-country", { modPath: mapMod, tag: "ZQA", name: "Mapland", rgb: [12, 200, 90], stateIds: [capital], capitalStateId: capital });
      rec("the Map's creator creates the country", r1.body && r1.body.ok === true, r1.body);
      judge("Map", mapMod, "ZQA", addonIdeologies, [12, 200, 90]);

      const setupMod = mkAddon("cc-setup");
      const r2 = await post("/api/countries/create", { modPath: setupMod, tag: "ZQB", name: "Setupland", color: "40 50 60", graphicalCulture: "western_european_gfx", capitalStateId: capital });
      rec("Country Setup creates the country", r2.body && r2.body.ok === true, r2.body);
      judge("Country Setup", setupMod, "ZQB", addonIdeologies, [40, 50, 60]);

      const r3 = await post("/api/mod/create-template", { modName: "CC Wizard Flag", countryName: "Wizardia", countryTag: "ZQW", capitalStateId: capital, color: "120 10 50", dependencies: [BASE_NAME] });
      rec("the wizard creates the starter mod", r3.body && r3.body.ok === true, r3.body);
      if (r3.body && r3.body.modRoot) judge("Wizard", r3.body.modRoot, "ZQW", addonIdeologies, [120, 10, 50]);
    }

    console.log("\n3. CONTROL — on the base game the flags are named for vanilla's ideologies, as before");
    {
      const plain = path.join(ROOT, "cc-plain");
      w(path.join(plain, "descriptor.mod"), 'name="cc-plain"\nsupported_version="1.19.*"\n');
      fs.mkdirSync(path.join(plain, "history", "states"), { recursive: true });
      const r1 = await post("/api/countries/create", { modPath: plain, tag: "ZQE", name: "Plainland", color: "1 2 3", graphicalCulture: "western_european_gfx", capitalStateId: capital });
      rec("Country Setup creates the country", r1.body && r1.body.ok === true, r1.body);
      judge("Country Setup (base game)", plain, "ZQE", vanilla, [1, 2, 3]);

      // ⚠️ never overwrite: a flag the modder already has survives a create that names the same file
      const victim = path.join(plain, "gfx", "flags", "ZQF.tga");
      w(victim, "THE AUTHOR'S OWN FLAG");
      const r2 = await post("/api/countries/create", { modPath: plain, tag: "ZQF", name: "Keepland", color: "1 2 3", graphicalCulture: "western_european_gfx", capitalStateId: capital });
      rec("a second country is created", r2.body && r2.body.ok === true, r2.body);
      rec("⚠️⚠️ …and an existing flag file is never overwritten", fs.readFileSync(victim, "utf8") === "THE AUTHOR'S OWN FLAG", fs.readFileSync(victim, "utf8").slice(0, 40));
    }

    console.log(`\n=== every new country gets a flag the game asks for: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
