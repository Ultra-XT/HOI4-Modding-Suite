// MIO org ids are GLOBAL, but writeMioToFile only upserts within its ONE target file (nova_mio.txt by default).
// So creating an MIO whose id already lives in a DIFFERENT file silently appended a SECOND top-level block:
//   · another file in the SAME mod  -> a duplicate id the game must arbitrate.
//   · a base-game / dependency file -> the mod loads last, so the fresh (Nova-modelled) block OVERRIDES the
//     original and DROPS every un-modeled key MD ships (visible/available/add_trait/on_complete/ai_will_do).
// The create endpoint now guards this like the equipment-family creator: a same-FILE re-save is a legitimate
// in-place edit (allowed + merged), but a cross-file or inherited-id collision is refused with a clear message.
// Run: node test-mio-dup-id.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

// A temp mods-root (read at module load) so the add-on's dependency resolves.
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miodup-modsroot-"));
process.env.HOI4_MODS_ROOT = MODS;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const orgDirOf = (root) => path.join(root, "common", "military_industrial_organization", "organizations");

// Dependency mod with one MIO org — the add-on inherits it.
const dep = path.join(MODS, "depmiomod");
fs.mkdirSync(orgDirOf(dep), { recursive: true });
fs.writeFileSync(path.join(dep, "descriptor.mod"), 'name="DepMioMod"\n');
fs.writeFileSync(path.join(orgDirOf(dep), "dep_orgs.txt"),
  "DEP_acme_org = {\n\ticon = GFX_idea_x\n\tallowed = { original_tag = USA }\n\tequipment_type = { mio_cat_eq_x }\n\tinitial_trait = { name = DEP_acme_org_initial }\n}\n");
fs.writeFileSync(path.join(MODS, "depmiomod.mod"), `name="DepMioMod"\npath="${dep.replace(/\\/g, "/")}"\n`);

// Add-on that DEPENDS on the dep.
const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miodup-addon-"));
fs.writeFileSync(path.join(addon, "descriptor.mod"), 'name="Addon"\ndependencies={ "DepMioMod" }\n');
fs.mkdirSync(orgDirOf(addon), { recursive: true });
// A pre-existing mod-owned org in a NON-default file (simulates MD shipping MD_USA_*.txt, or an earlier custom save).
fs.writeFileSync(path.join(orgDirOf(addon), "other_orgs.txt"),
  "ADDON_other = {\n\ticon = GFX_idea_y\n\tallowed = { original_tag = USA }\n\tequipment_type = { mio_cat_eq_y }\n}\n");

const PORT = 3985, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mkMio = (id, extra) => Object.assign({ modPath: addon, id, name: id, allowedTag: "USA", equipmentType: ["mio_cat_eq_z"] }, extra || {});
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const novaMio = () => { const p = path.join(orgDirOf(addon), "nova_mio.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
  const countTop = (txt, id) => (txt.match(new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`, "g")) || []).length;
  try {
    // ── (1) A brand-new id writes fine, and a SAME-FILE re-save is a legitimate in-place edit (upsert, not dup) ──
    const c1 = await post("/api/mio", mkMio("ADDON_acme"));
    ok("1a: first create of a fresh id succeeds", c1 && c1.ok === true, c1);
    const c2 = await post("/api/mio", mkMio("ADDON_acme", { icon: "GFX_idea_reliability" }));
    ok("1b: same-file re-save of the same id is ALLOWED (in-place edit)", c2 && c2.ok === true, c2);
    ok("1c: only ONE ADDON_acme block exists (merged, not duplicated)", countTop(novaMio(), "ADDON_acme") === 1, countTop(novaMio(), "ADDON_acme"));

    // ── (2) An id that lives in ANOTHER file of the SAME mod is refused (would duplicate) ──
    const c3 = await post("/api/mio", mkMio("ADDON_other")); // client always targets nova_mio.txt
    ok("2a: cross-file same-mod collision is REJECTED", c3 && c3.ok === false, c3);
    ok("2b: the error names the file it already lives in", c3 && /other_orgs\.txt/.test(String(c3.error || "")), c3 && c3.error);
    ok("2c: NO second ADDON_other block was appended to nova_mio.txt", countTop(novaMio(), "ADDON_other") === 0, novaMio());

    // ── (3) An id defined by a DEPENDENCY is refused (would strip-override the inherited org) ──
    const c4 = await post("/api/mio", mkMio("DEP_acme_org"));
    ok("3a: inherited (dependency) id collision is REJECTED", c4 && c4.ok === false, c4);
    ok("3b: the error explains it's an inherited/base-game org", c4 && /base game or a dependency/i.test(String(c4.error || "")), c4 && c4.error);
    ok("3c: nova_mio.txt did NOT get a stripped DEP_acme_org override", countTop(novaMio(), "DEP_acme_org") === 0, novaMio());
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(addon, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(MODS, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMIO-DUP-ID: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
