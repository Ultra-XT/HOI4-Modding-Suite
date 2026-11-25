// #research-tab-reorder — THE DRAG ITSELF, IN A BROWSER.
//
// test-research-tab-reorder.js proves the server half: that the strip is positional, that DLC pairs share a
// slot, that the highlight glows travel with their tab, and that a reorder rewrites the gui the game reads.
// None of that says the UI is wired to it, which is the half the user actually asked for:
//
//   "maybe a drag future that drags them between each other so user can reorder how he wants, obviously that
//    should reorder in game as well after saving, make the future nice and visual so its clear that dragging
//    reorders something"
//
// So this drives the real page: turn the mode on, drag a tab, and check the gui on disk changed AND that the
// editor's own strip agrees after a reload. That last part matters on its own — the editor built its tab
// order from common/technology_tags, which is NOT what the game uses, so the two could disagree before
// anything was ever dragged.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tabdrag-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); }
};

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "tabdragmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="TabDragMod"\nsupported_version="1.19.*"\npath="mod/tabdragmod"\n', "utf8");

const MOD_GUI = path.join(MOD, "interface", "countrytechtreeview.gui");
let haveCorpus = true;
try {
  fs.copyFileSync(path.join(V, "interface", "countrytechtreeview.gui"), MOD_GUI);
  for (const f of fs.readdirSync(path.join(V, "common", "technology_tags"))) {
    if (/\.txt$/i.test(f)) fs.copyFileSync(path.join(V, "common", "technology_tags", f), path.join(MOD, "common", "technology_tags", f));
  }
  for (const f of fs.readdirSync(path.join(V, "common", "technologies"))) {
    if (/\.txt$/i.test(f)) fs.copyFileSync(path.join(V, "common", "technologies", f), path.join(MOD, "common", "technologies", f));
  }
} catch (_) { haveCorpus = false; }

// Read the strip straight off disk, independently of the server's parser.
function tabOrderOnDisk() {
  const txt = fs.readFileSync(MOD_GUI, "utf8");
  const i = txt.indexOf('name = "folder_tabs"');
  const open = txt.lastIndexOf("containerWindowType", i);
  let d = 0, end = -1;
  for (let j = txt.indexOf("{", open); j < txt.length; j++) {
    if (txt[j] === "{") d++;
    else if (txt[j] === "}") { d--; if (!d) { end = j; break; } }
  }
  const body = txt.slice(open, end);
  const out = [];
  const re = /(buttonType|iconType)\s*=\s*\{([\s\S]*?)\n\t{3,4}\}/g;
  let m;
  while ((m = re.exec(body))) {
    const p = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)/.exec(m[2]);
    const n = /\bname\s*=\s*"([A-Za-z0-9_]+)"/.exec(m[2]);
    if (p && n) out.push({ name: n[1], x: parseInt(p[1], 10) });
  }
  return out;
}
const tabsOnDisk = () => tabOrderOnDisk().filter((e) => /_tab$/.test(e.name) && !/highlight/.test(e.name))
  .sort((a, b) => a.x - b.x).map((e) => e.name.replace(/_tab$/, ""));

(async () => {
  console.log("=== RESEARCH: dragging a tab reorders it in the game's own file ===");
  // A SKIP THAT EXITS 0 READS AS A PASS. This file's whole job is to prove the drag reaches the gui, so if
  // the corpus is missing it has proved nothing and must say so with a non-zero exit rather than quietly
  // reporting success to whatever is running it.
  if (!haveCorpus) {
    console.error("  FAIL — the HOI4 install was not readable, so this test asserted NOTHING.");
    console.error("  Set the game path (or run on a machine with HOI4 installed); do not read this as a pass.");
    process.exit(1);
  }
  const PORT = 3771, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
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

  const editorTabs = () => page.evaluate(() =>
    [...document.querySelectorAll("#folderTabs .folder-tab[data-tab]")].map((e) => e.dataset.tab.replace("ftab_", "")));

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#folderTabs .folder-tab[data-tab]", { timeout: 90000 });
    await page.waitForTimeout(1200);

    console.log("\n[control] the strip is there and NOT draggable until asked");
    const before = await editorTabs();
    ok("the editor drew the tab strip", before.length >= 5, before);
    ok("…and nothing is draggable yet", (await page.evaluate(() =>
      document.querySelectorAll("#folderTabs [draggable=true]").length)) === 0);
    ok("…and the strip is not decorated as reorderable", !(await page.evaluate(() =>
      document.getElementById("folderTabs").classList.contains("tabs-reordering"))));
    ok("a Reorder button is offered", !!(await page.$("#tabReorderToggle")));

    console.log("\n[the affordance] turning it on has to LOOK different");
    await page.click("#tabReorderToggle");
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const c = document.getElementById("folderTabs");
      const t = c.querySelector(".tab-reorderable");
      return {
        striping: c.classList.contains("tabs-reordering"),
        draggable: c.querySelectorAll("[draggable=true]").length,
        cursor: t ? getComputedStyle(t).cursor : "",
        grip: t ? getComputedStyle(t, "::before").content : "",
        status: (document.getElementById("tabReorderStatus") || {}).textContent || "",
        label: (document.getElementById("tabReorderToggle") || {}).textContent || "",
      };
    });
    ok("the strip is visibly in reorder mode", state.striping, state);
    ok("…every real tab became draggable", state.draggable >= 5, state);
    ok("…the cursor says grab", state.cursor === "grab", state.cursor);
    ok("…a drag grip is drawn on the tabs", /⠿/.test(state.grip), state.grip);
    ok("…the button says how to get back out", /Done/i.test(state.label), state.label);
    ok("…and it says what to do", /drag/i.test(state.status), state.status);

    console.log("\n[the drag] moving the last tab to the front");
    const diskBefore = tabsOnDisk();
    const moved = await page.evaluate(() => {
      const c = document.getElementById("folderTabs");
      const tabs = [...c.querySelectorAll(".tab-reorderable")];
      const src = tabs[tabs.length - 1], dst = tabs[0];
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      const r = dst.getBoundingClientRect();
      dst.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt, clientX: r.left + 2, clientY: r.top + 5 }));
      const marker = dst.className;
      dst.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt, clientX: r.left + 2, clientY: r.top + 5 }));
      src.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
      return { src: src.dataset.tab.replace("ftab_", ""), marker };
    });
    // The user has to be able to see WHERE it will land before letting go.
    ok("a drop marker showed on the correct side during the drag", /tab-drop-before/.test(moved.marker), moved.marker);
    await page.waitForTimeout(1500);

    ok("the editor moved the tab to the front", (await editorTabs())[0] === moved.src, { want: moved.src, got: await editorTabs() });
    ok("…and said it saved", /saved/i.test(await page.evaluate(() =>
      (document.getElementById("tabReorderStatus") || {}).textContent || "")),
      await page.evaluate(() => (document.getElementById("tabReorderStatus") || {}).textContent));
    ok("…and no drag decoration was left behind", (await page.evaluate(() =>
      document.querySelectorAll("#folderTabs .tab-dragging, #folderTabs .tab-drop-before, #folderTabs .tab-drop-after").length)) === 0);

    console.log("\n[in game] the file HOI4 reads actually changed");
    const diskAfter = tabsOnDisk();
    console.log("       before: " + diskBefore.join(" · "));
    console.log("       after:  " + diskAfter.join(" · "));
    ok("the gui's first tab is the one dragged", diskAfter[0] === moved.src, { want: moved.src, got: diskAfter[0] });
    ok("…the order genuinely changed", diskAfter.join(",") !== diskBefore.join(","), diskAfter);
    ok("…and no tab was lost", diskAfter.length === diskBefore.length, { before: diskBefore.length, after: diskAfter.length });
    // The pairs are the thing a naive renumber breaks; check on the real file, not through the API.
    const xOf = (n) => (tabOrderOnDisk().find((e) => e.name === n) || {}).x;
    ok("…the DLC pairs still share a slot",
      xOf("armour_folder_tab") === xOf("nsb_armour_folder_tab") &&
      xOf("air_techs_folder_tab") === xOf("bba_air_techs_folder_tab"),
      { armour: xOf("armour_folder_tab"), nsb: xOf("nsb_armour_folder_tab") });

    console.log("\n[persistence] the editor must agree with the game after a reload");
    // This is the check that would have failed BEFORE this work even with no drag: the editor ordered its
    // tabs by common/technology_tags, the game by the gui.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#folderTabs .folder-tab[data-tab]", { timeout: 90000 });
    await page.waitForTimeout(1200);
    const reloaded = await editorTabs();
    ok("the reordered tab is still first after a reload", reloaded[0] === moved.src, { want: moved.src, got: reloaded });
    // Compare against the gui's own order, restricted to what the editor draws (DLC filtering hides variants).
    const diskRank = new Map();
    tabsOnDisk().forEach((f, i) => diskRank.set(f, i));
    const ranks = reloaded.filter((f) => diskRank.has(f)).map((f) => diskRank.get(f));
    ok("…and the whole strip is in the game's order, not technology_tags order",
      ranks.every((r, i) => i === 0 || r > ranks[i - 1]), { editor: reloaded, ranks });

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nRESEARCH-TAB-DRAG: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
