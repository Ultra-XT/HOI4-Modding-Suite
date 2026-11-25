// #a-state-that-kept-its-coast-kept-its-harbour — THE PROVINCE DROWNED, THE STATE DID NOT.
//
// `portsFor` in generateLand restores a naval base only onto the SAME province the layer below put it on, so
// a state whose port province was flooded lost its harbour even when it still held a coast. That is most of
// the gap: on the world the owner launched, 26 of the base game's 536 naval bases survived.
//
// 🈯 WHY THIS AND NOT "GIVE EVERY COASTAL STATE A PORT". Measured over those 832 generated states, of the
// ones with no port:
//      18  had one below and still hold a coastal province  <- restored here; one correct answer, move it
//     140  had one below and have no coast left at all      <- nothing to restore, the sea really is gone
//     652  never had one below                             <- a port here would be INVENTING a world
// An earlier attempt keyed off map/buildings.txt anchors instead and wrote 239 harbours, which is the 652
// case — exactly what portsFor's own comment warns against ("writing one per port would be inventing a
// world"). The level still comes from the layer below; only the province moves, and only inside the state
// that already owned the port.
//
// ⛔ #a-navy-keeps-a-home-port — THE ONE EXCEPTION, AND IT IS PINNED, NOT EXCUSED. A country whose order of battle starts a fleet
// and that kept no harbour anywhere gets ONE, at the level of its home port below, in a state of its own — which can be a state
// that had none below. The "never invented" pins below therefore skip exactly the ports gen.navyHome names, and the block after
// them pins those: some given at 600 / seed 5, each at its country's own port level below, one per country, every one a navy's.
//
// ⛔ #a-country-reaches-its-land-by-sea — THE SECOND EXCEPTION, PINNED THE SAME WAY. ⚠️ Moved with supply commit 1 (b): supply reaches a
// piece of a country's land that is not its capital's only by sea, so each such piece that holds no port and opens onto the ocean
// gets ONE harbour (the base game ports 185 of its 189 pieces that are not a capital's), and the capital's piece one when it has
// none — which can be in a state that had none below. The "never invented" pins skip exactly the ports gen.seaRoute names, and
// the block after the navy homes pins those: in their own country's state, at level 1 on a piece that is not the capital's and at
// the country's best port level below (else 1) on the capital's, one per piece the report counts.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  console.log("SKIP: no Hearts of Iron IV install at " + GAME);
  process.exit(0);
}
const mask = (s) => s.replace(/#[^\n]*/g, (m) => " ".repeat(m.length));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keptcoast-"));
const mod = path.join(tmp, "mod");
fs.mkdirSync(path.join(mod, "map"), { recursive: true });
// replace_path="history/states" is what Nova's own Delete map dialog tells a modder to add before building a
// world from scratch, and it is what the owner's flow uses.
fs.writeFileSync(path.join(mod, "descriptor.mod"),
  'version="1"\nname="kept coast"\nsupported_version="1.19.*"\nreplace_path="history/states"\npath="mod/x"\n');
fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });

const gen = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 600, seed: 5 });
assert.ok(gen && gen.changed !== false, "generateLand refused: " + JSON.stringify(gen && gen.error));
const nb = gen.navalBases || {};
console.log("navalBases: " + JSON.stringify({ fromBelow: nb.fromBelow, restored: nb.restored, notOnACoast: nb.notOnACoast, moved: nb.movedToAnotherCoast }));

// ── what the layer below said ────────────────────────────────────────────────────────────────────────────
const below = new Map(), belowOwner = new Map();
for (const f of fs.readdirSync(path.join(GAME, "history", "states"))) {
  if (!/\.txt$/i.test(f)) continue;
  const t = mask(fs.readFileSync(path.join(GAME, "history", "states", f), "latin1"));
  const ow = (/\bowner\s*=\s*([A-Z0-9]+)/.exec(t) || [])[1];
  for (const m of t.matchAll(/(\d+)\s*=\s*\{[^{}]*?naval_base\s*=\s*([1-9]\d*)/g)) { below.set(+m[1], +m[2]); if (ow) belowOwner.set(+m[1], ow); }
}

const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
const coast = md.landProvincesTouchingSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], model }) || new Set();

// ── every port the generator wrote ───────────────────────────────────────────────────────────────────────
const made = new Set((gen.newStates || []).map((s) => s.id));
const homes = new Map(((gen.navyHome || {}).provinces || []).map((h) => [h.province, h]));   // #a-navy-keeps-a-home-port
const homeByTag = new Map();
let homeWrong = 0;
const routes = new Map(((gen.seaRoute || {}).provinces || []).map((h) => [h.province, h]));   // #a-country-reaches-its-land-by-sea
const routeByTag = new Map();
let routeWrong = 0, routesWritten = 0;
// the best naval_base each country's land held below: the level a capital's piece takes
const bestBelow = new Map();
for (const [p, lvl] of below) { const o = belowOwner.get(p); if (o) bestBelow.set(o, Math.max(bestBelow.get(o) || 0, lvl)); }
let ports = 0, offCoast = 0, notOwn = 0, levelWrong = 0, doubled = 0, invented = 0;
for (const f of fs.readdirSync(path.join(mod, "history", "states"))) {
  if (!/\.txt$/i.test(f)) continue;
  const t = mask(fs.readFileSync(path.join(mod, "history", "states", f), "latin1"));
  const idm = /\bid\s*=\s*(\d+)/.exec(t);
  if (!idm || !made.has(+idm[1])) continue;
  const pv = /provinces\s*=\s*\{([^}]*)\}/.exec(t);
  const provs = (pv ? (pv[1].match(/\d+/g) || []).map(Number) : []);
  const seen = new Set();
  const here = [...t.matchAll(/(\d+)\s*=\s*\{[^{}]*?naval_base\s*=\s*([1-9]\d*)/g)];
  // the levels this state's own provinces carried below, as a multiset
  const belowLevels = provs.map((p) => below.get(p)).filter(Boolean).sort((a, b) => a - b);
  for (const m of here) {
    ports++;
    const p = +m[1], lvl = +m[2];
    if (!coast.has(p)) offCoast++;
    if (!provs.includes(p)) notOwn++;
    if (seen.has(p)) doubled++; else seen.add(p);
    // #a-navy-keeps-a-home-port — a home is held to its own rule (below), the "restored, never invented" pins to everything else
    if (homes.has(p)) {
      const own = (/\bowner\s*=\s*([A-Z0-9]+)/.exec(t) || [])[1], h = homes.get(p);
      homeByTag.set(own, (homeByTag.get(own) || 0) + 1);
      if (h.tag !== own || h.state !== +idm[1] || below.get(h.from) !== lvl || belowOwner.get(h.from) !== own) homeWrong++;
      continue;
    }
    // #a-country-reaches-its-land-by-sea — a piece's harbour is held to its own rule (below)
    if (routes.has(p)) {
      const own = (/\bowner\s*=\s*([A-Z0-9]+)/.exec(t) || [])[1], h = routes.get(p);
      routesWritten++;
      routeByTag.set(own, (routeByTag.get(own) || 0) + 1);
      const want = h.piece === "capital" ? Math.max(1, bestBelow.get(own) || 0) : 1;
      if (h.tag !== own || h.state !== +idm[1] || h.level !== lvl || lvl !== want) routeWrong++;
      continue;
    }
    if (!belowLevels.includes(lvl)) levelWrong++;
    if (!belowLevels.length) invented++;
  }
}

console.log("ports written: " + ports + "   off-coast " + offCoast + " · not the state's own " + notOwn
  + " · two on one province " + doubled + " · level not from below " + levelWrong + " · state had none below " + invented);

// ── the pins ──────────────────────────────────────────────────────────────────────────────────────────────
assert.ok(nb.fromBelow > 0, "the fixture has states whose land carried a port below — otherwise this proves nothing");
assert.ok((nb.movedToAnotherCoast || 0) > 0,
  "not one port was moved to another coast, so the branch this test exists for never ran: " + JSON.stringify(nb));
assert.strictEqual(offCoast, 0, offCoast + " port(s) are not on a land province touching sea — Auto-fix strips exactly those");
assert.strictEqual(notOwn, 0, notOwn + " port(s) are on a province the state does not own");
assert.strictEqual(doubled, 0, doubled + " state(s) got two ports on one province");
assert.strictEqual(levelWrong, 0, levelWrong + " port(s) carry a level no province of that state had below");

// ⭐ THE ONE THAT KEEPS IT HONEST: a port is only ever RESTORED, never invented. A state whose land carried
// no naval base below must still have none — that is the 652-state case, and the reason this is not simply
// "every coastal state gets a harbour".
assert.strictEqual(invented, 0,
  invented + " port(s) were written into a state that had none below — that is inventing a world, not restoring one");

// ⛔ #a-navy-keeps-a-home-port — THE EXCEPTION, PINNED: given here, each at its country's own port level below, in a state of its
// own, one per country, every one to a navy that kept no other harbour; and no navy owning a coast is left with none unsaid.
{
  const model2 = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const fleets = md.startingUnitLocations({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], model: model2 }).filter((u) => u.kind === "task_force" || u.kind === "navy");
  const navies = new Set(fleets.map((u) => u.tag));
  const portOwners = new Map();
  for (const s2 of model2.states || []) for (const [, b] of Object.entries(s2.provinceBuildings || {})) if (b && +b.naval_base > 0) portOwners.set(s2.owner, (portOwners.get(s2.owner) || 0) + 1);
  const coastalOwners = new Set((model2.states || []).filter((s2) => (s2.provinces || []).some((p) => coast.has(+p))).map((s2) => s2.owner));
  const said = new Set([].concat((gen.navyHome || {}).noOceanCoast || [], (gen.navyHome || {}).noPortBelow || []));
  const unhoused = [...navies].filter((t) => coastalOwners.has(t) && !portOwners.get(t) && !said.has(t));
  console.log("navy homes: " + homes.size + " · navies " + navies.size + " · coastal navies with no harbour and no reason " + unhoused.length + " " + unhoused.join(","));
  assert.ok(homes.size > 0, "no navy home was given at 600/seed 5 — the case this block pins never arose");
  assert.strictEqual(homes.size, (gen.navyHome || {}).given, "the report's count is not the homes it lists");
  assert.strictEqual(homeWrong, 0, homeWrong + " navy home(s) not in their own state, at the level, in the country, of the home port it had below");
  assert.ok([...homeByTag.values()].every((n) => n === 1) && homeByTag.size === homes.size, "a country got more than one home, or a home was not written: " + JSON.stringify([...homeByTag]));
  // …its other harbours being the sea route's alone (#a-country-reaches-its-land-by-sea), which a home counts as its piece's port
  assert.ok([...homeByTag.keys()].every((t) => navies.has(t) && portOwners.get(t) === 1 + (routeByTag.get(t) || 0)), "a home went to a country with no navy, or to one that already had a harbour");
  assert.deepStrictEqual(unhoused, [], "a navy owns a coast and no harbour, and the report does not say why");
}

// ⛔ #a-country-reaches-its-land-by-sea — THE SECOND EXCEPTION, PINNED: given here, each written where the report says, in its own
// country's state, at level 1 on a piece that is not the capital's and at the country's best port level below on the capital's,
// one per piece the report counts and none on a province that held a port or a navy home already.
{
  const sr = gen.seaRoute || {};
  console.log("sea routes: " + routes.size + " harbours (capital pieces " + sr.capitalPieces + ", others " + sr.otherPieces + ") for " + routeByTag.size + " countries · walled in " + (sr.walledIn || []).length + (sr.error ? " · ERROR " + sr.error : ""));
  assert.ok(!sr.error, "the sea routes failed: " + sr.error);
  assert.ok(routes.size > 0, "no sea-route harbour was given at 600/seed 5 — the case this block pins never arose");
  assert.strictEqual(routes.size, (sr.provinces || []).length, "two sea-route harbours on one province");
  assert.strictEqual(routes.size, (sr.capitalPieces || 0) + (sr.otherPieces || 0), "the report's counts are not the harbours it lists");
  assert.strictEqual(routesWritten, routes.size, (routes.size - routesWritten) + " sea-route harbour(s) the report lists are not in a state file");
  assert.strictEqual(routeWrong, 0, routeWrong + " sea-route harbour(s) not in their own country's state, or not at their piece's level");
  assert.ok([...routes.keys()].every((p) => !below.has(p) && !homes.has(p)), "a sea-route harbour stands on a province that held a port below or a navy home");
}

fs.rmSync(tmp, { recursive: true, force: true });

// ⛔ #a-duplicate-province-block-keeps-its-building — TWO PORTS ON ONE PROVINCE. The "doubled" pin above never fired on this
// fixture, because 600 provinces at seed 5 never offers the case: a port moved off a drowned province onto the state's lowest
// spare coast, where a province LATER in the state's list then wrote its own port too. TEST 27 (35%, seed 1) came out with
// `3878 = { naval_base = 3 }` and `3878 = { naval_base = 6 }` in state 448. Measured on the pre-fix code: 1,200 provinces at
// seed 1 writes one such state (and so does seed 5); after the fix, none. Run at the setting that reproduces it.
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keptcoast2-"));
  const mod2 = path.join(tmp2, "mod");
  fs.mkdirSync(path.join(mod2, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod2, "descriptor.mod"), 'version="1"\nname="kept coast 2"\nsupported_version="1.19.*"\nreplace_path="history/states"\npath="mod/y"\n');
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod2, "map", "provinces.bmp"));
  md.blankMapToSea({ modRoot: mod2, gameRoot: GAME, dependencyRoots: [] });
  const gen2 = md.generateLand({ modRoot: mod2, gameRoot: GAME, dependencyRoots: [], count: 1200, seed: 1 });
  assert.ok(gen2 && gen2.changed !== false, "generateLand (1,200 at seed 1) refused: " + JSON.stringify(gen2 && gen2.error));
  assert.ok(((gen2.navalBases || {}).movedToAnotherCoast || 0) > 0, "no port was moved at 1,200/seed 1, so the case this block exists for never arose: " + JSON.stringify(gen2.navalBases));
  let doubled2 = 0;
  for (const f of fs.readdirSync(path.join(mod2, "history", "states"))) {
    const t = mask(fs.readFileSync(path.join(mod2, "history", "states", f), "latin1"));
    const seen = new Set();
    for (const m of t.matchAll(/(\d+)\s*=\s*\{[^{}]*?naval_base\s*=\s*([1-9]\d*)/g)) { if (seen.has(m[1])) doubled2++; seen.add(m[1]); }
  }
  console.log("1,200 at seed 1: " + JSON.stringify(gen2.navalBases && { restored: gen2.navalBases.restored, moved: gen2.navalBases.movedToAnotherCoast }) + " · two on one province " + doubled2);
  assert.strictEqual(doubled2, 0, doubled2 + " state(s) declare one province's naval base twice — a moved port landed on a province that kept its own");
  fs.rmSync(tmp2, { recursive: true, force: true });
}
console.log("PASS: a state that kept its coast kept its harbour, and no state gained one it never had");
