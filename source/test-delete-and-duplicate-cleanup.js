// Two "the fix exists next door and this caller never adopted it" findings from the audit-mod sweep.
//
// #tech-delete-orphans-icon — DELETING A TECHNOLOGY LEFT ITS ICON BEHIND FOREVER.
// nova_tech_icons.gfx is rebuilt wholesale from an editor sidecar, so a stale sidecar entry leaves three dead
// sprite definitions — GFX_<id>_medium/_small/_large — pointing at a texture no technology references any
// more. The SAVE path already removes the entry for a RENAME (#tech-rename-icon); delete never got the same
// call. Harmless to load, but nothing ever removes them: delete ten techs and the mod carries thirty dead
// sprites and ten dead sidecar entries.
//
// #character-duplicate-token-create — CREATING A CHARACTER ON A TOKEN THE MOD ALREADY USES SAID NOTHING.
// Renaming ONTO an existing token is correctly refused. Creating one was allowed with HTTP 200 and an empty
// refWarning, so the mod defined the id twice in two files, /api/characters/list returned it under both, the
// sidebar showed it twice, and clicking either card edited a different block. Which one HOI4 keeps is load-
// order dependent.
//
// The two are treated differently ON PURPOSE, and the asymmetry is the interesting part: a rename would
// DESTROY the other character (one where there were two), so it refuses; a create leaves both blocks intact,
// so it warns. Nothing is lost either way — but refusing a create could block a legitimate save of a
// character whose home file Nova resolved differently.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupdel-"));
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

const MOD = path.join(ROOT, "dupdel");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DupDel"\nsupported_version="1.19.*"\n', "utf8");

const sidecarPath = () => {
  for (const p of [
    path.join(MOD, "editor_tech_icons.json"),
  ]) if (fs.existsSync(p)) return p;
  return "";
};
const gfxText = () => {
  for (const p of [
    path.join(MOD, "interface", "nova_tech_icons.gfx"),
    path.join(MOD, "interface", "nova", "nova_tech_icons.gfx"),
  ]) if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  return "";
};

const PORT = 43231;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[setup] a technology that carries a picked icon");
    let r = await post("/api/technologies/save-batch", {
      technologies: [{
        id: "nua_icon_probe", folder: "infantry_folder", x: 0, y: 0, researchCost: 1, startYear: 1936,
        prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
        enableEquipments: [], categories: ["infantry_tech"],
        fileName: "nua_arclight.txt", isMod: true, leadsTo: [], pathMeta: {},
        iconKey: "GFX_technology_generic_infantry",
      }],
    });
    rec("the tech saved", r.s === 200 && !r.b.error, r.b || r.s);
    const sc = sidecarPath();
    rec("an icon sidecar exists", !!sc, { looked: "editor_tech_icons.json", present: fs.readdirSync(MOD) });
    if (sc) {
      rec("…and it records the tech", /nua_icon_probe/.test(fs.readFileSync(sc, "utf8")), fs.readFileSync(sc, "utf8").slice(0, 200));
    }
    // The SIDECAR is the mechanism and therefore what this pins: interface/nova_tech_icons.gfx is rebuilt
    // wholesale from it, so an entry that is never removed is what leaves GFX_<id>_medium/_small/_large
    // behind. This bare fixture has no vanilla sprite context, so the picked icon resolves to no texture and
    // no .gfx is emitted at all — asserting one exists here would be asserting something about the fixture
    // rather than about the fix. The post-delete check below still holds either way.
    const gfxBefore = gfxText();
    rec("…and if a managed .gfx was emitted, it names the tech",
      !gfxBefore || /GFX_nua_icon_probe/.test(gfxBefore), gfxBefore.slice(0, 300));

    console.log("\n[the bug] deleting the tech must take its icon with it");
    r = await post("/api/technologies/delete", { techId: "nua_icon_probe", techFile: "nua_arclight.txt" });
    rec("the delete succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    const techTxt = (() => { try { return fs.readFileSync(path.join(MOD, "common", "technologies", "nua_arclight.txt"), "utf8"); } catch (_) { return ""; } })();
    rec("…the tech block is gone", !/nua_icon_probe\s*=\s*\{/.test(techTxt), techTxt.slice(0, 200));
    if (sc) {
      rec("…the sidecar entry is gone too", !/nua_icon_probe/.test(fs.readFileSync(sc, "utf8")),
        fs.readFileSync(sc, "utf8").slice(0, 200));
    }
    const gfxAfter = gfxText();
    rec("…and so are all three sprite definitions",
      !/GFX_nua_icon_probe_medium/.test(gfxAfter) &&
      !/GFX_nua_icon_probe_small/.test(gfxAfter) &&
      !/GFX_nua_icon_probe_large/.test(gfxAfter), gfxAfter.slice(0, 400));
    rec("…and the .gfx is still brace-balanced", (() => {
      let d = 0; for (const ch of gfxAfter) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) return false; } } return d === 0;
    })(), gfxAfter.slice(0, 200));

    console.log("\n[the bug] creating a character on a token the mod already defines must say so");
    fs.writeFileSync(path.join(MOD, "common", "characters", "existing.txt"), `characters = {
\tNUA_ivo_marek = {
\t\tname = NUA_ivo_marek
\t\tportraits = {
\t\t\tcivilian = {
\t\t\t\tlarge = "GFX_first"
\t\t\t}
\t\t}
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t}
\t}
}
`, "utf8");
    r = await post("/api/characters/save", {
      token: "NUA_ivo_marek", name: "Ivo Marek", file: "second.txt",
      roleLeader: true, leaderIdeology: "despotism", portraitLarge: "GFX_second",
    });
    rec("the save is allowed (nothing is destroyed)", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…but it WARNS that the mod now defines the token twice",
      /already defines/.test(String(r.b.refWarning || "")), r.b.refWarning);
    rec("…and names the other file", /existing\.txt/.test(String(r.b.refWarning || "")), r.b.refWarning);
    rec("…and the original block is untouched",
      /GFX_first/.test(fs.readFileSync(path.join(MOD, "common", "characters", "existing.txt"), "utf8")),
      "the other file was modified");

    console.log("\n[control] an ordinary save of an EXISTING character must not cry wolf");
    r = await post("/api/characters/save", {
      token: "NUA_ivo_marek", name: "Ivo Marek", file: "existing.txt",
      roleLeader: true, leaderIdeology: "despotism", portraitLarge: "GFX_first",
    });
    rec("the ordinary save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…with no duplicate-token warning", !/already defines/.test(String(r.b.refWarning || "")), r.b.refWarning);

    console.log(`\n=== delete + duplicate cleanup: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
