// ⛔ #adjacency-through-was-only-checked-for-being-a-number — A STRAIT COULD CROSS A PROVINCE THAT ISN'T THERE.
//
// An adjacency of type `sea` carries a `through`: the province land units cross. The panel's own help text
// said "Needs one sea province they pass through", and the guard was:
//
//     if (action === "add" && type === "sea" && !(through >= 0)) { …refuse… }
//
// which asks only "is it a number". Driving the real editor: linking Iceland's 13266 to Denmark's Faroe
// Islands 13003 and typing 13267 — a MOUNTAIN in Iceland — was accepted without a word. So were 0
// (definition.csv's reserved unknown row) and any id at all.
//
// ⚠ AND THE OBVIOUS RULE IS WRONG. "The through must be sea" cries wolf on the base game: of vanilla's 151
// `sea` rows, THREE cross a LAND province — Panama (7617), Kiel (6257) and Suez (1155). Those three are
// exactly the three rows carrying an adjacency_rule_name; there is no other exception in the file. A land
// through is legal and means a canal — writeAdjacency was fixed for exactly this the day before
// (#a-canal-goes-through-land), and this client-side check must not re-introduce the rule it removed.
//
// ⭐ SO WHAT THIS IS AND IS NOT. map-data.js already refuses a non-existent `through` at SAVE time, and it
// is still the authority. What was missing is that the client staged the edit anyway, so the refusal
// arrived at 💾 Save — after the modder had moved on — instead of at the click. Staging an edit that will
// be refused later is the shape that turns a silent refusal into silent data loss
// (#save-must-actually-write), which is why the check belongs in both places. The `through == from/to` case
// is genuinely new: the server checks from != to, not through.
//
// The corpus numbers below are DERIVED from the installed game, not typed in, so this test tells the truth
// about whatever version is on the machine — and skips cleanly when the game is not installed.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");

function lift(name) {
  const a = SRC.indexOf("function " + name + "(");
  if (a < 0) return null;
  let d = 0, end = -1;
  for (let i = SRC.indexOf("{", a); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : SRC.slice(a, end);
}

const fnSrc = lift("adjApply");
ok(!!fnSrc, "adjApply was found in public/map.js");

// A harness giving adjApply everything it closes over. `type` and `through` come from stubbed DOM inputs,
// exactly as they do in the browser.
function harness({ from, to, type, through, provinces }) {
  const statuses = [];
  const writes = [];
  const els = {
    mapAdjPanel: { dataset: { from: String(from), to: String(to) }, style: {} },
    mapAdjType: { value: type },
    mapAdjThrough: { value: through === undefined ? "" : String(through) },
  };
  const model = { adjacencies: [] };
  // `pendingWrites` is the staged queue adjApply reads to carry a just-removed link's rule back
  // (#remove-then-add-strips-the-canal-rule); here it is the same list the stubbed queueWrite records into.
  const run = new Function(
    "$", "provinceType", "setStatus", "pushUndo", "model", "queueWrite", "closeAdjPanel", "adjFirst", "draw", "pendingWrites", "adjacencyShapeNoMapShips",
    "return (" + fnSrc + ")")(
    (id) => els[id] || null,
    new Map(Object.entries(provinces).map(([k, v]) => [Number(k), v])),
    (s) => statuses.push(String(s)),
    () => {}, model,
    (url, body) => writes.push({ url, body }),
    () => {}, null, () => {}, writes, shapePredicate);
  return { run, statuses, writes, model, last: () => statuses[statuses.length - 1] || "" };
}

// the page's copy of the rule's shape predicate, which adjApply asks before it says what it linked (#a-link-shape-no-map-ships)
const shapePredicate = (() => { const t = lift("adjacencyShapeNoMapShips"); return t ? new Function("return (" + t + ")")() : undefined; })();
// Iceland 13266 <-> Faroe 13003, crossing sea 8509. 13267 is a mountain; 4242 does not exist. 8510 is a second sea (a canal joins two).
const PROV = { 13266: "land", 13003: "land", 13267: "land", 8509: "sea", 8510: "sea", 9001: "lake" };

console.log("\n-- a real strait still works --");
{
  const h = harness({ from: 13266, to: 13003, type: "sea", through: 8509, provinces: PROV });
  h.run("add");
  ok(h.writes.length === 1, "the link is written", h.writes);
  ok(h.writes[0].body.through === 8509, "…with the sea province as the crossing", h.writes[0]);
  ok(!/⚠/.test(h.last()), "…and no warning", h.last());
}
{
  const h = harness({ from: 13266, to: 13003, type: "sea", through: 9001, provinces: PROV });
  h.run("add");
  ok(h.writes.length === 1, "a LAKE crossing is a strait too, and is not warned about", h.last());
}

console.log("\n-- a crossing through a province that does not exist is refused --");
{
  const h = harness({ from: 13266, to: 13003, type: "sea", through: 4242, provinces: PROV });
  h.run("add");
  ok(h.writes.length === 0, "nothing is written", h.writes);
  ok(/no province 4242/i.test(h.last()), "…and it says which id it could not find", h.last());
}

console.log("\n-- …and so is a crossing through one of the two provinces being linked --");
{
  for (const thr of [13266, 13003]) {
    const h = harness({ from: 13266, to: 13003, type: "sea", through: thr, provinces: PROV });
    h.run("add");
    ok(h.writes.length === 0 && /THIRD province/.test(h.last()), `through = ${thr} is refused`, h.last());
  }
}

console.log("\n-- an empty crossing is still refused, as before --");
{
  const h = harness({ from: 13266, to: 13003, type: "sea", provinces: PROV });
  h.run("add");
  ok(h.writes.length === 0, "nothing is written", h.writes);
  ok(/needs a .through. province/i.test(h.last()), "…and says what is missing", h.last());
}

console.log("\n-- a LAND crossing between two SEAS is ALLOWED (it is a canal) but says what is still missing --");
{
  // ⭐ The half that must not become a refusal: Suez, Kiel and Panama are exactly this shape — two sea provinces through a land one
  // (Suez 5388 ↔ 803 through 1155; the corpus section below derives it from the installed game). (#a-link-shape-no-map-ships, B4-15)
  const h = harness({ from: 8509, to: 8510, type: "sea", through: 13267, provinces: PROV });
  h.run("add");
  ok(h.writes.length === 1, "the link is still written — refusing it would cry wolf on vanilla", h.writes);
  ok(/canal/i.test(h.last()), "…and the message says it is a canal, not a strait", h.last());
  ok(/adjacency_rules\.txt/.test(h.last()), "…and points at the file vanilla's three name a rule in", h.last());
  // ⚠ It must NOT claim HOI4 requires that rule. The wiki defines `through` only as "a province that serves
  // as a gateway" and says nothing about one; asserting a requirement is the same invented rule that made
  // writeAdjacency refuse every canal, vanilla's included (#a-canal-goes-through-land).
  ok(!/needs? a rule|also needs|required/i.test(h.last()),
    "…without inventing a requirement the wiki does not state", h.last());
  ok(/Linked 8509 ↔ 8510/.test(h.last()),
    "…while still confirming the link, in the SAME message so nothing overwrites the note", h.statuses);
}

console.log("\n-- a sea crossing between two LAND provinces through land is no canal, and no shipping map has one (B4-15, B4-6) --");
{
  const h = harness({ from: 13266, to: 13003, type: "sea", through: 13267, provinces: PROV });
  h.run("add");
  ok(h.writes.length === 1, "it is still written — the rule for it is a warning, and so is the click", h.writes);
  ok(!/this is a canal rather than a strait/.test(h.last()), "…and it is not called a canal", h.last());
  ok(/no shipping map has a row of that shape/.test(h.last()), "…but said as the shape no shipping map has", h.last());
}

console.log("\n-- an impassable border needs no crossing at all --");
{
  const h = harness({ from: 13266, to: 13003, type: "impassable", provinces: PROV });
  h.run("add");
  ok(h.writes.length === 1, "it is written", h.writes);
  ok(h.writes[0].body.through === -1, "…with through = -1, as vanilla writes it", h.writes[0]);
}

console.log("\n-- the rule matches the SHIPPED game, derived from its own adjacencies.csv --");
{
  const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const adjF = path.join(game, "map", "adjacencies.csv");
  const defF = path.join(game, "map", "definition.csv");
  if (!fs.existsSync(adjF) || !fs.existsSync(defF)) {
    console.log("  --   the base game is not installed here; corpus checks skipped");
  } else {
    const types = new Map();
    for (const line of fs.readFileSync(defF, "utf8").split(/\r?\n/)) {
      const c = line.split(";");
      const id = parseInt(c[0], 10);
      if (Number.isFinite(id) && c.length >= 5) types.set(id, (c[4] || "").trim().toLowerCase());
    }
    let sea = 0, missing = 0, selfThrough = 0, landThrough = 0, landWithRule = 0, landThroughSeaEnds = 0;
    for (const line of fs.readFileSync(adjF, "utf8").split(/\r?\n/)) {
      const c = line.split(";");
      if (c.length < 4 || (c[2] || "").trim().toLowerCase() !== "sea") continue;
      sea++;
      const thr = parseInt(c[3], 10), from = parseInt(c[0], 10), to = parseInt(c[1], 10);
      if (!Number.isFinite(thr) || !types.has(thr)) { missing++; continue; }
      if (thr === from || thr === to) selfThrough++;
      const t = types.get(thr);
      if (t !== "sea" && t !== "lake") { landThrough++; if ((c[8] || "").trim()) landWithRule++; if (types.get(from) === "sea" && types.get(to) === "sea") landThroughSeaEnds++; }
    }
    ok(sea > 100, `the game ships ${sea} sea adjacencies to check against`, sea);
    ok(missing === 0, "NONE of them crosses a province that does not exist — so refusing that cries no wolf", missing);
    ok(selfThrough === 0, "NONE crosses one of its own two endpoints — so refusing that cries no wolf either", selfThrough);
    ok(landThrough > 0, `${landThrough} DO cross land — which is why that one is a note, not a refusal`, landThrough);
    ok(landThrough === landThroughSeaEnds, `…and every one of them joins two SEA provinces: a canal; two land ends through land is none (B4-15)`, { landThrough, landThroughSeaEnds });
    ok(landThrough === landWithRule,
      "…and every single one of those carries an adjacency rule name — they are the canals", { landThrough, landWithRule });
  }
}

console.log(`\n=== a strait crosses a province that exists: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
