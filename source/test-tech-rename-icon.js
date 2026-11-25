// #tech-rename-icon — a renamed tech left its icon registration behind under the old id.
//
// The tech itself renames correctly: the block moves, the localisation follows, the old id is gone. What did
// not follow was the icon SIDECAR (editor_tech_icons.json), because the merge that records icon choices only
// ever adds. And since interface/nova_tech_icons.gfx is rebuilt wholesale from that sidecar, a stale entry
// meant three orphaned sprite definitions — GFX_<oldId>_medium/_small/_large — pointing at a texture no tech
// references any more.
//
// Harmless to load, and stated as such: this is accumulation, not breakage. Rename a tech ten times and the
// mod carries thirty dead sprites and ten dead sidecar entries.
//
// The other three renames checked in the same pass — decision, tech block, tech localisation — were already
// correct, so this test also pins those, to keep the whole rename story in one place.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-tech-rename-icon-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="p"\nsupported_version="1.19.*"\n');

const techFile = path.join(MOD, "common", "technologies", "custom_technologies.txt");
const sidecar = path.join(MOD, "editor_tech_icons.json");
const gfxFile = path.join(MOD, "interface", "nova_tech_icons.gfx");
const idsOf = () => { try { return [...fs.readFileSync(techFile, "utf8").matchAll(/(?:^|\n)\t([A-Za-z_][\w]*) = \{/g)].map((m) => m[1]); } catch (_) { return []; } };
const readJson = () => { try { return JSON.parse(fs.readFileSync(sidecar, "utf8")); } catch (_) { return {}; } };
const gfx = () => { try { return fs.readFileSync(gfxFile, "utf8"); } catch (_) { return ""; } };
const locAll = () => { try { return fs.readdirSync(path.join(MOD, "localisation", "english")).map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n"); } catch (_) { return ""; } };

const PORT = 39529, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 180));
  const mk = (id, name, extra) => ({
    id, name, description: name + " description", folder: "infantry_folder", x: 1, y: 1,
    researchCost: 1.5, startYear: 1936, prerequisites: [], dependencies: [], enableEquipments: [],
    modifiers: "", extraScript: "", isMod: true, iconKey: "GFX_aa_cannon_3_medium",
    fileName: "custom_technologies.txt", ...(extra || {}),
  });
  // save-batch is the path that maintains the icon sidecar.
  const saveBatch = (technologies) => post("/api/technologies/save-batch", { modPath: MOD, technologies, equipments: [] });

  try {
    const created = await saveBatch([mk("probe_a", "Tech A"), mk("probe_b", "Tech B"), mk("probe_c", "Tech C")]);
    await breathe();
    ok("creating three techs → 200", created.s === 200, created.b);
    ok("…all three are in the file", idsOf().length === 3, idsOf());
    const beforeMap = readJson();
    ok("…and each recorded its icon choice", Object.keys(beforeMap).length === 3, beforeMap);
    ok("…so the .gfx registers a sprite for the middle one", /GFX_probe_b_medium/.test(gfx()), gfx().slice(0, 200));

    // ── rename the middle tech ────────────────────────────────────────────────────────────────────
    await breathe();
    const r = await saveBatch([mk("probe_renamed", "Tech B", { previousId: "probe_b" })]);
    await breathe();
    ok("renaming → 200", r.s === 200, r.b);

    const ids = idsOf();
    ok("…there are still exactly THREE techs", ids.length === 3, ids);
    ok("…the old id is gone", !ids.includes("probe_b"), ids);
    ok("…the new id is there", ids.includes("probe_renamed"), ids);
    ok("…both neighbours survived", ids.includes("probe_a") && ids.includes("probe_c"), ids);

    // THE REGRESSION: the sidecar and the sprites it generates must follow the rename.
    const map = readJson();
    ok("the icon sidecar dropped the old id", !Object.prototype.hasOwnProperty.call(map, "probe_b"), map);
    ok("…and carries the new one", map.probe_renamed === "GFX_aa_cannon_3_medium", map);
    ok("…the neighbours' icon entries are untouched", map.probe_a && map.probe_c, map);

    const g = gfx();
    ok("no orphaned GFX_probe_b_medium remains", !/GFX_probe_b_medium/.test(g), g.slice(0, 300));
    ok("…nor its _small/_large siblings", !/GFX_probe_b_small/.test(g) && !/GFX_probe_b_large/.test(g), g.slice(0, 300));
    ok("…and the renamed tech has its own sprite", /GFX_probe_renamed_medium/.test(g), g.slice(0, 300));

    // localisation follows too (already worked; pinned so the whole rename story lives in one test)
    const loc = locAll();
    ok("the old localisation key is gone", !/(^|\n)\s*probe_b:/.test(loc), loc);
    ok("…and the new one names the tech", /probe_renamed:\d*\s*"Tech B"/.test(loc), loc);

    console.log("\ntest-tech-rename-icon: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
