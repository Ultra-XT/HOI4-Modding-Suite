// #a-renumbered-worlds-missing-capitals-are-one-problem
//
// A world built by Nova's own map flow renumbers every state: Delete map takes the mod's states away and
// Generate land creates 1..N. The country files underneath it still say `capital = <old id>`, and the ones
// above the new maximum become capital_state_missing — a FATAL rule, so Save stops.
//
// 📊 MEASURED at b3137f3 on the owner's workflow (new mod over the base game with replace_path="history/states",
// own the map, Delete map, Generate land 35%, Auto-fix twice, validate): 832 states numbered 1..832, 363 of the
// base game's country files declare a capital, 317 of those ids exist again and 46 do not. The rule pushed 46
// SEPARATE PROBLEM ROWS — the Map Errors popup renders one box per problem and heads the section with its
// length, so the world opened on "💀 46 problems Save stops for" and 46 near-identical sentences — and none of
// them carried `total`, which is the only thing map-rule-labels' problemScale will read (never an array
// length), so every summary line was silent about all 46.
//
// This pins the shape its neighbours already have: ONE row for the class, `total` = the number of countries,
// `totalNoun` the noun, the instances in a capped `items`. It also pins what the message must still say, which
// is what test-an-x-crossing-an-empty-state-and-a-missing-capital-say-only-what-the-engine-shows.js established
// — the collapse must not quietly drop the engine quote or the untested-fatal wording.
//
// ⚠️ EVERY COUNT HERE IS DERIVED FROM THE FIXTURE, never typed in: the fixture is built from a list of tags and
// the check reads that list's length back. A number typed into a test is a number that stops measuring.
"use strict";
const path = require("path");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

let checks = 0;
const fails = [];
const rec = (name, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400)));
  if (!ok) fails.push(name);
};

// A world whose states were renumbered: states 1..3 exist, and these countries point above the new maximum.
//
// ⭐ AND EVERY STRANDED COUNTRY OWNS LAND HERE. #a-refused-capital-is-what-two-shipping-maps-already-do split the
// rule on 2026-09-23: capital_state_missing gates Save only for a country that owns land, because a landless one
// ends where 18 countries Old World Blues and Rise of Nations already ship — no capital state at all, on maps that
// play. This file is about the FATAL half's shape, so its countries are given land; the landless half is pinned in
// its own section at the end. Before the split they owned nothing, and this fixture measured the wrong half.
const STRANDED = { AFA: 908, ATJ: 1050, BAR: 981, BEG: 840, BHR: 1014, BIA: 900 };
const LANDED = { JOR: 2 };           // the control: a capital that still resolves must not be reported
// Ids stay contiguous — a gap here would raise state_id_gap and measure that instead.
const withLand = (tags) => tags.map((t, i) => ({ id: 4 + i, name: "S" + (4 + i), provinces: [(4 + i) * 10], owner: t }));
const model = {
  capitals: Object.assign({}, STRANDED, LANDED),
  states: [1, 2, 3].map((id) => ({ id, name: "S" + id, provinces: [id * 10], owner: "JOR" }))
    .concat(withLand(Object.keys(STRANDED))),
};
const rows = (md.validateMapModel(model) || []).filter((p) => p.rule === "capital_state_missing");
const N = Object.keys(STRANDED).length;

console.log(`=== ${N} countries stranded by a renumber, 1 state id each ===`);
rec("THE CONTROL: the rule fires at all", rows.length > 0, rows.map((p) => p.message));
rec("⭐⭐⭐ it is ONE problem row, not one per country", rows.length === 1, rows.length);

const p = rows[0] || {};
rec("…still an error", p.severity === "error");
rec("…and still in the curated FATAL set", labels.isFatalRule("capital_state_missing") === true);
rec(`⭐⭐⭐ it counts itself: total = the ${N} countries the fixture stranded`, p.total === N, { total: p.total, expected: N });
rec("⭐⭐ …with the noun problemScale needs to print it", String(p.totalNoun || "") === "countries", p.totalNoun);
const scale = typeof labels.problemScale === "function" ? labels.problemScale(p) : null;
rec("⭐⭐ so the summary line can size it", !!scale && scale.n === N, scale);
rec("⭐⭐ scaleClause names it rather than staying silent",
  typeof labels.scaleClause === "function" && labels.scaleClause([p]) === N + " countries", typeof labels.scaleClause === "function" ? labels.scaleClause([p]) : "(absent)");

rec("⭐⭐ every stranded country is still in the payload", Array.isArray(p.items) && p.items.length === N, (p.items || []).length);
const seen = new Set();
for (const it of p.items || []) for (const t of it.tags || []) seen.add(t);
rec("⭐⭐ …and it is the fixture's own set of tags, id by id",
  Object.keys(STRANDED).every((t) => seen.has(t)) && seen.size === N
  && (p.items || []).every((it) => (it.tags || []).every((t) => STRANDED[t] === it.stateId)),
  [...seen]);
rec("⭐ the control: the country whose capital still resolves is NOT in it", !seen.has("JOR"), [...seen]);

// The message must not lose what the engine-claims test established.
const msg = String(p.message || "");
console.log("\n=== the message still claims only what the engine shows ===");
rec(`⭐⭐⭐ it opens with the population, not with one country`, msg.startsWith(N + " countries"), msg.slice(0, 80));
rec("⭐⭐ it quotes the refusal HOI4 logs", /it is not a valid state!/.test(msg), msg);
// ⚠️ THESE MOVED WITH THE TRACE. They used to require "not been traced" and "launch test", which is what the message
// said while nobody had read the engine. hoi4.exe 1.19.3 was read on 2026-09-23: country.cpp refuses the capital and
// returns, never calling the failed-load routine. That reading also said the getter handing the null back is not checked
// at one of its 136 call sites, and the message gave that as what Save stops for; it was never true — the 1.19.4 re-read
// found the guard it missed (test-a-missing-capital-stops-save-only-for-a-country-with-land.js section 1 reads it). The
// message must still say BOTH halves: that the map still loads, and why Save stops anyway — nobody has launched it.
rec("⭐⭐⭐ it says the map itself still loads", /still loads/i.test(msg), msg);
rec("⭐⭐ …and it is country.cpp refusing the capital, not the map being rejected", /country\.cpp/.test(msg) && /refuses the capital/.test(msg), msg);
rec("⭐⭐ it says why Save stops anyway: nobody has launched such a country, so what the game does next is unknown", /nobody has launched/i.test(msg) && /unknown/i.test(msg), msg);
rec("⭐⭐⭐ …and it claims no read the game does not check (the 09-23 reading's miss)",
  !/does not (always )?check|doesn't check|not checked|unchecked|without (a )?check|\bback in \d+ places\b/i.test(msg), msg);
rec("⭐ …and that Auto-fix can repair this half", /Auto-fix/.test(msg), msg);
rec("⭐⭐⭐ it does not say HOI4 crashes", !/crash/i.test(msg), msg);
rec("⭐ it names an example so the modder has somewhere to start", /state \d+/.test(msg), msg);

// One country is still one country: a rule whose plural is hard-wired reads "1 countries have their capital".
console.log("\n=== one stranded country reads in the singular ===");
const solo = md.validateMapModel({ capitals: { HAM: 209 }, states: [{ id: 210, name: "Real", provinces: [5], owner: "HAM" }] })
  .filter((x) => x.rule === "capital_state_missing");
rec("THE CONTROL: it fires for one", solo.length === 1, solo.length);
const sm = String((solo[0] || {}).message || "");
rec("⭐⭐ it names the country and its state, in the singular", /^HAM has its capital set to state 209\b/.test(sm), sm.slice(0, 80));
rec("⭐ …and does not say \"1 countries\"", !/\b1 countries\b/.test(sm), sm);
rec("⭐ it counts itself as one", (solo[0] || {}).total === 1, (solo[0] || {}).total);
rec("⭐ scaleClause singularises the noun", typeof labels.scaleClause === "function" && labels.scaleClause([solo[0]]) === "1 country",
  typeof labels.scaleClause === "function" ? labels.scaleClause([solo[0]]) : "(absent)");

// ── the landless half: the same broken line, reported and NOT gating Save ────────────────────────────
console.log("\n=== the same countries, owning no land ===");
{
  const landless = md.validateMapModel({
    capitals: Object.assign({}, STRANDED, LANDED),
    states: [1, 2, 3].map((id) => ({ id, name: "S" + id, provinces: [id * 10], owner: "JOR" })),
  });
  const fatalRows = landless.filter((x) => x.rule === "capital_state_missing");
  const warnRows = landless.filter((x) => x.rule === "capital_state_missing_no_land");
  rec("⭐⭐⭐ THE BACK-OUT CONTROL: with no land, not one row is the fatal rule", fatalRows.length === 0, fatalRows.map((x) => x.rule));
  rec("⭐⭐⭐ …it is one row of capital_state_missing_no_land instead", warnRows.length === 1, landless.map((x) => x.rule));
  const w = warnRows[0] || {};
  rec("⭐⭐ …a warning", w.severity === "warning", w.severity);
  rec("⭐⭐⭐ …which does NOT gate Save", labels.isFatalRule("capital_state_missing_no_land") === false, [...labels.FATAL]);
  rec(`⭐⭐ …and counts the same ${N} countries`, w.total === N, { total: w.total, expected: N });
  rec("⭐⭐ …with the noun problemScale needs", String(w.totalNoun || "") === "countries", w.totalNoun);
  const wm = String(w.message || "");
  rec("⭐⭐ it says the countries own no land, which is why Save is not stopped", /owns no land|owns any land/.test(wm), wm.slice(0, 200));
  rec("⭐⭐⭐ …and names the shipping maps that already do this", /Old World Blues/.test(wm) && /Rise of Nations/.test(wm), wm);
  rec("⭐⭐ it does not promise a repair Nova will not make", /will not repair/.test(wm), wm);
  rec("⭐⭐⭐ it claims no crash", !/crash/i.test(wm), wm);
  rec("⭐ and the split is by LAND, not by tag: the resolving control is still absent", !/JOR/.test(wm), wm);
  rec("⭐⭐ the rule has a friendly label, so the panel never shows it raw",
    labels.mapRuleLabel("capital_state_missing_no_land") === labels.LABELS.capital_state_missing_no_land
    && /capital/i.test(labels.LABELS.capital_state_missing_no_land || ""), labels.mapRuleLabel("capital_state_missing_no_land"));
}

// And a map with none of them says nothing at all.
console.log("\n=== the negative control ===");
const clean = md.validateMapModel({ capitals: { JOR: 1 }, states: [{ id: 1, name: "S1", provinces: [10], owner: "JOR" }] })
  .filter((x) => x.rule === "capital_state_missing");
rec("⭐ a map whose capitals all resolve reports nothing", clean.length === 0, clean.map((x) => x.message));

console.log(`\n=== a renumbered world's missing capitals are one problem: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
