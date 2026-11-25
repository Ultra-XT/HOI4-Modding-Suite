// #tab-name-not-the-game-s — THE EDITOR NAMED EVERY RESEARCH TAB ITSELF, AND OFTEN GOT IT WRONG.
//
// Reported from play: a tab called one thing in Nova and something else entirely in game, "with no way to
// name it".
//
// HOI4 reads a research tab's name from a localisation key equal to the FOLDER KEY. Nova instead title-cased
// the folder key. That disagrees with the game far more often than it sounds like it would — measured here
// against both corpora, not assumed:
//
//   vanilla   electronics_folder   game "Engineering"                nova "Electronics"
//             air_techs_folder     game "Air"                        nova "Air Techs"
//             support_folder       game "Support Companies"          nova "Support"
//   MD        civilian_folder      game "Industrial Technology"      nova "Civilian"
//             cruise_missiles_folder game "Guided Missile Technology" nova "Cruise Missiles"
//
// Two consequences, and the second is worse than the first. The tab reads wrong; AND the Edit Tab dialog
// prefilled that same invented name, so pressing Save Changes wrote "Electronics" over the game's
// "Engineering" — the dialog corrupting the thing it exists to edit.
//
// "No way to name it" was literal: upsertCustomFolderNameLoc had exactly one caller, create-custom-folder,
// so a tab's in-game name could be set at the moment of creation and never again, and the dialog refused to
// do anything for a base-game tab unless you uploaded an icon.
//
// ⚠️ The rename must NOT go through create-custom-folder. That also writes the folder into the mod's
// zz_nova_custom_folders.txt, and being listed there is exactly what makes syncCustomFolderGridboxes willing
// to relayout a folder — "saving ruined the electronics tree". A loc-only endpoint is the whole point.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tabname-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-tabname-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// The client's derived name, lifted from the shipped source so this cannot drift from it.
const RJS = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
function prettyFolderNameFromSource() {
  const i = RJS.indexOf("function prettyFolderName(");
  if (i === -1) return null;
  let d = 0, end = -1;
  for (let k = RJS.indexOf("{", i); k < RJS.length; k++) {
    if (RJS[k] === "{") d++;
    else if (RJS[k] === "}") { d--; if (!d) { end = k + 1; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval("(" + RJS.slice(i, end) + ")");
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}
const locFile = (mod) => path.join(mod, "localisation", "english", "nova_custom_folders_l_english.yml");
const readLoc = (mod) => { try { return fs.readFileSync(locFile(mod), "utf8"); } catch (_) { return ""; } };

let PORT = 44980;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    const pretty = prettyFolderNameFromSource();
    console.log("\n[ground truth] the game names its tabs in localisation, and disagrees with a derived name");
    rec("prettyFolderName was extracted from the shipped source", typeof pretty === "function", "not found");
    const haveGame = fs.existsSync(path.join(V, "localisation", "english"));
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else if (pretty) {
      const names = new Map();
      for (const f of fs.readdirSync(path.join(V, "localisation", "english")).filter((x) => x.endsWith(".yml"))) {
        for (const line of fs.readFileSync(path.join(V, "localisation", "english", f), "utf8").split(/\r?\n/)) {
          const m = /^\s*([A-Za-z0-9_]+_folder|mtgnavalfolder|mtgnavalsupportfolder)\s*:\s*\d*\s*"(.*)"\s*$/.exec(line);
          if (m) names.set(m[1], m[2]);
        }
      }
      rec("vanilla localises its research folders", names.size >= 10, names.size);
      rec("…electronics_folder is called Engineering, not Electronics",
        names.get("electronics_folder") === "Engineering", names.get("electronics_folder"));
      rec("…and the derived name really would have said Electronics",
        pretty("electronics_folder") === "Electronics", pretty("electronics_folder"));
      const disagree = [...names].filter(([k, v]) => v !== pretty(k) && !/^\$/.test(v));
      rec("…the derived name disagrees with the game on several folders", disagree.length >= 4,
        disagree.slice(0, 8).map(([k, v]) => `${k}: game="${v}" nova="${pretty(k)}"`));
    }

    api = await serve(createApp());

    console.log("\n[the fix, half one] the layout call carries the names the game will show");
    if (haveGame) {
      const mod = mkMod("m1");
      const r = await api.get(`/api/research/gui-layout?modPath=${encodeURIComponent(mod)}`);
      rec("gui-layout answers", r.s === 200 && r.b.ok, r.b.error || r.b);
      rec("…and includes folderNames", !!r.b.folderNames && typeof r.b.folderNames === "object", Object.keys(r.b || {}));
      rec("…with the game's name for electronics_folder",
        (r.b.folderNames || {}).electronics_folder === "Engineering", (r.b.folderNames || {}).electronics_folder);
      rec("…and for air_techs_folder", (r.b.folderNames || {}).air_techs_folder === "Air",
        (r.b.folderNames || {}).air_techs_folder);
      // vanilla's bba_air_techs_folder is literally "$air_techs_folder$" — a reference, not a name.
      rec("…resolving a $key$ reference rather than showing it raw",
        !/^\$/.test(String((r.b.folderNames || {}).bba_air_techs_folder || "")),
        (r.b.folderNames || {}).bba_air_techs_folder);
    }

    console.log("\n[the fix, half two] a tab's name can be changed after it exists");
    {
      const mod = mkMod("m2");
      const r = await api.post("/api/research/set-folder-name", {
        modPath: mod, folderKey: "electronics_folder", name: "Signals & Radar",
      });
      rec("the rename succeeds", r.s === 200 && r.b.ok, r.b);
      const loc = readLoc(mod);
      rec("…writing the loc key the game reads", /(^|\n)\s*electronics_folder:\d*\s+"Signals & Radar"/.test(loc), loc);
      rec("…into a file with a UTF-8 BOM", loc.charCodeAt(0) === 0xfeff, loc.slice(0, 12));

      // The dangerous thing this must NOT do.
      const custom = path.join(mod, "common", "technology_tags", "zz_nova_custom_folders.txt");
      rec("…and NOT declaring a base-game folder as one of Nova's own",
        !fs.existsSync(custom) || !/electronics_folder/.test(fs.readFileSync(custom, "utf8")),
        fs.existsSync(custom) ? fs.readFileSync(custom, "utf8") : "(no file)");

      const again = await api.post("/api/research/set-folder-name", {
        modPath: mod, folderKey: "electronics_folder", name: "Signals",
      });
      rec("renaming again replaces the line", again.b.ok &&
        (readLoc(mod).match(/electronics_folder\s*:/g) || []).length === 1,
        readLoc(mod));
      rec("…with the new value", /"Signals"/.test(readLoc(mod)), readLoc(mod));

      const bad = await api.post("/api/research/set-folder-name", { modPath: mod, folderKey: "x y", name: "n" });
      rec("an invalid key is refused", bad.s === 400, bad.b);
      const empty = await api.post("/api/research/set-folder-name", { modPath: mod, folderKey: "air_techs_folder", name: "  " });
      rec("an empty name is refused", empty.s === 400, empty.b);
    }

    console.log("\n[end to end] the rename is what gui-layout then reports");
    if (haveGame) {
      const mod = mkMod("m3");
      await api.post("/api/research/set-folder-name", { modPath: mod, folderKey: "electronics_folder", name: "Signals & Radar" });
      const r = await api.get(`/api/research/gui-layout?modPath=${encodeURIComponent(mod)}`);
      rec("the mod's name overrides the game's", (r.b.folderNames || {}).electronics_folder === "Signals & Radar",
        (r.b.folderNames || {}).electronics_folder);
    }
    api.stop(); api = null;

    console.log("\n[the client] the strip shows the game's name, and the dialog no longer invents one");
    {
      rec("research.js has a gameFolderName helper", /function gameFolderName\(/.test(RJS), "no helper");
      rec("…fed by folderNames from the layout call", /guiFolderNames = gl\.folderNames/.test(RJS), "never read");
      rec("…and falling back to the derived name", /\?\s*v\s*:\s*prettyFolderName\(folder\)/.test(RJS), "no fallback");
      rec("the tab strip uses it", /name: gameFolderName\(folder\)/.test(RJS), "strip still derives its own");
      rec("the Edit Tab dialog prefills the game's name",
        /customTabNameInput\.value = ct \? ct\.name : gameFolderName\(/.test(RJS), "dialog still invents a name");
      rec("…and compares against it, so an untouched save writes nothing",
        /const currentName = ct \? \(ct\.name \|\| ""\) : gameFolderName\(folder\)/.test(RJS), "baseline unchanged");
      rec("a base-game tab can be renamed without uploading an icon",
        /if \(!iconFile && !ct && !newName\)/.test(RJS), "still demands an icon");
      rec("…and that rename goes to the loc-only endpoint, not create-custom-folder",
        /if \(!ct && !tabDdsPath && !ledgerChanged && nameChanged\)[\s\S]{0,400}?set-folder-name/.test(RJS),
        "still routed through create-custom-folder");
      rec("research.js is syntactically valid",
        (() => { try { new Function(RJS); return true; } catch (e) { return String(e.message); } })() === true,
        (() => { try { new Function(RJS); return "ok"; } catch (e) { return String(e.message); } })());
    }

    console.log("\n[back-out] stop sending the names");
    if (haveGame) {
      const built = controlApp("nonames", [[
        "      res.json({ ok: true, guiSource: guiPath, folders, allFolders: folderKeys, folderNames,",
        "      res.json({ ok: true, guiSource: guiPath, folders, allFolders: folderKeys, folderNames: {},"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const c = await capi.get(`/api/research/gui-layout?modPath=${encodeURIComponent(cmod)}`);
          rec("…and the client has nothing to show but its own guess",
            !Object.keys(c.b.folderNames || {}).length, c.b.folderNames);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== research tab name: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
