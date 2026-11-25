// Per-country continuous_focus_position read/write in a focus_tree (the real placement override for
// where the Continuous Focuses panel sits — e.g. ARM uses x=3000 y=1850). Surgical: must not disturb
// focus blocks or the country header. Run: node test-focus-continuous-position.js (auto-discovered).
const fs = require("fs");
const { setFocusTreeContinuousPosition, getFocusTreeContinuousPosition } = require("./server.js");

let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

console.log("=== FOCUS TREE continuous_focus_position ===");

const TREE = `focus_tree = {
	id = ARM_tree
	country = { factor = 0 modifier = { add = 10 tag = ARM } }
	continuous_focus_position = { x = 3000 y = 1850 }
	focus = {
		id = arm_alpha
		x = 0
		y = 0
		cost = 10
	}
}
`;

ok(JSON.stringify(getFocusTreeContinuousPosition(TREE)) === JSON.stringify({ x: 3000, y: 1850 }), "reads an existing position");

const moved = setFocusTreeContinuousPosition(TREE, { x: 1234, y: 5678 });
ok(JSON.stringify(getFocusTreeContinuousPosition(moved)) === JSON.stringify({ x: 1234, y: 5678 }), "moves the position");
ok(/id = arm_alpha/.test(moved) && /tag = ARM/.test(moved), "focus block + country header preserved on move");
ok((moved.match(/continuous_focus_position/g) || []).length === 1, "no duplicate position block");
// idempotent
ok(setFocusTreeContinuousPosition(moved, { x: 1234, y: 5678 }) === moved, "re-setting same coords is a no-op");

// Insert when absent.
const NOPOS = `focus_tree = {
	id = T
	country = { factor = 0 }
	focus = { id = x x = 0 y = 0 }
}
`;
ok(getFocusTreeContinuousPosition(NOPOS) === null, "absent → null");
const ins = setFocusTreeContinuousPosition(NOPOS, { x: 50, y: 100 });
ok(JSON.stringify(getFocusTreeContinuousPosition(ins)) === JSON.stringify({ x: 50, y: 100 }), "inserts when absent");
ok(/id = x/.test(ins), "focus preserved on insert");
ok((ins.match(/continuous_focus_position/g) || []).length === 1, "exactly one position after insert");

// Multiple trees: target by id.
const MULTI = `focus_tree = { id = A country = { factor = 0 } continuous_focus_position = { x = 1 y = 2 } focus = { id = fa x = 0 y = 0 } }
focus_tree = { id = B country = { factor = 0 } focus = { id = fb x = 0 y = 0 } }
`;
ok(JSON.stringify(getFocusTreeContinuousPosition(MULTI, "A")) === JSON.stringify({ x: 1, y: 2 }), "reads tree A by id");
ok(getFocusTreeContinuousPosition(MULTI, "B") === null, "tree B has none");
const multiB = setFocusTreeContinuousPosition(MULTI, { treeId: "B", x: 9, y: 9 });
ok(JSON.stringify(getFocusTreeContinuousPosition(multiB, "B")) === JSON.stringify({ x: 9, y: 9 }), "sets tree B only");
ok(JSON.stringify(getFocusTreeContinuousPosition(multiB, "A")) === JSON.stringify({ x: 1, y: 2 }), "tree A untouched");

// Comment safety: a commented-out position must not be read.
const COMMENTED = `focus_tree = {
	id = C
	# continuous_focus_position = { x = 999 y = 999 }
	continuous_focus_position = { x = 7 y = 8 }
	focus = { id = fc x = 0 y = 0 }
}
`;
ok(JSON.stringify(getFocusTreeContinuousPosition(COMMENTED)) === JSON.stringify({ x: 7, y: 8 }), "ignores a commented position");

// Realism: the actual MD Armenia tree, if present (read-only).
const ARM = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus/armenia.txt";
if (fs.existsSync(ARM)) {
  const p = getFocusTreeContinuousPosition(fs.readFileSync(ARM, "utf8"));
  ok(p && p.x === 3000 && p.y === 1850, "real MD Armenia position (3000,1850)", p);
} else {
  console.log("  --  (MD armenia.txt not found; skipped realism check)");
}

if (failed) { console.error(`\ntest-focus-continuous-position: ${failed} FAILED`); process.exit(1); }
console.log("\ntest-focus-continuous-position: all checks passed");
