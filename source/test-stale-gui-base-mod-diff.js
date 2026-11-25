// #stale-gui-diffs-the-game-not-the-base-mod — "⚠ Layout file: N missing" COUNTED THE WRONG N.
//
// The Research page shows a chip when a mod ships its own interface/countrytechtreeview.gui and that copy is
// missing elements the file it REPLACES has. HOI4 replaces a .gui wholesale at the same path, so the point of
// the chip is real: whatever the replaced file gained after the snapshot was taken is gone from the mod.
//
// But it always diffed against the BASE GAME, even for an add-on whose dependency ships its own copy — and
// every base mod installed here does. So the file the add-on actually replaces is the base mod's, and the
// answer was wrong in both directions at once:
//   · it ACCUSED the author of losing elements the base mod had deliberately removed — measured on the real
//     installs, an add-on that copies its base mod's file verbatim would be told it is missing 266 elements
//     over Old World Blues, 178 over Millennium Dawn, 91 over Rise of Nations, 47 over Novum Vexillum and
//     26 over The Road to 56, none of which it can restore or should want to;
//   · and it stayed SILENT about the elements the base mod has that the stale copy really is missing, which
//     is the entire thing the chip exists to catch.
//
// The correct root is the first one BELOW the mod that actually ships the file — the same walk the same
// endpoint already does 50 lines above to decide which gui the game loads (`guiSource`). One caller adopted
// it, its neighbour did not.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stalegui-"));
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

// A gui file naming exactly the elements given — nothing else, so the counts below are exact.
const guiWith = (names) => [
  "guiTypes = {",
  '\tcontainerWindowType = { name = "countrytechtreeview"',
  '\t\tcontainerWindowType = { name = "folder_tabs"',
  ...names.map((n) => `\t\t\tbuttonType = { name = "${n}" position = { x = 0 y = 0 } }`),
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// The base mod: has ALPHA/BETA/GAMMA/DELTA, and deliberately does NOT have anything vanilla has.
// ⚠️ THE FOLDER IS A STEAM ID, because that is what a real base mod's folder is — a workshop mod lives at
// steamapps/workshop/content/394360/<id>, and its human name exists only inside descriptor.mod. The fixture
// used to sit in a folder called "sgbase" beside a descriptor saying "SgBase", which differ only by case,
// so a check could not tell whether the chip was reading the path or the name. It read the path, and told
// users their layout was missing elements "its base mod (2647689257)" has.
const BASE_STEAM_ID = "2647689257";
const BASE = path.join(ROOT, BASE_STEAM_ID);
mk(path.join(BASE, "interface"));
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="SgBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "sgbase.mod"), 'name="SgBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "interface", "countrytechtreeview.gui"),
  guiWith(["sg_alpha_tab", "sg_beta_tab", "sg_gamma_tab", "sg_delta_tab"]));

// The add-on: depends on it, and ships a STALE copy that has only ALPHA/BETA.
// So the honest answer is exactly two — gamma and delta.
const ADDON = path.join(ROOT, "sgaddon");
mk(path.join(ADDON, "interface"));
fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
  'name="SgAddon"\ndependencies={\n\t"SgBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "sgaddon.mod"),
  'name="SgAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"SgBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ADDON, "interface", "countrytechtreeview.gui"),
  guiWith(["sg_alpha_tab", "sg_beta_tab"]));

// A STANDALONE mod with its own copy and no dependency — this one must still be diffed against the game.
const SOLO = path.join(ROOT, "sgsolo");
mk(path.join(SOLO, "interface"));
fs.writeFileSync(path.join(SOLO, "descriptor.mod"), 'name="SgSolo"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "sgsolo.mod"), 'name="SgSolo"\npath="' + toPosix(SOLO) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(SOLO, "interface", "countrytechtreeview.gui"),
  guiWith(["sg_alpha_tab", "sg_beta_tab"]));

let PORT = 51230;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const layout = (mod) => fetch(`http://127.0.0.1:${PORT}/api/research/gui-layout?modPath=${encodeURIComponent(mod)}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[ground truth] the installed base mods really do replace this file, and heavily");
    {
      const namesIn = (p) => {
        const out = new Set();
        let t = ""; try { t = fs.readFileSync(p, "latin1"); } catch (_) { return out; }
        for (const m of t.matchAll(/\bname\s*=\s*"([^"\r\n]+)"/g)) out.add(m[1]);
        return out;
      };
      const van = namesIn(path.join(GAME, "interface", "countrytechtreeview.gui"));
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      let shippers = 0, worst = 0, worstName = "";
      let dirs = []; try { dirs = fs.readdirSync(WS); } catch (_) { dirs = []; }
      for (const d of dirs) {
        const f = path.join(WS, d, "interface", "countrytechtreeview.gui");
        if (!fs.existsSync(f)) continue;
        shippers++;
        const mine = namesIn(f);
        const vanOnly = [...van].filter((n) => !mine.has(n)).length;
        if (vanOnly > worst) { worst = vanOnly; try { worstName = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || d; } catch (_) { worstName = d; } }
      }
      if (!van.size) console.log("     (no HOI4 install — skipped)");
      else {
        console.log(`     vanilla names ${van.size} elements · ${shippers} installed mods replace the file · worst divergence ${worst} (${worstName})`);
        rec("base mods DO ship their own copy, so the base game is the wrong yardstick", shippers >= 1, shippers);
        rec("…and the divergence is large enough to matter", worst >= 20, { worst, worstName });
      }
    }

    console.log("\n[an add-on] is measured against the file it actually replaces");
    {
      const d = await layout(ADDON);
      rec("the endpoint answers", d && d.ok === true, d);
      console.log(`     staleGuiCount=${d.staleGuiCount} elements=${JSON.stringify(d.staleGuiElements)}`);
      rec("exactly the two the BASE MOD has and this copy lacks", d.staleGuiCount === 2, d.staleGuiCount);
      rec("…named", (d.staleGuiElements || []).includes("sg_gamma_tab") && (d.staleGuiElements || []).includes("sg_delta_tab"), d.staleGuiElements);
      // The discriminating half: vanilla names 361 elements this fixture has never heard of. If the diff
      // still ran against the game, the count would be in the hundreds and would name vanilla's elements.
      rec("…and NOTHING from the base game is blamed on the author",
        !(d.staleGuiElements || []).some((n) => /^countrytechtree|_folder$|^tech_/.test(n)), d.staleGuiElements);
      rec("the chip can say WHICH file it compared against",
        typeof d.staleGuiBase === "string" && d.staleGuiBase.includes(BASE_STEAM_ID), d.staleGuiBase);
      // …and say it in words the user recognises. The path leaf is the Steam id; the NAME lives in
      // descriptor.mod, which modDisplayName already reads for other callers. #stale-gui-base-mod-steam-id
      rec("…and name the base mod as its author named it", d.staleGuiBaseName === "SgBase", d.staleGuiBaseName);
      rec("…which is NOT what the folder is called", !/^\d+$/.test(String(d.staleGuiBaseName || "x")), d.staleGuiBaseName);
      {
        // Evaluate the label the user actually reads, rather than trusting the field feeds it.
        const rj = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
        const fn = /function staleGuiBaseLabel\(\) \{[\s\S]*?\n  \}/.exec(rj);
        rec("the label function is findable", !!fn, "staleGuiBaseLabel not found");
        if (fn) {
          const label = Function("staleGuiBase", "staleGuiBaseName",
            fn[0].replace("function staleGuiBaseLabel() {", "") .replace(/\}$/, "") .replace(/^\s*/, "return (function(){") + "})();"
          )(d.staleGuiBase, d.staleGuiBaseName);
          console.log(`     the chip reads: "${label}"`);
          rec("the chip names the mod, not the Steam id", label.includes("SgBase") && !label.includes(BASE_STEAM_ID), label);
        }
      }
    }

    console.log("\n[CONTROL — a standalone mod] is still measured against the base game");
    {
      // Without this, 'compare against the dependency' would quietly turn the chip off for every mod that
      // has no dependency, which is most of them — the case the chip was written for.
      const d = await layout(SOLO);
      rec("the endpoint answers", d && d.ok === true, d);
      console.log(`     staleGuiCount=${d.staleGuiCount}`);
      rec("a standalone stale copy is still reported", d.staleGuiCount > 20, d.staleGuiCount);
      rec("…and it names the game as the yardstick", /Hearts of Iron IV/i.test(String(d.staleGuiBase || "")), d.staleGuiBase);
    }

    console.log("\n[CONTROL — the base mod itself] is not accused of the add-on's problem");
    {
      const d = await layout(BASE);
      console.log(`     staleGuiCount=${d.staleGuiCount}`);
      rec("the base mod is measured against the game, as it should be", d.staleGuiCount > 20, d.staleGuiCount);
      rec("…and never against itself", !(d.staleGuiElements || []).includes("sg_gamma_tab"), d.staleGuiElements);
    }

    console.log("\n[the chip] says what it compared against rather than always 'the installed game'");
    {
      const rj = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
      rec("research.js reads the new field", /staleGuiBase/.test(rj), "still hardcodes the game");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== stale gui base-mod diff: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
