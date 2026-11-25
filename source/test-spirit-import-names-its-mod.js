// #spirit-import-lands-in-the-active-mod — "IMPORT INTO MY MOD" IMPORTED INTO SOMEONE ELSE'S.
//
// The national-spirit picker's "Import into my mod" toggle is ticked BY DEFAULT, so this is the ordinary
// path, not an opt-in. Its POST to /api/ideas/import carried no modPath, and the handler falls back to
// getActiveRoot() — whatever mod the SERVER last had active.
//
// It reports success either way, which is what makes it nasty: the localisation target comes from
// /api/localization/status, resolved against that same root, so both halves of the write agree with each
// other while both land in the wrong mod. The focus that granted the spirit is then saved into the RIGHT
// mod carrying an `add_ideas` that names an idea which is not there.
//
// ⚠️ The fix deliberately uses localStorage.activeModPath rather than inferModRootFromFocusPath(loadedPath):
// the client-side helper has no game-root exclusion (unlike the server's detectModRootFromFocusPath), so for
// a vanilla tree it returns the HOI4 install and the server would refuse the write outright.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spimport-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const toPosix = (p) => p.split(path.sep).join("/");
const PORT = 53381;
const SPIRIT = "importable_spirit";

function mkMod(name, withSpirit) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.mkdirSync(path.join(dir, "localisation", "english"), { recursive: true });
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(ROOT, `${name}.mod`),
    `name="${name}"\npath="${toPosix(dir)}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(dir, "common", "national_focus", "tree.txt"),
    `focus_tree = {\n\tid = ${name}_tree\n\tcountry = { factor = 1 }\n` +
    `\tfocus = {\n\t\tid = ${name}_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n}\n`);
  if (withSpirit) {
    fs.writeFileSync(path.join(dir, "common", "ideas", "source_ideas.txt"),
      `ideas = {\n\tcountry = {\n\t\t${SPIRIT} = {\n\t\t\tpicture = GFX_idea_generic_desk\n` +
      "\t\t\tmodifier = { political_power_factor = 0.1 }\n\t\t}\n\t}\n}\n");
    fs.writeFileSync(path.join(dir, "localisation", "english", `${name}_l_english.yml`),
      `﻿l_english:\n ${SPIRIT}:0 "Importable Spirit"\n`, "utf8");
  }
  return dir;
}

const SOURCE = mkMod("sourcemod", true);   // the mod the spirit is copied FROM
const MINE = mkMod("mymod", false);        // the mod the user is building — the intended destination
const STALE = mkMod("stalemod", false);    // whatever the server happens to have active

const hasSpirit = (root) => {
  const dir = path.join(root, "common", "ideas");
  let files = [];
  try { files = fs.readdirSync(dir); } catch (_) { return false; }
  return files.some((f) => {
    try { return fs.readFileSync(path.join(dir, f), "utf8").includes(`${SPIRIT} = {`); } catch (_) { return false; }
  });
};

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  try {
    const J = (u, o) => fetch(`http://127.0.0.1:${PORT}${u}`, o).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    // Make STALE the server's active mod by loading its tree, the way the app does.
    await J("/api/load", {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "t1" },
      body: JSON.stringify({ path: path.join(STALE, "common", "national_focus", "tree.txt") }),
    });

    console.log("\n[the fixture] the server's active mod is NOT the mod being built");
    rec("the spirit exists in the source mod", hasSpirit(SOURCE), "missing");
    rec("…and in neither of the other two", !hasSpirit(MINE) && !hasSpirit(STALE), "already present somewhere");

    console.log("\n[THE FIX] naming the destination puts it there");
    {
      const r = await J("/api/ideas/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId: SPIRIT, modPath: MINE, sourceModRoot: SOURCE, targetLocalizationPath: "" }),
      });
      rec("the import succeeds", r && r.ok === true, r);
      rec("the spirit lands in the mod that was named", hasSpirit(MINE), "not imported into mymod");
      // The whole point: the mod the server happened to have active must not receive it.
      rec("…and NOT in the server's active mod", !hasSpirit(STALE), "it went into stalemod as well/instead");
    }

    console.log("\n[the bug it replaces] with no modPath the server picks for you");
    {
      const MINE2 = mkMod("mymod2", false);
      const r = await J("/api/ideas/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId: SPIRIT, sourceModRoot: SOURCE, targetLocalizationPath: "" }),
      });
      rec("it still reports success", r && r.ok === true, r);
      // This is the behaviour the client used to get. Pinned so the consequence stays visible: the write
      // lands in the active mod, which is why the CLIENT must name its destination.
      rec("…while writing into the active mod, not the one being built", hasSpirit(STALE) && !hasSpirit(MINE2),
        { stale: hasSpirit(STALE), mine2: hasSpirit(MINE2) });
    }
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  console.log("\n[the client] the picker names its destination");
  {
    const CODE = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
    const call = (CODE.match(/fetch\("\/api\/ideas\/import"[\s\S]{0,600}?\}\),/) || [""])[0];
    rec("the import call is findable", !!call, "not found");
    rec("…and sends a modPath", /modPath:/.test(call), call.slice(0, 200));
    // ⚠️ Must NOT be the focus-path helper: it has no game-root exclusion, so a vanilla tree would make it
    // name the HOI4 install and the server would refuse the write.
    rec("…taken from activeModPath, not the focus path", /localStorage\.getItem\("activeModPath"\)/.test(call), call.slice(0, 200));
    rec("…and not from inferModRootFromFocusPath", !/inferModRootFromFocusPath/.test(call), "uses the focus-path helper");
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== spirit import names its mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
