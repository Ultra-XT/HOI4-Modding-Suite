// Moving a state between supply areas must be SURGICAL and OVERLAP-PROOF: a state belongs to exactly one
// supply area, so the mover removes it from EVERY area that currently lists it (not just the caller's
// fromAreaId — that's the bug class that once put provinces in two strategic regions) and adds it to the
// target, preserving each area's id/name/value and its OTHER states. Edits supplyareas/*.txt in place.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { moveStateToSupplyArea } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// Build a temp mod whose map/supplyareas holds the given { id, name, value, states[] } areas (one file each).
function makeMod(areas) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-supply-"));
  const dir = path.join(mod, "map", "supplyareas");
  fs.mkdirSync(dir, { recursive: true });
  for (const a of areas) {
    fs.writeFileSync(path.join(dir, `${a.id}-${a.name}.txt`),
      `supply_area={\n\tid=${a.id}\n\tname="SUPPLYAREA_${a.name.toUpperCase()}"\n\tvalue=${a.value}\n\tstates={ ${a.states.join(" ")} }\n}\n`, "utf8");
  }
  return mod;
}
const statesOf = (mod, id, name) => {
  const txt = fs.readFileSync(path.join(mod, "map", "supplyareas", `${id}-${name}.txt`), "utf8");
  const m = /states\s*=\s*\{([^}]*)\}/.exec(txt);
  return (m ? (m[1].match(/\d+/g) || []) : []).map(Number).sort((a, b) => a - b);
};
const fieldOk = (mod, id, name, value) => {
  const txt = fs.readFileSync(path.join(mod, "map", "supplyareas", `${id}-${name}.txt`), "utf8");
  return new RegExp(`id=${id}\\b`).test(txt) && new RegExp(`value=${value}\\b`).test(txt) && /name="SUPPLYAREA_/.test(txt);
};
const cleanup = (m) => { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} };

// 1. Clean move: state 9 (only in Alpha) → Beta.
{
  const mod = makeMod([{ id: 1, name: "Alpha", value: 5, states: [8, 9] }, { id: 2, name: "Beta", value: 3, states: [10] }]);
  const r = moveStateToSupplyArea({ modRoot: mod, gameRoot: "", dependencyRoots: [], stateId: 9, fromAreaId: 1, toAreaId: 2 });
  check("clean move reported changed", r.changed === true, JSON.stringify(r));
  check("Alpha lost state 9, kept 8", JSON.stringify(statesOf(mod, 1, "Alpha")) === "[8]", statesOf(mod, 1, "Alpha"));
  check("Beta gained state 9, kept 10", JSON.stringify(statesOf(mod, 2, "Beta")) === "[9,10]", statesOf(mod, 2, "Beta"));
  check("both areas kept id/name/value", fieldOk(mod, 1, "Alpha", 5) && fieldOk(mod, 2, "Beta", 3));
  cleanup(mod);
}

// 2. Overlap heal: state 7 is wrongly in BOTH areas → move to Beta → ends up in exactly one.
{
  const mod = makeMod([{ id: 1, name: "Alpha", value: 5, states: [7, 8] }, { id: 2, name: "Beta", value: 3, states: [7, 10] }]);
  const r = moveStateToSupplyArea({ modRoot: mod, gameRoot: "", dependencyRoots: [], stateId: 7, fromAreaId: 1, toAreaId: 2 });
  check("overlap move reported changed", r.changed === true);
  check("state 7 removed from Alpha (the non-target area)", !statesOf(mod, 1, "Alpha").includes(7), statesOf(mod, 1, "Alpha"));
  check("state 7 still in Beta (target) — exactly one area now", statesOf(mod, 2, "Beta").includes(7), statesOf(mod, 2, "Beta"));
  check("Alpha kept its other state 8", statesOf(mod, 1, "Alpha").includes(8));
  cleanup(mod);
}

// 3. Multi-source overlap: state 5 wrongly in THREE areas → move to area 3 → removed from 1 AND 2.
{
  const mod = makeMod([
    { id: 1, name: "Alpha", value: 5, states: [5, 8] },
    { id: 2, name: "Beta", value: 3, states: [5, 10] },
    { id: 3, name: "Gamma", value: 9, states: [5, 12] },
  ]);
  const r = moveStateToSupplyArea({ modRoot: mod, gameRoot: "", dependencyRoots: [], stateId: 5, fromAreaId: 1, toAreaId: 3 });
  check("multi-source move reported removedFrom 1 & 2", r.changed && r.removedFrom.includes(1) && r.removedFrom.includes(2), JSON.stringify(r.removedFrom));
  check("state 5 gone from Alpha AND Beta", !statesOf(mod, 1, "Alpha").includes(5) && !statesOf(mod, 2, "Beta").includes(5));
  check("state 5 kept in target Gamma", statesOf(mod, 3, "Gamma").includes(5));
  check("Gamma kept its other state 12", statesOf(mod, 3, "Gamma").includes(12));
  cleanup(mod);
}

// 4. Add where absent: state 99 in no area → move to Beta → Beta gains it.
{
  const mod = makeMod([{ id: 1, name: "Alpha", value: 5, states: [8] }, { id: 2, name: "Beta", value: 3, states: [10] }]);
  const r = moveStateToSupplyArea({ modRoot: mod, gameRoot: "", dependencyRoots: [], stateId: 99, fromAreaId: 1, toAreaId: 2 });
  check("adding a not-yet-present state changes the target", r.changed === true && statesOf(mod, 2, "Beta").includes(99), statesOf(mod, 2, "Beta"));
  check("Alpha untouched when state wasn't in it", JSON.stringify(statesOf(mod, 1, "Alpha")) === "[8]");
  cleanup(mod);
}

// 5. Bad inputs.
{
  const mod = makeMod([{ id: 1, name: "Alpha", value: 5, states: [8] }]);
  check("non-numeric state id → error", moveStateToSupplyArea({ modRoot: mod, gameRoot: "", stateId: "x", toAreaId: 1 }).changed === false);
  check("missing target area → error", moveStateToSupplyArea({ modRoot: mod, gameRoot: "", stateId: 8, toAreaId: "" }).error != null);
  cleanup(mod);
}

console.log(`\nMAP-SUPPLYAREA-MOVE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
