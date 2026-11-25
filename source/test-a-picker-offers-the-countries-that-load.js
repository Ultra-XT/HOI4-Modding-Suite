// ⛔ #a-picker-offers-the-countries-that-load (tool campaign B2-4, the data half).
//
// The map's country pickers were built from colors.txt's keys: on a vanilla add-on they offered the 50 dynamic civil-war tags D01..D50
// (declared after `dynamic_tags = yes` in zz_dynamic_countries.txt) and hid 108 of the 364 real countries that load, and a state painted to
// D01 passed every rule. The owner's decision (Q7): every picker is built from the countries that load minus the tags declared after the
// marker. This pins the data the page builds them from and the rule that reports land given to a dynamic tag:
//   1. countryTagSectionsThatLoad splits the tags that load at the marker, in the order the game reads the files;
//   2. buildMapModel answers loadedTags and dynamicTags (the route spreads the model, so /api/map/model carries both);
//   3. a state the mod gives to a dynamic tag is state_owned_by_dynamic_tag: an error, not in the fatal set, naming a Map-tool step;
//   4. on the installed base game (when present): exactly D01..D50 are dynamic, and every one of them loads.
// Run: node test-a-picker-offers-the-countries-that-load.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const state = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} add_core_of = ${owner} }\n}\n`;
const made = [];
try {
  console.log("=== 1. the tags that load, split at the dynamic marker ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dynamic-tags-"));
  made.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="DT"\nreplace_path="history/states"\nreplace_path="common/country_tags"\n');
  mk(path.join(mod, "common", "country_tags", "00_countries.txt"), 'AAA = "countries/A.txt"\nBBB = "countries/B.txt"\n# CCC = "countries/C.txt"\n');
  mk(path.join(mod, "common", "country_tags", "zz_dynamic_countries.txt"), 'EEE = "countries/E.txt"\ndynamic_tags = yes # after this: civil wars\nD01 = "countries/D01.txt"\nD02 = "countries/D02.txt"\nBBB = "countries/B.txt"\n');
  mk(path.join(mod, "common", "country_tags", "zzz_late.txt"), 'D03 = "countries/D03.txt"\n');
  const sec = md.countryTagSectionsThatLoad({ modRoot: mod });
  ok("loaded holds every declared tag (comments masked)", sec.loaded && ["AAA", "BBB", "EEE", "D01", "D02", "D03"].every((t) => sec.loaded.has(t)) && !sec.loaded.has("CCC"), sec.loaded && [...sec.loaded]);
  ok("dynamic holds the tags after the marker line, in its file and in later files", ["D01", "D02", "D03"].every((t) => sec.dynamic.has(t)), [...sec.dynamic]);
  ok("…not the tags before the marker in the marker's own file", !sec.dynamic.has("EEE"), [...sec.dynamic]);
  ok("…and not a tag also declared before the marker", !sec.dynamic.has("BBB"), [...sec.dynamic]);

  console.log("=== 2. buildMapModel answers loadedTags and dynamicTags ===");
  mk(path.join(mod, "history", "states", "1-S1.txt"), state(1, "AAA", "1"));
  mk(path.join(mod, "history", "states", "2-S2.txt"), state(2, "D01", "2"));
  const model = md.buildMapModel({ modRoot: mod });
  ok("loadedTags is the sorted list of what loads", Array.isArray(model.loadedTags) && JSON.stringify(model.loadedTags) === JSON.stringify(["AAA", "BBB", "D01", "D02", "D03", "EEE"]), model.loadedTags);
  ok("dynamicTags is the sorted list of the dynamic ones", JSON.stringify(model.dynamicTags) === JSON.stringify(["D01", "D02", "D03"]), model.dynamicTags);

  console.log("=== 3. land given to a dynamic tag is reported, as an error Save does not stop for ===");
  const ps = md.validateMapModel(model);
  const hit = ps.find((p) => p.rule === "state_owned_by_dynamic_tag");
  ok("state_owned_by_dynamic_tag names state 2 and D01", hit && hit.items.some((i) => i.stateId === 2 && i.tag === "D01") && !hit.items.some((i) => i.stateId === 1), hit);
  ok("…severity error, and not in the fatal set (no launch has shown what the game does)", hit && hit.severity === "error" && !labels.isFatalRule(hit.rule), hit && hit.severity);
  ok("…its message names a Map-tool step", hit && /🖌 Paint/.test(hit.message) && /state panel/.test(hit.message), hit && hit.message);
  ok("…and it has a label and a fix hint", !!labels.LABELS.state_owned_by_dynamic_tag && labels.mapRuleFixHint("state_owned_by_dynamic_tag").length > 15);
  fs.writeFileSync(path.join(mod, "history", "states", "2-S2.txt"), state(2, "BBB", "2"));
  ok("a state given to a real country is not reported", !md.validateMapModel(md.buildMapModel({ modRoot: mod })).some((p) => p.rule === "state_owned_by_dynamic_tag"));

  console.log("=== 4. the installed base game: D01..D50 and nothing else ===");
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (fs.existsSync(path.join(GAME, "common", "country_tags"))) {
    const v = md.countryTagSectionsThatLoad({ modRoot: GAME, gameRoot: GAME });
    // 📊 measured 2026-11-19 on the installed 1.19.5.0: 439 tags load, 75 of them dynamic (D01..D75); colors.txt colours D01..D50 only
    const dynList = [...v.dynamic].sort();
    const want = Array.from({ length: 50 }, (_, i) => "D" + String(i + 1).padStart(2, "0"));
    ok("the base game's dynamic tags are D01, D02, … only — and include every D01..D50 colors.txt offered", dynList.every((t) => /^D\d\d$/.test(t)) && want.every((t) => v.dynamic.has(t)), dynList.slice(0, 80));
    ok("…every one of them loads, and the real countries are the rest", dynList.every((t) => v.loaded.has(t)) && v.loaded.size - v.dynamic.size > 300, { loaded: v.loaded.size, dynamic: v.dynamic.size });
  } else console.log("  SKIP the base game is not installed at " + GAME);
  console.log(`\ntest-a-picker-offers-the-countries-that-load: ${pass} checks passed`);
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp fixture of this test's own */ } }
}
