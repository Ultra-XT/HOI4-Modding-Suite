// 🌍 Generate a world's BUTTON IS WIRED — the toolbar button, its confirm and its progress panel do what the page says, run as the page's
// own code (testlib-world-page.js: the world block lifted verbatim from public/map.js, the DOM from map.html's own ids).
//
//   1. #mapGenerateWorld stands before 🗑 Delete map; every id the world block reads is in map.html; nothing inline (CSP)
//   2. #mapWorldProgress covers the whole page (fixed, inset 0) above every other layer the page and its styles draw, and below
//      Nova's own dialogs (ai-field-assist.js) — derived from every z-index in those files
//   3. ✋ pending edits: the button and Go each refuse with the page's own sentence and send nothing
//   4. both world modals are in mapOpenModal; Escape (the page's own keydown lines) and the backdrop close the confirm, and neither
//      closes the panel while the run goes
//   5. ?world=1 (🏠 New mod's "🌍 Generate a world for it →") opens the confirm, never POSTs /api/map/world-run, and leaves the URL
//   6. a 400, 409 or 423 answer to Go shows its own text
//   7. #a-world-run-is-asked-before-the-map-loads: the page asks GET /api/map/world-run BEFORE load(), and while a run goes it shows
//      the panel and never loads the half-written map
//   8. the end of a run: pollWorldRun's done, failed and interrupted branches each reload through reloadAfterImmediateWrite (the write
//      ends in the poll, not after the POST — test-an-immediate-map-write-is-checked-the-way-a-save-is.js exempts it for that)
//   9. home.html offers #newModGoWorld and home.js sends it to map.html?world=1
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const WP = require("./testlib-world-page.js");
const TP = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), "utf8").replace(/\r\n/g, "\n");
const HTML = read("public", "map.html");
const MAP = TP.MAP, MASKED = TP.MASKED;
const answer = (body, status = 200) => ({ status, json: async () => JSON.parse(JSON.stringify(body)) });
const NO_TIMERS = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
const PLAN = { modName: "Wired", replacePath: "history/states", bitmap: { own: false, from: "game", bytes: 1048576 }, descriptors: [{ file: "C:/m/wired/descriptor.mod", kind: "mod", has: false }], dependencyNames: [], launcherListsIt: true, stateFiles: 0, ownsWorld: false, ownWorldParts: [], copiesUnder: "C:/home/.nova" };
const STEPS = require("./world-run.js").STEPS;
// the record names the mod it was built for, as the server's always does (#a-run-is-shown-to-its-own-mod): the page shows an
// ended run only on that mod's own map
const runOf = (state, extra) => Object.assign({ id: "r1", modName: "Wired", modRoot: "C:/m/wired", state, startedAt: 1000, endedAt: state === "running" ? null : 5000, stepIndex: 2, step: "generate", error: state === "failed" ? "boom" : "", failedStep: state === "failed" ? "generate" : "", seen: false, plan: PLAN, choices: { landShare: 35, seed: 1, ownerMode: "inherit" }, leftovers: [],
  steps: STEPS.map((s, i) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional, state: state === "running" ? (i < 2 ? "done" : i === 2 ? "running" : "waiting") : state === "done" ? (s.optional ? "skipped" : "done") : (i < 2 ? "done" : i === 2 ? "failed" : "not-run"), startedAt: 1000, endedAt: 2000, error: "" })) }, extra || {});
/** A page whose fetch answers from `routes` (url → body | (init) => [status, body]) and records every request. */
function pageWith(routes, opts = {}) {
  const sent = [];
  const fetch = async (url, init) => {
    const u = String(url);
    sent.push({ url: u, method: (init && init.method) || "GET", body: init && init.body ? JSON.parse(init.body) : null });
    const key = Object.keys(routes).find((k) => (k.endsWith("*") ? u.startsWith(k.slice(0, -1)) : u === k));
    if (!key) return answer({ ok: false, error: "no route " + u }, 404);
    const r = typeof routes[key] === "function" ? routes[key](init) : [200, routes[key]];
    return answer(r[1], r[0]);
  };
  const p = WP.worldPage(Object.assign({ fetch, modPath: "C:/m/wired", timers: NO_TIMERS }, opts));
  p.sent = sent;
  return p;
}
const WORLD_PENDING = (/const WORLD_PENDING = "([^"]+)";/.exec(MAP) || [])[1];

(async () => {
  try {
    console.log("1. the button, the ids and the page's rules");
    const btn = HTML.indexOf('id="mapGenerateWorld"'), del = HTML.indexOf('id="mapDeleteMap"');
    const nextButton = btn < 0 ? -1 : HTML.indexOf("<button", HTML.indexOf(">", btn));
    rec("🌍 Generate a world stands right before 🗑 Delete map in the toolbar (the next button is it)", btn > 0 && del > btn && HTML.slice(nextButton).startsWith('<button id="mapDeleteMap"'), { btn, del, next: HTML.slice(nextButton, nextButton + 40) });
    const block = maskJsComments(WP.worldBlock());
    const ids = [...new Set([...block.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]))];
    const missing = ids.filter((id) => !new RegExp(`id="${id}"`).test(HTML));
    rec(`every id the world block reads is in map.html (${ids.length}, derived)`, ids.length >= 15 && missing.length === 0, missing);
    const worldHtml = HTML.slice(HTML.indexOf('id="mapWorldConfirm"') - 200, HTML.indexOf('id="mapRedrawConfirm"')) + HTML.slice(HTML.indexOf('id="mapWorldProgress"') - 200, HTML.indexOf("</body>"));
    rec("CSP: no inline handler and no inline script in the world's markup", !/\son[a-z]+\s*=/i.test(worldHtml) && !/<script(?![^>]*\bsrc=)/i.test(worldHtml));
    const ver = /<script src="\.\/map\.js\?v=(\d+)"><\/script>/.exec(HTML);
    rec("map.js is loaded with a cache token (bumped for this page code)", !!ver && Number(ver[1]) >= 128, ver && ver[1]);

    console.log("\n2. the progress panel covers everything the page draws, and stays below Nova's own dialogs");
    const tag = /<div id="mapWorldProgress" style="([^"]*)"/.exec(HTML);
    const style = tag ? tag[1] : "";
    const zOf = (s) => { const m = /z-index:\s*(\d+)/.exec(s); return m ? Number(m[1]) : NaN; };
    const panelZ = zOf(style);
    rec("#mapWorldProgress is position:fixed over the whole window (inset:0)", /position:\s*fixed/.test(style) && /inset:\s*0/.test(style), style);
    const zs = (src) => [...src.matchAll(/z-?index\s*[:=]\s*["']?(\d+)/gi)].map((m) => Number(m[1]));
    const others = [...zs(read("public", "styles.css")), ...zs(HTML.replace(style, "")), ...zs(MAP)];
    const top = Math.max(...others);
    rec(`…above every other z-index in styles.css, map.html and map.js (highest ${top}, derived)`, panelZ > top, { panelZ, top });
    const assist = zs(read("public", "ai-field-assist.js"));
    rec(`…and below every z-index of Nova's own dialogs (ai-field-assist.js, lowest ${Math.min(...assist)})`, assist.length > 0 && panelZ < Math.min(...assist), { panelZ, assist: Math.min(...assist) });

    console.log("\n3. ✋ pending edits: the button and Go refuse, in the page's own words, and send nothing");
    rec("THE CONTROL: the page's sentence was read", !!WORLD_PENDING && /Save or discard your pending edits first/.test(WORLD_PENDING), WORLD_PENDING);
    {
      const p = pageWith({ "/api/map/world-run": { ok: true, run: null }, "/api/map/prepare-world": { ok: true, dryRun: true, plan: PLAN } }, { pending: () => true });
      await p.fire("mapGenerateWorld");
      rec("the button with pending edits says so and opens nothing", p.statuses.includes(WORLD_PENDING) && p.el("mapWorldConfirm").style.display !== "flex", p.statuses);
      rec("…and asks the server nothing at all", p.sent.length === 0, p.sent);
    }
    {
      let pending = false;
      const p = pageWith({ "/api/map/world-run": (init) => (init && init.method === "POST" ? [200, { ok: true, id: "x" }] : [200, { ok: true, run: null }]), "/api/map/prepare-world": { ok: true, dryRun: true, plan: PLAN } }, { pending: () => pending });
      await p.fire("mapGenerateWorld");
      rec("THE CONTROL: with no pending edits the confirm opens", p.el("mapWorldConfirm").style.display === "flex");
      pending = true;   // an edit made while the confirm was open
      await p.fire("mapWorldGo");
      rec("⭐ Go with pending edits made meanwhile says so", p.statuses[p.statuses.length - 1] === WORLD_PENDING, p.statuses);
      rec("…and sends no write", !p.sent.some((s) => s.method === "POST" && s.url === "/api/map/world-run"), p.sent);
    }

    console.log("\n4. the modal registry, Escape and the backdrop");
    // ⛔ #a-key-under-a-dialog-stays-under-it (B6-7): the dialogs are ONE list, mapDialogs(), which mapOpenModal (Escape) and the backdrop
    // closer both read; this section lifts all three.
    const consts = ["closeMoveCountryConfirm", "closeAutofixWarn", "closeBlankConfirm", "closeGenConfirm", "closeRedraw"].map((n) => {
      const m = new RegExp(`\\n(  const ${n} = [^\\n]+)`).exec(MAP); return m ? m[1] : "";
    });
    const dialogsFn = TP.lift("function mapDialogs()");
    const openFn = TP.lift("function mapOpenModal(");
    const escAt = MASKED.indexOf("const openModal = dialogAtKeyDown || mapOpenModal();");
    const escLines = escAt < 0 ? "" : MAP.slice(escAt, MAP.indexOf("\n", MAP.indexOf("\n", escAt) + 1));
    const bdAt = MASKED.indexOf("  for (const [id, close, backdrop] of mapDialogs()) {", MASKED.indexOf("function startMapPage("));
    const bdEnd = bdAt < 0 ? -1 : MASKED.indexOf("\n  }", bdAt);
    const backdrop = bdAt < 0 || bdEnd < 0 ? "" : MAP.slice(bdAt, bdEnd + "\n  }".length);
    rec("the page's Escape lines and backdrop wiring were lifted", consts.every(Boolean) && /openModal\.close\(\)/.test(escLines) && /mousedown/.test(backdrop), { consts: consts.map((c) => c.length), escLines, backdrop: backdrop.length });
    const registry = maskJsComments(dialogsFn);
    rec("⭐ the confirm and the progress panel are both in the page's list of dialogs, which mapOpenModal reads", /\["mapWorldConfirm", cancelWorldConfirm\]/.test(registry) && /\["mapWorldProgress", closeWorldProgress, false\]/.test(registry) && /of mapDialogs\(\)/.test(openFn), registry);
    const wire = (p) => {
      vm.runInContext(`var pendingMove = null;\nvar dialogAtKeyDown = null;\nfunction closeNewCountryModal() { const m = $("mapNewCountryModal"); if (m) m.style.display = "none"; }\n${consts.join("\n")}\n${dialogsFn}\n${openFn}\nglobalThis.__escape = (e) => { ${escLines} };\n${backdrop}`, p.sb);
    };
    {
      const p = pageWith({ "/api/map/world-run": { ok: true, run: null }, "/api/map/prepare-world": { ok: true, dryRun: true, plan: PLAN } });
      wire(p);
      await p.fire("mapGenerateWorld");
      p.sb.__escape({ key: "Escape", preventDefault() {} });
      rec("⭐ Escape closes the confirm, saying nothing was written", p.el("mapWorldConfirm").style.display === "none" && /cancelled — nothing was written/.test(p.statuses[p.statuses.length - 1]), p.statuses);
      await p.fire("mapGenerateWorld");
      const ov = p.el("mapWorldConfirm");
      for (const fn of ov.listeners.mousedown || []) fn({ target: ov });
      rec("⭐ a click on the confirm's backdrop closes it", ov.style.display === "none");
    }
    {
      const p = pageWith({ "/api/map/world-run": { ok: true, run: runOf("running") } });
      wire(p);
      p.sb.showWorldRun(runOf("running"));
      const ov = p.el("mapWorldProgress");
      rec("THE CONTROL: the panel is open while the run goes", ov.style.display === "flex");
      p.sb.__escape({ key: "Escape", preventDefault() {} });
      rec("⭐⭐ Escape leaves the panel open while the run goes", ov.style.display === "flex");
      for (const fn of ov.listeners.mousedown || []) fn({ target: ov });
      rec("⭐ …and so does a click on its backdrop (it has none to close it)", ov.style.display === "flex" && !(ov.listeners.mousedown || []).length);
      rec("…and it has no Close while the run goes", p.el("mapWorldClose").style.display === "none");
      p.sb.renderWorldRun(runOf("done"));
      p.sb.__escape({ key: "Escape", preventDefault() {} });
      rec("once the run has ended, Escape closes it", ov.style.display === "none");
    }

    console.log("\n5. ?world=1 opens the confirm and never starts a run");
    {
      const p = pageWith({ "/api/map/world-run": { ok: true, run: null }, "/api/map/prepare-world": { ok: true, dryRun: true, plan: PLAN } }, { search: "?world=1" });
      await p.sb.startMapPage();
      await p.settle();
      rec("⭐ the page start opens the confirm after load()", p.el("mapWorldConfirm").style.display === "flex" && p.loads.length === 1, { loads: p.loads, display: p.el("mapWorldConfirm").style.display });
      rec("⭐⭐ …and never POSTs /api/map/world-run", !p.sent.some((s) => s.method === "POST" && s.url === "/api/map/world-run"), p.sent);
      rec("…and the URL loses its ?world=1, so a reload does not open it again", p.replaced.length === 1 && !/world=/.test(p.replaced[0]), p.replaced);
    }

    console.log("\n6. a refused Go shows the server's own text");
    for (const [status, body] of [[400, { ok: false, refused: "own-world", error: "This mod has a world of its own (3 state files). Generate a world replaces it, and this request did not say the modder agreed to that (the page asks them to type GENERATE). Nothing was written." }],
      [409, { ok: false, running: { modName: "Other", k: 3 }, error: "🌍 A world is already being generated for Other (step 3 of 6). Wait for it to finish." }],
      [423, { ok: false, worldRunActive: true, error: "🌍 Nova is still finishing step 3 of 6 of the world it was building when it was closed. Nothing else can be saved until that step ends." }]]) {
      const p = pageWith({ "/api/map/world-run": (init) => (init && init.method === "POST" ? [status, body] : [200, { ok: true, run: null }]), "/api/map/prepare-world": { ok: true, dryRun: true, plan: PLAN } });
      await p.fire("mapGenerateWorld");
      await p.fire("mapWorldGo");
      rec(`⭐ a ${status} answer shows its text`, p.statuses.some((s) => s.includes(body.error)), p.statuses);
    }

    console.log("\n7. the page asks whether a world is being generated BEFORE it loads the map");
    {
      const order = [];
      const p = pageWith({ "/api/map/world-run": () => { order.push("world-run"); return [200, { ok: true, run: runOf("running") }]; } });
      p.sb.load = async () => { order.push("load"); };
      await p.sb.startMapPage();
      rec("⭐⭐ a run going: the panel shows and load() never runs", order[0] === "world-run" && !order.includes("load") && p.el("mapWorldProgress").style.display === "flex", order);
    }
    {
      const order = [];
      const p = pageWith({ "/api/map/world-run": () => { order.push("world-run"); return [200, { ok: true, run: null }]; } });
      p.sb.load = async () => { order.push("load"); };
      await p.sb.startMapPage();
      rec("⭐ no run: the question comes first, then load()", order.join(",") === "world-run,load", order);
    }
    {
      const p = pageWith({ "/api/map/world-run*": { ok: true, run: runOf("done", { seen: false }) } });
      await p.sb.startMapPage();
      // (MOVED WITH THE FIX, review cr2 R1: this pinned `load()` with no line as that reload, and so the run's line was never left on
      // screen; it is now the reload its poll's end makes — test-a-world-says-its-warnings-on-the-line-it-leaves.js holds the line)
      rec("a run that ended before this page (unseen): the panel shows its end, and its reload is the one its poll's end makes, once", p.el("mapWorldProgress").style.display === "flex" && p.reloads.length === 1 && p.loads.length === 0 && /^🌍 Your new world is ready/.test(p.reloads[0] || ""), { loads: p.loads, reloads: p.reloads });
    }

    console.log("\n8. the end of a run reloads through the check a Save ends with — from the poll");
    for (const state of ["done", "failed", "interrupted"]) {
      const timers = { fns: [], setTimeout(fn) { timers.fns.push(fn); return timers.fns.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
      const p = pageWith({ "/api/map/world-run*": { ok: true, run: runOf(state) } }, { timers });
      p.sb.showWorldRun(runOf("running"));
      for (let i = 0; i < 5 && timers.fns.length; i++) { const fn = timers.fns.shift(); await fn(); await p.settle(); }
      rec(`⭐⭐ pollWorldRun's ${state} branch calls reloadAfterImmediateWrite, once`, p.reloads.length === 1, p.reloads);
      if (state === "done") rec("…with the done note", /^🌍 Your new world is ready/.test(p.reloads[0] || ""), p.reloads);
      if (state === "failed") rec("…with the stop note's first line", /^⛔ Generate a world for Wired stopped at step 3 of 6/.test(p.reloads[0] || ""), p.reloads);
    }

    console.log("\n9. 🏠 New mod offers it");
    const home = read("public", "home.html"), homeJs = maskJsComments(read("public", "home.js"));
    rec("home.html's New mod success view has #newModGoWorld", /<button id="newModGoWorld"[^>]*>🌍 Generate a world for it →<\/button>/.test(home));
    rec("⭐ home.js sends it to map.html?world=1", /const goWorldBtn = \$\("newModGoWorld"\);\s*\n\s*if \(goWorldBtn\) goWorldBtn\.addEventListener\("click", \(\) => \{ window\.location\.href = "map\.html\?world=1"; \}\);/.test(homeJs));
    const hv = /<script src="\.\/home\.js\?v=(\d+)"><\/script>/.exec(home);
    rec("home.js is loaded with a cache token", !!hv && Number(hv[1]) >= 11, hv && hv[1]);
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  }
  console.log(`\n=== 🌍 Generate a world's button is wired: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
})();
