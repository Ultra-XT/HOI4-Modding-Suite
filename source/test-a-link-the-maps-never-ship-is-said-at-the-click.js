// ⛔ #a-link-shape-no-map-ships (B4-6, B4-15) and #a-removed-link-says-the-railway-it-cuts (B4-7) — THE 🔗 CLICK SAYS WHAT MAP ERRORS WILL SAY.
//
// B4-6: 🔗 Add wrote rows of three shapes no shipping map has — `sea` between two land provinces through a land one, `sea` between two seas
// through a sea one, `impassable` with a sea end — and nothing said a word; the data part (group b) adds adjacency_shape_no_map_ships, a
// warning, with its predicate adjacencyShapeNoMapShips. The click now asks the page's copy of that predicate of its own province types and
// says it in the rule's words, before the Save writes the row. B4-15: the Add note called land/land through land "a canal rather than a
// strait"; a canal joins two SEA provinces through a land one (vanilla's Suez 5388 ↔ 803 through 1155), so only that is called one.
// B4-7: 🔗 Remove of a row a railway crosses (Japan–Kyushu 11985↔1025) left railway_link_not_neighbours and said nothing at the click; it
// now names each railway that ran across the link when the two provinces do not touch on the map.
//
// RUN, not grepped: the page's own adjApply, adjacencyShapeNoMapShips and railLinkReason (lifted from public/map.js). The page's predicate is
// held against the server's own, every type and every end, wherever map-data.js exports it (group b's branch; both after the merge).
"use strict";
const P = require("./testlib-map-page.js");
const md = require("./map-data.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

// provinces: 1, 2, 3, 7, 8 land; 4, 5, 6 sea; 9 lake
const TYPES = new Map([[1, "land"], [2, "land"], [3, "land"], [7, "land"], [8, "land"], [4, "sea"], [5, "sea"], [6, "sea"], [9, "lake"]]);
function page({ railways = [], adjacencies = [], touches = false } = {}) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, Object.assign(P.element(), { dataset: {} })); return els.get(id); };
  const pg = P.runPage(["function adjacencyShapeNoMapShips(", "function adjApply(action)", "function railLinkReason(a, b, touch)", "function queueWrite(url, body, meta)"], P.loadGlobals({
    $, model: { adjacencies: adjacencies.map((a) => Object.assign({}, a)), railways: railways.map((r) => ({ level: r.level, provinces: r.provinces.slice() })) },
    provinceType: TYPES, pendingWrites: [], pushUndo: () => {}, closeAdjPanel: () => {}, adjFirst: null, draw: () => {},
    pidGrid: new Int32Array(4), imgW: 2, imgH: 2, railLinkTouches: (pairs) => pairs.map(() => ({ saved: touches, painted: touches })),
  }));
  pg.click = (action, from, to, type, through) => {
    const panel = $("mapAdjPanel"); panel.dataset.from = String(from); panel.dataset.to = String(to);
    $("mapAdjType").value = type; $("mapAdjThrough").value = through == null ? "" : String(through);
    pg.sb.adjApply(action);
    return String(pg.statuses[pg.statuses.length - 1] || "");
  };
  return pg;
}

console.log("\n=== the page's predicate is the rule's ===");
{
  const pagePred = page().sb.adjacencyShapeNoMapShips;
  const typeOf = (p) => TYPES.get(p);
  const ends = [1, 4, 9], kinds = ["sea", "impassable", "", "lake"], throughs = [-1, 3, 6, 9];
  const cases = [];
  for (const kind of kinds) for (const a of ends) for (const b of ends) for (const t of throughs) cases.push({ type: kind, from: a, to: b === a ? b + 1 + (b === 1 ? 1 : 0) : b, through: t });
  // known answers, from the rule's own definition (map-data.js adjacencyShapeNoMapShips' header)
  ok((pagePred({ type: "sea", from: 1, to: 2, through: 3 }, typeOf) || {}).shape === "dried-strait", "⭐ sea between two land provinces through land is a dried strait");
  ok((pagePred({ type: "sea", from: 4, to: 5, through: 6 }, typeOf) || {}).shape === "drowned-strait", "⭐ sea between two seas through sea is a drowned strait");
  ok((pagePred({ type: "impassable", from: 1, to: 4, through: -1 }, typeOf) || {}).shape === "wall-in-the-sea", "⭐ impassable with a sea end is a wall in the sea");
  ok(pagePred({ type: "sea", from: 4, to: 5, through: -1 }, typeOf) === null && pagePred({ type: "sea", from: 1, to: 2, through: 9 }, typeOf) === null && pagePred({ type: "sea", from: 1, to: 2, through: 4 }, typeOf) === null,
    "…and what shipping maps do have is not (sea between seas with no through, sea between land through a lake, a strait)");
  if (typeof md.adjacencyShapeNoMapShips === "function") {
    const differ = cases.filter((c) => JSON.stringify(pagePred(c, typeOf)) !== JSON.stringify(md.adjacencyShapeNoMapShips(c, typeOf)));
    ok(differ.length === 0, `⭐⭐⭐ the page's predicate answers as the server's for all ${cases.length} rows of every type and end`, differ.slice(0, 4));
  } else {
    console.log("  (map-data.js exports no adjacencyShapeNoMapShips in this tree: the rule is group b's part, held against the page's here once both are merged)");
  }
}

console.log("\n=== 🔗 Add says a shape no shipping map has, and calls only a canal a canal ===");
{
  const pg = page();
  const dried = pg.click("add", 1, 2, "sea", 3);
  ok(pg.sb.pendingWrites.length === 1 && pg.sb.pendingWrites[0].body.action === "add", "THE CONTROL: the link is queued as asked (a warning, as the rule is)", pg.sb.pendingWrites.map((w) => w.body));
  ok(/⚠ That is a sea crossing between two land provinces through a land one, a dried strait: no shipping map has a row of that shape/.test(dried), "⭐⭐⭐ land/land through land is said, in the rule's words", dried);
  ok(!/canal rather than a strait/.test(dried), "⭐⭐ …and is no longer called a canal (B4-15)", dried);
  const canal = page().click("add", 4, 5, "sea", 3);
  ok(/Province 3 is land, so this is a canal rather than a strait/.test(canal) && !/no shipping map has/.test(canal), "⭐⭐ sea/sea through land is a canal, and said as one", canal);
  const drowned = page().click("add", 4, 5, "sea", 6);
  ok(/a sea crossing between two sea provinces through a sea one, a drowned strait: no shipping map has/.test(drowned), "⭐ sea/sea through sea is said", drowned);
  const wall = page().click("add", 1, 4, "impassable", "");
  ok(/an impassable border with a sea end, a wall in the sea: no shipping map has/.test(wall), "⭐ impassable with a sea end is said", wall);
  const strait = page().click("add", 1, 2, "sea", 4);
  ok(!/no shipping map has|canal rather than/.test(strait) && /🔗 Linked 1 ↔ 2 \(sea\)/.test(strait), "…and a strait, the shape every map ships, is said as it always was", strait);
}

console.log("\n=== 🔗 Remove names the railway it cuts ===");
{
  const adj = [{ from: 1, to: 2, type: "sea", through: 4 }];
  const pg = page({ railways: [{ level: 2, provinces: [7, 1, 2, 8] }, { level: 1, provinces: [7, 8] }], adjacencies: adj, touches: false });
  const line = pg.click("remove", 2, 1, "sea", 4);
  ok(pg.sb.pendingWrites.length === 1 && pg.sb.pendingWrites[0].body.action === "remove", "THE CONTROL: the remove is queued", pg.sb.pendingWrites.map((w) => w.body));
  ok(/⚠ the level-2 railway 7 1 2 8 runs from 2 to 1 across this link, and the two do not touch on the map/.test(line), "⭐⭐⭐ the line names the railway that ran across the link", line);
  ok(/the game drops that link/.test(line) && /Undo puts the link back; or Save, then 🔧 Auto-fix all splits it there\./.test(line), "⭐⭐ …says what the game does and what clears it", line);
  ok(!/railway 7 8/.test(line), "…and not a railway that does not use the pair", line);
  const touching = page({ railways: [{ level: 2, provinces: [7, 1, 2, 8] }], adjacencies: adj, touches: true }).click("remove", 1, 2, "sea", 4);
  ok(!/railway/.test(touching), "⭐ provinces that touch on the map keep their link: nothing to say", touching);
  const none = page({ railways: [{ level: 1, provinces: [7, 8] }], adjacencies: adj }).click("remove", 1, 2, "sea", 4);
  ok(!/railway/.test(none) && /^Removed the 1 ↔ 2 adjacency — unsaved, click 💾 Save\.$/.test(none), "…and a remove no railway crosses says what it always said", none);
}

console.log("\n=== the 🌊 Sea card says who crosses a strait and who a canal (B4-15) ===");
{
  const html = require("fs").readFileSync(require("path").join(__dirname, "public", "map.html"), "utf8");
  const at = html.indexOf('data-adj-type="sea"'), card = at < 0 ? "" : html.slice(at, html.indexOf("</button>", at));
  ok(!!card, "the Sea card is on the page");
  ok(!/like a strait or a canal|a land one for a canal/.test(card) && /canal lets ships cross between two sea provinces through a land one/.test(card) && /strait lets land units cross between two land provinces through a sea one/.test(card),
    "⭐⭐ land units cross a strait, ships a canal: the card no longer says land units cross a canal", card.replace(/\s+/g, " ").slice(0, 300));
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
