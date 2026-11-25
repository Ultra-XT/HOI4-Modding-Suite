// 🌍 ⛔ #a-world-says-its-steps-warnings-on-the-line-it-leaves — WHAT A STEP WARNED OF IS SAID ON THE LINE THE RUN LEAVES ON SCREEN,
// NOT ONLY IN A PANEL THAT CANNOT BE OPENED AGAIN (review cr1, page-honesty F5).
//
// 🌍 Generate land's own click leaves its whole note on the status line, ⚠ sentences and all. 🌍 Generate a world showed them only in
// its progress panel's "What each step did", and its line said "⚠ Raise new land left 4 warnings: read them under “What each step
// did”." — the line the run's end reloads with, which stays on the status line. Once the modder clicks Close the run is marked seen
// and nothing opens that panel again (🌍 shows a run only while it runs, page start only an unseen one), so the line kept pointing at
// a place that was gone. Measured on a re-roll of the owner's world: four ⚠ (ICE left with none of the new land; 5 countries with less
// land than their army needs; 40 with less land than their factories need; 5 military factories that could not be placed), said
// nowhere else, Map Errors 0 and 0.
//
// So the run's line says each warning itself — every ⚠ of a warned step's note, to the end of its sentence — after the step that
// gave it, on all three ends (done, stopped, interrupted). Everything is driven through the world block's own code (testlib-world-page):
// the poll runs to the run's end, the line is the one it hands the reload, Close is the panel's own button.
// Run: node test-a-world-says-its-warnings-on-the-line-it-leaves.js
"use strict";
const WP = require("./testlib-world-page.js");
const STEPS = require("./world-run.js").STEPS;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const answer = (body, status = 200) => ({ status, ok: status < 400, json: async () => JSON.parse(JSON.stringify(body)) });
const marks = (s) => (String(s).match(/⚠/g) || []).length;

// Two steps that warn, in the shapes their endpoints answer: Generate land whose land raised from open ocean left a country with none,
// whose cut could not be written and whose states' names could not be written to localisation (three ⚠), and a Redraw whose names
// could not be written (one ⚠)
const GENERATE = {
  ok: true, changed: true, flippedProvinces: 105, createdStates: 34, asked: { count: 104, sea: 298, pct: 35, seed: 1, ownerMode: "inherit", owner: "" },
  ownership: { mode: "inherit", countries: 2, fromCoast: { states: 2, provinces: 5, countries: [{ tag: "AAA", before: 3, after: 5 }], emptied: ["BBB"] } },
  provinceSplit: { changed: false, error: "Nova could not write 4-REGION.txt (the file is locked by another program)", restored: 1, notRestored: [], copiedFromBelow: [] },
  nameLocalisation: { error: "the disk is full. Free some space" },
};
const REGIONS = { plan: { summary: {} }, wrote: true, write: { ok: true, summary: { regions: 5, landRegions: 3, seaRegions: 2 }, written: 6, regionNames: { error: "the names file is locked" } } };
const ANSWERS = {
  prepare: { ok: true, plan: { bitmap: { bytes: 1 } }, bitmapCopied: true, descriptorsWritten: ["a", "b"] },
  blank: { ok: true, changed: true, flippedProvinces: 280, deletedStates: 0 },
  generate: GENERATE,
  autofix: { ok: true, fixes: {} },
  regions: REGIONS,
  check: { validate: { problems: [] }, offered: [] },
};
const CLEAN = Object.assign({}, ANSWERS, {
  generate: { ok: true, changed: true, flippedProvinces: 105, createdStates: 34, asked: GENERATE.asked, ownership: { mode: "inherit", countries: 2 } },
  regions: { plan: { summary: {} }, wrote: true, write: { ok: true, summary: { regions: 5 }, written: 6 } },
});
/** A run in `state`: done (every step), failed or interrupted at Draw strategic regions (step 5: the four before it done). */
const runOf = (state, answers = {}) => {
  const at = STEPS.findIndex((s) => s.key === "regions");
  return {
    id: "r-" + state, modName: "Warned", modRoot: "C:/m/warned", state, startedAt: 1000, endedAt: state === "running" ? null : 9000, stepIndex: at, step: "regions",
    error: state === "failed" ? "the region files are locked" : "", failedStep: state === "failed" ? "regions" : "", seen: false, plan: { copiesUnder: "C:/home/.nova" },
    choices: { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" }, leftovers: [], answers,
    steps: STEPS.map((s, i) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional, startedAt: 1000, endedAt: 2000, error: "",
      state: state === "done" ? (s.optional ? "skipped" : "done") : i < at ? "done" : i === at ? (state === "failed" ? "failed" : "interrupted") : "not-run" })),
  };
};

/** A world page whose run ends in `state` with these answers: the poll is driven to the end (the line it hands the reload is the one
 *  the run leaves on the status line), and the page is returned with the fetches it sent. `tweak(run)` changes the record the server
 *  answers (both of its forms) — `start: true` opens the page on a run that had already ended, unseen (its own page start). */
async function endOf(state, answers, tweak, start) {
  const sent = [];
  const record = (withAnswers) => { const r = runOf(state, withAnswers ? answers : undefined); if (tweak) tweak(r); if (!withAnswers) delete r.answers; return r; };
  const routes = {
    "/api/map/world-run": () => ({ ok: true, run: record(false) }),
    "/api/map/world-run?answers=1": () => ({ ok: true, run: record(true) }),
    "/api/map/world-run/seen": () => ({ ok: true }),
    "/api/map/prepare-world": () => ({ ok: true, plan: { modName: "Warned", ownsWorld: false, copiesUnder: "C:/home/.nova" } }),
  };
  const fetch = async (url, init) => { sent.push(String(url)); const r = routes[String(url)]; return r ? answer(r()) : answer({ ok: false, error: "no route " + url }, 404); };
  const timers = { fns: [], setTimeout(fn) { timers.fns.push(fn); return timers.fns.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  const p = WP.worldPage({ fetch, modPath: "C:/m/warned", timers });
  if (start) { await p.fns.startMapPage(); await p.settle(); }
  else p.sb.showWorldRun(runOf("running"));
  for (let i = 0; i < 6 && timers.fns.length; i++) { const fn = timers.fns.shift(); await fn(); await p.settle(); }
  p.sent = sent;
  // the line the run leaves: what the page handed its reload (through the Save's check) or load() itself (null: load() was handed none)
  p.lines = p.reloads.concat(p.loads);
  return p;
}

(async () => {
  try {
    const page = await endOf("done", ANSWERS), P = page.sb;
    const warnedSteps = STEPS.filter((s) => ANSWERS[s.key] && /⚠/.test(P.worldStepFullNote(s, ANSWERS[s.key])));
    // each ⚠ of each warned step's own note: its first words (to the first comma, colon, semicolon or bracket, at least 25 characters),
    // which the line must carry — read off the page's own notes, so the fixture's wording is never typed here
    const heads = [];
    for (const s of warnedSteps) {
      const note = P.worldStepFullNote(s, ANSWERS[s.key]);
      for (let i = note.indexOf("⚠"); i !== -1; i = note.indexOf("⚠", i + 1)) heads.push({ step: s.title, head: note.slice(i, i + 25).split("\n")[0] });
    }
    console.log("1. the fixture");
    rec("THE CONTROL: two steps warn (Raise new land, Draw strategic regions), with four ⚠ between them", warnedSteps.map((s) => s.key).join() === "generate,regions" && heads.length === 4, heads);
    rec("THE CONTROL: the poll ran to the run's end and reloaded once", page.reloads.length === 1, page.reloads);
    const line = page.reloads[0] || "";
    console.log("   the line: " + line.slice(0, 600));

    console.log("\n2. the line the run leaves says the warnings themselves");
    const missing = heads.filter((h) => !line.includes(h.head));
    rec("⭐⭐⭐ every ⚠ a step warned of is on the line, in the step's own words", heads.length > 0 && missing.length === 0, { missing, line });
    rec("⭐⭐ …each after the step that gave it, in the order the steps ran", heads.length > 0 && warnedSteps.every((s, k) => {
      const at = line.indexOf(s.title), next = warnedSteps[k + 1] ? line.indexOf(warnedSteps[k + 1].title) : line.length;
      return at !== -1 && heads.filter((h) => h.step === s.title).every((h) => { const j = line.indexOf(h.head); return j > at && j < next; });
    }), line);
    rec("⭐⭐ …and no more ⚠ than the steps warned of (the done note's own words carry none here)", marks(line) === heads.length, { marks: marks(line), warnings: heads.length });
    rec("⭐⭐⭐ the line no longer sends the modder to “What each step did”, a panel Close takes away for good", !/What each step did/.test(line), line);
    // said apart from the note it came from, a warning cannot lean on the sentence before it ("⚠ That left BBB with none of the new land")
    const leaning = heads.filter((h) => /^⚠\s*(?:That|This|These|Those)\b/.test(h.head));
    rec("⭐ …and each stands on its own: none opens on a word pointing back at a sentence the line leaves out", heads.length > 0 && leaning.length === 0, leaning);
    rec("⭐ the panel's foot says the same as the line", page.el("mapWorldFoot").textContent === line, page.el("mapWorldFoot").textContent);
    rec("THE CONTROL: “What each step did” still holds every step's note in full, and opens on its own", /could not be written/.test(page.el("mapWorldDetails").innerHTML) && page.el("mapWorldDetails").open === true, page.el("mapWorldDetails").open);

    console.log("\n3. what Close leaves (why the line must say it)");
    await page.fire("mapWorldClose");
    rec("THE CONTROL: Close hides the panel and marks the run seen", page.el("mapWorldProgress").style.display === "none" && page.sent.includes("/api/map/world-run/seen"), page.sent);
    await page.fire("mapGenerateWorld");
    rec("THE CONTROL: …and 🌍 then opens a new world's confirm, never the run that ended: nothing shows its panel again", page.el("mapWorldProgress").style.display === "none" && page.el("mapWorldConfirm").style.display === "flex", { progress: page.el("mapWorldProgress").style.display, confirm: page.el("mapWorldConfirm").style.display });

    console.log("\n4. a run that stopped, or that Nova was closed during, says what its finished steps warned of too");
    for (const state of ["failed", "interrupted"]) {
      const q = await endOf(state, ANSWERS);
      const l = q.reloads[0] || "";
      const gen = heads.filter((h) => h.step === STEPS.find((s) => s.key === "generate").title);
      rec(`THE CONTROL: [${state}] the run reloaded once, on its own stop line`, q.reloads.length === 1 && /^⛔/.test(l), q.reloads);
      rec(`⭐⭐ [${state}] the line carries the ⚠ of the step that finished before it stopped, and only those`, gen.length === 3 && gen.every((h) => l.includes(h.head)) && marks(l) === gen.length, { marks: marks(l), line: l });
    }

    console.log("\n5. a world whose steps warn of nothing");
    const clean = await endOf("done", CLEAN);
    const cleanNotes = STEPS.filter((s) => CLEAN[s.key]).map((s) => clean.sb.worldStepFullNote(s, CLEAN[s.key]));
    rec("THE CONTROL: the clean world's steps' own notes carry no ⚠", cleanNotes.every((n) => !/⚠/.test(n)), cleanNotes);
    rec("⭐ …so its line has none, and names no step as having left one", clean.reloads.length === 1 && marks(clean.reloads[0]) === 0 && !/left (?:a|\d+) warning/.test(clean.reloads[0]), clean.reloads);

    console.log("\n6. where a warning's sentence ends");
    const W = typeof P.worldWarningSentences === "function" ? P.worldWarningSentences : null;
    rec("the page has its sentence reader (worldWarningSentences)", !!W);
    if (W) {
      const note = "Did 4. ⚠ 5 countries have less land (AUS has 2 of 3. CZE 1 of 13) than 2.5 armies need: more. Not this. ⚠ Last one\nnot this line";
      const got = W(note);
      rec("⭐ a full stop inside brackets, or between digits, does not end it; the next full stop and space, or the line's end, does",
        JSON.stringify(got) === JSON.stringify(["⚠ 5 countries have less land (AUS has 2 of 3. CZE 1 of 13) than 2.5 armies need: more.", "⚠ Last one"]), got);
      rec("⭐ a note that ends inside a warning gives it whole, and a note with none gives nothing", JSON.stringify(W("a. ⚠ ends here")) === JSON.stringify(["⚠ ends here"]) && W("nothing to see.").length === 0 && W("").length === 0, [W("a. ⚠ ends here"), W("nothing to see.")]);
    }

    // ⛔ #a-world-says-its-steps-warnings-on-the-line-it-leaves (review cr2, R1) — A RUN THAT ENDED BEFORE THIS PAGE OPENED. A Nova closed
    // during a run marks its record interrupted as it quits (server.js stopWorldRun, from main.js), so the next start finds it already
    // ended and unseen, and shows it through startMapPage, never through the poll's end — and so does a run that ended with no map page
    // open. startMapPage drew the panel and called load() with no line: once Close took the panel, its warnings were said nowhere.
    console.log("\n7. a run that ended before this page opened leaves the line its poll's end would have left");
    for (const state of ["done", "failed", "interrupted"]) {
      const polled = await endOf(state, ANSWERS);
      const started = await endOf(state, ANSWERS, null, true);
      const own = heads.filter((h) => state === "done" || h.step === STEPS.find((s) => s.key === "generate").title);
      rec(`THE CONTROL: [${state}] the page start shows the run's end and reloads once, and nothing marks it seen before Close`,started.el("mapWorldProgress").style.display === "flex" && started.lines.length === 1 && !started.sent.some((u) => u === "/api/map/world-run/seen"), { lines: started.lines, sent: started.sent });
      const l = started.lines[0] || "";
      rec(`⭐⭐⭐ [${state}] its line carries every ⚠ its finished steps warned of, in the steps' own words`, own.length > 0 && own.every((h) => l.includes(h.head)), { line: l, want: own.map((h) => h.head) });
      rec(`⭐⭐ [${state}] …and is the very line the poll's end leaves for the same run, through the same reload`, l === (polled.reloads[0] || "#none") && started.reloads.length === 1 && JSON.stringify(started.reloadOpts) === JSON.stringify(polled.reloadOpts), { start: l.slice(0, 300), poll: (polled.reloads[0] || "").slice(0, 300), opts: [started.reloadOpts, polled.reloadOpts] });
      await started.fire("mapWorldClose");
      rec(`THE CONTROL: [${state}] Close then takes the panel away for good (the run is marked seen)`, started.el("mapWorldProgress").style.display === "none" && started.sent.includes("/api/map/world-run/seen"), started.sent);
    }

    // ⛔ #a-stopped-world-says-why-and-where-its-copies-are-on-its-line (review cr2, R2) — the line a stopped run leaves said only its
    // first line ("⛔ … stopped at step 4 of 6 — …") and the warnings: why it stopped, and the folders holding the copies of what it had
    // overwritten (a half-built map's only way back), were in the panel's foot alone, which Close takes away for good. The interrupted
    // line already names its folders; the stopped one now names them too, with its cause — and the ⚠ of a finished step is said once,
    // though the panel's foot lists that step's own note among what was already written.
    console.log("\n8. a run that stopped says on its line why, and where the copies of what it overwrote are");
    const COPIED = Object.assign({}, ANSWERS, {
      prepare: Object.assign({}, ANSWERS.prepare, { backups: { dir: "C:/home/.nova/prepare_world/w/s1", files: 2 } }),
      blank: Object.assign({}, ANSWERS.blank, { snapshotPath: "C:/home/.nova/blanked_maps/w/s2", scopeCopied: 9 }),
      generate: Object.assign({}, GENERATE, { backups: { dir: "C:/home/.nova/generate_land/w/s3", files: 4, written: 4 } }),
      // a repair that finished, but not all of it: its own note warns (the line must say that ⚠ once)
      autofix: { ok: true, fixes: { strandedPorts: { error: "map/buildings.txt is locked by another program" }, backupSnapshot: { dir: "C:/home/.nova/auto_fixes/w/s4", files: 3 } } },
      regions: undefined, check: undefined,
    });
    const CAUSE = "the world builder ran out of memory (exit code 134): FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory";
    const OWN_DIR = "C:/home/.nova/redraw_regions/w/s5";
    for (const state of ["failed", "interrupted"]) {
      for (const start of [false, true]) {
        const tweak = (r) => { const s = r.steps.find((x) => x.key === "regions"); s.copiesDirs = [OWN_DIR]; if (state === "failed") { r.error = CAUSE; s.error = CAUSE; } };
        const q = await endOf(state, COPIED, tweak, start);
        const P2 = q.sb, l = q.lines[0] || "", foot = String(q.el("mapWorldFoot").textContent || "");
        // the folders, read off the page's own helper over the steps that finished, and the stopped step's own (copiesDirs)
        const doneSteps = STEPS.filter((s) => COPIED[s.key] && !["regions", "check", "refix"].includes(s.key));
        const dirs = doneSteps.map((s) => P2.worldStepCopies(s.key, COPIED[s.key])).filter(Boolean).map((c) => c.dir).concat([OWN_DIR]);
        const warned = doneSteps.filter((s) => /⚠/.test(P2.worldStepFullNote(s, COPIED[s.key])));
        const want = warned.reduce((n, s) => n + P2.worldWarningSentences(P2.worldStepFullNote(s, COPIED[s.key])).length, 0);
        const where = start ? "page start" : "poll";
        rec(`THE CONTROL: [${state}, ${where}] the panel's foot names all ${dirs.length} folders${state === "failed" ? ", and why it stopped" : ""}`, dirs.length === 5 && dirs.every((d) => foot.includes(d)) && (state !== "failed" || foot.includes(CAUSE)), foot);
        rec(`THE CONTROL: [${state}, ${where}] the repair that finished warned, and the run reloaded once`, warned.map((s) => s.key).join() === "generate,autofix" && q.lines.length === 1, { warned: warned.map((s) => s.key), lines: q.lines });
        rec(`⭐⭐⭐ [${state}, ${where}] the line names every folder holding a copy of what the run overwrote`, dirs.every((d) => l.includes(d)), { missing: dirs.filter((d) => !l.includes(d)), line: l });
        if (state === "failed") rec(`⭐⭐⭐ [${state}, ${where}] …and why it stopped`, l.includes(CAUSE), l);
        rec(`⭐⭐ [${state}, ${where}] …and says each ⚠ of the steps that finished once: ${want} in all`, marks(l) === want, { marks: marks(l), want, line: l });
      }
    }
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})();
