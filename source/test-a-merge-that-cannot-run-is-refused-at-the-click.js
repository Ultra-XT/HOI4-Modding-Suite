// ⛔ The third instance of #a-hub-on-water-was-accepted-then-refused-at-save, in Merge state.
//
// A merge ends by DELETING the source state, so mergeState refuses exactly the two cases the Delete button
// does. Verified against the running server:
//
//   • "State 338 comes from the base game or a dependency and this mod doesn't replace history/states, so
//      deleting it would make it reappear. Move its provinces over manually instead."
//     (Now "It has to keep at least one of its provinces: move the others with ↔ Move province, or leave it in place.", on both sides,
//     since ↔ Move refuses to take the last land out of such a state: #emptying-a-base-state-is-refused-at-the-click, tool campaign B2-21.)
//   • "State 64 is the capital of DDR, GER, PRE, WGR. Reassign that capital before merging this state away
//      (otherwise it is left on a state that no longer exists, which HOI4 refuses)."
//     (It said "otherwise the game crashes on start" until #a-map-message-claims-only-what-the-engine-shows: country.cpp refuses a
//     capital on a missing state and logs it, and no launch has shown a crash.)
//
// doMergeState checked neither. It simulated the whole merge locally — source removed from the model, its
// provinces re-drawn under the target — reported "Merged X → Y (unsaved — click 💾 Save)", and left Save to
// find out. Both facts were in hand: capitals from model.capitals, and the inherited case from the
// inBaseLayer flag added for the Delete button.
//
// ⭐ ORDER MATTERS. The server tests the capital FIRST, so a state that is both a capital and inherited must
// hear about the capital — that is the one the modder can actually act on, and the message tells them which
// countries to reassign.
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

const fnSrc = lift(CLIENT, "doMergeState");
ok(!!fnSrc, "doMergeState was found in public/map.js");
// #a-merge-keeps-the-state-in-one-region — doMergeState now keeps the merged state in one strategic region through two helpers of the
// page's; they come along so the click runs as it does in the page (this fixture's model has no regions, so neither moves anything).
// (…and ⛔ #a-deleted-state-says-every-dockyard-it-takes — the helpers it sums the dockyards' dated moments with, and the page's list of those levels)
const helperSrc = ["setProvinceRegionLocally", "mergeRegionPlan", "stateNavalLevels", "navalDatedAfterCarry", "giveNavalDated", "moveProvinceLevels"].map((n) => lift(CLIENT, n)).filter(Boolean).join("\n")
  + "\n" + ((CLIENT.match(/const NAVAL_ONLY_STATE_KEYS = [^;]*;/) || [""])[0]);

function harness(states, capitals) {
  const statuses = [], queued = [];
  const model = { states: states.slice(), capitals: capitals || {}, provinceToState: {} };
  const stateById = new Map(states.map((s) => [s.id, s]));
  const run = new Function(
    "model", "stateById", "provinceToOwner", "pendingWrites", "queueWrite", "setStatus", "pushUndo",
    "recolorAll", "draw", "selected", "info",
    helperSrc + "\nreturn (" + fnSrc + ")")(
    model, stateById, {}, [], (url, body) => queued.push({ url, body }),
    (s) => statuses.push(String(s)), () => {}, () => {}, () => {}, null, { style: {} });
  return { run, statuses, queued, stateById, last: () => statuses[statuses.length - 1] || "" };
}
const S = (id, extra) => Object.assign({ id, name: "S" + id, displayName: "State " + id, provinces: [id * 10], owner: "AAA" }, extra || {});

console.log("\n-- an ordinary merge still works --");
{
  const h = harness([S(900, { inBaseLayer: false }), S(901, { inBaseLayer: false })]);
  h.run(900, 901);
  ok(h.queued.length === 1 && h.queued[0].url === "/api/map/merge-state", "the merge is queued", h.queued);
  ok(!h.stateById.has(900), "…the source is removed from the model");
  ok(/Merged/.test(h.last()), "…and reported", h.last());
}

console.log("\n-- ⭐ merging away an INHERITED state is refused, and nothing is staged --");
{
  const h = harness([S(338, { inBaseLayer: true }), S(100, { inBaseLayer: true })]);
  h.run(338, 100);
  ok(h.queued.length === 0, "nothing is queued, so Save cannot stop on it", h.queued);
  ok(h.stateById.has(338), "…the source stays in the model, so the map keeps showing it");
  ok(/base game or a dependency/.test(h.last()), "…and the reason is the server's own", h.last());
  ok(/It has to keep at least one of its provinces: move the others with ↔ Move province, or leave it in place\./.test(h.last()), "…including what to do instead", h.last());
  ok(!/Merged/.test(h.last()), "…and it never claims the merge happened", h.last());
}

console.log("\n-- merging away a CAPITAL is refused too --");
{
  const h = harness([S(64, { inBaseLayer: false }), S(100, { inBaseLayer: false })], { GER: 64, PRE: 64 });
  h.run(64, 100);
  ok(h.queued.length === 0, "nothing is queued", h.queued);
  ok(/capital of GER, PRE/.test(h.last()), "…and it names the countries to reassign", h.last());
}

console.log("\n-- ⭐ capital wins over inherited: it is the one the modder can act on --");
{
  const h = harness([S(64, { inBaseLayer: true }), S(100, { inBaseLayer: true })], { GER: 64 });
  h.run(64, 100);
  ok(/capital of GER/.test(h.last()), "the capital reason is the one given", h.last());
  ok(!/base game or a dependency/.test(h.last()), "…not the inherited one", h.last());
}

console.log("\n-- the two sides say the same thing --");
{
  const serverSrc = lift(SERVER, "mergeState") || "";
  // Moved with #a-map-message-claims-only-what-the-engine-shows: the capital phrase was "otherwise the game crashes on start", and the
  // client matched it only through a COMMENT quoting the server. Both sides now say the refusal, and each phrase is looked for in the
  // code with comments masked, so a quoted comment cannot stand in for the words a modder is shown.
  const { maskJsComments: maskPhrases } = require("./testlib-strip-comments.js");
  const serverCodeP = maskPhrases(serverSrc), clientCodeP = maskPhrases(fnSrc || "");
  for (const phrase of [
    "comes from the base game or a dependency and this mod doesn't replace history/states",
    "It has to keep at least one of its provinces: move the others with ↔ Move province, or leave it in place.",
    "otherwise it is left on a state that no longer exists, which HOI4 refuses",
  ]) {
    ok(serverCodeP.includes(phrase) && clientCodeP.includes(phrase),
      `both give: "${phrase.slice(0, 46)}…"`, { server: serverCodeP.includes(phrase), client: clientCodeP.includes(phrase) });
  }
  // The server checks the capital before the resurface case; the client must not reverse that.
  // ⚠️ Compare the CODE, not the file text — this function's own comment names both cases, in the other
  // order, so an unmasked indexOf finds the prose and fails on correct code. (#strip-comments-before-any-
  // source-check, hit here by the check written to enforce it.)
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const serverCode = maskJsComments(serverSrc), clientCode = maskJsComments(fnSrc);
  const sCap = serverCode.indexOf("is the capital of"), sInh = serverCode.indexOf("comes from the base game");
  const cCap = clientCode.indexOf("is the capital of"), cInh = clientCode.indexOf("comes from the base game");
  ok(sCap !== -1 && sInh !== -1 && sCap < sInh, "the server tests the capital first", { sCap, sInh });
  ok(cCap !== -1 && cInh !== -1 && cCap < cInh, "…and so does the client", { cCap, cInh });
}

console.log(`\n=== a merge that cannot run is refused at the click: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
