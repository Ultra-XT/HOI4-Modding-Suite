// #spirit-icons-missing — THE SPIRIT ICONS, IN A BROWSER.
//
// test-spirit-picture-token.js proves the server half: the token survives the scan, reaches the catalogue,
// round-trips exactly for all 16,081 declarations in vanilla + Millennium Dawn, and a stale-schema disk
// cache is refused. Its CLIENT half was five source greps — string matches against public/country-setup.js —
// and an adversarial review was right that those survive the reported symptom: they check the code contains
// certain text, not that a spirit ever draws its art.
//
// This drives the real page instead: both surfaces the user named ("in the country setup page, also in the
// browse list"), against a mod whose spirits declare real pictures, asserting the <img> is present, points
// at GFX_idea_<token>, and actually decodes to a bitmap.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritui-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); }
};

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "spiritui");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="SpiritUI"\nsupported_version="1.19.*"\npath="mod/spiritui"\n', "utf8");

// Borrow a REAL vanilla sprite key so the icon genuinely resolves to a real .dds — a made-up token would
// only ever exercise the placeholder path and prove nothing about the happy case.
let realToken = "";
try {
  const gfx = fs.readFileSync(path.join(V, "interface", "ideas.gfx"), "utf8");
  const m = /name\s*=\s*"GFX_idea_([A-Za-z0-9_]+)"/.exec(gfx);
  realToken = m ? m[1] : "";
} catch (_) {}

fs.writeFileSync(path.join(MOD, "common", "ideas", "ui_spirits.txt"), `ideas = {
\tcountry = {
\t\tui_spirit_with_art = {
\t\t\tpicture = ${realToken || "generic_research_bonus"}
\t\t\tmodifier = { stability_factor = 0.1 }
\t\t}
\t\tui_spirit_hyphen = {
\t\t\tpicture = pro-american
\t\t\tmodifier = { war_support_factor = 0.05 }
\t\t}
\t\tui_spirit_no_art = {
\t\t\tmodifier = { political_power_gain = 0.1 }
\t\t}
\t}
}
`, "utf8");
fs.writeFileSync(path.join(MOD, "history", "countries", "SPU - Spiritland.txt"), `capital = 1

add_ideas = {
\tui_spirit_with_art
\tui_spirit_hyphen
\tui_spirit_no_art
}
`, "utf8");

(async () => {
  console.log("=== COUNTRY SETUP: national spirits draw their own art ===");
  if (!realToken) {
    console.error("  FAIL — vanilla's ideas.gfx was not readable, so this test asserted NOTHING.");
    process.exit(1);
  }
  const PORT = 3773, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
      localStorage.setItem("activeModPath", m);
    } catch (_) {}
  }, MOD);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // naturalWidth > 0 is the only honest "it drew": src being set proves nothing if the request 404s.
  const iconsIn = (sel) => page.evaluate((s) => {
    const host = document.querySelector(s);
    if (!host) return null;
    return [...host.querySelectorAll(".cs-spirit-row, .modal-item-spirit")].map((r) => {
      const img = r.querySelector("img");
      const id = (r.querySelector(".cs-spirit-id") || r.querySelector("div")).textContent.trim();
      return {
        id,
        hasImg: !!img,
        src: img ? img.getAttribute("src") : "",
        w: img ? img.naturalWidth : 0,
        shield: /\u{1F6E1}/u.test(r.textContent),
      };
    });
  }, sel);

  try {
    await page.goto(`${BASE}/country-setup.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cs-country-item", { timeout: 90000 });
    await page.waitForTimeout(1500);

    console.log("\n[assigned rows] the country's own starting spirits");
    await page.evaluate(() => {
      const el = [...document.querySelectorAll(".cs-country-item")].find((e) => /^SPU/.test(e.textContent.trim()));
      if (el) el.click();
    });
    await page.waitForTimeout(2500);
    // The catalogue arrives after the rows on a cold sessionStorage, and the repaint is what draws the art.
    await page.waitForFunction(() => {
      const l = document.getElementById("csSpiritsList");
      return l && l.querySelectorAll("img").length > 0;
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const rows = await iconsIn("#csSpiritsList");
    ok("the three assigned spirits are listed", rows && rows.length === 3, rows);
    if (rows && rows.length === 3) {
      const byId = {};
      rows.forEach((r) => { byId[r.id] = r; });
      ok("a spirit with real art draws an <img>", byId.ui_spirit_with_art && byId.ui_spirit_with_art.hasImg, byId.ui_spirit_with_art);
      ok("…pointing at GFX_idea_<token>",
        byId.ui_spirit_with_art && byId.ui_spirit_with_art.src.includes(encodeURIComponent("GFX_idea_" + realToken)),
        byId.ui_spirit_with_art && byId.ui_spirit_with_art.src);
      // The point of the whole change: a real bitmap, not a broken image and not the shield.
      ok("…and it actually decoded to a bitmap",
        byId.ui_spirit_with_art && byId.ui_spirit_with_art.w > 0, byId.ui_spirit_with_art);
      ok("…and no shield is drawn for it", byId.ui_spirit_with_art && !byId.ui_spirit_with_art.shield, byId.ui_spirit_with_art);
      // The hyphen case is the one a whitelist re-broke; it must reach the server as the WHOLE token.
      ok("a hyphenated token survives to the request",
        byId.ui_spirit_hyphen && byId.ui_spirit_hyphen.src.includes(encodeURIComponent("GFX_idea_pro-american")),
        byId.ui_spirit_hyphen && byId.ui_spirit_hyphen.src);
      // And a spirit that genuinely declares nothing keeps the honest fallback.
      ok("a spirit with no picture still shows the shield",
        byId.ui_spirit_no_art && !byId.ui_spirit_no_art.hasImg && byId.ui_spirit_no_art.shield,
        byId.ui_spirit_no_art);
    }

    console.log("\n[browse list] the picker the user also named");
    await page.click("#csBrowseSpiritBtn");
    await page.waitForTimeout(1500);
    const picked = await iconsIn("#spiritPickerGrid");
    ok("the picker rendered rows", picked && picked.length >= 3, picked && picked.length);
    if (picked && picked.length) {
      const withArt = picked.filter((p) => p.hasImg);
      ok("…and spirits with art draw an <img> there too", withArt.length >= 2, picked.slice(0, 4));
      ok("…at least one of which decoded", withArt.some((p) => p.w > 0), withArt.slice(0, 3));
      ok("…and one that declares no picture keeps its shield",
        picked.some((p) => !p.hasImg && p.shield), picked.slice(0, 4));
    }

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nSPIRIT-ICONS-UI: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
