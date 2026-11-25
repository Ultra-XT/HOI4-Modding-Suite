// CORRUPT EDITOR STORAGE MUST DEGRADE, NOT BREAK (#storage-degrades).
//
// Annotations, dragged label positions, all four year-override maps and the custom-tab list live in
// localStorage. If one of those values is unreadable — a partial write, another tab, a manual edit —
// the research page must still open and fall back to defaults. An unguarded JSON.parse would instead
// throw during boot and white-screen the whole editor over a single corrupt byte.
//
// Poisons all nine staged-state keys with invalid JSON and requires a full, working page.
// Read-only: it only writes to the headless browser's own localStorage, never to a mod.
//
// PREREQUISITES: a Nova server and a mod on disk — environment, not code, so this SKIPS (exit 0) when
// either is missing.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-storage-live: SKIPPED (playwright unavailable)"); process.exit(0); }
const MOD = process.env.NOVA_SNAP_MOD || ["D:", "SteamLibrary", "steamapps", "workshop", "content", "394360", "2777392649"].join(path.sep);
// #a-bare-test-run-writes-into-the-real-app-data — the runner names its sandboxed server here. Run bare there is none,
// and this fell back to the app's own port: the owner's open Nova. Now it starts a server of its own, in its sandbox.
const { ownLiveServer, openResearchPage } = require("./testlib-live-server.js");
let PORT = +(process.env.NOVA_PORT || 0);
let fails = 0;
const ok = (c, m, x) => { console.log((c ? "  PASS " : "  FAIL ") + m + (c ? "" : "   << " + JSON.stringify(x))); if (!c) fails++; };
const serverUp = () => new Promise((res) => {
  const s = net.connect({ port: PORT, host: "127.0.0.1" }, () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
  s.setTimeout(1500, () => { s.destroy(); res(false); });
});

const KEYS = ["research_annotations_", "research_gui_label_overrides_", "research_gui_year_pos_",
  "research_gui_year_val_", "research_gui_year_hidden_", "research_gui_year_custom_",
  "research_year_overrides_", "research_year_cols_", "custom_research_tabs_"];

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-storage-live");
  if (!(await serverUp())) { console.log(`test-research-storage-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-storage-live: SKIPPED (mod not installed)"); process.exit(0); }

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  const escaped = [];
  p.on("request", (r) => { if (r.method() !== "GET") escaped.push(r.method() + " " + r.url()); });

  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, with the mod and every corrupt value in the store before
  // the page reads it, waited for until the page can be driven. Not getting there is the failure this test is about.
  const corrupt = {};
  for (const k of KEYS) corrupt[k + MOD] = "{not valid json[[[";
  let booted = true, why = "";
  try { await openResearchPage(p, `http://localhost:${PORT}`, MOD, { storage: corrupt }); }
  catch (e) { booted = false; why = String(e && e.message); }
  const stored = await p.evaluate((keys) => keys.filter((k) => localStorage.getItem(k) === "{not valid json[[[").length, Object.keys(corrupt));

  ok(stored === KEYS.length, "THE CONTROL: every staged-state key held the corrupt value when the page booted", { stored, of: KEYS.length });
  ok(booted, "the page boots with every staged-state key corrupt", why);
  const st = await p.evaluate(() => ({
    techs: (window.allTechs || []).length,
    nodes: document.querySelectorAll("#nodesLayer .tech-node").length,
    tabs: document.querySelectorAll(".folder-tab").length,
    undoReady: typeof window.researchHistoryDepth === "function",
  }));
  ok(st.techs > 0, "the catalog still loaded", st);
  ok(st.nodes > 0, "techs still render on the canvas", st);
  ok(st.tabs > 0, "the folder tabs still render", st);
  ok(st.undoReady, "undo/redo is still wired up", st);
  ok(errs.length === 0, "no uncaught page error — a corrupt value must not white-screen the editor", errs);
  ok(escaped.length === 0, "no write request was issued", escaped);

  await b.close();
  console.log(fails ? `\nSTORAGE LIVE TEST: ${fails} FAILED` : "\nSTORAGE LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
