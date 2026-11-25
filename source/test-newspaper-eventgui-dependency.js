// #newspaper-eventgui-skips-the-base-mod — THE EVENT WINDOW A BASE MOD SHIPS IS THE ONE THE PLAYER SEES.
//
// Newspaper Style writes a Nova-owned `interface/zz_nova_eventwindow.gui`: a copy of the mod's event window
// with the minimize/skip button removed. The copy has to be taken from the layout that is actually in force,
// because the file sorts last and redefines all four event windows — whatever it contains BECOMES the event
// window.
//
// Both resolvers stepped mod → vanilla with nothing in between:
//
//     buildStrippedEventGui          own gui, else vanilla
//     resolveEffectiveEventGuiPath   own gui, else Nova's backup, else vanilla
//
// An add-on ships no eventwindow.gui of its own. So for an add-on to Millennium Dawn — or Old World Blues,
// Rise of Nations, Novum Vexillum, all of which ship one — Nova copied VANILLA's window and laid it over the
// base mod's. Measured on an MD-derived fixture: the written override carried 5 of the 6 vanilla-only leaf
// assignments and 0 of the 18 base-only ones, and the layout editor drew vanilla's Title box (x=12 y=260
// maxWidth=490) where the base mod's is (x=35 y=253 maxWidth=444). The author sees the wrong geometry, drags
// against the wrong baseline, and the base mod's custom window is silently replaced.
//
// The fixture is derived from vanilla rather than copied out of a workshop mod so the test is deterministic
// on any machine — and the derivation is asserted to have actually changed something, because a base file
// identical to vanilla would make every check below pass for the wrong reason.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evgui-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const VANILLA_GUI = path.join(GAME, "interface", "eventwindow.gui");
const toPosix = (p) => p.split(path.sep).join("/");

const leafSet = (txt) => {
  const m = new Map();
  for (const l of (String(txt).replace(/#.*$/gm, "").match(/[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"[^"]*"|[-0-9A-Za-z_.]+)/g) || []))
    { const k = l.replace(/\s+/g, ""); m.set(k, (m.get(k) || 0) + 1); }
  return m;
};

let seq = 0;
function mkMod(name, deps) {
  const dir = path.join(ROOT, name + ++seq);
  fs.mkdirSync(dir, { recursive: true });
  const n = "ZZ" + name + seq;
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""), "utf8");
  fs.writeFileSync(path.join(ROOT, name + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n', "utf8");
  return { name: n, dir };
}
function putGui(dir, txt) {
  fs.mkdirSync(path.join(dir, "interface"), { recursive: true });
  fs.writeFileSync(path.join(dir, "interface", "eventwindow.gui"), txt, "utf8");
}

let PORT = 49590;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      layouts: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/events/window-layouts?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      apply: (body) => fetch("http://127.0.0.1:" + PORT + "/api/events/apply-newspaper-style", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(VANILLA_GUI)) {
      console.log("no HOI4 install — skipped");
      return;
    }

    console.log("\n[the corpus] mods people build on top of, that ship their own event window");
    {
      const ws = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const shipping = [];
      if (fs.existsSync(ws)) {
        for (const d of fs.readdirSync(ws)) {
          const g = path.join(ws, d, "interface", "eventwindow.gui");
          if (!fs.existsSync(g)) continue;
          let nm = d;
          try { nm = (/\bname\s*=\s*"(.*?)"/.exec(fs.readFileSync(path.join(ws, d, "descriptor.mod"), "utf8")) || [, d])[1]; } catch (_) {}
          shipping.push(nm);
        }
      }
      console.log("  " + (shipping.length ? shipping.join(", ") : "(no workshop mods installed)"));
    }

    const vanillaTxt = fs.readFileSync(VANILLA_GUI, "utf8");
    // Derive a base-mod layout that differs from vanilla in a way the parser reads out: every maxWidth moves.
    const baseTxt = vanillaTxt.replace(/maxWidth\s*=\s*(\d+)/g, (_m, n) => "maxWidth = " + (Number(n) + 7));
    const V = leafSet(vanillaTxt), B = leafSet(baseTxt);
    const onlyV = [...V.keys()].filter((k) => !B.has(k));
    const onlyB = [...B.keys()].filter((k) => !V.has(k));

    console.log("\n[fixture control] the base layout must actually differ, or nothing below means anything");
    rec("the derived base mod's gui differs from vanilla", onlyB.length >= 5 && onlyV.length >= 5,
      { onlyV: onlyV.length, onlyB: onlyB.length });

    api = await serve(createApp());

    console.log("\n[an add-on] takes its layout from the base mod, not from vanilla");
    const base = mkMod("base", null);
    putGui(base.dir, baseTxt);
    const addon = mkMod("addon", base.name);
    {
      const lAdd = await api.layouts(addon.dir);
      const lBase = await api.layouts(base.dir);
      const lVan = await api.layouts(mkMod("bare", null).dir);
      rec("the editor answers for all three", !!lAdd.layouts && !!lBase.layouts && !!lVan.layouts,
        { add: !!lAdd.layouts, base: !!lBase.layouts, van: !!lVan.layouts });
      rec("control: vanilla and the base mod really do read differently",
        JSON.stringify(lBase.layouts) !== JSON.stringify(lVan.layouts), "the fixture change is invisible to the parser");
      rec("the add-on shows the BASE MOD's layout", JSON.stringify(lAdd.layouts) === JSON.stringify(lBase.layouts),
        { addon: JSON.stringify(lAdd.layouts || {}).slice(0, 160), base: JSON.stringify(lBase.layouts || {}).slice(0, 160) });
      rec("…and not vanilla's", JSON.stringify(lAdd.layouts) !== JSON.stringify(lVan.layouts), "still drawing vanilla");
    }

    console.log("\n[what gets written] the override that BECOMES the event window");
    {
      const r = await api.apply({ modPath: addon.dir, source: "vanilla" });
      rec("Newspaper Style applies", r.ok === true && r.hasWindow === true, r);
      const nova = path.join(addon.dir, "interface", "zz_nova_eventwindow.gui");
      rec("…writing the Nova-owned override", fs.existsSync(nova), nova);
      const got = leafSet(fs.readFileSync(nova, "utf8"));
      const carriesB = onlyB.filter((k) => got.has(k)).length;
      const carriesV = onlyV.filter((k) => got.has(k)).length;
      console.log(`  carries ${carriesB}/${onlyB.length} base-only and ${carriesV}/${onlyV.length} vanilla-only leaves`);
      rec("it carries the base mod's layout", carriesB > 0 && carriesB >= carriesV, { carriesB, carriesV });
      rec("…and does not lay vanilla's over it", carriesV === 0, { carriesV });
      // The point of the feature must survive the fix. The button is NEUTRALISED, never deleted — HOI4
      // fetches btn_minimize out of top_Window by name and errors if it is gone.
      const txt = fs.readFileSync(nova, "utf8");
      rec("…with the minimize button still present for the engine to find", /"btn_minimize"/.test(txt), "btn_minimize deleted");
      rec("…and parked out of sight at zero size",
        /name\s*=\s*"btn_minimize"[\s\S]{0,120}?size\s*=\s*\{\s*width\s*=\s*0\s+height\s*=\s*0\s*\}/.test(txt),
        (/name\s*=\s*"btn_minimize"[\s\S]{0,200}/.exec(txt) || [""])[0]);
      rec("…and the mod's own file still never created", !fs.existsSync(path.join(addon.dir, "interface", "eventwindow.gui")), "own gui created");
      rec("…and the BASE mod untouched",
        fs.readFileSync(path.join(base.dir, "interface", "eventwindow.gui"), "utf8") === baseTxt, "base mod was written to");
    }

    console.log("\n[precedence] own gui beats a dependency; no dependency still falls back to vanilla");
    {
      const own = mkMod("own", base.name);
      const ownTxt = vanillaTxt.replace(/maxWidth\s*=\s*(\d+)/g, (_m, n) => "maxWidth = " + (Number(n) + 13));
      putGui(own.dir, ownTxt);
      const r = await api.apply({ modPath: own.dir, source: "vanilla" });
      rec("a mod with its own gui still applies", r.ok === true && r.hasWindow === true, r);
      const got = leafSet(fs.readFileSync(path.join(own.dir, "interface", "zz_nova_eventwindow.gui"), "utf8"));
      const O = leafSet(ownTxt);
      const onlyOwn = [...O.keys()].filter((k) => !V.has(k) && !B.has(k));
      rec("…seeded from ITS OWN gui, not the dependency's",
        onlyOwn.filter((k) => got.has(k)).length > 0 && onlyB.filter((k) => got.has(k)).length === 0,
        { own: onlyOwn.filter((k) => got.has(k)).length, dep: onlyB.filter((k) => got.has(k)).length });

      const bare = mkMod("solo", null);
      const r2 = await api.apply({ modPath: bare.dir, source: "vanilla" });
      rec("a mod with no dependency still applies", r2.ok === true && r2.hasWindow === true, r2);
      const got2 = leafSet(fs.readFileSync(path.join(bare.dir, "interface", "zz_nova_eventwindow.gui"), "utf8"));
      rec("…falling back to vanilla exactly as before", onlyV.filter((k) => got2.has(k)).length > 0,
        onlyV.filter((k) => got2.has(k)).length);
    }

    console.log("\n[remove] still puts everything back");
    {
      const r = await api.apply({ modPath: addon.dir, source: "remove" });
      rec("remove succeeds", r.ok === true, r);
      rec("…deleting the Nova override", !fs.existsSync(path.join(addon.dir, "interface", "zz_nova_eventwindow.gui")), "override left behind");
      rec("…and leaving the base mod as it was",
        fs.readFileSync(path.join(base.dir, "interface", "eventwindow.gui"), "utf8") === baseTxt, "base mod changed");
    }

    api.stop(); api = null;
    console.log(`\n=== newspaper eventgui dependency: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
