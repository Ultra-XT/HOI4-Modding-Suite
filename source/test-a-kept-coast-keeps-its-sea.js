// A coast Generate land keeps stays a coast: the click keeps the fewest of its own ex-sea picks at sea between it and the ocean.
// #a-kept-coast-keeps-its-sea
//
// THE DEFECT. The owner's flow (Delete map, Generate land 35% seed 1, Auto-fix, Redraw regions) re-raised Portugal's homeland AND
// the Atlantic beside it, and gave that new land to others: 6 of Portugal's 7 pieces had no ocean coast, its capital's homeland
// among them, and 23 of the base game's 70 countries with an ocean coast had none at all (24.0% of owned land on pieces with no ocean
// coast; the base game 7.83%). Most were walled by other countries' OLD land as well as by raised sea, so no rule about who owns the
// raised land could reopen them.
//
// THE FIX, the half this file pins: keptCoastChannels, pure. Each piece of kept land (one owner, joined over the touching graph) that
// had a coast where it was land and touches no ocean now keeps the fewest walkable picks between it and the ocean at sea — the
// fewest chain in the world first, re-asked after each, so one chain can open two pieces. A chain walks only picks `mayOpen` allows
// (sea below), never anyone's old land; a piece that never had a coast, an ownerless piece, and a piece already on the ocean are
// left alone; a piece no chain reaches is said (`noWay`) and nothing is kept at sea for it.
//
// Every expectation is DERIVED on the hand grids below by an oracle written here — a breadth-first count of the fewest walkable
// picks between a piece and the ocean, and a flood of the sea left — never typed in.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keptcoast-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

// ── the hand worlds: one province per cell, touching its four neighbours ────────────────────────────────────────────────────────
//   ~  the ocean (sea, not picked)          p  a pick that was sea below (walkable)
//   A…Z  a pick that was land below, owned by that letter (lowercase letters other than p: ownerless old land)
//   #  old land with no owner (a pick)       .  a sea left out of the ocean (a kept inland sea: not the ocean)
// `coast` names which owners' land had a coast below; by default every old-land cell touching a ~ or p cell had one.
function world(rows) {
  const H = rows.length, W = rows[0].length, cell = new Map(), adj = new Map();
  const id = (x, y) => y * W + x + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rows[y][x], p = id(x, y);
    cell.set(p, c); adj.set(p, new Set());
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) adj.get(p).add(id(X, Y)); }
  }
  const picks = new Set([...cell].filter(([, c]) => c !== "~" && c !== ".").map(([p]) => p));
  const ocean = new Set([...cell].filter(([, c]) => c === "~").map(([p]) => p));
  const isOld = (p) => /[A-Z#]/.test(cell.get(p));
  const owner = (p) => (/[A-Z]/.test(cell.get(p)) ? cell.get(p) : "");
  const seaBelow = (p) => ["~", "p", "."].includes(cell.get(p));
  return { W, H, id, cell, adj, picks, ocean, isOld, owner, seaBelow };
}
const run = (w, opts = {}) => {
  const picks = new Set(w.picks);
  const r = md.keptCoastChannels({ picks, adj: w.adj, oceanBody: w.ocean, land: [...w.picks].filter(w.isOld), ownerOf: w.owner,
    hadCoast: opts.hadCoast || ((p) => [...w.adj.get(p)].some((q) => w.seaBelow(q))), mayOpen: (p) => !w.isOld(p) });
  return { r, picks };
};
// ── the oracle ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// the pieces of one owner's old land, joined over the grid
const piecesOf = (w) => {
  const seen = new Set(), out = [];
  for (const p of [...w.picks].sort((a, b) => a - b)) {
    if (seen.has(p) || !w.isOld(p) || !w.owner(p)) continue;
    const m = [p]; seen.add(p);
    for (let i = 0; i < m.length; i++) for (const q of w.adj.get(m[i])) if (!seen.has(q) && w.isOld(q) && w.owner(q) === w.owner(p)) { seen.add(q); m.push(q); }
    out.push({ tag: w.owner(p), provinces: m.sort((a, b) => a - b) });
  }
  return out;
};
// the ocean once `picks` are land: the ~ cells and every non-pick sea cell joined to them
const oceanAfter = (w, picks) => {
  const sea = (p) => !picks.has(p) && w.cell.get(p) !== ".";
  const out = new Set(w.ocean), q = [...w.ocean];
  for (let i = 0; i < q.length; i++) for (const r of w.adj.get(q[i])) if (!out.has(r) && sea(r)) { out.add(r); q.push(r); }
  return out;
};
const touches = (w, set, pc) => pc.provinces.some((p) => [...w.adj.get(p)].some((q) => set.has(q)));
// the fewest walkable picks between a piece and the ocean (Infinity: none)
const fewest = (w, pc, ocean, picks) => {
  if (touches(w, ocean, pc)) return 0;
  const walk = (p) => picks.has(p) && !w.isOld(p);
  const d = new Map(); let front = [];
  for (const p of pc.provinces) for (const q of w.adj.get(p)) if (walk(q) && !d.has(q)) { d.set(q, 1); front.push(q); }
  while (front.length) {
    const next = [];
    for (const c of front) {
      if ([...w.adj.get(c)].some((q) => ocean.has(q))) return d.get(c);
      for (const r of w.adj.get(c)) if (walk(r) && !d.has(r)) { d.set(r, d.get(c) + 1); next.push(r); }
    }
    front = next;
  }
  return Infinity;
};

// ── 1. Portugal: its coast below faced sea the click raised; the cheaper of two ways out is kept at sea, and only that ───────────
{
  const w = world([
    "~~~~~~~~~~~~",
    "~BBBBBBBBBpp",
    "~BAAAAApBBpp",
    "~BAAAAAppppp",
    "~BBBBBBBBBpp",
    "~~~~~~~~~~~~",
  ]);
  // A's only way out: through the p cells at (8,3)/(8,4), then (9,4) … B's ring is old land and never walked
  const A = piecesOf(w).find((pc) => pc.tag === "A");
  const want = fewest(w, A, w.ocean, w.picks);
  const { r, picks } = run(w);
  const after = oceanAfter(w, picks);
  // walled = the pieces with a coast below that touch no ocean once every pick is land: the oracle's count, A among them
  const walled = piecesOf(w).filter((pc) => !touches(w, oceanAfter(w, w.picks), pc));
  rec("1a. A was walled and is counted: exactly the oracle's walled pieces (" + walled.map((pc) => pc.tag).join() + ")", walled.some((pc) => pc.tag === "A") && r.walled === walled.length, r.walled);
  rec("1b. A touches the ocean after the click", touches(w, after, A));
  rec("1c. exactly the fewest picks between A and the ocean are kept at sea (oracle " + want + ")", r.leftSea.length === want, r.leftSea);
  rec("1d. every pick kept at sea was sea below — no old land is ever kept at sea", r.leftSea.every((p) => !w.isOld(p)));
  rec("1e. the picks lose exactly the chain", picks.size === w.picks.size - r.leftSea.length && r.leftSea.every((p) => !picks.has(p) && w.picks.has(p)));
  rec("1f. one channel, for A, of that length", r.channels.length === 1 && r.channels[0].tag === "A" && r.channels[0].chain.length === want && r.channels[0].provinces === A.provinces.length, r.channels);
  rec("1g. nothing is said to have no way", r.noWay.length === 0, r.noWay);
  rec("1h. the piece it opened is A, with its provinces (asked again once the states are owned, §12)", JSON.stringify(r.opened) === JSON.stringify([A]), r.opened);
}

// ── 2. walled by another country's OLD land alone: no chain exists, nothing is kept at sea, and it is said ──────────────────────
{
  const w = world([
    "~~~~~~~",
    "~BBBBB~",
    "~BAAAB~",
    "~BApAB~",
    "~BAAAB~",
    "~BBBBB~",
    "~~~~~~~",
  ]);
  const A = piecesOf(w).find((pc) => pc.tag === "A");
  rec("2a. the oracle finds no way out for A", fewest(w, A, w.ocean, w.picks) === Infinity);
  const { r, picks } = run(w);
  rec("2b. nothing is kept at sea", r.leftSea.length === 0 && picks.size === w.picks.size, r.leftSea);
  rec("2c. A is said to have no way", r.noWay.length === 1 && r.noWay[0].tag === "A" && r.noWay[0].provinces === A.provinces.length, r.noWay);
}
// …and a piece no chain reaches does not end the search for the pieces after it (review RK-1: with `break` for `continue` there,
// Millennium Dawn at 35% kept 24 channels where it keeps 84, and left 72 pieces walled where it leaves 3)
{
  const w = world([
    "~~~~~~~~~~~~",
    "~BBBBB~pppp~",
    "~BAAAB~pDDp~",
    "~BApAB~pppp~",
    "~BAAAB~~~~~~",
    "~BBBBB~~~~~~",
    "~~~~~~~~~~~~",
  ]);
  const ps = piecesOf(w), A = ps.find((pc) => pc.tag === "A"), D = ps.find((pc) => pc.tag === "D");
  const d = fewest(w, D, w.ocean, w.picks);
  rec("2d. (the fixture) A, which no way reaches, comes before D, which one does, in the pieces' order", A.provinces[0] < D.provinces[0] && fewest(w, A, w.ocean, w.picks) === Infinity && d < Infinity && d > 0, [A.provinces[0], D.provinces[0], d]);
  const { r, picks } = run(w);
  rec("2e. D is opened after A was found to have no way, by the fewest picks (oracle " + d + ")", touches(w, oceanAfter(w, picks), D) && r.leftSea.length === d, r.leftSea);
  rec("2f. one channel, D's, and A said to have no way", r.channels.length === 1 && r.channels[0].tag === "D" && r.noWay.length === 1 && r.noWay[0].tag === "A", [r.channels, r.noWay]);
  rec("2g. the pieces it opened: D, with its provinces — never A", JSON.stringify(r.opened) === JSON.stringify([{ tag: "D", provinces: D.provinces }]), r.opened);
}

// ── 3. a piece that never had a coast, an ownerless piece and a piece already on the ocean are left alone ──────────────────────
{
  const w = world([
    "~~~~~~~~~~",
    "~BBpBBpBB~",
    "~BAABB##B~",
    "~BAABBBBB~",
    "~BBBBBBBB~",
    "~CC~~~~~~~",
  ]);
  const { r, picks } = run(w, { hadCoast: (p) => w.owner(p) !== "A" });   // A was inland below (Bolivia)
  rec("3a. inland A: nothing kept at sea for it", !r.channels.some((c) => c.tag === "A"), r.channels);
  rec("3b. the ownerless # land: nothing kept at sea for it", r.channels.length === 0 && r.leftSea.length === 0 && picks.size === w.picks.size, r.channels);
  rec("3c. C on the ocean is not walled, and nothing is walled at all", r.walled === 0, r.walled);
  // …and with A's coast below, A IS opened
  const t = run(w);
  const A = piecesOf(w).find((pc) => pc.tag === "A");
  rec("3d. the same A with a coast below is opened by the fewest picks", t.r.leftSea.length === fewest(w, A, w.ocean, w.picks) && touches(w, oceanAfter(w, t.picks), A), t.r.leftSea);
}

// ── 4. one chain opens two pieces: the cheapest first, re-asked, so the second needs none ───────────────────────────────────────
{
  const w = world([
    "~~~~~~~~~~~",
    "~BBBBBBBBB~",
    "~BAApDDDBB~",
    "~BBBpBBBBB~",
    "~BBBpBBBBB~",
    "~BBBpBBBBB~",
    "~~~~~~~~~~~",
  ]);
  const ps = piecesOf(w), A = ps.find((pc) => pc.tag === "A"), D = ps.find((pc) => pc.tag === "D");
  const a = fewest(w, A, w.ocean, w.picks), d = fewest(w, D, w.ocean, w.picks);
  const { r, picks } = run(w);
  const after = oceanAfter(w, picks);
  rec("4a. both A and D open onto the ocean after the click", touches(w, after, A) && touches(w, after, D));
  rec("4b. ONE chain, of the fewest picks the cheaper needs (oracle A " + a + ", D " + d + ")", r.channels.length === 1 && r.leftSea.length === Math.min(a, d), r.channels);
  rec("4c. the walled count is both pieces", r.walled === 2, r.walled);
  rec("4d. …and both are the pieces it opened, with their provinces, in the pieces' order", JSON.stringify(r.opened) === JSON.stringify([A, D].sort((x, y) => x.provinces[0] - y.provinces[0])), r.opened);
}

// ── 5. the larger piece goes first on a tie, and a kept inland sea is not the ocean ─────────────────────────────────────────────
{
  const w = world([
    "~~~~~~~~~~",
    "~BBpBBpBB~",
    "~BAABBE.B~",
    "~BAABBBBB~",
    "~BBBBBBBB~",
    "~~~~~~~~~~",
  ]);
  const { r, picks } = run(w);
  const after = oceanAfter(w, picks);
  const ps = piecesOf(w), A = ps.find((pc) => pc.tag === "A"), E = ps.find((pc) => pc.tag === "E");
  rec("5a. both open onto the ocean, never onto the kept sea alone", touches(w, after, A) && touches(w, after, E));
  rec("5b. the first channel is the larger piece's on a tie of cost", r.channels.length >= 1 && r.channels[0].tag === "A", r.channels);
  rec("5c. E, touching only the kept sea and land, was walled and got its own chain", r.walled === 2 && r.channels.some((c) => c.tag === "E"), r.channels);
}

// ── 6. deterministic: the same inputs give the same chains, whatever order the land is listed in ────────────────────────────────
{
  const w = world([
    "~~~~~~~~~~~~",
    "~BBBBBBBBBpp",
    "~BAAAAApBBpp",
    "~BAAAAAppppp",
    "~BBBBBBBBBpp",
    "~~~~~~~~~~~~",
  ]);
  const one = run(w).r, picks2 = new Set(w.picks);
  const two = md.keptCoastChannels({ picks: picks2, adj: w.adj, oceanBody: w.ocean, land: [...w.picks].filter(w.isOld).reverse(), ownerOf: w.owner,
    hadCoast: (p) => [...w.adj.get(p)].some((q) => w.seaBelow(q)), mayOpen: (p) => !w.isOld(p) });
  rec("6a. the same chain however the land is listed", JSON.stringify(one.leftSea) === JSON.stringify(two.leftSea), [one.leftSea, two.leftSea]);
  // a click that raised every sea leaves no ocean: nothing to keep a way to, nothing kept at sea, nothing said walled
  const all = world(["ppp", "pAp", "ppp"]);
  const none = run(all, {}), allOcean = { ...all, ocean: new Set() };
  const r0 = md.keptCoastChannels({ picks: new Set(all.picks), adj: all.adj, oceanBody: allOcean.ocean, land: [...all.picks].filter(all.isOld), ownerOf: all.owner,
    hadCoast: () => true, mayOpen: (p) => !all.isOld(p) });
  rec("6b. no ocean: nothing kept at sea and nothing walled", none.r.leftSea.length === 0 && r0.leftSea.length === 0 && r0.walled === 0 && r0.noWay.length === 0, r0);
}

// ── 7. joinRaisedEnclaves: raised land settled from no coast of its own joins the land around it ────────────────────────────────
// One group per cell. Letters own groups; lowercase = raised (no owner below), uppercase = old land; ~ sea; _ a raised group nobody
// owns. The enclave rule's expectations are derived from the grid: a piece of one owner, all raised, touching no ~, not all of its
// owner's land.
{
  const grid = (rows) => {
    const H = rows.length, W = rows[0].length, id = (x, y) => y * W + x + 1, adj = new Map(), groups = [], ownerOf = new Map(), raised = new Set(), sea = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = rows[y][x], p = id(x, y);
      adj.set(p, new Set());
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) adj.get(p).add(id(X, Y)); }
      if (c === "~") { sea.add(p); continue; }
      groups.push({ id: p, provinces: [p] });
      if (c !== "_") ownerOf.set(p, c.toUpperCase());
      if (c === c.toLowerCase()) raised.add(p);
    }
    return { id, adj, groups, ownerOf, raised, sea };
  };
  // p's raised pair (4,2)-(5,2) sits inside e's raised land, no sea beside it; p also holds old land on the coast elsewhere
  const g = grid([
    "~~~~~~~~~",
    "~PPeeeee~",
    "~PPeppee~",
    "~eeeeeee~",
    "~~~~~~~~~",
  ]);
  const own = new Map(g.ownerOf);
  const moved = md.joinRaisedEnclaves({ groups: g.groups, raised: g.raised, ownerOf: own, adj: g.adj, seaNow: (p) => g.sea.has(p) });
  rec("7a. the walled raised pair of P joins E around it", own.get(g.id(4, 2)) === "E" && own.get(g.id(5, 2)) === "E", moved);
  rec("7b. said once, from P to E, two states", moved.length === 1 && moved[0].from === "P" && moved[0].to === "E" && moved[0].states === 2 && moved[0].provinces === 2, moved);
  rec("7c. P's old land is untouched", [g.id(1, 1), g.id(2, 1), g.id(1, 2), g.id(2, 2)].every((p) => own.get(p) === "P"));
  // the same pair touching the sea: not an enclave
  const s = grid([
    "~~~~~~~~~",
    "~PPeeeee~",
    "~PPepp~e~",
    "~eeeeeee~",
    "~~~~~~~~~",
  ]);
  const own2 = new Map(s.ownerOf);
  rec("7d. raised land with a coast of its own stays", md.joinRaisedEnclaves({ groups: s.groups, raised: s.raised, ownerOf: own2, adj: s.adj, seaNow: (p) => s.sea.has(p) }).length === 0);
  // old land inside another's land: never moved here
  const o = grid([
    "~~~~~~~~~",
    "~PPeeeee~",
    "~PPePPee~",
    "~eeeeeee~",
    "~~~~~~~~~",
  ]);
  const own3 = new Map(o.ownerOf);
  rec("7e. a walled piece of OLD land never changes hands here", md.joinRaisedEnclaves({ groups: o.groups, raised: o.raised, ownerOf: own3, adj: o.adj, seaNow: (p) => o.sea.has(p) }).length === 0 && own3.get(o.id(4, 2)) === "P");
  // all of a country's land: left, so the country is not emptied
  const a = grid([
    "~~~~~~~~~",
    "~eeeeeee~",
    "~eeeqqee~",
    "~eeeeeee~",
    "~~~~~~~~~",
  ]);
  const own4 = new Map(a.ownerOf);
  rec("7f. a country's only land is never taken", md.joinRaisedEnclaves({ groups: a.groups, raised: a.raised, ownerOf: own4, adj: a.adj, seaNow: (p) => a.sea.has(p) }).length === 0 && own4.get(a.id(4, 2)) === "Q");
  // a tie between two neighbours goes to the lower tag
  const t = grid([
    "~~~~~~~~~",
    "~PPffeee~",
    "~PPfpe~e~",
    "~~ffeeee~",
    "~~~~~~~~~",
  ]);
  const own5 = new Map(t.ownerOf);
  const tally = { E: 0, F: 0 };
  for (const q of t.adj.get(t.id(4, 2))) { const o5 = t.ownerOf.get(q); if (o5 === "E" || o5 === "F") tally[o5]++; }
  const want = tally.E > tally.F ? "E" : tally.F > tally.E ? "F" : "E";
  md.joinRaisedEnclaves({ groups: t.groups, raised: t.raised, ownerOf: own5, adj: t.adj, seaNow: (p) => t.sea.has(p) });
  rec("7g. the enclave goes to the owner its provinces touch most, a tie to the lower tag (derived: " + want + ")", own5.get(t.id(4, 2)) === want, own5.get(t.id(4, 2)));
  // without seaNow nothing is asked
  const own6 = new Map(g.ownerOf);
  rec("7h. without seaNow nothing moves", md.joinRaisedEnclaves({ groups: g.groups, raised: g.raised, ownerOf: own6, adj: g.adj }).length === 0);
  // two enclaves of one country that has no other land: one at a time, asked again after each, so the second is then all of its
  // land and stays — asked at once, both went and the country was emptied
  const two = grid([
    "~~~~~~~~~",
    "~eeeeeee~",
    "~epeeepe~",
    "~eeeeeee~",
    "~~~~~~~~~",
  ]);
  const own7 = new Map(two.ownerOf), ps7 = [two.id(2, 2), two.id(6, 2)];
  rec("7i. (the fixture) P's land is two raised enclaves, nothing else", [...two.ownerOf].filter(([, t]) => t === "P").map(([p]) => p).join() === ps7.join() && ps7.every((p) => two.raised.has(p) && ![...two.adj.get(p)].some((q) => two.sea.has(q))));
  const moved7 = md.joinRaisedEnclaves({ groups: two.groups, raised: two.raised, ownerOf: own7, adj: two.adj, seaNow: (p) => two.sea.has(p) });
  rec("7j. the first enclave (the lower group id) joins E, and P keeps the other: a country is never emptied", own7.get(ps7[0]) === "E" && own7.get(ps7[1]) === "P" && moved7.length === 1, [[...own7].filter(([p]) => ps7.includes(p)), moved7]);
  // …and EVERY enclave is asked, not only the first, and an enclave nothing owned touches does not end the asking (review RK3-2: with
  // one round, or `break` for `continue` there, every check above still passed — and on the owner's flow Portugal kept a 4-province,
  // 7,136 px enclave with no coast inside South Africa's and England's land). The oracle: the grid's enclaves as given, in lowest group
  // id order, each with the owner its provinces touch most ("" for none)
  const enclavesOf = (w) => {
    const landOf = new Map(), seen = new Set(), out = [];
    for (const [, t] of w.ownerOf) landOf.set(t, (landOf.get(t) || 0) + 1);
    for (const p of [...w.ownerOf.keys()].sort((a, b) => a - b)) {
      if (seen.has(p)) continue;
      const t = w.ownerOf.get(p), mem = [p]; seen.add(p);
      for (let i = 0; i < mem.length; i++) for (const q of w.adj.get(mem[i])) if (!seen.has(q) && w.ownerOf.get(q) === t) { seen.add(q); mem.push(q); }
      if (mem.length === landOf.get(t) || mem.some((q) => !w.raised.has(q) || [...w.adj.get(q)].some((r) => w.sea.has(r)))) continue;
      const tally = new Map();
      for (const q of mem) for (const r of w.adj.get(q)) { const o = w.ownerOf.get(r); if (o && o !== t) tally.set(o, (tally.get(o) || 0) + 1); }
      let to = "", n = 0;
      for (const o of [...tally.keys()].sort()) if (tally.get(o) > n) { to = o; n = tally.get(o); }
      out.push({ from: t, to, states: mem.length, provinces: mem.length, cells: mem, touches: new Set(mem.flatMap((q) => [...w.adj.get(q)])) });
    }
    return out;
  };
  const row = (e) => ({ from: e.from, to: e.to, states: e.states, provinces: e.provinces });
  // two enclaves: P's raised pair inside E's raised land, Q's raised province inside F's — both P and Q hold old land on the coast
  const tw = grid([
    "~~~~~~~~~~~~~~~",
    "~PPeeeee~QQfff~",
    "~PPeppee~QQfqf~",
    "~eeeeeee~ffff~~",
    "~~~~~~~~~~~~~~~",
  ]);
  const ek = enclavesOf(tw);
  rec("7k. (the fixture) two enclaves, each touching an owner, touching no province in common — so the order of asking cannot decide",
    ek.length === 2 && ek.every((e) => e.to) && ![...ek[0].touches].some((q) => ek[1].touches.has(q) || ek[1].cells.includes(q)), ek.map(row));
  const ownK = new Map(tw.ownerOf);
  const movedK = md.joinRaisedEnclaves({ groups: tw.groups, raised: tw.raised, ownerOf: ownK, adj: tw.adj, seaNow: (p) => tw.sea.has(p) });
  rec("7l. both enclaves join the land around them, one row each, in group order", JSON.stringify(movedK) === JSON.stringify(ek.map(row))
    && ek.every((e) => e.cells.every((q) => ownK.get(q) === e.to)), movedK);
  // the first enclave in group order touches no owned group (R's raised province ringed by raised land nobody owns), then P's enclave
  const nt = grid([
    "~~~~~~~~~~~~~",
    "~RR___~PPeee~",
    "~RR_r_~PPepe~",
    "~~~___~eeeee~",
    "~~~~~~~~~~~~~",
  ]);
  const en = enclavesOf(nt);
  rec("7m. (the fixture) the first enclave touches no owned land, a later one does", en.length === 2 && en[0].to === "" && en[0].from === "R" && en[1].to !== "", en.map(row));
  const ownN = new Map(nt.ownerOf);
  const movedN = md.joinRaisedEnclaves({ groups: nt.groups, raised: nt.raised, ownerOf: ownN, adj: nt.adj, seaNow: (p) => nt.sea.has(p) });
  rec("7n. an enclave with nothing to join does not stop the asking: the later one still joins, the first stays", JSON.stringify(movedN) === JSON.stringify(en.filter((e) => e.to).map(row))
    && en[1].cells.every((q) => ownN.get(q) === en[1].to) && en[0].cells.every((q) => ownN.get(q) === en[0].from), movedN);
}

// ── 8. assignGeneratedStateOwners: the coast's fronts leave an enclave, and the owner passes join it to the land around it ─────────
// A hand graph: P's old land 1 and E's old land 2 each on a sea (100, 101); state 3 = raised 10 (beside P, on P's sea) + 11, 12 (beside
// E, on E's sea); state 4 = raised 13, 14, 15 behind 10 and 11, on no sea. The coast's fronts give 13-15 P's label from 10, and state 3
// E's by majority, so state 4 is P's raised land inside E's with no sea: the fixture is checked from the graph, then the passes asked.
{
  const edges = [[1, 100], [1, 10], [10, 100], [2, 101], [2, 11], [2, 12], [11, 101], [12, 101], [10, 11], [11, 12], [10, 13], [11, 13], [13, 14], [14, 15]];
  const adj = new Map();
  for (const [a, b] of edges) for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); }
  const sea = new Set([100, 101]);
  const groups = [{ id: 1, provinces: [1] }, { id: 2, provinces: [2] }, { id: 3, provinces: [10, 11, 12] }, { id: 4, provinces: [13, 14, 15] }];
  const beneath = new Map([[1, { owner: "P" }], [2, { owner: "E" }]]);
  const onSea = (g) => g.provinces.some((p) => [...adj.get(p)].some((q) => sea.has(q)));
  rec("8a. (the fixture) state 4 is raised and on no sea; state 3 is on the sea", !onSea(groups[3]) && onSea(groups[2]) && groups[3].provinces.every((p) => !beneath.has(p)));
  const without = md.assignGeneratedStateOwners({ groups, beneath, adj });
  const with_ = md.assignGeneratedStateOwners({ groups, beneath, adj, seaNow: (p) => sea.has(p) });
  rec("8b. without seaNow the passes are the nearest-land ones: state 4 is P's, no coast report", without.ownerOf.get(4) === "P" && !without.fromCoast, [...without.ownerOf]);
  rec("8c. with seaNow state 3 is E's by the coast's majority", with_.ownerOf.get(3) === "E", [...with_.ownerOf]);
  rec("8d. …and P's enclave, state 4, joins E around it", with_.ownerOf.get(4) === "E", [...with_.ownerOf]);
  rec("8e. the coast report says so: P -> E, 1 state, 3 provinces", !!with_.fromCoast && JSON.stringify(with_.fromCoast.enclaves) === JSON.stringify([{ from: "P", to: "E", states: 1, provinces: 3 }]), with_.fromCoast);
  rec("8f. P's old land and E's are untouched", with_.ownerOf.get(1) === "P" && with_.ownerOf.get(2) === "E");
}
// …and raised land joined by land to its country's land ALREADY THERE (in no group: a second click, islands on an inherited map) is
// no enclave (review RK-3). The same graph, but P's province 1 is land the click did not make — not a group — P has a second
// generated piece far off (state 50 on province 20), and state 40 also touches province 1. Asked exactly as generateLand asks it.
{
  const edges = [[1, 100], [1, 10], [1, 13], [10, 100], [3, 101], [3, 11], [3, 12], [11, 101], [12, 101], [10, 11], [11, 12], [10, 13], [11, 13], [13, 14], [14, 15], [2, 102], [2, 20], [20, 102]];
  const graph = (list) => { const adj = new Map(); for (const [a, b] of list) for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); } return adj; };
  const sea = new Set([100, 101, 102]);
  const groups = () => [{ id: 30, provinces: [10, 11, 12] }, { id: 40, provinces: [13, 14, 15] }, { id: 50, provinces: [20] }];
  const beneath = new Map([[1, { owner: "P" }], [2, { owner: "P" }], [3, { owner: "E" }]]);
  const adj = graph(edges);
  const inGroups = new Set(groups().flatMap((g) => g.provinces));
  rec("8g. (the fixture) state 40 is raised, on no sea, and touches P's province 1, land in no group", groups()[1].provinces.every((p) => !beneath.has(p) && ![...adj.get(p)].some((q) => sea.has(q)))
    && !inGroups.has(1) && !sea.has(1) && [...adj.get(13)].includes(1));
  const r8 = md.assignGeneratedStateOwners({ groups: groups(), beneath, adj, seaNow: (p) => sea.has(p) });
  rec("8h. state 40 stays P's: joined by land to P's land already there, it is no enclave, and the report moves nothing", r8.ownerOf.get(40) === "P" && JSON.stringify(r8.fromCoast.enclaves) === "[]", [[...r8.ownerOf], r8.fromCoast.enclaves]);
  // CONTROL: without the link to province 1, state 40 is the enclave §8 joins to E — the fixture can tell the two apart
  const c8 = md.assignGeneratedStateOwners({ groups: groups(), beneath, adj: graph(edges.filter(([a, b]) => !(a === 1 && b === 13))), seaNow: (p) => sea.has(p) });
  rec("8i. CONTROL: with no land link to province 1, state 40 is an enclave and joins E", c8.ownerOf.get(40) === "E" && c8.fromCoast.enclaves.length === 1 && c8.fromCoast.enclaves[0].from === "P", [[...c8.ownerOf], c8.fromCoast.enclaves]);
}

// ── the Generate land worlds (§9, §12, §13): one 64-px province per cell, province = col + row × columns + 1, x wrapping ───────────
// `below` the layer below: ~ sea, a capital letter land held by that letter × 3 (one state per country, all its land in it).
// `regions` each cell's strategic region: any character but ".". `mod` the mod's own map before the click: "." sea — the world after
// Delete map, the default — # land nobody holds, a capital letter land held by that letter × 3 in a state of the mod's own. Every
// country has a history file naming its state. The ocean is the sea joined to the bottom-left cell.
const genWorld = (tag, { below, regions, mod = null }) => {
  const B = 64, ROWS = below.length, COLS = below[0].length, W = COLS * B, H = ROWS * B, N = COLS * ROWS;
  const at = (c, r) => ((c + COLS) % COLS) + r * COLS + 1;
  const cr = (p) => [(p - 1) % COLS, Math.floor((p - 1) / COLS)];
  const nbs = (p) => { const [c, r] = cr(p); return [at(c - 1, r), at(c + 1, r)].concat(r > 0 ? [at(c, r - 1)] : [], r < ROWS - 1 ? [at(c, r + 1)] : []); };
  const ch = (rows, p) => { const [c, r] = cr(p); return rows ? rows[r][c] : "."; };
  const ids = Array.from({ length: N }, (_, i) => i + 1);
  const where = (fn) => ids.filter((p) => fn(ch(below, p), ch(regions, p), ch(mod, p)));
  const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
  const bmp = () => {
    const rs = (W * 3 + 3) & ~3, size = rs * H, b = Buffer.alloc(54 + size);
    b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(size, 34);
    for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = COL(Math.floor(x / B) + Math.floor(y / B) * COLS + 1); b[o++] = bl; b[o++] = g; b[o++] = r; } }
    return b;
  };
  const csv = (isLand) => ["0;0;0;0;land;false;unknown;0"].concat(ids.map((p) => {
    const [r, g, b] = COL(p), l = isLand(p);
    return `${p};${r};${g};${b};${l ? "land" : "sea"};false;${l ? "plains" : "ocean"};${l ? 1 : 0}`;
  })).join("\n") + "\n";
  const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  const state = (id, owner, ps) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000000\n\tstate_category = rural\n\tprovinces = { ${ps.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t\tvictory_points = { ${ps[0]} 5 }\n\t}\n}\n`;
  const g = path.join(SANDBOX, "game-" + tag), m = path.join(SANDBOX, "mod-" + tag);
  mk(g, "map/provinces.bmp", bmp()); mk(g, "map/definition.csv", csv((p) => /[A-Z]/.test(ch(below, p))));
  [...new Set(ids.map((p) => ch(regions, p)).filter((k) => k !== "."))].forEach((k, i) =>
    mk(g, `map/strategicregions/${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${where((b, rg) => rg === k).join(" ")} }\n\tweather={}\n}\n`));
  const capital = new Map(), letters = (fn) => [...new Set(ids.map(fn).filter((c) => /[A-Z]/.test(c)))].sort();
  letters((p) => ch(below, p)).forEach((L, i) => { mk(g, `history/states/${i + 1}.txt`, state(i + 1, L.repeat(3), where((b) => b === L))); capital.set(L.repeat(3), i + 1); });
  mk(m, "descriptor.mod", 'version="1"\nname="Kept coast"\nreplace_path="history/states"\npath="mod/keptcoast"\n');
  mk(m, "map/provinces.bmp", bmp()); mk(m, "map/definition.csv", csv((p) => ch(mod, p) !== "."));
  letters((p) => ch(mod, p)).forEach((L, i) => { mk(m, `history/states/${50 + i}.txt`, state(50 + i, L.repeat(3), where((b, rg, o) => o === L))); capital.set(L.repeat(3), 50 + i); });
  for (const [t, id] of capital) mk(g, `history/countries/${t} - ${t}land.txt`, `capital = ${id}\n`);
  const eligible = where((b, rg, o) => rg !== "." && o === ".");
  // the ocean once `land` is land: the sea joined to the bottom-left cell
  const oceanIf = (land) => { const out = new Set([at(0, ROWS - 1)]), q = [...out]; for (let i = 0; i < q.length; i++) for (const r of nbs(q[i])) if (!out.has(r) && !land.has(r)) { out.add(r); q.push(r); } return out; };
  const typesNow = () => new Map(fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => +c[0] > 0).map((c) => [+c[0], c[4]]));
  const landNow = () => new Set([...typesNow()].filter(([, v]) => v === "land").map(([p]) => p));
  // the states written: [{ owner, provinces }] — the mod's own and the click's
  const statesNow = () => fs.readdirSync(path.join(m, "history", "states")).map((f) => fs.readFileSync(path.join(m, "history", "states", f), "utf8"))
    .map((s) => ({ owner: ((/owner\s*=\s*([A-Z0-9_]+)/.exec(s) || [])[1] || ""), provinces: (((/provinces\s*=\s*\{([^}]*)\}/.exec(s) || [])[1] || "").match(/\d+/g) || []).map(Number) }));
  const touchesAny = (ps, set) => ps.some((p) => nbs(p).some((q) => set.has(q)));
  return { g, m, at, nbs, where, eligible, oceanIf, typesNow, landNow, statesNow, touchesAny };
};
const GEN = (w, extra) => Object.assign({ modRoot: w.m, gameRoot: w.g, dependencyRoots: [], count: w.eligible.length, provincesPerState: 8, seed: 3, ownerMode: "inherit", roughenCoast: false }, extra || {});

// ── 9. Generate land keeps the coast open, end to end, on a fixture world ───────────────────────────────────────────────────────
// XXX's two provinces stand in the middle of a block of sea in a strategic region (b), which Generate land may raise; ZZZ's old land
// is beside them on the ocean (a chain never keeps it at sea, and it is not XXX's coast); YYY's ring stands out in the ocean round
// WWW's province, which never touched the sea below (landlocked: never asked); every other province is ocean in no region, which no
// click raises. The mod is the world after Delete map, and the count is every province a click may raise — so the block walls XXX in
// on every side unless the click keeps a way out. The fewest picks between XXX and the ocean, and everything else expected, are
// derived from the grid. (Review CK-R1: with ZZZ and WWW absent, keeping old land at sea, one owner for all old land and a coast
// below judged without the land below all passed.)
{
  const spec = {
    below: [
      "~~~~~~~~~~",
      "~~~~~~~YYY",
      "~ZZXX~~YWY",
      "~~~~~~~YYY",
      "~~~~~~~~~~",
      "~~~~~~~~~~",
    ],
    regions: [
      ".bbbbbb...",
      ".bbbbbbyyy",
      ".zzxxbbywy",
      ".bbbbbbyyy",
      ".bbbbbb...",
      "..........",
    ],
  };
  const w0 = genWorld("on", spec), { nbs, eligible } = w0;
  const XL = w0.where((b) => b === "X"), YL = w0.where((b) => b === "Y"), ZL = w0.where((b) => b === "Z"), WL = w0.where((b) => b === "W");
  const BLOCK = w0.where((b, rg) => rg === "b"), isBelowLand = new Set(XL.concat(YL, ZL, WL));
  // the oracle: the ocean once every eligible province is land, and the fewest BLOCK provinces between XXX and it
  const ocean0 = w0.oceanIf(new Set(eligible));
  const fewest = (() => { const d = new Map(), q = []; for (const p of XL) for (const r of nbs(p)) if (BLOCK.includes(r) && !d.has(r)) { d.set(r, 1); q.push(r); }
    for (let i = 0; i < q.length; i++) { if (nbs(q[i]).some((r) => ocean0.has(r))) return d.get(q[i]); for (const r of nbs(q[i])) if (BLOCK.includes(r) && !d.has(r)) { d.set(r, d.get(q[i]) + 1); q.push(r); } } return Infinity; })();
  rec("9a. (the fixture) with every eligible province land, XXX touches no ocean; YYY and ZZZ do, ZZZ beside XXX; WWW never touched the sea below; and a way out exists",
    !w0.touchesAny(XL, ocean0) && w0.touchesAny(YL, ocean0) && w0.touchesAny(ZL, ocean0) && ZL.some((p) => nbs(p).some((q) => XL.includes(q)))
    && WL.every((p) => nbs(p).every((q) => isBelowLand.has(q))) && fewest < Infinity, fewest);
  const r = md.generateLand(GEN(w0));
  const t = w0.typesNow(), landNow = w0.landNow(), oceanNow = w0.oceanIf(landNow);
  const kc = (r && r.keptCoasts) || {};
  rec("9b. the click succeeds", r && r.changed === true, r && r.error);
  rec("9c. XXX's land touches the ocean after the click", XL.every((p) => landNow.has(p)) && w0.touchesAny(XL, oceanNow));
  rec("9d. exactly the fewest picks between XXX and the ocean stayed sea (oracle " + fewest + "), all of the block — never ZZZ's land beside it", Array.isArray(kc.provinces) && kc.provinces.length === fewest && kc.provinces.every((p) => BLOCK.includes(p) && t.get(p) === "sea"), kc);
  rec("9e. every other province the click may raise is land, and the count says so", eligible.filter((p) => !(kc.provinces || []).includes(p)).every((p) => landNow.has(p)) && r.flippedProvinces === eligible.length - fewest, r && r.flippedProvinces);
  rec("9f. the report: one walled piece (XXX's — not ZZZ's on the ocean, nor WWW's, which never had a coast), one channel, none without a way", kc.walled === 1 && kc.channels === 1 && Array.isArray(kc.noWay) && kc.noWay.length === 0 && JSON.stringify(kc.byTag) === JSON.stringify({ XXX: fewest }), kc);
  rec("9g. …and asked again once the states are owned, XXX's coast is still XXX's: nothing still walled", Array.isArray(kc.stillWalled) && kc.stillWalled.length === 0 && !kc.stillWalledError, kc);
  const off = genWorld("off", spec), r2 = md.generateLand(GEN(off, { keepCoasts: false }));
  const land2 = off.landNow();
  rec("9h. keepCoasts: false raises every province and leaves XXX walled — the rule, not the fixture, opens it", r2 && r2.flippedProvinces === eligible.length && !off.touchesAny(XL, off.oceanIf(land2)) && !(r2.keptCoasts || {}).channels, r2 && r2.keptCoasts);
  // the rule keeps a COUNTRY's coast: with one owner for the whole world, or none, XXX is in no world the click makes, so nothing is
  // kept at sea for it — and with the owner mode left out the click inherits, so it is kept as above
  for (const [label, extra] of [["single", { ownerMode: "single", owner: "YYY" }], ["owner-only", { ownerMode: undefined, owner: "YYY" }], ["none", { ownerMode: "none" }]]) {
    const rm = md.generateLand(GEN(genWorld(label, spec), extra)), km = (rm && rm.keptCoasts) || {};
    rec(`9i. owner mode ${label}: nothing kept at sea, every province the click may raise is land`, rm && rm.changed === true && rm.flippedProvinces === eligible.length && !(km.provinces || []).length, km);
  }
  const rd = md.generateLand(GEN(genWorld("default", spec), { ownerMode: undefined }));
  rec("9j. owner mode left out (the click inherits): the same provinces kept at sea as ownerMode inherit", rd && JSON.stringify(((rd.keptCoasts || {}).provinces || [])) === JSON.stringify(kc.provinces || null), rd && rd.keptCoasts);
  // ⛔ #a-world-owner-is-a-country — …and the coast is kept for a COUNTRY THE MOD HAS (review cr2, R1). With the mod's own
  // replace_path="common/country_tags" defining WWW, YYY and ZZZ but not XXX, XXX's old land is nobody's (as the owner passes read it)
  // and an ownerless piece is no one's coast. Read raw, the click kept the same channel at sea for XXX, which no state would be, and the
  // report said it had kept XXX's coast open. THE CONTROL (9o): all four defined (the game's country_tags), XXX's channel is kept as in 9d.
  const withTags = (label, modTags) => {
    const w = genWorld(label, spec);
    const put = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    const line = (t) => `${t} = "countries/${t}.txt"`;
    put(w.g, "common/country_tags/00_countries.txt", ["WWW", "XXX", "YYY", "ZZZ"].map(line).join("\n") + "\n");
    if (modTags) {
      put(w.m, "common/country_tags/kept_coast.txt", modTags.map(line).join("\n") + "\n");
      fs.appendFileSync(path.join(w.m, "descriptor.mod"), 'replace_path="common/country_tags"\n');
    }
    return w;
  };
  const wa = withTags("tags-all", null), ra = md.generateLand(GEN(wa)), kca = (ra && ra.keptCoasts) || {};
  rec("9o. THE CONTROL: with XXX one of the countries the game's country_tags define, its coast is kept exactly as in 9d", ra && ra.changed === true
    && JSON.stringify(kca.byTag) === JSON.stringify({ XXX: fewest }) && JSON.stringify(kca.provinces) === JSON.stringify(kc.provinces), kca);
  const wx = withTags("tags-cut", ["WWW", "YYY", "ZZZ"]);
  const definedX = md.countryTagsThatLoad({ modRoot: wx.m, gameRoot: wx.g, dependencyRoots: [] });
  rec("9p. (the fixture) the mod's own country_tags cut XXX", !!definedX && [...definedX].sort().join() === "WWW,YYY,ZZZ", definedX && [...definedX]);
  const rx = md.generateLand(GEN(wx)), kcx = (rx && rx.keptCoasts) || {};
  rec("9q. ⭐⭐ …and nothing is kept at sea for XXX, no country there: every province the click may raise is land, no channel, none said",
    rx && rx.changed === true && rx.flippedProvinces === eligible.length && !(kcx.provinces || []).length && !kcx.channels && !Object.keys(kcx.byTag || {}).length, kcx);
  rec("9r. …and no new state is XXX's", rx && rx.changed === true && !wx.statesNow().some((s) => s.owner === "XXX"), [...new Set(wx.statesNow().map((s) => s.owner))]);
}

// ── 9b. a channel through a sea the click cut off and filled: kept at sea, and no longer said filled ─────────────────────────────
// XXX's one province is ringed by ZZZ's old land but for a 2-province sea on the date line (f), which the layer below keeps at sea
// there — it has no land on the line — so no pick takes it; the mod's own land (#) closes it above and below, and the click's picks
// (p) close it from the ocean, two deep, so the cut-off seas' join, which needs fewer picks than the sea has provinces, leaves it to be
// filled with the land. XXX's only way to the ocean is through it. (Review CK-R1: the correction of the fills was pinned by nothing.)
{
  const spec = {
    below: [
      "~~~~~~~~~~",
      "~Z~~~~~~~~",
      "~XZ~~~~~~~",
      "~Z~~~~~~~~",
      "~~~~~~~~~~",
    ],
    regions: [
      "..........",
      "mz......pm",
      "fxz....ppf",
      "mz......pm",
      "..........",
    ],
    mod: [
      "..........",
      "#........#",
      "..........",
      "#........#",
      "..........",
    ],
  };
  const w = genWorld("pocket", spec), { nbs } = w;
  const XL = w.where((b) => b === "X"), POCKET = w.where((b, rg) => rg === "f");
  const seaBelowNext = XL.flatMap((p) => nbs(p)).filter((q) => !/[A-Z]/.test(spec.below[Math.floor((q - 1) / 10)][(q - 1) % 10]));
  rec("9k. (the fixture) the pocket is two date-line provinces in a region, sea below, and XXX's only neighbours that were sea below are in it", POCKET.length === 2
    && POCKET.every((p) => (p - 1) % 10 === 0 || (p - 1) % 10 === 9) && seaBelowNext.length > 0 && seaBelowNext.every((q) => POCKET.includes(q)), [POCKET, seaBelowNext]);
  const off = genWorld("pocket-off", spec), r0 = md.generateLand(GEN(off, { keepCoasts: false })), s0 = (r0 && r0.inlandSeas) || {};
  rec("9l. CONTROL (keepCoasts: false): the click fills the pocket with its land, says so, and XXX touches no ocean", r0 && r0.changed === true
    && JSON.stringify((s0.provinces || []).slice().sort((a, b) => a - b)) === JSON.stringify(POCKET) && s0.filled === POCKET.length && POCKET.every((p) => off.landNow().has(p))
    && !w.touchesAny(XL, off.oceanIf(off.landNow())), s0);
  const r = md.generateLand(GEN(w)), kc = (r && r.keptCoasts) || {}, s = (r && r.inlandSeas) || {}, land = w.landNow();
  rec("9m. with the rule the way out runs through the pocket: it stayed sea, and XXX touches the ocean", r && r.changed === true && POCKET.every((p) => !land.has(p) && (kc.provinces || []).includes(p))
    && w.touchesAny(XL, w.oceanIf(land)), kc);
  rec("9n. …and the pocket is not said filled: the seas' report lists only land, its count is theirs, and `unfilled` is the pocket's provinces",
    (s.provinces || []).every((p) => land.has(p)) && s.filled === (s.provinces || []).length && kc.unfilled === POCKET.length, { seas: s, unfilled: kc.unfilled });
}

// ── 10. the page says it: how many coasts were kept open and the provinces left sea, beside the count; a way none could keep ─────
{
  const vm = require("vm");
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const atNote = MASKED.indexOf("function generatedKeptCoastsNote("), body = atNote < 0 ? null : jsBodyAt(MASKED, atNote);
  rec("10a. public/map.js has generatedKeptCoastsNote", !!body);
  const note = body ? vm.runInNewContext("(" + PAGE.slice(atNote, body[1] + 1) + ")") : () => "";
  // one channel can open several pieces: 4 walled, 1 of them no way reached, so 3 coasts kept open through 2 channels — numbers that
  // differ, so the line cannot say the channel count where it means the coasts
  const res = { keptCoasts: { walled: 4, channels: 2, provinces: [11, 12, 13], noWay: [{ tag: "QQQ", provinces: 4 }] } };
  const kc10 = res.keptCoasts, opened = kc10.walled - kc10.noWay.length;
  rec("10a2. (the fixture) the coasts kept open and the channels differ", opened !== kc10.channels, [opened, kc10.channels]);
  const said = note(res);
  rec("10b. it says the coasts kept open (walled less those no way reached), the channels, and the provinces left sea", said.includes(`${opened} coasts`) && said.includes(`through ${kc10.channels} channels`) && said.includes("(3 provinces of the new land were left sea)"), said);
  rec("10c. …and names a piece no way reached, as touching no ocean now — not as walled off it, which it may never have touched", /⚠/.test(said) && said.includes("QQQ") && /touches no ocean now/.test(said), said);
  rec("10d. a failure is said with its reason", /⚠/.test(note({ keptCoasts: { error: "boom" } })) && note({ keptCoasts: { error: "boom" } }).includes("boom"));
  rec("10e. CONTROL: nothing kept says nothing", note({ keptCoasts: { walled: 0, channels: 0, provinces: [], noWay: [] } }) === "" && note({}) === "" && note(null) === "");
  // no channel kept, one piece no way reached: the sentence stands alone — no "more", no "of it" pointing at a sentence that is not
  // there (review CK-R5: " ⚠ 1 more piece of it (TAJ) …")
  const alone = note({ keptCoasts: { walled: 1, channels: 0, provinces: [], noWay: [{ tag: "TAJ", provinces: 3 }] } });
  rec("10g. no channel kept: the piece no way reached is named on its own, with no 'more' and no 'of it'", alone.includes("TAJ") && /touches no ocean now/.test(alone)
    && !/\bmore\b/.test(alone) && !/\bof it\b/.test(alone), alone);
  rec("10g2. CONTROL: with channels kept, the same piece is the 'more' one", /\bmore piece\b/.test(said), said);
  // a coast kept open whose state then went to another country (`stillWalled`): named, as touching no ocean once the states are owned
  const still = note({ keptCoasts: { walled: 2, channels: 2, provinces: [5, 6], noWay: [], stillWalled: [{ tag: "PAL", provinces: 3 }] } });
  const clean = note({ keptCoasts: { walled: 2, channels: 2, provinces: [5, 6], noWay: [], stillWalled: [] } });
  rec("10h. a coast kept open and then lost with its state is named (PAL), as touching no ocean once the new states are owned", /⚠/.test(still) && still.includes("PAL")
    && /no ocean once the new states are owned/.test(still), still);
  rec("10h2. CONTROL: an empty stillWalled says nothing of it", !/once the new states are owned/.test(clean) && !/⚠/.test(clean), clean);
  rec("10i. …and when that could not be asked, it is said with its reason", note({ keptCoasts: { walled: 1, channels: 1, provinces: [5], noWay: [], stillWalledError: "no links" } }).includes("no links"));
  // a coast the owner passes put in a neighbour's state, gone back with its country's own provinces there (`returned`, review CK-R2-r3)
  const back = note({ keptCoasts: { walled: 2, channels: 2, provinces: [5, 6], noWay: [], stillWalled: [], returned: [{ tag: "IRQ", from: "KUW", provinces: [7, 8] }] } });
  rec("10j. a coast gone back to its country is said, naming it and the neighbour it came from (IRQ from KUW)", back.includes("IRQ from KUW") && /went back/.test(back) && !/⚠/.test(back), back);
  rec("10j2. CONTROL: none gone back says nothing of it", !/went back/.test(clean), clean);
  const unmended = note({ keptCoasts: { walled: 1, channels: 1, provinces: [5], noWay: [], returnedError: "no regions" } });
  rec("10j3. …and when that could not be asked, it is said with its reason", /⚠/.test(unmended) && unmended.includes("no regions"), unmended);
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("10f. the Generate land report on the page carries it", /generatedKeptCoastsNote\(res\)/.test(line) && /\$\{keptNote\}/.test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))), line.slice(-200));
}

// ── 11. the rule is in provinces as they are BEFORE the coast is roughened or any province split (merge rule MK1) ────────────────
// In generateLand, comments stripped: the kept-coast call sits after the cut-off seas' join and before the roughen call, and before any
// province split the function asks for. The splits are DERIVED: every function of the module whose name says it splits provinces.
// The provinces chain's planGeneratedProvinceSplit is the one generateLand calls once that chain is merged (MK1); when it is defined
// it must be called, so the order is asked of a real call — anchored on a planner generateLand never calls, the check passed on
// nothing (review CK-R7: `provinceSplitPlan(` is only called inside that planner).
{
  const { maskJsComments: maskC, maskJsLiterals: maskL, jsBodyAt: bodyAt } = require("./testlib-strip-comments.js");
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"), CODE = maskC(SRC), MASK = maskL(CODE);
  const at = MASK.indexOf("function generateLand("), body = at < 0 ? null : bodyAt(MASK, at);
  const G = body ? CODE.slice(at, body[1] + 1) : "";
  const count = (s) => G.split(s).length - 1;
  rec("11a. (the source) generateLand calls keptCoastChannels, joinCutOffSeasToOcean and roughenGeneratedCoast exactly once each", !!body && count("keptCoastChannels(") === 1 && count("joinCutOffSeasToOcean(") === 1 && count("roughenGeneratedCoast(") === 1,
    [count("keptCoastChannels("), count("joinCutOffSeasToOcean("), count("roughenGeneratedCoast(")]);
  const k = G.indexOf("keptCoastChannels(");
  rec("11b. …the kept coasts after the cut-off seas' join and before the coast is roughened", k > G.indexOf("joinCutOffSeasToOcean(") && k < G.indexOf("roughenGeneratedCoast("), [G.indexOf("joinCutOffSeasToOcean("), k, G.indexOf("roughenGeneratedCoast(")]);
  const SPLITS = [...MASK.matchAll(/\bfunction\s+(\w*[Ss]plit\w*)\s*\(/g)].map((m) => m[1]).filter((n) => /provinc/i.test(n));
  const called = SPLITS.map((n) => [n, G.search(new RegExp("\\b" + n + "\\s*\\("))]).filter(([, i]) => i >= 0);
  const first = called.length ? Math.min(...called.map(([, i]) => i)) : Infinity;
  const planned = SPLITS.includes("planGeneratedProvinceSplit");
  rec("11c. …and before any province split generateLand asks for (" + SPLITS.length + " split planners derived" + (planned ? ", planGeneratedProvinceSplit among them and called" : ", none of them called here") + ")",
    SPLITS.length > 0 && (!planned || called.some(([n]) => n === "planGeneratedProvinceSplit")) && k >= 0 && k < first, { k, SPLITS, called });
  // the coasts' return (§14) moves provinces between the states as the owner passes cut them: after those passes, before anything reads
  // what a state holds (derivedFieldsFor), and — once the provinces chain is merged — before its join hands each parent's pieces to the
  // parent's state, or a province moved after it would leave its pieces behind
  const own = G.indexOf("ownership = assignGeneratedStateOwners("), ret = G.indexOf("returnKeptCoastsToTheirCountry("), derived = G.indexOf("const derivedFieldsFor ="), join = G.indexOf("familyOf.size) for (const g of groups)");
  rec("11d. …and the kept coasts go back to their country once, after the owner passes and before a state's provinces are read" + (join >= 0 ? " or a parent's pieces joined" : " (no pieces' join here)"),
    count("returnKeptCoastsToTheirCountry(") === 1 && own >= 0 && ret > own && derived > ret && (join < 0 || ret < join), { own, ret, derived, join });
}

// ── 12. a coast kept open is asked again once the states are owned (review CK-R2) ───────────────────────────────────────────────
// At 35% seed 2 a chain was kept for Palestine's walled land, the state holding that coast went to Lebanon by majority, and Palestine
// touched no ocean while the page said every coast was kept open. keptCoastsStillWalled, pure, first: `opened` keptCoastChannels'
// opened pieces; `pieces` ownLandPieces' answer, Map(tag → [{ groups, coast }]). Each expected count is the opened piece's provinces
// its country's pieces hold, derived from the hand pieces below.
{
  const P = { tag: "PPP", provinces: [1, 2, 3, 4] };
  const piece = (ps, coast) => ({ groups: [{ id: ps[0], provinces: ps }], coast });
  const heldOf = (pieces) => (pieces.get("PPP") || []).reduce((n, pc) => n + pc.groups.reduce((m, g) => m + g.provinces.filter((p) => P.provinces.includes(p)).length, 0), 0);
  const cases = {
    // its coast went to LLL: PPP holds 3 and 4 on a piece with no ocean → said, with the 2 it holds
    lost: new Map([["LLL", [piece([1, 2], true)]], ["PPP", [piece([3, 4], false)]]]),
    // PPP's piece holding 3 and 4 opens onto the ocean → nothing
    kept: new Map([["LLL", [piece([1, 2], true)]], ["PPP", [piece([3, 4], true)]]]),
    // all of it went to LLL: PPP holds none of it (its land elsewhere is walled) → not asked: that land is another's now
    gone: new Map([["LLL", [piece([1, 2, 3, 4], true)]], ["PPP", [piece([9], false)]]]),
    // PPP holds 3 on a walled piece, and its only piece on the ocean holds none of the opened land → still said
    elsewhere: new Map([["LLL", [piece([1, 2, 4], true)]], ["PPP", [piece([3], false), piece([9], true)]]]),
    // PPP holds 3 on a walled piece and 4 on a piece on the ocean → a piece holding it opens: nothing
    split: new Map([["LLL", [piece([1, 2], true)]], ["PPP", [piece([3], false), piece([4], true)]]]),
  };
  const want = (pieces) => { const own = pieces.get("PPP") || [], holding = own.filter((pc) => pc.groups.some((g) => g.provinces.some((p) => P.provinces.includes(p))));
    return holding.length && !holding.some((pc) => pc.coast) ? [{ tag: "PPP", provinces: heldOf(pieces) }] : []; };
  rec("12a. (the fixture) the cases differ: said for `lost` and `elsewhere`, for no other", JSON.stringify(Object.keys(cases).filter((c) => want(cases[c]).length)) === JSON.stringify(["lost", "elsewhere"]));
  for (const [name, pieces] of Object.entries(cases)) {
    const got = md.keptCoastsStillWalled({ opened: [P], pieces });
    rec(`12b. ${name}: ${JSON.stringify(want(pieces))}`, JSON.stringify(got) === JSON.stringify(want(pieces)), got);
  }
  rec("12c. nothing opened, nothing asked", md.keptCoastsStillWalled({ opened: [], pieces: cases.lost }).length === 0 && md.keptCoastsStillWalled({}).length === 0);
}
// …and end to end: PPP's two provinces below are walled in by LLL's old land and one sea province, which the click raises; the chain
// keeps it at sea, and then the strategic regions put PPP's province beside it in a state with two of LLL's, which LLL takes by
// majority. PPP keeps its other province, which touches only LLL's land now. CONTROL: with that province in PPP's own region, PPP's
// state holds the coast and nothing is said.
{
  const spec = (ownRegion) => ({
    below: [
      "~~~LL~~~~~",
      "~~LPPL~~~~",
      "~~~~L~~~~~",
      "~~~~~~~~~~",
      "~~~~~~~~~~",
    ],
    regions: [
      "...xz.....",
      ownRegion ? "..xyyw...." : "..xxyw....",
      "...cv.....",
      "..........",
      "..........",
    ],
  });
  const w = genWorld("still", spec(false)), PL = w.where((b) => b === "P"), C = w.where((b, rg) => rg === "c");
  const stateOf = (world, p) => world.statesNow().find((s) => s.provinces.includes(p)) || {};
  const r = md.generateLand(GEN(w)), kc = (r && r.keptCoasts) || {}, land = w.landNow(), ocean = w.oceanIf(land);
  // derived from the states written: PPP's provinces it still holds, and whether any of them touches the ocean
  const mine = PL.filter((p) => stateOf(w, p).owner === "PPP");
  rec("12d. (the fixture) the chain is the one sea province, and the province beside it went to LLL with its state",
    r && r.changed === true && JSON.stringify(kc.provinces) === JSON.stringify(C) && kc.channels === 1 && stateOf(w, PL[0]).owner === "LLL" && mine.length === PL.length - 1, { kc, states: PL.map((p) => [p, stateOf(w, p).owner]) });
  rec("12e. PPP's land it still holds touches no ocean, and the report says so: PPP, with the provinces it holds",
    !w.touchesAny(mine, ocean) && JSON.stringify(kc.stillWalled) === JSON.stringify([{ tag: "PPP", provinces: mine.length }]) && !kc.stillWalledError, kc.stillWalled);
  const c = genWorld("still-control", spec(true)), rc = md.generateLand(GEN(c)), kcc = (rc && rc.keptCoasts) || {};
  rec("12f. CONTROL: PPP's own state holds the coast — the same chain, PPP on the ocean, and nothing said", rc && rc.changed === true
    && JSON.stringify(kcc.provinces) === JSON.stringify(C) && PL.every((p) => stateOf(c, p).owner === "PPP") && c.touchesAny(PL, c.oceanIf(c.landNow()))
    && Array.isArray(kcc.stillWalled) && kcc.stillWalled.length === 0, kcc);
  // …and every country whose land below had a coast is asked, not only a piece a chain opened (review RK3-1, #a-kept-country-keeps-its-coast):
  // PPP's land touched the sea below, holds land now, and none of it touches the ocean — said in the countries, with what it holds
  rec("12g. (the fixture) PPP's land below touched the sea", PL.some((p) => w.nbs(p).some((q) => spec(false).below[Math.floor((q - 1) / 10)][(q - 1) % 10] === "~")));
  rec("12h. countries.noOceanCoast names PPP with the provinces it holds", JSON.stringify((r.countries || {}).noOceanCoast) === JSON.stringify([{ tag: "PPP", provinces: mine.length }])
    && !(r.countries || {}).noOceanCoastError, (r.countries || {}).noOceanCoast);
  rec("12i. CONTROL: PPP on the ocean — nobody named", Array.isArray((rc.countries || {}).noOceanCoast) && rc.countries.noOceanCoast.length === 0, (rc.countries || {}).noOceanCoast);
}

// ── 13. land ALREADY THERE keeps its coast too, with the new land its own country takes (review CK-R3) ─────────────────────────
// A second click at 10% of the sea, on the owner's world, raised the first click's channels and gave them to Estonia: Finland, Estonia
// and Latvia had no ocean coast again, since land already there was never asked. The layer below is all sea; the mod's own land is
// already there. Three worlds, each with one island pick far off (i), so the click always makes land:
//   A  FFF's one province is ringed by EEE's land but for one sea province (s), which also touches EEE's land above it: the owner
//      passes give s to EEE, so FFF is walled — and s is kept at sea;
//   B  the same without EEE's land above s: s touches FFF's land alone, FFF takes it, its coast goes out with it — nothing is kept;
//   C  GGG's one province touched only a two-province lake (l) before the click — ringed by HHH — never the ocean, and the owner
//      passes give GGG the half of the lake beside it, which touched the other half: no coast was taken (not GGG's, nor the raised
//      lake's, which was never land), nothing is asked, nothing is said.
{
  const below = Array(6).fill("~~~~~~~~~~");
  const A = {
    below,
    mod: ["..........", "...E......", "..........", "..EFE.....", "...E......", ".........."],
    regions: ["..........", "...e....i.", "...s......", "..efe.....", "...e......", ".........."],
  };
  const B = { below, mod: A.mod.map((row, i) => (i === 1 ? ".........." : row)), regions: A.regions.map((row, i) => (i === 1 ? "........i." : row)) };
  const C = {
    below,
    mod: ["..HHH.....", "..HGHH....", "..H..H....", "..HHHH....", "..........", ".........."],
    regions: ["..hhh.....", "..hghh..i.", "..hllh....", "..hhhh....", "..........", ".........."],
  };
  const stateOf = (world, p) => world.statesNow().find((s) => s.provinces.includes(p)) || {};
  // A
  const a = genWorld("already-a", A), S = a.where((b, rg) => rg === "s"), FL = a.where((b, rg, o) => o === "F"), EL = a.where((b, rg, o) => o === "E");
  rec("13a. (the fixture A) FFF touches the ocean only through s, and s touches EEE's land too, at a lower province id than FFF's",
    S.length === 1 && a.nbs(S[0]).some((q) => EL.includes(q) && q < FL[0]) && FL.every((p) => a.nbs(p).every((q) => EL.includes(q) || S.includes(q))));
  const offA = genWorld("already-a-off", A), ro = md.generateLand(GEN(offA, { keepCoasts: false }));
  rec("13b. CONTROL A (keepCoasts: false): s is raised and EEE's, and FFF touches no ocean", ro && ro.changed === true && offA.landNow().has(S[0])
    && stateOf(offA, S[0]).owner === "EEE" && !offA.touchesAny(FL, offA.oceanIf(offA.landNow())), ro && (ro.error || ro.keptCoasts));
  const ra = md.generateLand(GEN(a)), ka = (ra && ra.keptCoasts) || {};
  rec("13c. A: s stays sea, FFF touches the ocean, and the click still made its other land", ra && ra.changed === true && !a.landNow().has(S[0])
    && a.touchesAny(FL, a.oceanIf(a.landNow())) && a.eligible.filter((p) => p !== S[0]).every((p) => a.landNow().has(p)), ra && (ra.error || ka));
  rec("13d. A: the report — one walled piece, FFF's, one channel of s, none without a way", ka.walled === 1 && ka.channels === 1 && JSON.stringify(ka.provinces) === JSON.stringify(S)
    && JSON.stringify(ka.byTag) === JSON.stringify({ FFF: 1 }) && Array.isArray(ka.noWay) && ka.noWay.length === 0, ka);
  // …and A with s the only province the click may raise: every pick stayed sea, so the click made no land — said, nothing written
  const a0 = genWorld("already-a-only", { ...A, regions: A.regions.map((row) => row.replace("i", ".")) });
  const files = (d) => { const out = []; const walk = (p) => { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); if (fs.statSync(q).isDirectory()) walk(q); else out.push([path.relative(d, q), fs.readFileSync(q).toString("base64")]); } }; walk(d); return JSON.stringify(out.sort()); };
  const before0 = files(a0.m), r0 = md.generateLand(GEN(a0)), k0 = (r0 && r0.keptCoasts) || {};
  rec("13j. A with s the only pick: no land made, the reason said, the channel reported, and not a file of the mod changed", a0.eligible.length === 1 && r0 && r0.changed === false
    && /made no land/.test(r0.error || "") && JSON.stringify(k0.provinces) === JSON.stringify(S) && files(a0.m) === before0, r0 && { error: r0.error, changed: r0.changed, kc: k0 });
  // B
  const b = genWorld("already-b", B), SB = b.where((x, rg) => rg === "s"), FB = b.where((x, rg, o) => o === "F");
  rec("13e. (the fixture B) s touches FFF's land and no other land", SB.length === 1 && b.nbs(SB[0]).filter((q) => /[A-Z]/.test(B.mod[Math.floor((q - 1) / 10)][(q - 1) % 10])).every((q) => FB.includes(q)));
  const rb = md.generateLand(GEN(b)), kb = (rb && rb.keptCoasts) || {};
  rec("13f. B: s is raised and FFF's — its coast went out with the land — and nothing was kept at sea", rb && rb.changed === true && b.landNow().has(SB[0])
    && stateOf(b, SB[0]).owner === "FFF" && b.touchesAny(FB.concat(SB), b.oceanIf(b.landNow())) && kb.walled === 0 && !(kb.provinces || []).length, rb && (rb.error || kb));
  // C
  const c = genWorld("already-c", C), L = c.where((x, rg) => rg === "l"), GL = c.where((x, rg, o) => o === "G"), HL = c.where((x, rg, o) => o === "H");
  const land0 = c.landNow(), ocean0 = c.oceanIf(land0);
  // the half of the lake beside GGG: GGG's province is the lowest-numbered land it touches, so the owner passes' nearest land is GGG's
  const mineL = L.filter((p) => c.nbs(p).some((q) => GL.includes(q)) && Math.min(...c.nbs(p).filter((q) => land0.has(q))) === GL[0]);
  rec("13g. (the fixture C) GGG's only water before the click is the lake, the lake touches no ocean, and one half of it is GGG's nearest land's",
    L.length === 2 && GL.every((p) => c.nbs(p).filter((q) => !land0.has(q)).every((q) => L.includes(q))) && L.every((p) => !ocean0.has(p))
    && mineL.length === 1 && c.nbs(mineL[0]).some((q) => L.includes(q)) && HL.length > 0, { L, mineL });
  const rcl = md.generateLand(GEN(c)), kcl = (rcl && rcl.keptCoasts) || {};
  rec("13h. C: the lake is raised and nothing is walled", rcl && rcl.changed === true && L.every((p) => c.landNow().has(p)) && kcl.walled === 0, rcl && (rcl.error || kcl));
  rec("13i. C: nothing is said to have no way", Array.isArray(kcl.noWay) && kcl.noWay.length === 0, kcl.noWay);
}

// ── 14. a coast kept open stays its country's: its own provinces in a neighbour's state go back (review CK-R2-r3) ───────────────
// At 45% seed 6 a chain was kept for Iraq's walled land, and the owner passes gave the state holding its coast to Kuwait (Iraq's 2 of
// its 5 provinces) and Palestine's to Jordan (3 of 8): neither touched the ocean, and the page only said so. returnKeptCoastsToTheirCountry,
// pure first. One province per cell: `below` the owner below (a letter) or ~ the ocean; `states` each land cell's state, its owner in
// `owners`, its region in `regions` (x by default). The opened piece is P's land below and any + (land the click gave P), its coast its
// cells beside ~. The move is DERIVED by an oracle reading the rule off the grid, and each case that moves nothing has a control
// differing from a moving case in one thing.
{
  const mendWorld = (spec) => {
    const H = spec.below.length, W = spec.below[0].length, id = (x, y) => y * W + x + 1;
    const adj = new Map(), below = new Map(), stateAt = new Map(), ocean = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = id(x, y);
      adj.set(p, new Set());
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) adj.get(p).add(id(X, Y)); }
      if (spec.below[y][x] === "~") ocean.add(p); else { below.set(p, spec.below[y][x]); stateAt.set(p, spec.states[y][x]); }
    }
    const labels = [...new Set(stateAt.values())].sort(), gid = (s) => labels.indexOf(s) + 1;
    const groups = labels.map((s) => ({ id: gid(s), provinces: [...stateAt].filter(([, t]) => t === s).map(([p]) => p) }));
    const ownerOf = new Map(labels.map((s) => [gid(s), spec.owners[s]]));
    const opens = (p) => [...adj.get(p)].some((q) => ocean.has(q));
    const P = [...below].filter(([, t]) => t === "P" || t === "+").map(([p]) => p).sort((a, b) => a - b);   // + land the click gave P: in its piece, never its below
    return { id, adj, groups, ownerOf, stateAt, gid, opens, opened: [{ tag: "P", provinces: P, coast: P.filter(opens) }],
      regionOf: (p) => (spec.regions || {})[stateAt.get(p)] || "x", belowOf: (p) => below.get(p) || "" };
  };
  // the oracle: P's land joined to what it holds of the piece reaches no ~ → the first coast cell in another's state, with P's cells of
  // that state joined to it, goes to P's state beside them in that state's region (the lowest id), if the state left is one piece
  const oracle = (w) => {
    const tagAt = (p) => w.ownerOf.get(w.gid(w.stateAt.get(p))), pc = w.opened[0];
    const reach = new Set(pc.provinces.filter((p) => tagAt(p) === pc.tag));
    if (!reach.size) return { moved: [], to: null };
    for (const p of reach) for (const q of w.adj.get(p)) if (w.stateAt.has(q) && tagAt(q) === pc.tag) reach.add(q);
    if ([...reach].some(w.opens)) return { moved: [], to: null };
    for (const c of pc.coast) {
      const s = w.stateAt.get(c);
      if (tagAt(c) === pc.tag || w.belowOf(c) !== pc.tag) continue;
      const comp = new Set([c]);
      for (const p of comp) for (const q of w.adj.get(p)) if (w.stateAt.get(q) === s && w.belowOf(q) === pc.tag) comp.add(q);
      const tos = [...comp].flatMap((p) => [...w.adj.get(p)]).filter((q) => w.stateAt.has(q) && w.stateAt.get(q) !== s && tagAt(q) === pc.tag && w.regionOf(q) === w.regionOf(c));
      const to = tos.length ? Math.min(...tos.map((q) => w.gid(w.stateAt.get(q)))) : null;
      const left = [...w.stateAt.keys()].filter((p) => w.stateAt.get(p) === s && !comp.has(p)), seen = new Set(left.slice(0, 1));
      for (const p of seen) for (const q of w.adj.get(p)) if (left.includes(q)) seen.add(q);
      if (to == null || !left.length || seen.size !== left.length) continue;
      return { moved: [{ tag: pc.tag, from: tagAt(c), provinces: [...comp].sort((a, b) => a - b) }], to };
    }
    return { moved: [], to: null };
  };
  const L5 = { below: ["LLPPL", "LL~LL"], states: ["aaabc", "dd.ee"], owners: { a: "L", b: "P", c: "L", d: "L", e: "L" } };
  const E3 = { below: ["LLLLL", "LLPPL", "LL~LL"], owners: { a: "L", b: "P", e: "L", f: "L", g: "L", h: "L" } };
  const H7 = { below: ["LLLLLLL", "LPPPPPL", "L~LLL~L"], states: ["eeeeeee", "aabbbcc", "g.hhh.i"], owners: { a: "L", b: "P", c: "L", e: "L", g: "L", h: "L", i: "L" } };
  const cases = {
    // P's coast cell stands in L's state beside P's own: it goes back
    mend: { ...L5, moves: true },
    // P's two cells of L's state, joined to the coast cell there, go back together
    joined: { below: ["LPPPL", "LL~LL"], states: ["aaabc", "aa.dd"], owners: { a: "L", b: "P", c: "L", d: "L" }, moves: true },
    // P's state beside it is in another region: a state never crosses one
    region: { ...L5, regions: { b: "y" }, moves: false },
    // the coast cell is all of L's state: it would be left empty
    empty: { ...L5, states: ["aaxbc", "dd.ee"], owners: { ...L5.owners, x: "L" }, moves: false },
    // L's state is joined only through the coast cell: it would be left in two pieces …
    split: { ...E3, states: ["eeaee", "eaabf", "gg.hh"], moves: false },
    // … CONTROL: the same, its other cell beside the coast cell only
    splitControl: { ...E3, states: ["eeeee", "eaabf", "gg.hh"], moves: true },
    // P's land reaches the ocean already
    reaches: { ...L5, below: ["LLPP~", "LL~LL"], states: ["aaab.", "dd.ee"], moves: false },
    // P holds none of the piece: that land is another's now
    none: { ...L5, owners: { ...L5.owners, b: "L" }, moves: false },
    // …though P holds a state beside it, of land that was never its own (M's below)
    noneBeside: { below: ["LMPLL", "LLPLL", "LL~LL"], states: ["axaee", "aaaee", "dd.ff"], owners: { a: "L", x: "P", e: "L", d: "L", f: "L" }, moves: false },
    // … CONTROL: the same, P holding one province of the piece
    noneBesideControl: { below: ["LMPLL", "LLPLL", "LL~LL"], states: ["axyee", "aaaee", "dd.ff"], owners: { a: "L", x: "P", y: "P", e: "L", d: "L", f: "L" }, moves: true },
    // the only coast province of the piece is land the click gave P (+), never P's below: nothing of its own to take back …
    taken: { below: ["LP+PL", "LL~LL"], states: ["abccc", "aa.cc"], owners: { a: "L", b: "P", c: "L" }, moves: false },
    // … CONTROL: the same, that province P's below
    takenControl: { below: ["LPPPL", "LL~LL"], states: ["abccc", "aa.cc"], owners: { a: "L", b: "P", c: "L" }, moves: true },
    // the first coast cell cannot go back (its state's region is not P's), the later one can, and does
    later: { ...H7, regions: { a: "y" }, moves: true },
    // CONTROL: every state in one region — the first coast cell goes
    laterControl: { ...H7, moves: true },
    // the coast cell touches two of P's states in its region: the lower id takes it
    lowest: { below: ["LL~LL", "LPPPL", "LLLLL"], states: ["ee.ff", "gbcdh", "ggchh"], owners: { b: "P", c: "L", d: "P", e: "L", f: "L", g: "L", h: "L" }, moves: true },
  };
  const said = Object.entries(cases).map(([name, spec]) => [name, oracle(mendWorld(spec)), spec.moves]);
  rec("14a. (the fixture) the oracle moves exactly the cases built to move", said.every(([, o, moves]) => (o.moved.length > 0) === moves), said.map(([n, o]) => [n, o.moved.length]));
  const firstCoast = (spec) => mendWorld(spec).opened[0].coast[0];
  rec("14b. (the fixture) `later` moves its second coast cell and its control its first; `lowest` has two of P's states beside its coast cell",
    oracle(mendWorld(cases.later)).moved[0].provinces[0] !== firstCoast(cases.later) && oracle(mendWorld(cases.laterControl)).moved[0].provinces[0] === firstCoast(cases.laterControl)
    && (() => { const w = mendWorld(cases.lowest), c = w.opened[0].coast[0]; return new Set([...w.adj.get(c)].filter((q) => w.belowOf(q) === "P" && w.stateAt.get(q) !== w.stateAt.get(c)).map((q) => w.stateAt.get(q))).size === 2; })());
  for (const [name, spec] of Object.entries(cases)) {
    const w = mendWorld(spec), o = oracle(w), want = new Map(w.groups.flatMap((g) => g.provinces.map((p) => [p, g.id])));
    if (o.to != null) for (const p of o.moved[0].provinces) want.set(p, o.to);
    const got = md.returnKeptCoastsToTheirCountry({ groups: w.groups, ownerOf: w.ownerOf, opened: w.opened, adj: w.adj, opens: w.opens, regionOf: w.regionOf, belowOf: w.belowOf });
    const now = new Map(w.groups.flatMap((g) => g.provinces.map((p) => [p, g.id])));
    rec(`14c. ${name}: ${o.moved.length ? "moves " + JSON.stringify(o.moved[0].provinces) + " to state " + o.to : "moves nothing"}`,
      JSON.stringify(got) === JSON.stringify(o.moved) && [...want].every(([p, g]) => now.get(p) === g) && now.size === want.size, [got, [...now]]);
  }
  rec("14d. nothing opened, nothing asked", md.returnKeptCoastsToTheirCountry({ groups: [], ownerOf: new Map(), opened: [], adj: new Map(), opens: () => false, regionOf: () => "", belowOf: () => "" }).length === 0);
}
// …and end to end: PPP's coast province beside the channel is cut into a state with one of LLL's (two provinces a state, seed 10), which
// LLL takes on the tie, while PPP's other provinces make a state of PPP's beside it in the same region: the coast goes back to PPP.
// The cut is the seeded growth's, the same every run; a cut that no longer does this fails 14f, it does not pass on nothing.
{
  const R3 = { below: ["~~~LLPLL~~", "~~LLPPPL~~", "~~LL~LLL~~", "~~~~~~~~~~", "~~~~~~~~~~"], regions: ["...xxxxx..", "..xxxxxx..", "..xxcxxx..", "..........", ".........."] };
  const w = genWorld("mend", R3), PL = w.where((b) => b === "P"), C = w.where((b, rg) => rg === "c"), Pc = PL.filter((p) => w.nbs(p).some((q) => C.includes(q)));
  rec("14e. (the fixture) one of PPP's provinces is beside the one sea province, and all of PPP's land and LLL's around it is in one region",
    C.length === 1 && Pc.length === 1 && w.where((b, rg) => /[A-Z]/.test(b)).every((p) => w.where((b, rg) => rg === "x").includes(p)));
  const r = md.generateLand(GEN(w, { provincesPerState: 2, seed: 10 })), kc = (r && r.keptCoasts) || {}, stateOf = (p) => w.statesNow().find((s) => s.provinces.includes(p)) || {};
  rec("14f. the coast went back: PPP's province beside the channel, from LLL", r && r.changed === true && JSON.stringify(kc.provinces) === JSON.stringify(C)
    && JSON.stringify(kc.returned) === JSON.stringify([{ tag: "PPP", from: "LLL", provinces: Pc }]) && !kc.returnedError, kc.returned);
  const st = stateOf(Pc[0]), land = w.landNow();
  rec("14g. it stands in a state of PPP's with more of PPP's land, PPP's land touches the ocean, and nothing is said", st.owner === "PPP" && st.provinces.some((p) => p !== Pc[0] && PL.includes(p))
    && w.touchesAny(PL.filter((p) => stateOf(p).owner === "PPP"), w.oceanIf(land)) && Array.isArray(kc.stillWalled) && !kc.stillWalled.length
    && Array.isArray((r.countries || {}).noOceanCoast) && !r.countries.noOceanCoast.length, { st, still: kc.stillWalled, no: (r.countries || {}).noOceanCoast });
}

// ── 15. a kept country whose land had a coast is kept on the ocean (review RK3-1, #a-kept-country-keeps-its-coast) ─────────────────
// At 25% seed 4 the keep pass put Palestine, Yemen and Panama on landlocked land, and at 20% seed 7 Peru, whose navy then had no home:
// the nearest state, once the nearer coasts had gone. Here PPP's coast went to LLL by majority and its other land with it (four
// provinces a state, seed 1), so PPP owns nothing and the keep pass gives it a state holding its own land — every such state is as near.
// By the old order (the fewest of the holder's own provinces) that is a landlocked one; a country whose land had a coast takes one on
// the ocean when one is at most a few hops farther. Every expectation is derived from the states written.
{
  const R3 = { below: ["~~~LLPLL~~", "~~LLPPPL~~", "~~LL~LLL~~", "~~~~~~~~~~", "~~~~~~~~~~"], regions: ["...xxxxx..", "..xxxxxx..", "..xxcxxx..", "..........", ".........."] };
  const w = genWorld("keepcoast", R3), PL = w.where((b) => b === "P"), LL = w.where((b) => b === "L");
  const r = md.generateLand(GEN(w, { provincesPerState: 4, seed: 1 })), land = w.landNow(), ocean = w.oceanIf(land);
  const holding = w.statesNow().filter((s) => s.provinces.some((p) => PL.includes(p)));
  const lOf = (s) => s.provinces.filter((p) => LL.includes(p)).length, pOf = (s) => s.provinces.filter((p) => PL.includes(p)).length;
  const onOcean = (s) => w.touchesAny(s.provinces, ocean), dry = holding.filter((s) => !onOcean(s)), wet = holding.filter(onOcean);
  rec("15a. (the fixture) every state holding PPP's land holds at least as much of LLL's — the owner passes left PPP none — and the nearest-only order would take a landlocked one",
    r && r.changed === true && holding.length >= 2 && holding.every((s) => lOf(s) >= pOf(s)) && dry.length > 0 && wet.length > 0 && Math.min(...dry.map(lOf)) < Math.min(...wet.map(lOf)),
    holding.map((s) => [s.owner, s.provinces, lOf(s), onOcean(s)]));
  const mine = w.statesNow().filter((s) => s.owner === "PPP"), kept = ((r.countries || {}).kept || []).filter((k) => k.tag === "PPP");
  rec("15b. PPP is kept on one state, from LLL, and it touches the ocean", mine.length === 1 && kept.length === 1 && kept[0].from === "LLL" && onOcean(mine[0]), { mine, kept });
  rec("15b2. …and the keep pass's donor holds on the ocean are reported, a count", Number.isInteger((r.countries || {}).heldByCoast) && r.countries.heldByCoast >= 0, (r.countries || {}).heldByCoast);
  rec("15c. …and nothing is said: no country without its coast, no coast still walled", Array.isArray((r.countries || {}).noOceanCoast) && !r.countries.noOceanCoast.length
    && Array.isArray((r.keptCoasts || {}).stillWalled) && !r.keptCoasts.stillWalled.length, { no: (r.countries || {}).noOceanCoast, still: (r.keptCoasts || {}).stillWalled });
}
// …and one kept where no ocean is near enough is said, as kept: PPP's one province faced a sea the click raises with the whole block
// round it, so the ocean is the ring outside (no coast kept open: `keepCoasts: false`, else a channel would open PPP's land). Two
// provinces a state; at seed 1 LLL takes PPP's on the tie and the keep pass gives it back, at seed 2 the owner passes give it PPP.
// WWW's province had no coast below (land below all round it): it touches no ocean either, and is never said.
{
  const DEEP = { below: ["~~~~~~~~~~~~~", "~~~~~~~~~~~~~", "~~~~~~~~~~~~~", "~~~~LLLLLL~~~", "~~~~LP~LWL~~~", "~~~~LLLLLL~~~", "~~~~~~~~~~~~~", "~~~~~~~~~~~~~", "~~~~~~~~~~~~~"],
    regions: [".............", ".xxxxxxxxxxx.", ".xxxxxxxxxxx.", ".xxxxxxxxxxx.", ".xxxxxxxxxxx.", ".xxxxxxxxxxx.", ".xxxxxxxxxxx.", ".xxxxxxxxxxx.", "............."] };
  for (const [seed, keptWant] of [[1, true], [2, false]]) {
    const w = genWorld(`deep${seed}`, DEEP), PL = w.where((b) => b === "P");
    const r = md.generateLand(GEN(w, { provincesPerState: 2, seed, keepCoasts: false })), land = w.landNow(), ocean = w.oceanIf(land);
    const mine = w.statesNow().filter((s) => s.owner === "PPP"), held = mine.flatMap((s) => s.provinces);
    // hops from PPP's land to the nearest land province touching the ocean, over land
    const hops = (() => { const d = new Map(held.map((p) => [p, 0])), q = [...held]; for (let i = 0; i < q.length; i++) { if (w.nbs(q[i]).some((x) => ocean.has(x))) return d.get(q[i]); for (const x of w.nbs(q[i])) if (land.has(x) && !d.has(x)) { d.set(x, d.get(q[i]) + 1); q.push(x); } } return Infinity; })();
    const isKept = ((r.countries || {}).kept || []).some((k) => k.tag === "PPP");
    const WL = w.where((b) => b === "W"), wHeld = w.statesNow().filter((s) => s.owner === "WWW").flatMap((s) => s.provinces);
    rec(`15d. seed ${seed} (the fixture): PPP ${keptWant ? "kept by the keep pass" : "given its state by the owner passes"}, on land more than ${md.KEPT_COUNTRY_COAST_SLACK} hops from any province on the ocean; WWW's land below touched only land below, and WWW holds land on no ocean`,
      r && r.changed === true && isKept === keptWant && mine.length === 1 && held.some((p) => PL.includes(p)) && hops > md.KEPT_COUNTRY_COAST_SLACK
      && WL.length === 1 && w.nbs(WL[0]).every((q) => w.where((b) => /[A-Z]/.test(b)).includes(q)) && wHeld.length > 0 && !w.touchesAny(wHeld, ocean), { hops, isKept, mine, wHeld });
    rec(`15e. seed ${seed}: countries.noOceanCoast says PPP with the provinces it holds${keptWant ? ", as kept" : ", not as kept"}, and not WWW`,
      JSON.stringify((r.countries || {}).noOceanCoast) === JSON.stringify([Object.assign({ tag: "PPP", provinces: held.length }, keptWant ? { kept: true } : {})]), (r.countries || {}).noOceanCoast);
  }
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
