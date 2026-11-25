// #replace-path-not-recursive — REPLACE_PATH APPLIES TO ONE DIRECTORY LEVEL, NOT THE TREE BELOW IT.
//
// Ground truth, the HOI4 modding wiki: "This only applies to files directly within that folder, any
// sub-folders will be left untouched."
//
// Millennium Dawn's own descriptor corroborates it. It lists 81 replace_paths including parent AND child
// together — common/units, common/units/equipment and common/units/equipment/upgrades; common/decisions
// with common/decisions/categories; common/special_projects with four of its children. Every one of those
// pairs is redundant if a replace_path already swallowed its subfolders, so MD's authors clearly do not
// believe it is recursive either.
//
// Nova treated it as recursive (`sp.startsWith(rp + "/")`), which made it HIDE content the game still
// loads: against a mod declaring only replace_path = "common/units", the equipment-modules catalogue went
// from 312 entries to 0 and upgrades from 37 to 0.
//
// This is the control-first, both-directions rule from #replace-path-not-honoured: dropping vanilla too
// eagerly empties the picker for every mod that does not replace that exact path, and keeping it when the
// mod DOES replace it offers content the game will not load. Both directions are checked below.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rpnr-"));
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

const mk = (name, replacePaths) => {
  const m = path.join(ROOT, name);
  fs.mkdirSync(m, { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"),
    `version="1"\nname="${name}"\nsupported_version="1.19.*"\n` +
    (replacePaths || []).map((p) => `replace_path="${p}"\n`).join(""), "utf8");
  return m;
};

const PLAIN = mk("rpnr_plain", []);
const PARENT = mk("rpnr_parent", ["common/units"]);           // parent only — must NOT hide the subfolder
const EXACT = mk("rpnr_exact", ["common/units/equipment/modules"]); // the real thing — MUST hide it

const PORT = 42509;
const app = createApp();
const server = app.listen(PORT, async () => {
  const modules = async (mod) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/modules?modPath=${encodeURIComponent(mod)}`);
    const d = await r.json();
    // Read the RAW shape before counting — a wrong key here would make every number 0 and every check
    // "pass" for the worst possible reason.
    if (Array.isArray(d.modules)) return d.modules.length;
    if (d.byCategory && typeof d.byCategory === "object") {
      return Object.values(d.byCategory).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    }
    return -1;
  };

  try {
    console.log("\n[control] a mod with NO replace_path sees the base game's modules");
    // FIRST, and it is what makes the numbers below mean anything: if this is 0 the endpoint is broken and
    // every other result is meaningless.
    const plain = await modules(PLAIN);
    rec("the modules catalogue is non-empty for a plain mod", plain > 50, plain);

    console.log("\n[the bug] replacing the PARENT must not hide the subfolder");
    const parent = await modules(PARENT);
    rec("replace_path=common/units leaves the modules subfolder loading", parent === plain, { parent, plain });

    console.log("\n[the other direction] replacing the EXACT folder must still hide it");
    // Without this, "never hide anything" would pass the check above while being just as wrong.
    const exact = await modules(EXACT);
    rec("replace_path=common/units/equipment/modules DOES hide the base game's", exact < plain, { exact, plain });

    console.log(`\n=== replace_path not recursive: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
