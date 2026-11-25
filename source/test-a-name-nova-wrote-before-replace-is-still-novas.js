// ⭐ #a-name-nova-writes-must-win — A WORLD NAMED BEFORE NOVA'S NAMES MOVED INTO replace/ IS STILL NOVA'S.
//
// Nova's own names used to live beside the mod's other localisation: localisation/english/nova_state_names_l_english.yml and
// localisation/<lang>/nova_region_names_l_<lang>.yml. A generated world's keys are the base game's own (STATE_1..N,
// VICTORY_POINTS_<province>), and one key in two files has no defined winner, so they moved into localisation/<lang>/replace/
// (review of 8855b02). A world written before keeps its old files, and the Redraw must still read them as Nova's:
//   · a state named in the OLD state-names file is one Nova named, so its land region takes its name (novaNamedStateIds);
//   · a region name a modder typed into the OLD region-names file is theirs, and the Redraw keeps it (regionNamePlan);
//   · a region name Nova wrote there is rewritten into replace/, and its OLD line goes, in every language (writeRegionNames) —
//     otherwise the language carries the key twice, once stale.
// Driven through /api/map/rebuild-regions with the body public/map.js sends ({ modPath, confirm: true }).
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};

// The base game's states stood ELSEWHERE, as a generated world's did (#a-renamed-state-keeps-its-regions-name): in the default
// world its state 1 covers continent A, a state there is no longer new land, the region over A keeps its base key, and the K2
// checks below would pass without the Redraw ever planning K2.
const W = makeRegionWorld("before-replace", { baseLoc: true, baseStates: "elsewhere" });
process.env.HOI4_ROOT = W.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(W.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
const md = require("./map-data.js");
const BOM = String.fromCharCode(0xfeff);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const defines = (p, key) => new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"`, "m").test(read(p));
const valueIn = (p, key) => { const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"(.*)"`, "m").exec(read(p)); return m ? m[1] : null; };
const loc = (lang, ...rest) => path.join(W.MOD, "localisation", lang, ...rest);

const ctx = { modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] };
const model = md.buildMapModel(ctx);
const states = (model.states || []).slice().sort((a, b) => a.id - b.id);
const nameOf = new Map(states.map((s) => [s.name, md.generatedPlaceName(99, s.id)]));
// the regions the Redraw will name, read the way the endpoint plans them: every state named by Nova
const plan = md.rebuildStrategicRegions({ ...ctx, dryRun: true, opts: { nameAfterStates: states.map((s) => s.id) } });
const keys = (plan.regionsNamed || []).map((r) => r.key);
ok(plan.ok && keys.length >= 2, "the Redraw plans at least two region names to write", { error: plan.error, keys });
// A name typed for a NOVA_REGION_<id> key belongs to its region only while that region stays where it was — a key that follows
// its id is Nova's to name again once the id names other ground (#a-kept-name-keeps-its-kind). So the key the modder "typed"
// below is one whose region stays; the other is any other.
const typedOn = (plan.regionsNamed || []).find((r) => r.stays && /^NOVA_REGION_\d+$/.test(r.key));
ok(!!typedOn, "(precondition: a region Nova names NOVA_REGION_<id> stays where it was)", (plan.regionsNamed || []).map((r) => [r.key, r.stays]));
const K2 = typedOn ? typedOn.key : keys[1];
const K1 = keys.find((k) => k !== K2);

// The world as it was written before: Nova's names beside replace/, never in it.
const OLD_STATES = loc("english", "nova_state_names_l_english.yml");
const OLD_EN = loc("english", "nova_region_names_l_english.yml"), OLD_DE = loc("german", "nova_region_names_l_german.yml");
const NEW_EN = loc("english", "replace", "nova_region_names_l_english.yml"), NEW_DE = loc("german", "replace", "nova_region_names_l_german.yml");
fs.mkdirSync(path.dirname(OLD_STATES), { recursive: true });
fs.mkdirSync(path.dirname(OLD_DE), { recursive: true });
fs.writeFileSync(OLD_STATES, `${BOM}l_english:\n` + [...nameOf].map(([k, v]) => ` ${k}:0 "${v}"`).join("\n") + "\n");
fs.writeFileSync(OLD_EN, `${BOM}l_english:\n ${K1}:0 "Old Nova Name"\n ${K2}:0 "Typed By Hand"\n NOVA_UNRELATED_1:0 "Stays"\n`);
fs.writeFileSync(OLD_DE, `${BOM}l_german:\n ${K1}:0 "Old Nova Name"\n NOVA_UNRELATED_1:0 "Stays"\n`);
// what Nova recorded writing: K1 is still what it wrote; K2 the modder has since retyped
const RECORD = md.regionNameRecordPath(W.MOD);
fs.mkdirSync(path.dirname(RECORD), { recursive: true });
fs.writeFileSync(RECORD, JSON.stringify({ [K1]: "Old Nova Name", [K2]: "Nova Gave This" }));

const { createApp } = require("./server.js");
(async () => {
  let server = null;
  try {
    ok(!fs.existsSync(loc("english", "replace")), "precondition: the mod has no replace/ folder yet");
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const w = await fetch(`http://127.0.0.1:${server.address().port}/api/map/rebuild-regions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: W.MOD, confirm: true }) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    ok(w.status === 200 && w.body.ok === true && w.body.regionNames && !w.body.regionNames.error, "the confirmed redraw is written", w.body.error || w.body.regionNames || w.body);

    console.log("\n-- ⭐⭐ the OLD state-names file still says which states Nova named --");
    const values = [...read(NEW_EN).matchAll(/^\s*[A-Za-z0-9_.]+:\d*\s*"(.*)"\s*$/gm)].map((m) => m[1]);
    const stateNames = new Set(nameOf.values());
    ok(!values.some((v) => /^A (North|South)( \d+)?$/.test(v)), "⭐⭐ no region over the new land is named after the old Earth region under it", values);
    ok(values.filter((v) => stateNames.has(v.replace(/ \d+$/, ""))).length >= 2, "⭐⭐ …they carry the names the old file gives their states", values);

    console.log("\n-- ⭐⭐ a region name the modder typed into the OLD file is theirs --");
    ok(w.body.regionNames && w.body.regionNames.kept === 1, `(the Redraw planned ${K2}'s region under ${K2} and kept the one name typed there: regionNames.kept === 1)`, w.body.regionNames);
    ok(valueIn(OLD_EN, K2) === "Typed By Hand", `⭐⭐ ${K2} still reads "Typed By Hand" where they typed it`, read(OLD_EN));
    ok(!defines(NEW_EN, K2) && !defines(NEW_DE, K2), "⭐⭐ …and replace/, which would win over it, does not define it", { en: read(NEW_EN), de: read(NEW_DE) });

    console.log("\n-- ⭐⭐ a region name Nova wrote into the OLD file moves into replace/, in every language --");
    ok(defines(NEW_EN, K1) && defines(NEW_DE, K1) && valueIn(NEW_EN, K1) !== "Old Nova Name", `${K1} is rewritten into replace/ in English and German`, { en: valueIn(NEW_EN, K1), de: valueIn(NEW_DE, K1) });
    ok(!defines(OLD_EN, K1) && !defines(OLD_DE, K1), `⭐⭐ …and its old line is gone from both old files, so no language carries ${K1} twice`, { en: read(OLD_EN), de: read(OLD_DE) });
    ok(read(OLD_DE) === `${BOM}l_german:\n NOVA_UNRELATED_1:0 "Stays"\n`, "⭐ …the old German file keeps its BOM, its header and its other line", read(OLD_DE));
    ok(valueIn(OLD_EN, "NOVA_UNRELATED_1") === "Stays", "⭐ …and a key the Redraw did not name stays in the old English file", read(OLD_EN));
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(W.ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})();
