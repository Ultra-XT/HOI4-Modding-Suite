// #idea-sourceroot + #overlay-blindness — THE SPIRITS EDITOR READ EVERY ENTRY OUT OF THE ACTIVE MOD.
//
// public/ideas.js fetched /api/ideas/edit-payload and /api/ideas/entry-block with
// sourceRoot=getModPath() hardcoded, ignoring the sourceRoot the catalog supplies per item
// (server.js:1138/1169). For an entry the mod does not own that is wrong two ways: one whose filename the
// mod also uses silently loads the MOD's file and returns HTTP 200 with the wrong content, and one the mod
// has no file for fails with "Could not read idea definition file."
//
// It only became reachable now because the sidebar asked for includeVanilla=0 and so listed 110 entries
// where the game loads 6,108 — the same overlay blindness as the research tree. The toggle makes inherited
// entries browsable; this test pins that clicking one actually reads the file it came from.
//
// Run: node e2e-ideas-inherited-sourceroot.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideasrc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); }
};

const MOD = path.join(ROOT, "idea_probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="Idea Probe"\nsupported_version="1.19.*"\npath="mod/idea_probe"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "nova_probe_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tprobe_own_spirit = {\n\t\t\tpicture = generic_morale_bonus\n" +
  "\t\t\tmodifier = { political_power_factor = 0.1 }\n\t\t}\n\t}\n}\n", "utf8");

(async () => {
  console.log("=== SPIRITS: an inherited idea is read from the root it came from ===");
  const PORT = 3752, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
      localStorage.setItem("activeModPath", m);
      localStorage.setItem(`ideas_show_base_${m}`, "1"); // start with the base game shown
    } catch (_) {}
  }, MOD);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // Capture the REAL request the client makes, rather than re-deriving what it ought to be.
  const editReqs = [];
  await page.route("**/api/ideas/edit-payload*", async (route) => {
    editReqs.push(route.request().url());
    await route.continue();
  });

  try {
    await page.goto(`${BASE}/ideas.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ideasShowBaseBtn", { timeout: 40000 });
    // The catalog is large with the base game on; wait for the list to actually populate.
    await page.waitForFunction(() => {
      const l = document.getElementById("ideasList");
      return l && !/Loading Spirits/i.test(l.textContent || "") && l.querySelectorAll(".category-title").length > 0 && Array.isArray(window.allSpirits) && window.allSpirits.length > 0;
    }, null, { timeout: 90000 });

    console.log("\n[1] the toggle exists and reports the base game's size");
    const btnText = await page.evaluate(() => document.getElementById("ideasShowBaseBtn").textContent.trim());
    ok("the base-game toggle is present", !!btnText, btnText);
    ok("…and reads as shown", /shown/i.test(btnText), btnText);

    const counts = await page.evaluate(() => ({
      total: (window.allSpirits || []).length,
      own: (window.allSpirits || []).filter((i) => i.sourceType === "active_mod").length,
    }));
    // The control for "did the toggle do anything": with it off this used to be the ONLY number.
    ok("the mod's own spirit is listed", counts.own >= 1, counts);
    ok("…alongside the base game's, which the mod does not own", counts.total > counts.own + 50, counts);

    console.log("\n[2] clicking an INHERITED idea reads it from the base game, not from the mod");
    const picked = await page.evaluate(() => {
      const inherited = (window.allSpirits || []).find((i) => i.sourceType !== "active_mod" && i.sourceRoot);
      if (!inherited) return null;
      const el = [...document.querySelectorAll(".decision-item")]
        .find((n) => (n.textContent || "").includes(inherited.ideaId));
      if (el) el.click();
      return { ideaId: inherited.ideaId, sourceRoot: inherited.sourceRoot, clicked: !!el };
    });
    ok("an inherited idea was found in the list", !!picked, picked);
    if (picked && !picked.clicked) {
      // The sidebar folds entries into folders; expand everything and try again.
      await page.evaluate((id) => {
        document.querySelectorAll(".ideas-list [class*='folder'], .ideas-list details").forEach((n) => {
          try { n.open = true; n.click(); } catch (_) {}
        });
        const el = [...document.querySelectorAll(".decision-item")].find((n) => (n.textContent || "").includes(id));
        if (el) el.click();
      }, picked.ideaId);
    }
    await page.waitForTimeout(2500);

    ok("an edit-payload request was made", editReqs.length > 0, editReqs.length);
    if (editReqs.length) {
      const last = editReqs[editReqs.length - 1];
      const sent = decodeURIComponent((/[?&]sourceRoot=([^&]*)/.exec(last) || [])[1] || "");
      const norm = (s) => String(s).replace(/\\/g, "/").toLowerCase();
      // THIS is the assertion. Before the fix it was always the mod path.
      ok("the request carried the ITEM's source root, not the mod's",
        !!picked && norm(sent) === norm(picked.sourceRoot), { sent, expected: picked && picked.sourceRoot });
      ok("…and it is not the active mod", norm(sent) !== norm(MOD), sent);
    }

    console.log("\n[3] control — clicking the mod's OWN idea still uses the mod root");
    editReqs.length = 0;
    await page.evaluate(() => {
      const el = [...document.querySelectorAll(".decision-item")].find((n) => (n.textContent || "").includes("probe_own_spirit"));
      if (el) el.click();
    });
    await page.waitForTimeout(2000);
    ok("the own-idea click issued a request", editReqs.length > 0, editReqs.length);
    if (editReqs.length) {
      const sent = decodeURIComponent((/[?&]sourceRoot=([^&]*)/.exec(editReqs[editReqs.length - 1]) || [])[1] || "");
      ok("…carrying the active mod's root", String(sent).replace(/\\/g, "/").toLowerCase() === MOD.replace(/\\/g, "/").toLowerCase(), sent);
    }

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nIDEAS-INHERITED-SOURCEROOT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
