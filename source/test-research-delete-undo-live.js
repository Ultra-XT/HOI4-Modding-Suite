// DELETING A TECH MUST BE FULLY UNDOABLE — including the deletion QUEUE, not just the canvas.
//
// pendingDeletions is what Save Changes sends to the server as `deletions`. It was not part of the undo
// snapshot, so Ctrl+Z after a delete put the tech back on the canvas while the deletion stayed queued:
// the next Save wiped it from the mod anyway and the undo you trusted lost the tech silently. This test
// drives the real UI on a real mod (read-only) and asserts the queue is reverted with the canvas.
//
// PREREQUISITES: a Nova server and an installed mod — both environment, not code, so this SKIPS (exit 0)
// when either is missing, keeping the aggregate runner green on a machine with no game.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-delete-undo-live: SKIPPED (playwright unavailable)"); process.exit(0); }
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
  if (!PORT) PORT = await ownLiveServer("test-research-delete-undo-live");
  if (!(await serverUp())) { console.log(`test-research-delete-undo-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-delete-undo-live: SKIPPED (mod not installed)"); process.exit(0); }

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const writes = [];
  p.on("request", (r) => { if (r.method() !== "GET") writes.push(r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });
  p.on("dialog", (d) => d.accept());

  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://localhost:${PORT}`, MOD);

  ok(!!(await p.evaluate(() => typeof window.researchPendingDeletions === "function")),
    "the deletion queue is observable for testing");

  const before = await p.evaluate(() => ({ n: window.allTechs.length, q: window.researchPendingDeletions().length }));
  ok(before.q === 0, "the deletion queue starts empty", before);

  // Delete through the REAL UI: click a mod tech's node, press Delete, confirm the modal.
  const victim = await p.evaluate(() => {
    for (const n of document.querySelectorAll("#nodesLayer .tech-node")) {
      const id = n.getAttribute("data-id");
      const t = (window.allTechs || []).find((x) => x.id === id);
      if (t && t.isMod && !t.isSubTech) {
        const r = n.getBoundingClientRect();
        if (r.x > 0 && r.y > 0 && r.x < innerWidth - 60 && r.y < innerHeight - 60) {
          return { id, name: t.name, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
        }
      }
    }
    return null;
  });
  ok(!!victim, "found a visible mod tech to delete", victim);
  if (!victim) { await b.close(); process.exit(fails ? 1 : 0); }
  console.log(`  (deleting ${victim.id})`);

  await p.mouse.click(victim.cx, victim.cy);
  await p.waitForTimeout(500);
  await p.click("#deleteTechBtn");
  await p.waitForTimeout(500);
  // Confirm the Nova modal. Take the LAST matching button and never the sidebar's own delete button:
  // both are labelled "Delete", the sidebar one comes first in the DOM, and clicking it just reopens
  // the modal — which looked like a successful confirm while nothing was deleted.
  const confirmed = await p.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .filter((b) => b.offsetParent !== null && b.id !== "deleteTechBtn")
      .filter((b) => /^(delete|yes|confirm|ok)\b/i.test((b.textContent || "").trim()));
    const y = btns[btns.length - 1];
    if (y) { y.click(); return true; }
    return false;
  });
  ok(confirmed, "the delete confirmation was accepted");
  await p.waitForTimeout(900);

  const deleted = await p.evaluate((id) => ({
    n: window.allTechs.length, q: window.researchPendingDeletions(),
    present: window.allTechs.some((t) => t.id === id),
  }), victim.id);
  ok(deleted.present === false, "the tech is gone from the canvas model", deleted);
  ok(deleted.q.includes(victim.id), "the deletion is QUEUED for the next save", deleted);

  // UNDO
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(800);
  const after = await p.evaluate((id) => ({
    n: window.allTechs.length, q: window.researchPendingDeletions(),
    present: window.allTechs.some((t) => t.id === id),
  }), victim.id);
  ok(after.present === true, "Ctrl+Z put the tech back on the canvas", after);
  ok(after.q.length === 0, "Ctrl+Z ALSO cleared the queued deletion (this is the data-loss fix)", after);
  ok(after.n === before.n, "the tech count is back to where it started", { before: before.n, after: after.n });

  ok(writes.length === 0, "no write request during delete+undo", writes);
  console.log(`  (non-GET requests: ${writes.length})`);

  await b.close();
  console.log(fails ? `\nDELETE-UNDO LIVE TEST: ${fails} FAILED` : "\nDELETE-UNDO LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
