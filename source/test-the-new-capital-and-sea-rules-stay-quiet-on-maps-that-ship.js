// #a-validator-must-not-cry-wolf — ASKED OF THE TWO MAP RULES ADDED IN THE T39 MERGE, AND OF THE CAPITAL RULE'S AUTO-FIX, ON EVERY INSTALLED MAP.
//
//   capital_state_has_no_victory_point (#a-capital-state-keeps-a-victory-point) — a warning, and an Auto-fix that WRITES a victory point into the
//     state files of the map it is asked of (fixCapitalStatesWithNoVictoryPoint), copying in a state the mod inherits;
//   lone_sea_nobody_uses (#a-lone-sea-nobody-uses) — a warning, and an Auto-fix that makes the sea land (fixLoneSeas, whose targets are
//     loneSeasNobodyUses: what the rule names is what the repair takes).
//
// Neither had a corpus test: the census lived in comments (map-data.js), the capital rule's message typed the base game's "(0 of 89)", and the review
// of the merge (C-F1, C-F2) found the capital rule firing on two shipping maps the game loads — Rise of Nations 1 (ACR 912) and Hearts of Minecraft
// 4 (AEP 686, ANP 608, NIC 672, TSL 464) — where 4 of the 5 capitals already stood where its point would go: a state of one province, or one whose
// first province is its only hub. Auto-fix then wrote points into the shipping mod's state files and moved no capital.
//
// So this asks, per map, read-only (nothing is written; Auto-fix is asked as its dry run):
//   · the capitals with no victory point (the census), what the rule reports of them, and what Auto-fix would give: the two are the same list;
//   · ⭐ C-F1, derived from each map's own files, not typed: no capital is reported whose state has one province, or whose first province holds the
//     state's only supply hub (a hub is the first place the repair stands a point), and every one reported names a province other than its first;
//   · the rule's message names that province, and says nothing of "usually off the railway" or a typed count;
//   · the lone seas the rule names.
// ⚠️ THE CEILING IS LOOSE ON PURPOSE (test-the-new-map-fixers-stay-silent-on-maps-that-work.js says why: an exact corpus count rots the day a Workshop
// mod updates). It fails on a regression — a rule that starts firing in the dozens on content that ships and plays — not on a map that carries one.
// The census is printed, not pinned. Maps are derived from disk: the base game, and every Workshop mod that ships its own map/definition.csv.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-new-rules-corpus-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0, skips = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const skip = (why) => { console.log("  skip " + why); skips++; };

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
// an order of magnitude above the measured corpus maximum (1 capital, 0 lone seas, 2026-11-04)
const CEILING = 10;

const maps = [{ p: GAME, n: "vanilla" }];
try {
  for (const e of fs.readdirSync(WORKSHOP, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(WORKSHOP, e.name);
    if (!fs.existsSync(path.join(p, "descriptor.mod")) || !fs.existsSync(path.join(p, "map", "definition.csv"))) continue;
    let n = e.name;
    try { n = (/^name\s*=\s*"([^"]*)"/m.exec(fs.readFileSync(path.join(p, "descriptor.mod"), "utf8")) || [])[1] || e.name; } catch (_) {}
    maps.push({ p, n: n.slice(0, 40) });
  }
} catch (_) { /* no workshop folder on this machine */ }

console.log("=== the capital and lone-sea rules, and the capital rule's Auto-fix, asked of the maps that ship ===");
if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  skip("the base game is not installed here — NOTHING in this file ran");
  maps.length = 0;
} else if (maps.length === 1) skip("no workshop map mods are installed — only the base game was checked, so the corpus half did NOT run");

const census = [];
for (const m of maps) {
  const ctx = { modRoot: m.p, gameRoot: GAME, dependencyRoots: [] };
  let model = null, err = "";
  try { model = md.buildMapModel({ ...ctx, cacheStableLayers: true }); } catch (e) { err = String((e && e.message) || e); }
  if (!model) { skip(`${m.n} could not be read (${err.slice(0, 60)}) — it was NOT checked`); continue; }
  const byId = new Map((model.states || []).map((s) => [s.id, s]));
  const owners = new Set((model.states || []).map((s) => s.owner).filter(Boolean));
  const capitals = Object.keys(model.capitals || {}).filter((t) => owners.has(t)).length;
  const none = md.capitalStatesWithNoVictoryPoint(model);
  const reported = md.capitalStatesTheRuleReports(model);
  const would = (md.fixCapitalStatesWithNoVictoryPoint({ ...ctx, dryRun: true }).would || []);
  const row = md.validateMapModel(model).find((p) => p.rule === "capital_state_has_no_victory_point") || null;
  const lone = md.loneSeasNobodyUses({ ...ctx, model });
  census.push(`${m.n}: ${none.length} of ${capitals} land-owning capitals have no victory point (${none.map((c) => `${c.tag} ${c.state}`).join(", ") || "none"}); reported ${reported.length}${reported.length ? ` (${reported.map((c) => `${c.tag} ${c.state}: ${c.first} -> ${c.province} on ${c.on}`).join(", ")})` : ""}; lone seas ${lone.length}`);

  rec(`${m.n}: the capital rule reports ${reported.length} — under the ceiling`, reported.length <= CEILING, { reported: reported.length, ceiling: CEILING });
  rec(`${m.n}: Map Errors' row says the same count`, (row ? row.total : 0) === reported.length, { row: row && row.total, reported: reported.length });
  rec(`${m.n}: Auto-fix would give exactly the capitals the rule reports, and no other`,
    JSON.stringify(would.map((c) => [c.tag, c.state, c.province])) === JSON.stringify(reported.map((c) => [c.tag, c.state, c.province])), { would, reported });
  // ⭐ C-F1, derived from the map's own files
  const hubs = new Set((model.supplyNodes || []).map((h) => Number(h.province)));
  const quiet = none.filter((c) => {
    const provs = ((byId.get(c.state) || {}).provinces || []).map(Number);
    return provs.length === 1 || (hubs.has(provs[0]) && !provs.slice(1).some((p) => hubs.has(p)));
  });
  const loud = quiet.filter((c) => reported.some((r) => r.tag === c.tag && r.state === c.state));
  rec(`${m.n}: ⭐⭐⭐ no capital is reported whose state has one province, or whose first province holds its only supply hub (${quiet.length} such capital${quiet.length === 1 ? "" : "s"} with no victory point here)`,
    loud.length === 0, loud.map((c) => `${c.tag} ${c.state}`));
  rec(`${m.n}: ⭐ every capital reported has its point going to a province other than its first`, reported.every((c) => c.province > 0 && c.province !== c.first), reported.filter((c) => !(c.province > 0 && c.province !== c.first)));
  if (row) rec(`${m.n}: ⭐ the message names where the point goes, and types no count and no "usually"`,
    row.message.includes(`(here ${row.items[0].firstProvince}), not ${row.items[0].province}, `) && !/usually off the railway/.test(row.message) && !/\(\d+ of \d+\)/.test(row.message), row.message);
  rec(`${m.n}: the lone-sea rule names ${lone.length} sea${lone.length === 1 ? "" : "s"} — under the ceiling`, lone.length <= CEILING, { lone: lone.slice(0, 10), ceiling: CEILING });
}
console.log("\n" + census.map((l) => "  census  " + l).join("\n"));

try { fs.rmSync(APPDATA_DIR, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== the new rules stay quiet on maps that ship: ${pass} ok, ${fails.length} failed, ${skips} skipped ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
