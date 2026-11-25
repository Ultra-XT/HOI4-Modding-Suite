// The Map Errors popup promised seven specific repairs beside a button that made none of them.
// #a-popup-promised-repairs-that-did-not-apply
//
// THE DEFECT. The line above "🔧 Auto-fix all" was a hand-typed list — "Auto-fix the safely-fixable errors
// (region splits, missing state_category / continent, a capital owned by another country, supply/railways left
// on water, isolated inland seas, sea-continent + sourceless-river cleanup, stateless land):" — rendered
// whenever ANY error was present, whether or not one of those seven was among them. It was typed once, and
// the fixer list has moved on around it: autoFixMap runs twenty-seven fixers, and the sentence names seven.
//
// ⚠️ MEASURED on the world the owner's flow builds (own the map → Delete map → Generate land 35% → Auto-fix
// ×2 — 18 problems, 1 error, 0 fatal). The one error is `non_land_province_in_state`, which is not in that
// list and which no fixer repairs: a full Auto-fix click on a copy of that world changed nothing at all —
// every fixer returning zero, 18.1 seconds, not a byte written. So the modder read a promise of seven named
// repairs, clicked the green button under it, and the map came back the same.
//
// A list that cannot go stale is one derived from what is on the screen. The only ownership fact a problem
// states about itself is `autoFix: false`, set at the push site by a rule that has decided Auto-fix must leave
// it alone — the same flag the popup already uses to withhold the button from a warning Auto-fix declines. So
// the sentence now counts those, and promises nothing about the rest beyond what the click itself reports
// when it ends (which, since the commit before this one, includes "it changed nothing").
//
// Also here: "1 error (the game loads past them, but they break in-game)" — the non-fatal parenthetical was a
// fixed plural, so a single error was described as several.
//
// How it is checked: public/map.js's own openMapErrorsModal is lifted and run, and every number in the
// sentence is compared against the problem list that was handed to it, never against a number typed here.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP_SRC);
const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP_SRC.slice(s, e + 4); };

const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "",
  addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el() });

/** Render the popup on a validate response and hand back its HTML, the way the page builds it. */
function render(res, context) {
  const overlays = [];
  const sandbox = {
    console, JSON, encodeURIComponent,
    window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; },
      body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0,
    statusEl: { style: {} },
    setStatus: () => {},
    modPath: () => "D:/fixture",
    escHtml: (s) => String(s == null ? "" : s),
    hasPendingMapEdits: () => false,
    fetch: async () => ({ json: async () => ({}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${grab("function openMapErrorsModal(")}\nglobalThis.__modal = openMapErrorsModal;`, sandbox);
  sandbox.__modal(res, context);
  return overlays.map((o) => o.innerHTML).join("\n");
}
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const resFor = (problems) => ({ ok: true, problems,
  errors: problems.filter((p) => p.severity === "error").length,
  warnings: problems.filter((p) => p.severity !== "error").length });

// The shape the owner's finished world hands the popup: one error no fixer repairs, and warnings of which some
// declare that Auto-fix leaves them alone. Rules and flags are real ones; the counts below are read back OFF
// this list, never typed into an assertion.
const WORLD = [
  { severity: "error", rule: "non_land_province_in_state", total: 6537, totalNoun: "provinces",
    message: "6537 sea province(s) are inside a state. Remove it from the state, or set the province's type back to land in the terrain editor." },
  { severity: "warning", rule: "division_starts_on_water", autoFix: false, total: 3572, totalNoun: "divisions",
    message: "3,572 divisions start on water. Auto-fix leaves them alone, because a history/units file replaces the same-named file below it whole." },
  { severity: "warning", rule: "supply_nodes_empty", autoFix: false, message: "map/supply_nodes.txt has no rows. Auto-fix leaves it alone." },
  { severity: "warning", rule: "railways_empty", autoFix: false, message: "map/railways.txt has no rows. Auto-fix leaves it alone." },
  { severity: "warning", rule: "dated_naval_building_without_coast", autoFix: false, total: 17, totalNoun: "naval buildings",
    message: "17 naval buildings on a later date. Auto-fix repairs the undated block and leaves dated ones alone." },
  { severity: "warning", rule: "fleet_starts_on_land_with_no_sea", message: "246 fleets start on land with no sea beside it." },
  { severity: "warning", rule: "strategic_location_building_needs_coast", message: "State 178 gives a strategic location to a province that is not coastal." },
];

try {
  console.log("=== 0. THE CONTROL: the popup's own code was found and renders ===");
  rec("openMapErrorsModal was lifted", grab("function openMapErrorsModal(").length > 2000, grab("function openMapErrorsModal(").length);
  rec("…and renders the world's problem list", render(resFor(WORLD)).length > 2000);

  console.log("\n=== 1. the sentence above the button names no repair it cannot show ===");
  {
    const t = text(render(resFor(WORLD)));
    console.log("  FOOTER: " + (/Auto-fix repairs what it safely can[\s\S]*?to you\./.exec(t) || /Auto-fix repairs what it safely can[\s\S]*?repair\./.exec(t) || ["(not found)"])[0]);
    // The seven typed repairs, quoted from the line this replaces. Read off the RENDERED html, so this file's
    // own explanatory prose above cannot satisfy it.
    for (const promised of ["region splits", "sea-continent", "sourceless-river", "stateless land", "isolated inland seas"]) {
      rec(`⭐⭐ the popup no longer promises "${promised}" to a screen that may not contain it`, t.indexOf(promised) === -1, t.slice(0, 120));
    }
    rec("⭐⭐⭐ …and says instead what the click will report, including when it changed nothing",
      /Auto-fix repairs what it safely can/.test(t) && /including when that is nothing/.test(t), t.slice(0, 160));
    rec("THE CONTROL: the button is still offered — an error still brings it", /id="mapErrFix"/.test(render(resFor(WORLD))));
  }

  console.log("\n=== 2. the counts beside it are DERIVED from the problems handed in ===");
  {
    const t = text(render(resFor(WORLD)));
    const declines = WORLD.filter((p) => p.autoFix === false).length;
    const namesFix = WORLD.filter((p) => p.autoFix !== false && /\bAuto-fix\b/.test(p.message)).length;
    rec("THE CONTROL: the fixture really does carry some problems that decline Auto-fix", declines > 0 && declines < WORLD.length, declines);
    rec("THE CONTROL: …and, like the owner's world, none that names Auto-fix as its own repair", namesFix === 0, namesFix);
    rec(`⭐⭐⭐ so the sentence says none of the ${WORLD.length} names it as its repair`,
      t.indexOf(`None of the ${WORLD.length} below names it as its repair`) !== -1, t.slice(0, 260));
    rec(`⭐⭐⭐ …and that ${declines} say it leaves them to you`,
      new RegExp(`\\b${declines} say in their own message that it leaves them to you`).test(t), t.slice(0, 260));

    // …and both move with the list. One more declining problem, one more counted — read off the new list.
    const more = WORLD.concat([{ severity: "warning", rule: "supply_node_on_water", autoFix: false, message: "a hub on water. Auto-fix leaves it alone." }]);
    const t2 = text(render(resFor(more)));
    const d2 = more.filter((p) => p.autoFix === false).length;
    rec(`⭐⭐ add one that declines and the sentence reads ${d2} and ${more.length}`,
      t2.indexOf(`None of the ${more.length} below`) !== -1 && new RegExp(`\\b${d2} say in their own message`).test(t2), t2.slice(0, 260));
    rec("…so it is counting, not repeating a number", d2 !== declines);

    // …and one that DOES name Auto-fix flips the first half.
    const withFix = WORLD.concat([{ severity: "warning", rule: "adjacency_bom", message: "a BOM on adjacencies.csv — Auto-fix strips it." }]);
    const t3 = text(render(resFor(withFix)));
    const n3 = withFix.filter((p) => p.autoFix !== false && /\bAuto-fix\b/.test(p.message)).length;
    rec(`⭐⭐⭐ a problem that names Auto-fix is counted as one it can repair (${n3} of ${withFix.length})`,
      t3.indexOf(`${n3} of the ${withFix.length} below names it as its repair`) !== -1, t3.slice(0, 260));
    rec("…and the \"none\" wording is gone", t3.indexOf("None of the") === -1, t3.slice(0, 260));
  }

  console.log("\n=== 3. THE NEGATIVE CONTROL: nothing declines → no clause about declines ===");
  {
    const none = WORLD.filter((p) => p.autoFix !== false);
    rec("THE CONTROL: this list has an error, so the sentence is still the errors one", none.some((p) => p.severity === "error"));
    const t = text(render(resFor(none)));
    rec("⭐⭐ the decline clause is absent, rather than reading \"0 say\"", t.indexOf("own message that it leaves") === -1 && t.indexOf("0 say") === -1, t.slice(0, 260));
    rec("…while the sentence itself is still there", /Auto-fix repairs what it safely can/.test(t), t.slice(0, 160));
    rec("…and still counts what names it", t.indexOf(`None of the ${none.length} below names it as its repair`) !== -1, t.slice(0, 260));
  }

  console.log("\n=== 4. a single error is described in the singular ===");
  {
    const one = WORLD.filter((p) => p.severity === "error");
    rec("THE CONTROL: exactly one error", one.length === 1, one.length);
    const t = text(render(resFor(one)));
    rec("⭐⭐ \"the game loads past it, but it breaks in-game\"", /loads past it, but it breaks in-game/.test(t), t.slice(0, 200));
    rec("…and not the plural it used to print for one", !/loads past them, but they break in-game/.test(t), t.slice(0, 200));
    const two = WORLD.filter((p) => p.severity === "error").concat([{ severity: "error", rule: "province_id_gap", message: "a gap." }]);
    rec("THE CONTROL: two errors keep the plural", /loads past them, but they break in-game/.test(text(render(resFor(two)))));

    // …and the section heading over them counts the same way. The owner's world opened on "🛑 1 Errors".
    rec("⭐⭐ the section heading reads \"1 Error\"", / 1 Error /.test(text(render(resFor(one)))) && !/1 Errors/.test(text(render(resFor(one)))), text(render(resFor(one))).slice(0, 320));
    rec("THE CONTROL: two keep \"2 Errors\"", /2 Errors/.test(text(render(resFor(two)))));
    const w1 = WORLD.filter((p) => p.rule === "railways_empty");
    rec("⭐ …and one warning reads \"1 Warning\"", w1.length === 1 && / 1 Warning /.test(text(render(resFor(w1)))) && !/1 Warnings/.test(text(render(resFor(w1)))), text(render(resFor(w1))).slice(0, 320));
    rec("THE CONTROL: the warnings section still pluralises", /17 Warnings|2 Warnings|6 Warnings/.test(text(render(resFor(WORLD)))), text(render(resFor(WORLD))).slice(0, 320));
  }

  console.log("\n=== 5. the warnings-only sentence, which was already derived, is untouched ===");
  {
    const w = [{ severity: "warning", rule: "adjacency_bom", message: "a BOM on adjacencies.csv — Auto-fix strips it." }];
    const t = text(render(resFor(w)));
    rec("⭐ a fixable warning alone still gets its own sentence", /Auto-fix the warning whose message names it/.test(t), t.slice(0, 200));
    const t0 = text(render(resFor([{ severity: "warning", rule: "x", message: "nothing offers a fix here." }])));
    rec("…and a screen with nothing to click says so", /Re-check after editing/.test(t0), t0.slice(0, 200));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
}

console.log(`\n=== the map errors popup promises no repair it cannot name: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exitCode = fails.length ? 1 : 0;
