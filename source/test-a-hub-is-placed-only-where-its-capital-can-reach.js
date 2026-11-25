// ⛔ #a-hub-only-where-its-capital-reaches — A SUPPLY HUB GOES ONLY WHERE ITS OWN COUNTRY'S CAPITAL REACHES IT: BY ITS OWN LAND, OR BY A
// SEA ROUTE BETWEEN TWO OF ITS OWN HARBOURS.
//
// generateSupplyNetwork's `routable` flooded every owner's land as one landmass and counted anybody's port: a state on land its
// capital could reach only through another country's land, or by another country's harbour, was hubbed — 107 of TEST 33's 515 hubs,
// where the rail planner's own rule says a railway through another country's land is not one the capital can use
// (#a-country-reaches-its-hubs-by-its-own-rail), and the game gives such a hub "No supply connection from Capital". Judged by the
// owner's own land and harbours the shipping maps put almost none there: base 2 (PRC, no capital line), MD 0, R56 0, NV 3.
//
// Pinned on a mod of cells over a layer below whose hubs say: every city state, one rural state in five.
//   A  its capital's land on the west (AC, a city, and two rural states), and AE — its largest rural state, first in the rural order
//      — on the east landmass, walled in behind B's land from A's own;
//   B  the rest of the east landmass, with a harbour on it.
//   V1. A has a harbour at home, none on AE's piece, and B one on the shared landmass: AE gets no hub — the landmass is not A's;
//   V2. A has a harbour on AE's piece and none at home: AE gets no hub — no convoy leaves a capital with no harbour;
//   V3. A has both: AE is reached by sea, and takes the rural slot.
// In V1 and V2 the rural slot goes to the next state in the rural order whose own country reaches it. Every expected value is derived from the fixture's
// files, never typed in. Fixture-only: binds no port.
// Run: node test-a-hub-is-placed-only-where-its-capital-can-reach.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hub-capital-reach-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];

// ── the layer below: a text world of big states, every city hubbed and one rural state in five ─────────────────────────────────────
const SPEC = [{ category: "city", n: 2, hubbed: 2 }, { category: "rural", n: 5, hubbed: 1 }];
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
const rateOf = (cat) => { const s = SPEC.find((x) => x.category === cat); return s.hubbed / s.n; };

// ── the mod: cells of 8 px, id = row * COLS + col + 1, sea round everything ────────────────────────────────────────────────────────
const COLS = 16, ROWS = 6, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   name, category, owner, provinces — the west landmass cols 1-3, the east one cols 6-13, sea between and round both
const STATES = [
  { name: "AC", category: "city", owner: "AAA", provinces: cells([1, 2, 3], [2]) },
  { name: "AR1", category: "rural", owner: "AAA", provinces: cells([1, 2, 3], [1]) },
  { name: "AR2", category: "rural", owner: "AAA", provinces: cells([1, 2, 3], [3]) },
  { name: "BC", category: "city", owner: "BBB", provinces: cells([6, 7, 8, 9], [1]) },
  { name: "BR1", category: "rural", owner: "BBB", provinces: cells([6, 7, 8, 9], [2]) },
  { name: "BR2", category: "rural", owner: "BBB", provinces: cells([6, 7, 8, 9], [3]) },
  { name: "BR3", category: "rural", owner: "BBB", provinces: cells([10, 11, 12, 13], [1]).concat(cells([10], [2])) },
  { name: "AE", category: "rural", owner: "AAA", provinces: cells([10, 11, 12, 13], [3]).concat(cells([11, 12, 13], [2])) },
].map((s, k) => ({ ...s, id: k + 1 }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
const vpOf = (s) => s.provinces[0];
// the harbours each variant writes: { state name: province }
const PORT = { AHome: [S.AC.name, idAt(1, 2)], AEast: [S.AE.name, idAt(12, 3)], B: [S.BR1.name, idAt(6, 2)] };
const VARIANTS = [
  { label: "V1", ports: [PORT.AHome, PORT.B], aeReached: false },
  { label: "V2", ports: [PORT.AEast, PORT.B], aeReached: false },
  { label: "V3", ports: [PORT.AHome, PORT.AEast, PORT.B], aeReached: true },
];

function makeMod(tag, ports) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="hub reach"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(idAt(Math.floor(x / CELL), Math.floor(y / CELL)))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  for (const s of STATES) {
    const mine = ports.filter(([n]) => n === s.name).map(([, p]) => p);
    const b = mine.length ? `\t\tbuildings = {\n${mine.map((p) => `\t\t\t${p} = {\n\t\t\t\tnaval_base = 2\n\t\t\t}\n`).join("")}\t\t}\n` : "";
    write(m, `history/states/${s.id}-S.txt`, `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=${s.owner}\n\t\tvictory_points = { ${vpOf(s)} 3 }\n${b}\t}\n}\n`);
  }
  write(m, "history/countries/AAA - A.txt", `capital = ${S.AC.id}\n`);
  write(m, "history/countries/BBB - B.txt", `capital = ${S.BC.id}\n`);
  return m;
}

// ── by the fixture: each owner's own land in pieces, four-neighbour cells, sea between ──────────────────────────────────────────────
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
const massOf = (() => {   // …and the land as one landmass, whoever owns it: the rule this replaces
  const out = new Map();
  for (const p of LAND) { if (out.has(p)) continue; const q = [p]; out.set(p, p);
    while (q.length) { const u = q.pop(), c = (u - 1) % COLS; for (const v of [c > 0 ? u - 1 : -1, c < COLS - 1 ? u + 1 : -1, u - COLS, u + COLS]) if (LAND.has(v) && !out.has(v)) { out.set(v, p); q.push(v); } } }
  return out;
})();
const first = (a, b) => b.provinces.length - a.provinces.length || a.id - b.id;   // the rural order: no towns here, so size, then id
const reached = (s, ports) => {
  const cap = s.owner === "AAA" ? S.AC : S.BC, capPiece = pieceOf.get(cap.provinces[0]);
  const own = ports.filter(([n]) => S[n].owner === s.owner).map(([, p]) => pieceOf.get(p));
  return s.provinces.some((p) => pieceOf.get(p) === capPiece || (own.includes(capPiece) && own.includes(pieceOf.get(p))));
};

console.log("\n-- the fixture can tell right from wrong --");
ok(pieceOf.get(S.AE.provinces[0]) !== pieceOf.get(S.AC.provinces[0]) && massOf.get(S.AE.provinces[0]) === massOf.get(S.BR1.provinces[0]),
  "(the fixture: AE is not on A's capital's piece, and shares a landmass with B's harbour)");
ok(S.AE.provinces.every((p) => S.AE.provinces.concat(...STATES.filter((s) => s.owner === "BBB").map((s) => s.provinces)).includes(p))
  && [...LAND].filter((p) => massOf.get(p) === massOf.get(S.AE.provinces[0])).every((p) => ownerAt.get(p) === "BBB" || S.AE.provinces.includes(p)),
  "(the fixture: the east landmass is B's land and AE alone)");
const rural = STATES.filter((s) => s.category === "rural").sort(first);
const want = Math.round(rateOf("rural") * rural.length);
ok(rural[0] === S.AE && want === 1, `(the fixture: AE is first in the rural order, and the share below gives the rural states ${want} slot)`, rural.map((s) => s.name));

for (const V of VARIANTS) {
  console.log(`\n-- ${V.label}: harbours on ${V.ports.map(([n, p]) => `${n} (${p})`).join(", ")} --`);
  const mod = makeMod("mod-" + V.label, V.ports);
  const r = md.generateSupplyNetwork({ modRoot: mod, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id), dryRun: true });
  const hubs = new Set((r.newHubs || []).map((h) => h.province));
  const hubbed = (s) => s.provinces.some((p) => hubs.has(p));
  ok(r && r.dryRun && r.density && r.density.fromLayerBelow === true && r.density.topUp === 0, "(guard: the layer below chose, and nothing was added for area)", r && (r.error || r.density));
  ok(reached(S.AE, V.ports) === V.aeReached, `(the fixture: by A's own land and harbours, AE is ${V.aeReached ? "" : "NOT "}reached)`);
  // the rural slot: the first of the rural order its country reaches
  const slot = rural.filter((s) => reached(s, V.ports))[0];
  if (!V.aeReached) {
    ok(!hubbed(S.AE), `⭐⭐ ${V.label}: AE gets no hub — ${V.label === "V1" ? "the landmass it shares with B's harbour is not A's" : "A's capital has no harbour to send a convoy from"}`, [...hubs]);
    ok(hubbed(slot) && slot !== S.AE, `⭐ …and the rural slot goes to the next in the order its country reaches, ${slot.name}`, { slot: slot.name, hubs: [...hubs] });
    ok(r.density.unroutable >= 1, "…and the report counts AE among the states its country cannot reach", r.density);
  } else {
    ok(hubbed(S.AE) && slot === S.AE, "⭐⭐ V3: with a harbour at home and one on its piece, AE is reached by sea and takes the rural slot", [...hubs]);
  }
  const ruralHubbed = rural.filter((s) => s.provinces.some((p) => hubs.has(p) && p === vpOf(s)));
  ok(ruralHubbed.length === want, `per kind: ${want} rural state(s) hold a hub on their victory point, round(${rateOf("rural")} × ${rural.length})`, ruralHubbed.map((s) => s.name));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
