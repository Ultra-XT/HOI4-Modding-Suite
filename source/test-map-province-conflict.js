// Guard fixProvinceInTwoStates: a province claimed by two states must get ONE owner, but only via SAFE
// edits — never one that leaves a state-id gap (HOI4 crashes on a missing id). Keep it in its real home
// (non-stub file, most provinces, lowest id); drop it from the stub; delete an emptied stub ONLY when it's
// the highest id. An emptied MID-range state is left untouched + reported. (User hit this on Millennium
// Dawn: province 8118 in Rub al Khali + a max-id stub → fixable; 15671 in Nei Mongol + a mid stub → not.)
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
function mkMod(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pconf-"));
  const dir = path.join(root, "history", "states");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, "utf8");
  return root;
}
const st = (id, provs) => `state = { id = ${id} name = "STATE_${id}" provinces = { ${provs.join(" ")} } history = {} }`;
const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pconf-game-"));
const cleanup = [game];

try {
  // ── Case 1: stub is the MAX id → keep in the real state, delete the emptied stub (no gap). ──
  const m1 = mkMod({ "10-Real.txt": st(10, [1, 2]), "11-restored.txt": st(11, [2]) }); cleanup.push(m1);
  const r1 = md.fixProvinceInTwoStates({ modRoot: m1, gameRoot: game });
  ok(r1.resolved.some((x) => x.province === 2 && x.keptIn === 10 && x.deletedEmptyState), "max-id stub: province kept in real state, stub deleted", r1);
  ok(r1.deletedStates.includes(11), "max-id stub state removed", r1.deletedStates);
  ok(!md.findStateFileConflicts(m1).some((p) => p.rule === "province_in_two_states_files"), "no province conflict remains (case 1)", md.findStateFileConflicts(m1));
  ok(/\b2\b/.test(fs.readFileSync(path.join(m1, "history/states/10-Real.txt"), "utf8")), "real state still owns the province");

  // ── Case 2: stub is MID-range → delete it, then closeStateIdGaps slides the top state down (no gap). ──
  // States 1..4 contiguous; state 2 is a redundant stub sharing province 51 with real state 1.
  const m2 = mkMod({ "1-Real.txt": st(1, [50, 51]), "2-restored.txt": st(2, [51]), "3-Mid.txt": st(3, [30]), "4-Top.txt": st(4, [40]) }); cleanup.push(m2);
  const r2 = md.fixProvinceInTwoStates({ modRoot: m2, gameRoot: game });
  ok(r2.deletedStates.includes(2), "mid-range stub deleted (province kept in the real state)", r2);
  ok(!md.findStateFileConflicts(m2).some((p) => p.rule === "province_in_two_states_files"), "province conflict resolved (case 2)", md.findStateFileConflicts(m2));
  const g2 = md.closeStateIdGaps(m2);
  ok(g2.renumbered.some((x) => x.from === 4 && x.to === 2), "closeStateIdGaps slid the top state (4) into the gap (2)", g2);
  const ids2 = md.buildMapModel({ modRoot: m2, gameRoot: m2 }).states.map((s) => s.id).sort((a, b) => a - b);
  ok(JSON.stringify(ids2) === JSON.stringify([1, 2, 3]), "state ids are contiguous 1..3 after closing the gap", ids2);
  ok(md.buildMapModel({ modRoot: m2, gameRoot: m2 }).states.find((s) => s.id === 2).provinces.includes(40), "the renumbered state kept its province (40)");

  // ── Case 3: two real multi-province states share a province → keep in lower id, the other survives. ──
  const m3 = mkMod({ "20-A.txt": st(20, [200, 201]), "21-B.txt": st(21, [201, 202]) }); cleanup.push(m3);
  const r3 = md.fixProvinceInTwoStates({ modRoot: m3, gameRoot: game });
  ok(r3.resolved.some((x) => x.province === 201 && x.keptIn === 20 && x.removedFrom === 21), "shared province kept in lower-id state, dropped from the other", r3);
  ok(r3.deletedStates.length === 0, "neither multi-province state was deleted", r3.deletedStates);
  const m3model = md.buildMapModel({ modRoot: m3, gameRoot: m3 });
  ok(m3model.states.find((s) => s.id === 21) && m3model.states.find((s) => s.id === 21).provinces.includes(202), "the other state still owns its unique province", m3model.states.find((s) => s.id === 21));
  ok(!md.findStateFileConflicts(m3).some((p) => p.rule === "province_in_two_states_files"), "no province conflict remains (case 3)");
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally { cleanup.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }); }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
