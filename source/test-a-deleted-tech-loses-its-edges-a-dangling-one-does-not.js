// ⛔ #dangling-path-deleted — TWO JOBS WERE RIDING ON ONE RULE, AND ONE OF THEM WAS DELETING THE AUTHOR'S TEXT.
//
// serializeTechnology dropped a `path = { leads_to_tech = X }` edge whenever X was absent from the catalog.
// That is how a DELETED technology's incoming edges are removed — necessary, because a parent left pointing
// at a deleted tech is a dangling edge HOI4 logs as "undefined technology". But absence caught a second case
// with it: a `leads_to_tech` naming a technology NOTHING in the mod's load order defines. Measured across the
// vanilla install and all installed workshop mods: 84 such edges, 61 of them in Novum Vexillum — and a
// no-edit save deleted every one, from files the modder had never touched.
//
// The deletion signal is now explicit: /api/technologies/save-batch strips a deleted id from every payload
// tech's leadsTo and pathMeta before serialization, so what reaches the serializer with an unknown target is
// an authored edge and is kept.
//
// ⚠️ ONLY A DELETION THAT ACTUALLY REMOVED THE BLOCK COUNTS. removeNamedBlockFromFile refuses down five
// paths (missing file, no match, unbalanced braces…), leaving the technology on disk. Treating a refused
// deletion as done would strip the incoming edges of a technology that still exists — the inverse of the
// bug, and worse: the tech stays in the tree with nothing leading to it.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53541;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dangling-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// A parent with TWO authored edges: one to a real tech, one to a tech nothing defines.
const FIXTURE = [
  "technologies = {",
  "",
  "\tprobe_parent = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tpath = {",
  "\t\t\tleads_to_tech = probe_child",
  "\t\t\tresearch_cost_coeff = 1",
  "\t\t}",
  "\t\tpath = {",
  "\t\t\tleads_to_tech = probe_ghost",
  "\t\t\tresearch_cost_coeff = 1",
  "\t\t}",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t\tcategories = { infantry_tech }",
  "\t}",
  "",
  "\tprobe_child = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }",
  "\t\tcategories = { infantry_tech }",
  "\t}",
  "}",
  "",
].join("\n");

const made = [];
function mkMod() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dangling-mod-"));
  made.push(p);
  fs.writeFileSync(path.join(p, "descriptor.mod"), 'name="Dangling Probe"\nsupported_version="1.16.*"\n', "utf8");
  fs.mkdirSync(path.join(p, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(p, "common", "technologies", "probe.txt"), FIXTURE, "utf8");
  return p;
}
const readProbe = (mod) => fs.readFileSync(path.join(mod, "common", "technologies", "probe.txt"), "utf8");

(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const saveBatch = async (mod, deletions) => {
      const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
      // ⚠️ SEND WHAT THE CLIENT SENDS. A technology being DELETED is not also in the technologies payload —
      // sending both is the documented delete-and-recreate case (`recreatedTechIds`), which correctly writes
      // the block straight back. The first version of this test did exactly that and then reported Nova
      // broken for "not deleting" a technology it had been asked to re-create in the same request.
      const deletedIds = new Set((deletions || []).map((d) => d && d.techId).filter(Boolean));
      const mine = (cat.technologies || []).filter((t) => t && t.isMod && !deletedIds.has(t.id))
        .map((t) => JSON.parse(JSON.stringify(t)));
      const res = await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technologies: mine, equipments: cat.equipments || {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: deletions || [], newTechIds: [] }),
      }).then((r) => r.json());
      return { res, mine };
    };

    console.log("1. The fixture has both kinds of edge");
    rec("it authors an edge to a real tech", /leads_to_tech = probe_child/.test(FIXTURE));
    rec("…and one to a tech nothing defines", /leads_to_tech = probe_ghost/.test(FIXTURE));
    rec("…and probe_ghost really is undefined", !/probe_ghost\s*=\s*\{/.test(FIXTURE));

    console.log("\n2. A NO-EDIT save keeps both");
    {
      const mod = mkMod();
      const { mine } = await saveBatch(mod, []);
      rec("both technologies parsed as the mod's own", mine.length === 2, mine.map((t) => t.id));
      const after = readProbe(mod);
      rec("the real edge survives", /leads_to_tech = probe_child/.test(after));
      rec("⭐ the DANGLING edge survives — it is the author's text", /leads_to_tech = probe_ghost/.test(after), after.slice(0, 260));
    }

    console.log("\n3. ⛔ Deleting a technology still removes its incoming edge");
    {
      const mod = mkMod();
      const { res } = await saveBatch(mod, [{ techId: "probe_child", techFile: "probe.txt" }]);
      rec("the save succeeded", res && res.ok !== false, res && res.error);
      const after = readProbe(mod);
      rec("the deleted technology's block is gone", !/probe_child\s*=\s*\{/.test(after), after.slice(0, 200));
      rec("⭐ …and the parent's path to it is gone", !/leads_to_tech = probe_child/.test(after), after.slice(0, 260));
      rec("…while the dangling edge is still untouched", /leads_to_tech = probe_ghost/.test(after), after.slice(0, 260));
    }

    console.log("\n4. ⚠️ A REFUSED deletion must not strip anything");
    {
      // A wrong techFile is one of the five ways removeNamedBlockFromFile refuses; the technology stays.
      const mod = mkMod();
      const { res } = await saveBatch(mod, [{ techId: "probe_child", techFile: "no_such_file.txt" }]);
      rec("the save still succeeded", res && res.ok !== false, res && res.error);
      const after = readProbe(mod);
      rec("the technology is still there", /probe_child\s*=\s*\{/.test(after));
      rec("⭐ …so its incoming edge is still there too", /leads_to_tech = probe_child/.test(after), after.slice(0, 260),
      );
      rec("…and the dangling edge as well", /leads_to_tech = probe_ghost/.test(after));
    }

    console.log("\n5. The endpoint strips from the payload, not from the catalog alone");
    const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    rec("the deleted set is built only from successful removals",
      /mergedById\.delete\(del\.techId\);[\s\S]{0,600}?deletedTechIds\.add\(del\.techId\);/.test(SERVER),
      "building it from the request would count a REFUSED deletion as done");
    rec("…and leadsTo is filtered by it", /t\.leadsTo = t\.leadsTo\.filter\(\(id\) => !deletedTechIds\.has\(id\)\)/.test(SERVER));
    rec("…and pathMeta too", /if \(deletedTechIds\.has\(id\)\) delete t\.pathMeta\[id\]/.test(SERVER),
      "leaving pathMeta behind would keep a coeff for an edge that no longer exists");

    console.log(`\n=== a deleted tech loses its edges, a dangling one does not: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
