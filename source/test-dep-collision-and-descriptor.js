// Two descriptor findings recorded 2026-08-02, still real on re-verification.
//
// #country-name-collides-with-dep — the starter-mod creator's country-filename collision guard was passed an
// EMPTY dependency list, so it only dodged collisions with vanilla. Creating a starter mod on top of
// Millennium Dawn with a country named "Aceh" wrote common/countries/Aceh.txt, which shadow-replaces MD's
// own file wholesale. 202 of MD's 471 country filenames exist only in MD, so a vanilla-only check misses
// every one of them. The sibling endpoint /api/countries/create already resolved the dependencies here and
// correctly produced Aceh_NVD.txt — a guard adopted by one caller and not the other, again.
//
// #dep-without-descriptor — /api/mods/list falls back to the folder name when a directory has no
// descriptor.mod, and the base-mod dropdown offered those rows as dependency targets. But a dependency is
// matched on the descriptor's `name`, so depending on such a folder wrote a descriptor pointing at nothing
// and failed silently. One real Workshop folder on this machine is in that state.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depcol-"));
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

// A dependency mod that owns a country file with a distinctive name.
const DEP = path.join(ROOT, "NovaDepBase");
fs.mkdirSync(path.join(DEP, "common", "countries"), { recursive: true });
fs.writeFileSync(path.join(DEP, "descriptor.mod"),
  'version="1"\nname="NovaDepBase"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(DEP, "common", "countries", "Zzacehia.txt"),
  "graphical_culture = western_european_gfx\n", "utf8");

// A folder with NO descriptor.mod — the shape of the real Workshop folder that caused the second finding.
const GHOST = path.join(ROOT, "ghost_folder_no_descriptor");
fs.mkdirSync(path.join(GHOST, "common"), { recursive: true });

const PORT = 42511;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  const countryFiles = (modDir) => {
    try { return fs.readdirSync(path.join(modDir, "common", "countries")); } catch (_) { return []; }
  };

  try {
    console.log("\n[the bug] a starter mod must not shadow its DEPENDENCY's country file");
    let r = await post("/api/mod/create-template", {
      modName: "DepCollisionProbe", countryName: "Zzacehia", countryTag: "ZQA", capitalStateId: 1,
      dependencies: ["NovaDepBase"],
    });
    rec("the starter mod was created", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const created = path.join(ROOT, "DepCollisionProbe");
    const files = countryFiles(created);
    rec("a country file was written", files.length > 0, files);
    // THE DAMAGE: writing Zzacehia.txt replaces the dependency's file of that name outright.
    rec("…and it does NOT shadow the dependency's Zzacehia.txt", !files.includes("Zzacehia.txt"), files);
    rec("…while still being recognisably that country", files.some((f) => /^Zzacehia/i.test(f)), files);
    rec("the dependency's own file is untouched",
      fs.existsSync(path.join(DEP, "common", "countries", "Zzacehia.txt")), "dependency file gone");

    console.log("\n[control] a name nothing else uses is written plainly");
    // Without this, "always rename" would pass the check above while being needless churn.
    r = await post("/api/mod/create-template", {
      modName: "FreeNameProbe", countryName: "Qqxxzzland", countryTag: "ZQB", capitalStateId: 1,
      dependencies: ["NovaDepBase"],
    });
    rec("the second starter mod was created", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const free = countryFiles(path.join(ROOT, "FreeNameProbe"));
    rec("…and its country file keeps the plain name", free.includes("Qqxxzzland.txt"), free);

    console.log("\n[descriptor-less folders] cannot be depended on, so say so");
    const list = await (await fetch(`http://127.0.0.1:${PORT}/api/mods/list`)).json();
    const rows = (list.mods || []).filter((m) => !m.isVanilla);
    const ghost = rows.find((m) => String(m.path || "").replace(/\\/g, "/").endsWith("ghost_folder_no_descriptor"));
    const dep = rows.find((m) => m.name === "NovaDepBase");
    rec("the descriptor-less folder is still listed", !!ghost, rows.map((m) => m.name));
    // It stays listed because it can be a fine EDIT target — it just cannot be a dependency.
    rec("…and flagged as having no descriptor", !!ghost && ghost.hasDescriptor === false, ghost);
    rec("a real mod is flagged as having one", !!dep && dep.hasDescriptor === true, dep);

    console.log(`\n=== dep collision and descriptor: ${checks} checks, ${fails.length} failed ===`);
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
