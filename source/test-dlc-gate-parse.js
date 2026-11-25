// The research DLC-gate parser must handle HOI4's case-insensitive keywords and OR-of-DLC gates:
//   NOT{ has_dlc } → forbid;  OR{ has_dlc has_dlc } → require-ANY group;  bare/AND has_dlc → require.
// Real cases: vanilla naval_folder uses lowercase `not = { has_dlc = "Man the Guns" }`, and
// special_forces_doctrine_folder uses OR{ "Arms Against Tyranny" "No Compromise, No Surrender" }.
"use strict";
const { parseDlcGateBody } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const g = (body) => parseDlcGateBody(body, null);

// 1. Plain require (uppercase + lowercase forms behave the same).
{
  const b = g('has_dlc = "No Step Back"');
  check("bare has_dlc → require", JSON.stringify([b.requireDlc, b.forbidDlc, b.requireAnyDlc]) === JSON.stringify([["No Step Back"], [], []]));
}

// 2. NOT → forbid, case-insensitive (vanilla uses lowercase `not`).
check("NOT (uppercase) → forbid", g('NOT = { has_dlc = "Man the Guns" }').forbidDlc[0] === "Man the Guns");
check("not (lowercase) → forbid", g('not = { has_dlc = "Man the Guns" }').forbidDlc[0] === "Man the Guns");
check("lowercase not leaves require empty", g('not = { has_dlc = "Man the Guns" }').requireDlc.length === 0);

// 3. OR → a require-ANY group (own at least one).
const sf = g('OR = { has_dlc = "Arms Against Tyranny" has_dlc = "No Compromise, No Surrender" }');
check("OR → one requireAny group", sf.requireAnyDlc.length === 1 && sf.requireAnyDlc[0].length === 2, JSON.stringify(sf));
check("OR group has both DLCs", sf.requireAnyDlc[0].includes("Arms Against Tyranny") && sf.requireAnyDlc[0].includes("No Compromise, No Surrender"));
check("OR DLCs are NOT plain requires", sf.requireDlc.length === 0);

// 4. AND wrapper → its has_dlc are plain requires (all needed).
const an = g('AND = { has_dlc = "A" has_dlc = "B" }');
check("AND → both required", an.requireDlc.includes("A") && an.requireDlc.includes("B") && an.requireAnyDlc.length === 0);

// 4b. TWO separate OR gates → two distinct requireAny groups (the gate is "own-one-of-each", i.e. the
//     groups are AND-ed). Merging them into one group would wrongly accept owning one DLC from group A
//     and none from group B. Order is preserved.
const two = g('OR = { has_dlc = "A" has_dlc = "B" }\nOR = { has_dlc = "C" has_dlc = "D" }');
check("two OR gates → two separate requireAny groups", two.requireAnyDlc.length === 2, JSON.stringify(two.requireAnyDlc));
check("the two OR groups stay distinct and in order", two.requireAnyDlc[0].includes("A") && two.requireAnyDlc[1].includes("C"), JSON.stringify(two.requireAnyDlc));
// 4c. An OR with no has_dlc (e.g. always = yes) contributes no group.
check("OR without any has_dlc → no requireAny group", g('OR = { always = yes }').requireAnyDlc.length === 0);

// 5. Mixed: a require + a forbid + an OR group together.
const mix = g('has_dlc = "Base"\nNOT = { has_dlc = "X" }\nor = { has_dlc = "P" has_dlc = "Q" }');
check("mixed require kept", mix.requireDlc.includes("Base"));
check("mixed forbid kept", mix.forbidDlc.includes("X"));
check("mixed OR group kept (lowercase or)", mix.requireAnyDlc.length === 1 && mix.requireAnyDlc[0].includes("P") && mix.requireAnyDlc[0].includes("Q"));

// 6. Empty / no gate → all empty.
{
  const e = g("");
  check("empty body → empty gate", JSON.stringify([e.requireDlc, e.forbidDlc, e.requireAnyDlc]) === JSON.stringify([[], [], []]) && e.expr === null);
}

// 8. NESTING-AWARE EXPRESSION (#dlc-expr). Flat require/forbid lists cannot express a DLC-conditional
// FALLBACK — the pattern mods use to support players with and without a DLC:
//     OR = { AND = { has_dlc="X" has_tech=a }  AND = { NOT={has_dlc="X"} has_tech=b } }
// It is satisfiable in BOTH DLC states, but flattening yields forbid[X] + requireAny[[X]] — a contradiction
// that hid the tech either way AND took every descendant with it (MD's whole HELICOPTER OPERATORS naval
// branch disappeared: aircraft_heli_engineering_1 gates exactly like this, so helicopter_operator_hull_1..4
// were unreachable). The expression must evaluate as a tautology here.
const sat = (e, on) => {
  if (e == null) return { t: true, f: true };
  if (e.d) { const v = on.has(e.d); return { t: v, f: !v }; }
  if (e.n) { const k = sat(e.n, on); return { t: k.f, f: k.t }; }
  if (e.a) { const ks = e.a.map((k) => sat(k, on)); return { t: ks.every((k) => k.t), f: ks.some((k) => k.f) }; }
  if (e.o) { const ks = e.o.map((k) => sat(k, on)); return { t: ks.some((k) => k.t), f: ks.every((k) => k.f) }; }
  return { t: true, f: true };
};
const passes = (body, ...on) => sat(g(body).expr, new Set(on)).t;
const FALLBACK = 'ROOT = { OR = {' +
  ' AND = { has_dlc = "No Step Back" has_tech = nsb_transport_helicopter1 }' +
  ' AND = { NOT = { has_dlc = "No Step Back" } has_tech = transport_helicopter1 }' +
  ' } }';
check("DLC-conditional fallback passes WITH the dlc", passes(FALLBACK, "No Step Back"));
check("DLC-conditional fallback passes WITHOUT the dlc", passes(FALLBACK));
// The real gate must still bite in both directions:
check("expr: plain require passes only when owned", passes('has_dlc = "No Step Back"', "No Step Back") && !passes('has_dlc = "No Step Back"'));
check("expr: NOT-gate passes only when NOT owned", !passes('NOT = { has_dlc = "X" }', "X") && passes('NOT = { has_dlc = "X" }'));
check("expr: OR group needs at least one", passes('OR = { has_dlc = "A" has_dlc = "B" }', "B") && !passes('OR = { has_dlc = "A" has_dlc = "B" }', "C"));
check("expr: AND needs all", passes('AND = { has_dlc = "A" has_dlc = "B" }', "A", "B") && !passes('AND = { has_dlc = "A" has_dlc = "B" }', "A"));
// Non-DLC conditions are FREE (never a reason to hide) — "we don't guess".
check("expr: has_tech-only gate has no DLC expression", g('has_tech = foo').expr === null);
check("expr: NOT{has_tech} is not a DLC constraint", g('NOT = { has_tech = foo }').expr === null);
// Nested scopes (ROOT/FROM/…) are conjunctions, not opaque blobs.
check("expr: ROOT scope descends", passes('ROOT = { has_dlc = "A" }', "A") && !passes('ROOT = { has_dlc = "A" }'));

// 7. dlcSink collects every referenced DLC (for the filter checkboxes).
const sink = new Set();
parseDlcGateBody('has_dlc = "Base" NOT = { has_dlc = "X" } OR = { has_dlc = "P" has_dlc = "Q" }', sink);
check("dlcSink gets require + forbid + OR DLCs", ["Base", "X", "P", "Q"].every((d) => sink.has(d)), [...sink].join(","));

console.log(`\nDLC-GATE-PARSE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
