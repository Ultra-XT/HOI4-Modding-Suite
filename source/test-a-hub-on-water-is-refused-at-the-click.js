// ⛔ #a-hub-on-water-was-accepted-then-refused-at-save — THE TOOL AGREED, THE SAVE DID NOT.
//
// map-data's _supplyRailProvinceError refuses a supply hub or railway on a sea or stateless province on the
// way to disk, so nothing broken was ever written. What the modder saw was a tool that agreed with them.
// Driving the real editor, clicking the open Atlantic with the Supply hub tool:
//
//     🏭 Supply hub on province 5312 — unsaved, click 💾 Save.
//
// and the railway tool happily built the chain 12674 → 5312 → 13268 and reported "Railway across 3
// provinces". Only Save came back with:
//
//     Save stopped at step 1: Province 5312 is sea — supply hubs and railways on sea crash HOI4's supply
//     network.. Remaining changes kept.
//
// which also halts the whole batch: every other queued change waits behind one click that was never going
// to work, and the modder has to find which of their edits it was.
//
// The client already knew. `provinceType` is the same map the unit placer uses to refuse a sea province out
// loud — a sibling tool, in the same file, doing it right.
//
// ⚠️ THE RULE IS THE SERVER'S, COPIED EXACTLY, AND IT IS NOT "REFUSE ALL WATER". Millennium Dawn ships a
// supply node on a LAKE that belongs to a state (province 3698, state 667) and launches, so a lake with a
// state must stay allowed. Sea is always fatal; a stateless province is always fatal, water or land.
//
// The two rules are lifted from public/map.js and map-data.js and checked against each other, because the
// bug was not either rule being wrong — it was only one of them running at the moment the modder acts.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};

const CLIENT = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const SERVER = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");

// ⚠️ Start brace-matching at the BODY brace, not the first `{` after the name. `_supplyRailProvinceError`
// destructures its first parameter, so "first brace" is the parameter object and the lift returns
// `{ modRoot, gameRoot, dependencyRoots }` — which contains none of the sentences below and fails the
// comparison for a reason that has nothing to do with the code under test.
function lift(src, name) {
  const a = src.indexOf("function " + name + "(");
  if (a < 0) return null;
  let paren = 0, bodyStart = -1;
  for (let i = src.indexOf("(", a); i < src.length; i++) {
    if (src[i] === "(") paren++;
    else if (src[i] === ")") { paren--; if (!paren) { bodyStart = src.indexOf("{", i); break; } }
  }
  if (bodyStart < 0) return null;
  let d = 0, end = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : src.slice(a, end);
}

const clientSrc = lift(CLIENT, "supplyRailReason");
ok(!!clientSrc, "the client-side reason function exists in public/map.js");

// Give it the two things it closes over.
const makeReason = new Function("provinceType", "model", "return (" + clientSrc + ")");

const TYPES = new Map([[1, "land"], [2, "sea"], [3, "lake"], [4, "land"]]);
const MODEL = { provinceToState: { 1: 100, 2: null, 3: 100, 4: null } };
const reason = makeReason(TYPES, MODEL);

console.log("\n-- the rule the click now applies --");
{
  ok(reason(1) === null, "a land province in a state is allowed", reason(1));
  ok(/is sea/.test(reason(2) || ""), "a SEA province is refused, and says why", reason(2));
  ok(reason(3) === null,
    "a LAKE that belongs to a state is ALLOWED — Millennium Dawn ships one and launches", reason(3));
  ok(/no state/.test(reason(4) || ""), "a stateless land province is refused", reason(4));
}

console.log("\n-- …and it is the SERVER's rule, not a second opinion --");
{
  // The bug was one rule running at save and none at the click, so the two must not drift apart. Compare the
  // sentences, which is what a modder actually sees, rather than the code.
  const serverSrc = lift(SERVER, "_supplyRailProvinceError") || "";
  ok(serverSrc.length > 0, "the server-side rule was found");
  // The wording says CAN crash, not "crash": the wiki's Troubleshooting page names these as the commonest cause of a
  // crash when a single-player game starts or the nudger's Supply view opens — but Old World Blues ships a hub on
  // sea province 107 and launches. The refusal stands; the certainty does not. #a-map-message-matches-what-the-engine-checks
  for (const phrase of [
    "is sea — a supply hub or railway on sea can crash HOI4 when a game starts or the Supply view opens.",
    "has no state — a supply hub or railway on a province with no state can crash HOI4 when a game starts or the Supply view opens.",
  ]) {
    ok(serverSrc.includes(phrase) && clientSrc.includes(phrase),
      `both sides give the same reason: "${phrase.slice(0, 42)}…"`,
      { server: serverSrc.includes(phrase), client: clientSrc.includes(phrase) });
  }
  // The client records the lake reasoning in the comment ABOVE the function, which lift() does not include —
  // look at the surrounding source instead of the body alone.
  const clientAt = CLIENT.indexOf("function supplyRailReason(");
  const clientNear = CLIENT.slice(Math.max(0, clientAt - 1600), clientAt + 600);
  ok(/lake/i.test(serverSrc) && /lake/i.test(clientNear),
    "…and both record WHY a lake is the exception", { server: /lake/i.test(serverSrc), client: /lake/i.test(clientNear) });
  ok(/3698/.test(serverSrc) && /3698/.test(clientNear),
    "…citing the same Millennium Dawn province, so neither side can quietly change its mind",
    { server: /3698/.test(serverSrc), client: /3698/.test(clientNear) });
}

console.log("\n-- the click handlers actually consult it --");
{
  const hub = lift(CLIENT, "handleSupplyHubClick") || "";
  const rail = lift(CLIENT, "handleRailwayClick") || "";
  ok(/supplyRailReason\(/.test(hub), "the supply hub handler calls it");
  ok(/supplyRailReason\(/.test(rail), "the railway handler calls it");
  // ⭐ Removing must stay possible: a hub already sitting on water (inherited, or left by an older edit)
  // is removed by clicking it, and refusing that would strand it forever.
  ok(/if \(!has\)/.test(hub),
    "…and the hub handler only refuses when ADDING, so an existing one can still be clicked off", hub.slice(0, 400));
  const railIdx = rail.indexOf("supplyRailReason("), pushIdx = rail.indexOf("railPath.push(");
  ok(railIdx !== -1 && pushIdx !== -1 && railIdx < pushIdx,
    "…and the railway refuses BEFORE the province joins the line", { railIdx, pushIdx });
}

console.log(`\n=== a hub on water is refused at the click: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
