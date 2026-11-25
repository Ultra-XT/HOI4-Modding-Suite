// ⛔ #a-rivers-overlay-says-why-it-is-off — THE RIVERS OVERLAY'S FAILURE IS WORDED FROM THE SERVER'S OWN ANSWER.
//
// B6-24 (tool campaign, CONFIRMED, low): with a mod whose own map/rivers.bmp was saved 24-bit (the common image-editor slip), GET
// /api/map/rivers-png answers 400 "rivers.bmp is not an 8-bit indexed BMP.", and the page said "No rivers.bmp found for this mod —
// rivers overlay unavailable." with the file sitting in the mod: the overlay's <img> onerror cannot see the status, and worded every
// failure as a missing file. At the map's load the "Ready" line then overwrote even that, so the box went unticked with nothing said.
//
// The fix (public/map.js): onerror asks the same URL for its answer and words it (riversOffNote); the reason is kept for the line the
// map's load leaves (riversOff, cleared at each load), and a Save's reload, which asks the overlay to say nothing over its report, gets
// the reason under the report instead of in its place.
//
// Run, not read: the page's own loadRiversOverlay, riversOffNote, load() and buildFromImage(), lifted out of public/map.js.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}
const NOT8 = "rivers.bmp is not an 8-bit indexed BMP.";

class FailingImage {   // the overlay's <img>: its request fails, as a browser's does on a non-image answer
  constructor() { this.onload = null; this.onerror = null; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; setTimeout(() => { if (typeof this.onerror === "function") this.onerror(); }, 5); }
}

(async () => {
  // ── the words, for each answer ─────────────────────────────────────────────────────────────────────────────────────────
  {
    let sb = null;
    try { sb = T.runPage(["function riversOffNote("]).sb; } catch (e) { rec("riversOffNote is lifted out of public/map.js", false, e.message); }
    if (sb) {
      rec("404: no rivers.bmp anywhere — said as before", sb.riversOffNote(404, "No rivers.bmp found.") === "No rivers.bmp found for this mod — rivers overlay unavailable.", sb.riversOffNote(404, "x"));
      const four = sb.riversOffNote(400, NOT8);
      rec("⭐⭐⭐ 400: the file is there and the line says why it cannot be drawn, not that it is missing", four.includes(NOT8) && !/No rivers\.bmp found/.test(four), four);
      rec("…500: the server's reason, likewise", sb.riversOffNote(500, "Image library unavailable.").includes("Image library unavailable."), sb.riversOffNote(500, "Image library unavailable."));
      rec("…no answer at all is not called a missing file either", !/No rivers\.bmp found/.test(sb.riversOffNote(0, "")) && /no answer/.test(sb.riversOffNote(0, "")), sb.riversOffNote(0, ""));
    }
  }

  // ── the overlay's own load, against a server that refuses the file ────────────────────────────────────────────────────────
  async function overlay(doneMsg, onScreen) {
    const box = T.element(); box.checked = true;
    const asked = [];
    const g = {
      $: (id) => (id === "mapRivers" ? box : null), Image: FailingImage, riversShow: true, riversImg: null, riversOff: "", draw: () => {},
      modPath: () => "D:/fixture/mod",
      fetch: async (url) => { asked.push(String(url)); return { status: 400, ok: false, json: async () => ({ ok: false, error: NOT8 }) }; },
    };
    let page = null;
    try { page = T.runPage(["function loadRiversOverlay(doneMsg)"], g); } catch (e) { rec("loadRiversOverlay is lifted out of public/map.js", false, e.message); return null; }
    if (onScreen) page.sb.statusEl.textContent = onScreen;
    page.sb.loadRiversOverlay(doneMsg);
    await T.settle(40);
    return { sb: page.sb, statuses: page.statuses, box, asked };
  }
  const tick = await overlay(undefined, "");
  if (tick) {
    const line = tick.statuses[tick.statuses.length - 1] || "";
    rec("⭐⭐⭐ ticking 🌊 Rivers on a 24-bit rivers.bmp says the server's reason", line.includes(NOT8) && !/No rivers\.bmp found/.test(line), tick.statuses);
    rec("…by asking the overlay's own URL", tick.asked.length === 1 && /^\/api\/map\/rivers-png\?modPath=/.test(tick.asked[0]), tick.asked);
    rec("CONTROL: the box is unticked and the overlay off, as before", tick.box.checked === false && tick.sb.riversShow === false, { checked: tick.box.checked, show: tick.sb.riversShow });
    rec("⭐ …and the reason is kept for the line the map's load leaves", tick.sb.riversOff === line, tick.sb.riversOff);
  }
  const saved = await overlay(false, "✓ Saved 3 changes to your mod.");
  if (saved) {
    const line = saved.statuses[saved.statuses.length - 1] || "";
    rec("⭐⭐ a Save's reload (say nothing over its report) gets the reason under the report, not in its place", line === "✓ Saved 3 changes to your mod.\n" + saved.sb.riversOff && line.includes(NOT8), line);
  }

  // ── the map's load: the reason survives the "Ready" line, and a later load does not repeat a stale one ─────────────────────
  {
    const MODEL = { ok: true, states: [{ id: 1, provinces: [1], owner: "AAA" }], provinces: [{ id: 1, r: 1, g: 2, b: 3, type: "land" }], countryColors: {}, provinceOwner: {}, counts: { provinces: 1, states: 1, owners: 1 }, categorySlots: {} };
    async function load(riversOffBefore, failNow) {
      const log = [];
      const g = T.loadGlobals({
        riversShow: true, riversOff: riversOffBefore, modPath: () => "D:/fixture/mod", Image: T.fakeImageClass({ width: 4, height: 4, log, delayMs: 30 }),
        loadRiversOverlay: () => { if (failNow) g.riversOff = failNow; },   // stands in for an overlay that fails while the map loads
        fetch: async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(MODEL)) }),
      });
      const page = T.runPage(["async function load(doneMsg)", "function buildFromImage(img, doneMsg)"], g);
      g.loadRiversOverlay = () => { if (failNow) page.sb.riversOff = failNow; };
      page.sb.loadRiversOverlay = g.loadRiversOverlay;
      await page.sb.load();
      for (let i = 0; i < 200 && !log.includes("image-loaded"); i++) await T.settle(10);
      await T.settle(20);
      return page.statuses[page.statuses.length - 1] || "";
    }
    const why = "🌊 Rivers overlay unavailable: Nova could not draw the rivers.bmp this mod uses — " + NOT8;
    let a = "", b = "";
    try { a = await load("", why); b = await load(why, ""); } catch (e) { rec("load() and buildFromImage() run", false, e.stack); }
    rec("⭐⭐ at the map's load, the Ready line keeps the overlay's reason under it", /^Ready — 4×4px\./.test(a) && a.endsWith("\n" + why), a);
    rec("⭐ …and the next load, whose overlay did not fail, does not repeat it", /^Ready — 4×4px\./.test(b) && !b.includes("Rivers overlay unavailable"), b);
  }

  console.log(`\n=== the rivers overlay says why it is off: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
