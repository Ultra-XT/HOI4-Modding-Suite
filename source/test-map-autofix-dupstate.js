// Regression guard: "Auto-fix all" must RESOLVE duplicate state ids — they had no handler in
// autoFixMap, so they survived every click (the user hit this on Millennium Dawn: 6 duplicate state
// ids from `<id>-restored.txt` stubs that fillMissingStateGaps once wrote, kept coming back). Also
// guards the "all duplicate files redundant" branch (keep the first in alphabetical load order — what
// HOI4 itself keeps — when no single file is the obvious keeper).
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function mkMod(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afdup-"));
  const dir = path.join(root, "history", "states");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, "utf8");
  return root;
}
const st = (id, name, provs) => `state = { id = ${id} name = "${name}" provinces = { ${provs.join(" ")} } history = {} }`;

try {
  // ── Case 1: a redundant stub (its province is owned by a state outside the dup set) → autoFixMap removes it.
  const m1 = mkMod({
    // ids start at 1 (contiguous) so the gap-closer in autoFixMap is a no-op and doesn't renumber here.
    "1-Real.txt":        st(1, "Real", [11]),
    "1-restored.txt":    st(1, "STATE_1", [77]),   // 77 is really owned by state 2 below → redundant
    "2-Owner.txt":       st(2, "Owner", [77]),
  });
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afdup-game-")); // separate gameRoot so writes are allowed
  const r1 = md.autoFixMap({ modRoot: m1, gameRoot: game });
  ok(r1.fixes && r1.fixes.dupStateFiles, "autoFixMap now runs the duplicate-state-file resolver", r1.fixes && Object.keys(r1.fixes));
  ok(r1.fixes.dupStateFiles.removed.some((x) => x.id === 1 && x.file === "1-restored.txt"), "auto-fix removed the redundant 1-restored.txt stub", r1.fixes.dupStateFiles);
  ok(!md.findStateFileConflicts(m1).some((p) => p.rule === "duplicate_state_id"), "no duplicate_state_id remains after auto-fix", md.findStateFileConflicts(m1));
  ok(fs.existsSync(path.join(m1, "history/states/1-Real.txt")) && !fs.existsSync(path.join(m1, "history/states/1-restored.txt")), "real state kept, stub file deleted");

  // ── Case 2: BOTH dup files redundant → keep the first in alphabetical load order (HOI4's choice).
  const m2 = mkMod({
    "7-Aaa.txt":        st(7, "Aaa", [21]),         // 21 also owned by e1 → redundant
    "7-restored.txt":   st(7, "STATE_7", [22]),     // 22 also owned by e2 → redundant
    "100-e1.txt":       st(100, "E1", [21]),
    "101-e2.txt":       st(101, "E2", [22]),
  });
  const fx2 = md.fixDuplicateStateFiles({ modRoot: m2 });
  ok(fx2.removed.some((x) => x.id === 7 && x.file === "7-restored.txt"), "all-redundant: removes the later-alphabetical file (7-restored.txt)", fx2);
  ok(fs.existsSync(path.join(m2, "history/states/7-Aaa.txt")), "all-redundant: keeps the first-alphabetical file (7-Aaa.txt)");
  ok(!md.findStateFileConflicts(m2).some((p) => p.rule === "duplicate_state_id"), "all-redundant case: duplicate id cleared");

  // ── Case 3 (guard the conservative path is intact): both own UNIQUE land → leave untouched.
  const m3 = mkMod({ "9-A.txt": st(9, "A", [100]), "9-B.txt": st(9, "B", [200]) });
  const fx3 = md.fixDuplicateStateFiles({ modRoot: m3 });
  ok(fx3.removed.length === 0 && fx3.unresolved.some((u) => u.id === 9), "ambiguous (both own unique land) still left for the user", fx3);

  [m1, game, m2, m3].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
