// #capital-must-exist (create-template) — THE ONBOARDING FRONT DOOR ACCEPTED A CAPITAL THAT DOES NOT EXIST.
//
// /api/mod/create-template wrote `capital = <id>` straight into history/countries/<TAG>.txt, and then —
// further down the same handler — looked the state up to set its owner and cores, under `if (stateFileInfo)`.
// A typo'd id simply skipped that block. The country was created owning no land, with a capital pointing at
// a state that does not exist, and the response was ok:true.
//
// Everything keyed off a capital then has nothing to work with: victory points, capital-scoped effects, the
// AI. map-data.js documents a capital whose state holds no land as a game-start crash.
//
// ⭐ /api/countries/create ALREADY HAS this guard, tagged #capital-must-exist, with a comment explaining
// that "nothing has been written at this point, so refusing is free". create-template never adopted it —
// and create-template is the ONBOARDING front door, the path a first mod is most likely to be made through,
// where the client checks only capitalStateId <= 0.
//
// ⚠️ The mod does not exist yet when this runs, so unlike its sibling there is no modRoot to search. The
// state has to come from the base game or from a DEPENDENCY the template declares, which is why the
// name-to-root half of resolveDependencyRootsForAssets was split out — an add-on template naming one of its
// parent mod's states must not be wrongly rejected.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tmplcap-"));
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
const PORT = 53185;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    // ⭐ SEND WHAT THE CLIENT SENDS — public/app.js posts modName, displayName, countryTag, countryName,
    // capitalStateId and color from the onboarding "Create mod from template" front door.
    const mk = (modName, capitalStateId, extra) => fetch(`http://127.0.0.1:${PORT}/api/mod/create-template`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modName, displayName: modName, countryTag: "ZZ1", countryName: "Probia",
        capitalStateId, color: "120 10 50", ...(extra || {}),
      }),
    }).then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[CONTROL] a real state id still creates the mod");
    {
      // ⚠️ If this fails the guard is too strict and the refusal below proves nothing useful.
      const r = await mk("CapGoodMod", 1);
      console.log(`     capital 1 -> ${r.error ? "refused: " + String(r.error).slice(0, 80) : "ok=" + r.ok}`);
      rec("state 1 is accepted", !r.error && r.ok !== false, r);
      const hist = path.join(ROOT, "capgoodmod", "history", "countries");
      let files = []; try { files = fs.readdirSync(hist); } catch (_) {}
      rec("…and the country history was written", files.length > 0, files);
    }

    console.log("\n[the defect] a capital that does not exist must be refused");
    {
      const r = await mk("CapBadMod", 9999);
      console.log(`     capital 9999 -> ${r.error ? "REFUSED" : "ACCEPTED ok=" + r.ok}`);
      // THE BUG: ok:true, a country owning no land, and `capital = 9999` on disk.
      rec("it is refused rather than created", !!r.error, r);
      rec("…naming the id so the modder can correct it", /9999/.test(String(r.error || "")), r.error);
      rec("…and saying where it looked", /dependencies|base game/i.test(String(r.error || "")), r.error);
      rec("…and pointing at the visual alternative", /Map/.test(String(r.error || "")), r.error);
    }

    console.log("\n[⭐ nothing written] the refusal must come BEFORE any file is created");
    {
      // "Nothing has been written at this point, so refusing is free" is the sibling's own justification.
      // A half-created mod on disk would be worse than the bug.
      const dir = path.join(ROOT, "capbadmod");
      const exists = fs.existsSync(dir);
      console.log(`     mod directory created? ${exists}`);
      rec("no mod directory was left behind", !exists, dir);
      let mods = []; try { mods = fs.readdirSync(ROOT).filter((f) => /capbad/i.test(f)); } catch (_) {}
      rec("…and no .mod registration either", mods.length === 0, mods);
    }

    console.log("\n[the sibling] /api/countries/create still has the guard this was copied from");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf('app.post("/api/countries/create"');
      const near = at === -1 ? "" : sv.slice(at, at + 4000);
      rec("the sibling route is findable", at !== -1, "not found");
      rec("…and still refuses a capital that does not exist",
        /Capital state \$\{capitalStateId\} does not exist/.test(near), near.slice(0, 200));
      // Both should now be reachable from one shared name resolver.
      rec("the dependency name resolver is shared", /function resolveDependencyRootsByNames\(/.test(sv), "not split out");
      const uses = (sv.match(/resolveDependencyRootsByNames\(/g) || []).length - 1;
      console.log(`     resolveDependencyRootsByNames( call sites: ${uses}`);
      rec("…and used by more than one caller", uses >= 2, uses);
    }

    console.log("\n[CONTROL] the base game really does have state 1 and not state 9999");
    {
      // Anchors the two cases above on the corpus rather than on the guard agreeing with itself.
      const dir = path.join(GAME, "history", "states");
      let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) {}
      const has = (id) => files.some((f) => new RegExp(`^${id}-`).test(f));
      console.log(`     vanilla history/states: ${files.length} files · has 1: ${has(1)} · has 9999: ${has(9999)}`);
      rec("vanilla ships state 1", has(1), files.slice(0, 3));
      rec("…and does not ship state 9999", !has(9999), files.filter((f) => /^9999-/.test(f)));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== template capital must exist: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
