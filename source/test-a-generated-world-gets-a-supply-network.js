// #a-generated-world-has-no-supply-network — Generate land leaves a world with no supply hubs and no railways.
//
// THE FINDING. The owner's flow is Delete map, then Generate land. Delete map empties map/supply_nodes.txt and
// map/railways.txt on purpose (a world with no land has neither) and NOTHING put them back, so the cleanest
// world Nova can build reported supply_nodes_empty and railways_empty and the modder's only remedy was to place
// hundreds of hubs by hand with the 🏭 Supply hub tool. generateLand already calls ensureBuildingSlotsForState
// for every state it makes, for exactly the same reason; it never adopted the supply half.
//
// NOT A CRASH — hoi4.exe settles that, so this is a warning and this repair is about the game being PLAYABLE,
// not about it loading. Measured on the exe installed 2026-09-17, 55,778,424 bytes (dumpbin, image base
// 0x140000000). ⛔ Steam replaced the 55,680,632-byte build the earlier engine notes were taken from WHILE this
// was being written, and every VA in them moved. 1.19.4.1 (56,530,040 bytes) moved them again on 2026-10-30, and the
// addresses below are that build's — re-derive from the STRINGS, never from a remembered address:
//   * map/supply_nodes.txt is read by 0x140F38680 and map/railways.txt by 0x140F039B0. Both open with
//     `lea rcx,<path>; call 0x142561040; test al,al; je <epilogue>`, and 0x142561040 is a 37-byte path
//     predicate whose 36 callers pass common/achievements.txt, common/weather.txt, map/unitstacks.txt and
//     continue_game.json — so a MISSING file returns before anything is parsed.
//   * Neither function contains any string but its own filename (the only other two are the shared
//     gamestate.h asserts), so an EMPTY file is parsed to zero rows and logged nowhere.
//   * Neither reaches the failed-load path (0x140201F90 here), whose only two callers are the map check
//     0x1401E3F70 and strategicair.cpp 0x140CB6BE0.
// What IS missing is supply: since 1.11 every unit is fed through hubs and the rail out of them.
//
// WHAT THE SIX SHIPPING MAPS DO, measured through buildMapModel + provinceNeighbourGraph (vanilla / Millennium
// Dawn / Road to 56 / Old World Blues / Novum Vexillum / Rise of Nations): every one of the 5,417 hubs is level
// 1; 5,414 stand on land; railways run levels 1-4 (never 5) along paths of adjacent provinces, median length 4,
// and 909 of them cover vanilla's 727 hubs — a shade more than a spanning tree. Those are the invariants this
// file holds the generator to, re-derived here from the fixture rather than typed in as counts.
//
// WHICH STATES GET ONE. A hub covers only 42.6-72.9% of land states, and with a map underneath to ask, Generate land now
// copies it: the capitals, then the share of each state_category the map below hubs, the towns first, none on land its
// country reaches neither by rail nor by sea (#a-generated-world-has-the-layer-belows-hubs-per-state —
// test-a-generated-world-has-the-layer-belows-hubs-per-state.js and test-a-generated-world-and-auto-fix-keep-every-capital-on-a-hub.js).
// ⚠️ MOVED WITH THAT FIX: this said "a generated state has no victory point … so one hub per state", and both premises are
// gone — Generate land writes a victory point in every state, and a state with no hub is fed over its neighbours'
// provinces, as 568 of vanilla's are. THIS file runs with no game below (gameRoot null), so nothing below has a hub to
// ask and the FALLBACK stands: one hub per state, on the province stateBuildingAnchor already gives that state's air
// base and factories: its TOWN province (townProvinceOf — the smallest of its land provinces that holds a city core and
// has a 3x3 of its own; with none, its largest), where Generate land also puts the state's victory point. ⚠️ This said
// "its largest land province" until #a-town-on-a-town-sized-province.
//
// Run: node test-a-generated-world-gets-a-supply-network.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-supplynet-"));
process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");

let pass = 0, fail = 0;
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok  " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "  " + JSON.stringify(detail).slice(0, 400))); fail++; }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ── a self-contained ocean world with province shapes of its own ─────────────────────────────────────────
// Nothing here reads the installed game: a 48x32 grid of one-pixel provinces, so provinceNeighbourGraph has a
// real four-neighbour adjacency to grow landmasses along and to run railways over.
const W = 48, H = 32;
const PROVINCES = W * H;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const regionOf = (id) => { const i = id - 1; return Math.floor((i % W) / 12) + 4 * Math.floor(Math.floor(i / W) / 8) + 1; };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const IRS = Math.floor((8 * W + 31) / 32) * 4;
function bmp8(fn) {
  const isz = IRS * H;
  const b = Buffer.alloc(54 + 1024 + isz);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + 1024 + isz, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(isz, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; b[o + 3] = 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[54 + 1024 + (H - 1 - y) * IRS + x] = fn(x, y);
  return b;
}

/** An all-sea mod with the two supply files EMPTY — exactly what Delete map leaves behind. */
function makeMod(tag, { supplyRows = "", railRows = "", replaceStates = true } = {}) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  // replaceStates false makes an ADD-ON of it: the layer below's state files still load, which is the case
  // where the repair must decline.
  mk(path.join(mod, "descriptor.mod"), 'name="Supply"\n' + (replaceStates ? 'replace_path="history/states"\n' : "") + 'replace_path="map"\nreplace_path="map/strategicregions"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(`${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(() => md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "supply_nodes.txt"), supplyRows);
  mk(path.join(mod, "map", "railways.txt"), railRows);
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) {
    mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  }
  return mod;
}

const readHubs = (mod) => md.parseSupplyNodes(fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8"));
const readRails = (mod) => md.parseRailways(fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8"));

// ⚠️ SEND WHAT THE CLIENT SENDS: /api/map/validate composes FOUR calls and supply_nodes_empty only comes out of
// the last of them. Asking validateMapModel alone would read half a validator as silence.
const validateLikeTheEndpoint = (mod) => {
  const model = md.buildMapModel({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
  return [
    ...md.findStateFileConflicts(mod),
    ...md.validateMapModel(model),
    ...md.findBuildingAnchorMismatches({ modRoot: mod, gameRoot: null, dependencyRoots: [], model }),
    ...md.validateMapBitmap({ modRoot: mod, gameRoot: null, dependencyRoots: [] }),
  ];
};

const N = 600;

console.log("\n=== 1. Generate land gives the world it made a supply network ===");
const mod = makeMod("gen");
const gen = md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
// #generate-land-fills-the-seas-it-cuts-off — the N asked for, and the seas the grown coast cut off, which became land with it
// #generate-land-leaves-no-sea-cut-off — …less the picks left sea to keep a sea it would have cut off open to the ocean
rec("the generator ran and grew landmasses", gen.changed === true && !gen.error && gen.flippedProvinces === N - ((gen.inlandSeas || {}).leftSea || []).length + ((gen.inlandSeas || {}).filled || 0) && gen.grown === true, gen.error || gen);
rec("it reports the network it wrote", !!gen.supplyNetwork && gen.supplyNetwork.changed === true && gen.supplyNetwork.hubs > 0 && gen.supplyNetwork.railways > 0, gen.supplyNetwork);

const model = md.buildMapModel({ modRoot: mod, gameRoot: null, dependencyRoots: [], cacheStableLayers: false });
const adj = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: null, dependencyRoots: [], model });
const byId = new Map(model.provinces.map((d) => [d.id, d]));
const isLand = (p) => { const d = byId.get(p); return !!d && d.type === "land"; };
const p2s = model.provinceToState || {};

const hubs = readHubs(mod), rails = readRails(mod);
const newStateIds = new Set((gen.newStates || []).map((s) => s.id));

// ── the hubs ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ the FALLBACK (no hub below to ask — gameRoot null): with one, only the states the map below would hub get one
rec("⭐ with no map underneath to ask, one hub for every state the generator made — the fallback",
  hubs.length === newStateIds.size && new Set(hubs.map((h) => h.province)).size === hubs.length,
  { hubs: hubs.length, states: newStateIds.size });
rec("every hub is level 1, as every one of the 5,417 hubs on the six shipping maps is",
  hubs.length > 0 && hubs.every((h) => h.level === 1), [...new Set(hubs.map((h) => h.level))]);
rec("every hub stands on LAND", hubs.every((h) => isLand(h.province)), hubs.filter((h) => !isLand(h.province)).slice(0, 5));
rec("every hub stands in a state — a hub on a stateless province is the wiki's named crash",
  hubs.every((h) => p2s[h.province] != null), hubs.filter((h) => p2s[h.province] == null).slice(0, 5));
rec("each of the generator's states holds exactly one",
  (() => { const per = new Map(); for (const h of hubs) { const s = p2s[h.province]; per.set(s, (per.get(s) || 0) + 1); } return [...newStateIds].every((s) => per.get(s) === 1); })(),
  hubs.length);

// DERIVED, not typed: re-read the bitmap and work out each state's TOWN province independently — the smallest of its land
// provinces that holds a city core (townCoreArea: 1 px here, with no layer below to measure one by) and has a 3x3 of its own
// pixels, lowest id on a tie; with none, its largest, lowest id on a tie.
// ⚠️ MOVED WITH #a-town-on-a-town-sized-province: this derived the state's LARGEST land province and its label said so. On this
// grid the two are one province — every province is a single pixel, none has a 3x3 of its own, so every state falls back to its
// largest — which is why the check went on passing; test-a-town-stands-on-a-town-sized-province.js pins a state where they differ.
{
  const area = new Map(), own3x3 = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = idAt(x, y); area.set(id, (area.get(id) || 0) + 1);
    let full = x > 0 && y > 0 && x < W - 1 && y < H - 1;
    for (let dy = -1; dy <= 1 && full; dy++) for (let dx = -1; dx <= 1; dx++) if (idAt(x + dx, y + dy) !== id) { full = false; break; }
    if (full) own3x3.add(id);
  }
  const core = md.townCoreArea({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
  const want = new Map(), largest = new Map();
  for (const s of (model.states || []).filter(Boolean)) {
    if (!newStateIds.has(s.id)) continue;
    const own = (s.provinces || []).filter((p) => isLand(p) && p2s[p] === s.id).slice().sort((a, b) => a - b);
    let best = -1, bestN = -1;
    for (const p of own) { const n = area.get(p) || 0; if (n > bestN) { bestN = n; best = p; } }
    if (best >= 0) largest.set(s.id, best);
    const town = own.filter((p) => (area.get(p) || 0) >= core && own3x3.has(p)).sort((a, b) => (area.get(a) || 0) - (area.get(b) || 0) || a - b)[0];
    if ((town || best) > 0) want.set(s.id, town || best);
  }
  rec("(the fixture: no province here has a 3x3 of its own, so every state's town province is its largest)",
    own3x3.size === 0 && want.size > 0 && [...want].every(([s, p]) => largest.get(s) === p), { own3x3: own3x3.size, core });
  const got = new Map(hubs.map((h) => [p2s[h.province], h.province]));
  rec("⭐ a hub sits on its state's town province, the one stateBuildingAnchor gives that state's air base and factories",
    want.size > 0 && [...want].every(([s, p]) => got.get(s) === p),
    [...want].filter(([s, p]) => got.get(s) !== p).slice(0, 5));
  const vpOf = new Map((model.states || []).filter(Boolean).map((s) => [s.id, ((s.victoryPoints || [])[0] || {}).province]));
  rec("…which is the province Generate land put that state's victory point on", want.size > 0 && [...want].every(([s, p]) => +vpOf.get(s) === p),
    [...want].filter(([s, p]) => +vpOf.get(s) !== p).slice(0, 5).map(([s, p]) => [s, p, vpOf.get(s)]));
}

// ── the railways ─────────────────────────────────────────────────────────────────────────────────────────
rec("some railways were written", rails.length > 0, rails.length);
// ⚠️ MOVED WITH #a-generated-railway-is-as-good-as-the-rail-below: this said every generated railway is level 1, full stop. Generate
// land now deals each country the levels the rail below gave its land (test-a-generated-railway-is-as-good-as-the-rail-below.js);
// THIS file runs with no game below (gameRoot null), so there is no rail below to ask, and level 1 is the fallback.
rec("with nothing below, every railway is level 1 — the modal level on the corpus (467 of vanilla's 909, 1,223 of MD's 1,323) and the one a modder can only raise",
  rails.every((r) => r.level === 1) && (gen.supplyNetwork || {}).levelsFrom === "nothing below", { levels: [...new Set(rails.map((r) => r.level))], from: (gen.supplyNetwork || {}).levelsFrom });
rec("⭐ every step of every railway is a real province adjacency, as 100% of vanilla's and Rise of Nations' are",
  rails.every((r) => r.provinces.every((p, i) => i === 0 || (adj.get(r.provinces[i - 1]) || new Set()).has(p))),
  rails.filter((r) => r.provinces.some((p, i) => i > 0 && !(adj.get(r.provinces[i - 1]) || new Set()).has(p))).slice(0, 3));
rec("no railway runs over water", rails.every((r) => r.provinces.every(isLand)),
  rails.filter((r) => r.provinces.some((p) => !isLand(p))).slice(0, 3));
rec("no railway visits a province twice, and no path is written twice",
  rails.every((r) => new Set(r.provinces).size === r.provinces.length)
  && (() => { const seen = new Set(); for (const r of rails) { const k = r.provinces.join(","), kr = r.provinces.slice().reverse().join(","); if (seen.has(k) || seen.has(kr)) return false; seen.add(k); } return true; })(),
  rails.length);
rec("every railway has a supply hub at BOTH ends — a length of track going nowhere feeds nothing",
  (() => { const hp = new Set(hubs.map((h) => h.province)); return rails.every((r) => hp.has(r.provinces[0]) && hp.has(r.provinces[r.provinces.length - 1])); })(),
  rails.length);
rec("no railway is longer than the longest any shipping map has (45, Old World Blues)",
  rails.every((r) => r.provinces.length <= 45), Math.max(0, ...rails.map((r) => r.provinces.length)));

// ⭐⭐ THE ONE THAT MATTERS: is the network as connected as the geography ALLOWS? Water cannot carry track, so
// the floor is one component per landmass that holds a hub. Both sides are derived here, from the bitmap
// adjacency and the rows on disk — nothing is typed in.
{
  const landIds = model.provinces.filter((p) => p && p.type === "land").map((p) => p.id);
  const landSet = new Set(landIds);
  const massOf = new Map(); let masses = 0;
  for (const p of landIds) {
    if (massOf.has(p)) continue;
    masses++; const st = [p]; massOf.set(p, masses);
    while (st.length) { const c = st.pop(); for (const q of (adj.get(c) || [])) if (landSet.has(q) && !massOf.has(q)) { massOf.set(q, masses); st.push(q); } }
  }
  const hubMasses = new Set(hubs.map((h) => massOf.get(h.province)).filter((m) => m != null));
  const railAdj = new Map();
  for (const r of rails) for (let i = 1; i < r.provinces.length; i++) {
    const a = r.provinces[i - 1], b = r.provinces[i];
    if (!railAdj.has(a)) railAdj.set(a, new Set());
    if (!railAdj.has(b)) railAdj.set(b, new Set());
    railAdj.get(a).add(b); railAdj.get(b).add(a);
  }
  const seen = new Set(); let parts = 0;
  for (const h of hubs.map((x) => x.province)) {
    if (seen.has(h)) continue;
    parts++; const st = [h]; seen.add(h);
    while (st.length) { const c = st.pop(); for (const n of (railAdj.get(c) || [])) if (!seen.has(n)) { seen.add(n); st.push(n); } }
  }
  rec("⭐⭐ the rail network joins every hub that CAN be joined: one piece per landmass carrying a hub, and no more",
    parts === hubMasses.size, { hubComponents: parts, landmassesWithAHub: hubMasses.size, landmasses: masses });
}

// ── the user-visible outcome ─────────────────────────────────────────────────────────────────────────────
{
  const fired = new Set(validateLikeTheEndpoint(mod).map((p) => p.rule));
  rec("⭐ the two warnings the world used to end on are gone",
    !fired.has("supply_nodes_empty") && !fired.has("railways_empty"), [...fired]);
  rec("…and nothing the supply rules judge is broken by what was written",
    !fired.has("supply_node_bad_province") && !fired.has("railway_bad_province")
    && !fired.has("supply_node_on_water") && !fired.has("railway_on_water"), [...fired]);
}

console.log("\n=== 2. a second Generate land adds to the network rather than duplicating it ===");
{
  const before = { hubs: readHubs(mod).length, rails: readRails(mod).length };
  const again = md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: 120, provincesPerState: 8, seed: 11 });
  const h2 = readHubs(mod), r2 = readRails(mod);
  rec("the second run made more land", again.changed === true && again.createdStates > 0, again.error || again.createdStates);
  rec("no province carries two hub rows", new Set(h2.map((x) => x.province)).size === h2.length, { rows: h2.length, distinct: new Set(h2.map((x) => x.province)).size });
  rec("no railway path is written twice",
    (() => { const seen = new Set(); for (const r of r2) { const k = r.provinces.join(","), kr = r.provinces.slice().reverse().join(","); if (seen.has(k) || seen.has(kr)) return false; seen.add(k); } return true; })(),
    { rows: r2.length });
  rec("the states of the second run got hubs too", h2.length === before.hubs + again.createdStates, { before: before.hubs, after: h2.length, made: again.createdStates });
  rec("the first run's rows are still there, untouched", h2.length > before.hubs && r2.length >= before.rails, { before, after: { hubs: h2.length, rails: r2.length } });
}

console.log("\n=== 3. asked for a repair with no state named, it only ever touches a map whose own hub file is EMPTY ===");
{
  // A map that already places hubs: vanilla itself hubs only 47.5% of its land states, so "a state without a
  // hub" is not a defect there — writing one in would be writing over a modder's placement.
  const withRows = makeMod("hasrows", { supplyRows: "1 7 \n", railRows: "" });
  md.generateLand({ modRoot: withRows, gameRoot: null, dependencyRoots: [], count: 200, provincesPerState: 8, seed: 3 });
  const snapshot = fs.readFileSync(path.join(withRows, "map", "supply_nodes.txt"));
  const r = md.generateSupplyNetwork({ modRoot: withRows, gameRoot: null, dependencyRoots: [] });
  rec("it refuses, and says why", r.changed === false && r.hubs === 0 && r.railways === 0 && /already has rows/.test(String(r.reason || "")), r);
  rec("…and the file is byte-identical afterwards", fs.readFileSync(path.join(withRows, "map", "supply_nodes.txt")).equals(snapshot));

  const noFile = makeMod("nofile");
  fs.unlinkSync(path.join(noFile, "map", "supply_nodes.txt"));
  const r2 = md.generateSupplyNetwork({ modRoot: noFile, gameRoot: null, dependencyRoots: [] });
  rec("a mod with no supply_nodes.txt of its own is left alone — the file below it is not this mod's to overrule",
    r2.changed === false && /no map\/supply_nodes\.txt of its own/.test(String(r2.reason || "")), r2);
  rec("…and no file was created", !fs.existsSync(path.join(noFile, "map", "supply_nodes.txt")));
}

console.log("\n=== 4. the six shipping maps, which all carry both files and all launch, gain nothing ===");
{
  const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360/";
  const CORPUS = { "Millennium Dawn": WS + "2777392649", "Road to 56": WS + "820260968", "Old World Blues": WS + "2265420196", "Novum Vexillum": WS + "1827273767", "Rise of Nations": WS + "2026448968" };
  const installed = Object.entries(CORPUS).filter(([, p]) => fs.existsSync(path.join(p, "map", "supply_nodes.txt")));
  if (!fs.existsSync(path.join(VAN, "map", "supply_nodes.txt")) || !installed.length) {
    console.log("  --  SKIPPED: the installed game / workshop maps are not on this machine");
  } else {
    rec("the base game itself is refused outright", (() => {
      const r = md.generateSupplyNetwork({ modRoot: VAN, gameRoot: VAN, dependencyRoots: [], dryRun: true });
      return r.changed === false && r.hubs === 0 && r.railways === 0;
    })());
    for (const [name, root] of installed) {
      const r = md.generateSupplyNetwork({ modRoot: root, gameRoot: VAN, dependencyRoots: [], dryRun: true });
      rec(`${name} gains no hub and no railway`, r.changed === false && r.hubs === 0 && r.railways === 0, r);
    }
  }
}

console.log("\n=== 5. the page says so: two more files the modder may have edited by hand ===");
{
  // ⚠️ Substring checks only, no newline anchors — page source is CRLF in some checkouts and LF in others,
  // and a bare-\n anchor here would pass at home and fail in a worktree.
  // ⚠️ MOVED WITH #a-generated-world-has-the-layer-belows-hubs-per-state: the sentence left the handler for a pure helper,
  // generatedSupplyNote(res), because what it says now depends on whether a map underneath chose the states. The handler is
  // asked to call it, and the helper — lifted out of the page's own source — to say the rest.
  const page = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const at = page.indexOf('fetch("/api/map/generate-land"');
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const block = require("./testlib-map-page.js").generateLandReportLine(require("./testlib-map-page.js").MASKED);
  let note = "";
  try { note = require("./testlib-map-page.js").lift("function generatedSupplyNote("); } catch (e) { note = ""; }
  rec("the Generate land handler reads the network back off the response", /generatedSupplyNote\(res\)/.test(block) && /res\.supplyNetwork/.test(note), { at, note: note.length });
  rec("…and its status line names the hubs and the railways it wrote", /supply hub/.test(note) && /railway/.test(note), note.length);
  rec("…and names the controls that undo it, which the Map editor really has",
    /🏭 Supply hub/.test(note) && /🛤 Railway/.test(note), note.length);
}

console.log("\n=== 6. the two warnings describe the remedy that now exists ===");
{
  // ⚠️ A TEST CAN ENCODE THE OLD BEHAVIOUR, AND SO CAN A MESSAGE. Both rules used to close with "nothing puts
  // any back when you generate land over it again", which stopped being true above. Fire them for real — land
  // on the map, both files blanked again — and read what the modder is told.
  const m2 = makeMod("stale");
  md.generateLand({ modRoot: m2, gameRoot: null, dependencyRoots: [], count: 200, provincesPerState: 8, seed: 5 });
  fs.writeFileSync(path.join(m2, "map", "supply_nodes.txt"), "");
  fs.writeFileSync(path.join(m2, "map", "railways.txt"), "");
  const fired = validateLikeTheEndpoint(m2);
  const hub = fired.find((p) => p.rule === "supply_nodes_empty");
  const rail = fired.find((p) => p.rule === "railways_empty");
  rec("both warnings still fire on a map with land and two empty files", !!hub && !!rail, fired.map((p) => p.rule));
  for (const [name, p] of [["supply_nodes_empty", hub], ["railways_empty", rail]]) {
    if (!p) continue;
    rec(`${name} no longer claims nothing puts them back`, !/nothing puts any back/.test(p.message), p.message.slice(0, 200));
    rec(`${name} names Generate land, which now writes a network`, /Generate land/.test(p.message), p.message.slice(0, 200));
    // ⚠️ A TEST CAN ENCODE THE OLD BEHAVIOUR AND MUST MOVE WITH THE FIX. This asserted that Auto-fix always
    // declines these two, which was true until the click learned to repair a world the mod owns outright —
    // and this fixture, whose every state the mod wrote itself, is exactly that world.
    rec(`${name} offers the button here, because every state on this map is this mod's own`,
      p.autoFix === true && /Auto-fix will put them back/.test(p.message), { autoFix: p.autoFix, msg: p.message.slice(-400) });
    rec(`${name} still tells the modder where to do it by hand`,
      /To fix it,/.test(p.message) && /🏭 Supply hub/.test(p.message) && /🛤 Railway/.test(p.message), p.message.slice(-260));
  }
  // …AND THE OTHER BRANCH, which is the one that must NOT offer a button: a state from a layer below makes this
  // an add-on, where the empty file hides that layer's hubs rather than the mod having none.
  const addon = makeMod("addon", { replaceStates: false });
  md.generateLand({ modRoot: addon, gameRoot: null, dependencyRoots: [], count: 200, provincesPerState: 8, seed: 9 });
  fs.writeFileSync(path.join(addon, "map", "supply_nodes.txt"), "");
  fs.writeFileSync(path.join(addon, "map", "railways.txt"), "");
  {
    // Give it one state the mod did not write, by pointing the model's rootPath somewhere else: the cheapest
    // faithful way is a second mod root that carries a state file the first one does not.
    const below = fs.mkdtempSync(path.join(SANDBOX, "below-"));
    mk(path.join(below, "descriptor.mod"), 'name="Below"\n');
    const model2 = md.buildMapModel({ modRoot: addon, gameRoot: null, dependencyRoots: [], cacheStableLayers: false });
    const spare = (model2.provinces || []).filter((p) => p && p.type === "land" && (model2.provinceToState || {})[p.id] == null).map((p) => p.id);
    if (spare.length) {
      const id = Math.max(...model2.states.filter(Boolean).map((s) => s.id)) + 1;
      mk(path.join(below, "history", "states", `${id}-Below.txt`),
        `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${spare[0]} }\n\thistory = {}\n}\n`);
      const p2 = [
        ...md.validateMapModel(md.buildMapModel({ modRoot: addon, gameRoot: below, dependencyRoots: [], cacheStableLayers: false })),
        ...md.validateMapBitmap({ modRoot: addon, gameRoot: below, dependencyRoots: [] }),
      ];
      const h2 = p2.find((p) => p.rule === "supply_nodes_empty");
      rec("⭐⭐ with ONE state from a layer below, the same map is offered no button and told to delete the file instead",
        !!h2 && h2.autoFix === false && /Auto-fix leaves it alone/.test(h2.message) && /deleting the file is the repair/.test(h2.message),
        h2 ? { autoFix: h2.autoFix, msg: h2.message.slice(-420) } : p2.map((p) => p.rule));
      const r2 = md.generateSupplyNetwork({ modRoot: addon, gameRoot: below, dependencyRoots: [], dryRun: true });
      rec("…and the repair itself refuses that map, so the rule and the fixer agree",
        r2.changed === false && r2.hubs === 0 && /come from a layer below/.test(String(r2.reason || "")), r2);
    } else {
      console.log("  --  SKIPPED: the fixture left no stateless land to hand the layer below");
      fail++; // a skip is not a pass: the branch above must really be exercised
    }
  }
}

console.log("\n=== 7. the same seed writes the same network, cold cache or warm ===");
{
  // ⚠️ CACHE WARMTH CAN CHANGE AN ANSWER — buildMapModel writes fields onto the object its cached layer holds,
  // so a second call in the same process is not the same call. The first build below is COLD for its fixture
  // and the second is WARM, and the two must be byte-identical.
  const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const build = (tag) => {
    const m = makeMod(tag);
    md.generateLand({ modRoot: m, gameRoot: null, dependencyRoots: [], count: 300, provincesPerState: 8, seed: 21 });
    return { supply: sha(path.join(m, "map", "supply_nodes.txt")), rail: sha(path.join(m, "map", "railways.txt")),
      rows: readHubs(m).length, rails: readRails(m).length };
  };
  const cold = build("cold"), warm = build("warm");
  rec("it wrote something to compare", cold.rows > 0 && cold.rails > 0, cold);
  rec("⭐ the hub file is byte-identical on a second run with the same seed", cold.supply === warm.supply, { cold: cold.rows, warm: warm.rows });
  rec("⭐ so is the railway file — the network does not move when the model cache is warm", cold.rail === warm.rail, { cold: cold.rails, warm: warm.rails });
}

console.log("\n=== 8. ONE REAL AUTO-FIX CLICK on a world already built without a network ===");
{
  // The retrofit. A world made before Generate land knew to write a network — or one whose files were blanked
  // afterwards — has hundreds of states and no practical way to hub them by hand. This is the click, run for
  // real: not the rule's claim about the click, the click.
  const old = makeMod("retro");
  const g = md.generateLand({ modRoot: old, gameRoot: null, dependencyRoots: [], count: 250, provincesPerState: 8, seed: 13 });
  fs.writeFileSync(path.join(old, "map", "supply_nodes.txt"), "");
  fs.writeFileSync(path.join(old, "map", "railways.txt"), "");
  const before = new Set(validateLikeTheEndpoint(old).map((p) => p.rule));
  rec("THE CONTROL: the world reports both warnings before the click",
    before.has("supply_nodes_empty") && before.has("railways_empty"), [...before]);

  const r = md.autoFixMap({ modRoot: old, gameRoot: null, dependencyRoots: [] });
  rec("the click ran and reports what the network pass did",
    !!r && r.ok === true && !!r.fixes && !!r.fixes.supplyNetwork, r && r.fixes && r.fixes.supplyNetwork);
  const sn = (r && r.fixes && r.fixes.supplyNetwork) || {};
  rec("⭐⭐ it placed a hub in every state the world has, and railways joining them",
    sn.changed === true && sn.hubs > 0 && sn.railways > 0, { made: g.createdStates, ...sn });

  const hubs8 = readHubs(old), rails8 = readRails(old);
  rec("every row it wrote is level 1 and on land",
    hubs8.length > 0 && hubs8.every((h) => h.level === 1) && rails8.every((x) => x.level === 1), { hubs: hubs8.length, rails: rails8.length });
  const after = new Set(validateLikeTheEndpoint(old).map((p) => p.rule));
  rec("⭐⭐⭐ and BOTH warnings are gone from the very next check",
    !after.has("supply_nodes_empty") && !after.has("railways_empty"), [...after]);
  rec("…without the click breaking anything the supply rules judge",
    !after.has("supply_node_bad_province") && !after.has("railway_bad_province"), [...after]);

  // A SECOND click must be a no-op for this pass: the file now has rows, so the gate closes again.
  const r2 = md.autoFixMap({ modRoot: old, gameRoot: null, dependencyRoots: [] });
  const sn2 = (r2 && r2.fixes && r2.fixes.supplyNetwork) || {};
  rec("⭐ a second click adds nothing — the gate is the file having no rows, and now it has",
    sn2.changed !== true && sn2.hubs === 0 && /already has rows/.test(String(sn2.reason || "")), sn2);
  rec("…and the rows from the first click are still exactly there",
    readHubs(old).length === hubs8.length && readRails(old).length === rails8.length,
    { hubs: readHubs(old).length, was: hubs8.length, rails: readRails(old).length, wasRails: rails8.length });
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
assert.strictEqual(fail, 0, `${fail} assertion(s) failed`);
