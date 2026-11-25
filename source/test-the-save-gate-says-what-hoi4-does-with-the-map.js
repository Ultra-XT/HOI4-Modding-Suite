// The Map editor's Save gate says what HOI4 does with the map — refuses to load it, has crashed on it, or has not been
// launch-tested with it — and never that it "WILL crash". #the-save-gate-says-what-hoi4-does
//
// THE DEFECT. Every line the gate itself writes said a crash, for every rule in the curated FATAL set:
//   * the status line after Save: "⛔ The map now has N errors that will crash HOI4 on launch";
//   * the popup: "💀 This map WILL crash HOI4", "💀 N will-crash errors — must fix", "impossible to load — HOI4 crashes the
//     instant you press Play … it's a guaranteed crash", "Insist on keeping a map you know will crash?";
//   * after typing save: "You kept a map with N known crash errors — HOI4 will NOT load it."
// The evidence is not one thing (batch 5 engine table, map-error-table.md; the FATAL set's own comments):
//   * NINE rules reach hoi4.exe's failed-load path 0x140201F90 — "Failed to load the map" unless started with -debug, a
//     refusal, not a crash: land_not_in_state, province_no_region, state_split_strategic_regions, fractioned_naval_region,
//     state_id_gap (the map check 0x1401E3F70), state_no_air_base_or_rocket_site and the three empty-state rules
//     (strategicair's state walk 0x140CB6BE0, when a game starts or a save loads; all three addresses are 1.19.4.1's);
//   * TWO crashed in the owner's own launches: naval_base_water_is_gone, country_tag_after_dynamic_marker (a third,
//     state_naval_building_without_coast, was blamed for the island launch until its minidumps showed the flag atlas —
//     #a-naval-building-the-game-refuses-claims-no-crash — and is "untested" now);
//   * the rest stay in the set with neither: map_x_crossing and province_no_pixels log and carry on, capital_state_missing
//     is only refused, and the bitmap-format rules, buildings_empty and strategic_region_id_gap rest on the wiki's word
//     and untraced code. Their own messages say so.
// And the popup that opens after a Save leaving only errors the game LOADS PAST headlined "⛔ This map will crash HOI4 —
// it will crash the moment you press Play", while the status line beside it said the game loads past them.
//
// THE FIX, client text only (the FATAL set is unchanged): map-rule-labels.js records what HOI4 does with each fatal rule
// (FATAL_OUTCOME) and fatalVerdict words a set of fatal problems by what at least one of them proves; public/map.js uses
// it for the status line, the popup's title, count and intro, the unlock line and the kept-map line, and gives the
// loads-past popup the status line's words. Sections 2 and 3 run the real mapCrashGate and openMapErrorsModal.
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
const { maskJsComments } = require("./testlib-strip-comments.js");
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const CERTAIN_CRASH = /will crash|WILL crash|will-crash|guaranteed crash|known crash|crashes the instant|crash the moment|crash-causing/i;

// The two client functions, lifted out of public/map.js the way the neighbouring gate tests lift them.
const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP.slice(s, e + 4); };
const GATE = grab("async function mapCrashGate");
const MODAL = grab("function openMapErrorsModal(");

// Runs the real gate over a validate response. The popup's elements are stable per selector and keep their listeners,
// so the type-"save" unlock can be driven the way a modder drives it.
async function runGate(problems, { context = "postsave", viaGate = true } = {}) {
  const v = { ok: true, problems,
    errors: problems.filter((p) => p.severity === "error").length, warnings: problems.filter((p) => p.severity !== "error").length };
  let status = "";
  const overlays = [];
  const mkEl = () => {
    const q = new Map(), listeners = {};
    const o = { style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "", listeners,
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {},
      querySelector(sel) { if (!q.has(sel)) q.set(sel, mkEl()); return q.get(sel); } };
    return o;
  };
  const sandbox = {
    console, JSON, encodeURIComponent,
    window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = mkEl(); overlays.push(o); return o; },
      body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0,
    statusEl: { style: {} },
    setStatus: (s) => { status = String(s); },
    modPath: () => "D:/fixture",
    escHtml: (s) => String(s == null ? "" : s),
    hasPendingMapEdits: () => false,
    fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/validate") === 0 ? v : {}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${MODAL}\n${GATE}\nglobalThis.__gate = mapCrashGate; globalThis.__modal = openMapErrorsModal;`, sandbox);
  if (viaGate) await sandbox.__gate({ done: 1 }); else sandbox.__modal(v, context);
  const ov = overlays[overlays.length - 1] || mkEl();
  const html = ov.innerHTML;
  const title = (/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(html) || [])[1] || "";
  const gateOpen = /id="mapErrGateInput"/.test(html);
  const statusAfterSave = status;
  let keptStatus = "";
  if (gateOpen) {
    const input = ov.querySelector("#mapErrGateInput"), btn = ov.querySelector("#mapErrGateBtn");
    input.value = "save";
    for (const fn of (btn.listeners.click || [])) fn({});
    keptStatus = status;
  }
  return { status: statusAfterSave, keptStatus, html, title, gateOpen };
}
const P = (rule, severity = "error") => ({ severity, rule, message: `${rule} (fixture message)` });

(async () => {
  try {
    console.log("\n=== 1. what HOI4 does with each fatal rule is recorded beside the set ===");
    {
      const OUT = labels.FATAL_OUTCOME || {};
      const KINDS = ["refuses-to-load", "crashes", "untested"];
      rec("map-rule-labels.js exports FATAL_OUTCOME, fatalOutcome and fatalVerdict",
        typeof labels.FATAL_OUTCOME === "object" && typeof labels.fatalOutcome === "function" && typeof labels.fatalVerdict === "function");
      const missing = [...labels.FATAL].filter((r) => !KINDS.includes(OUT[r]));
      rec("⭐⭐ every rule in the FATAL set says which of the three it is", missing.length === 0, missing);
      const extra = Object.keys(OUT).filter((r) => !labels.FATAL.has(r));
      rec("…and nothing outside the set is given one (the set itself is not changed here)", extra.length === 0, extra);
      const fo = typeof labels.fatalOutcome === "function" ? labels.fatalOutcome : () => null;
      rec("fatalOutcome answers \"\" for a rule Save does not stop for", fo("coastal_no_port") === "", fo("coastal_no_port"));
      // The three sets of rules the header names, read from its evidence: the failed-load path, the owner's crashes.
      const refuse = ["land_not_in_state", "province_no_region", "state_split_strategic_regions", "fractioned_naval_region", "state_id_gap",
        "empty_state", "empty_state_with_content", "empty_capital_state"];
      // Moved 2026-09-17: state_no_air_base_or_rocket_site left the fatal set altogether. The failed-load path is in the
      // binary, but seven of the owner's launches reached a 1936 game with states missing those rows and nothing was
      // logged (nova_torture_0912 state 1083 is the clearest — owned by FRA, two land provinces, a VP, 22 building rows).
      // Moved with #a-naval-building-the-game-refuses-claims-no-crash: state_naval_building_without_coast left this list — the island
      // launch blamed on it died in the flag atlas, identically with no refused building — and is "untested" below.
      // Added 2026-09-23 with #a-dead-state-scope-runs-as-an-effect: country_history_state_missing. The owner launched an
      // 832-state Nova world WITH the dead state scopes its base-game country files still ran and it died at 1936.01.01.12
      // with EXCEPTION_ACCESS_VIOLATION (crashes/hoi4_20260917_201653); he launched the byte-identical world with exactly
      // those lines removed and it played 19 in-game days. The game ran the back-out control itself.
      // Added 2026-09-24 with #a-state-list-in-an-ai-strategy-is-never-checked: ai_strategy_state_list_missing. TEST 19 and
      // TEST 22 died on the first in-game hour with Italy's and Japan's lists in the faulting threads (1.19.3's 0x1094581, rbx = 844 /
      // 1018); TEST 23 was the same world with only those ids removed, and 0 threads faulted there.
      // Added with #a-coastless-navy-goes-to-sea: fleet_starts_on_land_with_no_sea — eleven launches died on one; TEST 22, the
      // same world with the coastless navies gone, loaded.
      // Added with #the-supply-queue-counts-naval-links: naval_region_queue_overflows — TEST 25 crashed in the supply queue;
      // TEST 26, the same world with only the region count raised, played nine months.
      // Added with #a-dead-state-read-is-fatal: script_state_read_unguarded — TEST 19, 22 and 23 died reading 910.DEN_develop_state_cost
      // (1.19.3's 0x54277F), TEST 23 with nothing else left; and the 2026-09-17 launch died in add_dynamic_modifier on a missing state and played
      // 19 days with those lines removed. Its twin script_state_check_unguarded is read from the code only, and stays "untested".
      const crash = ["naval_base_water_is_gone", "country_tag_after_dynamic_marker", "country_history_state_missing", "ai_strategy_state_list_missing", "fleet_starts_on_land_with_no_sea", "naval_region_queue_overflows", "script_state_read_unguarded"];
      rec("⭐⭐⭐ the rules that reach the failed-load path are \"refuses-to-load\"", refuse.every((r) => fo(r) === "refuses-to-load"), refuse.map((r) => `${r}=${fo(r)}`));
      // ⚠️ the count comes off the list, never typed beside it — this line read "the two" while the list held three.
      rec(`⭐⭐ the ${crash.length} the owner's launches crashed on are "crashes"`, crash.every((r) => fo(r) === "crashes"), crash.map((r) => `${r}=${fo(r)}`));
      rec("⭐⭐ everything else in the set is \"untested\" — no evidence of either", [...labels.FATAL].filter((r) => !refuse.includes(r) && !crash.includes(r)).every((r) => fo(r) === "untested"),
        [...labels.FATAL].filter((r) => !refuse.includes(r) && !crash.includes(r)).map((r) => `${r}=${fo(r)}`));
      const fv = typeof labels.fatalVerdict === "function" ? labels.fatalVerdict : () => ({});
      const vr = fv(["map_x_crossing", "naval_base_water_is_gone", "land_not_in_state"]);
      rec("fatalVerdict claims the strongest thing ONE present problem proves: a refusal …", /refuses to load/.test(String(vr.headline)), vr);
      rec("…then a crash", /crashes/.test(String(fv(["map_x_crossing", "naval_base_water_is_gone"]).headline)), fv(["map_x_crossing", "naval_base_water_is_gone"]));
      rec("…and otherwise only that Save stops", !/crash|refuse/i.test(String(fv(["map_x_crossing", "bmp_too_big"]).headline)) && /Save stops/.test(String(fv(["map_x_crossing", "bmp_too_big"]).headline)), fv(["map_x_crossing", "bmp_too_big"]));
      rec("…and its parts count each kind", Array.isArray(vr.parts) && vr.parts.length === 3 && vr.parts.every((s) => /^1 /.test(s)), vr.parts);
    }

    console.log("\n=== 2. the gate after a Save, run for real ===");
    rec("mapCrashGate lifted", GATE.length > 300, GATE.length);
    rec("openMapErrorsModal lifted", MODAL.length > 2000, MODAL.length);
    {
      const r = await runGate([P("land_not_in_state")]);
      rec("⭐⭐⭐ a map HOI4 refuses to load: the status line says so …", /refuses to load/.test(r.status), r.status);
      rec("…and calls nothing a crash", !/crash/i.test(r.status), r.status);
      rec("⭐⭐⭐ the popup's title says HOI4 refuses to load this map", /HOI4 refuses to load this map/.test(r.title) && !/crash/i.test(r.title), r.title);
      rec("⭐⭐ …and nothing in the popup promises a crash", !CERTAIN_CRASH.test(r.html), (r.html.match(CERTAIN_CRASH) || [])[0]);
      rec("…with the type-\"save\" gate still armed (the FATAL set is unchanged)", r.gateOpen);
      rec("⭐⭐ keeping it anyway says HOI4 refuses to load it, not that it crashes", /refuses to load/.test(r.keptStatus) && !/crash/i.test(r.keptStatus), r.keptStatus);
    }
    {
      const r = await runGate([P("naval_base_water_is_gone")]);
      rec("⭐⭐ a map with a crash the owner reproduced: the title says HOI4 crashes on it", /HOI4 crashes on this map/.test(r.title), r.title);
      rec("…and does not call it a refusal", !/refuses to load/.test(r.status + r.title), r.status);
      rec("…without the certainty words", !CERTAIN_CRASH.test(r.html + r.status), (r.html + r.status).match(CERTAIN_CRASH));
    }
    {
      const r = await runGate([P("map_x_crossing")]);
      rec("⭐⭐⭐ a fatal rule no launch has tested: neither a crash nor a refusal …", !/crash|refuses to load/i.test(r.title + r.status + r.keptStatus), [r.title, r.status, r.keptStatus]);
      rec("…only that Save stops for it", /Save stops for/.test(r.title) && /Save stops for/.test(r.status), [r.title, r.status]);
    }
    {
      const r = await runGate([P("land_not_in_state"), P("naval_base_water_is_gone"), P("map_x_crossing")]);
      rec("⭐ a mix: the title claims the refusal one of them proves", /HOI4 refuses to load this map/.test(r.title), r.title);
      rec("…and the intro counts each kind", /1 that makes HOI4 refuse to load the map/.test(r.html) && /1 that HOI4 has crashed on/.test(r.html) && /1 that no launch has yet shown/.test(r.html), r.html.slice(0, 900));
    }
    {
      const r = await runGate([P("coastal_no_port")]);
      rec("THE CONTROL: errors the game loads past still open the popup after a Save", r.html.length > 0, r.status);
      rec("⭐⭐⭐ …and its title no longer says the map will crash HOI4", !/crash/i.test(r.title) && r.title.length > 0, r.title);
      rec("⭐⭐ …nor its intro, which says what the status line says: the game loads past them", !/crash|can't load|cannot load/i.test(r.html) && /loads past/.test(r.html), r.html.slice(0, 700));
      rec("…and no type-\"save\" gate", !r.gateOpen);
    }
    {
      // null, not undefined: runGate's default would turn an undefined context into "postsave".
      const r = await runGate([P("land_not_in_state")], { viaGate: false, context: null });
      rec("THE CONTROL: Map Errors opened by hand keeps its plain title", /^Map Errors$/.test(r.title.trim()), r.title);
    }

    console.log("\n=== 3. every other line of public/map.js a modder reads ===");
    {
      const lines = MASKED.split("\n").map((t, i) => ({ line: i + 1, text: t }));
      const certain = lines.filter((x) => CERTAIN_CRASH.test(x.text)).map((x) => `map.js:${x.line} ${x.text.trim().slice(0, 160)}`);
      rec("⭐⭐⭐ no code line in public/map.js promises a certain crash", certain.length === 0, certain);
      const gap = lines.filter((x) => /close an id gap/.test(x.text));
      rec("THE CONTROL: Auto-fix's state-gap summary was found", gap.length === 1, gap.map((x) => x.line));
      rec("⭐⭐ …and it says a gap makes HOI4 refuse to load the map, not crash (state_id_gap reaches the failed-load path)",
        gap.length === 1 && /refuses to load/.test(gap[0].text) && !/crash/i.test(gap[0].text), gap.map((x) => x.text.trim().slice(0, 240)));
      // the line that says what the step DID (parts.push): since B6-1 the step also says its failure, on a line of its own that names the
      // same provinces ("could not give the newly-coastal provinces a port: …"), and that one makes no claim about what HOI4 does
      const port = lines.filter((x) => /newly-coastal province/.test(x.text) && /\bparts\.push\(/.test(x.text));
      rec("THE CONTROL: Auto-fix's new-port summary was found", port.length === 1, port.map((x) => x.line));
      rec("…and it quotes the engine's own guess instead of stating a crash (coastal_no_port logs and carries on)",
        port.length === 1 && !/none crashes/.test(port[0].text) && /likely crash/.test(port[0].text), port.map((x) => x.text.trim().slice(0, 240)));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  }
  console.log(`\n=== the Save gate says what HOI4 does with the map: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
