// ⛔ #the-water-cleanup-keeps-the-files-comments — the erase's last step keeps every comment of map/railways.txt and map/supply_nodes.txt.
//
// fixWaterSupplyRail (map-data.js) is what an erase, Delete map and Auto-fix's water sweep run on the two files: the hub on each drowned
// province goes, and each railway through one is cut there, keeping every stretch of 2 or more. Both passes read every line WHOLE, but
// a `#` starts a comment in both files, as the game reads them (railway_malformed_row says so), and a comment is content:
//
//   · a commented-out row was a row. `#1 3 6747 723 3707`, which the base game ships at map/railways.txt line 883 since its 2026-11-20
//     update, came back from an erase of 6747 as the LIVE row `NaN 2 723 3707` (Number("#1") is NaN), in the mod's own copy of the file;
//   · a commented-out hub was deleted, and counted as a hub removed;
//   · a split row lost its trailing note, and a row with no piece left took its note with it.
//
// Found by the review of group e (B4-1 / B1-28: the page mirrors this step, so the page and the disk must agree on what it does).
// This runs the real fixWaterSupplyRail on a mod of its own, as the erase's Save does (waterIds: the drowned province).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wcc-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const read = (mod, f) => fs.readFileSync(path.join(mod, "map", f), "utf8");

// 1-9, 11, 12 land in state 1 · 10 the land the erase drowns
function buildMod({ nodes, rails }) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wcc-mod-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="WCC"\nreplace_path="history/states"\nreplace_path="map"\n');
  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= 12; i++) rows.push(`${i};${i * 10};0;0;land;false;plains;3;`);
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "supply_nodes.txt"), nodes);
  mk(path.join(mod, "map", "railways.txt"), rails);
  mk(path.join(mod, "map", "buildings.txt"), "1;arms_factory;0.0;9.5;0.0;0.0;0\r\n");
  mk(path.join(mod, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 4 5 6 7 8 9 10 11 12 }\n\thistory = { owner = AAA }\n}\n');
  return mod;
}

try {
  console.log("1. ⛔ AN ERASE KEEPS THE COMMENTS OF BOTH FILES (#the-water-cleanup-keeps-the-files-comments)");
  {
    const RAILS = ["1 3 1 2 3", "#1 3 10 11 12", "2 4 4 10 5 6 # the coast line", "3 2 9 10 # a spur into the bay", ""].join("\r\n");
    const NODES = ["1 1", "#1 10", "1 10 # the harbour hub", ""].join("\r\n");
    const mod = buildMod({ nodes: NODES, rails: RAILS });
    const r = md.fixWaterSupplyRail({ modRoot: mod, waterIds: [10] });
    const rails = read(mod, "railways.txt"), nodes = read(mod, "supply_nodes.txt");
    const rl = rails.split(/\r?\n/), nl = nodes.split(/\r?\n/);
    rec("THE CONTROL: the live hub on the drowned province goes, and the railway through it is split there", !nl.some((l) => /^1 10\b/.test(l.trim())) && rl.some((l) => /^2 2 5 6\b/.test(l)), { rails, nodes });
    rec("⭐⭐⭐ a commented-out row stays a comment, in its place: never written back as a live row", rl[1] === "#1 3 10 11 12", rl);
    const live = rl.map((l) => { const h = l.indexOf("#"); return (h === -1 ? l : l.slice(0, h)).trim(); }).filter(Boolean);
    rec("⭐⭐⭐ …so every live row is still a level, a count and that many province ids (no `NaN 2 11 12`)",
      live.every((l) => { const n = l.split(/\s+/).map(Number); return n.every(Number.isInteger) && n.length === n[1] + 2; }), live);
    rec("⭐⭐ a split row's note stays on its first piece", rl[2] === "2 2 5 6 # the coast line", rl[2]);
    rec("⭐ a row the erase leaves no piece of leaves its note where the row was", rl[3] === "# a spur into the bay", rl[3]);
    rec("⭐⭐ a commented-out hub stays, in its place", nl[1] === "#1 10", nl);
    rec("⭐ …and a removed hub's note stays where its row was", nl[2] === "# the harbour hub", nl[2]);
    rec("⭐⭐ the answer counts what was done: 1 hub removed, 1 railway split, 1 removed (a comment is none of them)",
      r.supplyRemoved === 1 && r.railFixed === 1 && r.railRemoved === 1, r);
    rec("both files keep their CRLF", !/[^\r]\n/.test(rails) && !/[^\r]\n/.test(nodes) && rails.includes("\r\n") && nodes.includes("\r\n"));
  }

  console.log("\n2. A FILE WITH NO COMMENT IS WRITTEN AS IT ALWAYS WAS");
  {
    const mod = buildMod({ nodes: "1 1\r\n1 10\r\n", rails: "1 3 1 2 3\r\n2 4 4 10 5 6\r\n" });
    const r = md.fixWaterSupplyRail({ modRoot: mod, waterIds: [10] });
    rec("THE CONTROL: byte for byte the rewrite it was (`level count ids ` and its trailing space, CRLF kept)",
      read(mod, "railways.txt") === "1 3 1 2 3\r\n2 2 5 6 \r\n" && read(mod, "supply_nodes.txt") === "1 1\r\n", { rails: read(mod, "railways.txt"), nodes: read(mod, "supply_nodes.txt"), r });
  }

  console.log(`\n=== the water cleanup keeps the files' comments: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
