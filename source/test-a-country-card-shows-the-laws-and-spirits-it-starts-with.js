// 🏳 THE COUNTRY CARD SHOWS THE LAWS AND NATIONAL SPIRITS A COUNTRY STARTS WITH. #country-card-start-ideas
//
// The map's country card (the owner's milestone after TEST 31) shows a country's laws and national spirits the way the
// game's own screens do. The reader Country Setup uses, /api/history/country-spirits, cannot answer that: it reads only
// `add_ideas = { … }` with braces and stops at the first dated block. Measured on the installed base game it returns
// NONE of Germany's four starting ideas (they sit after a 1939.1.1 block) and none of the USA's (written `add_ideas = X`,
// or inside a DLC check); on Millennium Dawn, which writes a whole country inside its 2000.1.1 start block, none either.
//
// GET /api/countries/start-ideas?tag&modPath follows the history the way the game runs it at the start date: undated
// statements, then dated blocks up to the start date in date order; `if` / `else_if` / `else` when the limit is
// something Nova can judge (has_dlc taken as owned, tag, always, NOT/OR/AND), and anything behind a condition it cannot
// judge reported apart as `unsure`. Laws are the ideas of a `law = yes` category; a category the history sets nothing in
// shows its `default = yes` law — the one this country is `allowed`.
//
// Each shape below is copied from the base game's or Millennium Dawn's own files, named beside it.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("start-ideas");
const BOM = String.fromCharCode(0xfeff);
lib.write(world.GAME, {
  // _economic.txt / _manpower.txt: a law category says `law = yes`; one law in it says `default = yes`. mobilization_laws
  // carries a second default the way _manpower.txt does: Ethiopia's Chitet says `default = yes` AND `allowed = { always =
  // no }` — it is never anybody's default, and Ethiopia's history adds it. Listed FIRST here, so a reader that ignored
  // `allowed` would hand it to everyone (the first draft of this reader did, on the real base game).
  "common/ideas/_economic.txt": `ideas = {
\teconomy = {
\t\tlaw = yes
\t\tuse_list_view = yes
\t\tcivilian_economy = {
\t\t\tdefault = yes
\t\t\tcost = 150
\t\t}
\t\tpartial_economic_mobilisation = {
\t\t\tcost = 150
\t\t}
\t\twar_economy = {
\t\t\tcost = 150
\t\t}
\t}
\tmobilization_laws = {
\t\tlaw = yes
\t\tETH_chitet_law = {
\t\t\tallowed = {
\t\t\t\talways = no
\t\t\t}
\t\t\tdefault = yes
\t\t}
\t\tvolunteer_only = {
\t\t\tdefault = yes
\t\t}
\t\tlimited_conscription = {
\t\t\tcost = 150
\t\t}
\t}
}
`,
  "common/ideas/_country.txt": `ideas = {
\tcountry = {
\t\tsour_loser = { picture = sour_loser }
\t\tmonroe = { name = USA_monroe_doctrine_enforcer }
\t\tdlc_spirit = { }
\t\tnodlc_spirit = { }
\t\telse_spirit = { }
\t\tgov_spirit = { }
\t\tstart_day_spirit = { }
\t\tlater_spirit = { }
\t}
\thidden_ideas = {
\t\thidden_marker = { }
\t}
}
`,
  "common/bookmarks/the_gathering_storm.txt": "bookmarks = {\n\tbookmark = {\n\t\tname = GATHERING_STORM_NAME\n\t\tdate = 1936.1.1.12\n\t\tdefault = yes\n\t}\n}\n",
  "localisation/english/ideas_l_english.yml": `${BOM}l_english:\n sour_loser:0 "Bitter Loser"\n USA_monroe_doctrine_enforcer:0 "Monroe Doctrine Enforcer"\n volunteer_only:0 "Volunteer Only"\n civilian_economy:0 "Civilian Economy"\n partial_economic_mobilisation:0 "Partial Mobilization"\n ETH_chitet_law:0 "The Chitet"\n`,
  // GER - Germany.txt: its starting ideas sit AFTER a 1939.1.1 block, which also adds war_economy for the later start.
  "history/countries/GER - Germany.txt": `capital = 1
1939.1.1 = {
\tadd_ideas = { war_economy later_spirit }
}
# Setup of National Spirits
add_ideas = {
\tsour_loser # the Treaty of Versailles
\tpartial_economic_mobilisation
}
1935.6.1 = {
\tremove_ideas = sour_loser
}
`,
  // USA - USA.txt: `add_ideas = X` with no braces, DLC checks with an else, a condition Nova cannot judge, and a block
  // dated the start day itself.
  "history/countries/USA - USA.txt": `capital = 1
add_ideas = monroe
if = {
\tlimit = { has_dlc = "No Step Back" }
\tadd_ideas = dlc_spirit
}
if = {
\tlimit = { not = { has_dlc = "Man the Guns" } }
\tadd_ideas = nodlc_spirit
}
else = {
\tadd_ideas = else_spirit
}
if = {
\tlimit = { has_government = fascism }
\tadd_ideas = gov_spirit
}
1936.1.1 = {
\tadd_ideas = { start_day_spirit hidden_marker }
}
`,
  "history/countries/ETH - Ethiopia.txt": "capital = 1\nadd_ideas = {\n\tETH_chitet_law\n}\n",
});
// Millennium Dawn's shape: a 2000.1.1 start, and the whole country written inside its 2000.1.1 block.
const MD = world.mod("Modern", {
  "common/bookmarks/modern.txt": "bookmarks = {\n\tbookmark = {\n\t\tname = MODERN\n\t\tdate = 2000.1.1.12\n\t\tdefault = yes\n\t}\n}\n",
  "history/countries/GER - Germany.txt": "2000.1.1 = {\n\tcapital = 1\n\tadd_ideas = { war_economy later_spirit }\n}\n",
});
// A mod that replaces common/ideas: the base game's laws are gone, and its own category has a default of its own.
const TC = world.mod("Total", {
  "common/ideas/laws.txt": "ideas = {\n\tpolicy = {\n\t\tlaw = yes\n\t\tfree_market = {\n\t\t\tdefault = yes\n\t\t}\n\t\tplanned = { }\n\t}\n}\n",
});
fs.appendFileSync(path.join(TC, "descriptor.mod"), 'replace_path="common/ideas"\n');

const { createApp } = require("./server.js");

(async () => {
  const srv = await lib.startServer(createApp);
  const ask = (mod, tag) => fetch(`${srv.base}/api/countries/start-ideas?tag=${tag}&modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  const law = (r, cat) => (r.laws || []).find((l) => l.category === cat) || {};
  const ids = (list) => (list || []).map((s) => s.id);
  const base = world.mod("Plain", {});

  console.log("1. Germany: starting ideas after a dated block, a later start's ideas left out");
  let r = await ask(base, "GER");
  rec("reads the start date from the default bookmark (1936.1.1)", r.startDate && r.startDate.year === 1936 && r.startDate.month === 1 && r.startDate.day === 1, r.startDate);
  rec("the economy law set after the 1939 block: Partial Mobilization, from the history", law(r, "economy").id === "partial_economic_mobilisation" && law(r, "economy").fromHistory === true && law(r, "economy").name === "Partial Mobilization", law(r, "economy"));
  rec("…not the 1939 block's war_economy", !JSON.stringify(r).includes("war_economy") && !JSON.stringify(r).includes("later_spirit"), r);
  rec("a 1935 block's remove_ideas runs after the undated lines: sour_loser is gone", !ids(r.spirits).includes("sour_loser"), r.spirits);
  rec("a comment inside the list is not read as an idea", !ids(r.spirits).some((x) => /treaty|versailles/i.test(x)), r.spirits);
  rec("a law category the history sets nothing in shows its default, Volunteer Only", law(r, "mobilization_laws").id === "volunteer_only" && law(r, "mobilization_laws").isDefault === true && law(r, "mobilization_laws").name === "Volunteer Only", law(r, "mobilization_laws"));

  console.log("2. the USA: no braces, DLC checks, a condition Nova cannot judge, the start day");
  r = await ask(base, "USA");
  rec("`add_ideas = monroe` (no braces) is read, and named through its `name =` key", (r.spirits || []).some((s) => s.id === "monroe" && s.name === "Monroe Doctrine Enforcer" && s.category === "country"), r.spirits);
  rec("a has_dlc check is taken as owned: dlc_spirit", ids(r.spirits).includes("dlc_spirit"), r.spirits);
  rec("…so its NOT = { has_dlc } fallback is not, and the else branch is", !ids(r.spirits).includes("nodlc_spirit") && ids(r.spirits).includes("else_spirit") && !ids(r.unsure).includes("nodlc_spirit"), { spirits: ids(r.spirits), unsure: ids(r.unsure) });
  rec("an idea behind has_government (which Nova cannot judge) is reported as unsure, not claimed", ids(r.unsure).includes("gov_spirit") && !ids(r.spirits).includes("gov_spirit"), { spirits: ids(r.spirits), unsure: ids(r.unsure) });
  rec("a block dated the start day itself counts", ids(r.spirits).includes("start_day_spirit"), r.spirits);
  rec("a hidden idea is counted apart, not listed as a spirit", r.hiddenSpirits === 1 && !ids(r.spirits).includes("hidden_marker"), { hidden: r.hiddenSpirits, spirits: ids(r.spirits) });
  rec("the economy law nobody set is the default, Civilian Economy", law(r, "economy").id === "civilian_economy" && law(r, "economy").isDefault === true, law(r, "economy"));

  console.log("3. a default nobody is allowed");
  rec("the Chitet says `default = yes` but `allowed = { always = no }`: it is not the USA's default", law(r, "mobilization_laws").id === "volunteer_only", law(r, "mobilization_laws"));
  r = await ask(base, "ETH");
  rec("Ethiopia has it because its history adds it", law(r, "mobilization_laws").id === "ETH_chitet_law" && law(r, "mobilization_laws").fromHistory === true && law(r, "mobilization_laws").name === "The Chitet", law(r, "mobilization_laws"));

  console.log("4. Millennium Dawn's shape: everything inside the start-date block");
  r = await ask(MD, "GER");
  rec("a 2000.1.1 start reads the 2000.1.1 block", r.startDate && r.startDate.year === 2000 && law(r, "economy").id === "war_economy" && ids(r.spirits).includes("later_spirit"), r);
  rec("…and the mod's own history file, not the base game's", r.inMod === true && /Modern|m\d+/.test(String(r.filePath)), r.filePath);

  console.log("5. replace_path on common/ideas");
  r = await ask(TC, "GER");
  rec("the base game's law categories are gone; the mod's own shows its default", (r.laws || []).length === 1 && law(r, "policy").id === "free_market" && law(r, "policy").isDefault === true, r.laws);

  const none = await ask(base, "ZZZ");
  rec("a country with no history file answers empty, not an error", none.ok === true && ids(none.spirits).length === 0 && none.filePath === null, none);
  const bad = await fetch(`${srv.base}/api/countries/start-ideas?modPath=${encodeURIComponent(base)}`);
  rec("no tag is a 400 that says so", bad.status === 400 && /tag/i.test(((await bad.json()) || {}).error || ""), bad.status);

  srv.close();
  world.cleanup();
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  // exitCode, not process.exit: a forced exit while a handle is closing aborts with UV_HANDLE_CLOSING on Windows
  // (test-idea-extra-script.js), and a crash after every check passed still reads as a failed file.
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})().catch((e) => { console.error(e); world.cleanup(); process.exitCode = 1; });
