// Guard closeStateIdGaps — slides the highest state id down into the lowest gap, repeatedly, until the
// ids are contiguous 1..max (HOI4 requires this; a gap crashes the map). Each move is a full renumber, so
// references (here: supply-area state lists) must follow, and the loop must terminate and handle multiple gaps.
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (files) => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gaps-")); for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); } return root; };
const st = (id, provs) => `state = { id = ${id} name = "STATE_${id}" provinces = { ${provs.join(" ")} } history = {} }`;
const cleanup = [];

try {
  // ── Multi-gap: ids {1,2,5,8} → two slides (8→3, 5→4) → contiguous 1..4, every state keeps its province. ──
  const m = mk({
    "history/states/1-a.txt": st(1, [11]),
    "history/states/2-b.txt": st(2, [12]),
    "history/states/5-e.txt": st(5, [15]),
    "history/states/8-h.txt": st(8, [18]),
    "map/supplyareas/1.txt": 'supply_area = { id = 1 name = "S" states = { 1 5 8 } value = 5 }',
  }); cleanup.push(m);
  const r = md.closeStateIdGaps(m);
  ok(r.error == null, "no error", r.error);
  ok(r.renumbered.length === 2, "two states slid down to fill two gaps", r.renumbered);
  const model = md.buildMapModel({ modRoot: m, gameRoot: m });
  const ids = model.states.map((s) => s.id).sort((a, b) => a - b);
  ok(JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4]), "ids contiguous 1..4 after close", ids);
  // the provinces must have moved WITH their states (data preserved, just renumbered)
  const provOf = (id) => (model.states.find((s) => s.id === id) || {}).provinces || [];
  ok(provOf(3).includes(18) || provOf(4).includes(18), "state that was id 8 (province 18) survived under a new id", model.states.map((s) => [s.id, s.provinces]));
  ok(provOf(3).includes(15) || provOf(4).includes(15), "state that was id 5 (province 15) survived under a new id");
  // supply-area state list got renumbered too (no dangling old ids 5/8)
  const sa = fs.readFileSync(path.join(m, "map/supplyareas/1.txt"), "utf8");
  ok(!/\bstates\s*=\s*\{[^}]*\b8\b/.test(sa) && !/\bstates\s*=\s*\{[^}]*\b5\b/.test(sa), "supply-area state list no longer references the old ids", sa);

  // ── Already contiguous → no-op. ──
  const m2 = mk({ "history/states/1-a.txt": st(1, [1]), "history/states/2-b.txt": st(2, [2]), "history/states/3-c.txt": st(3, [3]) }); cleanup.push(m2);
  const r2 = md.closeStateIdGaps(m2);
  ok(r2.renumbered.length === 0 && r2.error == null, "contiguous mod → no renumbering", r2);
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally { cleanup.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }); }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
