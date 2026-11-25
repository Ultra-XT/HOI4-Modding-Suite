// ⛔ #a-generated-world-has-the-layer-belows-hubs-per-state — THE HUB CHOOSER, ASKED OF EVERY SHIPPING MAP'S OWN STATES.
//
// Generate land gives a supply hub to the capitals, then to round(share × states) of each state_category, in an order — a state holding
// a town first, then more land, then the higher victory point, then the lower id — and to none on land its country can reach neither
// by rail from its capital nor by sea (chooseSupplyHubs). Here every installed shipping map is handed its OWN states, capitals,
// geometry and shares, and the chooser's pick is compared with the states that map really hubs:
//   1. it agrees on at least .70 of them;
//   2. ⭐ it beats a random pick of the same count in each kind by at least .15 of what was left to win (Cohen's kappa) — a raw
//      margin over chance cannot be the bar: Hearts of Minecraft hubs 84% of its states, so chance there is already .754.
//      CONTROL: the reverse order fails that bar on the same map;
//   3. ⭐ none of the map's own hubs stands on land its owner reaches neither by rail nor by sea — the premise the filter rests on
//      (in the game such a hub has "No supply connection from Capital");
//   4. with hubs added where land is farthest from one, the 90th-percentile distance to a hub is no worse than the map's own.
// The id order's agreement is printed for information only: on Hearts of Minecraft the chooser's margin over it is .010, too
// thin to pin on game files a patch may change. Measured 10-06 (agreement / kappa): vanilla .778 / .31, MD .744 / .35,
// R56 .766 / .29, OWB .780 / .29, NV .725 / .26, RoN .780 / .30, HoM .798 / .18. A map that is not installed is a counted SKIP.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hub-chooser-corpus-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPUS = {
  vanilla: GAME,
  "Millennium Dawn": WORKSHOP + "2777392649",
  "Road to 56": WORKSHOP + "820260968",
  "Old World Blues": WORKSHOP + "2265420196",
  "Novum Vexillum": WORKSHOP + "1827273767",
  "Rise of Nations": WORKSHOP + "2026448968",
  "Hearts of Minecraft": WORKSHOP + "2624254320",
};

let ruledOut = 0, ran = 0;
for (const [name, root] of Object.entries(CORPUS)) {
  console.log(`\n-- ${name} --`);
  if (!fs.existsSync(path.join(root, "map", "supply_nodes.txt")) || !fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) { console.log(`  SKIP ${name}: not installed on this machine`); continue; }
  ran++;
  const model = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
  const byId = new Map(model.provinces.map((d) => [d.id, d]));
  const isLand = (p) => { const d = byId.get(p); return !!d && String(d.type || "").toLowerCase() === "land"; };
  const p2s = model.provinceToState || {};
  const own = (s) => (s.provinces || []).map(Number).filter((p) => isLand(p) && p2s[p] === s.id);
  const states = (model.states || []).filter(Boolean), byState = new Map(states.map((s) => [s.id, s]));
  const land = states.filter((s) => own(s).length);
  const hubs = new Set((model.supplyNodes || []).map((h) => h.province));
  const actual = new Set(land.filter((s) => own(s).some((p) => hubs.has(p))).map((s) => s.id));

  // the land a train can cross: province neighbours, both land, but the pairs an `impassable` row closes; each piece a landmass
  const adj = md.provinceNeighbourGraph({ modRoot: root, gameRoot: GAME, dependencyRoots: [], model });
  const closed = new Set();
  for (const r of (model.adjacencies || [])) if (r && r.from > 0 && r.to > 0 && String(r.type || "").trim().toLowerCase() === "impassable") closed.add(`${Math.min(r.from, r.to)}-${Math.max(r.from, r.to)}`);
  const graph = new Map();
  for (const [u, vs] of adj) { if (!isLand(u)) continue; const keep = new Set(); for (const v of vs) if (isLand(v) && !closed.has(`${Math.min(u, v)}-${Math.max(u, v)}`)) keep.add(v); graph.set(u, keep); }
  const mass = new Map();
  for (const p of graph.keys()) { if (mass.has(p)) continue; const q = [p]; mass.set(p, p); while (q.length) { const u = q.pop(); for (const v of graph.get(u)) if (!mass.has(v)) { mass.set(v, p); q.push(v); } } }
  // each country's capital, where it is its own and holds land, and every landmass a port stands on
  const capitalOf = new Map();
  for (const [tag, id] of Object.entries(model.capitals || {})) { const s = byState.get(id); if (s && s.owner === tag && own(s).length) capitalOf.set(tag, s); }
  const capMass = new Map([...capitalOf].map(([tag, s]) => [tag, new Set(own(s).filter((p) => mass.has(p)).map((p) => mass.get(p)))]));
  const portMass = new Set();
  for (const s of states) for (const [p, b] of Object.entries(s.provinceBuildings || {})) if (Number((b || {}).naval_base) > 0 && mass.has(Number(p))) portMass.add(mass.get(Number(p)));
  const reaches = (owner, p) => !owner || (mass.has(p) && ((capMass.get(owner) || new Set()).has(mass.get(p)) || portMass.has(mass.get(p))));

  // 3. the premise, on the map's own hubs
  const stranded = [...hubs].filter((p) => isLand(p) && p2s[p] != null && !reaches((byState.get(p2s[p]) || {}).owner, p));
  ok(stranded.length === 0, `⭐⭐ none of its ${hubs.size} hubs stands on land its owner reaches neither by rail nor by sea`, stranded.slice(0, 10));

  // 1, 2. the chooser on the map's own states, shares and capitals
  const per = new Map();
  for (const s of land) { const c = String(s.category || "").trim(), r = per.get(c) || { n: 0, h: 0 }; r.n++; if (actual.has(s.id)) r.h++; per.set(c, r); }
  const rateOf = (c) => (per.has(c) ? per.get(c).h / per.get(c).n : 0);
  const recs = land.map((s) => {
    const o = own(s), vps = (s.victoryPoints || []).filter((v) => o.includes(Number(v.province))).map((v) => Number(v.value) || 0);
    return { id: s.id, category: String(s.category || "").trim(), provinces: o, owner: s.owner ? String(s.owner) : "", vpValue: vps.length ? Math.max(...vps) : 0,
      urban: o.some((p) => String((byId.get(p) || {}).terrain || "").trim().toLowerCase() === "urban") };
  });
  const routable = (r) => r.provinces.some((p) => reaches(r.owner, p));
  ruledOut += recs.filter((r) => !routable(r)).length;
  const siteOf = (r) => { const v = (byState.get(r.id).victoryPoints || []).filter((x) => r.provinces.includes(Number(x.province))).sort((a, b) => Number(b.value) - Number(a.value) || Number(a.province) - Number(b.province)); return v.length ? Number(v[0].province) : r.provinces[0]; };
  const choose = (extra) => md.chooseSupplyHubs({ states: recs, rateOf, capitalStateIds: [...capitalOf.values()].map((s) => s.id), routable, hubProvinceOf: siteOf, hubs: [], ...extra });
  const statesOf = (res) => { const at = new Set(res.hubs.map((h) => h.province)); return new Set(recs.filter((r) => r.provinces.some((p) => at.has(p))).map((r) => r.id)); };
  const byCat = new Map(); for (const r of recs) { if (!byCat.has(r.category)) byCat.set(r.category, []); byCat.get(r.category).push(r); }
  /** agreement with the states the map hubs, and Cohen's kappa against a random pick of the same count in each kind */
  const judge = (set) => {
    let agree = 0, chance = 0;
    for (const r of recs) if (set.has(r.id) === actual.has(r.id)) agree++;
    for (const list of byCat.values()) { const n = list.length, k = list.filter((r) => set.has(r.id)).length, a = list.filter((r) => actual.has(r.id)).length; chance += (k * a + (n - k) * (n - a)) / n; }
    agree /= recs.length; chance /= recs.length;
    return { agree, chance, kappa: (agree - chance) / (1 - chance) };
  };
  const picked = statesOf(choose({})), j = judge(picked);
  ok(j.agree >= 0.70, `it agrees with the states the map hubs on ${j.agree.toFixed(3)} of its ${recs.length} land states (at least .70)`, j);
  ok(j.kappa >= 0.15, `⭐⭐ …${j.kappa.toFixed(2)} of the way from a random pick of the same count in each kind (${j.chance.toFixed(3)}) to all of them (at least .15)`, j);
  // CONTROL: the same counts, the order reversed — the bar can tell an order that knows nothing from one that knows the map
  const sameCount = (order, from = []) => {
    const out = new Set(from);
    for (const [c, list] of byCat) { const want = Math.round(rateOf(c) * list.length); let have = list.filter((r) => out.has(r.id)).length; for (const r of list.slice().sort(order)) { if (have >= want) break; if (!out.has(r.id)) { out.add(r.id); have++; } } }
    return out;
  };
  const design = (a, b) => (b.urban ? 1 : 0) - (a.urban ? 1 : 0) || b.provinces.length - a.provinces.length || b.vpValue - a.vpValue || a.id - b.id;
  const rev = judge(sameCount((a, b) => -design(a, b)));
  ok(rev.kappa < 0.15, `CONTROL: the reverse order, the same counts, scores ${rev.kappa.toFixed(2)} — under the bar`, rev);
  const byIdOrder = judge(sameCount((a, b) => a.id - b.id, [...capitalOf.values()].map((s) => s.id)));
  console.log(`  ..   (for information: the capitals, then the id order, agree on ${byIdOrder.agree.toFixed(3)}, kappa ${byIdOrder.kappa.toFixed(2)})`);

  // 4. hubs added for area: no land farther from one than the map's own
  let landInStates = 0, hubsOnLand = 0;
  for (const r of recs) { landInStates += r.provinces.length; for (const p of r.provinces) if (hubs.has(p)) hubsOnLand++; }
  const full = choose({ graph, landProvincesPerHub: landInStates / hubsOnLand });
  const served = recs.filter(routable).flatMap((r) => r.provinces);
  const p90 = (from) => {
    const d = new Map(); let front = [...from].filter((p) => graph.has(p));
    for (const p of front) d.set(p, 0);
    for (let k = 1; front.length; k++) { const nx = []; for (const u of front) for (const v of graph.get(u)) if (!d.has(v)) { d.set(v, k); nx.push(v); } front = nx; }
    const v = served.map((p) => d.get(p)).filter((x) => x !== undefined).sort((a, b) => a - b);
    return v[Math.floor(v.length * 0.9)];
  };
  const mine = p90(full.hubs.map((h) => h.province)), theirs = p90([...hubs].filter(isLand));
  ok(full.density.topUp > 0 && mine <= theirs, `with ${full.density.topUp} hubs added where land is farthest from one, 90% of its land is within ${mine} provinces of a hub — the map's own: ${theirs}`, { mine, theirs, density: full.density });
}

console.log("\n-- across the installed maps --");
if (!ran) console.log("  SKIP every map: none is installed on this machine");
else ok(ruledOut > 0, `(CONTROL: the filter does rule land out — ${ruledOut} states over the installed maps — so "no hub there" is not empty)`, ruledOut);

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
