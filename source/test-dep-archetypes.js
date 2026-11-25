// Regression test: an add-on that declares dependencies={ "Millennium Dawn..." } must see the BASE MOD's
// equipment archetypes in /api/equipment/archetypes — not just vanilla.
// This guards the dependency-resolution scan path (resolveModDependencyRoots).
//
// ⚠️ MOVED 2026-09-11. This used to read the owner's own add-on in the real Paradox mod folder
// (hellenic_ascendancy) and pinned MD's infantry archetype as `Inf_equipment`. The owner reinstalled Millennium
// Dawn, and the fresh copy declares no `Inf_equipment` — its infantry archetype is `infantry_weapons_type` — so
// "includes MD Inf_equipment" and "…flagged isMod" failed on every commit while the dependency scan still worked:
// every archetype MD declares beyond vanilla's came back, flagged isMod.
//
// Nothing about the question depends on one add-on or one id. The add-on is now built in a temp directory and
// depends on MD by the name MD's own descriptor gives itself (MD resolves through the workshop folder, not the
// mods root), and the archetypes it must see are READ OUT OF MD's FILES: every equipment that declares
// `is_archetype = yes` at its own level, by brace depth, and that vanilla does not also declare. A control add-on
// without the dependency line must see none of them, or the checks prove nothing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deparch-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const PORT = 3497;

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("Bad JSON: " + body.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

// Ids of the equipment in common/units/equipment that declare `is_archetype = yes` at their OWN level — direct
// children of `equipments = {`, found by brace depth with comments masked.
function archetypesIn(root) {
  const out = new Set();
  const dir = path.join(root, "common", "units", "equipment");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return out; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    t = t.replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
    const re = /([A-Za-z0-9_.\-]+)\s*=\s*\{|\{|\}/g;
    let depth = 0, inEquipments = false, id = null, bodyAt = 0, m;
    while ((m = re.exec(t)) !== null) {
      if (m[0] === "}") {
        depth--;
        if (depth === 1 && id) {
          const body = t.slice(bodyAt, m.index);
          let d = 0, own = "";
          for (const ch of body) { if (ch === "{") d++; else if (ch === "}") d--; else if (d === 0) own += ch; }
          if (/(^|\s)is_archetype\s*=\s*yes\b/.test(own)) out.add(id);
          id = null;
        }
        if (depth <= 0) { depth = 0; inEquipments = false; }
        continue;
      }
      if (m[0] !== "{") {
        if (depth === 0) inEquipments = m[1] === "equipments";
        else if (depth === 1 && inEquipments) { id = m[1]; bodyAt = m.index + m[0].length; }
      }
      depth++;
    }
  }
  return out;
}

function addon(name, dependsOn) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.17.*"\n` + (dependsOn ? `dependencies={\n\t"${dependsOn}"\n}\n` : ""), "utf8");
  return dir;
}

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log("  PASS", name); }
    else { fail++; console.log("  FAIL", name, extra != null ? "→ " + extra : ""); }
  };
  const descriptor = path.join(MD, "descriptor.mod");
  if (!fs.existsSync(descriptor) || !fs.existsSync(path.join(MD, "common", "units", "equipment"))) {
    console.log("  SKIPPED — Millennium Dawn is not installed, so there is no dependency to resolve");
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    process.exit(0);
  }
  const mdName = (/\bname\s*=\s*"([^"]+)"/.exec(fs.readFileSync(descriptor, "utf8")) || [])[1] || "";
  const vanillaArch = archetypesIn(VANILLA);
  const mdOwn = [...archetypesIn(MD)].filter((id) => !vanillaArch.has(id)).sort();
  console.log(`  ..   MD ("${mdName}") declares ${mdOwn.length} archetypes vanilla does not, e.g. ${mdOwn.slice(0, 4).join(", ")}`);

  const app = createApp();
  const server = app.listen(PORT, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  try {
    check("MD's descriptor names itself", !!mdName, descriptor);
    check("MD declares archetypes of its own, so the checks below are not vacuous", mdOwn.length > 0, mdOwn.length);

    const withDep = addon("md_addon", mdName);
    const res = await get("/api/equipment/archetypes?modPath=" + encodeURIComponent(withDep));
    check("endpoint ok", res && res.ok === true, JSON.stringify(res).slice(0, 120));
    const byId = new Map((res.archetypes || []).map((a) => [a.id, a]));
    check("returns archetypes", byId.size > 0, "count=" + byId.size);
    const missing = mdOwn.filter((id) => !byId.has(id));
    check("every archetype MD declares reaches the add-on (from the dependency)", missing.length === 0, missing.slice(0, 12).join(","));
    const notMod = mdOwn.filter((id) => byId.has(id) && byId.get(id).isMod !== true);
    check("…each flagged isMod (from the MD dependency, not vanilla)", notMod.length === 0, notMod.slice(0, 12).join(","));

    // CONTROL: the same add-on without the dependency line. If MD's archetypes showed up here too, the checks above
    // would pass for a reason that has nothing to do with dependency resolution.
    const lone = await get("/api/equipment/archetypes?modPath=" + encodeURIComponent(addon("lone_addon", null)));
    const loneIds = new Set((lone.archetypes || []).map((a) => a.id));
    check("CONTROL: an add-on with no dependency still gets the base game's archetypes", loneIds.size > 0, "count=" + loneIds.size);
    const leaked = mdOwn.filter((id) => loneIds.has(id));
    check("CONTROL: …and none of MD's own", leaked.length === 0, leaked.slice(0, 12).join(","));
  } catch (e) {
    fail++; console.log("  FAIL harness error →", e.message);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nDEP-ARCHETYPE TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
