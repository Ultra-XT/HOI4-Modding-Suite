// Live undo/redo check against a REAL mod, READ-ONLY. Drives the actual user path: drag a tech node
// with the mouse, press Ctrl+Z, press Ctrl+Y — and assert coordinates round-trip exactly and that
// neither undo nor redo issues a single non-GET request (nothing may reach the mod before Save).
// PREREQUISITES: a Nova server (the runner's, or one it starts itself) and a real mod on disk, so this
// SKIPS (exit 0) when either is absent — the aggregate runner must stay green on a machine that has no
// game installed. The source-level invariants in test-research-undo.js always run; this is the live
// counterpart you run alongside a server.
const fsx = require("fs");
const net = require("net");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-undo-live: SKIPPED (playwright unavailable)"); process.exit(0); }
const MOD = process.env.NOVA_SNAP_MOD || "D:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\2777392649";
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
  if (!PORT) PORT = await ownLiveServer("test-research-undo-live");
  if (!(await serverUp())) { console.log(`test-research-undo-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-undo-live: SKIPPED (mod not installed)"); process.exit(0); }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const writes = [];
  p.on("request", (r) => { if (r.method() !== "GET") writes.push(r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });

  // #live-test-ignores-nova-port — NAVIGATE TO THE PORT WE JUST PROBED. This read NOVA_PORT for the
  // reachability check above and then went to a hardcoded 47821, so the override the runner advertises could
  // not work: with a server on another port this passed the probe and then navigated nowhere, and with two
  // instances up it silently tested the one nobody asked for.
  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://127.0.0.1:${PORT}`, MOD);

  ok(!!(await p.evaluate(() => typeof window.researchHistoryDepth === "function")), "undo API exposed");
  let d = await p.evaluate(() => window.researchHistoryDepth());
  ok(d.undo === 0 && d.redo === 0, "history starts empty after load", d);

  // pick a visible node near the top-left of the canvas so there is room to drag
  const target = await p.evaluate(() => {
    const nodes = [...document.querySelectorAll("#nodesLayer .tech-node")];
    if (!nodes.length) return null;
    nodes.sort((a, b) => (parseFloat(a.style.top) - parseFloat(b.style.top)) || (parseFloat(a.style.left) - parseFloat(b.style.left)));
    const n = nodes[Math.min(3, nodes.length - 1)];
    const r = n.getBoundingClientRect();
    const id = n.getAttribute("data-id");
    const t = window.allTechs.find((x) => x.id === id);
    return { id, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), x: t.x, y: t.y };
  });
  ok(!!target, "found a draggable tech node", target);
  if (!target) { await b.close(); process.exit(1); }
  console.log(`  (dragging ${target.id} from grid ${target.x},${target.y})`);

  const writesBeforeDrag = writes.length;
  await p.mouse.move(target.cx, target.cy);
  await p.mouse.down();
  await p.mouse.move(target.cx + 150, target.cy + 120, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(700);

  const moved = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y }; }, target.id);
  ok(moved.x !== target.x || moved.y !== target.y, "drag actually changed the grid coords", { from: target, moved });
  d = await p.evaluate(() => window.researchHistoryDepth());
  ok(d.undo === 1, "one drag = exactly ONE undo step (burst coalesced)", d);

  // --- UNDO ---
  const writesBeforeUndo = writes.length;
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(600);
  const undone = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y }; }, target.id);
  ok(undone.x === target.x && undone.y === target.y, "Ctrl+Z restored the EXACT original coords", { want: target, got: undone });
  d = await p.evaluate(() => window.researchHistoryDepth());
  ok(d.undo === 0 && d.redo === 1, "undo moved the step onto the redo stack", d);
  ok(writes.length === writesBeforeUndo, "UNDO issued no write request", writes.slice(writesBeforeUndo));

  // the canvas must actually repaint, not just the model
  const domAfterUndo = await p.evaluate((id) => {
    const n = document.querySelector(`#nodesLayer .tech-node[data-id="${id}"]`);
    return n ? { left: Math.round(parseFloat(n.style.left)), top: Math.round(parseFloat(n.style.top)) } : null;
  }, target.id);
  ok(!!domAfterUndo, "the tech is still on the canvas after undo", domAfterUndo);

  // --- REDO ---
  const writesBeforeRedo = writes.length;
  await p.keyboard.press("Control+y");
  await p.waitForTimeout(600);
  const redone = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y }; }, target.id);
  ok(redone.x === moved.x && redone.y === moved.y, "Ctrl+Y restored the moved coords", { want: moved, got: redone });
  ok(writes.length === writesBeforeRedo, "REDO issued no write request", writes.slice(writesBeforeRedo));

  // --- Ctrl+Shift+Z is also redo ---
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(500);
  await p.keyboard.press("Control+Shift+z");
  await p.waitForTimeout(500);
  const redone2 = await p.evaluate((id) => { const t = window.allTechs.find((x) => x.id === id); return { x: t.x, y: t.y }; }, target.id);
  ok(redone2.x === moved.x && redone2.y === moved.y, "Ctrl+Shift+Z also redoes", { want: moved, got: redone2 });

  // --- a new edit must clear the redo branch ---
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(500);
  await p.mouse.move(target.cx, target.cy); await p.mouse.down();
  await p.mouse.move(target.cx + 60, target.cy, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(700);
  d = await p.evaluate(() => window.researchHistoryDepth());
  ok(d.redo === 0, "a fresh edit discards the redo branch", d);

  // --- THE BIG ONE: across the whole session, no write ever left the page ---
  ok(writes.length === writesBeforeDrag, "NO write request at all during the entire edit/undo/redo session", writes.slice(writesBeforeDrag));
  console.log(`  (total non-GET requests this session: ${writes.length}${writes.length ? " -> " + writes.join(", ") : ""})`);

  // toolbar state proof + screenshot
  const btns = await p.evaluate(() => {
    const u = document.getElementById("researchUndoBtn"), r = document.getElementById("researchRedoBtn");
    return { undoDisabled: u.disabled, undoTitle: u.title, redoDisabled: r.disabled, redoTitle: r.title };
  });
  ok(btns.undoDisabled === false, "undo button is ENABLED and names the step", btns);
  ok(/Move /.test(btns.undoTitle), "undo tooltip names the actual edit", btns);
  console.log("  (buttons: " + JSON.stringify(btns) + ")");
  if (process.env.UNDO_SHOT) await p.screenshot({ path: process.env.UNDO_SHOT, clip: { x: 355, y: 172, width: 880, height: 46 } });

  await b.close();
  console.log(fails ? `\nUNDO LIVE TEST: ${fails} FAILED` : "\nUNDO LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
