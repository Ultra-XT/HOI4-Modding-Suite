// ⛔ #a-railway-link-joins-neighbours — A RAILWAY LINK THE GAME WOULD DROP IS REFUSED WHEN IT IS DRAWN, AND REPORTED WHERE IT IS ON THE MAP.
//
// hoi4.exe's SetRailway (0x140F05540, 1.19.4.1) looks each consecutive pair of map/railways.txt up in the province's neighbour list
// (0x1414A6220) and, for a pair that is not there, skips the store (0x140F084D0) and returns: an assert only a debug flag shows,
// nothing in error.log. So the link has no track drawn and carries no supply, and the line has a gap. The neighbour list is every pair
// touching in provinces.bmp, across the east–west wrap too, and every adjacencies.csv row, impassable ones included (0x140AB35F0).
// The Railway tool took any land province with a state as the next click and the write took any pair — reproduced on HEAD's
// map-data.js (10-21): Paris and a province two away were written as `1 2 11506 6569`, and Map Errors said nothing, because
// railway_jump_too_far asks only of pairs more than 8 apart.
//
// Pinned on a 6 x 2 world with a sea channel down its third column: a pair joined by a strait row, a pair joined by an IMPASSABLE row
// (the engine stores it: refusing it would be stricter than the game), a pair touching only across the wrap seam, and a pair touching
// only at a CORNER (no neighbours on a 4-connected bitmap). What the page sends, and what Map Errors says:
//   1. the Railway tool refuses a click on a province that does not touch the line's last one, and takes every kind of neighbour;
//   2. writeRailway refuses the same pair, writes the neighbours, and re-levels a line the map has in place (`relevel`);
//   3. the validator reports every link between provinces that are not neighbours as a WARNING (never fatal), including one a pixel
//      paint made by taking the last border away, and nothing for neighbours;
//   4. the railway panel's level arrow (public/map.js changeRailwayLevel), sent through server.js's own handler as the Save sends it,
//      re-levels an inherited line with a gap in it and never deletes it (#a-railway-level-change-is-one-write).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-link-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the world: 6 x 2 cells of 10 x 10 px, id = row * 6 + col + 1; column 2 (ids 3 and 9) is a sea channel ───────────────────────────
const CS = 10, COLS = 6, ROWS = 2, W = CS * COLS, H = CS * ROWS;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CS), Math.floor(y / CS));
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const SEA = new Set([idAt(2, 0), idAt(2, 1)]);
const STRAIT = [idAt(1, 0), idAt(3, 0)], CLOSED = [idAt(1, 1), idAt(3, 1)], WRAP = [idAt(0, 0), idAt(5, 0)], CORNER = [idAt(3, 0), idAt(4, 1)], BORDER = [idAt(0, 0), idAt(1, 0)];
const stateOf = (id) => (SEA.has(id) ? null : id);   // one state a land province
function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${SEA.has(id) ? "sea;false;ocean;0" : "land;false;plains;1"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/adjacencies.csv", ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment",
    `${STRAIT[0]};${STRAIT[1]};sea;${idAt(2, 0)};-1;-1;-1;-1;;strait`, `${CLOSED[0]};${CLOSED[1]};impassable;-1;-1;-1;-1;-1;;closed`, "-1;-1;;-1;-1;-1;-1;-1;;", ""].join("\n"));
  for (let id = 1; id <= COLS * ROWS; id++) if (!SEA.has(id)) write(g, `history/states/${id}-S.txt`, `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=town\n\tprovinces={ ${id} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  // an inherited line over the corner pair: the game's own map has one, as Old World Blues does
  write(g, "map/railways.txt", `1 2 ${CORNER[0]} ${CORNER[1]}\n`);
  write(g, "map/supply_nodes.txt", `1 ${CORNER[0]}\n`);
  return g;
}
const GAME = makeGame();
let n = 0;
const freshMod = () => { const m = path.join(ROOT, "mod" + (++n)); write(m, "descriptor.mod", 'name="rail links"\n'); return m; };
const rail = (mod, provinces, extra = {}) => md.writeRailway({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], action: "add", provinces, level: 1, ...extra });
const railRows = (mod) => { const f = path.join(mod, "map", "railways.txt"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim()) : []; };
const rule = (mod, name) => { const v = md.validateMapFiles({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] }); return ((v && (v.problems || v)) || []).find((p) => p.rule === name) || null; };

console.log("\n-- the world, as the engine's neighbour list has it (provinceNeighbourGraph) --");
{
  const mod = freshMod();
  const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const adj = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], model });
  const nb = (a, b) => !!(adj && adj.get(a) && adj.get(a).has(b));
  ok(nb(...BORDER) && nb(...STRAIT) && nb(...CLOSED) && nb(...WRAP) && !nb(...CORNER), "THE CONTROL: a border, a strait row, an impassable row and the wrap seam make neighbours; a corner does not", { BORDER: nb(...BORDER), STRAIT: nb(...STRAIT), CLOSED: nb(...CLOSED), WRAP: nb(...WRAP), CORNER: nb(...CORNER) });
}

console.log("\n-- ⭐ 1. the Railway tool refuses the click, and takes every kind of neighbour --");
{
  const colorToProvince = new Map(), data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = colour(provAt(x, y)), i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  for (let id = 1; id <= COLS * ROWS; id++) { const c = colour(id); colorToProvince.set((c[0] << 16) | (c[1] << 8) | c[2], id); }
  const provinceToState = {}; for (let id = 1; id <= COLS * ROWS; id++) if (stateOf(id)) provinceToState[id] = stateOf(id);
  const model = { provinceToState, adjacencies: [{ from: STRAIT[0], to: STRAIT[1], type: "sea", through: idAt(2, 0) }, { from: CLOSED[0], to: CLOSED[1], type: "impassable", through: -1 }] };
  const provinceType = new Map(); for (let id = 1; id <= COLS * ROWS; id++) provinceType.set(id, SEA.has(id) ? "sea" : "land");
  // (railLinkTouches: whether a pair touches on the map as saved and as painted, #a-railway-is-judged-on-the-map-its-write-meets)
  const { sb, statuses } = P.runPage(["function buildPidGrid(", "function buildProvNeighbors(", "function supplyRailReason(", "function railLinkReason(", "function railLinkTouches(", "function handleRailwayClick(", "function updateRailBar("],
    P.loadGlobals({ imgW: W, imgH: H, baseImageData: { data }, colorToProvince, model, provinceType, railPath: [], pidGrid: null, borderEdges: null, provNeighborsCache: null, seaAdjacent: null, draw() {} }));
  sb.buildPidGrid();
  const line = (...ids) => { sb.railPath = []; for (const p of ids) sb.handleRailwayClick(p); return sb.railPath.slice(); };
  const last = () => statuses[statuses.length - 1] || "";
  ok(JSON.stringify(line(CORNER[0], CORNER[1])) === JSON.stringify([CORNER[0]]) && /does not touch/.test(last()), `⭐⭐⭐ a click on ${CORNER[1]}, which meets ${CORNER[0]} only at a corner, is refused and says why`, { path: sb.railPath, status: last() });
  ok(JSON.stringify(line(...BORDER)) === JSON.stringify(BORDER), "⭐ …a province across a border is taken", sb.railPath);
  ok(JSON.stringify(line(...STRAIT)) === JSON.stringify(STRAIT), "⭐ …so is one across a strait row of adjacencies.csv", sb.railPath);
  ok(JSON.stringify(line(...CLOSED)) === JSON.stringify(CLOSED), "⭐ …and one across an impassable row, which the game stores as a neighbour too (never stricter than the game)", sb.railPath);
  ok(JSON.stringify(line(...WRAP)) === JSON.stringify(WRAP), "⭐ …and one that touches only across the east–west seam", sb.railPath);
}

console.log("\n-- ⭐ 2. the write refuses the same pair, and the level change re-adds a line the map has --");
{
  const mod = freshMod();
  const r = rail(mod, CORNER);
  ok(!r.changed && /does not touch/.test(r.error || "") && !fs.existsSync(path.join(mod, "map", "railways.txt")), "⭐⭐⭐ writeRailway refuses the corner pair, and writes nothing", r);
  const r3 = rail(mod, [idAt(5, 1), CORNER[1], CORNER[0]]);
  ok(!r3.changed && /does not touch/.test(r3.error || ""), "⭐ …and a longer line with that pair in it", r3);
  const good = [BORDER, STRAIT, CLOSED, WRAP].map((p) => rail(mod, p));
  ok(good.every((x) => x.changed), "⭐⭐ a border, a strait row, an impassable row and the seam are all written", good.map((x) => x.error || x.changed));
  const back = md.writeRailway({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], action: "relevel", provinces: CORNER, level: 1, to: 2 });
  const corner = railRows(mod).filter((l) => l.trim().split(/\s+/).slice(2).join(" ") === CORNER.join(" "));
  ok(back.changed && corner.length === 1 && corner[0].trim() === `2 2 ${CORNER[0]} ${CORNER[1]}`, "⭐ …and the railway panel's level change (one `relevel` write) re-levels the inherited corner line in place", { back, rows: railRows(mod) });
}

// ⛔ #a-railway-level-change-is-one-write — review of 65a8b2f8, R6: the level change was a queued remove and then an add, and the add was
// spared the neighbour refusal only by a `relevel` flag that had to make it through public/map.js and server.js — and no test held either.
// Sent without it, the remove landed, the add was refused, the line was gone and the Save stopped half applied. Here the page's own
// changeRailwayLevel queues the change, and what it queued goes through server.js's own /api/map/railway handler, as the Save loop sends it.
console.log("\n-- ⭐ 4. the railway panel's level arrow, through the page and the endpoint, re-levels an inherited line with a gap --");
{
  const vm = require("vm");
  const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
  const at = SERVER.indexOf('app.post("/api/map/railway"');
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  ok(at >= 0 && end > at, "(server.js's /api/map/railway handler is found)", { at, end });
  const routes = {};
  vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (url, mw, fn) => { routes[url] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
  });
  // the Save loop, cut down: each queued write in order, stopping at the first one refused (public/map.js's `if (!res || !res.ok)`)
  const save = (mod, writes) => {
    const out = [];
    for (const w of writes) {
      let status = 200, json = null;
      routes[w.url]({ body: Object.assign({}, w.body, { modPath: mod }) }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
      out.push({ status, ok: !!(json && json.ok), error: json && json.error });
      if (!(json && json.ok)) break;
    }
    return out;
  };
  const queued = [];
  const { sb } = P.runPage(["function changeRailwayLevel("], {
    model: { railways: [{ level: 1, provinces: CORNER.slice() }] }, RAIL_LVL_MAX: 5,
    pushUndo() {}, queueWrite: (url, body) => queued.push({ url, body }), renderRailPanel() {}, draw() {},
  });
  sb.changeRailwayLevel(0, 1);
  const mod = freshMod();
  const sent = save(mod, queued);
  ok(queued.length > 0 && sent.length === queued.length && sent.every((s) => s.ok), "⭐⭐ every write the level arrow queued is taken by the endpoint: the Save does not stop", { queued, sent });
  const corner = railRows(mod).filter((l) => l.trim().split(/\s+/).slice(2).join(" ") === CORNER.join(" "));
  ok(corner.length === 1 && corner[0].trim() === `2 2 ${CORNER[0]} ${CORNER[1]}`, "⭐⭐⭐ …and the inherited corner line is in the mod's railways.txt at level 2, once: not deleted", railRows(mod));
  // THE CONTROL — what the remove-then-add pair did when the add went without its flag: the line is gone and the Save stops at the add
  const pairMod = freshMod();
  const pair = save(pairMod, [{ url: "/api/map/railway", body: { action: "remove", provinces: CORNER, level: 1 } }, { url: "/api/map/railway", body: { action: "add", provinces: CORNER, level: 2 } }]);
  ok(pair.length === 2 && pair[0].ok && !pair[1].ok && /does not touch/.test(pair[1].error || "") && !railRows(pairMod).some((l) => l.trim().endsWith(`${CORNER[0]} ${CORNER[1]}`)),
    "THE CONTROL: a remove and then an add of the same gap line deletes it and stops at the add — why the change is one write", { pair, rows: railRows(pairMod) });
}

console.log("\n-- ⭐ 3. Map Errors reports a link between provinces that do not touch: a warning, never fatal --");
{
  // ⛔ #a-railway-gap-below-is-not-the-add-ons (B4-3) — this used to report CORNER, whose line the game's own map ships: a gap the map below
  // already has is the base's, wherever the mod's file carries it. The mod's own gap is the other corner pair, which nothing below has.
  const OWN = [idAt(4, 0), idAt(3, 1)];
  const mod = freshMod();
  write(mod, "map/railways.txt", `1 3 ${BORDER[0]} ${BORDER[1]} ${STRAIT[1]}\n1 2 ${CLOSED[0]} ${CLOSED[1]}\n1 2 ${WRAP[0]} ${WRAP[1]}\n1 2 ${CORNER[0]} ${CORNER[1]}\n1 2 ${OWN[0]} ${OWN[1]}\n`);
  const p = rule(mod, "railway_link_not_neighbours");
  ok(p && p.severity === "warning" && (p.items || []).length === 1 && p.items[0].from === OWN[0] && p.items[0].to === OWN[1], "⭐⭐⭐ exactly the mod's own corner pair is reported, as a warning — and not the inherited line's corner the game's map ships", p);
  ok(p && !labels.isFatalRule(p.rule) && labels.mapRuleLabel(p.rule) !== p.rule, "…not fatal (the game loads past it), and it has a label of its own", p && { fatal: labels.isFatalRule(p.rule), label: labels.mapRuleLabel(p.rule) });
  ok(!rule(mod, "railway_jump_too_far"), "…and the far-jump rule, for pairs more than 8 apart, does not say it twice");
  const clean = freshMod();
  write(clean, "map/railways.txt", `1 3 ${BORDER[0]} ${BORDER[1]} ${STRAIT[1]}\n1 2 ${CLOSED[0]} ${CLOSED[1]}\n1 2 ${WRAP[0]} ${WRAP[1]}\n`);
  ok(!rule(clean, "railway_link_not_neighbours"), "⭐ a map whose every link is a neighbour hears nothing");
  // a pixel paint takes the last border between two provinces on a line: province 5's column against 4 becomes 11's
  const painted = freshMod();
  const A = idAt(3, 0), B = idAt(4, 0);
  write(painted, "map/railways.txt", `1 2 ${A} ${B}\n`);
  ok(!rule(painted, "railway_link_not_neighbours"), "THE CONTROL: the line between two touching provinces is clean");
  write(painted, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y) === B && x === 4 * CS ? idAt(4, 1) : provAt(x, y))));
  write(painted, "map/definition.csv", fs.readFileSync(path.join(GAME, "map", "definition.csv")));
  const q = rule(painted, "railway_link_not_neighbours");
  ok(q && (q.items || []).some((it) => it.from === A && it.to === B), "⭐⭐ …and once a paint takes their last border away, Map Errors reports the link the game will now drop", q);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
