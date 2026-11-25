// Nova keeps four editor sidecars inside a mod — editor_tech_icons.json, editor_equip_icons.json,
// editor_custom_tabs.json and editor_research_preview.json. They are generated data: not written by the
// modder, not read by the game, and easy to damage without anyone noticing.
//
// Damage is realistic rather than theoretical here. These live inside the mod folder, and mod folders sit
// in Documents, which on this machine (and plenty of others) is synced by OneDrive — half-written files,
// conflict copies and truncation are ordinary events. A crash mid-write does the same.
//
// The rule this pins: a damaged sidecar must degrade to "no saved preference", never take a page down.
// A modder whose Research tab refuses to open because a cache file got truncated has no way to guess
// what is wrong, and the sidecar holds nothing they cannot simply pick again.
//
// Each file is corrupted several ways in turn — truncated JSON, valid JSON of the wrong shape, an empty
// file, and binary noise — and the endpoints that read them must keep answering.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-sidecar-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "sidecar_probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SidecarProbe"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "common", "technologies", "custom_technologies.txt"),
  "technologies = {\n\tzz_probe_tech = {\n\t\tresearch_cost = 2\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 1 y = 1 } }\n\t}\n}\n");

const SIDECARS = [
  "editor_tech_icons.json",
  "editor_equip_icons.json",
  "editor_custom_tabs.json",
  "editor_research_preview.json",
];

// The shapes a synced or half-written file actually takes.
const CORRUPTIONS = [
  ["truncated JSON", '{"zz_probe_tech": "GFX_inf'],
  ["valid JSON, wrong shape", '"just a string"'],
  ["valid JSON, wrong container", "[1,2,3]"],
  ["an empty file", ""],
  ["whitespace only", "   \n\t\n"],
  ["binary noise", "\u0000\u00ff\u00fe binary \u0000 noise"],
  ["a JSON null", "null"],
];

const clearSidecars = () => {
  for (const f of SIDECARS) { try { fs.unlinkSync(path.join(MOD, f)); } catch (_) {} }
};

const PORT = 39661, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep)
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }))
    .catch((e) => ({ s: 0, b: null, err: e.message }));
  const mp = encodeURIComponent(MOD);

  try {
    // A healthy baseline first — otherwise "it still answered" proves nothing.
    clearSidecars();
    const base = await get(`/api/technologies/catalog?modPath=${mp}`);
    ok("the tech catalog answers with no sidecars at all", base.s === 200 && !!base.b, base.s);
    const baseTechs = ((base.b && (base.b.technologies || base.b.techs)) || []).length;
    ok("…and finds the mod's tech", baseTechs >= 1, baseTechs);

    for (const file of SIDECARS) {
      for (const [label, content] of CORRUPTIONS) {
        clearSidecars();
        fs.writeFileSync(path.join(MOD, file), content, "utf8");

        const cat = await get(`/api/technologies/catalog?modPath=${mp}`);
        ok(`${file} — ${label} — the catalog still answers`, cat.s === 200 && !!cat.b, { s: cat.s, err: cat.err });
        const n = ((cat.b && (cat.b.technologies || cat.b.techs)) || []).length;
        ok(`   …and still finds the mod's tech`, n >= 1, n);

        const ct = await get(`/api/technologies/country-techs?modPath=${mp}&tag=GER`);
        ok(`   …country-techs still answers`, ct.s === 200 && !!ct.b, { s: ct.s, err: ct.err });

        // The damaged file must not be silently "repaired" into something equally wrong — leaving it
        // alone is fine, rewriting it with junk is not.
        const after = fs.readFileSync(path.join(MOD, file), "utf8");
        ok(`   …and the damaged file was not rewritten with junk`, after === content, after.slice(0, 40));
      }
    }

    // Finally: with the sidecars healthy again, everything still works — so the checks above were not
    // passing because the endpoints ignore these files entirely.
    clearSidecars();
    fs.writeFileSync(path.join(MOD, "editor_tech_icons.json"), JSON.stringify({ zz_probe_tech: "GFX_infantry_weapons_medium" }, null, 2));
    const healthy = await get(`/api/technologies/catalog?modPath=${mp}`);
    ok("a VALID tech-icon sidecar is read back", healthy.s === 200, healthy.s);
    const tech = ((healthy.b && (healthy.b.technologies || healthy.b.techs)) || []).find((t) => t.id === "zz_probe_tech");
    ok("…and its icon choice reaches the tech", !!tech && /infantry_weapons/.test(String(tech.iconKey || "")), tech && tech.iconKey);

    console.log("\ntest-sidecar-corruption: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
