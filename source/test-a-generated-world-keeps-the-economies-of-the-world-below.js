// ⛔ #a-generated-country-keeps-its-economy — OVER THE INSTALLED BASE GAME, THROUGH THE ENDPOINT THE PAGE POSTS: each country of a
// generated world holds the people and resources it held in 1936, and its factories as far as its new land has slots for them.
//
// TEST 33 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit) started with factories 311/82/45 of the base
// game's 804/317/151, 532 M people of 2,075 M and 2,262 resources of 10,187: a state carried only what the land under it held. The
// owner's decision (question 7): each country keeps its 1936 economy. The endpoint forwards no `economy`, so the button gets the
// default — which is what this test asks, by posting exactly the page's body (public/map.js, the Generate land confirm button) on
// the owner's shape: the base game's provinces.bmp copied in and replace_path="history/states", as Delete map's dialog instructs.
// Every expected number is derived from the base game's own history/states and common/ with this test's own reader:
//   · Σ manpower and Σ each resource over each country's new states is what it held in the base game, exactly;
//   · no country holds more of a slot-sharing building than it held; per country and key it holds all of it — its budget × slots
//     ÷ need when short of slots, its mix — and a level less only where no state of its could take one more;
//   · no state over its slots or a key's state_max, no dockyard off the coast;
//   · every capital is the most important state of its piece of its country's land on disk, and the report names exactly the
//     countries whose most important state stands on another piece; the largest state's people are printed.
//
// SKIPS without the game. Binds a port of its own (listen(0)), never a fixed one.
// Run: node test-a-generated-world-keeps-the-economies-of-the-world-below.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "hoi4.exe")) || !fs.existsSync(path.join(GAME, "history", "states")) || !fs.existsSync(path.join(GAME, "common", "buildings"))) {
  console.log("SKIP: no Hearts of Iron IV install at " + GAME);
  process.exit(0);
}
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gen-economies-"));
// BEFORE server.js loads: app data, ~/.nova and the mods root are this test's own; the game is read, never written
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const L2 = require("./testlib-two-layer-map.js");   // startServer(): the app on a port of its own
const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!cond) fails.push(label);
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const strip = (s) => s.replace(/^\uFEFF/, "").replace(/#[^\n]*/g, "");

// ── this test's own readers ────────────────────────────────────────────────────────────────────────────────────────────────
function blocks(body) {   // top-level `name = { … }` of a comment-free body (a dated `1939.1.1 = {` comes back keyed by its last digits)
  const out = [];
  const re = /([A-Za-z0-9_]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    let d = 0;
    const open = body.indexOf("{", m.index);
    for (let k = open; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (!d) { out.push({ key: m[1], body: body.slice(open + 1, k), at: m.index }); re.lastIndex = k + 1; break; } } }
  }
  return out;
}
const flatOf = (b) => { let d = 0, s = ""; for (const c of b) { if (c === "{") d++; s += d ? " " : c; if (c === "}") d--; } return s; };
const numsOf = (body) => { const o = {}; for (const m of flatOf(body).matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) o[m[1]] = +m[2]; return o; };
function buildingRulesOf(root) {
  const out = new Map();
  const dir = path.join(root, "common", "buildings");
  for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x)).sort()) {
    const top = blocks(strip(fs.readFileSync(path.join(dir, f), "utf8"))), wrapped = top.filter((t) => t.key === "buildings");
    for (const b of (wrapped.length ? wrapped.flatMap((t) => blocks(t.body)) : top)) {
      const cap = flatOf((blocks(b.body).find((x) => x.key === "level_cap") || {}).body || ""), own = flatOf(b.body);
      // `show`/`row`: a building with models stands on the map/buildings.txt row of its spawn_point, else its own name
      out.set(b.key, { shares: /shares_slots\s*=\s*yes/.test(cap), stateMax: +((cap.match(/state_max\s*=\s*(\d+)/) || [])[1] || Infinity),
        coast: /(only_costal|is_port)\s*=\s*yes/.test(own), provincial: /province_max\s*=/.test(cap),
        show: +((own.match(/show_on_map\s*=\s*(\d+)/) || [])[1] || 0), row: (own.match(/spawn_point\s*=\s*([A-Za-z0-9_]+)/) || [])[1] || b.key });
    }
  }
  return out;
}
function slotsOf(root) {   // category → local_building_slots
  const out = {};
  const dir = path.join(root, "common", "state_category");
  for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x))) {
    for (const top of blocks(strip(fs.readFileSync(path.join(dir, f), "utf8")))) for (const c of blocks(top.body)) {
      const n = /local_building_slots\s*=\s*(\d+)/.exec(flatOf(c.body));
      if (n) out[c.key] = +n[1];
    }
  }
  return out;
}
// a state: its owner, people, resources and category, and the buildings of its UNDATED block — none when its first buildings
// block is dated, which says nothing of the 1936 start
function statesOf(dir) {
  return fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x)).map((f) => {
    const t = strip(fs.readFileSync(path.join(dir, f), "utf8"));
    const st = (blocks(t).find((b) => b.key === "state") || {}).body || "";
    const top = flatOf(st), hist = (blocks(st).find((b) => b.key === "history") || {}).body || "";
    const inHist = blocks(hist), undated = inHist.find((b) => b.key === "buildings"), dated = inHist.filter((b) => /^\d+$/.test(b.key));
    const datedFirst = dated.some((d) => /\bbuildings\s*=\s*\{/.test(d.body) && (!undated || d.at < undated.at));
    const vps = [...hist.matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+(\d+)\s*\}/g)].map((m) => +m[2]);
    return { file: f, id: +(/\bid\s*=\s*(\d+)/.exec(top) || [])[1], owner: (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(flatOf(hist)) || [])[1] || "",
      manpower: +(/\bmanpower\s*=\s*(\d+)/.exec(top) || [])[1] || 0, category: (/\bstate_category\s*=\s*(\w+)/.exec(top) || [])[1] || "",
      provinces: (((blocks(st).find((b) => b.key === "provinces") || {}).body || "").match(/\d+/g) || []).map(Number),
      resources: numsOf((blocks(st).find((b) => b.key === "resources") || {}).body || ""),
      buildings: undated && !datedFirst ? numsOf(undated.body) : {}, vps };
  });
}
function coastOf(mod) {   // land with a 4-neighbour of sea, x wrapping (the map is a cylinder)
  const buf = fs.readFileSync(path.join(mod, "map", "provinces.bmp")), off = buf.readUInt32LE(10), W = buf.readInt32LE(18), H = buf.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
  const byColour = new Map(), type = new Map();
  for (const l of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;
    byColour.set((+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]);
    type.set(+c[0], c[4].trim());
  }
  const idAt = (x, y) => { const o = off + (H - 1 - y) * rs + x * 3; return byColour.get((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]); };
  const out = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = idAt(x, y);
    if (type.get(a) !== "land") continue;
    for (const [qx, qy] of [[(x + 1) % W, y], [(x - 1 + W) % W, y], [x, y - 1], [x, y + 1]]) if (qy >= 0 && qy < H && type.get(idAt(qx, qy)) === "sea") { out.add(a); break; }
  }
  return out;
}
const capitalsOf = (root) => {
  const out = {}, dir = path.join(root, "history", "countries");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) { const m = /^\s*capital\s*=\s*(\d+)/m.exec(strip(fs.readFileSync(path.join(dir, f), "utf8"))); if (m) out[f.slice(0, 3).toUpperCase()] = +m[1]; }
  return out;
};

(async () => {
  let srv = null;
  try {
    const RULES = buildingRulesOf(GAME), SLOTS = slotsOf(GAME);
    const SHARED = [...RULES].filter(([, r]) => r.shares).map(([k]) => k);
    const below = statesOf(path.join(GAME, "history", "states")).filter((s) => s.provinces.length);
    // what each country held in the base game: its budget
    const budget = new Map();
    for (const s of below) {
      if (!budget.has(s.owner)) budget.set(s.owner, { mp: 0, res: {}, bld: {} });
      const b = budget.get(s.owner);
      b.mp += s.manpower;
      for (const [k, v] of Object.entries(s.resources)) b.res[k] = (b.res[k] || 0) + v;
      for (const [k, v] of Object.entries(s.buildings)) if (SHARED.includes(k)) b.bld[k] = (b.bld[k] || 0) + v;
    }
    rec("CONTROL: every state of the base game has an owner, so every person below is in some country's budget", below.every((s) => s.owner), below.filter((s) => !s.owner).map((s) => s.id));

    // ── the owner's shape: the base game's shapes copied in, the states replaced, the map blanked ─────────────────────────
    const mod = path.join(process.env.HOI4_MODS_ROOT, "economies");
    fs.mkdirSync(path.join(mod, "map"), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1"\nname="economies"\nsupported_version="1.*"\nreplace_path="history/states"\npath="mod/economies"\n');
    fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
    md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    srv = await L2.startServer(createApp);
    // ⭐ exactly the page's body (no `economy`, no `manpower`), so what is tested is the button's default
    const t0 = Date.now();
    const res = await srv.post("/api/map/generate-land", { count: 400, seed: 3, ownerMode: "inherit", owner: "", replacesExistingWorld: true }, mod);
    console.log(`   (generated in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    const body = res.body || {}, eco = body.economy || {};
    const made = new Set((body.newStates || []).map((s) => +s.id));
    rec("the world was generated through the endpoint", res.status === 200 && body.ok === true && made.size >= 20, { status: res.status, error: body.error, made: made.size });
    rec("⭐ the button's default keeps each country's economy, and nothing failed", eco.mode === "country" && !eco.error, eco);
    const states = statesOf(path.join(mod, "history", "states")).filter((s) => made.has(s.id));
    const owners = [...new Set(states.map((s) => s.owner).filter(Boolean))].sort();
    const mine = (t) => states.filter((s) => s.owner === t);
    rec("the fixture: the new land is shared among many countries", owners.length >= 10, owners.length);

    // CONTROL: by the land's own carry the world would hold far fewer people than the countries that own it held
    const belowOf = new Map(); for (const s of below) for (const p of s.provinces) belowOf.set(p, s);
    const carried = sum(states.map((s) => { const k = s.provinces.filter((p) => belowOf.has(p)); return k.length ? sum(k.map((p) => Math.floor(belowOf.get(p).manpower / belowOf.get(p).provinces.length))) : 10000; }));
    const owed = sum(owners.map((t) => (budget.get(t) || { mp: 0 }).mp));
    rec("CONTROL: the land's own carry is short of what the owning countries held, so the two rules differ", carried < owed, { carried, owed });

    // 1-2. people and resources, per country, exactly
    const mpOff = owners.filter((t) => sum(mine(t).map((s) => s.manpower)) !== (budget.get(t) || { mp: 0 }).mp);
    rec(`⭐⭐ each of the ${owners.length} countries holds exactly the people it held in the base game`, mpOff.length === 0,
      mpOff.slice(0, 6).map((t) => `${t} ${sum(mine(t).map((s) => s.manpower))}/${(budget.get(t) || {}).mp}`));
    rec(`⭐ …so the world holds ${owed.toLocaleString()} people, theirs`, sum(states.map((s) => s.manpower)) === owed, sum(states.map((s) => s.manpower)));
    const resKeys = [...new Set(below.flatMap((s) => Object.keys(s.resources)))].sort();
    const resOff = owners.flatMap((t) => resKeys.filter((k) => sum(mine(t).map((s) => s.resources[k] || 0)) !== ((budget.get(t) || { res: {} }).res[k] || 0)).map((k) => `${t}.${k}`));
    rec(`⭐⭐ …and exactly the ${resKeys.join(", ")} it held`, resKeys.length > 0 && resOff.length === 0, resOff.slice(0, 8));
    const notOwning = [...budget.keys()].filter((t) => !owners.includes(t)).sort();
    rec("…and a country with no new state is said, never handed to another", JSON.stringify(notOwning) === JSON.stringify((eco.unplaced || []).map((u) => u.tag).sort()), { notOwning, unplaced: (eco.unplaced || []).map((u) => u.tag) });

    // 3. slot-sharing buildings: never above what a country held; at least what its slots allow
    const over = owners.flatMap((t) => SHARED.filter((k) => sum(mine(t).map((s) => s.buildings[k] || 0)) > Math.round(((budget.get(t) || { bld: {} }).bld[k] || 0) + 1e-9)).map((k) => `${t}.${k}`));
    rec("⭐ no country holds more of a slot-sharing building than it held in the base game", over.length === 0, over.slice(0, 8));
    // Per country and key (the review's IR-2: a floor summed over the world, less every drop and half a level a country and key, let
    // a fifth of every country's factories vanish and stayed green). The keys a new state is given (no models, or models on a row
    // Nova's own templates give a state, read off the source); a country short of slots for them keeps its budget × slots ÷ need,
    // the rest all of it — and a level less only where no state of its could take one more: full, at the key's state_max, or off
    // the coast for a coast-only key.
    const coast = coastOf(mod), onCoast = (s) => s.provinces.some((p) => coast.has(p));
    const ROW_TYPES = new Set([...(md.STATE_BUILDING_SLOTS || []), ...(md.COASTAL_STATE_BUILDING_SLOTS || [])].map(([t]) => t));
    const DEALT = SHARED.filter((k) => !RULES.get(k).provincial && (!RULES.get(k).show || ROW_TYPES.has(RULES.get(k).row)));
    const used = (s) => sum(SHARED.map((k) => s.buildings[k] || 0));
    const canTake = (t, k) => mine(t).some((s) => used(s) < (SLOTS[s.category] != null ? SLOTS[s.category] : Infinity) && (s.buildings[k] || 0) < RULES.get(k).stateMax && (!RULES.get(k).coast || onCoast(s)));
    const shortfall = [];
    let scaledCountries = 0, fullCountries = 0;
    for (const t of owners) {
      const b = (budget.get(t) || { bld: {} }).bld, coastal = mine(t).some(onCoast);
      const need = sum(DEALT.filter((k) => !RULES.get(k).coast || coastal).map((k) => b[k] || 0)), slots = sum(mine(t).map((s) => SLOTS[s.category] || 0));
      const f = need > slots ? slots / need : 1;
      if (f < 1) scaledCountries++; else if (need > 0) fullCountries++;
      for (const k of DEALT) {
        const want = Math.round((b[k] || 0) * f + 1e-9), have = sum(mine(t).map((s) => s.buildings[k] || 0));
        if (have < want && canTake(t, k)) shortfall.push(`${t}.${k} ${have}/${want}${f < 1 ? ` (short: ${slots} slots for ${need})` : ""}`);
      }
    }
    rec(`CONTROL: the world has countries that hold all their factories (${fullCountries}) and countries short of slots (${scaledCountries})`, fullCountries > 0 && scaledCountries > 0);
    rec(`⭐⭐ every country holds its slot-sharing budget (${DEALT.join(", ")}), its mix scaled to its slots when short of them — a level less only where no state of its could take one more`,
      DEALT.length > 0 && shortfall.length === 0, shortfall.slice(0, 8));
    const written = sum(states.map((s) => sum(SHARED.map((k) => s.buildings[k] || 0))));
    rec("…and the report's count of them is what is on disk", (eco.shared || {}).written === written, eco.shared);

    // 4-5. slots, state_max, the coast
    const full = states.filter((s) => sum(SHARED.map((k) => s.buildings[k] || 0)) > (SLOTS[s.category] != null ? SLOTS[s.category] : Infinity)
      || Object.entries(s.buildings).some(([k, v]) => RULES.has(k) && v > RULES.get(k).stateMax));
    rec("no state over its slots or a key's state_max", full.length === 0, full.slice(0, 5).map((s) => [s.id, s.category, s.buildings]));
    const yards = states.filter((s) => Object.keys(s.buildings).some((k) => RULES.has(k) && RULES.get(k).coast && RULES.get(k).shares && s.buildings[k] > 0));
    rec(`no dockyard on a state off the coast (${yards.length} states hold one)`, yards.length > 0 && yards.every((s) => s.provinces.some((p) => coast.has(p))), yards.filter((s) => !s.provinces.some((p) => coast.has(p))).map((s) => s.id).slice(0, 8));

    // 6. capitals: the mod's own line where it wrote one, else the base game's. ⛔ #a-capital-stands-where-its-country-can-reach — a
    // capital stands on the piece of its country's land that reaches its army, so it is the most important state OF THAT PIECE, by the
    // people written; a country whose most important state stands on another piece is the report's and the page's to name
    // (countries.capitals.notMostImportant), exactly those. Over the whole country this held here only because this world has no such
    // country; the owner's flow has two, CAN and CHL (review of the four-chain merge, F2). The pieces as Generate land joins them: the
    // written world's province graph, land to land, an impassable row closing a link.
    const caps = Object.assign(capitalsOf(GAME), capitalsOf(mod));
    const row = (s) => ({ id: s.id, vp: s.vps.length ? Math.max(...s.vps) : 0, vpSum: sum(s.vps), manpower: s.manpower });
    const onOwn = owners.filter((t) => mine(t).some((s) => s.id === caps[t]));
    const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const graph = md.provinceNeighbourGraph({ model, modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const kind = new Map((model.provinces || []).map((p) => [+p.id, p.type]));
    const pair = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const shut = new Set((model.adjacencies || []).filter((a) => a && a.from > 0 && a.to > 0 && String(a.type || "").trim().toLowerCase() === "impassable").map((a) => pair(a.from, a.to)));
    const pieces = md.ownLandPieces({ groups: states, ownerOf: (s) => s.owner, links: (p) => [...((graph && graph.get(p)) || [])].filter((q) => kind.get(+q) === "land" && !shut.has(pair(p, q))) });
    const pieceOf = (t) => ((pieces.get(t) || []).find((pc) => pc.groups.some((s) => s.id === caps[t])) || { groups: [] }).groups;
    const notMost = onOwn.filter((t) => md.mostImportantState(pieceOf(t).map(row)) !== caps[t]);
    rec(`⭐⭐ every capital is the most important state of its piece on disk, by the people written (${onOwn.length} capitals on their own land)`,
      onOwn.length > 0 && !!graph && notMost.length === 0, notMost.map((t) => [t, caps[t], pieceOf(t).map((s) => [s.id, Math.max(0, ...s.vps), s.manpower])]).slice(0, 4));
    const elsewhere = onOwn.map((t) => ({ tag: t, capital: caps[t], best: md.mostImportantState(mine(t).map(row)) })).filter((x) => x.best !== x.capital);
    const said = ((body.countries || {}).capitals || {}).notMostImportant;
    rec(`⭐ …and the report names exactly the countries whose most important state stands on another piece (${elsewhere.length} here), with both states`,
      JSON.stringify(said) === JSON.stringify(elsewhere) && elsewhere.every((x) => !pieceOf(x.tag).some((s) => s.id === x.best)), { said, elsewhere });
    const big = states.slice().sort((a, b) => b.manpower - a.manpower)[0] || {};
    console.log(`   the largest state: ${big.id} (${big.owner}, ${big.category}) with ${(big.manpower || 0).toLocaleString()} people; ${(eco.short || []).length} countries short of slots`);
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 600));
  } finally {
    if (srv) srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // scratch only — never a mod directory (⛔ CLAUDE.md #1)
  }
  console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
  if (fails.length) { for (const f of fails) console.log("  - " + f); }
  process.exit(fails.length ? 1 : 0);
})();
