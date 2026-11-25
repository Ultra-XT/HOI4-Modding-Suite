// #folder-tabs-dependency-blind — AN ADD-ON'S RESEARCH TAB STRIP CAME FROM VANILLA.
//
// /api/research/folder-tabs read the mod's own interface/countrytechtreeview.gui, then the base game's, and
// nothing in between. So for an add-on — which by definition ships no gui of its own — the Research page
// took its entire tab strip from vanilla, ignoring the base mod whose tech tree the author is actually
// working on.
//
// 🈯 Every base mod installed here ships its own countrytechtreeview.gui — the ground-truth block below
// prints the `_tab` entry count for each rather than restating a figure. What matters is the endpoint's
// answer, measured against the real installs: an add-on over Millennium Dawn or The Road to 56 now gets 18
// tabs and over Old World Blues 23, each matching that base mod's own strip exactly, where before all three
// got vanilla's 16.
//
// The sibling endpoint immediately below it in server.js, /api/research/folder-bg-transform, already carried
// the comment "Reads the EFFECTIVE gui the game uses: mod's own → dependency → vanilla". This one never
// adopted it — the same shape as most of this week's findings.
//
// ⚠️ interface/*.gui is ONE file at a fixed path, so HOI4 loads exactly one copy rather than merging: the
// first root that has it wins outright. The test asserts that, not a union.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tabs-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => (fs.mkdirSync(p, { recursive: true }), p);

// A base mod with its own tab strip, and an add-on that depends on it. Synthetic so the numbers are exact.
const BASE = path.join(ROOT, "tabbase");
mk(path.join(BASE, "interface"));
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="TabBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "tabbase.mod"),
  'name="TabBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "interface", "countrytechtreeview.gui"), [
  "guiTypes = {",
  '\tcontainerWindowType = { name = "countrytechtreeview"',
  '\t\tcontainerWindowType = { name = "folder_tabs"',
  '\t\t\tbuttonType = { name = "basemod_alpha_tab"  position = { x = 0 y = 0 }  quadTextureSprite = "GFX_basemod_alpha_tab" }',
  '\t\t\tbuttonType = { name = "basemod_beta_tab"   position = { x = 182 y = 0 } quadTextureSprite = "GFX_basemod_beta_tab" }',
  '\t\t\tbuttonType = { name = "basemod_gamma_tab"  position = { x = 364 y = 0 } quadTextureSprite = "GFX_basemod_gamma_tab" }',
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"));

const ADDON = path.join(ROOT, "tabaddon");
mk(ADDON);
fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
  'name="TabAddon"\ndependencies={\n\t"TabBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "tabaddon.mod"),
  'name="TabAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"TabBase"\n}\nsupported_version="1.19.*"\n');

// …and an add-on that ships its OWN gui, which must beat its dependency's.
const OWNGUI = path.join(ROOT, "tabown");
mk(path.join(OWNGUI, "interface"));
fs.writeFileSync(path.join(OWNGUI, "descriptor.mod"),
  'name="TabOwn"\ndependencies={\n\t"TabBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "tabown.mod"),
  'name="TabOwn"\npath="' + toPosix(OWNGUI) + '"\ndependencies={\n\t"TabBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(OWNGUI, "interface", "countrytechtreeview.gui"), [
  "guiTypes = {",
  '\tcontainerWindowType = { name = "countrytechtreeview"',
  '\t\tcontainerWindowType = { name = "folder_tabs"',
  '\t\t\tbuttonType = { name = "mine_only_tab" position = { x = 0 y = 0 } quadTextureSprite = "GFX_mine_only_tab" }',
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"));

let PORT = 50920;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const tabs = (mod) => fetch("http://127.0.0.1:" + PORT + "/api/research/folder-tabs?modPath=" + encodeURIComponent(mod))
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[ground truth] real base mods ship their own tab strip");
    {
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      if (fs.existsSync(WS)) {
        const rows = [];
        for (const d of fs.readdirSync(WS)) {
          const g = path.join(WS, d, "interface", "countrytechtreeview.gui");
          if (!fs.existsSync(g)) continue;
          let desc = ""; try { desc = fs.readFileSync(path.join(WS, d, "descriptor.mod"), "utf8"); } catch (_) {}
          const n = (fs.readFileSync(g, "latin1").match(/_tab\b/g) || []).length;
          rows.push({ name: (/name\s*=\s*"([^"]+)"/.exec(desc) || [, d])[1].slice(0, 34), n });
        }
        rows.forEach((r) => console.log(`     ${r.name.padEnd(36)} ${r.n} _tab entries`));
        rec("at least one installed base mod ships its own tab strip", rows.length > 0, rows.length);
      } else console.log("     (no workshop mods installed — skipped)");
    }

    console.log("\n[an add-on] takes the strip from its BASE MOD, not from vanilla");
    {
      const base = await tabs(BASE);
      const addon = await tabs(ADDON);
      const folders = (r) => (r.tabs || []).map((t) => t.folder).sort();
      // ⚠️ THE ENDPOINT READS TWO GUI FILES — countrytechtreeview.gui AND countrydoctrinetreeview.gui —
      // and resolves each independently. These fixtures ship only the first, so the four DOCTRINE tabs
      // correctly still come from vanilla. An earlier version of this test asserted over the whole list
      // and read that correct behaviour as a failure.
      const mine = (r) => (r.tabs || []).filter((t) => /^basemod_|^mine_only/.test(t.folder));
      rec("the base mod's own tech-tree strip is read", mine(base).length === 3, base.tabs);
      rec("…and the add-on gets exactly that strip",
        JSON.stringify(folders(addon)) === JSON.stringify(folders(base)), { addon: folders(addon), base: folders(base) });
      rec("…reported as coming from a dependency, not mislabelled vanilla",
        mine(addon).length === 3 && mine(addon).every((t) => t.source === "dependency"),
        (addon.tabs || []).map((t) => t.folder + ":" + t.source));
      rec("…while the doctrine tabs, which no fixture ships, still come from the base game",
        (addon.tabs || []).filter((t) => /doctrine/.test(t.folder)).every((t) => t.source === "vanilla"),
        (addon.tabs || []).map((t) => t.folder + ":" + t.source));
      const van = await tabs(GAME);
      rec("…and it is NOT vanilla's strip", (van.tabs || []).length !== (addon.tabs || []).length
        || JSON.stringify(folders(van)) !== JSON.stringify(folders(addon)),
        { vanilla: (van.tabs || []).length, addon: (addon.tabs || []).length });
    }

    console.log("\n[⚠️ ONE FILE, NOT A UNION] a mod's own gui replaces its dependency's wholesale");
    {
      // interface/*.gui sits at a fixed path, so HOI4 loads exactly one copy. Merging the two would offer
      // tabs the game does not draw — the same mistake as treating a declaration as a union.
      const own = await tabs(OWNGUI);
      const folders = (own.tabs || []).map((t) => t.folder);
      const tech = (own.tabs || []).filter((t) => !/doctrine/.test(t.folder));
      rec("only the mod's own tech-tree tab is returned", tech.length === 1, folders);
      rec("…and none of the dependency's leak in", !folders.some((f) => /basemod/.test(f)), folders);
      rec("…labelled as the mod's own", tech.every((t) => t.source === "mod"),
        (own.tabs || []).map((t) => t.folder + ":" + t.source));
    }

    console.log("\n[CONTROL — a plain mod with no dependency] still falls through to vanilla");
    {
      const PLAIN = path.join(ROOT, "tabplain");
      mk(PLAIN);
      fs.writeFileSync(path.join(PLAIN, "descriptor.mod"), 'name="TabPlain"\nsupported_version="1.19.*"\n');
      const r = await tabs(PLAIN);
      const van = await tabs(GAME);
      rec("it gets the base game's strip", (r.tabs || []).length === (van.tabs || []).length,
        { plain: (r.tabs || []).length, vanilla: (van.tabs || []).length });
      rec("…labelled vanilla", (r.tabs || []).every((t) => t.source === "vanilla"),
        [...new Set((r.tabs || []).map((t) => t.source))]);
      rec("…which is a real strip, not an empty one — otherwise this control measures nothing",
        (van.tabs || []).length >= 10, (van.tabs || []).length);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== folder tabs dependency: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
