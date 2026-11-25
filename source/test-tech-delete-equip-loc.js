// Regression (bug-hunt #21 — LIVE E2E, research tech-maker through the real UI): deleting a tech through
// the editor orphaned its EQUIPMENT's loc key. The deferred-deletion path (/api/technologies/save-batch
// `deletions`) guarded the equipment loc strip with `!equipMap[del.equipId]` — but the client sends its
// WHOLE equipment catalog (kept intact so Undo can restore), so the deleted equipment is always present in
// equipMap and the strip never fired: `<id>_equipment:0 "…"` survived in the .yml forever (tech + _desc keys
// were stripped fine; the equipment BLOCK was removed fine — only its loc leaked). Found by: duplicate
// "Orbital Computing" in the UI → Save → delete the copy → Save → grep. FIX: strip unless a SURVIVING tech
// (in mergedById, deletions already applied) still enables the equipment — so a genuinely shared equipment
// keeps its loc.
// Run: node test-tech-delete-equip-loc.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 200)) : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqloc-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EqLoc"\n');
const app = S.createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
  r.on("error", rej); r.write(data); r.end();
});

const TECH = (id, eq) => ({ id, isMod: true, fileName: "custom_technologies.txt", folder: "infantry_folder", name: id + " name", year: 1936, x: 0, y: 0, researchCost: 1, extraScript: "", enableEquipments: eq ? [eq] : [] });
const EQUIP = (id) => ({ [id]: { id, isMod: true, fileName: "custom_equipment.txt", year: 1936, name: id + " display" } });

server.listen(0, "127.0.0.1", async () => {
  try {
    // seed: two techs — doomed_tech with its own equipment, shared_a + shared_b sharing one equipment
    const equipments = { ...EQUIP("doomed_equipment"), ...EQUIP("shared_equipment") };
    const seed = await post("/api/technologies/save-batch", {
      modPath: mod,
      technologies: [TECH("doomed_tech", "doomed_equipment"), TECH("shared_a", "shared_equipment"), TECH("shared_b", "shared_equipment")],
      equipments, customTabs: [], deletions: [],
    });
    ok("seed batch saved", seed.status < 400, seed.body);
    const locPath = path.join(mod, "localisation", "english", "custom_technologies_l_english.yml");
    const loc = () => { try { return fs.readFileSync(locPath, "utf8"); } catch (_) { return ""; } };
    ok("equipment loc keys written on create", /doomed_equipment:/.test(loc()) && /shared_equipment:/.test(loc()), loc().slice(0, 300));

    // THE BUG: delete doomed_tech with the FULL equipMap still containing its equipment (what the UI sends)
    const del1 = await post("/api/technologies/save-batch", {
      modPath: mod,
      technologies: [], // nothing re-saved
      equipments,       // full catalog incl. the deleted equipment — the Undo-keeps-it shape
      customTabs: [],
      deletions: [{ techId: "doomed_tech", techFile: "custom_technologies.txt", equipId: "doomed_equipment", equipFile: "custom_equipment.txt" }],
    });
    ok("delete batch ok", del1.status < 400, del1.body);
    const techTxt = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
    ok("tech block removed", !/doomed_tech\s*=/.test(techTxt));
    const eqTxt = fs.readFileSync(path.join(mod, "common", "units", "equipment", "custom_equipment.txt"), "utf8");
    ok("equipment block removed", !/doomed_equipment\s*=/.test(eqTxt));
    ok("tech loc stripped", !/(^|\n)\s*doomed_tech:/.test(loc()), loc());
    ok("EQUIPMENT loc stripped (was the orphan)", !/doomed_equipment:/.test(loc()), loc());

    // SHARED equipment: delete shared_a — shared_b still enables shared_equipment → its loc must SURVIVE
    const del2 = await post("/api/technologies/save-batch", {
      modPath: mod,
      technologies: [], equipments, customTabs: [],
      deletions: [{ techId: "shared_a", techFile: "custom_technologies.txt", equipId: "shared_equipment", equipFile: "custom_equipment.txt" }],
    });
    ok("shared delete batch ok", del2.status < 400, del2.body);
    ok("shared equipment loc SURVIVES while shared_b still uses it", /shared_equipment:/.test(loc()), loc());
    ok("shared_a's own tech loc stripped", !/(^|\n)\s*shared_a:/.test(loc()), loc());
  } catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nTECH-DELETE-EQUIP-LOC: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
