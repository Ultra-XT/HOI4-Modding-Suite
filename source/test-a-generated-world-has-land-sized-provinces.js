// ⛔ #a-raised-province-is-cut-to-land-size — A GENERATED WORLD HAS LAND-SIZED PROVINCES, AND THE CUT CHANGES NOTHING ELSE.
//
// Generate land raised ocean provinces whole: TEST 31's land had a median of 566 px against the base game's 160, and 1,842
// provinces over 1,000 px. Now the click cuts each raised province to the size of the land below (layerBelowLandMeanArea) inside
// the border budget, in ONE provinces.bmp write with the coast, and carries the regions, the adjacencies and a record of the
// families. Pinned on testlib-split-world.js's world — 64 px ocean cells beside 16 px land bricks — through the endpoint the page
// posts (its own body: count, seed, ownerMode, owner, replacesExistingWorld), against twins made with splitLargeProvinces: false.
// The mod is Hearts-of-Minecraft-shaped: its definition.csv ends 4 ids BELOW the one underneath it, and the first of those 4
// carries the colour the cut would take first if it asked only the mod (derived from the exported allocator); like Hearts of
// Minecraft it ships its own strategic regions, so none that loads names an id it lacks — and the states BELOW still name those
// ids, which a piece taking one must not inherit.
//   1. the cut happened, and the report says what it cut, the target (the layer below's own land mean) and the border budget;
//   2. ids 0..max with no gap, the new ones from the MOD's last id + 1; colours unique, none black, none any layer's row names;
//   3. every pixel is a defined colour, every row has pixels, no X-crossing; the largest raised province is the report's;
//   4. each piece is in its parent's region and its parent's state (the record names the families), and no state spans two regions;
//   5. the land/sea side of every pixel and flippedProvinces are the uncut twin's; and the terrain lies in patches on the map AS CUT:
//      the pieces share their neighbours' terrain as the uncut twin's provinces do, not as chance would (terrainOfGeneratedLand walks
//      `neighboursAfter` — backed out to the graph before the cut, 6,320 of the owner's flow's 11,495 land rows changed terrain);
//   6. the STRICT twin (the keep pass's army land and its keep-every-country pass off in both): every state's id, owner, category,
//      people, victory point values, resources and buildings are the uncut twin's — the state layer is cut over the parents;
//   7. the DEFAULTS twin, on a world where the army top-up acts (BBB's army needs more land than it holds; 70% raised): the uncut twin
//      hands BBB states and still leaves it short; the cut one DEALS THE LAND AS RAISED — the parents, as the owner passes do — so it
//      hands the same countries the same states (by their parents), every state keeps the uncut twin's owner, and every country places
//      the uncut twin's factory levels; what it SAYS is the map as written: each state handed over with its pieces counted, and a
//      country short as dealt said short only if it is short as written too. Counted in pieces, the merged owner's flow handed the
//      armies 22 states against 56 and the land not handed over took its building slots with it: 645/235/122 against 677/255/133,
//      Japan 6/4/3 on 4 states against 12/7/7 on 11 (merge review MR-2). And every country that places fewer factory levels than it had below is
//      NAMED for it, having placed the room it is named with — said, never silent;
//   8. after Auto-fix, Map Errors reports none of the rules a bad cut makes (no region, no state, X, no pixels, gap, duplicate
//      colour, undefined colour, fractioned naval region), and no rule the uncut twin does not;
//   9. planGeneratedProvinceSplit + writeGeneratedProvinceSplit, called directly: provinces.bmp decodes to exactly the in-memory cut;
//  10. the page says what was cut (generatedProvinceSplitNote, lifted out of public/map.js) and the status line carries it.
// Binds a port of its own (listen(0)), never a fixed one.
// Run: node test-a-generated-world-has-land-sized-provinces.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-world-"));
// BEFORE map-data.js / server.js load: app data, ~/.nova (the split record lives there), the mods root and the game are this test's
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
process.env.HOI4_ROOT = path.join(ROOT, "game");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const L2 = require("./testlib-two-layer-map.js");   // startServer(): the app on a port of its own
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!cond) fails.push(label);
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const SEED = 1;
// the colour the cut takes first when it asks the mod's rows alone — planted on a province only the layer below has
const PLAIN = SW.makeShapes({ extras: 4 });
const modColours = []; for (let id = 1; id <= PLAIN.N; id++) modColours.push(PLAIN.colourOf(id));
const C1 = md.allocateProvinceColours({ count: 1, seed: SEED, used: new Set([0, ...modColours]) })[0];
const S = SW.makeShapes({ extras: 4, plantColour: C1 });
// every ocean cell's Standstill at its middle: the piece that keeps a cut cell's id is an inland one, bordering only its own family —
// so a state layer asked over the map AS CUT would find the parents cut off from one another, and the strict twin can tell
const middles = new Map();
{
  const acc = new Map();
  for (let i = 0; i < S.modIds.length; i++) { const p = S.modIds[i]; if (S.typeOf(p) !== "sea") continue; const a = acc.get(p) || acc.set(p, { x: 0, y: 0, n: 0, px: [] }).get(p); a.x += i % SW.W; a.y += Math.floor(i / SW.W); a.n++; a.px.push(i); }
  for (const [p, a] of acc) {
    const cx = a.x / a.n, cy = a.y / a.n;
    const i = a.px.reduce((b, j) => ((j % SW.W - cx) ** 2 + (Math.floor(j / SW.W) - cy) ** 2 < (b % SW.W - cx) ** 2 + (Math.floor(b / SW.W) - cy) ** 2 ? j : b), a.px[0]);
    middles.set(p, [i % SW.W + 0.5, SW.H - 1 - Math.floor(i / SW.W) + 0.5]);
  }
}
// …with a terrain table and land of every terrain below, so the terrain the click chooses can lie in patches (#5b)
const GAME = SW.makeGame(process.env.HOI4_ROOT, S, { unitstacks: middles, terrain: true });
const game = GAME.root;
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));   // the page's 35% of the sea, and every row of Delete map's mod is sea
const mod = (name) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, { name, ownRegions: true });
const BASE = { gameRoot: game, dependencyRoots: [], count: COUNT, seed: SEED, ownerMode: "inherit", owner: "" };
const gen = (m, extra) => md.generateLand(Object.assign({ modRoot: m }, BASE, extra || {}));
const rulesIn = (v) => [...new Set(((v && v.problems) || []).map((p) => p.rule))].sort();
const countOf = (v, rule) => ((v && v.problems) || []).filter((p) => p.rule === rule).reduce((a, p) => a + (p.total || 1), 0);

(async () => {
  let srv = null;
  try {
    console.log("\n-- the fixture --");
    const below = SW.readDef(path.join(game, "map", "definition.csv"));
    const belowLandPx = [...SW.areas(S.gameIds)].filter(([id]) => below.rows.get(id) && below.rows.get(id).type === "land").map(([, a]) => a);
    const T0 = sum(belowLandPx) / belowLandPx.length;
    rec(`the layer below is ${S.N + S.extras.length} provinces, its land ${belowLandPx.length} averaging ${T0.toFixed(1)} px, its ocean cells 4,096 px; no X-crossing in either map`,
      SW.xCrossings(S.modIds, SW.W, SW.H) === 0 && SW.xCrossings(S.gameIds, SW.W, SW.H) === 0 && T0 < 400);
    rec("(the planted colour is the allocator's first pick over the mod's rows, and no row of the mod names it)", !modColours.includes(C1) && C1 !== 0 && below.rows.get(S.extras[0]).colour === C1, C1);
    rec("(the mod ends below the layer underneath it: Hearts of Minecraft's shape)", Math.max(...below.ids) === S.N + S.extras.length && S.extras.length === 4, below.ids.length);

    srv = await L2.startServer(createApp);
    const R1 = mod("r1"), R2 = mod("r2");
    // ⭐ exactly the page's body (public/map.js, the Generate land confirm button), so what is tested is the button
    const res = await srv.post("/api/map/generate-land", { count: COUNT, seed: SEED, ownerMode: "inherit", owner: "", replacesExistingWorld: true }, R1);
    const r1 = res.body || {}, r2 = gen(R2, { splitLargeProvinces: false });
    const sp = r1.provinceSplit || {};
    console.log("\n-- 1. the cut, and its report --");
    rec("the world was generated through the endpoint, and its uncut twin directly", res.status === 200 && r1.ok === true && r2.changed === true, { status: res.status, error: r1.error, r2: r2.error });
    rec("⭐ the cut happened: raised provinces were cut, new ids made, regions and the record written", sp.changed === true && sp.split > 0 && sp.newIds > 0 && sp.regions > 0 && !sp.error,
      Object.assign({}, sp, { target: undefined }));
    rec("the uncut twin says it was turned off", r2.provinceSplit && r2.provinceSplit.changed === false && r2.provinceSplit.why === "turnedOff", r2.provinceSplit);
    const t = sp.target || {};
    rec(`the target is the layer below's own land mean (${T0.toFixed(1)} px), inside the border budget (${t.segmentsAfter} of ${t.limit} segments after)`,
      Math.abs(t.T0 - Math.round(T0 * 10) / 10) < 1e-9 && t.limit === 62000 && t.segmentsAfter > t.segmentsBefore && t.segmentsAfter <= t.limit && t.binds === false, t);

    console.log("\n-- 2. ids and colours --");
    const def1 = SW.readDef(path.join(R1, "map", "definition.csv"));
    const max1 = def1.ids[def1.ids.length - 1];
    rec("⭐⭐ ids run 0..max with no gap", def1.ids.length === max1 + 1 && def1.ids.every((id, i) => id === i), { n: def1.ids.length, max: max1 });
    const newIds = def1.ids.filter((id) => id > S.N);
    rec(`⭐⭐ the new ids run from the MOD's last id + 1 (${S.N + 1}), not the layer below's (${S.N + S.extras.length + 1})`, newIds.length === sp.newIds && newIds[0] === S.N + 1 && max1 === S.N + sp.newIds, { first: newIds[0], max: max1, newIds: sp.newIds });
    const colours = def1.ids.filter((id) => id > 0).map((id) => def1.rows.get(id).colour);
    rec("colours are unique and none is black", new Set(colours).size === colours.length && !colours.includes(0));
    const belowColours = new Set(below.ids.map((id) => below.rows.get(id).colour));
    const taken = newIds.filter((id) => belowColours.has(def1.rows.get(id).colour));
    rec("⭐ no new province takes a colour any layer's definition.csv names — the planted one included", taken.length === 0 && !newIds.some((id) => def1.rows.get(id).colour === C1), taken.slice(0, 6));
    rec("each new row is its parent's sea row with its own id and colour (the rewrite turned the family to land together)", newIds.every((id) => def1.rows.get(id).type === "land"));

    console.log("\n-- 3. the bitmap --");
    const dec1 = SW.decode(path.join(R1, "map", "provinces.bmp"), def1);
    const area1 = SW.areas(dec1.ids);
    rec("every pixel's colour is a row's, and every row but 0 has pixels", !area1.has(-1) && def1.ids.filter((id) => id > 0).every((id) => area1.get(id) > 0), { undefinedPx: area1.get(-1) || 0, noPixels: def1.ids.filter((id) => id > 0 && !area1.get(id)).slice(0, 6) });
    rec("⭐ no X-crossing, the seam wrapped", SW.xCrossings(dec1.ids, SW.W, SW.H) === 0, SW.xCrossings(dec1.ids, SW.W, SW.H));
    const land1 = def1.ids.filter((id) => id > 0 && def1.rows.get(id).type === "land");   // row 0 reads land in every definition.csv
    const largest = Math.max(...land1.map((id) => area1.get(id) || 0));
    rec(`⭐ the largest land province is the report's (${largest} px) — no raised province is left anywhere near an ocean cell's 4,096 px`, sp.largestLandPx === largest && largest < 4096 / 4 && sp.largestLandPxBefore === 4096 && sp.over1000 === land1.filter((id) => area1.get(id) > 1000).length,
      { largest, report: sp.largestLandPx, before: sp.largestLandPxBefore, over1000: sp.over1000 });

    console.log("\n-- 4. families, regions, states --");
    const record = md.readProvinceSplitRecord(R1);
    const parentOf = new Map();
    for (const f of record.families || []) for (const q of f.pieces) parentOf.set(q, f.parent);
    rec("⭐ the record names every new id under its parent, once, and the mod's last id before the cut", !record.unreadable && record.definitionMaxBefore === S.N && newIds.every((q) => parentOf.has(q)) && parentOf.size === newIds.length && (record.families || []).length === sp.split,
      { families: (record.families || []).length, pieces: parentOf.size, max: record.definitionMaxBefore });
    // the control the STRICT twin below needs: on the map as cut, a cut cell's own id is an inland piece bordering its family alone
    {
      const fam1 = new Map();
      for (const f of record.families || []) fam1.set(f.parent, new Set([f.parent, ...f.pieces]));
      const borders = new Map(), add = (a, b) => (borders.get(a) || borders.set(a, new Set()).get(a)).add(b);
      for (let y = 0; y < SW.H; y++) for (let x = 0; x < SW.W; x++) {
        const a = dec1.ids[y * SW.W + x];
        for (const b of [dec1.ids[y * SW.W + (x + 1) % SW.W], y + 1 < SW.H ? dec1.ids[(y + 1) * SW.W + x] : a]) if (a !== b) { add(a, b); add(b, a); }
      }
      const inland = [...fam1.keys()].filter((p) => [...(borders.get(p) || [])].every((q) => fam1.get(p).has(q)));
      rec("(…and a cut ocean cell keeps its id on an inland piece, bordering its own family alone: the map as cut does not join it to its neighbours)", inland.length > 0, { inland: inland.length, cut: fam1.size });
    }
    const reg1 = SW.regionsOf(R1, game);
    const badRegion = newIds.filter((q) => !same(reg1.get(q), reg1.get(parentOf.get(q))) || (reg1.get(q) || []).length !== 1);
    rec("⭐⭐ each piece is in its parent's strategic region, and in one", newIds.length > 0 && badRegion.length === 0, badRegion.slice(0, 6).map((q) => [q, reg1.get(q), parentOf.get(q), reg1.get(parentOf.get(q))]));
    const st1 = SW.readStates(R1), stateOf = new Map();
    for (const s of st1) for (const p of s.provinces) stateOf.set(p, (stateOf.get(p) || []).concat(s.id));
    const badState = newIds.filter((q) => !same(stateOf.get(q), stateOf.get(parentOf.get(q))) || (stateOf.get(q) || []).length !== 1);
    rec("⭐⭐ …and in its parent's state, and in one", badState.length === 0, badState.slice(0, 6).map((q) => [q, stateOf.get(q), parentOf.get(q), stateOf.get(parentOf.get(q))]));
    const spans = st1.filter((s) => new Set(s.provinces.map((p) => String(reg1.get(p)))).size !== 1);
    rec("no state spans two regions", st1.length > 0 && spans.length === 0, spans.map((s) => s.id));
    rec("every land province is in a state", land1.every((p) => stateOf.has(p)), land1.filter((p) => !stateOf.has(p)).slice(0, 6));

    console.log("\n-- 5. the land is the uncut twin's --");
    const def2 = SW.readDef(path.join(R2, "map", "definition.csv")), dec2 = SW.decode(path.join(R2, "map", "provinces.bmp"), def2);
    let sideOff = 0;
    for (let i = 0; i < dec1.ids.length; i++) if ((def1.rows.get(dec1.ids[i]) || {}).type !== (def2.rows.get(dec2.ids[i]) || {}).type) sideOff++;
    rec("⭐ the land/sea side of every pixel is the uncut twin's", sideOff === 0, sideOff);
    rec("flippedProvinces is the uncut twin's: what was raised from the sea, not the pieces", r1.flippedProvinces === r2.flippedProvinces && r1.flippedProvinces === land1.length - sp.newIds, { r1: r1.flippedProvinces, r2: r2.flippedProvinces, land: land1.length });
    let moved = 0;
    for (let i = 0; i < dec1.ids.length; i++) { const p = dec1.ids[i], q = p > S.N ? parentOf.get(p) : p; if (q !== dec2.ids[i]) moved++; }
    rec("…and every pixel is its parent's where the uncut twin has it, but the ones the report says the X pass handed between two parents", moved === (sp.movedBetweenParents || 0), { moved, report: sp.movedBetweenParents });

    console.log("\n-- 5b. the terrain lies in patches on the map as cut --");
    {
      // each world's land neighbours on its own bitmap, and the terrain its definition.csv gives each province: the share of pairs that
      // share a terrain — the cut world's pairs with a piece in them, the uncut twin's all — against the share two of the cut world's
      // land provinces drawn at random would (the sum of each terrain's share squared)
      const terrainOf = (mod) => { const m = new Map(); for (const l of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (/^\d+$/.test(c[0]) && +c[0] > 0 && c[4] === "land") m.set(+c[0], c[6]); } return m; };
      const shareSame = (ids, tOf, keep) => {
        const pairs = new Set();
        for (let y = 0; y < SW.H; y++) for (let x = 0; x < SW.W; x++) {
          const a = ids[y * SW.W + x];
          for (const b of [ids[y * SW.W + (x + 1) % SW.W], y + 1 < SW.H ? ids[(y + 1) * SW.W + x] : a]) if (a !== b && tOf.has(a) && tOf.has(b) && keep(a, b)) pairs.add(a < b ? `${a}-${b}` : `${b}-${a}`);
        }
        let same1 = 0;
        for (const k of pairs) { const [a, b] = k.split("-").map(Number); if (tOf.get(a) === tOf.get(b)) same1++; }
        return { share: pairs.size ? same1 / pairs.size : 0, pairs: pairs.size };
      };
      const t1 = terrainOf(R1), t2 = terrainOf(R2);
      const cutShare = shareSame(dec1.ids, t1, (a, b) => parentOf.has(a) || parentOf.has(b)), uncutShare = shareSame(dec2.ids, t2, () => true);
      const mix = new Map(); for (const t of t1.values()) mix.set(t, (mix.get(t) || 0) + 1);
      const chance = [...mix.values()].reduce((a, k) => a + (k / t1.size) ** 2, 0);
      console.log(`   same-terrain neighbours: pieces ${(100 * cutShare.share).toFixed(1)}% of ${cutShare.pairs} pairs · uncut twin ${(100 * uncutShare.share).toFixed(1)}% of ${uncutShare.pairs} · chance ${(100 * chance).toFixed(1)}%`);
      rec("(control: the land is of more than one terrain, and the uncut twin's lies in patches — its neighbours share a terrain more often than chance would have them)",
        mix.size > 2 && uncutShare.share > chance && cutShare.pairs > 0, { mix: [...mix], uncut: uncutShare, chance });
      rec("⭐⭐ the pieces' terrain lies in patches as the uncut twin's does: their neighbours share it nearer the uncut twin's share than chance's — the terrain was chosen on the map as cut",
        cutShare.share - chance > (uncutShare.share - chance) / 2, { pieces: cutShare, uncut: uncutShare.share, chance });
    }

    console.log("\n-- 6. the STRICT twin: the state layer is cut over the parents --");
    const R3 = mod("r3"), R4 = mod("r4");
    const strict = { landForArmies: false, keepEveryCountry: false };
    const r3 = gen(R3, strict), r4 = gen(R4, Object.assign({ splitLargeProvinces: false }, strict));
    rec("(both strict runs made a world, the first cut it, and the states were halved to reach the id the scripts name)", r3.changed && r4.changed && r3.provinceSplit.changed === true && r3.stateIds.halved > 0 && r3.stateIds.halved === r4.stateIds.halved,
      { s3: r3.stateIds, s4: r4.stateIds, split: r3.provinceSplit.changed });
    const fam3 = new Map();
    for (const f of md.readProvinceSplitRecord(R3).families || []) for (const q of f.pieces) fam3.set(q, f.parent);
    const view = (s, fam) => ({ id: s.id, parents: s.provinces.filter((p) => !fam.has(p)).sort((a, b) => a - b), owner: s.owner, category: s.category, manpower: s.manpower, vp: s.vpValues, res: s.res, keys: s.keys });
    const v3 = SW.readStates(R3).map((s) => view(s, fam3)), v4 = SW.readStates(R4).map((s) => view(s, new Map()));
    const diff = v3.filter((s, i) => !same(s, v4[i])).map((s) => s.id);
    rec(`⭐⭐⭐ every state's id, provinces less the pieces, owner, category, people, victory point values, resources and buildings are the uncut twin's (${v3.length} states)`,
      v3.length === v4.length && v3.length > 0 && diff.length === 0, diff.slice(0, 4).map((id) => [v3.find((s) => s.id === id), v4.find((s) => s.id === id)]));
    rec("(…and the cut is in them: some state holds pieces)", SW.readStates(R3).some((s) => s.provinces.some((p) => fam3.has(p))));
    const o3 = r3.ownership || {}, o4 = r4.ownership || {};
    rec("⭐⭐ …and the owner passes saw the uncut click's world: as many by majority and by proximity, and the same coast settled from",
      !!o3.fromCoast && o3.fromCoast.seeds > 0 && o3.byMajority === o4.byMajority && o3.byProximity === o4.byProximity && same(o3.fromCoast, o4.fromCoast),
      { cut: [o3.byMajority, o3.byProximity, o3.fromCoast], uncut: [o4.byMajority, o4.byProximity, o4.fromCoast] });

    console.log("\n-- 7. the DEFAULTS twin --");
    const st2 = SW.readStates(R2);
    const budget = (sts) => { const o = {}; for (const s of sts) { const b = o[s.owner] || (o[s.owner] = { mp: 0, res: {} }); b.mp += s.manpower; for (const [k, v] of Object.entries(s.res)) b.res[k] = (b.res[k] || 0) + v; } return o; };
    rec("⭐ every country holds the people and resources the uncut twin's holds", same(budget(st1), budget(st2)) && Object.keys(budget(st1)).length >= 2, { cut: budget(st1), uncut: budget(st2) });
    {
      // a world where the army top-up acts: BBB's army stands on 120 of its 138 provinces below and its every state holds 3 factory
      // levels, and 70% of the sea is raised — so the uncut twin hands BBB states, the land BBB is given is ocean-sized, and BBB's
      // factories need the building slots those states bring
      const game7 = path.join(path.dirname(game), "game-army");
      const G7 = SW.makeGame(game7, S, { unitstacks: middles, divisions: { BBB: 120 }, factories: { BBB: 3 } });
      const COUNT7 = Math.round(S.N * 70 / 100);
      const A1 = mod("army-cut"), A2 = mod("army-uncut");
      const a1 = md.generateLand(Object.assign({ modRoot: A1 }, BASE, { gameRoot: game7, count: COUNT7 })), a2 = md.generateLand(Object.assign({ modRoot: A2 }, BASE, { gameRoot: game7, count: COUNT7, splitLargeProvinces: false }));
      const al1 = (a1.countries || {}).armyLand || {}, al2 = (a2.countries || {}).armyLand || {};
      const shortTags = (al) => (al.stillShort || []).map((x) => x.tag).sort();
      rec("(control: both made the world, the first cut it; the uncut twin's army top-up hands states over and still leaves a country short)",
        a1.changed && a2.changed && a1.provinceSplit.changed === true && (al2.given || []).length > 0 && (al2.stillShort || []).length > 0 && !al1.error && !al2.error,
        { split: a1.provinceSplit.changed, given2: al2.given, short2: al2.stillShort });
      rec("no country is short of land for its army where the uncut twin was not, and none is given more", shortTags(al1).every((x) => shortTags(al2).includes(x)) && (al1.given || []).length <= (al2.given || []).length,
        { short1: shortTags(al1), short2: shortTags(al2), given1: (al1.given || []).length, given2: (al2.given || []).length });
      // ⛔ the land is DEALT as raised — by the parents, as the owner passes deal it (merge review MR-2) — and SAID as written. A state
      // of either twin is matched by its parents: its provinces less the pieces the record names
      const famA = new Map();
      for (const f of md.readProvinceSplitRecord(A1).families || []) for (const q of f.pieces) famA.set(q, f.parent);
      const sa1 = SW.readStates(A1), sa2 = SW.readStates(A2), held = (sts, t) => sts.filter((s) => s.owner === t).reduce((a, s) => a + s.provinces.length, 0);
      const parentsKey = (s, fam) => s.provinces.filter((p) => !fam.has(p)).sort((a, b) => a - b).join(" ");
      const ownersBy = (sts, fam) => new Map(sts.map((s) => [parentsKey(s, fam), s.owner]));
      const o1 = ownersBy(sa1, famA), o2 = ownersBy(sa2, new Map());
      const givenBy = (al, sts, fam) => (al.given || []).map((g) => { const s = sts.find((x) => x.id === g.state); return s ? `${g.tag} ${parentsKey(s, fam)}` : `${g.tag} ?${g.state}`; }).sort();
      const g1 = givenBy(al1, sa1, famA), g2 = givenBy(al2, sa2, new Map());
      const ownerOff = [...o2].filter(([k, t]) => o1.get(k) !== t);
      rec("(control: the cut twin's states hold pieces the record names)", famA.size > 0 && sa1.some((s) => s.provinces.some((p) => famA.has(p))), famA.size);
      rec("⭐⭐⭐ the cut twin deals the land as raised: it hands the same countries the same states (by their parents) as the uncut twin, and every state keeps the uncut twin's owner",
        g1.length > 0 && same(g1, g2) && o1.size === o2.size && ownerOff.length === 0, { given1: g1, given2: g2, ownerOff: ownerOff.slice(0, 4) });
      const sizeOff = (al1.given || []).filter((g) => { const s = sa1.find((x) => x.id === g.state); return !s || g.size !== s.provinces.length; });
      rec("⭐⭐ …and says the map as written: each state handed over is given with its provinces as written, its pieces counted — more than the uncut twin's",
        (al1.given || []).length > 0 && sizeOff.length === 0 && sum((al1.given || []).map((g) => g.size)) > sum((al2.given || []).map((g) => g.size)), { sizeOff, given1: al1.given, given2: al2.given });
      const needy = (al2.stillShort || []).map((x) => ({ tag: x.tag, need: x.need, uncut: held(sa2, x.tag), cut: held(sa1, x.tag), said: (al1.stillShort || []).find((y) => y.tag === x.tag) || null }));
      rec("⭐⭐ …and a country the uncut twin leaves short is said short in the cut one only when what it holds AS WRITTEN is short too, with that",
        needy.length > 0 && needy.every((x) => (x.cut < x.need ? !!x.said && x.said.has === x.cut : !x.said)), needy);
      rec("⭐ …and every country holds the people and resources the uncut twin's holds", same(budget(sa1), budget(sa2)) && Object.keys(budget(sa1)).length >= 2, { cut: budget(sa1), uncut: budget(sa2) });
      // ⛔ #a-generated-country-keeps-its-economy — the factory levels each country had below and placed now: the cut costs no country a
      // level, and a country placing fewer than it had is named for it (economy.short), with the room it had — never a level lost unsaid
      const sharedKeys = [...fs.readFileSync(path.join(game7, "common", "buildings", "00_buildings.txt"), "utf8").matchAll(/\t(\w+) = \{\n\t\tbase_cost = \d+\n\t\tlevel_cap = \{\n\t\t\tshares_slots = yes/g)].map((m) => m[1]);
      const placed = (sts) => { const o = {}; for (const s of sts) for (const k of sharedKeys) o[s.owner] = (o[s.owner] || 0) + (s.keys[k] || 0); return o; };
      const had = {}; for (const s of G7.states) for (const k of sharedKeys) had[s.owner] = (had[s.owner] || 0) + (s.buildings[k] || 0);
      const said7 = (r, sts) => Object.keys(had).filter((t) => (placed(sts)[t] || 0) < had[t]).map((t) => { const sh = ((r.economy || {}).short || []).find((x) => x.tag === t); return { tag: t, had: had[t], placed: placed(sts)[t] || 0, named: sh ? sh.slots : null }; });
      const under1 = said7(a1, sa1), under2 = said7(a2, sa2);
      console.log(`   MEASURE factory levels placed of those had below — cut ${JSON.stringify(placed(sa1))} · uncut ${JSON.stringify(placed(sa2))} · had ${JSON.stringify(had)}; states handed over ${(al1.given || []).length} / ${(al2.given || []).length}`);
      rec("(control: the shared factory keys are read off the fixture, and a country places fewer levels than it had — its land is short of building slots)",
        sharedKeys.length >= 2 && under2.length > 0, { sharedKeys, under1, under2 });
      rec("⭐⭐ the cut costs no country a factory level: every country places the uncut twin's",
        Object.keys(placed(sa2)).length >= 2 && same(placed(sa1), placed(sa2)), { cut: placed(sa1), uncut: placed(sa2) });
      rec("⭐⭐ in both twins every country that places fewer factory levels than it had below is named for it, having placed exactly the room it is named with",
        [...under1, ...under2].every((x) => x.named != null && x.placed === x.named), { under1, under2 });
    }

    console.log("\n-- 8. Map Errors after Auto-fix --");
    const f1 = await srv.autoFix(R1), f2 = await srv.autoFix(R2);
    const v1 = await srv.validate(R1), v2 = await srv.validate(R2);
    const BAD = ["province_no_region", "land_not_in_state", "map_x_crossing", "province_no_pixels", "province_id_gap", "duplicate_province_color", "province_color_not_defined", "fractioned_naval_region"];
    rec("(Auto-fix ran on both)", f1.status === 200 && f2.status === 200, [f1.status, f2.status]);
    const hits = BAD.map((r) => [r, countOf(v1, r)]).filter(([, n]) => n);
    rec(`⭐⭐ none of ${BAD.join(", ")}`, hits.length === 0, hits);
    const extra = rulesIn(v1).filter((r) => !rulesIn(v2).includes(r));
    rec("⭐ and no rule fires on the cut world that does not fire on the uncut twin", extra.length === 0, { extra, cut: rulesIn(v1), uncut: rulesIn(v2) });
    console.log(`   Map Errors: cut ${rulesIn(v1).map((r) => r + " " + countOf(v1, r)).join(", ") || "none"} · uncut ${rulesIn(v2).map((r) => r + " " + countOf(v2, r)).join(", ") || "none"}`);

    console.log("\n-- 9. the one write, called directly --");
    {
      const R5 = mod("r5");
      const model = md.buildMapModel({ modRoot: R5, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
      const p2r = model.provinceToRegion || {};
      const picked = [];
      for (let id = 1; id <= S.N; id++) if (S.typeOf(id) === "sea" && p2r[String(id)] !== undefined) picked.push(String(id));
      const lines = fs.readFileSync(path.join(R5, "map", "definition.csv"), "utf8").split("\n");
      const cut = md.planGeneratedProvinceSplit({ modRoot: R5, gameRoot: game, dependencyRoots: [], picked, lines, model, p2r, seed: SEED });
      const w = cut.write ? md.writeGeneratedProvinceSplit({ modRoot: R5, gameRoot: game, dependencyRoots: [], write: cut.write, picked }) : { ok: false, error: "nothing to write" };
      rec("(every ocean cell, cut directly, is written)", w.ok === true && cut.report.split === picked.length, { ok: w.ok, error: w.error, split: cut.report.split, picked: picked.length });
      const d5 = SW.readDef(path.join(R5, "map", "definition.csv")), b5 = SW.decode(path.join(R5, "map", "provinces.bmp"), d5);
      let off5 = 0;
      for (let i = 0; i < b5.ids.length; i++) if (b5.ids[i] !== cut.write.raster.ids[i]) off5++;
      rec("⭐⭐ provinces.bmp decodes to exactly the cut held in memory, every pixel", w.ok === true && off5 === 0 && b5.ids.length === cut.write.raster.ids.length, off5);
    }
    {
      // ⭐ …and a pixel the X pass hands from one parent to ANOTHER is written too — the cut's own pixels are not all a writer must
      // write. Three raised rectangles side by side, P with a 2 px pocket that meets its body's corner only diagonally, between Q
      // and R (test-a-raised-province-is-cut-to-land-size's shape), P's station far from that corner and Q's and R's on it — so the
      // pieces that keep Q's and R's own ids meet the corner, and the pixel handed across can go to an id the file already has.
      const S9 = SW.makeShapes({ big: [{ x0: 300, y0: 20, w: 60, h: 40, key: "P" }, { x0: 360, y0: 20, w: 60, h: 60, key: "Q" },
        { x0: 300, y0: 60, w: 60, h: 20, key: "R" }, { x0: 360, y0: 60, w: 1, h: 2, key: "P" }] });
      const P9 = S9.idOf.get("P"), Q9 = S9.idOf.get("Q"), R9 = S9.idOf.get("R");
      const game9 = path.join(path.dirname(game), "game-across");
      const stand = (x, y) => [x + 0.5, SW.H - 1 - y + 0.5];
      SW.makeGame(game9, S9, { unitstacks: new Map([[P9, stand(302, 22)], [Q9, stand(360, 59)], [R9, stand(359, 60)]]) });
      const R9m = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "r9"), S9, { name: "r9" });
      const model = md.buildMapModel({ modRoot: R9m, gameRoot: game9, dependencyRoots: [], cacheStableLayers: true });
      const picked = [P9, Q9, R9].map(String);
      const lines = fs.readFileSync(path.join(R9m, "map", "definition.csv"), "utf8").split("\n");
      const cut = md.planGeneratedProvinceSplit({ modRoot: R9m, gameRoot: game9, dependencyRoots: [], picked, lines, model, p2r: model.provinceToRegion || {}, seed: SEED });
      const src9 = SW.decode(path.join(R9m, "map", "provinces.bmp"), SW.readDef(path.join(R9m, "map", "definition.csv"))).ids;
      let toOld = 0;
      if (cut.write) for (let i = 0; i < src9.length; i++) if (cut.write.raster.ids[i] <= S9.N && cut.write.raster.ids[i] !== src9[i]) toOld++;
      rec("(control: all three are cut, and the X pass handed a pixel from one parent to another's own id — one the file already has)", !!cut.write && cut.report.split === 3 && cut.report.movedBetweenParents >= 1 && toOld >= 1,
        { split: cut.report.split, moved: cut.report.movedBetweenParents, toOld });
      const w = cut.write ? md.writeGeneratedProvinceSplit({ modRoot: R9m, gameRoot: game9, dependencyRoots: [], write: cut.write, picked }) : { ok: false };
      const d9 = SW.readDef(path.join(R9m, "map", "definition.csv")), b9 = SW.decode(path.join(R9m, "map", "provinces.bmp"), d9);
      let off9 = 0;
      for (let i = 0; i < b9.ids.length; i++) if (b9.ids[i] !== cut.write.raster.ids[i]) off9++;
      rec("⭐⭐ …and that pixel is written with the cut: provinces.bmp decodes to the cut held in memory, with no X-crossing", w.ok === true && off9 === 0 && SW.xCrossings(b9.ids, SW.W, SW.H) === 0, { ok: w.ok, error: w.error, off9 });
    }

    console.log("\n-- 10. the page says it --");
    let note = null;
    try { note = P.runPage(["function generatedProvinceSplitNote("]).sb.generatedProvinceSplitNote; } catch (e) { note = null; }
    rec("generatedProvinceSplitNote was lifted out of public/map.js and runs", typeof note === "function");
    const said = note ? note(r1) : "";
    rec("⭐ it says how many were cut into how many, the base game's size and the largest left", said.includes(`cut ${sp.split.toLocaleString()} ocean-sized`) && said.includes(`into ${(sp.split + sp.newIds).toLocaleString()} land-sized`)
      && said.includes(`averages ${Math.round(sp.target.T0).toLocaleString()} px`) && said.includes(`largest is now ${sp.largestLandPx.toLocaleString()} px`) && !/limit/.test(said), said);
    rec("the uncut twin's note says nothing (turned off is the test's switch, not the page's)", note ? note(r2) === "" : false, note && note(r2));
    const MAP = maskJsComments(P.MAP);
    // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
    // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
    const line = (P.generateLandReportLine(MAP).match(/reloadAfterImmediateWrite\(`🌍 Generated [^\n]*/) || [""])[0];
    rec("⭐ the Generate land status line carries it, after the coast note (comments stripped)", /const splitNote = generatedProvinceSplitNote\(res\);/.test(MAP) && line.indexOf("${coastNote}${splitNote}") >= 0, line.slice(0, 200));
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 800));
  } finally {
    if (srv) srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
  }
  console.log(`\n=== a generated world has land-sized provinces: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
