// #focus-picker-blind-to-mod-art — THE PICKER OFFERED 1 OF MILLENNIUM DAWN'S 7,074 FOCUS ICONS.
//
// A focus's `icon =` takes a spriteType NAME, and that name is whatever the sprite was declared as. Vanilla
// prefixes its own with GFX_focus_ / GFX_goal_, so the picker tested for those two prefixes — but a prefix is
// a vanilla convention, not a rule of the engine. Millennium Dawn writes `icon = USoE001`,
// `icon = EUMS_Army`, `icon = democracy6`: real declared sprites whose art sits in gfx/interface/goals/
// under a plain name.
//
// Measured over the installed corpora:
//   vanilla  — trees use 2,945 distinct icons; the prefix test offered 2,725 of them (it misses vanilla's
//              own GFX_SOV_* set, 176 icons). With the directory rule: 2,901.
//   MD       — trees use 7,074 distinct icons; the prefix test offered ONE. With the directory rule: 7,039.
// Live endpoint, MD active: 3,138 icons before, 13,137 after — and an add-on that merely DEPENDS on MD sees
// the same 13,137 (checked cold, in both call orders, so it is not a cache artifact).
//
// The fixture below builds a miniature game + mod rather than leaning on an install, so the assertions are
// exact and the test stays fast. The corpus section at the end is a bonus and skips when the games are absent.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-iconpick-"));
const GAME = path.join(ROOT, "game");
const MODS = path.join(ROOT, "mods");
const MOD = path.join(MODS, "mymod");

// A miniature game root: resolveHoi4GameRoot() accepts HOI4_ROOT only if it holds hoi4.exe.
fs.mkdirSync(path.join(GAME, "interface"), { recursive: true });
fs.mkdirSync(path.join(GAME, "gfx", "interface", "goals"), { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "gfx", "interface", "goals"), { recursive: true });
fs.mkdirSync(path.join(MOD, "gfx", "interface", "buttons"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });

const sprite = (name, tex) => `spriteType = {\n\tname = "${name}"\n\ttexturefile = "${tex}"\n}\n`;
const art = (root, rel) => fs.writeFileSync(path.join(root, rel), "DDS placeholder");

// The game ships one conventionally-named focus icon.
art(GAME, "gfx/interface/goals/vanilla_thing.dds");
fs.writeFileSync(path.join(GAME, "interface", "vanilla.gfx"),
  "spriteTypes = {\n" + sprite("GFX_focus_vanilla_thing", "gfx/interface/goals/vanilla_thing.dds") + "}\n");

// The mod ships focus art the way a big mod really does — plain names — plus the two kinds of junk that
// live in the same folder and must stay out, plus a button that must not be mistaken for focus art.
const MOD_SPRITES = [
  ["bare_focus_icon", "gfx/interface/goals/bare_focus_icon.dds"],          // the bug: offered only after the fix
  ["EUMS_Army", "gfx/interface/goals/EUMS_Army.dds"],                      // MD's real shape
  ["GFX_focus_prefixed", "gfx/interface/goals/prefixed.dds"],              // control: the old rule still works
  ["GFX_goal_thing", "gfx/interface/goals/goalthing.dds"],                 // control: the other old prefix
  ["bare_focus_icon_shine", "gfx/interface/goals/bare_focus_icon_shine.dds"], // control: shine stays out
  ["something_bg", "gfx/interface/goals/something_bg.dds"],                // control: backgrounds stay out
  ["some_button", "gfx/interface/buttons/some_button.dds"],                // control: not focus art at all
  // The launcher's DLC medals ALIAS focus art — vanilla's GFX_frontend_medal_dlc023 is a second name for
  // gfx/interface/goals/focus_DLC_man_the_guns.dds. Eleven of them, and they are the ONLY false positives
  // the directory rule admits across vanilla and Millennium Dawn, so they are excluded by name.
  ["GFX_frontend_medal_dlc023", "gfx/interface/goals/frontend_alias.dds"],
];
for (const [, tex] of MOD_SPRITES) art(MOD, tex);
fs.writeFileSync(path.join(MOD, "interface", "mod.gfx"),
  "spriteTypes = {\n" + MOD_SPRITES.map(([n, t]) => sprite(n, t)).join("") + "}\n");
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MyMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MODS, "mymod.mod"),
  `name="MyMod"\npath="${MOD.split(path.sep).join("/")}"\nsupported_version="1.19.*"\n`);

process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = MODS;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const PORT = 53319;

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  try {
    const data = await fetch(`http://127.0.0.1:${PORT}/api/focus/sprites?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const sprites = data.sprites || [];
    const keys = new Set(sprites.map((s) => String(s.key).toLowerCase()));
    const has = (n) => keys.has(n.toLowerCase());

    console.log("\n[the fixture is real] the miniature game root was actually used");
    // ⭐ Assert the fixture has the property being measured — a picker that returned nothing would pass
    // every "must not be offered" check below and look like a clean run.
    rec("the endpoint answered", !data.error && Array.isArray(data.sprites), data);
    rec("the game's own focus icon came through", has("GFX_focus_vanilla_thing"), [...keys]);
    rec("…and the real install was NOT scanned (fixture is isolated)", sprites.length < 50, sprites.length);

    console.log("\n[THE BUG] focus art the mod declares under a plain name");
    rec("a bare-named sprite in gfx/interface/goals/ is offered", has("bare_focus_icon"), [...keys]);
    rec("…including MD's real shape (EUMS_Army)", has("EUMS_Army"), [...keys]);

    console.log("\n[CONTROL] the old prefix rule still works");
    rec("GFX_focus_* is still offered", has("GFX_focus_prefixed"), [...keys]);
    rec("GFX_goal_* is still offered", has("GFX_goal_thing"), [...keys]);

    console.log("\n[CONTROL] the filter did not become \"offer everything\"");
    // If these ever start passing, the directory rule has been widened into a no-op filter and the picker
    // is back to showing UI furniture as focus art.
    rec("a button outside goals/ is NOT offered", !has("some_button"), [...keys]);
    rec("a _shine overlay in goals/ is NOT offered", !has("bare_focus_icon_shine"), [...keys]);
    rec("a _bg backdrop in goals/ is NOT offered", !has("something_bg"), [...keys]);
    rec("a launcher DLC medal aliasing focus art is NOT offered", !has("GFX_frontend_medal_dlc023"), [...keys]);

    console.log("\n[every entry is usable] a thumbnail with no texture is a broken tile");
    rec("no offered sprite lacks a texturefile", sprites.every((s) => !!s.texturefile),
      sprites.filter((s) => !s.texturefile).slice(0, 3));
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  console.log("\n[client] the request names its mod, and the cache is keyed on it");
  {
    const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
    const CODE = stripJsComments(APP); // ⭐ the fix's own prose quotes the line it replaced
    rec("the sprites fetch passes modPath", /fetch\(`\/api\/focus\/sprites\$\{q\}`\)/.test(CODE), "still bare");
    // ⚠️ Anchored on `pickerRoot`, not on the bare helper call: the icon UPLOAD handler a few lines below
    // already calls inferModRootFromFocusPath(loadedPath), so the loose form passed with the fix backed out.
    rec("…built from the loaded tree's mod", /const pickerRoot = inferModRootFromFocusPath\(loadedPath\)/.test(CODE), "not derived");
    // #picker-cache-never-invalidated: the list is mod-dependent, so "have we fetched yet" is the wrong test.
    rec("the cache remembers which mod it was built for", /allFocusSpritesRoot/.test(CODE), "no root key");
    rec("…and the cache-hit test compares it", /allFocusSprites !== null && allFocusSpritesRoot === pickerRoot/.test(CODE), "not compared");
  }

  console.log("\n[corpus] what the shipping mods actually reference");
  {
    const CORPORA = [
      ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
      ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ];
    let measured = false;
    for (const [label, root] of CORPORA) {
      const dir = path.join(root, "common", "national_focus");
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      if (!files.length) continue;
      measured = true;
      const used = new Set();
      for (const f of files) {
        let t = "";
        try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        t = t.replace(/#[^\n]*/g, "");
        for (const m of t.matchAll(/\bicon\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)/g)) used.add(m[1].toLowerCase());
      }
      const prefixed = [...used].filter((k) => k.startsWith("gfx_focus_") || k.startsWith("gfx_goal_")).length;
      const pct = Math.round((prefixed / used.size) * 100);
      console.log(`     ${label}: ${used.size} distinct focus icons used, ${prefixed} (${pct}%) match the old name prefixes`);
      if (label === "Millennium Dawn") {
        // The number that made this worth fixing. If a future MD renames its art to the vanilla convention
        // this loosens rather than fails — the point is that a big mod need not follow the convention.
        rec("a big mod really does name focus art outside the prefixes", pct < 50, { used: used.size, prefixed });
      }
    }
    if (!measured) {
      console.log("     SKIPPED — no installed corpus");
      rec("the corpus section is skipped only because the games are absent", true, "skipped");
    }
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== focus icon picker covers mod art: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
