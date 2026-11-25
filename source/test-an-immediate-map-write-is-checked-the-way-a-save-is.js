// An immediate map write that can leave a problem Save stops for is checked the way a Save is: the Map editor validates the map it
// just wrote, says so on the status line, and puts the Map Errors popup in front of the modder. #an-immediate-map-write-skips-the-save-gate
//
// THE DEFECT (batch 8 discovery F7). Most map edits stage and land on 💾 Save, whose last step is mapCrashGate: it validates the mod
// and, for a problem in the curated FATAL set, writes "⛔ The map now has N problems Save stops for…" and opens the gated popup. A few
// tools write IMMEDIATELY and then call load(doneMsg). load → buildFromImage refreshes problems only `if (problemsPanelOpen())`, and
// the 🩺 Problems panel is no longer in map.html — so nothing validated, and the tool's success line was the last word.
//
// Measured on base c8e3c5f with the page's own Generate land confirm handler, load() and buildFromImage() run against a sandboxed
// server over the real vanilla game (scratchpad batch10/page/verify-f7.js): at the slider's minimum (5% of 3,133 sea = 157, seed 7)
// the page sent generate-land and model and nothing else, and left "🌍 Generated 157 land provinces in 64 new states. Raised 361,639
// heightmap pixels above sea level (your mod now has its own map/heightmap.bmp)." on screen. GET /api/map/validate at that moment:
// naval_base_water_is_gone (117 ports facing land) and state_naval_building_without_coast (4 states), both FATAL, and the real gate
// armed with 2.
//
// The immediate writes are DERIVED from public/map.js (every POST outside flushMapSaves) and each one is judged in section 3:
//   · 🌍 Generate land — turns sea into land, landlocking dockyards and stranding ports (section 1).
//   · Restore country — writes back each state block and the capital line as they were when the country was removed, so a state
//     merged away since leaves its provinces in no state and the capital naming a state that is gone (section 2).
//   · every other one either cannot leave a problem in the FATAL set or already checks; EXEMPT says why, and goes stale loudly.
//
// HOW IT IS TESTED: the handlers, load(), buildFromImage(), mapCrashGate() and openMapErrorsModal() are the page's own code, lifted by
// testlib-map-page.js and RUN against a real in-process server over testlib-two-layer-map.js's small world.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("immediatewrite");   // before server.js: it reads HOI4_MODS_ROOT when it loads
// State 2 = { 2 5 } faces sea 1 across the top of the map. The mod gives it a dockyard: turn that sea into land and the state keeps a
// naval building with no coast left (state_naval_building_without_coast, in the FATAL set).
const GEN = world.mod("Generate Probe", {
  "history/states/2-B.txt": L2.st(2, "2 5", { history: "\t\tbuildings = {\n\t\t\tdockyard = 1\n\t\t}\n" }),
});
// A mod that owns its states and AAA's history, whose capital is state 3.
const RESTORE = world.mod("Restore Probe", {
  "descriptor.mod": 'name="Restore Probe"\nsupported_version="1.*"\nreplace_path="history/states"\n',
  "history/states/1-A.txt": L2.st(1, "4"),
  "history/states/2-B.txt": L2.st(2, "2 5"),
  "history/states/3-C.txt": L2.st(3, "3"),
  "history/countries/AAA - Aland.txt": "capital = 3\n",
});
const labels = require("./public/map-rule-labels.js");
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

const HELPER = "async function reloadAfterImmediateWrite(";
const fatalIn = (v) => [...new Set(((v && v.problems) || []).filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule))].sort();
const gated = (overlays) => overlays.some((o) => /id="mapErrGateInput"/.test(o.innerHTML));

/** The page functions a reload-after-a-write needs; the shared helper only once it exists, so base runs its own handler as it is. */
const RELOAD = ["async function load(doneMsg)", "function buildFromImage(img, doneMsg)", "async function mapCrashGate(", "function openMapErrorsModal("]
  .concat(P.MASKED.indexOf(HELPER) >= 0 ? [HELPER] : []);

function pageGlobals(srv, mod, requests, log, over) {
  return P.loadGlobals(Object.assign({
    modPath: () => mod,
    Image: P.fakeImageClass({ log }),
    fetch: async (url, opts) => {
      const u = String(url);
      const r = await fetch(srv.base + u, opts);
      const body = await r.json().catch(() => ({}));
      requests.push({ url: u.split("?")[0], body });
      return { ok: r.ok, status: r.status, json: async () => body };
    },
  }, over));
}
async function untilReloaded(log) {
  for (let i = 0; i < 400 && !log.includes("image-loaded"); i++) await P.settle(10);
  await P.settle(60);
}
const after = (requests, first, then) => {
  const a = requests.findIndex((q) => q.url === first);
  return a >= 0 && requests.findIndex((q, i) => i > a && q.url === then) > a;
};

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    console.log("1. ⛔ 🌍 Generate land on a map with a coast");
    {
      const v0 = await srv.validate(GEN);
      rec("THE CONTROL: before it, the map has no problem Save stops for", fatalIn(v0).length === 0, fatalIn(v0));
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(GEN)}`).then((r) => r.json());
      const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
      const requests = [], log = [];
      const els = {};
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      el("mapGenConfirmBtn", { disabled: false }); el("mapGenPct", { value: "5" }); el("mapGenSeed", { value: "7" });
      const page = P.runPage([['if ($("mapGenConfirmBtn")) $("mapGenConfirmBtn").addEventListener("click"', "\n  });"]].concat(RELOAD),
        pageGlobals(srv, GEN, requests, log, { provinceType, closeGenConfirm: () => {}, $: (id) => els[id] || el(id) }));
      const click = els.mapGenConfirmBtn.listeners.click && els.mapGenConfirmBtn.listeners.click[0];
      rec("THE CONTROL: the page wired its Generate button", typeof click === "function");
      if (typeof click !== "function") throw new Error("no Generate handler");
      click();
      await untilReloaded(log);
      const gen = requests.find((q) => q.url === "/api/map/generate-land");
      rec("THE CONTROL: the click generated land, as the slider's minimum on a one-sea map asks (one province)", !!(gen && gen.body.ok === true && gen.body.flippedProvinces === 1), gen && gen.body);
      rec("THE CONTROL: the map reloaded — the image decoded", log.includes("image-loaded"), log);
      const v1 = await srv.validate(GEN);
      // ⛔ #a-refused-dockyard-is-not-a-save-gate — MOVED 2026-11-19 (tool campaign B1-31). The landlocked dockyard this world leaves was the
      // problem Save stopped for here; it left the fatal set (HOI4 refuses the building and plays on), so this section now pins the other
      // half of the gate: the page still checks the map it just wrote, and with nothing Save stops for it puts up no gate. Section 2 (Restore
      // country) still drives the gate with a problem Save stops for.
      rec("THE EVIDENCE: Generate land left the landlocked dockyard, an error Save does not stop for", (v1.problems || []).some((p) => p.rule === "state_naval_building_without_coast" && p.severity === "error") && fatalIn(v1).length === 0, { fatal: fatalIn(v1) });
      const { statuses, overlays } = page;
      const last = statuses[statuses.length - 1] || "";
      rec("⭐⭐⭐ the page checked the map it had just written (a validate after the generate-land POST)", after(requests, "/api/map/generate-land", "/api/map/validate"), requests.map((q) => q.url));
      rec("⭐⭐⭐ …and, with nothing Save stops for, the line left on screen is not a stop line", !/Save stops for/.test(last), { last, statuses });
      rec("⭐⭐ …and still says what Generate land did", /Generated 1 land province/.test(last), last);
      rec("⭐⭐ …and no type-“save” gate is put in front of the modder", !gated(overlays), overlays.map((o) => o.innerHTML.slice(0, 80)));
    }

    console.log("\n2. ⛔ Restore country after the map moved on");
    {
      const del = await srv.post("/api/map/delete-country", { tag: "AAA", reassignTo: "" }, RESTORE);   // the Remove button's body
      rec("THE CONTROL: Remove country answered ok", del.status === 200 && del.body.ok === true, del.body);
      const merge = await srv.post("/api/map/merge-state", { sourceStateId: 3, targetStateId: 2 }, RESTORE);   // flushMapSaves' body
      rec("THE CONTROL: a Save merged state 3 into state 2", merge.status === 200 && merge.body.ok === true, merge.body);
      const v0 = await srv.validate(RESTORE);
      rec("THE CONTROL: before the restore, the map has no problem Save stops for", fatalIn(v0).length === 0, fatalIn(v0));
      const requests = [], log = [];
      const restoreBtn = Object.assign(P.element("button"), { getAttribute: (k) => (k === "data-tag" ? "AAA" : null) });
      const box = Object.assign(P.element(), { querySelectorAll: (sel) => (sel === ".ccRestore" ? [restoreBtn] : []) });
      const page = P.runPage([["async function refreshRemoved()", "\n    }"]].concat(RELOAD),
        pageGlobals(srv, RESTORE, requests, log, { $: (id) => (id === "ccRemovedList" ? box : P.element()), close: () => {} }));
      await page.sb.refreshRemoved();
      const click = restoreBtn.listeners.click && restoreBtn.listeners.click[0];
      rec("THE CONTROL: the removed-countries list offers AAA's Restore button", typeof click === "function" && /data-tag="AAA"/.test(box.innerHTML), box.innerHTML.slice(0, 200));
      if (typeof click !== "function") throw new Error("no Restore handler");
      await click();
      await untilReloaded(log);
      const res = requests.find((q) => q.url === "/api/map/restore-country");
      rec("THE CONTROL: the click restored AAA", !!(res && res.body.ok === true && res.body.tag === "AAA"), res && res.body);
      const v1 = await srv.validate(RESTORE);
      rec("THE EVIDENCE: the restore left problems Save stops for", fatalIn(v1).length > 0, fatalIn(v1));
      const { statuses, overlays } = page;
      const last = statuses[statuses.length - 1] || "";
      rec("⭐⭐⭐ the page checked the map it had just written (a validate after the restore-country POST)", after(requests, "/api/map/restore-country", "/api/map/validate"), requests.map((q) => q.url));
      rec("⭐⭐⭐ the status line left on screen says what Save stops for", /Save stops for/.test(last), { last, statuses });
      rec("⭐⭐ …and still says what was restored", /Restored AAA/.test(last), last);
      rec("⭐⭐ the Map Errors popup is in front of the modder with its type-“save” gate", gated(overlays), overlays.map((o) => o.innerHTML.slice(0, 80)));
    }

    console.log("\n3. Every immediate write on the page is judged — derived from public/map.js");
    {
      const M = P.MASKED, SRC = P.MAP;
      const flushAt = M.indexOf("async function flushMapSaves");
      const flushEnd = M.indexOf("} finally { if (btn) btn.disabled = false; updateSaveButton(); }", flushAt);
      rec("THE CONTROL: flushMapSaves was located, so its replay of staged writes is left out", flushAt > 0 && flushEnd > flushAt, { flushAt, flushEnd });
      const found = [];
      const re = /fetch\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{\s*method:\s*["']POST["']/g;
      let m;
      while ((m = re.exec(M))) if (m.index < flushAt || m.index > flushEnd) found.push({ url: m[1], at: m.index });
      // From a POST to the next immediate POST on the page, capped (a handler's own follow-up sits within a few lines of its fetch).
      //
      // ⚠️ THE CAP WAS 2500 AND THE MEASUREMENT WAS 2485. Generate land's own reloadAfterImmediateWrite sat
      // fifteen characters inside it, so the day the page gained one more sentence between the two — the note
      // saying Generate land had written into supply_nodes.txt and railways.txt — the span stopped reaching it
      // and this test failed on a change that was entirely correct. The real bound is `next` (the following
      // POST), which is what stops a distant handler's reload being credited here; the cap is only a backstop
      // for the last POST in the file. Given room, and the distance is now REPORTED, so the next time this
      // tightens the failure says so instead of printing a truncated string.
      const SPAN_CAP = 8000;
      const spanOf = (i, cap = SPAN_CAP) => { const next = i + 1 < found.length ? found[i + 1].at : M.length; return M.slice(found[i].at, Math.min(next, found[i].at + cap)); };
      // 🗺 #a-rebuilt-world-needs-its-own-regions — Redraw regions posts twice to one URL: a dry run that fills its confirm dialog and
      // writes nothing, then the write. Only the write must reload through the shared check; a span whose body sends dryRun: true is
      // left out below, and the write span is still required to reload.
      const CHECKED = ["/api/map/generate-land", "/api/map/restore-country", "/api/map/rebuild-regions"];
      const EXEMPT = {
        "/api/map/create-country": "writes a tag, owner lines and a capital on a state it claims — none is read by a rule in the FATAL set; a capital taken from another country is capital_state_owned_by_other, outside it, and submitNewCountry already says so",
        "/api/map/delete-country": "rewrites owner and core lines and empties the country's history file, capital line and all",
        "/api/map/drag-country": "the server refuses Move country before it writes anything",
        "/api/army/save": "writes history/units, and the oob line into history/countries for a country that has none (B4-18)",
        "/api/map/rivers-clear": "writes rivers.bmp only",
        "/api/map/save-baseline": "copies the map out to the baseline folder; the mod's files are unchanged",
        "/api/map/restore-baseline": "already validates and opens Map Errors after the reload",
        "/api/map/auto-fix": "the popup's click already validates and re-opens Map Errors; fixAllProblems is wired to #mapProblemsFix, which map.html does not have",
        "/api/map/create-region": "appends an empty strategic region at the next free id",
        "/api/map/create-supplyarea": "appends an empty supply area at the next free id",
        // 🌍 Generate a world — its writes run in a child process and END IN THE POLL, not after a POST (re-checked below)
        "/api/map/prepare-world": "the confirm dialog asks it with dryRun: true to say what step 1 will change — it writes nothing; the write is the run's own step 1",
        "/api/map/world-run": "starts the run in a child process and answers before any step has written: the write ends in the poll, and pollWorldRun hands what the run did — done, failed or stopped — to reloadAfterImmediateWrite",
        "/api/map/world-run/seen": "marks a finished run's panel seen, in Nova's own record of the run (app data) — nothing in the mod",
        // ⛔ #a-railway-bends-over-a-bay (re-checked below)
        "/api/map/railway-curves": "asks what the game would draw over water for the 🛤 Railway tool's note — a read: its handler and railwayCurvesOverWater write nothing",
      };
      const urls = [...new Set(found.map((f) => f.url))].sort();
      rec(`THE CONTROL: ${found.length} immediate POSTs found outside Save's replay`, found.length >= 10, urls);
      const unjudged = urls.filter((u) => !CHECKED.includes(u) && !(u in EXEMPT));
      rec("⭐⭐ every immediate write is judged — a new one must be checked or given a reason here", unjudged.length === 0, unjudged);
      const stale = CHECKED.concat(Object.keys(EXEMPT)).filter((u) => !urls.includes(u));
      rec("⚠️ …and no judgement names an endpoint the page no longer calls", stale.length === 0, stale);
      for (const u of CHECKED) {
        const spans = found.map((f, i) => (f.url === u ? spanOf(i) : null)).filter((sp) => sp && !/^[^;]*dryRun:\s*true/.test(sp));
        // Report the DISTANCE, not a truncated span: "how far away is the reload, against the cap" is the
        // thing a reader needs when this fails, and a 160-character slice of the fetch never showed it.
        const reach = spans.map((s) => { const at = s.indexOf("reloadAfterImmediateWrite("); return at < 0 ? `not within ${s.length} chars (cap ${SPAN_CAP})` : `${at + "reloadAfterImmediateWrite(".length} of ${s.length}`; });
        rec(`⭐⭐ ${u}: reloads through the shared check`, spans.length > 0 && spans.every((s) => /reloadAfterImmediateWrite\(/.test(s)), reach);
      }
      // The exemptions that rest on something checkable, re-checked so a reason cannot outlive its evidence.
      const prepSpans = found.map((f) => (f.url === "/api/map/prepare-world" ? M.slice(f.at, M.indexOf(";", f.at)) : null)).filter((s) => s != null);
      rec("⚠️ 🌍 Generate a world's confirm still asks prepare-world as a dry run only", prepSpans.length > 0 && prepSpans.every((s) => /dryRun:\s*true/.test(s)), prepSpans.map((s) => s.slice(0, 200)));
      {
        const pw = M.indexOf("function pollWorldRun("), pwEnd = pw < 0 ? -1 : M.indexOf("\n  }", pw), poll = pw < 0 ? "" : M.slice(pw, pwEnd);
        // Once the run has ended (the poll's running/finishing early return), the one thing that may stop the reload is the
        // once-per-run guard, and the reload itself is not behind any condition; worldEndLine (30018d58) gives done, failed and
        // stopped their own lines, so one unconditional call covers all three ends.
        const running = 'if (run.state === "running" || run.state === "finishing") { pollWorldRun(); return; }';
        const at = poll.indexOf(running), tail = at < 0 ? "" : poll.slice(at + running.length);
        const we = M.indexOf("function worldEndLine("), endLine = we < 0 ? "" : M.slice(we, M.indexOf("\n  }", we));
        const ends = /r\.state === "done"\) return worldDoneNote\(/.test(endLine) && /r\.state === "failed"\) return worldFailure\w*\(/.test(endLine)
          && /return worldInterruptedNote\(/.test(endLine);
        rec("⚠️ …and the run's own end is checked the way a Save is: pollWorldRun reloads through the shared check when it is done, when it failed, and when it was stopped",
          at >= 0 && (tail.match(/reloadAfterImmediateWrite\(/g) || []).length === 1 && /^\s*reloadAfterImmediateWrite\(worldEndLine\(/m.test(tail)
            && (tail.match(/\breturn\b/g) || []).length === 1 && /if \(worldReloadedFor === run\.id\) return;/.test(tail) && ends,
          { tail: tail.slice(0, 300), endLine: endLine.slice(0, 300) });
      }
      // ⛔ #the-gate-has-one-owner (B6-3) — the popup's 🛟 Restore and 🔧 Auto-fix reopen it through one helper of the popup's own,
      // reopenAfter, which validates and opens Map Errors (gated while a problem Save stops for is still on disk, if it was): a span
      // that awaits it reopens Map Errors as surely as one that validates inline
      const raAt = M.indexOf("const reopenAfter = async ("), raBody = raAt < 0 ? "" : M.slice(raAt, M.indexOf("\n    };", raAt));
      const reopensMapErrors = (s) => (/\/api\/map\/validate/.test(s) && /openMapErrorsModal\(/.test(s))
        || (/\bawait reopenAfter\(/.test(s) && /\/api\/map\/validate/.test(raBody) && /openMapErrorsModal\(/.test(raBody));
      const baselineSpan = spanOf(found.findIndex((f) => f.url === "/api/map/restore-baseline"));
      rec("⚠️ Restore baseline still validates and opens Map Errors after its reload", reopensMapErrors(baselineSpan), baselineSpan.slice(0, 200));
      const fixSpans = found.map((f, i) => (f.url === "/api/map/auto-fix" ? { i, s: spanOf(i, Infinity) } : null)).filter(Boolean);
      const popupFix = fixSpans.filter((x) => reopensMapErrors(x.s));
      rec("⚠️ the popup's Auto-fix still validates and re-opens Map Errors", popupFix.length === 1, fixSpans.length);
      const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
      rec("⚠️ …and the other Auto-fix caller still has no button to reach it", fixSpans.length - popupFix.length <= 1 && !/id="mapProblemsFix"/.test(html), { callers: fixSpans.length });
      const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
      const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      const drag = SERVER.indexOf('app.post("/api/map/drag-country"');
      rec("⚠️ Move country's endpoint still refuses before any write", drag > 0 && /^[^{]*\{\s*return res\.status\(400\)/.test(SERVER.slice(drag, drag + 1500)), SERVER.slice(drag, drag + 1500).replace(/\s+/g, " ").slice(0, 200));
      {
        // ⛔ #a-railway-bends-over-a-bay — the Railway tool's curve question is a read: the route's handler calls railwayCurvesOverWater
        // and writes nothing, and nor does that function (braces counted where every literal is masked, the calls read where only
        // comments are)
        const WRITES = /\b(?:safeModWrite|writeFileSync|writeFile|appendFileSync|renameSync|rmSync|unlinkSync|copyFileSync|cpSync|mkdirSync)\s*\(|\bwrite[A-Z]\w*\s*\(/;
        const bodyOf = (masked, lit, anchor) => {
          const at = masked.indexOf(anchor), again = at < 0 ? -1 : masked.indexOf(anchor, at + 1);
          const b = at < 0 || again >= 0 ? null : jsBodyAt(lit, at);
          return b ? masked.slice(b[0], b[1] + 1) : "";
        };
        const route = bodyOf(SERVER, maskJsLiterals(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")), 'app.post("/api/map/railway-curves"');
        const MDS = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
        const fn = bodyOf(maskJsComments(MDS), maskJsLiterals(MDS), "function railwayCurvesOverWater(");
        rec("⚠️ the Railway tool's curve question still only reads: its handler calls railwayCurvesOverWater and neither writes",
          route.length > 100 && /\brailwayCurvesOverWater\(/.test(route) && !WRITES.test(route) && fn.length > 500 && !WRITES.test(fn),
          { route: route.length, fn: fn.length, routeWrites: (route.match(WRITES) || [])[0], fnWrites: (fn.match(WRITES) || [])[0] });
      }
      // fleet_starts_on_land_with_no_sea left this list 2026-09-24 (#a-coastless-navy-goes-to-sea: it is FATAL now). The
      // /api/army/save exemption does not lean on it: the map page's Army tool places LAND divisions and carries every
      // fleet through the file untouched — test-army-oob.js pins "preserved naval fleet survived" — so no army save can
      // move a fleet onto land. division_starts_on_water, the rule it CAN trigger, is still outside the set.
      const notFatal = ["capital_state_owned_by_other", "division_starts_on_water", "river_no_source", "bmp_size_mismatch", "bmp_not_8bit"];
      rec("⚠️ the rules those exemptions lean on are still outside the FATAL set", notFatal.every((r) => labels.LABELS[r] && !labels.isFatalRule(r)), notFatal.filter((r) => !labels.LABELS[r] || labels.isFatalRule(r)));
      rec("⭐ the shared check exists and runs the Save gate", P.MASKED.indexOf(HELPER) >= 0 && /mapCrashGate\(/.test(P.lift(HELPER)), P.MASKED.indexOf(HELPER));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== an immediate map write is checked the way a Save is: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
