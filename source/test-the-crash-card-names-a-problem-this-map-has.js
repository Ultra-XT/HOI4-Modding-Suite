// Mod Health's "Will it crash?" card names a problem THIS map has, not a fixed example.
// #a-crash-card-example-from-another-map
//
// THE DEFECT. The card has four verdicts. The one a working-but-broken map lands on read:
//   "⚠ Will it crash? — no, it loads, but N serious problem(s) break the map or text in-game
//    (e.g. a duplicate state id hides the real state → grey provinces). Fix before launch."
// The parenthesis was fixed text. It is the only concrete thing in the whole verdict, so it reads as the
// example FROM this map — and the card is holding the problems, already sorted biggest-first, the whole time.
//
// 📊 MEASURED 2026-09-17 on the world the owner built through Nova's own sequence (new mod → Delete map →
// Generate land at 35% → Auto-fix ×2) and has installed. Driven at http://127.0.0.1:54211/modhealth.html
// against a real server, GET /api/map/validate answers 8 problems, 2 of them errors:
//     error   state_owns_no_land            589 states
//     error   non_land_province_in_state   6,537 provinces
// and no duplicate state id anywhere. The card told him "2 serious problem(s) break the map or text in-game
// (e.g. a duplicate state id hides the real state → grey provinces)".
//
// AND THE LINK BELOW IT claimed "its “Auto-fix all” repairs every fixable map crash class". Measured on a copy
// of that same world: one Auto-fix click took 16.6 s, wrote nothing, and left all 8 problems exactly as they
// were — it declines the 6,537 sea provinces because removing them would empty 589 states, which the Map
// editor's own summary says (#a-fixer-that-declines-says-so) and this link did not.
//
// HOW IT IS TESTED: the REAL public/modhealth-crashcheck.js is executed over responses of known shape, the way
// test-a-map-summary-counts-what-the-rules-found.js runs it, and the rendered card is read. The negative
// control is a map that really does carry a duplicate state id — the words must come back when the map has it.
//
// Run: node test-the-crash-card-names-a-problem-this-map-has.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const labels = require("./public/map-rule-labels.js");
const CRASHCHECK = fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8");

/** Run the REAL panel over one /api/map/validate answer and return the card's HTML and its heading. */
async function renderCard(problems, extra = {}) {
  const v = { ok: true, problems,
    errors: problems.filter((p) => p.severity === "error").length,
    warnings: problems.filter((p) => p.severity !== "error").length };
  const panel = { innerHTML: "", insertAdjacentHTML(_w, h) { this.innerHTML += h; } };
  const els = { mhCrashCheck: panel };
  const el = (id) => (els[id] = els[id] || { style: {}, value: "", disabled: false, textContent: "", innerHTML: "", listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } });
  let runFn = null;
  const sandbox = {
    console, JSON, encodeURIComponent, Number, String, Array, Math, Date, Object,
    window: { NovaMapRuleLabels: labels },
    localStorage: { getItem: () => "D:/fixture-mod" },
    document: { readyState: "complete", addEventListener() {}, getElementById: (id) => (id === "mhCrashCheck" ? panel : el(id)) },
    setTimeout: (fn) => { runFn = fn; return 0; },
    fetch: async (url) => ({ json: async () => {
      const u = String(url);
      if (u.indexOf("/api/root") === 0) return { hoi4GameRoot: "D:/fixture-game" };
      if (u.indexOf("/api/map/validate") === 0) return v;
      if (u.indexOf("/api/modversion") === 0) return extra.version || { ok: true, severity: "ok" };
      if (u.indexOf("/api/modhealth/loc-check") === 0) return extra.loc || { ok: true, problems: [] };
      return {};
    } }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CRASHCHECK, sandbox);
  if (typeof runFn === "function") await runFn();
  const html = panel.innerHTML;
  const head = (/font-weight:600; color:[^"]*;">([^<]*)</.exec(html) || [])[1] || "";
  return { html, head, text: html.replace(/<[^>]+>/g, " ") };
}

// The owner's world, as /api/map/validate really answers for it (measured; the messages are abbreviated).
const OWNERS_WORLD = [
  { severity: "warning", rule: "strategic_location_building_needs_coast", message: "a strategic location raises a coastal building on a province with no coast" },
  { severity: "error", rule: "state_owns_no_land", total: 589, totalNoun: "states", message: "589 state(s) own provinces but not one of them is land" },
  { severity: "error", rule: "non_land_province_in_state", total: 6537, totalNoun: "provinces", message: "6537 sea province(s) are inside a state" },
  { severity: "warning", rule: "supply_nodes_empty", message: "map/supply_nodes.txt is empty" },
  { severity: "warning", rule: "railways_empty", message: "map/railways.txt is empty" },
  { severity: "warning", rule: "dated_naval_building_without_coast", total: 17, totalNoun: "naval buildings", message: "17 dated naval building(s)" },
  { severity: "warning", rule: "fleet_starts_on_land_with_no_sea", total: 246, totalNoun: "fleets", message: "246 fleet(s) start on land" },
  { severity: "warning", rule: "division_starts_on_water", total: 3572, totalNoun: "divisions", message: "3572 divisions start on water" },
];

(async () => {
  try {
    console.log("1. ⭐⭐⭐ The owner's own world: the line names what it found, not a duplicate state id");
    {
      const r = await renderCard(OWNERS_WORLD);
      rec("THE CONTROL: this is the “it loads, but…” verdict", /no, it loads, but 2 serious problem/.test(r.head), r.head);
      rec("THE CONTROL: the map really carries no duplicate state id",
        !OWNERS_WORLD.some((p) => p.rule === "duplicate_state_id"));
      rec("⭐⭐⭐ the verdict does not name a duplicate state id", !/duplicate state id/i.test(r.head), r.head);
      rec("⭐⭐⭐ …it names the biggest problem this map has",
        r.head.indexOf(labels.mapRuleLabel("non_land_province_in_state")) !== -1, r.head);
      rec("…and still carries the scale clause and the count",
        /6,537 provinces/.test(r.head) && /2 serious problem/.test(r.head), r.head);
    }

    console.log("\n2. ⭐⭐ BIGGEST, not first: the rules are ranked by what they counted");
    {
      const problems = [
        { severity: "error", rule: "state_no_category", total: 3, totalNoun: "states", message: "3 states have no category" },
        { severity: "error", rule: "non_land_province_in_state", total: 4000, totalNoun: "provinces", message: "4000 sea provinces in a state" },
      ];
      const r = await renderCard(problems);
      rec("the verdict names the 4,000-province rule, not the 3-state one that ran first",
        r.head.indexOf(labels.mapRuleLabel("non_land_province_in_state")) !== -1
        && r.head.indexOf(labels.mapRuleLabel("state_no_category")) === -1, r.head);
    }

    console.log("\n3. ⭐ THE NEGATIVE CONTROL: a map that DOES have a duplicate state id is told so");
    {
      const problems = [
        { severity: "error", rule: "duplicate_state_id", message: "state 12 is declared in two files" },
        { severity: "warning", rule: "vp_not_in_state", message: "a VP is outside its state" },
      ];
      const r = await renderCard(problems);
      rec("the words come back when the map really has one",
        r.head.indexOf(labels.mapRuleLabel("duplicate_state_id")) !== -1, r.head);
      rec("…and the card offers its one-click repair for it", /id="mhFixDup"/.test(r.html));
    }

    console.log("\n4. The other three verdicts are untouched");
    {
      const clean = await renderCard([]);
      rec("a clean map still reads “Good to launch”", /Good to launch/.test(clean.head), clean.head);
      const warnOnly = await renderCard([{ severity: "warning", rule: "vp_not_in_state", message: "x" }]);
      rec("warnings only still read “nothing that crashes the game”", /nothing that crashes the game/.test(warnOnly.head), warnOnly.head);
      rec("…and a warnings-only map is not given an example either", !/the biggest is/.test(warnOnly.head), warnOnly.head);
      const fatal = await renderCard([{ severity: "error", rule: "land_not_in_state", message: "a land province has no state" }]);
      rec("a fatal rule still reads “HOI4 refuses to load this map”", /refuses to load this map/.test(fatal.head), fatal.head);
      rec("…and the fatal verdict names no invented example", !/the biggest is/.test(fatal.head), fatal.head);
    }

    console.log("\n5. ⭐ The Auto-fix link claims what Auto-fix does");
    {
      const r = await renderCard(OWNERS_WORLD);
      rec("THE CONTROL: the card offers the Map Editor link", /Open Map Editor to auto-fix/.test(r.html));
      const title = (/title="([^"]*Auto-fix all[^"]*)"/.exec(r.html) || [])[1] || "";
      rec("the link has a title to read", title.length > 20, title);
      rec("⭐ it does not promise every fixable class", !/every fixable/.test(title), title);
      rec("⭐⭐ …and it says the click names what it had to leave",
        /names the ones it had to leave|could not|had to leave/.test(title), title);
    }
  } catch (e) {
    rec("harness", false, String((e && e.stack) || e));
  } finally {
    console.log(`\n=== the crash card names a problem this map has: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
