// Cross-file shared-focus resolution: a focus_tree pulls in shared groups via `shared_focus = <id>`
// references; the defs live in other national_focus files, with per-country `offset` adjustments.
// Run: node test-shared-focus-resolve.js   (auto-discovered by run-tests.js)
const fs = require("fs");
const path = require("path");
const { parseSharedFocusReferences, resolveSharedFocuses, setSharedFocusConnection, listAvailableSharedGroups } = require("./server.js");

let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

console.log("=== SHARED FOCUS RESOLUTION ===");

// References: bare `shared_focus = ID`, NOT the `shared_focus = { ... }` definition blocks.
const TREE = `focus_tree = {
	id = arm_tree
	country = { factor = 0 modifier = { add = 10 tag = ARM } }
	# Shared Focus Section
	shared_focus = EU001
	shared_focus = GULF001
	focus = { id = own_focus x = 0 y = 0 cost = 10 }
}
`;
ok(JSON.stringify(parseSharedFocusReferences(TREE)) === JSON.stringify(["EU001", "GULF001"]), "parses bare shared_focus references");
// A definition block must NOT be picked up as a reference.
ok(parseSharedFocusReferences("shared_focus = { id = EU001 x = 1 y = 2 }").length === 0, "ignores shared_focus = { } definitions as references");

const EU_FILE = `shared_focus = {
	id = EU001
	icon = eu_icon
	x = 20
	y = 18
	offset = { x = -11 y = -3 trigger = { tag = ARM } }
	offset = { x = 5 y = 0 trigger = { tag = ROM } }
}
shared_focus = {
	id = EU002
	icon = eu_icon2
	x = 0
	y = 1
	relative_position_id = EU001
	prerequisite = { focus = EU001 }
}
`;
const GULF_FILE = `shared_focus = {
	id = GULF001
	icon = gulf_icon
	x = 5
	y = 5
	prerequisite = { focus = something }
}
`;
const UNREF_FILE = `shared_focus = { id = ZZZ999 x = 9 y = 9 }`;

const files = [
  { file: "01_eu_shared.txt", text: EU_FILE },
  { file: "gulf_shared.txt", text: GULF_FILE },
  { file: "unrelated_shared.txt", text: UNREF_FILE },
];

const r = resolveSharedFocuses(TREE, "ARM", files);
ok(r.refs.length === 2, "two references resolved", r.refs);
ok(r.files.length === 2 && r.files.includes("01_eu_shared.txt") && r.files.includes("gulf_shared.txt"), "only the referenced groups' files are included", r.files);
ok(!r.files.includes("unrelated_shared.txt"), "an unreferenced shared file is NOT pulled in");
ok(r.focuses.length === 3, "all defs from the included files are returned (EU001+EU002+GULF001)", r.focuses.length);

const eu1 = r.focuses.find((f) => f.id === "EU001");
ok(eu1 && eu1.x === 9 && eu1.y === 15, "ARM offset applied to EU001 (20-11, 18-3)", eu1 && { x: eu1.x, y: eu1.y });
ok(eu1 && eu1.icon === "eu_icon" && eu1.shared === true && eu1.sharedFile === "01_eu_shared.txt", "EU001 carries icon + shared flag + source file", eu1);
const eu2 = r.focuses.find((f) => f.id === "EU002");
ok(eu2 && eu2.relativePositionId === "EU001" && eu2.prerequisites.includes("EU001"), "EU002 keeps relative_position_id + prerequisite (for connection lines)", eu2);

// A different country gets a different offset.
const rRom = resolveSharedFocuses(TREE, "ROM", files);
const eu1Rom = rRom.focuses.find((f) => f.id === "EU001");
ok(eu1Rom && eu1Rom.x === 25 && eu1Rom.y === 18, "ROM offset applied to EU001 (20+5, 18+0)", eu1Rom && { x: eu1Rom.x, y: eu1Rom.y });

// No references → nothing.
ok(resolveSharedFocuses("focus_tree = { id = x country = { factor = 0 } focus = { id = a x=0 y=0 } }", "ARM", files).focuses.length === 0, "tree with no shared_focus refs resolves to nothing");

// Realism: the actual MD Armenia tree (read-only) — pulls in the EU shared trees.
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus";
if (fs.existsSync(path.join(MD, "armenia.txt"))) {
  try {
    const arm = fs.readFileSync(path.join(MD, "armenia.txt"), "utf8");
    const fileTexts = fs.readdirSync(MD).filter((f) => f.endsWith(".txt")).map((f) => ({ file: f, text: fs.readFileSync(path.join(MD, f), "utf8") }));
    const real = resolveSharedFocuses(arm, "ARM", fileTexts);
    ok(real.refs.includes("USoE001") && real.refs.includes("POTEF001"), "real ARM references USoE001 + POTEF001", real.refs);
    ok(real.focuses.length > 100, "real ARM pulls in 100+ shared focuses (the EU branches)", real.focuses.length);
    const u1 = real.focuses.find((f) => f.id === "USoE001");
    ok(u1 && u1.shared === true && Number.isFinite(u1.x), "real USoE001 resolved with a position", u1 && { x: u1.x, y: u1.y });
  } catch (e) {
    ok(false, "real ARM check threw: " + (e.message || e));
  }
} else {
  console.log("  --  (MD armenia.txt not found; skipped realism check)");
}

// Enable/disable a shared connection (add/remove a `shared_focus = <id>` line) — surgical, prefix-safe.
const CT = `focus_tree = {
	id = t
	country = { factor = 0 modifier = { add = 10 tag = ARM } }
	shared_focus = EU1
	focus = { id = own x = 0 y = 0 }
}
`;
ok(!parseSharedFocusReferences(setSharedFocusConnection(CT, { sharedId: "EU1", enabled: false })).includes("EU1"), "disable removes the connection");
ok(/id = own/.test(setSharedFocusConnection(CT, { sharedId: "EU1", enabled: false })), "disable preserves the focus body");
const added = setSharedFocusConnection(CT, { sharedId: "GULF1", enabled: true });
ok(parseSharedFocusReferences(added).includes("GULF1") && parseSharedFocusReferences(added).includes("EU1"), "enable adds alongside existing refs");
ok(setSharedFocusConnection(CT, { sharedId: "EU1", enabled: true }) === CT, "enable an already-linked group is a no-op");
ok(setSharedFocusConnection(CT, { sharedId: "NOPE", enabled: false }) === CT, "disable an absent group is a no-op");
const NOSHARED = `focus_tree = { id = t country = { factor = 0 } focus = { id = own x = 0 y = 0 } }\n`;
ok(parseSharedFocusReferences(setSharedFocusConnection(NOSHARED, { sharedId: "EU1", enabled: true })).includes("EU1"), "enable inserts when the tree has none yet");
const PFX = `focus_tree = {\n\tid = t\n\tcountry = { factor = 0 }\n\tshared_focus = EU1\n\tshared_focus = EU10\n\tfocus = { id = o x=0 y=0 }\n}\n`;
const pfxRem = setSharedFocusConnection(PFX, { sharedId: "EU1", enabled: false });
ok(!parseSharedFocusReferences(pfxRem).includes("EU1") && parseSharedFocusReferences(pfxRem).includes("EU10"), "removal is prefix-safe (EU1 ≠ EU10)");

// Available groups: one per file that defines shared_focus blocks.
const groups = listAvailableSharedGroups(files);
ok(groups.length === 3 && groups.every((g) => g.rootId && g.count >= 1), "lists one available group per shared file", groups);

if (failed) { console.error(`\ntest-shared-focus-resolve: ${failed} FAILED`); process.exit(1); }
console.log("\ntest-shared-focus-resolve: all checks passed");
