// GET /api/mio/traits lists every MIO trait in the mod (token + display name + equipment/production bonuses) so the
// company editor's "add a trait" picker can show real traits instead of the user memorizing tokens. Walks the
// organizations/*.txt `trait = {}` / `add_trait = {}` blocks, deduped by token. Run: node test-mio-traits.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miotraits-modsroot-"));
process.env.HOI4_MODS_ROOT = MODS;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miotraits-mod-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MioTraitsMod"\n');
const orgDir = path.join(mod, "common", "military_industrial_organization", "organizations");
fs.mkdirSync(orgDir, { recursive: true });
fs.writeFileSync(path.join(orgDir, "test_orgs.txt"),
  "NOVA_tank_works = {\n" +
  "\ticon = GFX_idea_x\n" +
  "\tallowed = { original_tag = GER }\n" +
  "\tequipment_type = { medium_tank_chassis }\n" +
  "\tinitial_trait = { name = NOVA_initial equipment_bonus = { reliability = 0.05 } }\n" +
  "\ttrait = {\n\t\ttoken = reliable_tracks\n\t\tname = NOVA_reliable_tracks\n\t\tposition = { x = 0 y = 1 }\n\t\tequipment_bonus = { reliability = 0.10 defense = 0.05 }\n\t}\n" +
  "\ttrait = {\n\t\ttoken = fast_production\n\t\tname = NOVA_fast_production\n\t\tproduction_bonus = { production_efficiency_gain_factor = 0.2 }\n\t}\n" +
  "}\n");
// a loc so the names resolve
const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
fs.writeFileSync(path.join(locDir, "test_l_english.yml"), "﻿l_english:\n NOVA_reliable_tracks:0 \"Reliable Tracks\"\n NOVA_fast_production:0 \"Fast Production\"\n");

const PORT = 3991, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const get = (route) => fetch(`${BASE}${route}`).then((r) => r.json());
  try {
    const d = await get(`/api/mio/traits?modPath=${encodeURIComponent(mod)}`);
    ok("1: endpoint ok", d && d.ok === true, d);
    const traits = (d && d.traits) || [];
    const byTok = Object.fromEntries(traits.map((t) => [t.token, t]));
    ok("2: found the reliable_tracks trait", !!byTok.reliable_tracks, traits.map((t) => t.token));
    ok("2: found the fast_production trait", !!byTok.fast_production, traits.map((t) => t.token));
    ok("3: trait display name resolved from loc", byTok.reliable_tracks && byTok.reliable_tracks.name === "Reliable Tracks", byTok.reliable_tracks);
    ok("3: equipment bonuses captured", byTok.reliable_tracks && byTok.reliable_tracks.equipmentBonus && byTok.reliable_tracks.equipmentBonus.reliability === 0.1 && byTok.reliable_tracks.equipmentBonus.defense === 0.05, byTok.reliable_tracks && byTok.reliable_tracks.equipmentBonus);
    ok("3: production bonus captured", byTok.fast_production && byTok.fast_production.productionBonus && byTok.fast_production.productionBonus.production_efficiency_gain_factor === 0.2, byTok.fast_production && byTok.fast_production.productionBonus);
    // the initial_trait has no token, so it must NOT appear as a pickable trait
    ok("4: token-less initial_trait is not listed", !traits.some((t) => !t.token), traits.filter((t) => !t.token));
    // dedupe by token: add a second file redefining reliable_tracks, expect still one
    fs.writeFileSync(path.join(orgDir, "test_orgs2.txt"), "NOVA_other = {\n\tequipment_type = { x }\n\ttrait = { token = reliable_tracks name = NOVA_reliable_tracks equipment_bonus = { reliability = 0.2 } }\n}\n");
    const d2 = await get(`/api/mio/traits?modPath=${encodeURIComponent(mod)}`);
    ok("5: still ONE reliable_tracks after a redefine (deduped by token)", (d2.traits || []).filter((t) => t.token === "reliable_tracks").length === 1, (d2.traits || []).filter((t) => t.token === "reliable_tracks").length);
  } finally { server.close(); }
  console.log(`\nMIO-TRAITS: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
