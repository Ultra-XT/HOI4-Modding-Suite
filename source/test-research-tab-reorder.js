// #research-tab-reorder — REORDERING THE RESEARCH TABS, AND WHAT ACTUALLY DECIDES THAT ORDER.
//
// Asked for by the user: "in research tree, the tabs we make or the pages we make like in nova audit, we
// have no way to like make them in an order we want, so maybe a drag future that drags them between each
// other so user can reorder how he wants, obviously that should reorder in game as well after saving".
//
// The "in game as well" half is the whole problem, and the editor's own ordering is a red herring: the
// research tab list in Nova is built from common/technology_tags, but the GAME does not use that order at
// all. The strip is the `folder_tabs` container in interface/countrytechtreeview.gui, and each tab's place
// is a literal `position = { x = N y = 0 }` on its `<folder>_tab` buttonType. Vanilla:
//   22 infantry · 111 support · 200 armour · 289 artillery · 378 naval · 467 mtgnavalsupport ·
//   556 air · 645 electronics · 734 industry
// A first tab at 22 and a step of 89 — the same numbers Nova already assumes when it appends a new tab at
// max(x) + 89. So reordering is rewriting those numbers, and nothing else.
//
// TWO DETAILS make it less mechanical than that, and one rule (group every element sharing an x into a slot,
// move the slot) handles both:
//
//  1. DLC VARIANTS SHARE A SLOT. armour_folder and nsb_armour_folder are both at x = 200, naval_folder and
//     mtgnavalfolder both at 378, air_techs_folder and bba_air_techs_folder both at 556 — the game picks one
//     by DLC. Renumbering per button would split each pair across two slots and leave a hole where the
//     inactive half landed.
//  2. THE HIGHLIGHT ICONS TRAVEL WITH THEIR TAB, AND THEIR NAMES LIE. highlight_engineering_folder sits at
//     645, which is electronics_folder's tab; highlight_industry_folder at 734. Matching by name would put
//     the tutorial glow on the wrong tab. Matching by position is exact.
//
// And nothing may assume key order inside a block: vanilla writes `name` before `position` for most tabs but
// `position` before `name` for electronics_folder and industry_folder.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tabord-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// The research gui IS the in-game research screen, so writeTechTreeGuiBackedUp snapshots the prior version
// first. It lands in Nova's app-data backups dir, NOT beside the file.
const BACKUP_DIR = path.join(process.env.APPDATA || os.homedir(), "NovaModdingSuite", "backups");
const MOD = path.join(ROOT, "tabordmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TabOrdMod"\nsupported_version="1.19.*"\n', "utf8");
// Start from vanilla's REAL gui, not a fixture. A hand-written strip would be exactly the kind of tidy input
// that hides the two details above — vanilla is where the shared-x pairs and the reversed key order live.
const VANILLA_GUI = path.join(V, "interface", "countrytechtreeview.gui");
const MOD_GUI = path.join(MOD, "interface", "countrytechtreeview.gui");

const modGui = () => fs.readFileSync(MOD_GUI, "utf8");
// Read the strip straight out of the file, independently of the server's own parser, so a bug in that parser
// cannot make the test agree with it.
function stripFromText(txt) {
  const i = txt.indexOf('name = "folder_tabs"');
  if (i === -1) return [];
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
    const blk = m[2];
    const p = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)\s*\}/.exec(blk);
    const n = /\bname\s*=\s*"([A-Za-z0-9_]+)"/.exec(blk);
    if (p && n) out.push({ name: n[1], x: parseInt(p[1], 10) });
  }
  return out;
}
/** Rewrite EVERY x inside folder_tabs onto a new (x0, step) grid — buttons and highlight icons alike.
 *  Migrating only the buttons leaves the highlights on the old grid, which is not a strip any mod would
 *  ship and which makes max(x) come from a stale element. That fixture bug cost me a false failure. */
function regridFolderTabs(txt, x0, step) {
  const i = txt.indexOf('name = "folder_tabs"');
  const open = txt.lastIndexOf("containerWindowType", i);
  let d = 0, end = -1;
  for (let j = txt.indexOf("{", open); j < txt.length; j++) {
    if (txt[j] === "{") d++;
    else if (txt[j] === "}") { d--; if (!d) { end = j; break; } }
  }
  const head = txt.slice(0, open), body = txt.slice(open, end), tail = txt.slice(end);
  // Both spellings occur in vanilla: `x = 645 y = 0` and `x=645 y=-5`.
  const next = body.replace(/x\s*=\s*(-?\d+)(\s+y\s*=\s*)(-?\d+)/g, (m, xs, mid, ys) => {
    const x = parseInt(xs, 10);
    if (x === 0) return m;                       // the container's own position, not a tab
    const idx = Math.round((x - 22) / 89);
    return `x = ${x0 + idx * step}${mid}${ys}`;
  });
  return head + next + tail;
}

const tabOrderFromFile = () =>
  stripFromText(modGui())
    .filter((e) => /_folder_tab$|_tab$/.test(e.name) && !/highlight/.test(e.name))
    .sort((a, b) => a.x - b.x)
    .map((e) => e.name.replace(/_tab$/, ""));

const PORT = 42817;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const getOrder = () => fetch(`http://127.0.0.1:${PORT}/api/research/tab-order?modPath=${encodeURIComponent(MOD)}`)
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const reorder = (order) => fetch(`http://127.0.0.1:${PORT}/api/research/reorder-tabs`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, order }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the strip is positional, and vanilla proves the two traps");
    let vtxt = "";
    try { vtxt = fs.readFileSync(VANILLA_GUI, "utf8"); } catch (_) {}
    rec("vanilla's research gui was readable", vtxt.length > 10000, vtxt.length);
    const vEls = stripFromText(vtxt);
    rec("…and its strip parses", vEls.length >= 12, vEls.length);
    const xOf = (n) => (vEls.find((e) => e.name === n) || {}).x;
    rec("tabs step by 89 from 22", xOf("infantry_folder_tab") === 22 && xOf("support_folder_tab") === 111,
      { inf: xOf("infantry_folder_tab"), sup: xOf("support_folder_tab") });
    rec("TRAP 1: a DLC pair shares one x",
      xOf("armour_folder_tab") === 200 && xOf("nsb_armour_folder_tab") === 200,
      { armour: xOf("armour_folder_tab"), nsb: xOf("nsb_armour_folder_tab") });
    rec("TRAP 2: a highlight's NAME does not match the tab it sits on",
      xOf("highlight_engineering_folder") === xOf("electronics_folder_tab"),
      { glow: xOf("highlight_engineering_folder"), tab: xOf("electronics_folder_tab") });
    // If `name` always preceded `position`, a lazier parser would work and this test would prove less.
    const eIdx = vtxt.indexOf('name = "electronics_folder_tab"');
    rec("…and key order inside a block is not fixed",
      vtxt.lastIndexOf("position", eIdx) > vtxt.lastIndexOf("buttonType", eIdx), "position not before name");

    fs.copyFileSync(VANILLA_GUI, MOD_GUI);

    console.log("\n[read] the endpoint reports the strip the player sees");
    let r = await getOrder();
    rec("tab-order answered", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and knows the mod owns the gui", r.b.ownsGui === true, r.b.ownsGui);
    const slots = r.b.slots || [];
    rec("…with slots in ascending x", slots.every((s, i) => i === 0 || s.x > slots[i - 1].x), slots.map((s) => s.x));
    rec("…and the first slot is infantry at 22", slots[0] && slots[0].key === "infantry_folder" && slots[0].x === 22, slots[0]);
    const armourSlot = slots.find((s) => s.folders.includes("armour_folder"));
    rec("…and the DLC pair is ONE slot, not two",
      armourSlot && armourSlot.folders.includes("nsb_armour_folder"), armourSlot);
    rec("…and no folder appears in two slots",
      new Set(slots.flatMap((s) => s.folders)).size === slots.flatMap((s) => s.folders).length,
      slots.flatMap((s) => s.folders));

    // Snapshot the shared backup dir BEFORE the first write, so the backup assertion later can require a NEW
    // file rather than merely a file — the dir is never cleaned between runs.
    const backupsNow = () => {
      try {
        return fs.readdirSync(BACKUP_DIR).filter((f) => /countrytechtreeview/i.test(f) && /research-gui/i.test(f));
      } catch (_) { return []; }
    };
    const backupsBefore = new Set(backupsNow());

    const before = tabOrderFromFile();
    console.log("       before: " + before.join(" · "));

    console.log("\n[write] a reorder moves the tabs, in the file the game reads");
    // Move industry to the front — the tab that was last.
    const wanted = ["industry_folder", ...slots.map((s) => s.key).filter((k) => k !== "industry_folder")];
    r = await reorder(wanted);
    rec("the reorder succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it reports a change", r.b.changed === true, r.b);
    const after = tabOrderFromFile();
    console.log("       after:  " + after.join(" · "));
    rec("industry is now the first tab", after[0] === "industry_folder", after);
    rec("…at x = 22", (stripFromText(modGui()).find((e) => e.name === "industry_folder_tab") || {}).x === 22,
      (stripFromText(modGui()).find((e) => e.name === "industry_folder_tab") || {}).x);
    rec("…and no tab was lost", after.length === before.length, { before: before.length, after: after.length });
    rec("…and the same tabs are present", new Set(after).size === new Set(before).size &&
      before.every((f) => after.includes(f)), { before, after });

    console.log("\n[TRAP 1] the DLC pair moved together and still shares an x");
    const els = stripFromText(modGui());
    const gx = (n) => (els.find((e) => e.name === n) || {}).x;
    rec("armour and nsb_armour still share one x", gx("armour_folder_tab") === gx("nsb_armour_folder_tab"),
      { armour: gx("armour_folder_tab"), nsb: gx("nsb_armour_folder_tab") });
    rec("naval and mtgnavalfolder still share one x", gx("naval_folder_tab") === gx("mtgnavalfolder_tab"),
      { naval: gx("naval_folder_tab"), mtg: gx("mtgnavalfolder_tab") });
    rec("air and bba_air still share one x", gx("air_techs_folder_tab") === gx("bba_air_techs_folder_tab"),
      { air: gx("air_techs_folder_tab"), bba: gx("bba_air_techs_folder_tab") });
    rec("…and every slot x is on the 22 + n*89 grid",
      [...new Set(els.filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].every((x) => (x - 22) % 89 === 0),
      [...new Set(els.filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].sort((a, b) => a - b));

    console.log("\n[TRAP 2] the highlight glows followed their tabs");
    rec("the engineering glow still sits on the electronics tab",
      gx("highlight_engineering_folder") === gx("electronics_folder_tab"),
      { glow: gx("highlight_engineering_folder"), tab: gx("electronics_folder_tab") });
    rec("the industry glow followed industry to the front",
      gx("highlight_industry_folder") === gx("industry_folder_tab") && gx("industry_folder_tab") === 22,
      { glow: gx("highlight_industry_folder"), tab: gx("industry_folder_tab") });
    rec("the infantry glow still sits on the infantry tab",
      gx("highlight_infantry_folder") === gx("infantry_folder_tab"),
      { glow: gx("highlight_infantry_folder"), tab: gx("infantry_folder_tab") });

    console.log("\n[safety] the file is still a file the game can load");
    const txt = modGui();
    let depth = 0, ok = true;
    for (const c of txt) { if (c === "{") depth++; else if (c === "}") { depth--; if (depth < 0) ok = false; } }
    rec("braces are balanced", ok && depth === 0, depth);
    rec("…and only numbers changed — the file is the same length modulo digit widths",
      Math.abs(txt.length - fs.readFileSync(VANILLA_GUI, "utf8").length) < 40,
      { now: txt.length, vanilla: fs.readFileSync(VANILLA_GUI, "utf8").length });
    // The research gui IS the in-game research screen, so writeTechTreeGuiBackedUp always snapshots the
    // prior version first. The backup lives in Nova's app-data backups dir, NOT beside the file — I asserted
    // the wrong place first and the check failed for that reason, not because no backup was taken.
    // NON-HERMETIC IF IT JUST COUNTS FILES. The backup dir is shared and never cleaned between runs, so
    // "some countrytechtreeview backup exists" is satisfied by a backup from a run last week — the assertion
    // passes with the backup call deleted. Compare against a snapshot taken before THIS write instead.
    rec("…and a backup of the prior gui was taken by THIS write",
      backupsNow().some((f) => !backupsBefore.has(f)),
      { before: backupsBefore.size, after: backupsNow().length });

    console.log("\n[TRAP 6] an IRREGULAR strip must keep its irregularity");
    // A mod may space its tabs deliberately — a wider gap between two groups, say. Renumbering onto a single
    // derived `x0 + i*step` flattens that, and did so even when the order had not changed at all. Reordering
    // now reuses the positions the strip already has, so any layout survives.
    {
      // Build a strip with a deliberate hole: normal 89 steps, then a 200px jump before the last two.
      let irregular = fs.readFileSync(VANILLA_GUI, "utf8");
      const bump = (from, to) => {
        irregular = irregular.replace(new RegExp(`x\\s*=\\s*${from}(\\s+y\\s*=\\s*)`, "g"), `x = ${to}$1`);
      };
      bump(734, 945); bump(645, 856);   // last two tabs pushed out, highlights follow (same x)
      fs.writeFileSync(MOD_GUI, irregular, "utf8");
      const gapBefore = [...new Set(stripFromText(modGui()).filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].sort((a, b) => a - b);
      const gaps = gapBefore.slice(1).map((x, k) => x - gapBefore[k]);
      rec("the fixture strip really is irregular", new Set(gaps).size > 1, gaps);
      const iSlots = (await getOrder()).b.slots || [];
      r = await reorder([iSlots[iSlots.length - 1].key, ...iSlots.slice(0, -1).map((s) => s.key)]);
      rec("…a reorder on it succeeds", r.s === 200 && !r.b.error, r.b || r.s);
      const gapAfter = [...new Set(stripFromText(modGui()).filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].sort((a, b) => a - b);
      rec("…and the exact set of positions is unchanged", gapAfter.join(",") === gapBefore.join(","),
        { was: gapBefore, now: gapAfter });
      rec("…including the deliberate gap", gapAfter.slice(1).map((x, k) => x - gapAfter[k]).join(",") === gaps.join(","),
        { was: gaps, now: gapAfter.slice(1).map((x, k) => x - gapAfter[k]) });
      fs.copyFileSync(VANILLA_GUI, MOD_GUI);
    }

    console.log("\n[the append path] a NEW tab lands on the strip's own step, not vanilla's");
    // The other half of the same fix, and it had no test at all. Creating a custom tab appends its button at
    // max(x) + step; a hardcoded +89 put every custom tab 4px out of line on a Millennium Dawn-style strip
    // and drifted further with each one added. Driven through the real endpoint, on a non-vanilla grid.
    {
      fs.writeFileSync(MOD_GUI, regridFolderTabs(fs.readFileSync(VANILLA_GUI, "utf8"), 5, 85), "utf8");
      const xsBefore = [...new Set(stripFromText(modGui()).filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].sort((a, b) => a - b);
      const lastBefore = Math.max(...xsBefore);
      const cr = await fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: MOD, folderKey: "nova_appended_folder", ledger: "army", name: "Appended", tabDdsPath: "" }),
      }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => ({})) }));
      rec("creating a custom tab succeeded", cr.s === 200 && !cr.b.error, cr.b || cr.s);
      const appended = stripFromText(modGui()).find((e) => e.name === "nova_appended_folder_tab");
      rec("…and its button was added to the strip", !!appended, "not found");
      rec("…at the strip's OWN step (85), not vanilla's 89",
        appended && appended.x === lastBefore + 85, { got: appended && appended.x, want: lastBefore + 85 });
      rec("…so it stays on the same grid as every other tab",
        appended && (appended.x - xsBefore[0]) % 85 === 0, { x: appended && appended.x, x0: xsBefore[0] });
      fs.copyFileSync(VANILLA_GUI, MOD_GUI);
    }

    console.log("\n[partial + idempotent]");
    // The blocks above swap MOD_GUI out for synthetic strips, so put the industry-first order back before
    // asserting against `after` — otherwise this measures leftover state from another section, not idempotency.
    await reorder(wanted);
    rec("the industry-first order was restored for this section", tabOrderFromFile().join(",") === after.join(","),
      { now: tabOrderFromFile(), want: after });
    r = await reorder(["industry_folder"]); // naming only the tab already at the front
    rec("a one-element order is accepted", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and changes nothing, because everything else keeps its relative place",
      tabOrderFromFile().join(",") === after.join(","), { now: tabOrderFromFile(), was: after });
    // A partial list must never stack two tabs on one x — that would hide one behind the other in game.
    const els2 = stripFromText(modGui()).filter((e) => /_tab$/.test(e.name));
    const xs2 = els2.map((e) => e.x);
    rec("…and no tab was left stacked on another",
      new Set(xs2).size === new Set(els2.map((e) => e.name.replace(/_tab$/, ""))).size - 3, // 3 DLC pairs share
      { distinctX: new Set(xs2).size, tabs: els2.length });

    console.log("\n[TRAP 1, the other half] naming BOTH sides of a DLC pair must not consume two slots");
    // A client that flattens `folders` instead of sending one key per slot sends `armour_folder` AND
    // `nsb_armour_folder`. Without the same-slot dedupe that costs a position, and every tab after it slides
    // one place left onto its neighbour. Backing the dedupe out passes the test above (which sends one key
    // per slot) and fails only here — which is why this case exists at all.
    const flat = slots.flatMap((s) => s.folders);
    r = await reorder(flat);
    rec("a flattened order is accepted", r.s === 200 && !r.b.error, r.b || r.s);
    const flatEls = stripFromText(modGui()).filter((e) => /_tab$/.test(e.name));
    const flatOrder = [...flatEls].sort((a, b) => a.x - b.x).map((e) => e.name.replace(/_tab$/, ""));
    rec("…and every tab still appears exactly once", new Set(flatOrder).size === flatOrder.length, flatOrder);
    rec("…and the pairs still share their x",
      flatEls.find((e) => e.name === "armour_folder_tab").x === flatEls.find((e) => e.name === "nsb_armour_folder_tab").x &&
      flatEls.find((e) => e.name === "naval_folder_tab").x === flatEls.find((e) => e.name === "mtgnavalfolder_tab").x,
      flatEls.map((e) => e.name + "@" + e.x));
    rec("…and the strip still ends at the same last x (no slots consumed)",
      Math.max(...flatEls.map((e) => e.x)) === 22 + (slots.length - 1) * 89,
      { last: Math.max(...flatEls.map((e) => e.x)), expected: 22 + (slots.length - 1) * 89 });
    // Restore the known-good order for the checks that follow.
    await reorder(slots.map((s) => s.key));

    console.log("\n[input] a bad request must not touch the file");
    const guard = modGui();
    for (const bad of [[], ["not_a_folder"], ["has space"], ["quote\"x"]]) {
      r = await reorder(bad);
      rec(`refused ${JSON.stringify(bad)}`, r.s === 400 && !!r.b.error, { s: r.s, b: r.b });
    }
    rec("…and the gui is byte-identical after every refusal", modGui() === guard, "file changed on a refused request");

    console.log("\n[the assumption this rests on] every non-tab element shares a tab's exact x");
    // Grouping by x is what makes the DLC pairs and the highlight glows travel with their tab. It assumes no
    // strip element sits at an x that matches NO tab — such an element would form a slot of its own, be
    // filtered out for having no `<folder>_tab`, and then stay put while its tab moved away. Rather than
    // guess a snapping tolerance, measure whether that case exists: across vanilla, Millennium Dawn and all
    // seven installed user mods it is 0 of 3 non-tab elements each time. If a mod ever breaks this, this
    // check is where it surfaces, and THEN a tolerance can be designed against a real example.
    {
      const orphansIn = (guiPath) => {
        let t = ""; try { t = fs.readFileSync(guiPath, "utf8"); } catch (_) { return null; }
        const els = stripFromText(t);
        if (!els.length) return null;
        const tabX = new Set(els.filter((e) => /_tab$/.test(e.name)).map((e) => e.x));
        return els.filter((e) => !/_tab$/.test(e.name) && !tabX.has(e.x));
      };
      const vOrphans = orphansIn(VANILLA_GUI);
      rec("vanilla's strip has no element off a tab's x", vOrphans && vOrphans.length === 0,
        vOrphans && vOrphans.map((o) => o.name + "@" + o.x));
      const mdGui = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/interface/countrytechtreeview.gui";
      if (fs.existsSync(mdGui)) {
        const mOrphans = orphansIn(mdGui);
        rec("…nor does Millennium Dawn's", mOrphans && mOrphans.length === 0,
          mOrphans && mOrphans.map((o) => o.name + "@" + o.x));
      }
    }

    console.log("\n[TRAP 4] a slot the client did NOT name must not move");
    // The most damaging bug the adversarial review found, and it fires on ordinary use: the editor does not
    // draw every slot (buildGameFolderTabs skips a folder with no techs in this mod, and the DLC filter hides
    // variants), so the client sends a PARTIAL list. Appending the unnamed slots to the tail — the first
    // implementation — silently relocated tabs the user never touched, with nothing on screen to show it.
    // The rule is: named slots permute only among the positions they already occupy; everything else stays.
    fs.copyFileSync(VANILLA_GUI, MOD_GUI);
    const allSlots = ((await getOrder()).b.slots || []).map((s) => s.key);
    const posOf = () => {
      const els = stripFromText(modGui()).filter((e) => /_tab$/.test(e.name));
      const map = {};
      els.forEach((e) => { map[e.name.replace(/_tab$/, "")] = e.x; });
      return map;
    };
    const posBefore = posOf();
    // Name only the first and the last — as if every slot between them were hidden in the editor.
    const partial = [allSlots[allSlots.length - 1], allSlots[0]];
    r = await reorder(partial);
    rec("a partial order succeeds", r.s === 200 && !r.b.error, r.b || r.s);
    const posAfter = posOf();
    const untouched = allSlots.slice(1, -1);
    const movedAnyway = untouched.filter((k) => posBefore[k] !== posAfter[k]);
    rec("…and every slot the client did not name stayed exactly where it was",
      movedAnyway.length === 0,
      movedAnyway.map((k) => k + ": " + posBefore[k] + " -> " + posAfter[k]));
    rec("…while the two named slots swapped positions",
      posAfter[allSlots[0]] === posBefore[allSlots[allSlots.length - 1]] &&
      posAfter[allSlots[allSlots.length - 1]] === posBefore[allSlots[0]],
      { first: allSlots[0], last: allSlots[allSlots.length - 1], before: posBefore, after: posAfter });
    rec("…and no two slots ended up on the same x",
      new Set(Object.values(posAfter)).size === new Set(Object.values(posBefore)).size,
      { before: new Set(Object.values(posBefore)).size, after: new Set(Object.values(posAfter)).size });

    console.log("\n[TRAP 4b] omitting a MID-strip slot, which is the case that actually bites");
    // An adversarial review was right that the check above proves less than it looks: it names the tab
    // already at the FRONT, where a trailing append happens to be a no-op. The real shape is a slot in the
    // MIDDLE that the editor never renders — buildGameFolderTabs drops a folder with no techs in this mod,
    // and the DLC filter hides variants. On Millennium Dawn with default settings bba_aircraft_folder is
    // exactly that: it owns a mid-strip slot the editor never draws.
    fs.copyFileSync(VANILLA_GUI, MOD_GUI);
    {
      const all = ((await getOrder()).b.slots || []);
      const midIdx = Math.floor(all.length / 2);
      const omitted = all[midIdx];
      const before = posOf();
      // Everything except the middle slot, with the first two swapped so the drag really changes something.
      const partial = all.filter((_s, i) => i !== midIdx).map((s) => s.key);
      [partial[0], partial[1]] = [partial[1], partial[0]];
      r = await reorder(partial);
      rec("a mid-strip omission is accepted", r.s === 200 && !r.b.error, r.b || r.s);
      const after = posOf();
      rec(`…and the omitted middle slot (${omitted.key}) did not move`,
        after[omitted.folders[0]] === before[omitted.folders[0]],
        { was: before[omitted.folders[0]], now: after[omitted.folders[0]] });
      rec("…while the two that were named did swap",
        after[all[0].key] === before[all[1].key] && after[all[1].key] === before[all[0].key],
        { first: all[0].key, second: all[1].key, before, after });
      rec("…and every other unnamed slot is where it was",
        all.filter((_s, i) => i !== 0 && i !== 1 && i !== midIdx)
           .every((s) => after[s.folders[0]] === before[s.folders[0]]),
        { before, after });
      rec("…with the strip still occupying the same set of positions",
        [...new Set(Object.values(after))].sort((a, b) => a - b).join(",") ===
        [...new Set(Object.values(before))].sort((a, b) => a - b).join(","),
        { before, after });
    }

    console.log("\n[TRAP 5] a COMMENTED-OUT tab is not a tab");
    // Commenting a buttonType out is how a modder disables a tab. Read as live it claims a slot, collides
    // with the real tab at that x, and the renumber then writes coordinates INTO the comment.
    {
      const live = fs.readFileSync(MOD_GUI, "utf8");
      const marker = 'buttonType = {\n\t\t\t\tname = "infantry_folder_tab"';
      rec("the fixture anchor exists", live.includes(marker), "anchor missing");
      const commented = live.replace(marker,
        '# buttonType = {\n#\t\t\t\tname = "nova_ghost_folder_tab"\n#\t\t\t\tposition = { x = 22 y = 0 }\n#\t\t\t}\n\t\t\t' + marker);
      fs.writeFileSync(MOD_GUI, commented, "utf8");
      const slotsNow = (await getOrder()).b.slots || [];
      const flat = slotsNow.flatMap((s) => s.folders);
      rec("a commented-out tab is not reported as a slot", !flat.includes("nova_ghost_folder"), flat);
      rec("…and the real tab at that x is still there", flat.includes("infantry_folder"), flat);
      r = await reorder(slotsNow.map((s) => s.key).reverse());
      rec("…and a reorder over it succeeds", r.s === 200 && !r.b.error, r.b || r.s);
      rec("…without writing into the comment",
        /#\s*position\s*=\s*\{\s*x\s*=\s*22\b/.test(modGui()),
        (/#.*position.*/.exec(modGui()) || [""])[0]);
    }
    fs.copyFileSync(VANILLA_GUI, MOD_GUI);

    console.log("\n[TRAP 3] the grid is NOT a constant — a mod's own spacing must survive");
    // HERMETIC FIRST. The Millennium Dawn block below is the real-world proof, but it is guarded on MD being
    // installed and a guarded block that silently does nothing reads as a pass — so the rule is proved here
    // on a synthetic strip that always runs, whatever is on the machine.
    {
      fs.writeFileSync(MOD_GUI, regridFolderTabs(fs.readFileSync(VANILLA_GUI, "utf8"), 7, 64), "utf8");
      const sBefore = [...new Set(stripFromText(modGui()).filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].sort((a, b) => a - b);
      rec("the synthetic strip really is on a different grid",
        sBefore[0] === 7 && (sBefore[1] - sBefore[0]) === 64, { x0: sBefore[0], step: sBefore[1] - sBefore[0] });
      const sSlots = (await getOrder()).b.slots || [];
      r = await reorder([sSlots[sSlots.length - 1].key, ...sSlots.slice(0, -1).map((s) => s.key)]);
      rec("…a reorder on it succeeds", r.s === 200 && !r.b.error, r.b || r.s);
      const sAfter = [...new Set(stripFromText(modGui()).filter((e) => /_tab$/.test(e.name)).map((e) => e.x))].sort((a, b) => a - b);
      rec("…and it keeps the mod's own x0 and step, not vanilla's 22/89",
        sAfter.join(",") === sBefore.join(","), { was: sBefore, now: sAfter });
      fs.copyFileSync(VANILLA_GUI, MOD_GUI);
    }

    // I nearly shipped 22/89 hardcoded. Millennium Dawn's strip starts at x = 5 and steps 85 across 14 tabs.
    // Renumbering it onto vanilla's grid would move every tab and re-space the lot — a layout its author
    // chose, silently rewritten. So the grid is derived from the file being edited.
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    const MDGUI = path.join(MD, "interface", "countrytechtreeview.gui");
    if (fs.existsSync(MDGUI)) {
      // Copy MD's gui into the throwaway mod — the real corpora are never written to.
      fs.copyFileSync(MDGUI, MOD_GUI);
      const mdBefore = stripFromText(modGui()).filter((e) => /_tab$/.test(e.name));
      const mdXs = [...new Set(mdBefore.map((e) => e.x))].sort((a, b) => a - b);
      rec("MD's strip has its OWN grid, not vanilla's", mdXs[0] !== 22 || (mdXs[1] - mdXs[0]) !== 89,
        { x0: mdXs[0], step: mdXs[1] - mdXs[0] });
      console.log(`       MD grid: x0=${mdXs[0]} step=${mdXs[1] - mdXs[0]} over ${mdXs.length} slots`);
      const mdSlots = (await getOrder()).b.slots || [];
      r = await reorder([mdSlots[mdSlots.length - 1].key, ...mdSlots.slice(0, -1).map((s) => s.key)]);
      rec("…and a reorder on it succeeds", r.s === 200 && !r.b.error, r.b || r.s);
      const mdAfter = stripFromText(modGui()).filter((e) => /_tab$/.test(e.name));
      const mdXs2 = [...new Set(mdAfter.map((e) => e.x))].sort((a, b) => a - b);
      rec("…the strip still starts where MD put it", mdXs2[0] === mdXs[0], { was: mdXs[0], now: mdXs2[0] });
      rec("…and still steps by MD's own spacing", (mdXs2[1] - mdXs2[0]) === (mdXs[1] - mdXs[0]),
        { was: mdXs[1] - mdXs[0], now: mdXs2[1] - mdXs2[0] });
      rec("…and occupies exactly the same set of positions as before",
        mdXs2.join(",") === mdXs.join(","), { was: mdXs, now: mdXs2 });
      rec("…with the dragged tab now first", mdAfter.slice().sort((a, b) => a.x - b.x)[0].name ===
        mdSlots[mdSlots.length - 1].key + "_tab",
        { first: mdAfter.slice().sort((a, b) => a.x - b.x)[0].name, want: mdSlots[mdSlots.length - 1].key });
    } else {
      console.log("       (Millennium Dawn not installed — skipped)");
    }

    console.log(`\n=== research tab reorder: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
