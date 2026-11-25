// A supply hub or railway on sea or on a stateless province is still refused and still an error — but Nova says what
// is known: it CAN crash HOI4, not that it certainly does. #a-map-message-matches-what-the-engine-checks
//
// Nova told modders "HOI4's supply network crashes on load (silent CTD ~5s in, nothing in error.log)" and, for
// railways, "same supply-network CTD". Measured on 2026-09-11, against the engine and the shipping corpus:
//
//   * Old World Blues (descriptor supported_version="1.19.*") ships `1 107` on line 6 of its map/supply_nodes.txt,
//     and its own definition.csv has 107 as `107;5;10;152;sea;false;ocean;0`, in no state. Nova fires
//     supply_node_bad_province on it. Old World Blues launches.
//   * hoi4.exe has no string that checks a hub on water. The nearest, "Province of supply node ID was null, should
//     never happen", is a failed lookup of a province that does not EXIST — a different condition.
//   * The wiki's Troubleshooting page names hubs and railways on stateless provinces as the most common cause of a
//     crash when a single-player game starts or the nudger's Supply menu opens. That is "can crash", at a moment the
//     modder can recognise — not "crashes on load".
//   * Nova's own record of the 2026-06-19 "~5s divide by zero" shows it continued after the supply cleanup and was
//     later pinned on other faults.
//
// So the write guard still refuses, the validator still reports an error, and neither is in the fatal set — only the
// certainty goes. The click-time copy of the guard is pinned word for word in test-a-hub-on-water-is-refused-at-the-click.js.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hubrisk-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const { isFatalRule } = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// 1,2,3 land in state 1 · 4 sea · 5 land in NO state
function buildMod({ nodes, rails }) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hubrisk-mod-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="HubRisk"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;10;0;0;land;false;plains;3;",
    "2;20;0;0;land;false;plains;3;",
    "3;30;0;0;land;false;plains;3;",
    "4;40;0;0;sea;false;ocean;0;",
    "5;50;0;0;land;false;plains;3;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "supply_nodes.txt"), nodes);
  mk(path.join(mod, "map", "railways.txt"), rails);
  mk(path.join(mod, "map", "buildings.txt"), "1;arms_factory;0.0;9.5;0.0;0.0;0\r\n");
  mk(path.join(mod, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = { owner = AAA }\n}\n');
  return mod;
}
const problems = (mod) => md.validateMapModel(md.buildMapModel({ modRoot: mod }));

try {
  console.log("1. A supply hub on sea is still an error — worded as a risk");
  {
    const mod = buildMod({ nodes: "1 1\n1 4\n", rails: "1 2 1 2 \n" });
    const p = problems(mod).find((x) => x.rule === "supply_node_bad_province");
    rec("the validator still reports the hub on sea 4", !!p && (p.provinces || []).includes(4), p && p.provinces);
    rec("…still as an error", !!p && p.severity === "error", p && p.severity);
    rec("…and still not in the fatal set, so Save is not gated on a crash nobody has shown", isFatalRule("supply_node_bad_province") === false);
    const msg = String((p && p.message) || "");
    rec("⭐⭐ it no longer promises a crash on load", !/crashes on load|silent CTD|\bCTD\b/i.test(msg), msg.slice(0, 200));
    rec("⭐⭐ …it says it CAN crash, and when", /can crash/i.test(msg) && /game starts/i.test(msg), msg.slice(0, 200));
    rec("⭐ …and names the shipping map that does this and launches", /Old World Blues/.test(msg) && /\b107\b/.test(msg), msg.slice(0, 260));
  }

  console.log("\n2. A railway through sea is still an error — worded as a risk");
  {
    const mod = buildMod({ nodes: "1 1\n", rails: "1 3 1 4 2 \n" });
    const p = problems(mod).find((x) => x.rule === "railway_bad_province");
    rec("the validator still reports the railway through sea 4", !!p && (p.provinces || []).includes(4), p && p.provinces);
    rec("…still as an error", !!p && p.severity === "error", p && p.severity);
    const msg = String((p && p.message) || "");
    rec("⭐⭐ it no longer calls it a certain CTD", !/\bCTD\b|crashes on load/i.test(msg), msg.slice(0, 200));
    rec("⭐ …it says it can crash", /can crash/i.test(msg), msg.slice(0, 200));
    rec("⭐ …and describes the fixer as it now is: a railway is split at the gap, not joined across it",
      /split/i.test(msg), msg.slice(0, 260));
  }

  console.log("\n3. The write guard still refuses — with the same careful words");
  {
    const mod = buildMod({ nodes: "1 1\n", rails: "1 2 1 2 \n" });
    const sea = md.writeSupplyNode({ modRoot: mod, action: "add", province: 4, level: 1 });
    rec("adding a hub on sea is refused", !!sea.error && sea.changed === false, sea);
    rec("⭐ …saying it can crash HOI4 when a game starts",
      String(sea.error).includes("is sea — a supply hub or railway on sea can crash HOI4 when a game starts or the Supply view opens."), sea.error);
    const stateless = md.writeSupplyNode({ modRoot: mod, action: "add", province: 5, level: 1 });
    rec("adding a hub on a stateless province is refused", !!stateless.error && stateless.changed === false, stateless);
    rec("⭐ …with the stateless wording",
      String(stateless.error).includes("has no state — a supply hub or railway on a province with no state can crash HOI4 when a game starts or the Supply view opens."), stateless.error);
    const land = md.writeSupplyNode({ modRoot: mod, action: "add", province: 2, level: 1 });
    rec("control: a hub on land in a state is accepted", !land.error, land);
  }

  console.log(`\n=== a supply hub on water is a risk, not a certain crash: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
