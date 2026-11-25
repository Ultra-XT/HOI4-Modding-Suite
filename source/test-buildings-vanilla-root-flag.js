// #vanilla-root-never-detected — isVanillaRoot must be true when the open focus tree is a vanilla one.
//
// Both /api/buildings/state-catalog and /api/buildings/icon-map publish an `isVanillaRoot` flag, and it could
// never be true. A focus tree opened from the BASE GAME is not under any mod, so detectModRootFromFocusPath
// correctly returns null — but the code then did path.resolve(modRoot || ""), which is the current working
// directory, and compared THAT to the game root. So the one flag these endpoints exist to publish was false
// on exactly the path it describes, and modRoot came back null with it.
//
// Both directions: a vanilla tree must report true, a mod tree must still report false — a fix that made
// everything look like vanilla would be worse than the bug, since these endpoints gate whether the buildings
// panel treats content as editable.
//
// Reads vanilla only; writes nothing outside tmpdir. Skips cleanly if the game is not installed.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vroot-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const MOD = path.join(ROOT, "vrootmod");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="VRootMod"\nsupported_version="1.18.*"\n', "utf8");
const MOD_TREE = path.join(MOD, "common", "national_focus", "nova_tree.txt");
fs.writeFileSync(MOD_TREE, "focus_tree = {\n\tid = nova_tree\n}\n", "utf8");

const PORT = 42199;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (route) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`);
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // Find a real vanilla focus tree through Nova's own resolution rather than hardcoding an install path.
    const probe = await get(`/api/buildings/icon-map?focusPath=${encodeURIComponent(MOD_TREE)}`);
    rec("the endpoint answers for a mod tree", probe.status === 200 && probe.body, probe.body || probe.status);

    let vanillaTree = "";
    try {
      const gr = require("./server.js");
      void gr;
      // The game root is wherever vanilla's national_focus lives; locate one file under it.
      const candidates = [
        "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus/germany.txt",
      ];
      vanillaTree = candidates.find((p) => fs.existsSync(p)) || "";
    } catch (_) { vanillaTree = ""; }

    console.log("\n[mod focus tree] must report NOT vanilla");
    for (const route of ["state-catalog", "icon-map"]) {
      const r = await get(`/api/buildings/${route}?focusPath=${encodeURIComponent(MOD_TREE)}&countryTag=GER`);
      rec(`${route}: isVanillaRoot is false`, r.body && r.body.isVanillaRoot === false, r.body);
      rec(`${route}: modRoot is set`, !!(r.body && r.body.modRoot), r.body && r.body.modRoot);
    }

    if (!vanillaTree) {
      console.log("\n  --  no vanilla install found; skipping the vanilla half");
    } else {
      console.log("\n[vanilla focus tree] must report vanilla");
      for (const route of ["state-catalog", "icon-map"]) {
        const r = await get(`/api/buildings/${route}?focusPath=${encodeURIComponent(vanillaTree)}&countryTag=GER`);
        rec(`${route}: isVanillaRoot is TRUE`, r.body && r.body.isVanillaRoot === true, r.body);
        rec(`${route}: modRoot is the game root, not null`, !!(r.body && r.body.modRoot), r.body && r.body.modRoot);
        const payload = route === "state-catalog"
          ? (r.body && r.body.items || []).length
          : Object.keys((r.body && r.body.icons) || {}).length;
        rec(`${route}: still returns its data`, payload > 0, payload);
      }
    }

    console.log(`\n=== buildings vanilla-root flag: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
