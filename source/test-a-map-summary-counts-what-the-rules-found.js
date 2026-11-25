// A map check's HEADLINE says how much of the map its problems name, not how many rules fired.
// #a-map-summary-counts-rules-not-what-they-found
//
// ⛔ THE DEFECT. Every line that summarises the map checks counted RULES:
//   * the Map Errors popup — "1 error (the game loads past them…) · 2 warnings (loads, but won't work right)";
//   * the status line a Save ends on (public/map.js mapCrashGate) — "⚠️ 1 problem the game will load past";
//   * Mod Health's "Will it crash?" verdict — "no, it loads, but 1 serious problem(s) break the map in-game".
// A rule that found one thing and a rule that found five thousand both read "1".
//
// MEASURED on the world the owner built and launched on 2026-09-16 — a new mod, then Delete map, Generate land at
// 35%, Auto-fix twice. It loaded, reached the menu and started a 1936 game, so Nova's "no fatal error" verdict
// held. Then he looked at it: "the world looked super weird … it was still the same world but full of holes …
// full of weird things that looked like glass". The mod's definition.csv had turned 6,594 of the base game's
// 10,155 land provinces into sea while shipping no provinces.bmp, so the shapes stayed and two thirds of the
// world drowned in place. Nova's verdict on that map, /api/map/validate driven for real: THREE problems, one
// error, none fatal. Those three problems name 8,023 things — 5,049 sea provinces sitting inside states, 2,967
// of the 4,566 divisions the mod starts, 7 dated dockyards — and no headline printed one of those numbers.
// True rule-by-rule and false as a whole.
//
// ⚠️ NO NEW RULE, NO NEW SEVERITY, NO THRESHOLD. The six shipping maps each name 5–69 things in total (vanilla 8,
// MD 14, R56 69, OWB 45, NV 31, RoN 5, measured by running the validator over all six); this map names 8,023.
// The numbers separate themselves, so the fix prints what the rules already counted and ranks by it. A naval
// total conversion that deliberately made a lot of sea reports the same rules it reported before.
//
// ⛔ AND THE SIZE COMES FROM `total`, NEVER FROM AN ARRAY LENGTH. Every example list on a problem is capped (60
// items, 40, 20 provinces, 80 countries) — measuring the payload would report the cap, which is exactly the bug
// 8ee6db7 fixed in the messages ("61 sea province(s)" for 5,049). A rule that counted itself carries `total` and
// `totalNoun`; one that did not is left out of the clause rather than guessed at.
//
// The three surfaces are DRIVEN, not read: mapCrashGate and openMapErrorsModal are lifted out of public/map.js
// and run, Mod Health's panel script is run whole, and the problems they are given are produced by the real
// validateMapModel / validateMapBitmap on fixtures — not hand-written objects.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
const tmps = [HOME, APPDATA_DIR];

const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments, stripJsComments } = require("./testlib-strip-comments.js");

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}

// ── The page code, lifted and run. Line endings are detected: a fresh worktree is checked out CRLF while
//    D:/Nova's public/map.js is LF, and a bare-newline anchor would come back empty there — and an empty
//    lift makes this file SKIP its real checks, which reads as a pass. ────────────────────────────────────
const MAPJS = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const EOL = MAPJS.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
const MASKED = maskJsComments(MAPJS);
const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(EOL + "  }", s); return e < 0 ? "" : MAPJS.slice(s, e + EOL.length + 3); };
const GATE = grab("async function mapCrashGate");
const MODAL = grab("function openMapErrorsModal(");

function mkEl() {
  const q = new Map(), listeners = {};
  return { style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "", dataset: {}, listeners,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {},
    querySelector(sel) { if (!q.has(sel)) q.set(sel, mkEl()); return q.get(sel); }, querySelectorAll: () => [] };
}
/** Run the REAL Save gate over a validate response, and return its status line plus the popup it opened. */
async function runGate(problems) {
  const v = { ok: true, problems,
    errors: problems.filter((p) => p.severity === "error").length,
    warnings: problems.filter((p) => p.severity !== "error").length };
  let status = "";
  const overlays = [];
  const sandbox = {
    console, JSON, encodeURIComponent, Date,
    window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = mkEl(); overlays.push(o); return o; },
      body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0, statusEl: { style: {} }, setStatus: (s) => { status = String(s); },
    modPath: () => "D:/fixture", escHtml: (s) => String(s == null ? "" : s), hasPendingMapEdits: () => false,
    load: async () => {},
    fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/validate") === 0 ? v : {}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(MODAL + EOL + GATE + EOL + "globalThis.__gate = mapCrashGate;", sandbox);
  await sandbox.__gate({ done: 1 });
  return { status, html: (overlays[overlays.length - 1] || mkEl()).innerHTML };
}
/** Run the REAL Mod Health "Will it crash?" panel script over the same response. */
async function runModHealth(problems) {
  const v = { ok: true, problems,
    errors: problems.filter((p) => p.severity === "error").length,
    warnings: problems.filter((p) => p.severity !== "error").length };
  const panel = { innerHTML: "", insertAdjacentHTML() {} };
  let runFn = null;
  const sandbox = {
    console, JSON, encodeURIComponent,
    window: { NovaMapRuleLabels: labels },
    localStorage: { getItem: () => "D:/fixture-mod" },
    document: { readyState: "complete", addEventListener() {}, getElementById: (id) => (id === "mhCrashCheck" ? panel : null) },
    setTimeout: (fn) => { runFn = fn; return 0; },
    fetch: async (url) => ({ json: async () => {
      const u = String(url);
      if (u.indexOf("/api/root") === 0) return { hoi4GameRoot: "D:/fixture-game" };
      if (u.indexOf("/api/map/validate") === 0) return v;
      if (u.indexOf("/api/modversion") === 0) return { ok: true, severity: "ok" };
      if (u.indexOf("/api/modhealth/loc-check") === 0) return { ok: true, problems: [] };
      return {};
    } }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8"), sandbox);
  if (typeof runFn === "function") await runFn();
  return panel.innerHTML;
}

(async () => {
  try {
    console.log("\n=== 1. the shared contract: a problem's SIZE is what the rule counted, never a list length ===");
    {
      rec("map-rule-labels.js exports problemScale, scaleClause and bySizeDescending",
        typeof labels.problemScale === "function" && typeof labels.scaleClause === "function" && typeof labels.bySizeDescending === "function");
      const scale = labels.problemScale || (() => null);
      const clause = labels.scaleClause || (() => "");
      const bySize = labels.bySizeDescending || ((a) => a);
      // The shape the owner's map actually produced: a five-thousand-strong problem carrying capped example lists.
      const capped = { severity: "error", rule: "non_land_province_in_state", total: 5049, totalNoun: "provinces",
        items: new Array(60).fill(0).map((_, i) => ({ province: i })) };
      const s = scale(capped);
      rec("⭐⭐⭐ the size of a capped problem is its total, not the length of its example list",
        !!s && s.n === 5049, s && `${s.n} (items.length = ${capped.items.length})`);
      rec("…and it carries what was counted", !!s && s.noun === "provinces", s && s.noun);
      // A rule that did not count itself must not be guessed at from its arrays — that is the cap bug again.
      const uncounted = { severity: "warning", rule: "vp_not_in_state", provinces: [1, 2, 3] };
      rec("⭐⭐ a problem that did not count itself has NO size (it is never inferred from an array)", scale(uncounted) === null, JSON.stringify(scale(uncounted)));
      rec("…so a list of only uncounted problems produces no clause at all", clause([uncounted, uncounted]) === "", clause([uncounted, uncounted]));
      // Two rules counting the same noun read as one figure, biggest noun first.
      const many = [capped,
        { severity: "warning", rule: "division_starts_on_water", total: 2967, totalNoun: "divisions" },
        { severity: "warning", rule: "dated_naval_building_without_coast", total: 7, totalNoun: "naval buildings" },
        { severity: "error", rule: "state_no_category", total: 12, totalNoun: "states" },
        { severity: "error", rule: "unknown_state_category", total: 3, totalNoun: "states" }];
      const c = clause(many);
      rec("⭐⭐ the clause sums each noun and puts the biggest first", c === "5,049 provinces, 2,967 divisions, 15 states and 7 naval buildings", c);
      rec("…with thousands separators, the way the messages write them", /5,049/.test(c) && /2,967/.test(c), c);
      // Rise of Nations' entire contribution to this clause is one dated naval base — "1 naval buildings" in a
      // line meant to be read carefully is the wrong kind of sloppy.
      const oneOf = clause([{ rule: "dated_naval_building_without_coast", total: 1, totalNoun: "naval buildings" }]);
      rec("⭐ one of something reads as one", oneOf === "1 naval building", oneOf);
      const oneState = clause([{ rule: "state_buildings_exceed_slots", total: 1, totalNoun: "states" }]);
      rec("…for a plain plural too", oneState === "1 state", oneState);
      const order = bySize(many).map((p) => p.rule);
      rec("⭐⭐ biggest-first ordering", order[0] === "non_land_province_in_state" && order[1] === "division_starts_on_water", order);
      const mixed = bySize([uncounted, { rule: "a", total: 9 }, { rule: "b" }, { rule: "c", total: 900 }]).map((p) => p.rule);
      rec("…and uncounted problems keep the order the rules ran in", JSON.stringify(mixed) === JSON.stringify(["c", "a", "vp_not_in_state", "b"]), mixed);
    }

    console.log("\n=== 2. every map rule that counts itself says WHAT it counted (derived from map-data.js) ===");
    {
      // Derived, never typed: each problems.push(...) chunk of the shipping source, comments stripped — this
      // file's own prose contains the field names the scan looks for.
      const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      const at = [...src.matchAll(/problems\.push\(/g)].map((m) => m.index);
      rec("map-data.js pushes problems (the scan has something to read)", at.length > 20, at.length);
      // …each ending at the next push OR at the end of its own function. The last push of a function ran on to the next push
      // wherever that was: building_not_over_land's chunk was 5,000 lines of other functions, and read a `total:` from the first
      // of them that had one (findModelsOnTheOldGround's answer, #a-model-left-on-the-old-ground) as its own.
      const fnEnd = (s) => { const e = src.indexOf("\nfunction ", s); return e < 0 ? src.length : e; };
      const chunks = at.map((s, i) => src.slice(s, Math.min(fnEnd(s), i + 1 < at.length ? at[i + 1] : Math.min(src.length, s + 4000))));
      const counted = chunks.filter((c) => /\btotal:/.test(c));
      const namedNoun = counted.filter((c) => /\btotalNoun:/.test(c));
      const ruleOf = (c) => (/rule: "([a-z_0-9]+)"/.exec(c) || [])[1] || "(unnamed)";
      rec("some rules count themselves", counted.length > 0, counted.length);
      rec("⭐⭐⭐ every rule that carries `total` also says what it counted",
        namedNoun.length === counted.length, counted.filter((c) => !/\btotalNoun:/.test(c)).map(ruleOf));
    }

    console.log("\n=== 3. the rules of the owner's world, run for real, carry their size ===");
    const realProblems = [];
    {
      // (a) non_land_province_in_state — the unit-level model the panel renders from.
      const N = 137;                                   // past every cap on this problem, so no array length can match
      const provinces = [{ id: 1, type: "land", r: 1, g: 1, b: 1, continent: 1 }];
      const provinceToState = { 1: 1 };
      const seaIds = [];
      for (let i = 0; i < N; i++) {
        const id = 1000 + i; seaIds.push(id);
        provinces.push({ id, type: "sea", r: (i % 200) + 20, g: 3, b: 4, continent: 0 });
        provinceToState[id] = 1;
      }
      const model = { provinces, provinceToState, states: [{ id: 1, name: "S1", provinces: [1, ...seaIds] }], capitals: {} };
      const p = md.validateMapModel(model).find((x) => x.rule === "non_land_province_in_state");
      rec("non_land_province_in_state fires on the model", !!p);
      rec("⭐⭐ …and its total is every sea province in a state, not the capped list",
        !!p && p.total === N && (p.items || []).length < N, p && `total=${p.total} items=${(p.items || []).length}`);
      rec("…and it says it counted provinces", !!p && p.totalNoun === "provinces", p && p.totalNoun);
      if (p) realProblems.push(p);
    }
    {
      // (b) dated_naval_building_without_coast — a self-contained mod (replace_path="map" hides the game below),
      //     with more landlocked states carrying a dated dockyard than either example list keeps.
      const COL = (i) => [((i * 29) % 210) + 15, ((i * 67) % 210) + 15, ((i * 101) % 210) + 15];
      const NS = 51;                                      // > the 40-item and 20-state caps on this problem
      const W = 8 * NS, H = 8;
      const provAt = (x) => Math.floor(x / 8) + 1;        // one 8x8 land province per state, no sea anywhere
      const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-dated-")); tmps.push(d);
      mk(d, "descriptor.mod", 'name="Scale"\nreplace_path="map"\nreplace_path="history/states"\n');
      mk(d, "map/provinces.bmp", bmp24(W, H, (x) => COL(provAt(x))));
      mk(d, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(
        Array.from({ length: NS }, (_, i) => { const [r, g, b] = COL(i + 1); return `${i + 1};${r};${g};${b};land;false;plains;1`; })
      ).join("\n") + "\n");
      for (let i = 0; i < NS; i++) {
        const id = 70 + i;
        mk(d, `history/states/${id}-Inland.txt`,
          `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory={\n\t\towner = ENG\n`
          + `\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 3\n\t\t\t}\n\t\t}\n\t}\n\tprovinces={\n\t\t${i + 1}\n\t}\n}\n`);
      }
      const p = (md.validateMapBitmap({ modRoot: d, gameRoot: d, dependencyRoots: [] }) || [])
        .find((x) => x.rule === "dated_naval_building_without_coast");
      rec("dated_naval_building_without_coast fires on the fixture", !!p, p && p.message.slice(0, 120));
      rec("⭐⭐ …and its total is every dated naval building, not the capped list",
        !!p && p.total === NS && (p.items || []).length < NS, p && `total=${p.total} items=${(p.items || []).length} states=${(p.states || []).length}`);
      rec("…and it says it counted naval buildings", !!p && p.totalNoun === "naval buildings", p && p.totalNoun);
      if (p) realProblems.push(p);
    }
    {
      // (c) division_starts_on_water — the base game below supplies the order of battle, the mod drowns the land
      //     under it. 8x8 provinces of 32px: 1..48 land below, and the mod sinks rows 3-5 (25..48).
      const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
      const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
      const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
      const definition = (isLand) => ["0;0;0;0;land;false;unknown;0"].concat(
        Array.from({ length: 64 }, (_, i) => { const p = i + 1, [r, g, b] = COL(p), L = isLand(p);
          return `${p};${r};${g};${b};${L ? "land" : "sea"};false;${L ? "plains" : "ocean"};${L ? 1 : 0}`; })
      ).join("\n") + "\n";
      const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-game-")); tmps.push(game);
      mk(game, "map/provinces.bmp", BMP);
      mk(game, "map/definition.csv", definition((p) => p <= 48));
      const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n`;
      const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
      mk(game, "history/states/1.txt", st(1, range(1, 24)));
      mk(game, "history/states/2.txt", st(2, range(25, 48)));
      mk(game, "history/countries/ZZZ - Zzzland.txt", 'capital = 1\noob = "ZZZ_1936"\n');
      // > the 40-item cap, over 24 distinct provinces, and deliberately MORE than the dated-dockyard fixture
      // above: these two problems arrive in the order validateMapBitmap pushes them (dated first), so the
      // ranking check below only bites while the later one is the bigger one.
      const DROWNED = 63;
      const divs = Array.from({ length: DROWNED }, (_, i) => `\tdivision = { name = "D${i}" location = ${25 + (i % 24)} division_template = "Inf" }`);
      const home = range(1, 6).map((p) => `\tdivision = { name = "H${p}" location = ${p} division_template = "Inf" }`);
      mk(game, "history/units/ZZZ_1936.txt",
        ['division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', "units = {", ...divs, ...home, "}", ""].join("\n"));
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-mod-")); tmps.push(mod);
      mk(mod, "descriptor.mod", 'name="ScaleMod"\n');
      mk(mod, "map/definition.csv", definition((p) => p <= 24));   // rows 3-5 drowned, shapes inherited
      const p = (md.validateMapBitmap({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) || [])
        .find((x) => x.rule === "division_starts_on_water");
      rec("division_starts_on_water fires on the fixture", !!p, p && p.message.slice(0, 120));
      rec("⭐⭐⭐ …and its total is every drowned division, not the 20-province / 40-item lists",
        !!p && p.total === DROWNED && (p.provinces || []).length < DROWNED && (p.items || []).length < DROWNED,
        p && `total=${p.total} provinces=${(p.provinces || []).length} items=${(p.items || []).length}`);
      rec("…and it says it counted divisions", !!p && p.totalNoun === "divisions", p && p.totalNoun);
      if (p) realProblems.push(p);
    }

    console.log("\n=== 4. the three surfaces a modder reads, driven over those real problems ===");
    rec("the page code was lifted (an empty lift would make the rest of this file pass by not running)",
      GATE.length > 400 && MODAL.length > 400, `gate ${GATE.length} modal ${MODAL.length}`);
    rec("all three rules of the owner's world produced a problem to drive with", realProblems.length === 3, realProblems.map((p) => p.rule));
    if (GATE && MODAL && realProblems.length === 3) {
      // Read through a guard: backing the shared module out must leave this section FAILING, not throwing —
      // an exception here would stop the remaining checks from running, and a run that stops short is a run
      // whose later checks silently did not happen.
      const clauseFn = typeof labels.scaleClause === "function" ? labels.scaleClause : () => "";
      const expect = clauseFn(realProblems);
      rec("the clause for this fixture is not empty", !!expect, expect);
      const { status, html } = await runGate(realProblems);
      rec("⭐⭐⭐ the status line a Save ends on says how much of the map the problems name", status.includes(expect), status.replace(/\n/g, " | "));
      rec("…and it still says the game loads past them (no new crash claim)", /load past/.test(status) && !/will crash/i.test(status), status.replace(/\n/g, " | "));
      rec("⭐⭐⭐ the Map Errors popup's summary says it too", html.includes(expect), html.replace(/<[^>]+>/g, " ").slice(0, 300));
      // Ranking: the warnings must appear biggest-first, whichever rule ran first. Which IS bigger is read off
      // the problems themselves, never assumed from the fixture's shape.
      const warnPs = realProblems.filter((p) => p.severity !== "error");
      const wanted = warnPs.slice().sort((a, b) => b.total - a.total);
      const shownAt = (p) => html.indexOf(p.message);
      const inOrder = wanted.every((p, i) => i === 0 || (shownAt(wanted[i - 1]) >= 0 && shownAt(wanted[i - 1]) < shownAt(p)));
      rec("⭐⭐ the warnings are listed biggest-first, not in the order the rules ran",
        warnPs.length > 1 && inOrder,
        wanted.map((p) => `${p.rule} total=${p.total} @${shownAt(p)}`));
      rec("…and the fixture really does put them in the other order first, so that check can bite",
        warnPs.length > 1 && warnPs[0].total < warnPs[1].total, warnPs.map((p) => `${p.rule}=${p.total}`));
      const mh = await runModHealth(realProblems);
      rec("⭐⭐⭐ Mod Health's \"Will it crash?\" verdict says it as well", mh.includes(expect), mh.replace(/<[^>]+>/g, " ").slice(0, 300));
      rec("…and Mod Health still says it loads", /it loads/.test(mh) && !/will crash\? — HOI4 refuses/.test(mh), mh.replace(/<[^>]+>/g, " ").slice(0, 200));
    }

    console.log("\n=== 5. the first line a modder reads says WHY there are that many ===");
    {
      // The rule that leads the owner's popup counted 5,049 sea provinces in states and never said where they came
      // from — every one of them is LAND in the map below, drowned in place by the mod's own definition.csv. The
      // count is read from the layer below, so it is the map's answer and not an assumption.
      const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
      const COLp = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
      const definition = (isLand) => ["0;0;0;0;land;false;unknown;0"].concat(
        Array.from({ length: 64 }, (_, i) => { const p = i + 1, [r, g, b] = COLp(p), L = isLand(p);
          return `${p};${r};${g};${b};${L ? "land" : "sea"};false;${L ? "plains" : "ocean"};${L ? 1 : 0}`; })
      ).join("\n") + "\n";
      const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
      const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n`;
      const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-drown-game-")); tmps.push(game);
      mk(game, "map/provinces.bmp", bmp24(256, 256, (x, y) => COLp(provAt(x, y))));
      mk(game, "map/definition.csv", definition((p) => p <= 48));
      mk(game, "history/states/1.txt", st(1, range(1, 24)));
      mk(game, "history/states/2.txt", st(2, range(25, 48)));
      mk(game, "history/countries/ZZZ - Zzzland.txt", "capital = 1\n");

      const drowner = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-drown-mod-")); tmps.push(drowner);
      mk(drowner, "descriptor.mod", 'name="Drowner"\n');
      mk(drowner, "map/definition.csv", definition((p) => p <= 24));   // rows 25..48 drowned, shapes inherited
      const p = md.validateMapModel(md.buildMapModel({ modRoot: drowner, gameRoot: game, dependencyRoots: [] }))
        .find((x) => x.rule === "non_land_province_in_state");
      rec("non_land_province_in_state fires on the drowned world", !!p, p && p.message.slice(0, 100));
      rec("⭐⭐ …and it counts how many of them the map below has as LAND", !!p && p.drowned === 24 && p.total === 24,
        p && { drowned: p.drowned, total: p.total });
      rec("⭐⭐⭐ …and says so, in the first line the modder reads",
        !!p && /LAND in the map your mod builds on/.test(p.message) && /drowned them where they stand/.test(p.message),
        p && p.message.slice(0, 260));

      // THE CONTROL: a sea province that was ALREADY sea below is not called something the mod drowned.
      const lister = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scale-lister-mod-")); tmps.push(lister);
      mk(lister, "descriptor.mod", 'name="Lister"\n');
      mk(lister, "history/states/2.txt", st(2, range(25, 48).concat([49, 50])));   // 49/50 are sea below and stay sea
      const q = md.validateMapModel(md.buildMapModel({ modRoot: lister, gameRoot: game, dependencyRoots: [] }))
        .find((x) => x.rule === "non_land_province_in_state");
      rec("THE CONTROL: a state that lists an always-sea province is still reported", !!q && q.total === 2, q && { total: q.total });
      rec("⭐⭐ …but nothing is called drowned, and the sentence is absent",
        !!q && q.drowned === 0 && !/LAND in the map your mod builds on/.test(q.message), q && { drowned: q.drowned });
    }

    console.log("\n=== 6. a map whose rules counted nothing is not given an empty clause ===");
    {
      // The shipping maps are mostly problems that do not count themselves (a VP outside its state, an anchor in
      // the wrong state). Those must read exactly as they did before: no dangling "they name" with nothing in it.
      const quiet = [{ severity: "warning", rule: "vp_not_in_state", message: "2 victory point(s) are not in their state." },
        { severity: "warning", rule: "building_anchor_wrong_state", message: "7 building anchor(s) name another state." }];
      if (GATE && MODAL) {
        const { status, html } = await runGate(quiet);
        rec("⭐⭐ no scale sentence when nothing counted itself (status line)", !/they name/i.test(status) && !/The problems on this map name/.test(status), status.replace(/\n/g, " | "));
        rec("…nor in the popup", !/Between them they name/.test(html), html.replace(/<[^>]+>/g, " ").slice(0, 200));
        rec("…and the warnings are still reported", /victory point/.test(status + html), status.replace(/\n/g, " | ").slice(0, 200));
      }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== a map summary counts what the rules found: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
