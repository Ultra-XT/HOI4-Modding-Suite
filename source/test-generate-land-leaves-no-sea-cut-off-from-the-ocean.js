// Generate land leaves no sea cut off from the ocean: each one it would cut off goes back to the ocean, or becomes land with it,
// whichever changes less. #generate-land-leaves-no-sea-cut-off
//
// THE DEFECT. TEST 32 (Delete map, Generate land 35% seed 1, Auto-fix, Redraw) left 30 seas walled off from the ocean — 213
// provinces, the largest 146. Generate land's fill kept them all: at Generate time the strategic regions are still the base game's,
// over a map Delete map drowned, and 185 of its 301 regions are at least half water (95 in vanilla), so the half-water keep — meant
// for a designed sea like the Caspian — held every pond. Auto-fix laid spawn rows facing them and berthed fleets in them: 10 of 44
// harbours opened only onto a pond, 140 spawn rows faced one, 21 of the 1936 task forces could not leave. Vanilla has ONE sea body.
//
// THE FIX. Before any write, a sea the click cut off goes back to the ocean when the fewest of the click's picks between them is
// smaller than the sea (those picks stay sea), or when it must stay sea — a port in the mod's OWN buildings.txt opens onto it, or
// a province of it is in no strategic region; every other sea the click cut off becomes land with it, the half-water keep off.
//
// Fixture: A8's running-bond lattice (the shape Delete map leaves: all sea, in small provinces, wrap seam included), grown at four
// seeds that each cut off a sea the rule joins by cost, at least two it fills, and a one-province sea in a mostly-water region the
// rule fills where the half-water keep left a pond (measured on A8 + the rule; asserted below as CONTROLs, never assumed). Seed 57
// also keeps two seas open with ONE chain that crosses another pocket — a picks-only walk left three picks sea there, not two — so
// the count of seas kept open is told from the count of chains (review R-P1, R-P2). A port is written BEFORE the click onto the
// smallest cut-off sea outside a mostly-water region. Which seas the growth cuts off is read off a probe run with the fill off; what
// the rule then does is derived by an oracle written here: largest sea first, re-measured after each join, the fewest picks with
// another pocket crossed for nothing, lowest ids first.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noponds-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
function bmp8(width, height, fn) {
  const rs = Math.floor((8 * width + 31) / 32) * 4, isz = rs * height;
  const b = Buffer.alloc(54 + 1024 + isz);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + 1024 + isz, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18); b.writeInt32LE(height, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(isz, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) b[54 + 1024 + (height - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const at8 = (file, width, height, x, y) => { const b = fs.readFileSync(file); const rs = Math.floor((8 * width + 31) / 32) * 4; return b[b.readUInt32LE(10) + (height - 1 - y) * rs + x]; };
const terrainFile = (table, water) => "categories = {\n"
  + Object.keys(table).map((c) => `\t${c} = {${water.includes(c) ? " is_water = yes" : ""} color = { 100 120 140 } movement_cost = 1.0 }`).join("\n")
  + "\n}\nterrain = {\n" + Object.entries(table).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n}\n";
const TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, jungle: 21, lakes: 14, ocean: 15 };

const typesIn = (mod) => {
  const t = new Map();
  for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = ln.split(";");
    if (c.length > 4 && /^\d+$/.test(c[0])) t.set(+c[0], c[4]);
  }
  return t;
};
const statesIn = (mod) => {
  const d = path.join(mod, "history", "states");
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".txt")).map((f) =>
    ((/provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(d, f), "utf8")) || [])[1] || "").match(/\d+/g) || []).map((l) => l.map(Number));
};
const same = (a, b) => JSON.stringify([...a].map(Number).sort((x, y) => x - y)) === JSON.stringify([...b].map(Number).sort((x, y) => x - y));
const filesIn = (d, rel = "", out = []) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) filesIn(p, rel + f + "/", out); else out.push(rel + f + ":" + fs.readFileSync(p).toString("base64")); } return out; };

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE LATTICE — A8's (test-generate-land-fills-the-seas-it-cuts-off.js): running bond, column 0 one tall sea province in no
// strategic region, eight regions, the province graph walked off the bitmap itself, wrap seam included.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const M = 16, W = 2 * M + 1, H = 20, N = 180, SEEDS = [1, 7, 60, 57];
const GRID = new Int32Array(W * H);
let PROVINCES = 1;
for (let y = 0; y < H; y++) {
  GRID[y * W] = 1;
  if (y % 2 === 0) for (let k = 0; k < M; k++) { const id = ++PROVINCES; GRID[y * W + 1 + 2 * k] = id; GRID[y * W + 2 + 2 * k] = id; }
  else {
    GRID[y * W + 1] = ++PROVINCES;
    for (let k = 0; k < M - 1; k++) { const id = ++PROVINCES; GRID[y * W + 2 + 2 * k] = id; GRID[y * W + 3 + 2 * k] = id; }
    GRID[y * W + W - 1] = ++PROVINCES;
  }
}
const firstPixel = new Map();
for (let i = 0; i < W * H; i++) if (!firstPixel.has(GRID[i])) firstPixel.set(GRID[i], [i % W, Math.floor(i / W)]);
const xyOf = (id) => firstPixel.get(id);
// #a-raise-knows-where-the-map-ends — past the map's top and bottom rows is water to the raise, so a raised pixel on either is the
// beach's foot; anywhere else, raised is above sea level
const raisedAt = (hm, p) => { const [x, y] = xyOf(p), v = at8(hm, W, H, x, y); return y === 0 || y === H - 1 ? v === md.HEIGHTMAP_BEACH_RAMP[0] : v >= md.HEIGHTMAP_SEA_LEVEL; };
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const regionOf = (id) => { if (id === 1) return 0; const [x, y] = xyOf(id); return Math.floor(x / Math.ceil(W / 4)) + 4 * Math.floor(y / (H / 2)) + 1; };
const NEIGHBOURS = new Map();
{
  const link = (a, b) => { if (a === b) return; for (const [p, q] of [[a, b], [b, a]]) { if (!NEIGHBOURS.has(p)) NEIGHBOURS.set(p, new Set()); NEIGHBOURS.get(p).add(q); } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { link(GRID[y * W + x], GRID[y * W + (x + 1) % W]); if (y + 1 < H) link(GRID[y * W + x], GRID[(y + 1) * W + x]); }
}
const nbSorted = (id) => [...(NEIGHBOURS.get(id) || [])].sort((a, b) => a - b);

function makeLattice(tag, { portOn = 0 } = {}) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(mod, "descriptor.mod"), 'name="NoPonds"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(`${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(GRID[y * W + x])));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(W, H, () => md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "terrain.bmp"), bmp8(W, H, () => TABLE.ocean));
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"), terrainFile(TABLE, ["ocean", "lakes"]));
  const byRegion = new Map();
  for (let id = 2; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  // a port the modder placed BEFORE the click, its ships lying in sea `portOn` (the 7th column)
  if (portOn) mk(path.join(mod, "map", "buildings.txt"), portRow(portOn) + "\r\n");
  return mod;
}
const portRow = (sea) => { const [x, y] = xyOf(sea); return `1;naval_base_spawn;${x}.00;9.90;${y}.00;0.00;${sea}`; };

// the sea bodies of the lattice given which provinces are sea, largest first, ties to the lowest id
function seaBodies(isSea) {
  const seen = new Set(), comps = [];
  for (let id = 1; id <= PROVINCES; id++) {
    if (!isSea(id) || seen.has(id)) continue;
    const q = [id], c = []; seen.add(id);
    while (q.length) { const p = q.pop(); c.push(p); for (const n of NEIGHBOURS.get(p) || []) if (isSea(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    comps.push(c.sort((a, b) => a - b));
  }
  return comps.sort((a, b) => b.length - a.length || a[0] - b[0]);
}
// THE ORACLE: the rule, over the lattice (all sea before the click, so the ocean is the largest body). Largest cut-off sea first; the
// fewest picks between it and the ocean — a pick costs one, another sea still cut off nothing to cross (review R-P1) — searched from
// its own sorted provinces, neighbours in id order, the free steps first; joined when that is fewer than its provinces or it must
// stay sea; re-measured after each join. What is still cut off at the end is filled. `chains` counts the joins, `seas` what they
// put back of the seas cut off at the start: one chain can open two.
function rule(picks, mustStaySea) {
  const raised = new Set(picks), left = [], unreachable = [];
  const isSea = (id) => !raised.has(id);
  const start = seaBodies(isSea).slice(1);
  let chains = 0, across = 0;
  for (;;) {
    const bodies = seaBodies(isSea);
    if (bodies.length <= 1) break;
    const ocean = new Set(bodies[0]);
    let joined = false;
    for (const b of bodies.slice(1)) {
      const mine = new Set(b), dist = new Map(b.map((p) => [p, 0])), prev = new Map(b.map((p) => [p, null]));
      const free = [], paid = [...b];
      let chain = null, h = 0, crossed = false;
      while (!chain && (free.length || h < paid.length)) {
        const c = free.length ? free.pop() : paid[h++];
        if (raised.has(c) && nbSorted(c).some((r) => ocean.has(r))) {
          chain = [];
          for (let x = c; x != null; x = prev.get(x)) if (raised.has(x)) chain.unshift(x); else if (!mine.has(x)) crossed = true;
          break;
        }
        for (const r of nbSorted(c)) {
          const w = raised.has(r) ? 1 : !ocean.has(r) && !mine.has(r) ? 0 : -1;
          if (w < 0 || (dist.has(r) && dist.get(c) + w >= dist.get(r))) continue;
          dist.set(r, dist.get(c) + w); prev.set(r, c); (w ? paid : free).push(r);
        }
      }
      const must = mustStaySea(b);
      if (!chain) { if (must) unreachable.push(b); continue; }
      if (must || chain.length < b.length) { for (const p of chain) { raised.delete(p); left.push(p); } chains++; if (crossed) across++; joined = true; break; }
    }
    if (!joined) break;
  }
  const after = seaBodies(isSea).slice(1);
  const home = new Set(seaBodies(isSea)[0] || []);
  return { left, fills: after.flat(), filledBodies: after, unreachable, chains, across, seas: start.filter((b) => home.has(b[0])).length };
}
const generate = (mod, seed, extra = {}) => md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed, ...extra });

let note = null;
const opened = [];
try {
  const lib = require("./testlib-map-page.js");
  note = vm.runInNewContext(lib.lift("function generatedInlandSeasNote(") + "\ngeneratedInlandSeasNote", {});
} catch (e) { note = null; }

try {
  console.log("=== Generate land leaves no sea cut off from the ocean ===");

  for (const SEED of SEEDS) {
    console.log(`\n── seed ${SEED} ──`);
    // the probe: what this growth walls off, with the fill (and so the join) off
    const probe = makeLattice(`probe${SEED}`);
    const g0 = generate(probe, SEED, { fillCutOffSeas: false });
    const t0 = typesIn(probe);
    const picks = [...t0].filter(([, t]) => t === "land").map(([id]) => id);
    const bodies = seaBodies((id) => t0.get(id) === "sea").slice(1);
    const water = new Map(), size = new Map();
    for (let id = 2; id <= PROVINCES; id++) { const r = regionOf(id); size.set(r, (size.get(r) || 0) + 1); if (t0.get(id) !== "land") water.set(r, (water.get(r) || 0) + 1); }
    const halfWater = (b) => b.some((p) => p !== 1 && 2 * (water.get(regionOf(p)) || 0) >= size.get(regionOf(p)));
    const portBody = bodies.filter((b) => !halfWater(b)).sort((a, b) => a.length - b.length || a[0] - b[0])[0] || [];
    const mustStaySea = (b) => b.includes(portBody[0]) || b.includes(1);   // the port's, or one with column 0 (no strategic region)
    const want = rule(picks, mustStaySea);
    const fate = (b) => (b.every((p) => want.fills.includes(p)) ? "filled" : "joined");
    const joinedByCost = bodies.filter((b) => fate(b) === "joined" && !mustStaySea(b));
    const filledBodies = bodies.filter((b) => fate(b) === "filled");
    const halfFilled = filledBodies.filter(halfWater);
    opened.push({ seed: SEED, seas: want.seas, chains: want.chains, across: want.across });
    console.log(`     cut off: ${bodies.map((b) => `${b.length}${halfWater(b) ? "h" : ""}${b === portBody ? "p" : ""}→${fate(b)}`).join(", ")}; picks left sea ${want.left.length}; ${want.seas} sea(s) kept open by ${want.chains} chain(s), ${want.across} across another pocket`);
    rec(`THE CONTROL (seed ${SEED}): the growth cuts off a sea the rule joins by cost, two it fills, and one in a mostly-water region it fills`,
      g0.flippedProvinces === N && joinedByCost.length >= 1 && filledBodies.length >= 2 && halfFilled.length >= 1 && portBody.length > 0,
      { bodies: bodies.map((b) => b.length), joinedByCost: joinedByCost.length, filled: filledBodies.length, halfFilled: halfFilled.length });
    rec(`THE CONTROL (seed ${SEED}): every sea that must stay sea has a way out through the picks alone`, want.unreachable.length === 0, want.unreachable);

    const on = makeLattice(`on${SEED}`, { portOn: portBody[0] });
    const g = generate(on, SEED);
    const t = typesIn(on), is = g.inlandSeas || {};
    const left = is.leftSea || [], filled = is.provinces || [];
    rec(`⭐⭐⭐ (seed ${SEED}) after the click there is ONE sea body — nothing is cut off from the ocean`,
      g.changed === true && seaBodies((id) => t.get(id) === "sea").length === 1, { err: g.error, bodies: seaBodies((id) => t.get(id) === "sea").map((b) => b.length) });
    const inStates = statesIn(on), hm = path.join(on, "map", "heightmap.bmp");
    rec(`⭐⭐⭐ (seed ${SEED}) the picks the joins left sea are the oracle's — sea, at sea level, in no state`,
      same(left, want.left) && left.every((p) => t.get(p) === "sea" && at8(hm, W, H, ...xyOf(p)) === md.HEIGHTMAP_SEA_VALUE && !inStates.some((s) => s.includes(p))),
      { left, want: want.left });
    rec(`⭐⭐⭐ (seed ${SEED}) the seas it filled are the oracle's — land, each in exactly one state, raised — the mostly-water one among them`,
      same(filled, want.fills) && halfFilled.flat().every((p) => filled.includes(p))
      && filled.every((p) => t.get(p) === "land" && inStates.filter((s) => s.includes(p)).length === 1 && raisedAt(hm, p)),
      { filled, want: want.fills, heights: filled.map((p) => at8(hm, W, H, ...xyOf(p))) });
    // the page prints this number as seas: one chain that opens two counts two (review R-P2)
    rec(`⭐⭐ (seed ${SEED}) …and the number of seas it kept open is the oracle's — seas, not the chains that opened them`,
      is.joined === bodies.length - filledBodies.length && is.joined === want.seas, { joined: is.joined, want: want.seas, chains: want.chains });
    // the row as written, but for its height: the raise stands every model on the ground it writes (reseatModelHeights)
    const rowBut = (l) => l.split(";").map((c, i) => (i === 3 ? "*" : c)).join(";");
    const rows = fs.readFileSync(path.join(on, "map", "buildings.txt"), "utf8").split(/\r?\n/).map(rowBut);
    rec(`⭐⭐⭐ (seed ${SEED}) the sea the modder's port faces is joined to the ocean, and the port's row is still there`,
      portBody.every((p) => t.get(p) === "sea") && fate(portBody) === "joined" && rows.includes(rowBut(portRow(portBody[0]))), { port: portBody, types: portBody.map((p) => t.get(p)) });
    rec(`(seed ${SEED}) the land it counts is what it asked for, less the picks left sea, plus the seas filled`,
      g.flippedProvinces === N - left.length + filled.length, { flipped: g.flippedProvinces, N, left: left.length, filled: filled.length });
    // like for like, with no port (filling alone would leave the port's sea a pond, and change nothing there)
    const bare = generate(makeLattice(`bare${SEED}`), SEED), bareFill = generate(makeLattice(`barefill${SEED}`), SEED, { joinCutOffSeas: false });
    const changed = ((bare.inlandSeas || {}).leftSea || []).length + ((bare.inlandSeas || {}).provinces || []).length;
    const fillOnly = ((bareFill.inlandSeas || {}).provinces || []).length;
    rec(`⭐⭐ (seed ${SEED}) it changes fewer provinces than filling every sea it cut off would`,
      fillOnly === bodies.flat().length && changed < fillOnly, { join: changed, fillOnly, cutOff: bodies.flat().length });
    const a = md.autoFixMap({ modRoot: on, gameRoot: null, dependencyRoots: [] });
    const ai = ((a || {}).fixes || {}).inlandSeas || {};
    rec(`⭐⭐⭐ (seed ${SEED}) the Auto-fix after it finds no sea cut off: nothing to fill, nothing kept`, !ai.error && ai.fixed === 0 && ai.keptSeaBodies === 0, ai);
    if (note) {
      const said = note(g), j = Number(is.joined) || 0;
      rec(`⭐⭐ (seed ${SEED}) the page says how many seas stay open, and how many picks were left sea for it`,
        said.includes(` ${j.toLocaleString()} sea${j === 1 ? "" : "s"} it would have cut off ${j === 1 ? "stays" : "stay"} open to the ocean`)
        && said.includes(`(${left.length.toLocaleString()} province${left.length === 1 ? "" : "s"} of the new land ${left.length === 1 ? "was" : "were"} left sea)`), said);
    } else rec("public/map.js has generatedInlandSeasNote", false);
  }

  rec("THE CONTROL: at one seed at least, one chain crosses another pocket and keeps two seas open, so seas are not chains",
    opened.some((o) => o.across > 0 && o.seas > o.chains), opened);

  console.log("\n── the unit positions a layout gives every sea are no port, for the join either ──");
  {
    // Auto-fix lays out map/unitstacks.txt with sea-only rows on EVERY sea province, and Delete map leaves the file: read as use, it
    // made every sea a re-rolled world cut off a must-join, and the join then left 80 provinces of the new land sea as channels on
    // the owner's re-roll, against 12. The sea-only types are map-data.js's own.
    const { stripJsComments } = require("./testlib-strip-comments.js");
    const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const SEA_ONLY = ((/const UNITSTACK_SEA_ONLY_TYPES\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(src) || [])[1] || "").match(/\d+/g) || [];
    const SEED = SEEDS[0];
    const layOut = (mod) => {
      const rows = [];
      for (let id = 1; id <= PROVINCES; id++) { const [x, y] = xyOf(id); for (const ty of SEA_ONLY) rows.push(`${id};${ty};${x}.00;9.50;${H - 1 - y}.00;0.00;0.00`); }
      mk(path.join(mod, "map", "unitstacks.txt"), rows.join("\r\n") + "\r\n");
      return mod;
    };
    const plain = makeLattice("plain");
    const laid = layOut(makeLattice("laid"));
    rec("THE CONTROL: the repair's own reading of the mod's files calls every province of the laid-out lattice in use",
      SEA_ONLY.length > 0 && md.seaProvincesPutToUse({ modRoot: laid }).size === PROVINCES, SEA_ONLY);
    const gp = generate(plain, SEED), gl = generate(laid, SEED);
    const ip = gp.inlandSeas || {}, il = gl.inlandSeas || {};
    rec("THE CONTROL: without a port, the click still joins one sea and fills others", (ip.joined || 0) > 0 && (ip.filled || 0) > 0, ip);
    rec("⭐⭐⭐ with the layout it joins and fills exactly what it does without one",
      same(ip.leftSea || [], il.leftSea || []) && same(ip.provinces || [], il.provinces || []) && ip.joined === il.joined, { plain: ip, laid: il });
  }

  console.log("\n── a click whose every pick would wall off a sea that must stay open makes no land, and says so ──");
  {
    // A8's section-4 shape, 16 x 4 columns: land (4, 3), a pocket of sea (2) in NO strategic region, a sea (1) — the only province
    // the growth can pick — and the ocean (5, 6). Raising 1 walls the pocket off; the pocket cannot become land, so 1 stays sea.
    const C = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50], 6: [60, 60, 60] };
    const at = (x) => (x <= 1 ? 4 : x <= 2 ? 3 : x <= 4 ? 2 : x <= 6 ? 1 : x <= 12 ? 5 : 6);
    const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea" };
    const emptyMod = (tag) => {
      const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
      mk(path.join(m, "descriptor.mod"), 'name="Empty"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
      mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${C[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
      mk(path.join(m, "map", "provinces.bmp"), bmp24(16, 4, (x) => C[at(x)]));
      mk(path.join(m, "map", "strategicregions", "1.txt"), "strategic_region={\n\tid=1\n\tname=\"REGION_1\"\n\tprovinces={ 1 }\n\tweather={}\n}\n");
      mk(path.join(m, "map", "strategicregions", "2.txt"), "strategic_region={\n\tid=2\n\tname=\"REGION_2\"\n\tprovinces={ 3 4 }\n\tweather={}\n}\n");
      return m;
    };
    const m = emptyMod("empty"), twin = emptyMod("empty-off");
    const before = filesIn(m).sort().join("\n");
    const g = md.generateLand({ modRoot: m, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1 });
    const gOff = md.generateLand({ modRoot: twin, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1, joinCutOffSeas: false });
    rec("THE CONTROL: with the join off, the click raises 1 and leaves the pocket a pond, as the fill alone did", gOff.changed === true && typesIn(twin).get(1) === "land" && typesIn(twin).get(2) === "sea", { err: gOff.error, seas: gOff.inlandSeas });
    rec("⭐⭐⭐ with it on, the click made no land and SAYS so — not \"Generated 0 land provinces\" and a change",
      g.changed === false && /made no land/.test(String(g.error || "")) && same((g.inlandSeas || {}).leftSea || [], [1]), { changed: g.changed, error: g.error, seas: g.inlandSeas });
    rec("⛔ …and nothing was written", filesIn(m).sort().join("\n") === before);
  }

  console.log(`\n=== Generate land leaves no sea cut off from the ocean: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
