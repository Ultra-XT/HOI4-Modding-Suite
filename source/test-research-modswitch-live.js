// SWITCHING MODS MUST NOT SILENTLY THROW AWAY UNSAVED WORK (#modswitch-guard).
//
// Changing the mod dropdown reloads the whole catalog — indirectly, via refreshCountryList ->
// loadCountryTechs -> loadCatalog. That happens to protect against the worst case (the editor never
// holds mod A's techs while pointed at mod B, so Save cannot write one mod's content into another),
// but it also discarded every unsaved edit without asking. The page already confronts you for a plain
// F5, so staying silent for the far more likely action was the inconsistency.
//
// This drives the REAL dropdown on a real mod, read-only, and checks both branches: cancelling keeps
// the mod, the techs, the selector and the undo history exactly as they were; confirming proceeds.
//
// PREREQUISITES: a Nova server and two mods on disk — environment, not code, so this SKIPS (exit 0)
// when either is missing, keeping the aggregate runner green on a machine with no game.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-modswitch-live: SKIPPED (playwright unavailable)"); process.exit(0); }
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
const clickByText = (p, re) => p.evaluate((src) => {
  const rx = new RegExp(src, "i");
  const b = [...document.querySelectorAll("button")].filter((x) => x.offsetParent !== null)
    .find((x) => rx.test((x.textContent || "").trim()));
  if (b) { b.click(); return true; }
  return false;
}, re.source);

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-modswitch-live");
  if (!(await serverUp())) { console.log(`test-research-modswitch-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-modswitch-live: SKIPPED (mod not installed)"); process.exit(0); }

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const writes = [];
  p.on("request", (r) => { if (r.method() !== "GET") writes.push(r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  // Every GET of the technology catalogue, so "the tree reloaded" can be asked as "did the page REFETCH it?"
  // — the one question that is answerable no matter which two mods are installed. Comparing tech COUNTS is
  // not: two mods on the same base correctly report the same number, and stamping window.allTechs is not
  // either, because a reload that refills the existing array in place keeps the stamp.
  const techGets = [];
  p.on("request", (r) => { if (r.method() === "GET" && r.url().indexOf("/api/technologies/catalog") !== -1) techGets.push(r.url()); });
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });

  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://localhost:${PORT}`, MOD);

  const start = await p.evaluate(() => ({
    mod: localStorage.getItem("activeModPath"),
    techs: window.allTechs.length,
    firstId: window.allTechs[0] && window.allTechs[0].id,
    // Any other mod will do — the oracle below does not care whether its tree differs from this one's.
    others: [...document.querySelectorAll("#headerModSelector option")].map((o) => o.value)
      .filter((v) => v && v !== localStorage.getItem("activeModPath")),
  }));
  const cands = start.others || [];
  start.other = cands[0] || null;
  ok(!!start.other, "a second mod is available to switch to", start.other);
  // ⭐ A RELOAD ORACLE THAT DOES NOT DEPEND ON WHICH TWO MODS ARE INSTALLED.
  //
  // This used to read a CHANGED TECH COUNT as proof the tree reloaded, which is only observable when the two
  // mods have different trees. It broke the day the mod sorting first happened to share a base with this
  // one: 988 → 988 is the CORRECT answer for two Millennium Dawn mods and says nothing about a reload.
  //
  // ⚠️ Two replacements were wrong before this one, and both looked convincing:
  //   · stamping window.allTechs — a reload that refills the array IN PLACE keeps the stamp;
  //   · counting /api/technolog* GETs inside the fixed 4s wait — the refetch is ASYNC and arrives after it,
  //     so it read as "the page never refetched" and nearly went out as a stale-data bug in the research
  //     page. The narrow regex and the short window were both mine, not Nova's.
  //
  // Ask the precise question instead, and wait for the answer: did a catalogue request carrying the NEW
  // mod's path arrive? True for any pair of mods, including two that legitimately share a tree.
  const techGetsBefore = techGets.length;
  if (!start.other) { await b.close(); process.exit(fails ? 1 : 0); }

  // make a real edit through the real path
  const node = await p.evaluate(() => {
    const n = [...document.querySelectorAll("#nodesLayer .tech-node")][3];
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  });
  ok(!!node, "found a tech to edit");
  await p.mouse.move(node.cx, node.cy);
  await p.mouse.down(); await p.mouse.move(node.cx + 140, node.cy + 100, { steps: 10 }); await p.mouse.up();
  await p.waitForTimeout(800);
  const edited = await p.evaluate(() => ({ undo: window.researchHistoryDepth().undo, dirty: window.__focusEditorHasUnsavedChanges() }));
  ok(edited.undo === 1 && edited.dirty === true, "there is now an unsaved edit", edited);

  const fireSwitch = () => p.evaluate((v) => {
    const s = document.getElementById("headerModSelector");
    s.value = v; s.dispatchEvent(new Event("change", { bubbles: true }));
  }, start.other);

  // ---- BRANCH 1: cancel ----
  await fireSwitch();
  await p.waitForTimeout(1200);
  ok(await clickByText(p, /keep editing/), "switching with unsaved work ASKS before discarding");
  await p.waitForTimeout(1500);
  const cancelled = await p.evaluate(() => ({
    mod: localStorage.getItem("activeModPath"),
    sel: document.getElementById("headerModSelector").value,
    techs: window.allTechs.length,
    firstId: window.allTechs[0] && window.allTechs[0].id,
    undo: window.researchHistoryDepth().undo,
    dirty: window.__focusEditorHasUnsavedChanges(),
  }));
  ok(cancelled.mod === start.mod, "cancelling keeps the ACTIVE MOD unchanged", cancelled);
  ok(cancelled.sel === start.mod, "cancelling puts the SELECTOR back (it must not lie about the mod)", cancelled);
  ok(cancelled.techs === start.techs && cancelled.firstId === start.firstId, "cancelling keeps the loaded tree", cancelled);
  ok(cancelled.undo === 1 && cancelled.dirty === true, "cancelling keeps the unsaved edit and its undo step", cancelled);

  // ---- BRANCH 2: confirm ----
  await fireSwitch();
  await p.waitForTimeout(1200);
  ok(await clickByText(p, /switch \(discard\)/), "the confirm option is offered");
  await p.waitForTimeout(4000);
  const switched = await p.evaluate(() => ({
    mod: localStorage.getItem("activeModPath"),
    sel: document.getElementById("headerModSelector").value,
    techs: window.allTechs.length,
    dirty: window.__focusEditorHasUnsavedChanges(),
  }));
  ok(switched.mod === start.other, "confirming actually switches the mod", switched);
  ok(switched.sel === start.other, "the selector agrees with the active mod", switched);
  // The reload is asynchronous and can outlast the fixed wait above, so give it a moment to arrive rather
  // than sampling once — a slow refetch is still a refetch, and failing on timing would be a flake.
  const refetchedForNewMod = async () => {
    const want = encodeURIComponent(start.other).toLowerCase();
    for (let i = 0; i < 40; i += 1) {
      if (techGets.slice(techGetsBefore).some((u) => u.toLowerCase().indexOf(want) !== -1)) return true;
      await p.waitForTimeout(500);
    }
    return false;
  };
  ok(await refetchedForNewMod(), "the tree reloaded for the new mod",
    { from: start.mod, to: start.other, techGetsBefore, techGetsAfter: techGets.length,
      after: techGets.slice(techGetsBefore).map((u) => u.replace(/^https?:\/\/[^/]+/, "")).slice(0, 4),
      why: "no /api/technologies/catalog request carrying the NEW mod's path arrived after the switch" });
  ok(switched.dirty === false, "the discarded edit no longer counts as unsaved", switched);

  ok(writes.length === 0, "no write request during the whole mod-switch flow", writes);
  console.log(`  (non-GET requests: ${writes.length})`);

  await b.close();
  console.log(fails ? `\nMODSWITCH LIVE TEST: ${fails} FAILED` : "\nMODSWITCH LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
