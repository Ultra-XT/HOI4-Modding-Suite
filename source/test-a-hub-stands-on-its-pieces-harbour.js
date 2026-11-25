// ⛔ #a-hub-stands-on-its-pieces-harbour — A COUNTRY WHOSE LAND LIES IN MORE THAN ONE PIECE HUBS EACH HUBBED PIECE ON ITS HARBOUR.
//
// A hub is fed only over its own country's rail to the capital or to a naval base (00_defines NSupply), and the rail pass lays rail
// only between hubs, so a piece of a country's land whose hubs all stand off its harbour is cut off from the convoy that would feed
// it: TEST 33's SOV and DEN capitals' pieces, and ENG's, FRA's and DEN's largest other pieces. The base game puts a hub ON a harbour
// of 28 of its 28 multi-piece capitals' pieces and 17 of the 20 other pieces holding hubs and a harbour, and its rail reaches the
// harbour on 28/28 and 20/20. So chooseSupplyHubs (step 1b) puts a hub on the best harbour of each such piece, and the owner rail
// pass joins the piece's other hubs to it. Only where the base game does:
//   · only an owner with land on MORE than one piece — the base game's one-piece SYR, SAU, JOR and COL hold hubs and a harbour with
//     no rail between, and launch;
//   · only a piece that holds a hub already — the base game's other 165 pieces holding a harbour hold no hub at all;
//   · only a piece its country reaches (a hub its capital cannot feed is the bug #a-hub-only-where-its-capital-reaches fixes);
//   · not when a hub stands on one of its harbours already; and the best harbour: the highest level, then the lowest id.
// Asked twice: after the capitals, and again after the shares, for the pieces they hubbed.
//   PART 1, the chooser alone, on hand-written records — one check per clause;
//   PART 2, generateSupplyNetwork as Generate land asks it (a dry run on a mod of cells over a layer below whose hubs say: every
//   city, no rural state): the hub on each hubbed piece's harbour, and a railway from the piece's other hubs to it.
// Every expected value is read off the fixture. Fixture-only: binds no port.
// Run: node test-a-hub-stands-on-its-pieces-harbour.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hub-harbour-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

console.log("\n-- PART 1: the chooser, one clause at a time --");
{
  // pieces of AAA's land: P1 its capital's, P2 two cities and a harbour on neither, P3 an islet with a harbour and no hub,
  // P4 land its capital does not reach (an inherited hub on it), P5 a city whose hub stands on one of its two harbours.
  // ZZZ: one piece, a harbour off its capital's hub.
  const R = (id, category, owner, piece, provinces, ports = []) => ({ id, category, owner, piece, provinces, vpValue: 0, urban: false, ports });
  const recs = [
    R(1, "city", "AAA", 1, [101, 102, 103], [{ province: 102, level: 2 }]),
    R(2, "rural", "AAA", 1, [104, 105], [{ province: 104, level: 4 }]),
    R(3, "city", "AAA", 2, [201, 202]),
    R(4, "city", "AAA", 2, [203, 204]),
    R(5, "rural", "AAA", 2, [205, 206], [{ province: 205, level: 1 }]),
    R(6, "rural", "AAA", 3, [301, 302], [{ province: 301, level: 1 }]),
    R(7, "rural", "AAA", 4, [501, 502], [{ province: 502, level: 2 }]),
    R(8, "city", "AAA", 5, [601, 602, 603], [{ province: 601, level: 3 }, { province: 603, level: 5 }]),
    R(9, "city", "ZZZ", 9, [401, 402]),
    R(10, "rural", "ZZZ", 9, [403, 404], [{ province: 403, level: 3 }]),
  ];
  const pieceAt = new Map(); for (const r of recs) for (const p of r.provinces) pieceAt.set(p, r.piece);
  const piecesOf = (t) => new Set(recs.filter((r) => r.owner === t).map((r) => r.piece)).size;
  const RATE = { city: 1, rural: 0 };
  const args = { states: recs, rateOf: (c) => RATE[c], capitalStateIds: [1, 9], routable: (s) => s.piece !== 4, hubs: [501],
    hubProvinceOf: (s) => s.provinces[0], portsOf: (s) => s.ports, pieceOf: (p) => (pieceAt.has(p) ? pieceAt.get(p) : null), piecesOf };
  const r = md.chooseSupplyHubs(args);
  const got = new Set(r.hubs.map((h) => h.province));
  const on = (piece) => recs.filter((x) => x.piece === piece).flatMap((x) => x.ports).filter((pt) => got.has(pt.province)).map((pt) => pt.province);
  const best = (piece) => recs.filter((x) => x.piece === piece).flatMap((x) => x.ports).sort((a, b) => b.level - a.level || a.province - b.province)[0].province;
  ok(piecesOf("AAA") === 5 && piecesOf("ZZZ") === 1, "(the fixture: AAA's land is five pieces, ZZZ's one)");
  ok(got.has(101) && got.has(best(1)) && best(1) === 104, `⭐⭐ the capital's piece: its hub, and one on its BEST harbour (${best(1)}, level 4) — not the lower id at level 2`, [...got]);
  ok(got.has(201) && got.has(203) && on(2).length === 1 && got.has(best(2)),
    `⭐⭐ a piece the shares hubbed (two cities, harbour on neither): a hub on its harbour ${best(2)} — the second ask`, [...got]);
  ok(on(3).length === 0 && ![301, 302].some((p) => got.has(p)), "⭐ an islet holding a harbour and no hub gets none: a harbour is a supply node of its own", [...got]);
  ok(on(4).length === 0, "⭐ land its capital does not reach gets no hub on its harbour, though an old hub stands on it", [...got]);
  ok(got.has(601) && !got.has(603), "⭐ a piece whose hub stands on one of its harbours gets no second one on a better harbour", [...got]);
  ok(got.has(401) && !got.has(403), "⭐⭐ ZZZ, all one piece: its harbour off the capital's hub gets none — SYR, SAU, JOR, COL", [...got]);
  ok(r.density.harbours === 2, "…and the report counts the two", r.density);
  // the same, with no piece facts: the chooser is as it was
  const bare = md.chooseSupplyHubs({ ...args, portsOf: null, pieceOf: null, piecesOf: null });
  ok(!bare.hubs.some((h) => [104, 205].includes(h.province)) && bare.density.harbours === 0, "(asked with no piece facts, no hub stands on a harbour)", bare.hubs);
}

// ── PART 2: generateSupplyNetwork as Generate land asks it ──────────────────────────────────────────────────────────────────────────
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
// the layer below: a text world of big states — every city hubbed, no rural state
const SPEC = [{ category: "city", n: 2, hubbed: 2 }, { category: "rural", n: 5, hubbed: 0 }];
function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  const rows = ["0;0;0;0;land;false;unknown;0"], hubs = [];
  let next = 1, id = 1;
  for (const s of SPEC) for (let k = 0; k < s.n; k++) {
    const provs = []; for (let i = 0; i < 10; i++) provs.push(next++);
    for (const p of provs) rows.push(`${p};${colour(p).join(";")};land;false;plains;1`);
    if (k < s.hubbed) hubs.push(provs[0]);
    write(g, `history/states/${id}-S.txt`, `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=ZZZ\n\t}\n}\n`);
    id++;
  }
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/supply_nodes.txt", hubs.map((p) => `1 ${p}`).join("\n") + "\n");
  return g;
}
const G = makeGame();
const hubRate = (cat) => { const s = SPEC.find((x) => x.category === cat); return s.hubbed / s.n; };

// the mod: cells of 8 px, id = row * COLS + col + 1, sea round everything
const COLS = 16, ROWS = 9, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   AAA: the west (its capital AC, a city whose star is off the harbour, which stands in AR), the east (two cities, the harbour in
//   ER, a rural state, on neither) and an islet AI with a harbour and nothing else; BBB: one piece, its harbour off its capital's hub
const STATES = [
  { name: "AC", category: "city", owner: "AAA", provinces: cells([1, 2, 3], [2, 3]) },
  { name: "AR", category: "rural", owner: "AAA", provinces: cells([1, 2, 3], [4]), port: idAt(3, 4) },
  { name: "E1", category: "city", owner: "AAA", provinces: cells([10, 11], [2, 3]) },
  { name: "E2", category: "city", owner: "AAA", provinces: cells([12, 13], [2, 3]) },
  { name: "ER", category: "rural", owner: "AAA", provinces: cells([10, 11, 12, 13], [4]), port: idAt(13, 4) },
  { name: "AI", category: "rural", owner: "AAA", provinces: cells([14], [7]), port: idAt(14, 7) },
  { name: "BC", category: "city", owner: "BBB", provinces: cells([5, 6, 7], [6]) },
  { name: "BR", category: "rural", owner: "BBB", provinces: cells([5, 6, 7], [7]), port: idAt(7, 7) },
].map((s, k) => ({ ...s, id: k + 1 }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
const vpOf = (s) => s.provinces[0];
const CAPITAL = { AAA: S.AC, BBB: S.BC };
function makeMod(tag) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="hub harbour"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(idAt(Math.floor(x / CELL), Math.floor(y / CELL)))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  for (const s of STATES) {
    const b = s.port ? `\t\tbuildings = {\n\t\t\t${s.port} = {\n\t\t\t\tnaval_base = 2\n\t\t\t}\n\t\t}\n` : "";
    write(m, `history/states/${s.id}-S.txt`, `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=${s.owner}\n\t\tvictory_points = { ${vpOf(s)} 3 }\n${b}\t}\n}\n`);
  }
  write(m, "history/countries/AAA - A.txt", `capital = ${S.AC.id}\n`);
  write(m, "history/countries/BBB - B.txt", `capital = ${S.BC.id}\n`);
  return m;
}
// by the fixture: each owner's own land in pieces, four-neighbour cells, sea between
const ownerAt = new Map(); for (const s of STATES) for (const p of s.provinces) ownerAt.set(p, s.owner);
const pieceOf = (() => {
  const out = new Map();
  for (const p of LAND) {
    if (out.has(p)) continue;
    const q = [p]; out.set(p, p);
    while (q.length) { const u = q.pop(), c = (u - 1) % COLS; for (const v of [c > 0 ? u - 1 : -1, c < COLS - 1 ? u + 1 : -1, u - COLS, u + COLS]) if (LAND.has(v) && !out.has(v) && ownerAt.get(v) === ownerAt.get(u)) { out.set(v, p); q.push(v); } }
  }
  return out;
})();
const piecesOfOwner = (t) => new Set(STATES.filter((s) => s.owner === t).flatMap((s) => s.provinces.map((p) => pieceOf.get(p)))).size;
// a piece the layer below hubs: one holding its country's capital or a city (every city below is hubbed, no rural state)
const hubbedPiece = (k) => STATES.some((s) => s.provinces.some((p) => pieceOf.get(p) === k) && (CAPITAL[s.owner] === s || hubRate(s.category) === 1));

console.log("\n-- PART 2: generateSupplyNetwork, as Generate land asks it --");
{
  ok(piecesOfOwner("AAA") === 3 && piecesOfOwner("BBB") === 1, "(the fixture: AAA's land is three pieces, BBB's one)");
  ok(vpOf(S.AC) !== S.AR.port && hubbedPiece(pieceOf.get(S.AR.port)) && hubbedPiece(pieceOf.get(S.ER.port)) && !hubbedPiece(pieceOf.get(S.AI.port)),
    "(the fixture: AAA's capital's piece and its east piece are hubbed below, off their harbours; the islet is not)");
  const mod = makeMod("mod");
  const r = md.generateSupplyNetwork({ modRoot: mod, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id), dryRun: true });
  const hubs = new Set((r.newHubs || []).map((h) => h.province));
  ok(r && r.dryRun && r.density && r.density.fromLayerBelow === true && r.density.topUp === 0, "(guard: the layer below chose, and nothing was added for area)", r && (r.error || r.density));
  const joined = (() => {
    const g = new Map(), link = (u, v) => { if (!g.has(u)) g.set(u, new Set()); g.get(u).add(v); };
    for (const row of (r.railRows || [])) for (let i = 1; i < row.provinces.length; i++) { link(row.provinces[i - 1], row.provinces[i]); link(row.provinces[i], row.provinces[i - 1]); }
    return (a) => { const seen = new Set([a]), q = [a]; while (q.length) { const u = q.shift(); for (const v of (g.get(u) || [])) if (!seen.has(v)) { seen.add(v); q.push(v); } } return seen; };
  })();
  for (const s of [S.AR, S.ER]) {
    const k = pieceOf.get(s.port);
    const own = [...hubs].filter((p) => pieceOf.get(p) === k && p !== s.port);
    ok(hubs.has(s.port), `⭐⭐ AAA's ${k === pieceOf.get(vpOf(S.AC)) ? "capital's" : "east"} piece: a hub on its harbour (${s.port})`, [...hubs]);
    const seen = joined(s.port);
    ok(own.length >= 1 && own.every((p) => seen.has(p)), `⭐⭐ …and the railway joins the piece's ${own.length} other hub(s) to it`, { own, rails: (r.railRows || []).map((x) => x.provinces) });
  }
  ok(!hubs.has(S.AI.port) && !S.AI.provinces.some((p) => hubs.has(p)), "⭐ the islet, holding a harbour and no hub, gets none", [...hubs]);
  ok(hubs.has(vpOf(S.BC)) && !hubs.has(S.BR.port), "⭐ BBB, all one piece: its capital's hub, and none on its harbour", [...hubs]);
  ok(r.density.harbours === 2, "…and the report counts the two", r.density);
  // what the page says: the hubs on a harbour stand on no victory point, so "each on its state's victory point" alone is not true
  let note = () => "(public/map.js has no generatedSupplyNote)";
  try { note = require("vm").runInNewContext(require("./testlib-map-page.js").lift("function generatedSupplyNote(") + "\ngeneratedSupplyNote", {}); } catch (e) { ok(false, "public/map.js has a generatedSupplyNote(res) to lift", e.message); }
  const said = note({ supplyNetwork: { ...r, hubs: r.hubs || (r.newHubs || []).length } });
  ok(/\b2 on the harbour of a piece of a country's land/.test(said), "⭐ the page says how many hubs went on a harbour", said);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
