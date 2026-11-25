// #new-country-has-no-technologies — A COUNTRY THAT CANNOT FIELD INFANTRY.
//
// Every country Nova created got `set_research_slots = 3` and no `set_technology` at all. In HOI4 the
// `infantry` battalion is declared `active = no` in common/units/infantry.txt and is switched on by a
// technology's `enable_subunits = { infantry }`. So a country with no technologies cannot put a single
// infantry battalion in a division template — the designer greys it out, and no order of battle Nova writes
// for that country will spawn a unit.
//
// 🈯 GROUND TRUTH: all 364 of vanilla's country history files declare set_technology (median 3 techs), and
// 311 of them include `infantry_weapons` — the most common starting technology in the game. A country with
// none is a shape vanilla never ships.
//
// ⚠️ THE ID IS DISCOVERED, NEVER HARDCODED, AND replace_path DECIDES WHERE TO LOOK. `infantry_weapons`
// exists in vanilla, Millennium Dawn and The Road to 56 — and NOT in Old World Blues, which enables the same
// subunit through `standard_weaponry_tech`. Worse, OWB declares replace_path = "common/technologies", so
// searching [OWB, vanilla] finds vanilla's copy of a technology the game does not load and writes a dead id
// into the country's history. Measured both ways below, because that is the trap.
//
// All three creators — the new-mod wizard, Country Setup and the Map — write their own history block, and
// this is exactly the kind of thing one of them adopts and the others do not.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stech-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const mapData = require("./map-data.js");

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
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const OWB = path.join(WS, "2265420196");
const MD = path.join(WS, "2777392649");
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + ++seq);
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="S' + seq + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="S' + seq + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}
const histOf = (mod, tag) => {
  const d = path.join(mod, "history", "countries");
  try {
    const f = fs.readdirSync(d).find((x) => x.startsWith(tag));
    return f ? fs.readFileSync(path.join(d, f), "utf8") : "";
  } catch (_) { return ""; }
};
const techsIn = (t) => {
  const m = /set_technology\s*=\s*\{([^}]*)\}/.exec(t);
  return m ? [...m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*1/g)].map((x) => x[1]) : [];
};

let PORT = 50860;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] the game gates infantry behind a technology, and every country has one");
    {
      const inf = path.join(GAME, "common", "units", "infantry.txt");
      if (fs.existsSync(inf)) {
        const t = fs.readFileSync(inf, "latin1");
        const blk = /(?:^|\n)\tinfantry\s*=\s*\{[\s\S]{0,400}/.exec(t);
        rec("the infantry battalion is inactive until a tech enables it",
          !!blk && /active\s*=\s*no/.test(blk[0]), blk && blk[0].slice(0, 120));
      } else console.log("     (no HOI4 install — skipped)");
      const hc = path.join(GAME, "history", "countries");
      if (fs.existsSync(hc)) {
        let n = 0, withTech = 0;
        for (const f of fs.readdirSync(hc)) {
          if (!f.endsWith(".txt")) continue;
          n++;
          if (/set_technology\s*=\s*\{/.test(fs.readFileSync(path.join(hc, f), "latin1").replace(/#.*$/gm, ""))) withTech++;
        }
        console.log(`     vanilla: ${withTech} of ${n} country histories declare set_technology`);
        rec("every vanilla country starts with technologies", n > 300 && withTech === n, { n, withTech });
      }
    }

    console.log("\n[⚠️ THE DISCOVERY] the id differs per mod, and replace_path decides where to look");
    {
      rec("vanilla resolves to infantry_weapons",
        mapData.findBasicInfantryTech([GAME]) === "infantry_weapons", mapData.findBasicInfantryTech([GAME]));
      if (fs.existsSync(MD)) {
        // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn, and the fresh copy has no `infantry` subunit
        // at all — its line infantry is `L_Inf_Bat`, declared `active = yes` — so no technology it ships enables
        // one; vanilla's `infantry_weapons` lives in vanilla's infantry.txt, which MD REPLACES by shipping the same
        // basename. The right answer moved from `infantry_weapons` to null, and "Millennium Dawn keeps
        // infantry_weapons" failed while the helper was correct. The expectation is now read off the files the game
        // loads for [MD, vanilla]: a technology enabling `infantry` in one of MD's files or in a vanilla file MD does
        // not replace, else nothing — and never one that only a replaced vanilla file declares.
        const techFiles = (root) => {
          try { return fs.readdirSync(path.join(root, "common", "technologies")).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; }
        };
        // Technologies (depth 1 inside `technologies = {`, by brace depth) whose own enable_subunits names `infantry`.
        const infantryEnablers = (root, f) => {
          let t = "";
          try { t = fs.readFileSync(path.join(root, "common", "technologies", f), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { return []; }
          const out = [];
          const re = /([A-Za-z0-9_@.\-]+)\s*=\s*\{|\{|\}/g;
          let depth = 0, inTechs = false, techId = null, bodyAt = 0, m;
          while ((m = re.exec(t)) !== null) {
            if (m[0] === "}") {
              depth--;
              if (depth === 1 && techId !== null) {
                const body = t.slice(bodyAt, m.index);
                if ([...body.matchAll(/enable_subunits\s*=\s*\{([^}]*)\}/g)].some((es) => es[1].split(/\s+/).includes("infantry"))) out.push(techId);
                techId = null;
              }
              if (depth <= 0) { depth = 0; inTechs = false; }
              continue;
            }
            if (m[0] !== "{") {
              if (depth === 0) inTechs = m[1] === "technologies";
              else if (depth === 1 && inTechs) { techId = m[1]; bodyAt = m.index + m[0].length; }
            }
            depth++;
          }
          return out;
        };
        const mdNames = new Set(techFiles(MD).map((f) => f.toLowerCase()));
        const loaded = new Set(), replaced = new Set();
        for (const f of techFiles(MD)) infantryEnablers(MD, f).forEach((id) => loaded.add(id));
        for (const f of techFiles(GAME)) {
          const into = mdNames.has(f.toLowerCase()) ? replaced : loaded;
          infantryEnablers(GAME, f).forEach((id) => into.add(id));
        }
        const ans = mapData.findBasicInfantryTech([MD, GAME]);
        console.log(`     MD + vanilla: \`infantry\` is enabled by ${[...loaded].join(", ") || "nothing"} in a loaded file, `
          + `by ${[...replaced].join(", ") || "nothing"} only in a vanilla file MD replaces; the helper answers ${ans}`);
        rec(`Millennium Dawn resolves to a technology its game loads, or to nothing when none enables infantry (${ans})`,
          loaded.size ? loaded.has(ans) : ans === null, { ans, loaded: [...loaded].slice(0, 8) });
        if (replaced.size) {
          rec("…and never to vanilla's copy in a file MD replaces by basename",
            !(replaced.has(ans) && !loaded.has(ans)), { ans, replaced: [...replaced] });
        }
      }
      if (fs.existsSync(OWB)) {
        // OWB declares replace_path = "common/technologies", so vanilla's technologies do not load for it.
        rec("Old World Blues does NOT use infantry_weapons",
          mapData.findBasicInfantryTech([OWB]) === "standard_weaponry_tech", mapData.findBasicInfantryTech([OWB]));
        // …and this is the trap the replace_path-aware root list exists to avoid.
        rec("…while searching it TOGETHER with vanilla finds a tech OWB's game never loads",
          mapData.findBasicInfantryTech([OWB, GAME]) === "infantry_weapons",
          mapData.findBasicInfantryTech([OWB, GAME]));
      }
      rec("no technologies anywhere resolves to nothing, rather than to a guess",
        mapData.findBasicInfantryTech([]) === null, mapData.findBasicInfantryTech([]));
      rec("…and to nothing for a root with no technologies dir",
        mapData.findBasicInfantryTech([ROOT]) === null, mapData.findBasicInfantryTech([ROOT]));
    }

    api = await serve(createApp());
    const states = (() => {
      const dir = path.join(GAME, "history", "states");
      if (!fs.existsSync(dir)) return [];
      const ids = [];
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt")).slice(0, 40)) {
        const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(dir, f), "latin1"));
        if (m) ids.push(Number(m[1]));
        if (ids.length >= 2) break;
      }
      return ids;
    })();

    if (states.length >= 2) {
      console.log("\n[the Map's creator] the country can field infantry");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "STA", name: "Techland", rgb: [10, 20, 30],
          stateIds: states, capitalStateId: states[0],
        });
        rec("the country is created", r.ok === true, r);
        const h = histOf(mod, "STA");
        rec("…its history declares set_technology", /set_technology\s*=\s*\{/.test(h), h.slice(0, 200));
        rec("…granting the tech that enables infantry", techsIn(h).includes("infantry_weapons"), techsIn(h));
        rec("…and the rest of the history is intact", /capital\s*=/.test(h) && /set_politics/.test(h), h.slice(0, 160));
      }

      console.log("\n[Country Setup's creator] the same, so the two routes agree");
      {
        const mod = mkMod();
        const r = await api.post("/api/countries/create", {
          modPath: mod, tag: "STB", name: "Techtwo", capitalStateId: states[0],
          graphicalCulture: "western_european_gfx", color: "10 20 30",
        });
        rec("the country is created", r.ok === true || r.success === true, r.error || r);
        const h = histOf(mod, "STB");
        rec("…its history declares set_technology too", /set_technology\s*=\s*\{/.test(h), h.slice(0, 200));
        rec("…the same tech the Map route grants", techsIn(h).includes("infantry_weapons"), techsIn(h));
      }
    } else console.log("\n  (no HOI4 install — the writing half cannot run)");

    console.log("\n[⚠️ THE replace_path CASE] an add-on over a total conversion must get the BASE's tech");
    if (states.length >= 2) {
      // This is the case that makes the replace_path-aware root list load-bearing. Without it the search
      // walks on into vanilla and grants `infantry_weapons` — a technology the game does not load for this
      // chain at all, i.e. a dead id in the country's history. A fixture with no dependencies cannot tell
      // the two apart, which is exactly what the first version of this test did.
      const BASE = path.join(ROOT, "tcbase");
      fs.mkdirSync(path.join(BASE, "common", "technologies"), { recursive: true });
      fs.writeFileSync(path.join(BASE, "descriptor.mod"),
        'name="TCBase"\nsupported_version="1.19.*"\nreplace_path="common/technologies"\n');
      fs.writeFileSync(path.join(ROOT, "tcbase.mod"),
        'name="TCBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\nreplace_path="common/technologies"\n');
      fs.writeFileSync(path.join(BASE, "common", "technologies", "tc.txt"),
        "technologies = {\n\ttc_basic_rifles = {\n\t\tstart_year = 1930\n\t\tenable_subunits = {\n\t\t\tinfantry\n\t\t}\n\t\tresearch_cost = 1\n\t}\n}\n");

      const ADDON = path.join(ROOT, "tcaddon");
      fs.mkdirSync(path.join(ADDON, "history", "states"), { recursive: true });
      fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
        'name="TCAddon"\ndependencies={\n\t"TCBase"\n}\nsupported_version="1.19.*"\n');
      fs.writeFileSync(path.join(ROOT, "tcaddon.mod"),
        'name="TCAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"TCBase"\n}\nsupported_version="1.19.*"\n');

      const r = await api.post("/api/map/create-country", {
        modPath: ADDON, tag: "STD", name: "Convert", rgb: [7, 7, 7],
        stateIds: states, capitalStateId: states[0],
      });
      rec("the country is created", r.ok === true, r);
      const h = histOf(ADDON, "STD");
      rec("…granted the BASE MOD's infantry tech", techsIn(h).includes("tc_basic_rifles"), techsIn(h));
      rec("…and NOT vanilla's, which this chain does not load",
        !techsIn(h).includes("infantry_weapons"), techsIn(h));
    }

    console.log("\n[CONTROL — a mod with no technologies at all] writes no set_technology rather than a dead id");
    {
      // A country history naming a technology the game does not load is worse than one naming none: the
      // former is an error in the log, the latter is merely a country that has to research from scratch.
      const mod = mkMod();
      const r = await api.post("/api/map/create-country", {
        modPath: mod, tag: "STC", name: "Nothing", rgb: [1, 2, 3],
        stateIds: states.length ? states : [1], capitalStateId: states.length ? states[0] : 1,
      });
      const h = histOf(mod, "STC");
      // With vanilla installed this DOES resolve, so the assertion is on the helper's contract instead.
      rec("the helper returns null when nothing enables infantry",
        mapData.findBasicInfantryTech([mod]) === null, mapData.findBasicInfantryTech([mod]));
      rec("…and a history is still written either way", h.length > 0 || r.ok !== true, h.slice(0, 80));
    }

    api.stop(); api = null;
    console.log(`\n=== new country starting tech: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
