// 🌍 Generate a world SAYS WHAT IT WILL DO, AND WHAT IT DID — in the words each button's own click uses. #a-world-says-what-each-step-said
//
// The confirm, the progress panel, the done note and the stop note are the page's own functions (testlib-world-page.js lifts the
// world block out of public/map.js verbatim) run on REAL answers: a whole world is built here through the server's own route
// (POST /api/map/world-run, the forked builder) on testlib-split-world's small fixture, and GET /api/map/world-run?answers=1 hands
// back the record and every step's answer. Then the same answers are REPLAYED through world-run.js runWorldSequence with a failure
// injected at each step (an error answer, a copy it could not make, a builder that died with no answer), and the stop note is read.
//
//   1. the confirm: the six steps under world-run.js STEPS' own titles; where the province map comes from (game / dependency / own);
//      each descriptor file; the state, country and region files; the launcher entry the mod lacks; the copies; ↶ Undo
//   2. the typed GENERATE shows exactly when the plan says the mod has a world of its own, and Go waits for it
//   3. the owner lines cover #mapWorldOwnerMode's options, which are #mapGenOwnerMode's (both from map.html)
//   4. the done note SUMS p.total and judges fatal with isFatalRule (map-rule-labels.js)
//   5. the stop note at every step: the step and its title, exactly the steps done, each copies folder an answer names (and only
//      those, each a folder on disk), "Nothing was written" only for a step 1 that wrote nothing, "stopped part-way" whenever the
//      answer cannot say what the step wrote, "written in full" only for a check that could not run, "no copies" only when no
//      step had overwritten a file, and any half-written file named
//   6. each step's line is its own button's: Delete map's notes are the ones flushMapSaves writes for the same answer (lifted and run),
//      but never the survivors advice; Generate land's is the click's own note without "Next: 🗺 Redraw regions"; Auto-fix's is
//      the popup's summary (testlib-map-page autoFixSummary) for the recorded answer and for every literal answer
//      test-every-auto-fix-step-is-in-the-summary.js hands its summary
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

// ── the sandbox, before server.js loads ─────────────────────────────────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-says-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const { createApp } = require("./server.js");
const W = require("./world-run.js");
const WP = require("./testlib-world-page.js");
const TP = require("./testlib-map-page.js");
const L = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const CHOICES = { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b) };
};
const NO_TIMERS = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
/** The page with nothing to fetch: its pure functions, run where they were declared (function declarations are the context's). */
const page = WP.worldPage({ fetch: async () => { throw new Error("this page has nothing to fetch"); }, timers: NO_TIMERS });
const P = page.sb;
const text = (html) => String(html).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const clone = (x) => JSON.parse(JSON.stringify(x));

/** A Response-like for a replayed answer. */
const answer = (body, status = 200) => ({ status, json: async () => clone(body) });
/** The answers of one recorded run, sent back in the order runWorldSequence asks for them; `fail` replaces the answer of one step. */
function replayFetch(A, fail) {
  let autoFixes = 0, validates = 0;
  const sea = (A.generate && A.generate.asked && A.generate.asked.sea) || 1;
  const strip = (o, ...keys) => { const c = clone(o); for (const k of keys) delete c[k]; return c; };
  const pick = (key, normal) => (fail && fail.key === key ? fail.respond(normal) : normal);
  return async (url, init) => {
    const u = String(url).replace(/^https?:\/\/[^/]+/, "");
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (u === "/api/map/prepare-world") return pick("prepare", answer(A.prepare));
    if (u === "/api/map/blank-to-sea") return pick("blank", answer(A.blank));
    if (u.startsWith("/api/map/model")) return answer({ ok: true, provinces: Array.from({ length: sea }, () => ({ type: "sea" })) });
    if (u === "/api/map/generate-land") return pick("generate", answer(strip(A.generate, "asked")));
    if (u === "/api/map/auto-fix") { autoFixes++; return autoFixes === 1 ? pick("autofix", answer(A.autofix)) : pick("refix", answer(strip(A.refix, "validateAfter"))); }
    if (u === "/api/map/rebuild-regions") return body && body.dryRun ? pick("regions-dry", answer(A.regions.plan)) : pick("regions", answer(A.regions.write));
    if (u.startsWith("/api/map/validate")) { validates++; return validates === 1 ? pick("check", answer(A.check.validate)) : pick("refix-check", answer(A.refix.validateAfter)); }
    return answer({ ok: false, error: "unexpected " + u }, 404);
  };
}
/**
 * The run record the main server keeps, built from runWorldSequence's step events the way server.js's child.on("message") builds
 * it — and its exit handler for a builder that died with no answer. Checked below against the REAL record of the same run.
 */
function recordOf(events, { plan, error = "", failedStep = "", died = false, leftovers = [] } = {}) {
  const run = { id: "replay", modName: plan.modName, choices: CHOICES, state: "running", startedAt: 1000, endedAt: null, stepIndex: 0, step: W.STEPS[0].key,
    error: "", failedStep: "", plan, leftovers, steps: W.STEPS.map((s) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional, state: "waiting", startedAt: null, endedAt: null, error: "" })), answers: {} };
  for (const m of events) {
    if (m.t !== "step") continue;
    const s = run.steps.find((x) => x.key === m.key);
    s.state = m.state;
    if (m.state === "running") { s.startedAt = m.at; run.stepIndex = run.steps.indexOf(s); run.step = s.key; }
    else {
      s.endedAt = m.at;
      if (m.error) s.error = m.error;
      if (m.validateFailed) s.validateFailed = true;
      if (m.copyFailures) s.copyFailures = m.copyFailures;
      if (m.answer !== undefined) run.answers[m.key] = m.answer;
      if (m.state === "failed") run.failedStep = m.key;
    }
  }
  const how = died ? "failed" : error ? "failed" : "done";
  if (died) { run.failedStep = run.failedStep || run.step; error = error || "the world builder stopped unexpectedly (exit code 1): Error: out of memory"; }
  if (how === "failed" && !run.failedStep) run.failedStep = failedStep || run.step;
  run.state = how; run.endedAt = 400000; run.error = error;
  const cur = run.steps[run.stepIndex];
  if (how !== "done" && cur && (cur.state === "running" || cur.state === "waiting")) { cur.state = "failed"; cur.endedAt = run.endedAt; if (error && !cur.error) cur.error = error; }
  for (const x of run.steps) if (x.state === "waiting" && how !== "done") x.state = "not-run";
  return run;
}
async function replay(A, plan, fail, extra = {}) {
  const events = [];
  let thrown = null;
  try {
    await W.runWorldSequence({ base: "", modPath: "M", choices: CHOICES, onStep: (m) => events.push(clone(m)), fetchImpl: replayFetch(A, fail), autoFixOffers: extra.offers });
  } catch (e) { thrown = e; }
  if (extra.died) {
    // the builder died during this step: no "failed" event and no answer — only the events before it, and the step running
    const at = events.findIndex((m) => m.t === "step" && m.key === extra.died && m.state !== "running");
    const kept = at === -1 ? events : events.slice(0, at);
    return recordOf(kept, { plan, died: true, leftovers: extra.leftovers || [] });
  }
  return recordOf(events, { plan, error: thrown ? thrown.message : "", failedStep: thrown && thrown.step, leftovers: extra.leftovers || [] });
}
/** The folders a step's answer names that exist on disk with at least one file in them — its copies. A `plan` inside an answer is
 *  the confirm's plan (step 1) or Redraw's dry run, which name where copies go (copiesUnder), not copies a step took. */
function copyFoldersNamedBy(a) {
  const found = new Set();
  const visit = (v, key) => {
    if (key === "plan") return;
    if (typeof v === "string") { if (v.startsWith(DIRS.home) && fs.existsSync(v) && fs.statSync(v).isDirectory() && countFiles(v) > 0) found.add(v); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x, ""); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(a, "");
  return [...found];
}
function countFiles(d) { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(d, e.name)) : 1; return n; }

(async () => {
  let srv = null;
  try {
    srv = await listen(createApp());
    const main = client(`http://127.0.0.1:${srv.address().port}`);
    const made = await main.post("/api/mod/create", { modName: "Says A" });
    const modPath = made.body && made.body.modRoot;
    rec("THE FIXTURE: a mod made the way 🏠 New mod makes one", !!modPath, made.body);
    const dry = await main.post("/api/map/prepare-world", { modPath, dryRun: true });
    const plan = dry.body && dry.body.plan;
    rec("THE FIXTURE: the confirm's plan (prepare-world dryRun)", dry.status === 200 && !!plan && plan.bitmap && plan.bitmap.from === "game", dry.body);
    const start = await main.post("/api/map/world-run", Object.assign({ modPath, confirm: true }, CHOICES));
    let run = null;
    for (let i = 0; i < 1200 && start.status === 200; i++) { const g = await main.get("/api/map/world-run"); run = g.body && g.body.run; if (run && run.state !== "running") break; await sleep(100); }
    run = (await main.get("/api/map/world-run?answers=1")).body.run;
    const A = run.answers || {};
    rec("THE FIXTURE: a whole world built through the server's own route, every step answered", run.state === "done" && ["prepare", "blank", "generate", "autofix", "regions", "check"].every((k) => A[k]), { state: run.state, error: run.error, keys: Object.keys(A) });
    const STEP = (key) => W.STEPS.find((s) => s.key === key);

    console.log("\n0. the replay stands in for the run: the same answers through runWorldSequence give the record the server kept");
    {
      const r = await replay(A, run.plan, null);
      const shape = (x) => x.steps.map((s) => `${s.key}:${s.state}`).join(" ");
      rec("⭐ the replayed record's steps are the real record's", shape(r) === shape(run) && r.state === run.state, { replayed: shape(r), real: shape(run) });
      rec("…and its answers are the real ones", JSON.stringify(r.answers) === JSON.stringify(Object.fromEntries(Object.entries(A).filter(([k]) => k !== "refix"))) || JSON.stringify(r.answers) === JSON.stringify(A), Object.keys(r.answers));
    }

    console.log("\n1. the confirm says what each of the six steps will do to THIS mod");
    const C = { pct: 35, seed: 1, ownerMode: "inherit", owner: "" };
    const body = P.worldConfirmBody(plan, C), bodyText = text(body);
    for (const s of W.STEPS.filter((x) => !x.optional)) rec(`its item ${s.k} is world-run.js's step title "${s.title}"`, body.includes(`<b>${s.title}`));
    rec("…in the order world-run.js runs them", W.STEPS.filter((x) => !x.optional).map((s) => bodyText.indexOf(s.title)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])));
    rec("the game's province map: copied from the base game, and from then on the mod's", /Copy the province map \(map\/provinces\.bmp, [\d.]+ MB\) from the base game into your mod/.test(bodyText) && /your mod owns every province shape in it/.test(bodyText));
    const depPlan = Object.assign(clone(plan), { bitmap: { own: false, from: "dependency", fromName: "Big Base Mod", bytes: plan.bitmap.bytes }, dependencyNames: ["Big Base Mod"] });
    const depText = text(P.worldConfirmBody(depPlan, C));
    rec("a dependency's province map: copied from it, by name, and its later changes do not reach the mod", /from Big Base Mod, the mod yours is built on/.test(depText) && depText.includes("Later changes to Big Base Mod's province map will not reach your mod."), depText.slice(0, 500));
    rec("…and the states of the base game AND the dependency stop loading", depText.includes("so the states of the base game and Big Base Mod stop loading"));
    const ownText = text(P.worldConfirmBody(Object.assign(clone(plan), { bitmap: { own: true, from: "own" } }), C));
    rec("the mod's own province map: nothing to copy, drawn in it", ownText.includes("Your mod already has its own province map (map/provinces.bmp)") && !/Copy the province map/.test(ownText));
    const kinds = (plan.descriptors || []).map((d) => d.kind).sort().join(",");
    rec("THE FIXTURE: a new mod's descriptors are its descriptor.mod and the launcher's .mod", kinds === "launcher,mod", plan.descriptors);
    for (const d of plan.descriptors) rec(`each descriptor the line goes into is named: ${d.kind}`, d.kind === "mod" ? bodyText.includes("descriptor.mod") : bodyText.includes(`the launcher's ${path.basename(d.file)}`));
    const sibText = text(P.worldConfirmBody(Object.assign(clone(plan), { descriptors: [{ file: "C:/x/m/descriptor.mod", kind: "mod", has: false }, { file: "C:/x/m.mod", kind: "sibling", has: false }] }), C));
    rec("…and a .mod beside the folder that no launcher entry names is called that", sibText.includes("the m.mod beside your mod's folder"));
    const hasText = text(P.worldConfirmBody(Object.assign(clone(plan), { descriptors: plan.descriptors.map((d) => Object.assign({}, d, { has: true })) }), C));
    rec("descriptors that already carry the line: nothing to add", hasText.includes('Its descriptors already carry replace_path="history/states"') && !/Add replace_path/.test(hasText));
    rec("the line is said to change what the WHOLE mod loads", bodyText.includes("That line changes what your whole mod loads, not just its map"));
    const many = text(P.worldConfirmBody(Object.assign(clone(plan), { stateFiles: 12, supplyAreaFiles: 3, countryCapitalFiles: 2, ownRegionFiles: 5 }), C));
    rec("the state files the mod has are counted, and said to be deleted", many.includes("the 12 state files your mod has in history/states are deleted") && text(P.worldConfirmBody(Object.assign(clone(plan), { stateFiles: 1 }), C)).includes("the 1 state file your mod has in history/states is deleted"));
    rec("…with its supply area files", many.includes("with its 3 supply area files"));
    rec("⭐ the capital line taken out of the mod's own country files is said (#a-world-of-its-own-is-asked-for-by-name)", many.includes("and the capital line is taken out of your 2 country files in history/countries"));
    rec("⭐ a mod's own region layout is said to be replaced (Redraw's own dialog sentence)", many.includes("Your own region layout is replaced.") && !bodyText.includes("Your own region layout is replaced."));
    rec("a fresh mod: no state files to delete, no capital line, no region layout", !/state files? your mod has/.test(bodyText) && !/capital line/.test(bodyText) && !/region layout/.test(bodyText));
    rec("the copies: the folder they go under is named", body.includes(String(plan.copiesUnder).replace(/&/g, "&amp;")) && !!plan.copiesUnder);
    rec("…and that they cannot turn the mod back, so copy it first", bodyText.includes("so those folders cannot turn your mod back into what it was") && bodyText.includes("copy the mod's folder somewhere safe first"));
    rec("⭐ it writes straight away, and ↶ Undo cannot take any of it back", bodyText.includes("Every step writes to your mod as soon as it runs") && bodyText.includes("↶ Undo cannot take any of it back"));
    const noLauncher = text(P.worldConfirmBody(Object.assign(clone(plan), { launcherListsIt: false, modsRoot: "C:/L/mod" }), C));
    rec("⭐ a mod the launcher has no entry for is told the game will not load the world", noLauncher.includes("⚠ The game's launcher has no entry for this mod (no .mod in C:/L/mod names this folder), so the game will not load this world until it has one.") && !bodyText.includes("has no entry for this mod"));
    rec("the land share, seed and owners chosen are in item 3", bodyText.includes("35% of the ocean, from seed 1, each new state given to the country that held its ground in the world below"));

    console.log("\n2. the typed GENERATE: exactly for a mod with a world of its own");
    for (const owns of [false, true]) {
      const sent = [];
      const planX = Object.assign(clone(plan), { ownsWorld: owns, ownWorldParts: owns ? ["3 state files", "its own province map"] : [] });
      const p2 = WP.worldPage({ modPath, timers: NO_TIMERS, fetch: async (u, init) => { sent.push([u, init && init.body ? JSON.parse(init.body) : null]); return u === "/api/map/prepare-world" ? answer({ ok: true, dryRun: true, plan: planX }) : u === "/api/map/world-run" && init ? answer({ ok: true, id: "x" }) : answer({ ok: true, run: null }); } });
      await p2.fire("mapGenerateWorld");
      const row = p2.el("mapWorldConfirmRow"), go = p2.el("mapWorldGo");
      rec(`${owns ? "a world of its own" : "a fresh mod"}: the typed box is ${owns ? "shown" : "not shown"}, and Go ${owns ? "waits for it" : "is ready"}`, p2.el("mapWorldConfirm").style.display === "flex" && row.style.display === (owns ? "block" : "none") && go.disabled === owns, { row: row.style.display, disabled: go.disabled });
      if (owns) {
        rec("⭐ the box says what of a world the mod has, in the plan's own parts", text(p2.el("mapWorldConfirmText").innerHTML) === "This mod has a world of its own (3 state files and its own province map). To replace it, type GENERATE:", p2.el("mapWorldConfirmText").innerHTML);
        await p2.fire("mapWorldGo");
        rec("…Go before GENERATE is typed sends nothing", !sent.some(([u, b]) => u === "/api/map/world-run" && b));
        p2.el("mapWorldConfirmInput").value = " generate ";
        await p2.fire("mapWorldConfirmInput", "input");
        rec("…typing it (any case, any spaces around) readies Go", go.disabled === false);
      }
      await p2.fire("mapWorldGo");
      const post = sent.find(([u, b]) => u === "/api/map/world-run" && b);
      rec(`…and Go sends confirm: true${owns ? " and replacesOwnWorld: true" : ", and no replacesOwnWorld"}`, !!post && post[1].confirm === true && (owns ? post[1].replacesOwnWorld === true : !("replacesOwnWorld" in post[1])), post);
    }

    console.log("\n3. the owner lines cover the owner choices, which are Generate land's");
    const E = WP.htmlElements();
    const optsOf = (id) => ((E.get(id) || {}).options || []).map((o) => o.value);
    rec("#mapWorldOwnerMode offers exactly #mapGenOwnerMode's choices (map.html)", optsOf("mapWorldOwnerMode").length > 0 && optsOf("mapWorldOwnerMode").join(",") === optsOf("mapGenOwnerMode").join(","), { world: optsOf("mapWorldOwnerMode"), gen: optsOf("mapGenOwnerMode") });
    const lines = optsOf("mapWorldOwnerMode").map((m) => text(P.worldOwnerLine(m, "GER")));
    rec("each choice has a line of its own", new Set(lines).size === lines.length && lines.every(Boolean), lines);
    rec("…the one-country line names the country", text(P.worldOwnerLine("single", "GER")).includes("GER"));

    console.log("\n4. the done note: what the check found, SUMMED and judged by the curated fatal set");
    const done = P.worldDoneNote(run);
    // ⛔ #a-world-counts-the-land-it-made — MOVED WITH THE FIX (review cr1, WR-1): this pinned flippedProvinces as "the land Generate land
    // made", which is what it RAISED, counted before its cut — the note said "4,512 land provinces" of a world whose definition.csv has
    // 11,316 land rows. The land Generate land made is read here off map/definition.csv as step 3 left it: the copy the first later
    // step that overwrote it took first (each step copies a file before it overwrites it), else the mod's own. The fixture's ocean is
    // drawn 64 px a side against land's 16, so the cut is part of this run (the control below).
    const laterCopies = [A.autofix && A.autofix.fixes && A.autofix.fixes.backupSnapshot && A.autofix.fixes.backupSnapshot.dir, A.regions && A.regions.write && A.regions.write.backups,
      A.refix && A.refix.fixes && A.refix.fixes.backupSnapshot && A.refix.fixes.backupSnapshot.dir].filter((d) => typeof d === "string" && d);
    const defAfterStep3 = laterCopies.map((d) => path.join(d, "map", "definition.csv")).find((f) => fs.existsSync(f)) || path.join(modPath, "map", "definition.csv");
    // (row 0 is definition.csv's placeholder, `0;0;0;0;land;…` in the base game's own file, and no province)
    const landRows = fs.readFileSync(defAfterStep3, "utf8").split(/\r?\n/).filter((l) => { const c = l.split(";"); return Number(c[0]) > 0 && c[4] === "land"; }).length;
    const cut = A.generate.provinceSplit || {}, num = (x) => Number(x).toLocaleString("en-US");
    rec("THE CONTROL: the run's Generate land cut what it raised, so the map has more land provinces than were raised",
      cut.changed === true && Number(cut.newIds) > 0 && landRows > Number(A.generate.flippedProvinces), { cut: cut.changed, newIds: cut.newIds, raised: A.generate.flippedProvinces, landRows });
    rec("⭐⭐ the real run's done note: the land provinces Generate land made (map/definition.csv's land rows as step 3 left them), in its states",
      done.includes(`cut into ${num(landRows)} land provinces in ${num(A.generate.createdStates)} states`), done);
    rec("⭐ …and the ocean provinces raised for them, said as raised", done.includes(`${num(A.generate.flippedProvinces)} ocean provinces raised (35% of the ocean, seed 1)`), done);
    rec("⭐ …and the step's own row says the same land", P.worldStepNote("generate", A.generate).includes(`cut into ${num(landRows)} land provinces in ${num(A.generate.createdStates)} new states`), P.worldStepNote("generate", A.generate));
    rec("⭐⭐ …and so does 🌍 Generate land's own line, the tool a modder clicks on their own map", P.generatedLandResultNote(A.generate).startsWith(`🌍 Generated ${landRows} land provinces in ${A.generate.createdStates} new states (${A.generate.flippedProvinces} ocean provinces raised, then cut to the size of land).`), P.generatedLandResultNote(A.generate).slice(0, 200));
    const older = Object.assign(clone(run), { answers: Object.assign(clone(A), { generate: Object.assign(clone(A.generate), { newLandProvinces: undefined }) }) });
    rec("…a record from before the answer carried the count says the same, counted off the cut's new ids", P.worldDoneNote(older).includes(`cut into ${num(landRows)} land provinces`), P.worldDoneNote(older).slice(0, 200));
    const uncut = Object.assign(clone(A.generate), { newLandProvinces: A.generate.flippedProvinces, provinceSplit: { changed: false, why: "budget" } });
    rec("THE CONTROL: a Generate land that cut nothing says its raised provinces as the land, with no cut", P.worldStepNote("generate", uncut).startsWith(`${num(uncut.flippedProvinces)} land provinces raised (`) && !/cut into/.test(P.worldStepNote("generate", uncut)) && !/then cut/.test(P.generatedLandResultNote(uncut)), [P.worldStepNote("generate", uncut), P.generatedLandResultNote(uncut).slice(0, 120)]);
    rec("…the share and seed, the owners, the regions, the check, the time and where the copies are", /\(35% of the ocean, seed 1\)/.test(done) && /owned by \d+ countr/.test(done) && /Map Errors: /.test(done) && /Took \d+:\d\d\./.test(done) && done.includes(`Copies of what it overwrote or deleted are under ${run.plan.copiesUnder}`), done);
    const fatalRule = [...L.FATAL][0], softRule = Object.keys(L.LABELS).find((r) => !L.FATAL.has(r));
    const withProblems = (problems) => Object.assign(clone(run), { answers: Object.assign(clone(A), { check: { validate: { ok: true, problems }, offered: [] }, refix: undefined }) });
    const fatalDone = P.worldDoneNote(withProblems([{ rule: fatalRule, severity: "error", total: 3 }, { rule: softRule, severity: "warning", total: 4 }]));
    rec(`⭐⭐ a fatal problem with total 3 is "3 problems stop Save" (p.total summed, isFatalRule: ${fatalRule})`, fatalDone.includes("⛔ 3 problems stop Save"), fatalDone);
    const softDone = P.worldDoneNote(withProblems([{ rule: softRule, severity: "error", total: 2 }, { rule: softRule, severity: "warning" }]));
    rec(`⭐ an error outside the fatal set (${softRule}) stops nothing: "2 errors and 1 warning, nothing that stops Save"`, softDone.includes("2 errors and 1 warning, nothing that stops Save"), softDone);

    console.log("\n5. the stop note, at every step");
    const flat = (note) => note.split("\n");
    const copyLines = (note) => { const l = flat(note), at = l.indexOf("Copies of what it overwrote or deleted:"); if (at === -1) return []; const out = []; for (let i = at + 1; i < l.length && l[i].startsWith("· "); i++) out.push(l[i]); return out; };
    const HEAD_WRITTEN = "Already written to your mod:";
    // what the note lists after HEAD_WRITTEN, up to where the copies are said — a step's line may run over several lines (Auto-fix's
    // puts its copies folder on a line of its own), so the block is compared whole, never split on "\n"
    const writtenBlock = (note) => { const at = note.indexOf(HEAD_WRITTEN + "\n"); if (at === -1) return null; const rest = note.slice(at + HEAD_WRITTEN.length + 1); const end = rest.search(/\n(Copies of |No file of yours|Nova may have left|The map now shows)/); return end === -1 ? rest : rest.slice(0, end); };
    const NOTHING = "Nothing was written to your mod.", NO_COPIES = "No file of yours had been overwritten or deleted yet, so there are no copies.", FULL = "Your new world was written in full; only the check could not run.";
    const partWay = (title) => `· ${title} stopped part-way and may already have written some of its files.`;
    // a run whose check still offers Auto-fix, so the second Auto-fix (6b) runs and can fail
    const offering = Object.assign(clone(A), { refix: Object.assign(clone(A.autofix), { validateAfter: clone(A.check.validate) }) });
    // …whose second Auto-fix took its copies into a folder of its own, as a real second click does (its scope's own timestamp)
    {
      const snap = offering.refix.fixes && offering.refix.fixes.backupSnapshot;
      if (snap && snap.dir) {
        const second = snap.dir + "-second-click";
        fs.mkdirSync(second, { recursive: true });
        fs.writeFileSync(path.join(second, "definition.csv"), "copy\n");
        snap.dir = second;
      }
    }
    const offerOnce = (() => { let n = 0; return (problems) => (n++ === 0 ? [{ rule: "x", severity: "error" }] : L.autoFixOffers(problems)); });
    const FAILS = {
      error: (key) => ({ key, respond: () => answer({ ok: false, error: `injected failure at ${key}` }, key === "check" || key === "refix-check" ? 500 : 400) }),
      copy: (key) => ({ key, respond: (normal) => ({ status: 200, json: async () => { const b = await normal.json(); if (key === "prepare" || key === "generate") b.backups = Object.assign({}, b.backups, { failed: 1 }); if (key === "blank") b.snapshotFailed = 1; if (key === "autofix" || key === "refix") b.fixes = Object.assign({}, b.fixes, { backupSnapshot: Object.assign({}, (b.fixes || {}).backupSnapshot, { failed: 1 }) }); if (key === "regions") b.backupsFailed = 1; return b; } }) }),
    };
    const order = ["prepare", "blank", "generate", "autofix", "regions", "check", "refix"];
    const cases = [];
    for (const key of order) {
      if (key !== "check") cases.push({ key, how: "error", fail: FAILS.error(key) });
      if (key === "check") cases.push({ key, how: "validate GET failed", fail: FAILS.error("check") });
      if (key !== "check") cases.push({ key, how: "a copy it could not make", fail: FAILS.copy(key) });
      cases.push({ key, how: "the builder died with no answer", died: key });
    }
    // step 1 refused before it wrote (every refusal of prepare-world names itself: `refused`), and a Generate land that stopped and
    // said what it had written (its backup scope's counts)
    cases.push({ key: "prepare", how: "refused before writing", fail: { key: "prepare", respond: () => answer({ ok: false, refused: "no-descriptor", error: "This mod has no descriptor.mod." }, 400) } });
    cases.push({ key: "generate", how: "error, saying what it wrote", fail: { key: "generate", respond: () => answer({ ok: false, error: "injected failure at generate", backups: clone(A.generate.backups) }, 400) } });
    // the check after the second Auto-fix could not run: that Auto-fix had written, and the world is whole
    cases.push({ key: "refix", how: "validate GET failed", fail: FAILS.error("refix-check") });
    // step 1 overwrote files and EVERY copy failed, so there is no folder to name — and still no "no copies"
    cases.push({ key: "prepare", how: "every copy it tried failed", fail: { key: "prepare", respond: () => answer(Object.assign(clone(A.prepare), { backups: { dir: "", files: 0, failed: 2, written: 2, created: 0 } })) } });
    // a Redraw that names its scope's folder but took no copy (so never made it), and a later check that could not run: the folder is
    // not sent to
    const noFolder = path.join(DIRS.home, ".nova", "region_rebuilds", "never-made");
    cases.push({ key: "check", how: "validate GET failed after a Redraw that copied nothing", fail: FAILS.error("check"),
      answers: Object.assign(clone(A), { regions: Object.assign(clone(A.regions), { write: Object.assign(clone(A.regions.write), { backups: noFolder, backupsCopied: 0 }) }) }) });
    rec("THE FIXTURE: the recorded Redraw says how many copies it took, and its folder holds exactly that many",
      typeof A.regions.write.backupsCopied === "number" && (A.regions.write.backupsCopied === 0 ? !fs.existsSync(A.regions.write.backups) : countFiles(A.regions.write.backups) === A.regions.write.backupsCopied),
      { backupsCopied: A.regions.write.backupsCopied, folder: A.regions.write.backups, onDisk: A.regions.write.backups && fs.existsSync(A.regions.write.backups) ? countFiles(A.regions.write.backups) : "(none)" });
    for (const c of cases) {
      const answers = c.answers || (c.key === "refix" ? offering : A);
      const r = await replay(answers, run.plan, c.fail || null, { offers: c.key === "refix" ? offerOnce() : undefined, died: c.died, leftovers: c.died ? ["map/definition.csv.tmp-4242-1700000000000"] : [] });
      const note = P.worldFailureNote(r);
      const s = STEP(c.key);
      const label = `step ${s.n} ${s.key}, ${c.how}`;
      const doneSteps = r.steps.filter((x) => x.state === "done");
      // …and the mod it was for (#a-run-is-shown-to-its-own-mod: Nova's one run can end while another mod's page is open)
      rec(`${label}: the note opens with the mod, the step and its title`, !!r.modName && flat(note)[0] === `⛔ Generate a world for ${r.modName} stopped at step ${s.k} of 6 — ${s.title}.`, flat(note)[0]);
      rec(`${label}: …the run stopped there (no step after it ran)`, r.steps.filter((x) => order.indexOf(x.key) > order.indexOf(c.key)).every((x) => x.state === "not-run" || x.state === "waiting" || (x.key === "refix" && x.state === "skipped")), r.steps.map((x) => `${x.key}:${x.state}`));
      const wb = writtenBlock(note);
      const expectDone = doneSteps.map((x) => "· " + P.worldStepNote(x.key, r.answers[x.key]));
      const failingLine = wb == null ? "" : wb.slice(expectDone.join("\n").length).replace(/^\n/, "");
      rec(`${label}: lists exactly the steps done, each in its own line, then at most the stopped step's`,
        c.how === "refused before writing" ? wb == null
          : wb != null && wb.startsWith(expectDone.join("\n")) && (failingLine === "" || (failingLine.startsWith("· ") && !expectDone.includes(failingLine))),
        { written: wb, expectDone });
      const named = new Set(doneSteps.concat(r.steps.filter((x) => x.key === c.key)).flatMap((x) => copyFoldersNamedBy(r.answers[x.key])));
      const listed = copyLines(note).map((l) => l.replace(/^· [^:]+: /, ""));
      rec(`${label}: ⭐ lists each copies folder an answer names (on disk, with files), and only those`, listed.length === named.size && listed.every((d) => named.has(d)), { listed, named: [...named] });
      const nothingWritten = c.how === "refused before writing";
      rec(`${label}: "${NOTHING}" ${nothingWritten ? "said" : "not said"}`, note.includes(NOTHING) === nothingWritten, note);
      // an error answer that does not say what the step wrote (any step), and a builder that died with none
      const noAnswer = !!c.died || c.how === "error";
      rec(`${label}: ⭐ "${partWay(s.title)}" ${noAnswer ? "said" : "not said"} (the answer ${noAnswer ? "cannot say" : "says"} what the step wrote)`, note.includes(partWay(s.title)) === noAnswer, note);
      const checkFailed = c.how.startsWith("validate GET failed");
      rec(`${label}: ⭐ "${FULL}" ${checkFailed ? "said" : "not said"}`, note.includes(FULL) === checkFailed);
      const overwrote = named.size > 0 || c.how === "a copy it could not make" || c.how === "every copy it tried failed" || noAnswer;
      rec(`${label}: ⭐ "no copies" ${overwrote ? "not said" : "said"}`, note.includes(NO_COPIES) === !overwrote, note);
      if (c.how === "a copy it could not make") rec(`${label}: …and the copy it could not make is said`, /could not copy 1 of the files/.test(note), note);
      if (c.key === "refix" && c.how === "validate GET failed") rec(`${label}: ⭐ …and the second Auto-fix, which had written, is listed with its copies`, wb != null && failingLine === "· " + P.worldStepNote("refix", r.answers.refix) && !!r.answers.refix.fixes, { failingLine, answer: Object.keys(r.answers.refix || {}) });
      if (c.died) rec(`${label}: ⭐ the half-written file is named, for a failed run too`, note.includes("map/definition.csv.tmp-4242-1700000000000"), note);
    }

    console.log("\n6. each step's line is its own button's");
    // 6a. Delete map: the notes flushMapSaves writes for the same answer, lifted and run on it
    const MAP = TP.MAP, MASKED = TP.MASKED;
    const FOLD_ALL = { changed: true, families: 2, provinces: 5, from: 9001, to: 9005, left: 0, rootOf: [[9001, 3], [9002, 3], [9003, 4], [9004, 4], [9005, 4]], units: { moved: 0, files: [] } };
    const FOLD_STOPPED = Object.assign({}, FOLD_ALL, { left: 1, stopped: { parent: 12, pieces: [8990, 9000], why: "province 9000 is lake, not sea" } });
    const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
    const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
    rec("flushMapSaves lifted out of public/map.js", FLUSH.length > 2000, FLUSH.length);
    const blankAnswer = Object.assign(clone(A.blank), {
      // every note branch flushMapSaves has for a Delete map answer, on the recorded answer
      supplyRail: { supplyRemoved: 7, railFixed: 2, railRemoved: 3, harborRemoved: 4, strandedRemoved: 5 },
      survivors: { states: 3, capitals: 1, needs: ["history/states"], descriptors: ["C:/m/descriptor.mod"] },
      fileWarning: "⚠ one file could not be read.", capitalWarning: "⚠ a capital pointed at the sea.",
      snapshotPath: A.blank.snapshotPath || path.join(DIRS.home, "snap"), deletedStates: A.blank.deletedStates || 2, deletedSupply: 1,
      // ⛔ #delete-map-gives-back-the-cut (batch C) — a re-roll's Delete map gives back what an earlier Generate land cut: here two
      // families, and it stops at a third (the answer's shape, foldRecordedProvinceSplits')
      provinceFold: FOLD_STOPPED,
      // ⛔ #nova-draws-the-rivers-delete-map-cleared — the rivers the drowned land took with it (clearAllRivers' answer, as blankMapToSea
      // carries it), so the river note's branch is on this answer too
      rivers: { changed: true, cleared: 119976, created: true },
    });
    let status = "";
    const flushSb = Object.assign({
      console, JSON, encodeURIComponent, pendingWrites: [{ url: "/api/map/blank-to-sea", body: {}, meta: {} }],
      paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(), model: { states: [] },
      stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
      setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => modPath,
      isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
      buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {}, riversShow: false,
      orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
      stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", STATE_ID_FIELDS: [],
      adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
      rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: L }, provinceDef: new Map(),
      // a Save whose Delete map gave provinces back reads the map again (batch C): the page's load, stubbed like the world page's
      load: async () => {},
      // …and sorts out what was staged on the map from before it (dropFoldedEdits), which marks the map dirty: the page's own flags
      problemsEverLoaded: false, problemsStale: false,
      fetch: async (url) => (String(url).startsWith("/api/map/validate") ? answer({ ok: true, problems: [], errors: 0, warnings: 0 }) : answer(blankAnswer)),
    });
    flushSb.globalThis = flushSb;
    vm.createContext(flushSb);
    // The Save line shows the first three warnings ("…“Map Errors” shows the rest"), so the list itself is read: an observation hook
    // after the one line that makes it, anchored exactly once (the lifted code is otherwise the page's, unchanged)
    const WW_AT = "const writeWarnings = dropped.slice();";
    rec("flushMapSaves makes its warning list in one place", FLUSH.split(WW_AT).length === 2, FLUSH.split(WW_AT).length - 1);
    const flushCode = TP.withNoteHelpers(WP.withPageHelpers(FLUSH.replace(WW_AT, () => WW_AT + " globalThis.__ww = writeWarnings;"), new Set([...WP.STUBBED, "flushMapSaves", "openMapErrorsModal", "saveMapBackup"])));
    try { vm.runInContext(`${flushCode}\nglobalThis.__run = flushMapSaves;`, flushSb); await flushSb.__run(); } catch (e) { status = "THREW " + e.message; }
    const ww = (flushSb.__ww || []).map(String);
    const notes = P.blankWriteNotes(blankAnswer);
    rec("THE CONTROL: every note branch is on this answer (snapshot, drowned land, survivors, both warnings, the fold, the rivers, and the recorded ones)", ["snapshot", "supplyRail", "survivors", "fileWarning", "capitalWarning", "provinceFold", "rivers"].every((k) => notes.some((n) => n.key === k)), notes.map((n) => n.key));
    rec("THE CONTROL: Delete map → Save ran and wrote its warnings", /Saved 1 change/.test(status) && ww.length >= notes.length, { status: status.slice(0, 300), ww: ww.length });
    const at = notes.map((n) => ww.indexOf(n.text));
    rec("⭐⭐ every note blankWriteNotes gives is one Delete map → Save writes (flushMapSaves, run on the same answer), in its order", at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])), { at, keys: notes.map((n) => n.key), ww });
    rec("⭐ …and Save writes no Delete map note blankWriteNotes leaves out", ww.every((t) => notes.some((n) => n.text === t)), ww.filter((t) => !notes.some((n) => n.text === t)));
    const blankNote = P.blankResultNote(blankAnswer);
    const survivorsText = notes.find((n) => n.key === "survivors").text;
    rec("THE CONTROL: Delete map → Save says the survivors advice for this answer", ww.includes(survivorsText));
    rec("⭐⭐ the world's account of its Delete map step never says it (step 1 wrote that line; history/countries is kept on purpose)", !blankNote.includes(survivorsText) && !/Nova does not write (it|them) for you/.test(blankNote), blankNote);
    // ⛔ #nova-draws-the-rivers-delete-map-cleared (review cr1, F4) — MOVED WITH THE FIX: the rivers note was one of "every other note", and
    // it told the world's modder "Nova does not invent them … Draw them in 💧 River mode" a few lines above its own step 3's "Drew 541
    // rivers". The world's step 2 says only what was cleared; Delete map → Save says that its rivers are 🌍 Generate land's to draw.
    const riversSave = notes.find((n) => n.key === "rivers").text, riversWorld = P.riversNote(blankAnswer.rivers, { world: true });
    rec("THE CONTROL: Delete map → Save says the rivers it cleared, and who draws rivers now", ww.includes(riversSave) && /119,976 river pixels were cleared/.test(riversSave) && /🌍 Generate land draws rivers/.test(riversSave), riversSave);
    rec("⭐⭐ neither says Nova does not invent rivers, nor sends the modder to draw them all by hand", !/does not invent/.test(riversSave + blankNote) && !/Draw them in 💧 River mode/.test(riversSave + blankNote), [riversSave, blankNote.slice(-400)]);
    rec("⭐⭐ the world's step 2 says only what was cleared — its step 3 draws the rivers and says how many", riversWorld.length > 0 && blankNote.includes(riversWorld) && !blankNote.includes(riversSave) && !/River mode|no rivers at all/.test(riversWorld), { riversWorld, blankNote: blankNote.slice(-400) });
    const bat = notes.filter((n) => n.key !== "survivors").map((n) => blankNote.indexOf(n.key === "rivers" ? riversWorld : n.text));
    rec("⭐ …and says every other note, in the same order", bat.every((v, i) => v >= 0 && (i === 0 || v > bat[i - 1])), bat);
    const realBlank = P.worldDetailsHtml(run);
    rec("the real run's details show its Delete map step's line", text(realBlank).includes(text(P.blankResultNote(A.blank)).slice(0, 60)));
    // ⛔ #delete-map-gives-back-the-cut — THE WORLD'S DELETE MAP SAYS THE FOLD THE SAVE SAYS (batch C): what it gave back, and why it
    // stopped, ⚠ and all — and the step's own row counts what it gave back, and warns when the fold left a cut standing
    // the Save's own words for it, read off the Save loop's line (never off blankWriteNotes, which is what is measured), and the
    // page's provinceFoldNote lifted on its own (the world page lifts it only while blankWriteNotes calls it)
    const foldNote = ww.find((t) => /^Delete map gave back the 5 provinces/.test(t)) || "";
    const foldNoteOf = vm.runInNewContext(TP.lift("function provinceFoldNote(") + "\nprovinceFoldNote;", {});
    rec("THE CONTROL: Delete map → Save says this fold, ⚠ included (provinceFoldNote on the Save loop's line)", foldNote.length > 0 && foldNote === foldNoteOf(FOLD_STOPPED) && /⚠ It left 1 cut province/.test(foldNote), foldNote);
    rec("⭐⭐ the world's Delete map step says it too, the stop and its ⚠ included", foldNote.length > 0 && blankNote.includes(foldNote), blankNote.slice(-600));
    const blankRun = (fold) => ({ steps: [{ key: "blank", n: "2", k: 2, title: STEP("blank").title, state: "done" }], answers: { blank: Object.assign(clone(A.blank), fold ? { provinceFold: fold } : {}) } });
    rec("THE CONTROL: the recorded Delete map (a new mod: nothing to give back) warns of nothing", P.worldWarnedSteps(blankRun(null)).length === 0, P.blankResultNote(A.blank));
    rec("⭐ a fold that gave everything back is said, and warns of nothing", P.worldWarnedSteps(blankRun(FOLD_ALL)).length === 0 && P.worldStepFullNote(blankRun(FOLD_ALL).steps[0], blankRun(FOLD_ALL).answers.blank).includes(foldNoteOf(FOLD_ALL)), P.blankResultNote(blankRun(FOLD_ALL).answers.blank));
    rec("⭐⭐ a fold that stopped is the step's warning: its row says so and “What each step did” opens on it", P.worldWarnedSteps(blankRun(FOLD_STOPPED)).map((s) => s.key).join() === "blank" && /It left a warning/.test(text(P.renderWorldSteps(blankRun(FOLD_STOPPED)))), text(P.renderWorldSteps(blankRun(FOLD_STOPPED))));
    rec("⭐ the step's row counts the provinces it gave back", /5 provinces an earlier world cut given back/.test(P.worldStepNote("blank", blankRun(FOLD_ALL).answers.blank)) && !/given back/.test(P.worldStepNote("blank", A.blank)), [P.worldStepNote("blank", blankRun(FOLD_ALL).answers.blank), P.worldStepNote("blank", A.blank)]);

    // 6b. Generate land: the click's own note, less the "Next" the world does itself
    const SRC = maskJsComments(MAP);
    rec("the Generate land click hands generatedLandResultNote(res) to its reload", /reloadAfterImmediateWrite\(generatedLandResultNote\(res\)(?:, \{ afterSave: true \})?\)/.test(SRC));
    const gl = P.generatedLandResultNote(A.generate), glWorld = P.generatedLandResultNote(A.generate, { regionsNext: false });
    const nextM = /const regionsNext = "([^"]+)";/.exec(MAP);
    const NEXT = nextM ? nextM[1] : "(the regionsNext sentence is gone from public/map.js)";
    rec("…which says the click's \"Next: 🗺 Redraw regions\" sentence (read from public/map.js)", !!nextM && gl.includes(NEXT), NEXT);
    rec("⭐ …and the world's step says exactly the same without it (it draws the regions itself, next)", !glWorld.includes(NEXT) && gl.replace(NEXT, "") === glWorld, { gl: gl.slice(-300), glWorld: glWorld.slice(-300) });
    rec("…and the world's details use that form", !text(realBlank).includes("Next: 🗺 Redraw regions"));
    // ⛔ #a-generated-state-keeps-its-countrys-id / #a-raised-province-keeps-its-continent (wave 5b) — what the ids it gave MEAN and the
    // raised land's continents: the click's line says them, so the world's step 3 says them too
    const glMeant = Object.assign(clone(A.generate), {
      stateIds: Object.assign({}, A.generate.stateIds || {}, { renumbered: { sameOwner: 3 }, carried: { states: 2, cores: 2, claims: 1 } }),
      continents: { fromBelow: 4, fromNeighbours: 1 },
    });
    const meant = P.generatedStateMeaningNote(glMeant), conts = P.generatedContinentsNote(glMeant);
    rec("THE CONTROL: this answer has something to say of its ids' meaning and of its continents", /took an id/.test(meant) && /kept the continent/.test(conts), [meant, conts]);
    rec("⭐⭐ Generate land's line says them (the click's, generatedLandResultNote)", P.generatedLandResultNote(glMeant).includes(meant + conts), P.generatedLandResultNote(glMeant).slice(-500));
    rec("⭐⭐ …and so does the world's step 3, in “What each step did”", P.worldStepFullNote({ key: "generate" }, glMeant).includes(meant + conts), P.worldStepFullNote({ key: "generate" }, glMeant).slice(-500));

    // 6c. Auto-fix: the Map Errors popup's own summary. testlib-map-page autoFixSummary runs the summary span with no window, so its
    // copies sentence (map.js backupSnapshotNote asks window.NovaMapRuleLabels, which map.html loads before map.js) is "" there; the
    // span ends `tail += snapNote` right before the line is built, so in the browser the popup's line is that summary + the sentence.
    const popupLine = (fr) => TP.autoFixSummary(fr) + L.backupSnapshotNote(fr.fixes);
    rec("THE CONTROL: the recorded Auto-fix took copies, so the copies sentence is part of what is compared", !!(A.autofix.fixes && A.autofix.fixes.backupSnapshot && A.autofix.fixes.backupSnapshot.files) && L.backupSnapshotNote(A.autofix.fixes).length > 0);
    rec("⭐⭐ the world's Auto-fix line is the popup's summary for the recorded answer", P.worldStepNote("autofix", A.autofix) === popupLine(A.autofix), { world: P.worldStepNote("autofix", A.autofix).slice(-300), popup: popupLine(A.autofix).slice(-300) });
    const OTHER = fs.readFileSync(path.join(__dirname, "test-every-auto-fix-step-is-in-the-summary.js"), "utf8");
    const literals = [];
    for (const m of OTHER.matchAll(/summaryFor\((\{[^\n]*\})\)/g)) { try { literals.push(vm.runInNewContext("(" + m[1] + ")", {})); } catch (_) { /* names a variable of that test: not a literal */ } }
    rec("THE CONTROL: test-every-auto-fix-step-is-in-the-summary.js hands its summary literal answers", literals.length >= 3, literals.length);
    const differ = literals.filter((fr) => P.worldStepNote("autofix", fr) !== popupLine(fr) || P.worldStepNote("refix", fr) !== popupLine(fr));
    rec("⭐ …and for each of them the world says exactly what the popup says", differ.length === 0, differ.slice(0, 2));
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  } finally {
    try { if (srv) { try { srv.closeAllConnections(); } catch (_) {} srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own mkdtemp sandbox only */ }
  }
  console.log(`\n=== 🌍 Generate a world says what it will do: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
