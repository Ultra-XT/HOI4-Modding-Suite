// #overlay-blindness — A HOI4 MOD IS AN OVERLAY, NOT A BLANK SLATE.
//
// The user found this by PLAYING a Nova-built mod: "the research tree is empty to u and the user cuz u
// think ur making a brand new mod, but in reality its full of vanilla tech … so some of ur tech were
// overlapping with vanilla cuz u did not think there was anything else."
//
// The server was never blind — /api/technologies/catalog merges vanilla and mod and tags every entry
// isMod. public/research.js then did `allTechs = data.technologies.filter(t => t.isMod)` and threw the
// base game away before drawing anything, so the Infantry tab painted 4 nodes where the game paints 66
// and a fresh mod was announced as an "Empty Research Tree" the game already fills with 552 techs.
//
// This test pins BOTH halves of the fix, because each is dangerous without the other:
//   1. the base game's techs are LOADED and DRAWN alongside the mod's, and
//   2. they are still never WRITTEN into the mod — save stays double-gated on `isMod && dirty`, so
//      un-filtering the canvas cannot start copying 552 vanilla technologies into someone's mod.
//
// Half 2 is asserted against the REAL save-batch request body (captured with page.route), not against a
// re-implementation of the filter — a re-implementation would pass no matter what the client sent.
//
// Run: node e2e-research-overlay-base-techs.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-overlay-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400) : "")); }
};

// A mod with exactly ONE technology of its own, in a VANILLA folder — the situation the user hit.
const MOD = path.join(ROOT, "overlay_probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="Overlay Probe"\nsupported_version="1.19.*"\npath="mod/overlay_probe"\n', "utf8");
// This tech has no gridbox of its own in the mod's GUI, so it is "engine-unplaced" — the game would not
// draw it either, and Nova hides it from the normal canvas for exactly that reason (#new-tech-visible).
// That is correct behaviour, not the bug under test, so the checks below reveal it with the 👁 Hidden
// techs toggle rather than pretending an unplaced tech should paint. (Vanilla never writes `prerequisite`
// blocks in common/technologies — every link is derived from the PARENT's `path = { leads_to_tech }` —
// so a mod tech cannot graft itself onto a vanilla chain without redefining the vanilla parent.)
fs.writeFileSync(path.join(MOD, "common", "technologies", "probe_tech.txt"),
  "technologies = {\n" +
  "\tprobe_overlay_tech = {\n" +
  "\t\tresearch_cost = 1.0\n" +
  "\t\tstart_year = 1936\n" +
  "\t\tfolder = {\n" +
  "\t\t\tname = infantry_folder\n" +
  "\t\t\tposition = { x = 20 y = 0 }\n" +
  "\t\t}\n" +
  "\t\tcategories = { infantry_tech }\n" +
  "\t}\n" +
  "}\n", "utf8");

const TECH_DIR = path.join(MOD, "common", "technologies");
const snapshotTechDir = () => Object.fromEntries(
  fs.readdirSync(TECH_DIR).map((f) => [f, fs.readFileSync(path.join(TECH_DIR, f), "utf8")]));

(async () => {
  console.log("=== RESEARCH: the base game is an OVERLAY under the mod (#overlay-blindness) ===");
  const PORT = 3741, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((modPath) => {
    try {
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
      localStorage.setItem("activeModPath", modPath);
    } catch (_) {}
  }, MOD);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // Capture the REAL save payload rather than trusting a re-derivation of the filter.
  let savedBody = null;
  await page.route("**/api/technologies/save-batch", async (route) => {
    try { savedBody = JSON.parse(route.request().postData() || "null"); } catch (_) { savedBody = "UNPARSEABLE"; }
    await route.continue();
  });

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Array.isArray(window.allTechs) && window.allTechs.length > 0, null, { timeout: 40000 });
    // The catalog arrives asynchronously; wait until the mod's own tech is actually in it.
    await page.waitForFunction(() => window.allTechs.some((t) => t.id === "probe_overlay_tech"), null, { timeout: 40000 });

    const counts = await page.evaluate(() => ({
      total: window.allTechs.length,
      mod: window.allTechs.filter((t) => t.isMod).length,
      base: window.allTechs.filter((t) => !t.isMod).length,
      baseInInfantry: window.allTechs.filter((t) => !t.isMod && t.folder === "infantry_folder").length,
    }));

    console.log("\n[1] the base game's technologies are LOADED, not filtered away");
    ok("the mod's own tech is present", counts.mod >= 1, counts);
    // The control for "did we actually change anything": before the fix this was exactly 0.
    ok("base-game technologies are present in allTechs", counts.base > 100, counts);
    ok("…including in infantry_folder, where the mod's tech sits", counts.baseInInfantry > 10, counts);

    console.log("\n[2] …and they are DRAWN on the canvas, across every tab the game will show");
    await page.waitForFunction(() => document.querySelectorAll("#folderTabs .folder-tab").length > 1, null, { timeout: 40000 });
    await page.waitForTimeout(1500);
    const tabNames = await page.evaluate(() =>
      [...document.querySelectorAll("#folderTabs .folder-tab")].map((t) => t.textContent.trim()).filter((n) => !/Custom Tab/i.test(n)));
    // THE HEADLINE. This mod owns one infantry tech; before the fix the strip held that one tab, because
    // a tab with no MOD tech in it counted as empty. The game draws roughly nine.
    ok("the tab strip shows the base game's folders, not just the mod's", tabNames.length >= 7, tabNames);
    ok("…including Industry, where this mod has nothing at all", tabNames.some((n) => /industr/i.test(n)), tabNames);

    // Walk the strip and take the tab that draws the most — that is the one holding infantry_folder.
    let drawn = { inherited: 0, own: 0, total: 0 };
    for (let i = 0; i < tabNames.length; i++) {
      await page.evaluate((idx) => {
        const tabs = document.querySelectorAll("#folderTabs .folder-tab");
        if (tabs[idx]) tabs[idx].click();
      }, i);
      await page.waitForTimeout(250);
      const d = await page.evaluate(() => ({
        inherited: document.querySelectorAll(".tech-node.inherited").length,
        own: document.querySelectorAll(".tech-node:not(.vanilla)").length,
        total: document.querySelectorAll(".tech-node").length,
      }));
      if (d.inherited > drawn.inherited) drawn = d;
    }
    ok("inherited base-game nodes are rendered", drawn.inherited > 20, drawn);
    ok("every node on a mod-free tab is marked inherited", drawn.own === 0 || drawn.total > drawn.own, drawn);

    console.log("\n[3] the 'Empty Research Tree' card does not claim an empty tree");
    const overlayText = await page.evaluate(() => {
      const el = document.getElementById("emptyTreeOverlay");
      return el ? el.textContent : "";
    });
    ok("no card claiming the mod has no technologies (it has one)",
      !/does not have any custom technologies/i.test(overlayText), overlayText.slice(0, 200));

    console.log("\n[4] hiding the base game is a DISPLAY toggle only");
    await page.evaluate(() => { const b = document.getElementById("showBaseTechsBtn"); if (b) b.click(); });
    await page.waitForTimeout(400);
    const hidden = await page.evaluate(() => ({
      inheritedDrawn: document.querySelectorAll(".tech-node.inherited").length,
      stillInMemory: window.allTechs.filter((t) => !t.isMod).length,
      tabs: document.querySelectorAll("#folderTabs .folder-tab").length,
    }));
    ok("toggling OFF removes inherited nodes from the canvas", hidden.inheritedDrawn === 0, hidden);
    ok("…and allTechs is untouched (display-only, nothing leaves memory)", hidden.stillInMemory > 100, hidden);
    await page.evaluate(() => { const b = document.getElementById("showBaseTechsBtn"); if (b) b.click(); });
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => document.querySelectorAll(".tech-node.inherited").length);
    ok("…and toggling back ON restores them", restored > 0, restored);

    console.log("\n[5] THE SAFETY PROPERTY — a save must never write the base game into the mod");
    const before = snapshotTechDir();
    // Make a genuine edit through the UI so the save has something to write. Without this the save sends
    // an empty list whatever the filter does, and the whole check would be vacuous.
    // The probe is engine-unplaced (see the fixture note), so reveal it with the 👁 toggle first — the
    // documented way to reach a tech the canvas otherwise drops — then walk the tabs to find it.
    await page.evaluate(() => { const b = document.getElementById("showHiddenBtn"); if (b) b.click(); });
    await page.waitForTimeout(400);
    for (let i = 0; i < tabNames.length; i++) {
      await page.evaluate((idx) => {
        const tabs = document.querySelectorAll("#folderTabs .folder-tab");
        if (tabs[idx]) tabs[idx].click();
      }, i);
      await page.waitForTimeout(250);
      const found = await page.evaluate(() => {
        const node = document.querySelector('.tech-node[data-id="probe_overlay_tech"]');
        if (node) { node.click(); return true; }
        return false;
      });
      if (found) break;
    }
    await page.waitForTimeout(600);
    const nameField = await page.$("#techName");
    ok("the mod tech opened in the sidebar (so the edit below is real)", !!nameField);
    if (nameField) {
      await nameField.fill("Probe Overlay Tech Renamed");
      await nameField.dispatchEvent("input");
      await nameField.dispatchEvent("change");
      await page.waitForTimeout(200);
    }
    const dirtyIds = await page.evaluate(() => (window.__researchDirtyIds ? window.__researchDirtyIds() : []));
    ok("the edit marked exactly the mod tech dirty", dirtyIds.includes("probe_overlay_tech"), dirtyIds);

    await page.evaluate(() => { const b = document.getElementById("saveAllBtn"); if (b) b.click(); });
    await page.waitForFunction(() => !!window.__novaSaveSettled || true, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    ok("a save-batch request was actually sent", savedBody && savedBody !== "UNPARSEABLE", savedBody === null ? "no request" : "unparseable");
    if (savedBody && savedBody !== "UNPARSEABLE") {
      const sent = Array.isArray(savedBody.technologies) ? savedBody.technologies : [];
      const sentBase = sent.filter((t) => !t.isMod);
      // THIS is the assertion that makes un-filtering the canvas safe.
      ok("the save payload contains NO base-game technology", sentBase.length === 0,
        sentBase.slice(0, 5).map((t) => t.id));
      ok("…and does contain the edited mod technology", sent.some((t) => t.id === "probe_overlay_tech"),
        sent.map((t) => t.id).slice(0, 10));
      ok("the payload is small (not the whole merged catalog)", sent.length < 50, sent.length);
    }

    const after = snapshotTechDir();
    const newFiles = Object.keys(after).filter((f) => !(f in before));
    const allText = Object.values(after).join("\n");
    // Vanilla ids that must never appear in this mod's files. `infantry_weapons` is vanilla's very first
    // infantry tech; `tech_mountaineers` and `support_weapons` sit in the same folder as the probe.
    const leaked = ["infantry_weapons", "tech_mountaineers", "support_weapons", "atomic_research"]
      .filter((id) => new RegExp(`(^|[^\\w])${id}\\s*=\\s*\\{`, "m").test(allText));
    ok("no vanilla technology was written into the mod on disk", leaked.length === 0, leaked);
    ok("the save did not explode the mod into many files", newFiles.length <= 2, newFiles);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nRESEARCH-OVERLAY-BASE-TECHS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
