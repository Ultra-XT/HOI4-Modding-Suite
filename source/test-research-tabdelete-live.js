// DELETING A CUSTOM TAB MUST VERIFY THE SERVER ACTUALLY DID IT (#tab-delete-verify).
//
// The delete used to remove the tab, rewrite localStorage and reassign every tech to infantry BEFORE
// calling the server, then fire the request as `try { await fetch(...) } catch (_) {}` — ignoring both
// the status and the body. A delete that FAILED therefore left the folder def, GUI container and sprite
// in the mod while the editor showed the tab as gone and had already moved its techs out: the orphaned
// tab still appears in-game, and nothing told the user. The create path already had the right
// discipline ("a failed scaffold never shows a phantom tab"); this asserts delete now mirrors it.
//
// Every non-GET is stubbed, so the test cannot write to a mod: the "success" branch is a stubbed ok
// and the "failure" branch a stubbed 500. It asserts zero requests escape to the server.
//
// PREREQUISITES: a Nova server and a mod on disk — environment, not code, so this SKIPS (exit 0) when
// either is missing, keeping the aggregate runner green on a machine with no game.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-tabdelete-live: SKIPPED (playwright unavailable)"); process.exit(0); }
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

// Boot with every non-GET stubbed; `failDelete` decides how delete-custom-folder answers.
const boot = async (p, failDelete) => {
  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://localhost:${PORT}`, MOD);
  await p.evaluate((fail) => {
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = ((init && init.method) || "GET").toUpperCase();
      if (method === "GET") return real(input, init);
      const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
      if (/delete-custom-folder/.test(url)) {
        return fail ? json({ error: "permission denied" }, 500) : json({ ok: true, folderKey: "x", defRemoved: true });
      }
      return json({ ok: true });
    };
  }, failDelete);
};

// Inject a custom tab straight into the editor's own store, then reload the tab strip. This is the
// state a real "create tab" leaves behind, without performing the create (which writes to the mod).
const seedTab = (p) => p.evaluate(() => {
  const mod = localStorage.getItem("activeModPath");
  const key = "custom_tab_novatest_" + Date.now();
  const folder = "novatest_folder";
  const list = JSON.parse(localStorage.getItem(`custom_research_tabs_${mod}`) || "[]");
  list.push({ name: "NovaTest", key, folder, layout: "horizontal", ledger: "army" });
  localStorage.setItem(`custom_research_tabs_${mod}`, JSON.stringify(list));
  return { key, folder, mod };
});

const clickDelete = async (p, tabName) => {
  const found = await p.evaluate((n) => {
    const tab = [...document.querySelectorAll(".folder-tab")].find((t) => (t.textContent || "").includes(n));
    if (!tab) return false;
    const x = tab.querySelector(".delete-tab-btn");
    if (!x) return false;
    x.click();
    return true;
  }, tabName);
  if (!found) return false;
  await p.waitForTimeout(600);
  // confirm the modal — scope to the modal's own button, never a same-labelled one elsewhere
  return p.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .filter((b) => b.offsetParent !== null && b.id !== "deleteTechBtn")
      .filter((b) => /^delete$/i.test((b.textContent || "").trim()));
    const y = btns[btns.length - 1];
    if (y) { y.click(); return true; }
    return false;
  });
};

const runCase = async (failDelete) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const escaped = [];
  p.on("request", (r) => { if (r.method() !== "GET") escaped.push(r.method() + " " + r.url()); });
  await boot(p, failDelete);
  const seeded = await seedTab(p);
  // Open the page again, so the strip is drawn from the store just seeded — and with the stub, which a new document does
  // not keep. (This reloaded, waited, and then booted a third time only to put the stub back.)
  await boot(p, failDelete);
  await p.waitForTimeout(500);

  const present = await p.evaluate((n) => [...document.querySelectorAll(".folder-tab")].some((t) => (t.textContent || "").includes(n)), "NovaTest");
  ok(present, `[${failDelete ? "FAIL" : "OK"} case] the seeded custom tab is on the strip`);
  if (!present) { await b.close(); return; }

  const confirmed = await clickDelete(p, "NovaTest");
  ok(confirmed, `[${failDelete ? "FAIL" : "OK"} case] the delete confirmation was accepted`);
  await p.waitForTimeout(1800);

  const after = await p.evaluate((s) => {
    const list = JSON.parse(localStorage.getItem(`custom_research_tabs_${s.mod}`) || "[]");
    return {
      onStrip: [...document.querySelectorAll(".folder-tab")].some((t) => (t.textContent || "").includes("NovaTest")),
      inStore: list.some((t) => t.key === s.key),
    };
  }, seeded);

  if (failDelete) {
    ok(after.onStrip === true, "a FAILED delete leaves the tab on the strip", after);
    ok(after.inStore === true, "a FAILED delete leaves the tab in the editor's store (nothing changed)", after);
  } else {
    ok(after.onStrip === false, "a SUCCESSFUL delete removes the tab from the strip", after);
    ok(after.inStore === false, "a SUCCESSFUL delete removes the tab from the store", after);
  }
  ok(escaped.length === 0, `[${failDelete ? "FAIL" : "OK"} case] no request escaped to the server`, escaped);
  await b.close();
};

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-tabdelete-live");
  if (!(await serverUp())) { console.log(`test-research-tabdelete-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-tabdelete-live: SKIPPED (mod not installed)"); process.exit(0); }
  await runCase(true);   // server refuses -> editor must not change
  await runCase(false);  // server accepts -> editor must follow through
  console.log(fails ? `\nTAB-DELETE LIVE TEST: ${fails} FAILED` : "\nTAB-DELETE LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
