// parseManagedGridboxPositions reads back the tech gridbox pixel positions that the app itself wrote
// into a folder container — but ONLY from inside the `# >>> NOVA_GRIDBOXES ... # <<< NOVA_GRIDBOXES`
// sentinels. That isolation is a real safety property: the round-trip relayout rewrites only the
// Nova-managed block, so the parser must never pick up a modder's hand-authored gridbox that lives
// OUTSIDE the sentinels (else a re-layout could clobber it). The existing gridbox test only uses this
// fn as a helper; this locks its own contract: sentinel isolation, the _tree-suffix filter (year
// labels excluded), negative coords, and no-region -> {}.
"use strict";
const { parseManagedGridboxPositions, buildTechFolderGridboxes } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };
const keys = (o) => Object.keys(o).sort();

// Real emitted shape (mirrors buildTechFolderGridboxes): name line then position line, tab-indented.
const gb = (name, x, y) => `\t\t\t\tgridboxtype = {\n\t\t\t\t\tname = "${name}"\n\t\t\t\t\tposition = { x = ${x} y = ${y} }\n\t\t\t\t}`;
const region = (inner) => `\t\t\t\t# >>> NOVA_GRIDBOXES (auto-managed)\n${inner}\n\t\t\t\t# <<< NOVA_GRIDBOXES`;

// --- No sentinel region → {} even when gridbox-like text is present. ---
check("no NOVA region → {}", keys(parseManagedGridboxPositions("containertype = { name = \"x\" }")).length === 0);
check("gridbox OUTSIDE any region → {} (never parsed without sentinels)",
  keys(parseManagedGridboxPositions(gb("loose_tree", 5, 5))).length === 0, parseManagedGridboxPositions(gb("loose_tree", 5, 5)));

// --- Single tech gridbox inside the region → key is the name WITHOUT the _tree suffix. ---
const one = parseManagedGridboxPositions(region(gb("alpha_tree", 130, 140)));
check("single gridbox parsed, key strips _tree", keys(one).length === 1 && one.alpha && one.alpha.px === 130 && one.alpha.py === 140, one);

// --- Multiple gridboxes → all parsed. ---
const many = parseManagedGridboxPositions(region(gb("alpha_tree", 130, 140) + "\n" + gb("beta_tree", 340, 280)));
check("multiple gridboxes parsed", keys(many).join(",") === "alpha,beta" && many.beta.px === 340 && many.beta.py === 280, many);

// --- Negative coordinates (drag back past origin) parse as negative ints. ---
const neg = parseManagedGridboxPositions(region(gb("neg_tree", -50, -10)));
check("negative coords parsed", neg.neg && neg.neg.px === -50 && neg.neg.py === -10, neg);

// --- ISOLATION: a hand-authored gridbox OUTSIDE the sentinels is ignored; only the inside one wins. ---
const mixed = parseManagedGridboxPositions(gb("outside_tree", 5, 5) + "\n" + region(gb("alpha_tree", 130, 140)));
check("gridbox outside the sentinels is NOT parsed", mixed.outside === undefined, mixed);
check("gridbox inside the sentinels IS parsed", mixed.alpha && mixed.alpha.px === 130, mixed);

// --- Year labels (name = "nova_year_N", no _tree suffix) are excluded — only tech _tree boxes. ---
const withYear = parseManagedGridboxPositions(region(gb("alpha_tree", 130, 140) + "\n" + gb("nova_year_0", 10, 20)));
check("year labels excluded (only _tree names)", keys(withYear).join(",") === "alpha", withYear);

// --- Empty region → {}. ---
check("empty NOVA region → {}", keys(parseManagedGridboxPositions(region(""))).length === 0);

// --- Round-trip against the REAL writer (buildTechFolderGridboxes(techs, opts)): every tech the
//     writer emitted is read back with finite px/py, and nothing extra appears. ---
const blk = buildTechFolderGridboxes(
  [{ name: "alpha", x: 0, y: 0 }, { name: "beta", x: 2, y: 3 }],
  { columns: [{ coord: 0, year: 1990 }, { coord: 3, year: 2000 }] }
);
const rt = parseManagedGridboxPositions(blk);
check("writer→parser round-trip recovers exactly the emitted techs", keys(rt).join(",") === "alpha,beta", rt);
check("round-trip read-back yields finite px/py for each tech",
  ["alpha", "beta"].every((k) => rt[k] && Number.isFinite(rt[k].px) && Number.isFinite(rt[k].py)), rt);

console.log(`\nMANAGED-GRIDBOX-POSITIONS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
