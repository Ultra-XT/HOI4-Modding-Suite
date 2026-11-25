// 🌍 #a-world-keeps-its-steps-warnings-in-view — WHAT A STEP'S OWN BUTTON WOULD WARN ABOUT, THE WORLD SAYS WHERE IT IS READ.
//
// 🌍 Generate land's own click leaves its whole note on the status line (reloadAfterImmediateWrite(generatedLandResultNote(res))),
// ⚠ lines and all. 🌍 Generate a world shows that same note only inside "What each step did", a <details> that starts closed; the
// step's row says the counts and the panel's foot says "🌍 Your new world is ready … nothing that stops Save". Measured (reviewer):
// the real game, seed 1 — three ⚠ (8 countries with less land than their army needs, 34 with less land than their factories, 7
// building levels unplaced) seen nowhere but the closed details; and a Generate land whose province cut could not be written
// ("⚠ Provinces: the raised ocean provinces were left whole … the cut could not be written") ended "✓ Your new world is ready".
//
// So: when a finished step's own note warns (⚠), the visible panel — the title, the foot, the step rows — says so.
"use strict";
const WP = require("./testlib-world-page.js");
const W = require("./world-run.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const NO_TIMERS = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
const page = WP.worldPage({ fetch: async () => { throw new Error("nothing to fetch"); }, timers: NO_TIMERS });
const P = page.sb;
const text = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const GENERATE = {
  ok: true, changed: true, flippedProvinces: 105, createdStates: 34, asked: { count: 104, sea: 298, pct: 35, seed: 1, ownerMode: "inherit", owner: "" },
  ownership: { mode: "inherit", countries: 2 },
  // the cut that could not be written, as Generate land reports it (map-data generateLand → provinceSplit)
  provinceSplit: { changed: false, error: "Nova could not write 4-REGION.txt (the file is locked by another program)", restored: 1, notRestored: [], copiedFromBelow: [] },
};
const run = {
  id: "w", modRoot: "C:/m/world", modName: "World", state: "done", startedAt: 0, endedAt: 2000, stepIndex: 5, step: "check", seen: false,
  choices: { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" }, plan: { copiesUnder: "C:/home/.nova" }, leftovers: [],
  steps: W.STEPS.map((s) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional, state: s.optional ? "skipped" : "done", startedAt: 1, endedAt: 2, error: "" })),
  answers: {
    prepare: { ok: true, plan: { bitmap: { bytes: 1 } }, bitmapCopied: true, descriptorsWritten: ["a", "b"] },
    blank: { ok: true, changed: true, flippedProvinces: 280, deletedStates: 0 },
    generate: GENERATE,
    autofix: { ok: true, fixes: {} },
    regions: { plan: { summary: {} }, wrote: true, write: { ok: true, summary: { regions: 5 } } },
    check: { validate: { problems: [] }, offered: [] },
  },
};
const own = P.generatedLandResultNote(GENERATE, { regionsNext: false });
rec("THE CONTROL: Generate land's own note for this answer warns (⚠ … the cut could not be written)", /⚠/.test(own) && /could not be written/.test(own), own);
// the panel renders the answers the page asked for (its own `worldAnswers`), as the poll leaves them
require("vm").runInContext(`worldAnswers = ${JSON.stringify(run.answers)};`, page.sb);
P.renderWorldRun(run);
const visible = [page.el("mapWorldTitle").textContent, page.el("mapWorldFoot").textContent, text(page.el("mapWorldSteps").innerHTML)].join("\n");
rec("THE CONTROL: the collapsed details hold it", /could not be written/.test(text(page.el("mapWorldDetails").innerHTML)), null);
rec("⭐ the visible panel (title, foot, step rows) says there is a warning to read", /⚠/.test(visible), visible);
rec("⭐ …and the status line the reload leaves (worldDoneNote) does too", /⚠/.test(P.worldDoneNote(run)), P.worldDoneNote(run));
// …and says the warning itself, not where to read it: "What each step did" is gone for good once the panel is closed
// (⛔ #a-world-says-its-steps-warnings-on-the-line-it-leaves, review cr1 F5 — this check said "where to read it" until then)
rec("⭐ …naming the step and saying the warning itself", P.worldDoneNote(run).includes("Raise new land left") && /⚠ [^⚠]*could not be written/.test(P.worldDoneNote(run)) && !P.worldDoneNote(run).includes("What each step did"), P.worldDoneNote(run));
rec("⭐ …and \"What each step did\" opens on its own", page.el("mapWorldDetails").open === true, page.el("mapWorldDetails").open);
// THE CONTROL: a world whose steps warn of nothing says no ⚠ and leaves the details closed
const clean = JSON.parse(JSON.stringify(run));
clean.answers.generate = { ok: true, changed: true, flippedProvinces: 105, createdStates: 34, asked: GENERATE.asked, ownership: GENERATE.ownership };
const cleanNotes = W.STEPS.filter((s) => clean.answers[s.key]).map((s) => P.worldStepFullNote(s, clean.answers[s.key]));
rec("THE CONTROL: the clean world's steps' own notes carry no ⚠", cleanNotes.every((n) => !/⚠/.test(n)), cleanNotes);
require("vm").runInContext(`worldAnswers = ${JSON.stringify(clean.answers)};`, page.sb);
P.renderWorldRun(clean);
rec("THE CONTROL: …so its done note has no ⚠ and its details stay closed", !/⚠/.test(P.worldDoneNote(clean)) && page.el("mapWorldDetails").open === false, { note: P.worldDoneNote(clean), open: page.el("mapWorldDetails").open });

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
