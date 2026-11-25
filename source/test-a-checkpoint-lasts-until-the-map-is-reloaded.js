// ⛔ #a-checkpoint-lasts-until-the-map-is-reloaded — 🕘 HISTORY SAYS HOW FAR BACK IT GOES, AND A 📌 CHECKPOINT HOW LONG IT LASTS.
//
// B6-10 (tool campaign, CONFIRMED, low): the History button promised "jump back to any earlier step" and Undo stopped at 30 (UNDO_LIMIT);
// Mark promised "Restore it any time from the History panel" and the checkpoint was gone after any reload of the map — a page reload,
// or a 🔧 Auto-fix in the same page (the list then read "No checkpoints yet."). Both behaviours are DECIDED and pinned by
// test-map-checkpoint-across-save.js (load() empties the checkpoints because they hold writes a reloaded disk may already have, and the
// cap stays), so the words move: the title and the panel give the cap, Mark says a checkpoint lasts until the map is reloaded, and a
// reload that dropped checkpoints says how many, on the line it leaves and in the History panel.
//
// Run, not read: the page's own addCheckpoint, load(), buildFromImage() and renderCheckpoints(), lifted out of public/map.js; the cap
// DERIVED from UNDO_LIMIT, so the words cannot drift from it.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

(async () => {
  // ── the cap, derived ───────────────────────────────────────────────────────────────────────────────────────────────────
  const cap = Number((/const UNDO_LIMIT = (\d+);/.exec(T.MASKED) || [])[1]);
  const HTML = T.readSource("public", "map.html");
  const title = (/<button id="mapHistoryBtn" title="([^"]*)"/.exec(HTML) || [])[1] || "";
  const panelAt = HTML.indexOf('<div id="mapHistoryPanel"');
  const panel = panelAt < 0 ? "" : HTML.slice(panelAt, HTML.indexOf('id="mapHistoryList"', panelAt)).replace(/<[^>]+>/g, " ");
  rec("UNDO_LIMIT is read out of public/map.js", cap > 0, cap);
  rec(`⭐⭐ the History button's title gives the cap (${cap} steps), not "any earlier step"`, title.includes(`up to ${cap} steps`) && !/any earlier step/.test(title), title);
  rec("⭐ …and so does the panel", panel.includes(`the last ${cap} steps`), panel.trim().slice(0, 300));
  rec("…and the title says a checkpoint lasts until the map is reloaded", /checkpoints you can return to until the map is reloaded/.test(title), title);

  // ── Mark ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const p = T.runPage(["function addCheckpoint()"], { model: { states: [] }, checkpoints: [], checkpointSeq: 0, saveGeneration: 0, snapshotMap: () => ({}), renderCheckpoints: () => {} });
    p.sb.addCheckpoint();
    const line = p.statuses[p.statuses.length - 1] || "";
    rec("⭐⭐⭐ Mark says the checkpoint lasts until the map is reloaded, and no longer \"any time\"", /Restore it from the History panel until the map is reloaded/.test(line) && !/any time/.test(line), line);
  }

  // ── a reload of the map, in the page: load() and buildFromImage(), the bitmap decoding after load() returns ──────────────────
  const MODEL = { ok: true, states: [{ id: 1, provinces: [1], owner: "AAA" }], provinces: [{ id: 1, r: 1, g: 2, b: 3, type: "land" }], countryColors: {}, provinceOwner: { 1: "AAA" }, counts: { provinces: 1, states: 1, owners: 1 }, categorySlots: {} };
  async function reload(n, doneMsg) {
    const log = [];
    const box = T.element();
    const g = T.loadGlobals({
      checkpoints: Array.from({ length: n }, (_, i) => ({ name: "cp " + i, snapshot: {}, generation: 0 })),
      modPath: () => "D:/fixture/mod", Image: T.fakeImageClass({ width: 4, height: 4, log }), escHist: (s) => String(s),
      $: (id) => (id === "mapCheckpointList" ? box : null),
      fetch: async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(MODEL)) }),
    });
    let page = null;
    try { page = T.runPage(["async function load(doneMsg)", "function buildFromImage(img, doneMsg)", "function renderCheckpoints()"], g); }
    catch (e) { rec("load(), buildFromImage() and renderCheckpoints() are lifted out of public/map.js", false, e.message); return null; }
    await page.sb.load(doneMsg);
    for (let i = 0; i < 200 && !log.includes("image-loaded"); i++) await T.settle(10);
    await T.settle(20);
    page.sb.renderCheckpoints();
    return { line: page.statuses[page.statuses.length - 1] || "", checkpoints: page.sb.checkpoints, panel: String(box.innerHTML) };
  }
  const two = await reload(2, "🔧 Auto-fixed: something.");
  if (two) {
    rec("CONTROL (decided): the reload empties the checkpoints", Array.isArray(two.checkpoints) && two.checkpoints.length === 0, two.checkpoints);
    rec("⭐⭐⭐ the line the reload leaves keeps its own words and says it dropped the 2 checkpoints",
      two.line === "🔧 Auto-fixed: something.\n📌 This reload of the map dropped your 2 checkpoints: checkpoints last only until the map is reloaded.", two.line);
    rec("⭐⭐ …and the History panel says where they went, instead of \"No checkpoints yet.\"",
      /No checkpoints: the 2 taken before the map was last reloaded went with that reload\. Checkpoints last until the map is reloaded\./.test(two.panel) && !/No checkpoints yet/.test(two.panel), two.panel);
  }
  const one = await reload(1, "");
  if (one) rec("…one checkpoint is said in the singular, after the page's own Ready line", /^Ready — 4×4px\. .*\n📌 This reload of the map dropped your checkpoint: checkpoints last only until the map is reloaded\.$/s.test(one.line) && /the one taken before/.test(one.panel), [one.line, one.panel]);
  const none = await reload(0, "🔧 Auto-fixed: something.");
  if (none) {
    rec("⭐ CONTROL: a reload that dropped none leaves its line exactly as it was", none.line === "🔧 Auto-fixed: something.", none.line);
    rec("…and the empty panel says how long checkpoints last", /No checkpoints yet\. They last until the map is reloaded\./.test(none.panel), none.panel);
  }

  console.log(`\n=== a checkpoint lasts until the map is reloaded: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
