// A TECH'S EQUIPMENT MUST TRAVEL WITH IT (#equip-follows-tech).
//
// Deleting a tech that unlocks equipment has to remove the equipment too, or the mod keeps an
// equipment definition nothing enables. And undoing that delete has to bring BOTH back — the tech, the
// equipment, and the queued deletion — or the next Save removes an equipment the editor is showing.
// This is the same shape as the pendingDeletions data-loss bug, one level down.
//
// Every non-GET is stubbed, so the test cannot write to a mod; it asserts nothing escapes.
//
// PREREQUISITES: a Nova server, a mod on disk, and a tech with equipment rendered on the current tab —
// all environment, not code, so this SKIPS (exit 0) when any is missing.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-equipment-live: SKIPPED (playwright unavailable)"); process.exit(0); }
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
  if (!PORT) PORT = await ownLiveServer("test-research-equipment-live");
  if (!(await serverUp())) { console.log(`test-research-equipment-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-equipment-live: SKIPPED (mod not installed)"); process.exit(0); }

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

  // a MOD tech, on screen, that unlocks equipment
  const victim = await p.evaluate(() => {
    for (const n of document.querySelectorAll("#nodesLayer .tech-node")) {
      const id = n.getAttribute("data-id");
      const t = (window.allTechs || []).find((x) => x.id === id);
      if (!t || !t.isMod || t.isSubTech) continue;
      const eq = t.enableEquipments && t.enableEquipments[0];
      if (!eq) continue;
      n.scrollIntoView({ block: "center", inline: "center" });
      const r = n.getBoundingClientRect();
      if (r.x <= 0 || r.y <= 0) continue;
      return { id, eq, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    }
    return null;
  });
  if (!victim) { console.log("test-research-equipment-live: SKIPPED (no on-screen mod tech unlocks equipment)"); await b.close(); process.exit(0); }
  console.log(`  (deleting ${victim.id}, which unlocks ${victim.eq})`);

  const eqLoadedBefore = await p.evaluate((e) => !!(window.allEquips && window.allEquips[e]), victim.eq);

  await p.mouse.click(victim.cx, victim.cy);
  await p.waitForTimeout(600);
  await p.click("#deleteTechBtn");
  await p.waitForTimeout(500);
  const confirmed = await p.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .filter((x) => x.offsetParent !== null && x.id !== "deleteTechBtn")
      .filter((x) => /^delete$/i.test((x.textContent || "").trim()));
    const y = btns[btns.length - 1];
    if (y) { y.click(); return true; }
    return false;
  });
  ok(confirmed, "the delete confirmation was accepted");
  await p.waitForTimeout(900);

  const afterDelete = await p.evaluate((v) => {
    const q = window.__researchPendingDeletionsFull();
    const entry = q.find((d) => d.techId === v.id);
    return { queued: !!entry, equipIdQueued: entry ? entry.equipId : null, techGone: !window.allTechs.some((t) => t.id === v.id) };
  }, victim);
  ok(afterDelete.techGone, "the tech is gone from the canvas model", afterDelete);
  ok(afterDelete.queued, "the deletion is queued", afterDelete);
  ok(afterDelete.equipIdQueued === victim.eq,
    "the queued deletion CARRIES the equipment id, so the equipment goes with its tech", afterDelete);

  // UNDO — both must come back, and the queue must clear
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(900);
  const afterUndo = await p.evaluate((v) => ({
    techBack: window.allTechs.some((t) => t.id === v.id),
    stillEnables: (window.allTechs.find((t) => t.id === v.id) || {}).enableEquipments || [],
    equipPresent: !!(window.allEquips && window.allEquips[v.eq]),
    queue: window.__researchPendingDeletionsFull().length,
  }), victim);
  ok(afterUndo.techBack, "Ctrl+Z restored the tech", afterUndo);
  ok(afterUndo.stillEnables.includes(victim.eq), "the restored tech still unlocks its equipment", afterUndo);
  ok(afterUndo.queue === 0, "Ctrl+Z cleared the queued deletion, so Save will not remove it anyway", afterUndo);
  if (eqLoadedBefore) ok(afterUndo.equipPresent, "the equipment definition is still loaded after the undo", afterUndo);

  ok(escaped.length === 0, "no request escaped to the server", escaped);
  await b.close();
  console.log(fails ? `\nEQUIPMENT LIVE TEST: ${fails} FAILED` : "\nEQUIPMENT LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
