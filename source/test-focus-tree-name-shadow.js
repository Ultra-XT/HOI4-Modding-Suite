// #focus-tree-name-shadows-a-base-file — TAKING OVER SOMEONE ELSE'S FILE IS FINE; DOING IT SILENTLY IS NOT.
//
// HOI4 loads only ONE file per `common/` relative path. Naming a new focus tree after one the base game or a
// dependency already ships therefore REPLACES it wholesale, and every focus_tree that file defined stops
// loading. The endpoint only ever checked `fs.existsSync(focusTreePath)` — this mod's own directory — so the
// in-mod collision was refused with a clear message and the cross-layer one went through in silence.
//
// Measured: naming a new tree "poland" left the mod holding common/national_focus/poland.txt in place of
// vanilla's, which defines 5 focus_tree blocks. Response `ok:true`, nothing said.
//
// ⚠️ REFUSING WOULD BE WRONG, and that is the whole design of this fix. Replacing a vanilla national_focus
// file wholesale is ordinary modding — Road to 56 ships 78 of vanilla's 81 basenames doing exactly that. So
// this warns and proceeds, naming the file, the layer and the cost, the same way the equipment writer leaves
// an existing block put and explains rather than blocking. The checks below spend as much effort proving it
// still CREATES as proving it warns.
//
// Delivered through the endpoint's existing note idiom: it already returns `idNote` for a name the game's
// lexer would refuse, and public/app.js alerts it. `shadowNote` rides the same path.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ftshadow-"));
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
const NF = path.join(GAME, "common", "national_focus");
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "FT" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const nfDir = (mod) => {
  const d = path.join(mod, "common", "national_focus");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};

let PORT = 50250;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      // Exactly what public/app.js startNewFocusTreeFlow sends.
      create: (modPath, fileName) => fetch("http://127.0.0.1:" + PORT + "/api/mod/copy-generic-focus-tree", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath, fileName }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(NF)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] names an author can collide with");
    let victim = "", victimTrees = 0;
    {
      const files = fs.readdirSync(NF).filter((x) => x.endsWith(".txt"));
      for (const f of files) {
        const n = (fs.readFileSync(path.join(NF, f), "latin1").replace(/#.*$/gm, "").match(/focus_tree\s*=\s*\{/g) || []).length;
        if (n > victimTrees) { victim = f; victimTrees = n; }
      }
      console.log(`  vanilla ships ${files.length} national_focus files; ${victim} defines ${victimTrees} focus trees`);
      rec("fixture: there is a real vanilla file to collide with", !!victim && victimTrees > 0, { victim, victimTrees });
    }

    api = await serve(createApp());

    console.log("\n[naming a tree after a vanilla file] allowed, but said out loud");
    {
      const mod = mkMod(null);
      const r = await api.create(mod.dir, victim.replace(/\.txt$/i, ""));
      rec("the tree is still created — this is not blocked", r.ok === true, r);
      rec("…at the colliding path, because that is what was asked for",
        nfDir(mod.dir).some((f) => f.toLowerCase() === victim.toLowerCase()), nfDir(mod.dir));
      rec("…and the author is told", !!String(r.shadowNote || "").trim(), r.shadowNote || "(empty)");
      rec("…which file it takes over", String(r.shadowNote || "").includes(victim), r.shadowNote);
      rec("…which layer it belongs to", /the base game/.test(String(r.shadowNote || "")), r.shadowNote);
      rec("…and what it costs, in numbers",
        new RegExp("\\b" + victimTrees + " focus tree").test(String(r.shadowNote || "")), r.shadowNote);
      rec("…phrased so a deliberate takeover is not treated as a mistake",
        /if you meant to take it over/i.test(String(r.shadowNote || "")), r.shadowNote);
      rec("…and the game install is untouched",
        fs.existsSync(path.join(NF, victim)), "vanilla file disappeared");
    }

    console.log("\n[a dependency's file] names that mod, not the base game");
    {
      const base = mkMod(null);
      const bnf = path.join(base.dir, "common", "national_focus");
      fs.mkdirSync(bnf, { recursive: true });
      fs.writeFileSync(path.join(bnf, "zz_base_focus.txt"),
        "focus_tree = {\n\tid = zz_base_tree\n\tcountry = { factor = 1 }\n\tfocus = { id = zz_base_focus_1 x = 0 y = 0 cost = 10 }\n}\n");
      const addon = mkMod(base.name);
      const r = await api.create(addon.dir, "zz_base_focus");
      rec("the tree is created", r.ok === true, r);
      rec("…and the note names the BASE MOD, not vanilla",
        String(r.shadowNote || "").includes(base.name), r.shadowNote || "(empty)");
      rec("…counting what that mod loses", /1 focus tree\b/.test(String(r.shadowNote || "")), r.shadowNote);
      rec("…while the base mod's own file is untouched",
        /zz_base_tree/.test(fs.readFileSync(path.join(bnf, "zz_base_focus.txt"), "utf8")), "base mod changed");
    }

    console.log("\n[no collision] nothing is invented");
    {
      const mod = mkMod(null);
      const r = await api.create(mod.dir, "zz_a_name_nobody_uses");
      rec("the tree is created", r.ok === true, r);
      rec("…with no note at all", !String(r.shadowNote || "").trim(), r.shadowNote);
      rec("…and the file is where it was asked for", nfDir(mod.dir).includes("zz_a_name_nobody_uses.txt"), nfDir(mod.dir));
    }

    console.log("\n[the guard that already worked] an in-mod collision is still refused");
    {
      const mod = mkMod(null);
      const a = await api.create(mod.dir, "zz_only_once");
      rec("the first create succeeds", a.ok === true, a);
      const b = await api.create(mod.dir, "zz_only_once");
      rec("…and the second is refused, not silently merged",
        !b.ok && /already exists in this mod/i.test(String(b.error || "")), b);
      rec("…leaving exactly one file", nfDir(mod.dir).filter((f) => f === "zz_only_once.txt").length === 1, nfDir(mod.dir));
    }

    console.log("\n[the client surfaces it]");
    {
      const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      rec("app.js alerts the shadow note", /if \(data\.shadowNote\) \{ try \{ await window\.nbAlert\(data\.shadowNote\);/.test(APP),
        "the note would never be seen");
      rec("…alongside the existing id note, not instead of it",
        /if \(data\.idNote\) \{ try \{ await window\.nbAlert\(data\.idNote\);/.test(APP), "idNote handling lost");
    }

    api.stop(); api = null;
    console.log(`\n=== focus tree name shadow: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
