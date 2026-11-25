// A FAILED SAVE MUST NOT LOOK LIKE A SUCCESSFUL ONE (#save-failure-status, #save-failure-retry).
//
// Two defects lived here, both the same silent-data-loss shape as the pendingDeletions bug:
//
//   A. the save checked only `result.error`, never the HTTP status — so a 500 whose JSON body happened
//      to lack that key fell through to the success path: dirty cleared, dirtyTechIds emptied,
//      pendingDeletions dropped, catalog reloaded, "saved successfully". The work was gone and the
//      editor said it had saved it.
//   B. the staged label flushes cleared their whole pending map regardless of outcome, so a write that
//      FAILED was announced in an alert and then thrown away — pressing Save again would not retry it.
//
// EVERY non-GET is intercepted by a fetch stub, so this test cannot write to a mod even in principle;
// it asserts that zero requests escape to the server.
//
// PREREQUISITES: a Nova server and a mod on disk — environment, not code, so this SKIPS (exit 0) when
// either is missing, keeping the aggregate runner green on a machine with no game.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-savefail-live: SKIPPED (playwright unavailable)"); process.exit(0); }
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

// Boot the page with EVERY non-GET intercepted. `scenario` decides which endpoint reports failure.
const boot = async (p, scenario) => {
  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://localhost:${PORT}`, MOD);
  await p.evaluate((sc) => {
    window.__stubbed = [];
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "GET") return real(input, init);
      window.__stubbed.push(method + " " + url);
      const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
      if (sc === "A" && /save-batch/.test(url)) return json({ ok: false }, 500);   // failed, but no `error` key
      if (sc === "B" && /set-label-text/.test(url)) return json({ ok: false, error: "disk full" }, 500);
      return json({ ok: true, saved: 1 });
    };
  }, scenario);
};
const clickSave = (p) => p.evaluate(() => {
  const b = document.getElementById("saveAllBtn") ||
    [...document.querySelectorAll("button")].find((x) => /save changes/i.test(x.textContent || ""));
  if (b) b.click();
});

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-savefail-live");
  if (!(await serverUp())) { console.log(`test-research-savefail-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-savefail-live: SKIPPED (mod not installed)"); process.exit(0); }

  // ---------------- A: the save request itself fails ----------------
  {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
    const escaped = [];
    p.on("request", (r) => { if (r.method() !== "GET") escaped.push(r.method() + " " + r.url()); });
    await boot(p, "A");

    const n = await p.evaluate(() => {
      const e = [...document.querySelectorAll("#nodesLayer .tech-node")][3];
      const r = e.getBoundingClientRect();
      return { id: e.getAttribute("data-id"), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    const orig = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y }; }, n.id);
    await p.mouse.move(n.cx, n.cy); await p.mouse.down(); await p.mouse.move(n.cx + 130, n.cy + 90, { steps: 8 }); await p.mouse.up();
    await p.waitForTimeout(800);
    const moved = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y }; }, n.id);
    ok(moved.x !== orig.x || moved.y !== orig.y, "an edit was made", { orig, moved });

    await clickSave(p);
    await p.waitForTimeout(3000);
    const st = await p.evaluate((id) => {
      const t = window.allTechs.find((x) => x.id === id);
      return { dirty: window.__focusEditorHasUnsavedChanges(), coords: t ? { x: t.x, y: t.y } : null, undo: window.researchHistoryDepth().undo };
    }, n.id);
    ok(st.dirty === true, "a FAILED save leaves the editor dirty (it must not claim success)", st);
    ok(st.coords && st.coords.x === moved.x && st.coords.y === moved.y, "the edit itself survives a failed save", st);
    ok(st.undo >= 1, "the undo history is intact after a failed save", st);
    ok(escaped.length === 0, "no request escaped the stub to the real server", escaped);
    console.log(`  (scenario A intercepted ${(await p.evaluate(() => window.__stubbed.length))} POST(s); undo depth ${st.undo})`);
    await b.close();
  }

  // ---------------- B: a staged flush fails after the techs land ----------------
  {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
    const escaped = [];
    p.on("request", (r) => { if (r.method() !== "GET") escaped.push(r.method() + " " + r.url()); });
    await boot(p, "B");

    const l = await p.evaluate(() => {
      const e = document.querySelector(".research-gui-label");
      if (!e) return null;
      e.scrollIntoView({ block: "center", inline: "center" });
      const r = e.getBoundingClientRect();
      return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    ok(!!l, "found a section label to rename");
    await p.mouse.click(l.cx, l.cy); await p.waitForTimeout(600);
    await p.keyboard.press("Control+a"); await p.keyboard.type("STUB RENAME"); await p.keyboard.press("Enter");
    await p.waitForTimeout(800);
    ok((await p.evaluate(() => window.__researchStagedTextCount())) === 1, "the rename is staged");

    await clickSave(p);
    await p.waitForTimeout(3500);
    const after = await p.evaluate(() => ({
      staged: window.__researchStagedTextCount(),
      dirty: window.__focusEditorHasUnsavedChanges(),
    }));
    ok(after.staged === 1, "a FAILED label write stays queued so Save can retry it", after);
    ok(after.dirty === true, "a partial save keeps the editor dirty (the retry must stay reachable)", after);
    ok(escaped.length === 0, "no request escaped the stub to the real server", escaped);
    await b.close();
  }

  console.log(fails ? `\nSAVE-FAILURE LIVE TEST: ${fails} FAILED` : "\nSAVE-FAILURE LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
