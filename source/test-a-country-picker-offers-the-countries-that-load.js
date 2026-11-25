// ⛔ #a-picker-offers-the-countries-that-load — EVERY COUNTRY PICKER IS THE COUNTRIES THE GAME LOADS, LESS THE DYNAMIC ONES (the owner's Q7;
// tool campaign B2-4).
//
// 🖌 Paint's picker (and so the bulk bar's Assign and the state panel's Owner, which are built from it) and the Countries… receiver were
// colors.txt's keys. On a fresh vanilla add-on that offered the 50 civil-war tags D01-D50, declared after `dynamic_tags = yes` in
// zz_dynamic_countries.txt — land painted to one is a country with no history, no capital and no flag at game start, and no rule said so —
// and hid 108 of the 364 real countries the game loads (ALG, BOS, BRD …), which no Map tool could reach. buildMapModel answers both sets
// (`loadedTags`: countryTagsThatLoad; `dynamicTags`: the tags declared after the marker); the page's one function, pickerCountryTags,
// builds every picker from them, keeping "On the map now". A model without them (a server from before) keeps the old pool.
//
// Runs the page's own pickerCountryTags (lifted from public/map.js), on hand-made models of both shapes and on the installed base game.
// Binds no port. Run: node test-a-country-picker-offers-the-countries-that-load.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-picker-tags-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const { lift } = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const ctx = { Array, Set, String, Object, console };
vm.createContext(ctx);
vm.runInContext(lift("function pickerCountryTags("), ctx);
const pick = (m) => JSON.parse(JSON.stringify(ctx.pickerCountryTags(m)));

console.log("\n-- ⭐⭐⭐ with the two sets: the countries that load, no dynamic tag, owners first --");
{
  const m = {
    states: [{ owner: "FRA" }, { owner: "D01" }, { owner: "FRA" }, { owner: "" }],
    countryColors: { FRA: [1, 2, 3], ENG: [1, 2, 3], D01: [1, 2, 3], D02: [1, 2, 3], OLD: [1, 2, 3] },
    loadedTags: ["FRA", "ENG", "GER", "BOS", "D01", "D02"], dynamicTags: ["D01", "D02"],
  };
  const r = pick(m);
  ok(JSON.stringify(r.owners) === '["FRA"]', "\"On the map now\": the owners that load, a dynamic owner left out", r.owners);
  ok(JSON.stringify(r.others) === '["BOS","ENG","GER"]', "…every other: what loads, less the dynamic tags; BOS and GER offered though colors.txt lacks them; OLD (colors.txt only) not", r.others);
  ok(r.loaded === true, "…from the game's own list", r);
}

console.log("\n-- a model from before the two sets: the old pool (colors.txt's keys), so the page still works --");
{
  const r = pick({ states: [{ owner: "FRA" }], countryColors: { FRA: [1, 2, 3], ENG: [1, 2, 3], D01: [1, 2, 3] } });
  ok(JSON.stringify(r.owners) === '["FRA"]' && JSON.stringify(r.others) === '["D01","ENG"]' && r.loaded === false, "owners, then colors.txt's other keys, as before", r);
  const r2 = pick({ states: [{ owner: "FRA" }], countryColors: { FRA: [1, 2, 3], ENG: [1, 2, 3], D01: [1, 2, 3] }, dynamicTags: ["D01"] });
  ok(JSON.stringify(r2.others) === '["ENG"]', "…and the dynamic set alone still keeps D01 out", r2);
}

console.log("\n-- ⭐⭐ the installed base game: no D01-D50 offered, and none of the real countries that load is hidden --");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (!fs.existsSync(path.join(GAME, "common", "country_tags"))) {
    console.log("  ..   (the base game is not installed: this section cannot run)");
  } else {
    const md = require("./map-data.js");
    const mod = path.join(ROOT, "addon"); fs.mkdirSync(mod, { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="addon"\n');
    const loads = [...md.countryTagsThatLoad({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] })];
    const tagsIn = (f) => [...fs.readFileSync(f, "utf8").replace(/#[^\n]*/g, "").matchAll(/(?:^|[^A-Za-z0-9_])([A-Za-z0-9]{2,4})\s*=\s*"/g)].map((x) => x[1].toUpperCase());
    const dyn = tagsIn(path.join(GAME, "common", "country_tags", "zz_dynamic_countries.txt"));
    const colors = {};
    for (const x of fs.readFileSync(path.join(GAME, "common", "countries", "colors.txt"), "utf8").matchAll(/^([A-Z0-9]{3})\s*=/gm)) colors[x[1]] = [0, 0, 0];
    const r = pick({ states: [{ owner: "FRA" }, { owner: "ENG" }], countryColors: colors, loadedTags: loads, dynamicTags: dyn });
    const offered = new Set(r.owners.concat(r.others));
    const dynOffered = dyn.filter((t) => offered.has(t));
    const hidden = loads.filter((t) => !dyn.includes(t) && !offered.has(t));
    ok(dyn.length >= 50 && dynOffered.length === 0, `none of the ${dyn.length} dynamic tags is offered`, dynOffered.slice(0, 5));
    ok(hidden.length === 0 && offered.size === loads.length - dyn.length, `all ${loads.length - dyn.length} real countries that load are offered (none hidden)`, { hidden: hidden.slice(0, 12), offered: offered.size });
    // CONTROL: the old pool, colors.txt's keys, hides some and offers the dynamic ones — what this replaced
    const old = pick({ states: [{ owner: "FRA" }], countryColors: colors });
    const oldSet = new Set(old.owners.concat(old.others));
    ok(dyn.some((t) => oldSet.has(t)) && loads.some((t) => !dyn.includes(t) && !oldSet.has(t)), "CONTROL: colors.txt's keys offer dynamic tags and hide real ones", { dyn: dyn.filter((t) => oldSet.has(t)).length, hidden: loads.filter((t) => !dyn.includes(t) && !oldSet.has(t)).length });
  }
}

console.log("\n-- every picker is built by the one function --");
{
  const code = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
  const loadStart = code.indexOf("async function load("), loadBody = code.slice(loadStart, code.indexOf("\n  }\n", loadStart));
  ok(/pickerCountryTags\(m\)/.test(loadBody) && /countrySelect\.innerHTML\s*=/.test(loadBody), "load() builds 🖌 Paint's picker from it");
  ok(!/Object\.keys\(m\.countryColors/.test(loadBody), "…and no longer from colors.txt's keys");
  const pop = code.slice(code.indexOf("function populateOwnerSelect("), code.indexOf("function populateOwnerSelect(") + 400);
  ok(/countrySelect\.options/.test(pop), "the state panel's Owner is built from that picker's options");
  const cc = code.slice(code.indexOf("function openCountriesModal("), code.indexOf("function openCountriesModal(") + 3000);
  ok(/pickerCountryTags\(model\)/.test(cc) && !/Object\.keys\(model\.countryColors/.test(cc), "the Countries… receiver is built from it too");
  ok((code.match(/function pickerCountryTags\(/g) || []).length === 1, "one definition");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
