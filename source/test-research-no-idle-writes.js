// A SAVE MUST NOT WRITE FILES THE USER'S EDITS DO NOT IMPLICATE (#no-country-write-without-edit,
// #no-empty-sidecar).
//
// Opening the research page and pressing Save with NO edits used to modify four files:
//   history/countries/ABK - Abkhazia.txt   (rewritten: blank runs collapsed, its set_technology block
//                                           moved and re-listed with the merged game+mod tech set)
//   editor_custom_tabs.json                (created, containing "[]")
//   editor_tech_icons.json                 (created, containing "{}")
//   editor_equip_icons.json                (created, containing "{}")
//
// That is not hypothetical damage. Exactly that file set, at one timestamp, was found in a user's live
// Novum Vexillum install — ABK is simply the alphabetically first country, so it is the one auto-selected
// on load, and `if (countryTag)` was enough to rewrite it. Nobody had edited anything.
//
// The country write is now gated on the client actually sending a tech list (null = "I did not touch
// this"), and the three sidecars are only written when they have content or already exist.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const client = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// ---- CLIENT: only claim a country edit when one happened ----
ok(/let countryTechsDirty = false;/.test(client), "the client tracks whether starting techs were edited");
ok(/countryTechsDirty = true;/.test(client), "ticking the researched checkbox sets the flag");
ok(/countryTechIds: countryTechsDirty \? Array\.from\(countryResearchedTechs\) : null,/.test(client),
  "the payload sends null when nothing was touched, a list when it was");
ok(/countryTechsDirty = false;\s*\/\/ the country's starting techs are committed/.test(client),
  "the flag resets after a successful save");
// the flag must be set at the mutation, not merely on any dirty edit
// anchor on the MUTATION, not on the element lookup — the id is fetched in two places and only one of
// them is the change handler.
const mi = client.indexOf("countryResearchedTechs.add(selectedTechId)");
ok(mi !== -1, "the researched-set mutation exists");
const cbHandler = client.slice(mi, mi + 500);
ok(/countryResearchedTechs\.delete\(selectedTechId\)/.test(cbHandler) && /countryTechsDirty = true/.test(cbHandler),
  "the flag is set exactly where the researched set is mutated");

// ---- SERVER: refuse to write a country file without a list ----
ok(/if \(countryTag && Array\.isArray\(countryTechIds\)\) \{/.test(server),
  "the server writes a country file ONLY when given an actual list");
ok(!/if \(countryTag\) \{\s*\n\s*writeCountryTechnologies/.test(server),
  "the old unconditional `if (countryTag)` write is gone");
// and the write itself must still be reachable — suppressing it entirely would break the feature
ok(/writeCountryTechnologies\(activeRoot, String\(countryTag\)\.trim\(\)\.toUpperCase\(\), countryTechIds\)/.test(server),
  "a real edit still reaches writeCountryTechnologies");

// ---- SERVER: no empty sidecars dropped into a mod ----
for (const [fn, file] of [["saveTechIconKeys", "editor_tech_icons.json"], ["saveEquipIconKeys", "editor_equip_icons.json"]]) {
  const i = server.indexOf(`function ${fn}(`);
  ok(i !== -1, `${fn} exists`);
  const body = server.slice(i, i + 900);
  ok(/!Object\.keys\(map\)\.length\) && !fs\.existsSync\(p\)\) return;/.test(body),
    `${fn} does not create ${file} just to hold an empty object`);
}
ok(/\(Array\.isArray\(customTabs\) \? customTabs\.length : true\) \|\| fs\.existsSync\(customTabsFile\)/.test(server),
  "an empty custom-tab list does not create editor_custom_tabs.json");
// the client sends [] every save, which is truthy — that was the whole trap
ok(/customTabs,/.test(client), "SANITY: the client does send customTabs on every save");

console.log(`test-research-no-idle-writes: ${checks} checks passed`);
