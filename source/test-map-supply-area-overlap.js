// Regression: a state must be in EXACTLY ONE supply area (in two → HOI4 errors building the supply network).
// (1) createSupplyArea must REMOVE its claimed states from any other area first (moveStateToSupplyArea already
//     guards this on a move; creation didn't — it just appended, double-assigning the state). (2) validateMapModel
//     must DETECT an existing double-assignment (state_in_two_supply_areas). Found by a bug-hunt sweep.
// Run: node test-map-supply-area-overlap.js
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
function bmp24(w, h, fn) { const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is); b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34); for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } } return b; }
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function setup(supplyAreaFiles) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-saov-"));
  mk(path.join(mod, "descriptor.mod"), 'name="SAOV"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(4, 1, (x) => x < 2 ? [10, 0, 0] : [20, 0, 0]));
  mk(path.join(mod, "map", "definition.csv"), "0;0;0;0;land;false;unknown;0\n1;10;0;0;land;false;plains;1\n2;20;0;0;land;false;plains;1\n");
  mk(path.join(mod, "map", "strategicregions", "00.txt"), 'strategic_region = { id = 1 name = "R" provinces = { 1 2 } }');
  mk(path.join(mod, "history", "states", "1-A.txt"), 'state = {\n\tid = 1\n\tname = "A"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "history", "states", "2-B.txt"), 'state = {\n\tid = 2\n\tname = "B"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n');
  for (const [f, c] of Object.entries(supplyAreaFiles)) mk(path.join(mod, "map", "supplyareas", f), c);
  return mod;
}
const areasWith = (model, sid) => (model.supplyAreas || []).filter((a) => (a.states || []).includes(sid)).map((a) => a.id);

try {
  // ── (1) createSupplyArea no longer double-assigns ──
  console.log("=== createSupplyArea removes a claimed state from its old area ===");
  let mod = setup({ "00_existing.txt": 'supply_area={\n\tid=10\n\tname="SA_10"\n\tvalue=5\n\tstates={ 1 2 }\n}\n' });
  const r = md.createSupplyArea({ modRoot: mod, value: 3, states: [1] });
  ok(r.ok, "createSupplyArea ok", r);
  let model = md.buildMapModel({ modRoot: mod });
  ok(areasWith(model, 1).length === 1, "state 1 is now in EXACTLY one supply area (not double-assigned)", areasWith(model, 1));
  ok(areasWith(model, 2).length === 1 && areasWith(model, 2)[0] === 10, "state 2 stays in its original area 10", areasWith(model, 2));
  ok(!md.validateMapModel(model).some((p) => p.rule === "state_in_two_supply_areas"), "no double-assignment error after create");
  fs.rmSync(mod, { recursive: true, force: true });

  // ── (2) validator DETECTS an existing double-assignment ──
  console.log("=== validateMapModel detects a pre-existing double-assignment ===");
  mod = setup({
    "a.txt": 'supply_area={\n\tid=10\n\tname="SA_10"\n\tvalue=5\n\tstates={ 1 2 }\n}\n',
    "b.txt": 'supply_area={\n\tid=11\n\tname="SA_11"\n\tvalue=5\n\tstates={ 1 }\n}\n',
  });
  model = md.buildMapModel({ modRoot: mod });
  const probs = md.validateMapModel(model);
  const dup = probs.find((p) => p.rule === "state_in_two_supply_areas");
  // Supply areas are deprecated since HOI4 1.11, so a double-assignment is a data-hygiene WARNING, not a crash.
  ok(!!dup && dup.severity === "warning", "state_in_two_supply_areas warning is raised", dup);
  ok(dup && /deprecated/i.test(dup.message), "the message notes supply areas are deprecated (no over-claimed crash)", dup && dup.message);
  ok(dup && dup.states.includes(1), "it names the double-assigned state (1)", dup && dup.states);
  // label coverage
  const labels = require("./public/map-rule-labels.js");
  ok(!!labels.LABELS.state_in_two_supply_areas, "the new rule has a friendly label", labels.mapRuleLabel("state_in_two_supply_areas"));
  fs.rmSync(mod, { recursive: true, force: true });
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
