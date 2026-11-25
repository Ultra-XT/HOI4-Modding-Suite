// The water cleanup must not delete what Nova's own validator calls legal, and must not invent a railway
// that jumps a gap. #the-water-cleanup-keeps-legal-lakes-and-splits-railways
//
// TWO DEFECTS IN fixWaterSupplyRail, both reported to the user as repairs.
//
// ⛔ 1. A LAKE THAT BELONGS TO A STATE IS LEGAL. _supplyRailProvinceError (the write guard) and the validator's
// badRef agree, and say why: "Millennium Dawn ships a supply node on a LAKE province that belongs to a state
// (prov 3698 / state 667) and loads fine." Sea is always bad; ANY water or land with no state is the
// divide-by-zero crash; a lake WITH a state is fine. The Auto-fix sweep treated every lake as water to
// scrub, so clicking Auto-fix for an unrelated problem deleted a supply hub the validator had just called
// valid — and the result read "cleared 1 supply node(s) off water".
//
// ⛔ 2. A RAILWAY IS A PATH, NOT A SET. Stripping a water province from the MIDDLE of a railway joined the two
// sides: `2 4 3` with 4 gone became `2 3`, asserting a direct link between 2 and 3 that the original line
// only made by running through 4. The overnight audit measured that on vanilla geometry the two survivors
// are not adjacent 96.5% of the time, and the wiki lists "a very disjointed railway definition" among the
// invalid definitions. The repair is to SPLIT at the gap and keep each run that still has two provinces.
//
// ⚠️ The existing test-map-water-supply-rail.js is NOT wrong about lakes: its lake 5 belongs to no state, so
// removing that node is correct under both guards. What it did pin was the join, `1 2 2 3`, which moves here.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wc-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const lines = (mod, f) => fs.readFileSync(path.join(mod, "map", f), "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

// 1,2,3,7,8 land in state 1 · 4 sea · 5 lake IN state 1 · 6 lake in NO state
function buildMod({ nodes, rails }) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wc-mod-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="WC"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;10;0;0;land;false;plains;3;",
    "2;20;0;0;land;false;plains;3;",
    "3;30;0;0;land;false;plains;3;",
    "4;40;0;0;sea;false;ocean;0;",
    "5;50;0;0;lake;false;lakes;0;",
    "6;60;0;0;lake;false;lakes;0;",
    "7;70;0;0;land;false;plains;3;",
    "8;80;0;0;land;false;plains;3;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "supply_nodes.txt"), nodes);
  mk(path.join(mod, "map", "railways.txt"), rails);
  mk(path.join(mod, "map", "buildings.txt"), "1;arms_factory;0.0;9.5;0.0;0.0;0\r\n");
  mk(path.join(mod, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 5 7 8 }\n\thistory = { owner = AAA }\n}\n');
  return mod;
}

try {
  console.log("1. ⛔ A supply hub on a lake that belongs to a state survives Auto-fix");
  {
    const mod = buildMod({ nodes: "1 2\n1 4\n1 5\n1 6\n", rails: "1 2 1 2 \n" });
    // The two guards Nova already has, asked directly, so the fixer is held to THEIR answer.
    const guard5 = md.writeSupplyNode({ modRoot: mod, action: "add", province: 5, level: 1 });
    rec("the write guard accepts a hub on lake 5 (it has a state) — only 'already has one' refuses it",
      !guard5.error || /already/i.test(guard5.error), guard5.error);
    const probs = md.validateMapModel(md.buildMapModel({ modRoot: mod }));
    const bad = (probs.find((p) => p.rule === "supply_node_bad_province") || {}).provinces || [];
    rec("the validator calls lake 5 fine", !bad.includes(5), bad);
    rec("…and calls sea 4 and stateless lake 6 bad", bad.includes(4) && bad.includes(6), bad);

    const r = md.fixWaterSupplyRail({ modRoot: mod });
    const sn = lines(mod, "supply_nodes.txt");
    rec("⭐⭐⭐ the hub on lake 5 (in a state) is KEPT", sn.includes("1 5"), sn);
    rec("⭐⭐ …the hub on sea 4 is removed", !sn.includes("1 4"), sn);
    rec("⭐⭐ …the hub on stateless lake 6 is removed", !sn.includes("1 6"), sn);
    rec("…the land hub is untouched", sn.includes("1 2"), sn);
    rec("…and the fixer counts exactly the two it removed", r.supplyRemoved === 2, r);

    const after = md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.rule === "supply_node_bad_province");
    rec("⭐ the fixer and the validator now agree: nothing left to report", after.length === 0, after.map((p) => p.provinces));
  }

  console.log("\n2. ⭐⭐⭐ A railway through water is SPLIT at the gap, never joined across it");
  {
    const mod = buildMod({ nodes: "1 2\n", rails: "1 5 1 2 4 7 8 \n1 3 2 4 3 \n" });
    const r = md.fixWaterSupplyRail({ modRoot: mod });
    const rw = lines(mod, "railways.txt");
    rec("⭐⭐⭐ no row joins the two sides of the gap", !rw.some((l) => /^\d+ \d+ .*\b2 7\b/.test(l)), rw);
    rec("⭐⭐ the run before the water survives as its own railway (1-2)", rw.includes("1 2 1 2"), rw);
    rec("⭐⭐ the run after the water survives as its own railway (7-8)", rw.includes("1 2 7 8"), rw);
    rec("⭐⭐ `2 4 3` does NOT become `2 3` — each side is one province, so it goes", !rw.some((l) => /^1 2 2 3$/.test(l)), rw);
    rec("…nothing still runs through sea 4", !rw.some((l) => l.split(/\s+/).slice(2).includes("4")), rw);
    rec("…and the level is carried onto every surviving run", rw.every((l) => l.startsWith("1 ")), rw);
    rec("the report counts what it did", r.railFixed >= 1 && r.railRemoved >= 1, r);
  }

  console.log("\n3. ⚠️ A railway through a lake that belongs to a state is left whole");
  {
    const mod = buildMod({ nodes: "1 2\n", rails: "1 3 2 5 3 \n" });
    md.fixWaterSupplyRail({ modRoot: mod });
    rec("the railway through lake 5 is byte-for-byte kept", lines(mod, "railways.txt").includes("1 3 2 5 3"), lines(mod, "railways.txt"));
  }

  console.log("\n4. Nothing to clean is nothing to write");
  {
    const mod = buildMod({ nodes: "1 2\n1 5\n", rails: "1 3 1 2 3 \n1 3 2 5 3 \n" });
    const before = fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8") + "\0" + fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8");
    const r = md.fixWaterSupplyRail({ modRoot: mod });
    const after = fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8") + "\0" + fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8");
    rec("a map whose only water is a lake in a state reports no change", r.changed === false, r);
    rec("…and both files are byte-identical", before === after);
  }

  console.log("\n5. ⭐ Erasing land to water still clears what sits on it — that path names its provinces");
  {
    // waterIds mode: the provinces are becoming water right now, so everything on them goes, lake or not.
    const mod = buildMod({ nodes: "1 1\n1 2\n", rails: "1 3 1 2 3 \n" });
    const r = md.fixWaterSupplyRail({ modRoot: mod, waterIds: [2] });
    const rw = lines(mod, "railways.txt");
    rec("the hub on the erased province is removed", !lines(mod, "supply_nodes.txt").includes("1 2") && r.supplyRemoved === 1, r);
    rec("⭐⭐ …and the railway through it is split, not joined: `1 2 3` loses 2, both sides are single provinces, so it goes",
      !rw.some((l) => /^1 2 1 3$/.test(l)), rw);
  }

  console.log(`\n=== the water cleanup keeps legal lakes and splits railways: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
