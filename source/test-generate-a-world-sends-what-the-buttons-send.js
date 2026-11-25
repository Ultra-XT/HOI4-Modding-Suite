// 🌍 Generate a world sends, step by step, exactly what the map page's own buttons send. #a-generated-world-runs-the-owners-flow
//
// The world is the owner's flow behind one button: make the map the mod's own → 🗑 Delete map → 🌍 Generate land → 🔧 Auto-fix all
// → 🗺 Redraw regions → ⚠ Map Errors, and one more Auto-fix when the popup would still offer one. world-run.js sends those requests
// to a server of Nova's own (so the 3–5 minute Generate land never freezes the window), and the whole point is that each request is
// the one the button sends. So this test does not type the bodies: it LIFTS each one out of public/map.js — the Generate land
// dialog's pct clamp, count and body by RUNNING its click handler, the Redraw dialog's two bodies, the Map Errors popup's Auto-fix
// body, Delete map's queued write — and requires runWorldSequence to send the same, in the owner's order.
//
// Then: a failing step stops the run with its answer and nothing after it is sent; a step that reports a copy it could not make
// stops it too (every fix is backed up first, CLAUDE.md); and the second Auto-fix runs exactly when the popup would offer the button
// (map-rule-labels.js autoFixOffered — one predicate for both, #step-6-asks-the-popups-question).
"use strict";
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).sort().reduce((m, k) => (m[k] = sorted(o[k]), m), {}) : o);

const P = require("./testlib-map-page.js");
const W = require("./world-run.js");
const L = require("./public/map-rule-labels.js");
const MOD = "C:/fixture/mods/world_probe";

// ── what the page sends, lifted ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The Generate land dialog's own click: its clamp, its count and its body, run on these inputs. */
async function pageGenerateBody({ pct, seed, sea, mode, tag }) {
  const els = {};
  const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
  el("mapGenConfirmBtn", { disabled: false }); el("mapGenPct", { value: String(pct) }); el("mapGenSeed", { value: String(seed) });
  el("mapGenOwnerMode", { value: mode }); el("mapGenOwnerTag", { value: tag || "" });
  const provinceType = new Map();
  for (let i = 1; i <= sea; i++) provinceType.set(i, "sea");
  provinceType.set(sea + 1, "land");
  let body = null;
  const page = P.runPage([['if ($("mapGenConfirmBtn")) $("mapGenConfirmBtn").addEventListener("click"', "\n  });"]], {
    $: (id) => els[id] || el(id), modPath: () => MOD, provinceType, closeGenConfirm: () => {},
    fetch: async (url, opts) => { if (String(url) === "/api/map/generate-land") body = JSON.parse(opts.body); return { json: async () => ({ ok: false, error: "stop here" }) }; },
  });
  els.mapGenConfirmBtn.listeners.click[0]();
  await P.settle(5);
  void page;
  return body;
}
/** A fetch body object literal out of a handler's text, evaluated with modPath(). */
function bodyIn(text, url) {
  const at = text.indexOf(`fetch("${url}"`);
  if (at < 0) return null;
  const m = /body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(text.slice(at, at + 600));
  return m ? vm.runInNewContext("(" + m[1] + ")", { modPath: () => MOD }) : null;
}
const handler = (btn) => {
  const a = P.MASKED.indexOf(`$("${btn}").addEventListener`);
  const b = P.MASKED.indexOf("addEventListener(", a + 30);
  return a < 0 ? "" : P.MAP.slice(a, b > a ? b : a + 4000);
};
const REDRAW_DRY = bodyIn(handler("mapRedrawRegions"), "/api/map/rebuild-regions");
const REDRAW_WRITE = bodyIn(handler("mapRedrawConfirmBtn"), "/api/map/rebuild-regions");
const POPUP = P.lift("function openMapErrorsModal(");
const AUTOFIX = bodyIn(POPUP.slice(POPUP.indexOf('ov.querySelector("#mapErrFix")')), "/api/map/auto-fix");
// Delete map stages ONE write, replayed on Save with the mod's path added (flushMapSaves: Object.assign({}, w.body, { modPath }))
const queued = /queueWrite\("\/api\/map\/blank-to-sea",\s*(\{[^}]*\})\)/.exec(P.MASKED);
const BLANK = queued ? Object.assign(vm.runInNewContext("(" + queued[1] + ")", {}), { modPath: MOD }) : null;
rec("THE CONTROL: the page's Redraw, Auto-fix and Delete map bodies were found in public/map.js", !!(REDRAW_DRY && REDRAW_WRITE && AUTOFIX && BLANK), { REDRAW_DRY, REDRAW_WRITE, AUTOFIX, BLANK });

// ── a recording server ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function fakeServer({ sea = 50, answers = {}, problems = [], fixedProblems = [] } = {}) {
  const sent = [];
  let validates = 0;
  const base = "http://world.test";
  const fetchImpl = async (url, opts) => {
    const u = String(url).slice(base.length);
    const ep = u.split("?")[0];
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    sent.push({ ep, url: u, body, method: opts ? opts.method : "GET" });
    let key = ep;
    if (ep === "/api/map/rebuild-regions") key = body && body.dryRun ? "regions-dry" : "regions-write";
    if (ep === "/api/map/auto-fix") key = sent.filter((s) => s.ep === "/api/map/auto-fix").length > 1 ? "auto-fix-2" : "auto-fix";
    if (ep === "/api/map/validate") key = ++validates > 1 ? "validate-2" : "validate";
    const canned = {
      "/api/map/prepare-world": { ok: true, bitmapCopied: true, descriptorsWritten: ["d"], backups: { dir: "C:/c/new_worlds/x", files: 1, failed: 0 } },
      "/api/map/blank-to-sea": { ok: true, changed: true, flippedProvinces: 10, deletedStates: 3, snapshotFailed: 0, overwriteSnapshotFailed: 0 },
      "/api/map/model": { ok: true, provinces: [...Array(sea)].map((_, i) => ({ id: i + 1, type: "sea" })).concat([{ id: sea + 1, type: "land" }, { id: sea + 2, type: "lake" }]) },
      "/api/map/generate-land": { ok: true, flippedProvinces: 18, createdStates: 4, backups: { dir: "C:/c/gl", files: 2, failed: 0, written: 9 } },
      "auto-fix": { ok: true, fixes: {} },
      "auto-fix-2": { ok: true, fixes: {} },
      "regions-dry": { ok: true, summary: { regions: 7 } },
      "regions-write": { ok: true, summary: { regions: 7 }, written: 9, backups: "C:/c/rr", backupsFailed: 0 },
      "validate": { ok: true, errors: 0, warnings: problems.length, problems },
      "validate-2": { ok: true, errors: 0, warnings: fixedProblems.length, problems: fixedProblems },
    };
    const a = Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : canned[key];
    const status = a && a.__status ? a.__status : a && a.ok === false ? 400 : 200;
    const out = a && a.__status ? Object.assign({}, a, { __status: undefined }) : a;
    return { status, json: async () => (out === undefined ? {} : JSON.parse(JSON.stringify(out))) };
  };
  return { base, sent, fetchImpl };
}
const run = async (srv, choices = { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" }, extra = {}) => {
  const events = [];
  let err = null, results = null;
  try { results = await W.runWorldSequence(Object.assign({ base: srv.base, modPath: MOD, choices, fetchImpl: srv.fetchImpl, onStep: (m) => events.push(m) }, extra)); }
  catch (e) { err = e; }
  return { err, results, events };
};

(async () => {
  try {
    console.log("1. ⭐⭐⭐ the owner's order, each request the button's own");
    {
      const srv = fakeServer({ sea: 50 });
      const { err, results } = await run(srv);
      rec("THE CONTROL: the run ended", !err && !!results, err && err.message);
      const order = srv.sent.map((s) => s.ep + (s.ep === "/api/map/rebuild-regions" ? (s.body.dryRun ? "(dry)" : "(write)") : ""));
      rec("⭐⭐⭐ prepare → blank → model → generate → auto-fix → redraw dry run → redraw → validate", same(order, [
        "/api/map/prepare-world", "/api/map/blank-to-sea", "/api/map/model", "/api/map/generate-land", "/api/map/auto-fix",
        "/api/map/rebuild-regions(dry)", "/api/map/rebuild-regions(write)", "/api/map/validate"]), order);
      const by = (ep, pick) => srv.sent.filter((s) => s.ep === ep && (!pick || pick(s)))[0] || {};
      rec("step 1 makes the map the mod's own, named in the body, and says it was confirmed", same(sorted(by("/api/map/prepare-world").body), sorted({ modPath: MOD, confirm: true })), by("/api/map/prepare-world").body);
      rec("⭐⭐ 🗑 Delete map: the body Save replays for the page's queued write", same(sorted(by("/api/map/blank-to-sea").body), sorted(BLANK)), { sent: by("/api/map/blank-to-sea").body, page: BLANK });
      rec("⭐⭐ 🔧 Auto-fix all: the Map Errors popup's own body", same(sorted(by("/api/map/auto-fix").body), sorted(AUTOFIX)), { sent: by("/api/map/auto-fix").body, page: AUTOFIX });
      rec("⭐⭐ 🗺 Redraw: the plan dialog's dry-run body", same(sorted(by("/api/map/rebuild-regions", (s) => s.body.dryRun).body), sorted(REDRAW_DRY)), { sent: by("/api/map/rebuild-regions", (s) => s.body.dryRun).body, page: REDRAW_DRY });
      rec("⭐⭐ …and its Redraw button's write body", same(sorted(by("/api/map/rebuild-regions", (s) => !s.body.dryRun).body), sorted(REDRAW_WRITE)), { sent: by("/api/map/rebuild-regions", (s) => !s.body.dryRun).body, page: REDRAW_WRITE });
      rec("the model and the check are asked of the mod, as load() and ⚠ Map Errors ask", by("/api/map/model").url === `/api/map/model?modPath=${encodeURIComponent(MOD)}` && by("/api/map/validate").url === `/api/map/validate?modPath=${encodeURIComponent(MOD)}`, [by("/api/map/model").url, by("/api/map/validate").url]);
      rec("the generate answer carries what was asked (the count the page would send, and the sea it came from)", results && results.generate && results.generate.asked && results.generate.asked.sea === 50 && results.generate.asked.count === 18, results && results.generate && results.generate.asked);
    }

    console.log("\n2. ⭐⭐⭐ Generate land's body is the dialog's own, on the same inputs (its clamp, its count, its owner fallback)");
    {
      const cases = [];
      for (const pct of [0, 1, 35, 90, 91, "x"]) for (const sea of [0, 1, 13287]) cases.push({ pct, seed: 1, sea, mode: "inherit", tag: "" });
      for (const [mode, tag] of [["single", "ger!"], ["single", ""], ["none", ""], ["inherit", "SOV"]]) cases.push({ pct: 35, seed: "77x", sea: 4650, mode, tag });
      cases.push({ pct: 12, seed: "", sea: 200, mode: "inherit", tag: "" });
      let bad = [];
      for (const c of cases) {
        const page = await pageGenerateBody(c);
        const srv = fakeServer({ sea: c.sea });
        await run(srv, { landShare: c.pct, seed: c.seed, ownerMode: c.mode, owner: c.tag });
        const sent = (srv.sent.find((s) => s.ep === "/api/map/generate-land") || {}).body;
        if (!page || !sent || !same(sorted(page), sorted(sent))) bad.push({ c, page, sent });
      }
      rec(`⭐⭐⭐ ${cases.length} inputs: the world's generate-land body deep-equals the dialog's`, bad.length === 0 && cases.length === 23, bad.slice(0, 2));
      const page = await pageGenerateBody({ pct: 35, seed: 1, sea: 10, mode: "inherit", tag: "" });
      rec("THE CONTROL: the dialog's body says the modder meant to rebuild the world (replacesExistingWorld)", !!page && page.replacesExistingWorld === true, page);
    }

    console.log("\n3. ⭐⭐ a step that fails stops the run, carrying its answer, and nothing after it is sent");
    {
      const steps = [
        ["prepare", "/api/map/prepare-world", "/api/map/prepare-world"],
        ["blank", "/api/map/blank-to-sea", "/api/map/blank-to-sea"],
        ["generate", "/api/map/generate-land", "/api/map/generate-land"],
        ["autofix", "auto-fix", "/api/map/auto-fix"],
        ["regions", "regions-dry", "/api/map/rebuild-regions"],
        ["check", "validate", "/api/map/validate"],
      ];
      for (const [key, answerKey, ep] of steps) {
        const answer = { ok: false, error: `boom at ${key}` };
        const srv = fakeServer({ answers: { [answerKey]: answer } });
        const { err, events } = await run(srv);
        const lastSent = srv.sent[srv.sent.length - 1] || {};
        rec(`${key}: the run throws at that step, with the endpoint's own error and answer`, !!err && err.step === key && err.message === answer.error && same(err.answer, answer), err && { step: err.step, msg: err.message, answer: err.answer });
        rec(`${key}: …and its request was the last one sent`, lastSent.ep === ep, srv.sent.map((s) => s.ep));
        const st = events.filter((e) => e.t === "step" && e.key === key).map((e) => e.state);
        rec(`${key}: …and the step is reported running, then failed`, same(st, ["running", "failed"]), st);
      }
      // a redraw whose WRITE fails carries the plan and the write's own answer (it says what it put back)
      const wfail = { ok: false, error: "the write failed; put back 3 files" };
      const srv = fakeServer({ answers: { "regions-write": wfail } });
      const { err } = await run(srv);
      rec("regions: a failed write carries the plan and the write's answer", !!err && err.step === "regions" && err.answer && err.answer.wrote === false && same(err.answer.write, wfail), err && err.answer);
      // the second Auto-fix, and its check, are step 6b
      const p = [{ rule: "x", severity: "error", message: "boom", autoFix: true }];
      const srv2 = fakeServer({ problems: p, answers: { "auto-fix-2": { ok: false, error: "second fix broke" } } });
      const r2 = await run(srv2);
      rec("refix: a failing second Auto-fix stops as its own step", !!r2.err && r2.err.step === "refix" && r2.err.message === "second fix broke", r2.err && r2.err.step);
      const srv3 = fakeServer({ problems: p, answers: { "validate-2": { ok: false, error: "check failed" } } });
      const r3 = await run(srv3);
      rec("refix: …and only a check that could not run is marked validateFailed", !!r3.err && r3.err.step === "refix" && r3.err.validateFailed === true && !r2.err.validateFailed, r3.err && { step: r3.err.step, v: r3.err.validateFailed });
      const srv4 = fakeServer({ answers: { validate: { ok: false, error: "no check" } } });
      const r4 = await run(srv4);
      rec("check: a check that could not run is validateFailed", !!r4.err && r4.err.step === "check" && r4.err.validateFailed === true, r4.err && r4.err.validateFailed);
    }

    console.log("\n4. ⭐⭐⭐ a step that could not copy what it overwrote stops the run (every fix is backed up first)");
    {
      const cases = [
        ["prepare", { "/api/map/prepare-world": { ok: true, backups: { dir: "d", files: 1, failed: 2 } } }],
        ["blank", { "/api/map/blank-to-sea": { ok: true, snapshotFailed: 2, overwriteSnapshotFailed: 0 } }],
        ["blank", { "/api/map/blank-to-sea": { ok: true, snapshotFailed: 0, overwriteSnapshotFailed: 2 } }],
        ["generate", { "/api/map/generate-land": { ok: true, backups: { dir: "d", files: 0, failed: 2, written: 4 } } }],
        ["autofix", { "auto-fix": { ok: true, fixes: { backupSnapshot: { dir: "d", files: 0, failed: 2 } } } }],
        ["regions", { "regions-write": { ok: true, summary: {}, backupsFailed: 2 } }],
        ["regions", { "regions-write": { ok: true, summary: {}, backupsFailed: 0, unrestored: ["a", "b"] } }],
        ["regions", { "regions-write": { ok: true, summary: {}, backupsFailed: 0, putErrors: [{}, {}] } }],
      ];
      for (const [key, answers] of cases) {
        const srv = fakeServer({ answers });
        const { err } = await run(srv);
        const field = JSON.stringify(Object.values(answers)[0]).slice(0, 70);
        rec(`${key} ${field}: stops with the copy-failure message`, !!err && err.step === key && err.message === W.COPY_FAILED(2) && err.copyFailures === 2, err && { step: err.step, msg: err.message });
      }
      const srv = fakeServer({ problems: [{ rule: "x", severity: "error", message: "m" }], answers: { "auto-fix-2": { ok: true, fixes: { backupSnapshot: { dir: "d", files: 0, failed: 1 } } } } });
      const { err } = await run(srv);
      rec("refix: the second Auto-fix's copy failure stops it too", !!err && err.step === "refix" && err.message === W.COPY_FAILED(1), err && err.message);
      rec("THE CONTROL: copies that all succeeded count none", W.copyFailuresOf("generate", { backups: { files: 9, failed: 0 } }) === 0 && W.copyFailuresOf("blank", { snapshotFailed: 0 }) === 0 && W.copyFailuresOf("regions", { plan: {}, wrote: false }) === 0);
    }

    console.log("\n5. ⭐⭐ the second Auto-fix runs exactly when the Map Errors popup would offer the button (one predicate)");
    {
      const sets = {
        "nothing": [],
        "an error the rule says Auto-fix leaves": [{ rule: "e1", severity: "error", message: "broken", autoFix: false }],
        "an error": [{ rule: "e2", severity: "error", message: "broken" }],
        "a warning that names Auto-fix": [{ rule: "w1", severity: "warning", message: "Click “Auto-fix all” to repair it." }],
        "a warning that names Auto-fix but declines": [{ rule: "w2", severity: "warning", message: "Auto-fix all leaves this to you.", autoFix: false }],
        "a warning that names nothing": [{ rule: "w3", severity: "warning", message: "Odd but harmless." }],
        "one of the five autoFix: true warnings": [{ rule: "w4", severity: "warning", message: "fixable", autoFix: true }],
      };
      const popupOffers = (problems) => {
        const page = P.runPage(["function openMapErrorsModal("], P.loadGlobals({ modPath: () => MOD, fetch: async () => ({ json: async () => ({ ok: false }) }) }));
        page.sb.openMapErrorsModal({ ok: true, errors: problems.filter((p) => p.severity === "error").length, warnings: problems.filter((p) => p.severity !== "error").length, problems });
        return page.overlays.some((o) => /id="mapErrFix"/.test(o.innerHTML));
      };
      for (const [name, problems] of Object.entries(sets)) {
        const srv = fakeServer({ problems });
        const { err } = await run(srv);
        const second = srv.sent.filter((s) => s.ep === "/api/map/auto-fix").length === 2;
        const offered = problems.length ? popupOffers(problems) : false;
        rec(`${name}: the popup ${offered ? "offers" : "does not offer"} 🔧 Auto-fix all, and the run ${second ? "runs" : "skips"} the second one`, !err && second === offered && offered === L.autoFixOffered(problems), { second, offered, shared: L.autoFixOffered(problems) });
      }
      const popupSrc = P.lift("function openMapErrorsModal(");
      rec("⭐ the popup's offerFix IS the shared predicate", /const offerFix = [^;]*ML\.autoFixOffered\(/.test(popupSrc), (popupSrc.match(/const offerFix = [^;]*;/) || [""])[0]);
      const { stripJsComments } = require("./testlib-strip-comments.js");
      const wr = stripJsComments(require("fs").readFileSync(require("path").join(__dirname, "world-run.js"), "utf8"));
      rec("⭐ …and world-run.js asks it (map-rule-labels.js autoFixOffers), not a narrower test of its own", /require\("\.\/public\/map-rule-labels\.js"\)/.test(wr) && /\.autoFixOffers\(/.test(wr) && !/problems\.some\(\s*\(?p\)?\s*=>\s*p\.autoFix\s*\)/.test(wr));
      const srv = fakeServer({ problems: [{ rule: "w1", severity: "warning", message: "Click Auto-fix all." }] });
      const { events } = await run(srv);
      const refix = events.filter((e) => e.t === "step" && e.key === "refix").map((e) => e.state);
      rec("the second Auto-fix is reported as its own step, 6b", same(refix, ["running", "done"]) && W.STEPS.some((s) => s.key === "refix" && s.n === "6b"), refix);
      const srv2 = fakeServer({ problems: [] });
      const r2 = await run(srv2);
      rec("…and as skipped when nothing is offered", same(r2.events.filter((e) => e.t === "step" && e.key === "refix").map((e) => e.state), ["skipped"]));
    }

    console.log("\n6. the redraw is not written when its plan says there is nothing to write");
    {
      const srv = fakeServer({ answers: { "regions-dry": { ok: true, summary: { nothingToWrite: true, regions: 7 } } } });
      const { err, results } = await run(srv);
      rec("only the dry run is sent", !err && srv.sent.filter((s) => s.ep === "/api/map/rebuild-regions").length === 1 && results.regions.wrote === false, srv.sent.map((s) => s.ep));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e), false);
  } finally {
    console.log(`\n=== 🌍 Generate a world sends what the buttons send: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
