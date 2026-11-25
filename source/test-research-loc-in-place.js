// A tech's localisation must be updated WHERE THE KEY ALREADY LIVES (#loc-update-in-place).
//
// Nova used to append every tech name to its own localisation/english/custom_technologies_l_english.yml,
// no matter where the key was already defined. HOI4 keeps the FIRST definition it loads, and files load
// alphabetically — so for a mod whose own file sorts before "custom_*" (Millennium Dawn's do), the
// rename was written to a file the game never reads. The editor showed the new name, the game showed
// the old one, and the mod quietly grew a second definition of every key the user touched.
//
// Three rules are pinned here:
//   1. saving a tech whose name did NOT change writes nothing at all;
//   2. a changed name is rewritten IN the file that already holds the key — no duplicate elsewhere;
//   3. a genuinely new key, defined nowhere, goes to Nova's own fallback file.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locplace-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="LocPlace"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });
fs.writeFileSync(path.join(tdir, "probe.txt"), [
  "technologies = {",
  "\tzz_named = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  "}",
  "",
].join("\n"));

const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
// named so it sorts BEFORE custom_* — exactly the situation that hid the rename in-game
const OWN = path.join(locDir, "AA_mod_techs_l_english.yml");
const FALLBACK = path.join(locDir, "custom_technologies_l_english.yml");
fs.writeFileSync(OWN, '﻿l_english:\n zz_named:0 "Authored Name"\n', "utf8");

const readOwn = () => fs.readFileSync(OWN, "utf8");
const readFallback = () => (fs.existsSync(FALLBACK) ? fs.readFileSync(FALLBACK, "utf8") : "");

const PORT = 39572, app = createApp();
const server = app.listen(PORT, async () => {
  const call = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const saveTech = (t, extra) => call("/api/technologies/save-batch", Object.assign({
    technologies: [t], equipments: {}, customTabs: [], modPath: mod,
    countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
  }, extra || {}));
  try {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const tech = (cat.technologies || []).find((t) => t.id === "zz_named");
    ok("catalog reads the name from the mod's own loc file", tech && tech.name === "Authored Name", tech && tech.name);
    if (!tech) throw new Error("tech not in catalog");

    // 1. an unchanged name must not rewrite anything
    const before = readOwn();
    const r1 = await saveTech(tech);
    ok("save with an unchanged name → 200", r1.s === 200, r1.b);
    ok("unchanged name leaves the mod's loc file byte-identical", readOwn() === before);
    ok("unchanged name does not create the fallback file", !fs.existsSync(FALLBACK));

    // 2. a changed name is rewritten where the key lives
    const r2 = await saveTech(Object.assign({}, tech, { name: "Renamed In Place" }));
    ok("rename → 200", r2.s === 200, r2.b);
    ok("the mod's OWN file now carries the new name", /zz_named:0 "Renamed In Place"/.test(readOwn()), readOwn());
    ok("the old value is gone from the own file", !/"Authored Name"/.test(readOwn()));
    ok("only ONE definition of the key in the own file", (readOwn().match(/^\s*zz_named:/gm) || []).length === 1);
    ok("no duplicate key written to the fallback file", !/^\s*zz_named:/m.test(readFallback()), readFallback());
    ok("the own file keeps its BOM + l_english header", /^﻿l_english:/.test(readOwn()));

    // 3. a key defined nowhere goes to Nova's fallback file
    const fresh = Object.assign({}, tech, { id: "zz_fresh", name: "Fresh Tech", x: 1, y: 1 });
    const r3 = await saveTech(fresh, { newTechIds: ["zz_fresh"] });
    ok("new tech → 200", r3.s === 200, r3.b);
    ok("a brand-new key lands in the fallback file", /zz_fresh:0 "Fresh Tech"/.test(readFallback()), readFallback());
    ok("a brand-new key does NOT get appended to the mod's own file", !/^\s*zz_fresh:/m.test(readOwn()));

    console.log(`\ntest-research-loc-in-place: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
