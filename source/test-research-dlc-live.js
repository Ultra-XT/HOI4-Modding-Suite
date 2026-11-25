// TOGGLING A DLC MUST NOT REVERT AN EDIT (#dlc-origx).
//
// A DLC toggle re-runs applyDlcCollisionPacking, which restores every tech to its authored x from the
// `_origX` snapshot. That is safe only while every path that legitimately changes x also refreshes
// _origX — otherwise the next toggle silently drags the user's move back to where it started, with no
// error and nothing to undo. This drives the real DLC panel on a real mod: drag a tech, switch a DLC
// off, switch it back on, and require the dragged coordinates to survive both directions.
//
// Every non-GET is stubbed, so the test cannot write to a mod; it asserts nothing escapes.
//
// PREREQUISITES: a Nova server and a mod on disk — environment, not code, so this SKIPS (exit 0) when
// either is missing, keeping the aggregate runner green on a machine with no game.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-dlc-live: SKIPPED (playwright unavailable)"); process.exit(0); }
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

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-dlc-live");
  if (!(await serverUp())) { console.log(`test-research-dlc-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-dlc-live: SKIPPED (mod not installed)"); process.exit(0); }

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const escaped = [];
  p.on("request", (r) => { if (r.method() !== "GET") escaped.push(r.method() + " " + r.url()); });
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });

  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://localhost:${PORT}`, MOD);
  await p.evaluate(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (i, init) => {
      const m = ((init && init.method) || "GET").toUpperCase();
      if (m !== "GET") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      return real(i, init);
    };
  });

  const n = await p.evaluate(() => {
    const e = [...document.querySelectorAll("#nodesLayer .tech-node")][3];
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { id: e.getAttribute("data-id"), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  });
  ok(!!n, "found a tech to drag");
  if (!n) { await b.close(); process.exit(1); }

  await p.mouse.move(n.cx, n.cy); await p.mouse.down(); await p.mouse.move(n.cx + 140, n.cy + 100, { steps: 10 }); await p.mouse.up();
  await p.waitForTimeout(800);
  const moved = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y, o: t._origX }; }, n.id);
  ok(moved.o === moved.x, "the drag refreshed the _origX baseline (this is what protects the move)", moved);
  const undoAfterDrag = await p.evaluate(() => window.researchHistoryDepth().undo);

  // the DLC checkboxes are the id-less ones in the DLC panel
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((x) => /DLC/i.test(x.textContent || ""));
    if (btn) btn.click();
  });
  await p.waitForTimeout(800);
  const dlc = await p.evaluate(() => {
    const NAMES = /Arms Against Tyranny|By Blood Alone|Gotterdammerung|La Resistance|No Step Back|Man the Guns|Waking the Tiger|Death or Dishonor|Together for Victory|Battle for the Bosporus/i;
    const boxes = [...document.querySelectorAll("input[type=checkbox]")].filter((c) => c.offsetParent !== null && !c.id);
    for (let i = 0; i < boxes.length; i++) {
      const label = ((boxes[i].closest("label") || boxes[i].parentElement || {}).textContent || "").trim();
      if (NAMES.test(label)) return { idx: i, label: label.slice(0, 30) };
    }
    return null;
  });
  ok(!!dlc, "found a real DLC checkbox in the panel", dlc);
  if (!dlc) { await b.close(); process.exit(1); }
  console.log(`  (toggling "${dlc.label}")`);

  const clickDlc = (idx) => p.evaluate((i) => {
    const c = [...document.querySelectorAll("input[type=checkbox]")].filter((x) => x.offsetParent !== null && !x.id)[i];
    if (c) c.click();
  }, idx);

  await clickDlc(dlc.idx);
  await p.waitForTimeout(1800);
  const off = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return t ? { x: t.x, y: t.y, o: t._origX } : null; }, n.id);
  ok(off && off.x === moved.x && off.y === moved.y, "turning a DLC OFF keeps the dragged position", { moved, off });

  await clickDlc(dlc.idx);
  await p.waitForTimeout(1800);
  const back = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return t ? { x: t.x, y: t.y, o: t._origX } : null; }, n.id);
  ok(back && back.x === moved.x && back.y === moved.y, "turning it back ON keeps the dragged position", { moved, back });
  ok(back && back.o === moved.x, "the baseline is still the dragged x, not the pre-drag one", back);

  const after = await p.evaluate(() => ({ undo: window.researchHistoryDepth().undo, dirtyIds: window.__researchDirtyIds().length }));
  ok(after.undo === undoAfterDrag, "toggling a DLC records NO extra edit (it is display-only)", { undoAfterDrag, after });
  ok(after.dirtyIds === 1, "toggling a DLC does not enlarge what Save will write", after);
  ok(escaped.length === 0, "no request escaped to the server", escaped);

  await b.close();
  console.log(fails ? `\nDLC LIVE TEST: ${fails} FAILED` : "\nDLC LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
