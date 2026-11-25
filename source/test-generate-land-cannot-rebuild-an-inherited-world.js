// ⛔ #generate-land-claims-a-world-the-mod-does-not-own — THE OTHER HALF OF THE WORLD THE OWNER BUILT.
//
// new mod → 🗑 Delete map → 🌍 Generate land at 35% → 🛠 Auto-fix. It LOADED — main menu, 1936 game, no
// MAP_ERROR — and the world was vanilla's coastlines with holes punched through them and pale "glass" shards
// across every ocean. The blank's half is refused already (#a-blank-claims-a-world-the-mod-does-not-own).
// This is Generate land's half, and it is NOT the same call: retyping a handful of ocean provinces into an
// island chain is a thing a modder genuinely wants, and the province inspector does exactly that one province
// at a time, every day. A blanket refusal would make Nova useless for small edits to punish it for large ones.
//
// ⭐⭐⭐ THE PROVINCE IS THE UNIT THAT LIES. Measured over all six installed maps, each definition.csv joined to
// its own provinces.bmp pixel by pixel: a vanilla land province is a mean 399 px and a sea province 2,372 —
// 6× by mean, 14.6× by median. On Old World Blues it is 36×. "Turn 100 sea provinces into land" does not add
// 100 provinces' worth of land; it adds 580. That IS the glass.
//
// 📊 Driven end to end on a wizard-fresh mod over the installed game, at the base commit:
//        1 →      1,772 px (0.04% of the land already there) ·    25 →     53,487 (1.32%)
//      100 →    231,348 px (5.71%)                           ·   500 →  1,192,165 (29.42%)
//    1,097 →  2,611,834 px (64.45%) in 179 states, 766 ports removed  ← the slider's own default
// …and buildMapModel + validateMapModel + validateMapFiles called EVERY ONE of those 0 problems, 0 errors.
// No rule can catch this after the fact, so the gate has to be at the click.
//
// ⭐⭐⭐ THE THRESHOLD IS THE MAP'S OWN SMALLEST CONTINENT — the largest thing on a map a modder can point at
// and call one piece of the world, defined by every map, read off the map being edited rather than typed in
// here. vanilla middle_east 166,048 px (4.10% of its land) · MD 170,400 · R56 165,786 · NV 148,208 · RoN
// 166,073 · OWB 51,793. On vanilla that is 70 sea provinces' worth of surface: an island is 1.4% of it, an
// archipelago 7%, 25 provinces 36% — while the slider's own MINIMUM of 5% is 2.24× a continent and its
// default 15.7×.
//
// 🚨 AND A PROVINCE COUNT CANNOT SUBSTITUTE FOR THE AREA: vanilla's smallest continent holds 484 LAND
// provinces but only 70 SEA provinces' worth of surface, so a gate at "484" would wave the slider straight
// through. Pixels are the honest unit.
//
// Run: node test-generate-land-cannot-rebuild-an-inherited-world.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const ok = (label, cond, detail) => {
  checks++;
  if (cond === true) { console.log("  ok   " + label); return; }
  fails.push(label);
  console.log("  FAIL " + label + (detail === undefined ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
};

const tmps = [];
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genclaim-home-")); tmps.push(HOME);
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = path.join(HOME, "appdata");
process.env.APPDATA = path.join(HOME, "roaming");
process.env.XDG_CONFIG_HOME = path.join(HOME, "xdg");
for (const d of [process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });

const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genclaim-" + tag + "-")); tmps.push(d); return d; };
const listTxt = (d) => { try { return fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return []; } };
const files = (d, rel, out) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) files(p, rel + f + "/", out); else out.push(rel + f); } return out; };

// ── THE FIXTURE ─────────────────────────────────────────────────────────────────────────────────────
// A base "game" whose ocean provinces are wider than its land provinces, as every real map's are. Two
// continents so there IS a smallest one, and the sea in one strategic region so every sea province is
// eligible. Every number this test asserts is derived from this table, never typed in below.
// ⭐ The sea provinces are FOUR TIMES the width of the land provinces, because that is what every shipping
// map looks like: vanilla's mean sea province is 2,372 px against a land province's 399, and OWB's is 36×.
// A fixture whose ocean provinces were the smaller ones would test the opposite of the bug.
const H = 4, LAND_W = 2, SEA_W = 8;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const PROVS = []
  .concat(range(1, 28).map((id) => ({ id, type: "land", continent: 1, cols: LAND_W })))    // smallisle
  .concat(range(29, 68).map((id) => ({ id, type: "land", continent: 2, cols: LAND_W })))   // mainland
  .concat(range(100, 111).map((id) => ({ id, type: "sea", continent: 0, cols: SEA_W })));
for (const p of PROVS) p.rgb = [p.id, 7, 3];

const W = PROVS.reduce((a, p) => a + p.cols, 0);
const AREA = new Map(PROVS.map((p) => [p.id, p.cols * H]));
const CONT_PX = new Map();
for (const p of PROVS) if (p.type === "land") CONT_PX.set(p.continent, (CONT_PX.get(p.continent) || 0) + AREA.get(p.id));
const SEA = PROVS.filter((p) => p.type === "sea");
const MEAN_SEA = SEA.reduce((a, p) => a + AREA.get(p.id), 0) / SEA.length;
const SMALLEST_PX = Math.min(...CONT_PX.values());
const SMALLEST_IDX = [...CONT_PX.entries()].sort((a, b) => a[1] - b[1])[0][0];
const CONT_NAMES = ["smallisle", "mainland"];
const ALLOWANCE = Math.floor(SMALLEST_PX / MEAN_SEA);

/** A 24-bit provinces.bmp: one vertical stripe per province, in the colours the definition rows use. */
function bmp24() {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + imageSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(imageSize, 34);
  const colAtX = [];
  for (const p of PROVS) for (let i = 0; i < p.cols; i++) colAtX.push(p.rgb);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = colAtX[x]; b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; } }
  return b;
}
// CRLF, as all five installed workshop maps ship it (vanilla's is LF — detect, never assume).
const DEF = ["0;0;0;0;land;false;unknown;0"]
  .concat(PROVS.map((p) => [p.id, p.rgb[0], p.rgb[1], p.rgb[2], p.type, "false", p.type === "sea" ? "ocean" : "plains", p.continent].join(";")))
  .join("\r\n") + "\r\n";
const REGION = 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ' + PROVS.map((p) => p.id).join(" ") + " }\n\tweather={}\n}\n";
const STATE = (id, provs) => "state = {\n\tid = " + id + '\n\tname = "STATE_' + id + '"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ' + provs + " }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n";

function makeBase() {
  const g = tmp("base");
  mk(path.join(g, "map", "definition.csv"), DEF);
  fs.writeFileSync(path.join(g, "map", "provinces.bmp"), bmp24());
  mk(path.join(g, "map", "continent.txt"), "continents = {\n\t" + CONT_NAMES.join("\n\t") + "\n}\n");
  mk(path.join(g, "map", "strategicregions", "r.txt"), REGION);
  const land = PROVS.filter((p) => p.type === "land").map((p) => p.id);
  mk(path.join(g, "history", "states", "1.txt"), STATE(1, land.slice(0, 28).join(" ")));
  mk(path.join(g, "history", "states", "2.txt"), STATE(2, land.slice(28).join(" ")));
  return g;
}
/** A mod over that base. own:true gives it its own copy of the world's bitmap — what the refusal asks for. */
function makeMod(tag, { descriptor, own = false } = {}) {
  const d = tmp(tag);
  mk(path.join(d, "descriptor.mod"), descriptor || ('version="1"\nname="' + tag + '"\nsupported_version="*"\npath="mod/' + tag + '"\n'));
  if (own) { fs.mkdirSync(path.join(d, "map"), { recursive: true }); fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24()); }
  return d;
}

const BASE = makeBase();
console.log("\nfixture: " + W + "x" + H + " world, " + SEA.length + " sea provinces of " + MEAN_SEA + " px each, smallest continent "
  + CONT_NAMES[SMALLEST_IDX - 1] + " = " + SMALLEST_PX + " px  ->  allowance " + ALLOWANCE + " province(s)");

console.log("\n=== 1. 📏 THE MEASUREMENT: what the gate reads off an inherited world ===");
{
  const m = makeMod("measure");
  const c = md.generatedLandClaim({ modRoot: m, gameRoot: BASE, dependencyRoots: [], adding: 1 });
  ok("it measured, and says the world's shapes are not the mod's", c.measured === true && c.ownWorld === false, c);
  ok("…and names the inherited bitmap they come from", c.inheritedProvincesBmp === path.join(BASE, "map", "provinces.bmp"), c.inheritedProvincesBmp);
  ok("⭐ a sea province's mean AREA, not its count", c.meanSeaPx === MEAN_SEA, { got: c.meanSeaPx, want: MEAN_SEA });
  const LAND = PROVS.filter((p) => p.type === "land");
  ok("⭐ …and a land province's, which is smaller — the whole reason a count misleads",
    c.meanLandPx === LAND.reduce((a, p) => a + AREA.get(p.id), 0) / LAND.length && c.meanLandPx < c.meanSeaPx,
    { land: c.meanLandPx, sea: c.meanSeaPx });
  ok("⭐⭐ the threshold is this map's SMALLEST continent, by area", c.smallestContinentPx === SMALLEST_PX, { got: c.smallestContinentPx, want: SMALLEST_PX });
  ok("…named out of the map/continent.txt that loads, not by index", c.smallestContinent === CONT_NAMES[SMALLEST_IDX - 1], c.smallestContinent);
  ok("…and the allowance is how many ocean provinces fit inside it", c.allowance === ALLOWANCE, { got: c.allowance, want: ALLOWANCE });
  ok("…with nothing taken out of the ocean yet", c.alreadyPx === 0 && c.seaProvinces === SEA.length, c);
}

console.log("\n=== 2. ⭐ THE CONTROL THAT MUST KEEP WORKING: a few provinces on an inherited map ===");
let small = null;
{
  const m = makeMod("afew");
  const few = Math.max(1, Math.floor(ALLOWANCE / 2));
  // #generate-land-fills-the-seas-it-cuts-off — this fixture's ocean is one row of provinces, so any land grown in its middle cuts
  // the row in two and the smaller piece off from the ocean. What becomes of that piece is section 2b's; here the count is the gate's.
  const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: few, seed: 3, fillCutOffSeas: false });
  small = r;
  ok("a small Generate land on a world the mod does not own still RUNS", r.changed === true, r.error);
  ok("…and really flipped them", r.flippedProvinces === few && r.createdStates >= 1, r);
  ok("…and wrote the definition.csv the mod now owns", (() => {
    const txt = fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8");
    return txt.split(/\r?\n/).filter((l) => { const c = l.split(";"); return /^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land"; }).length
      === PROVS.filter((p) => p.type === "land").length + few;
  })());
  ok("…and the state files to go with them", listTxt(path.join(m, "history", "states")).length === r.createdStates, listTxt(path.join(m, "history", "states")));
}
{
  // ⭐ THE BOUNDARY IS NOT OFF BY ONE IN THE REFUSING DIRECTION: exactly the allowance still runs.
  const m = makeMod("exactly");
  // the fill off, as above: at exactly the allowance any sea the run cuts off takes it past, and that click is refused for them (2b)
  const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: ALLOWANCE, seed: 4, fillCutOffSeas: false });
  ok("⭐ EXACTLY the allowance is allowed — the gate refuses more, not as much", r.changed === true, r.error);
}

console.log("\n=== 2b. ⭐ THE SEAS A RUN CUTS OFF ARE CHARGED AGAINST THE SAME ALLOWANCE ===");
{
  // #generate-land-fills-the-seas-it-cuts-off — Generate land makes land of the seas its new land cuts off from the ocean. On a world
  // the mod does not own that is land taken out of the inherited ocean like any other, so it is charged at the same rate: fills
  // that fit the allowance are made, and a run whose fills would take it past is REFUSED, writing nothing. Leaving them sea only
  // handed them to Auto-fix, whose repair has no allowance and filled them past it (review R-A8-2: seed 11, 96 -> 256 px of a
  // smallest continent of 224), so the page's "they stayed sea" protected nothing.
  // Expected from the fixture: the ocean is one row (each sea province touches only the ids beside it; the row's ends meet land,
  // the east one across the seam), so what a run cuts off is every unpicked stretch of the row but the longest — unless the one
  // strategic region is at least half water. The picks are read off a twin run of the same seed with the fill off.
  const ROW = SEA.map((p) => p.id);
  const landIn = (m) => new Set(fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c[4] === "land").map((c) => +c[0]));
  const step = Math.max(1, Math.floor(ALLOWANCE / 2));
  const cases = [3, 11].map((seed) => {
    const probe = makeMod("cutprobe" + seed);
    md.generateLand({ modRoot: probe, gameRoot: BASE, dependencyRoots: [], count: step, seed, fillCutOffSeas: false });
    const picked = ROW.filter((id) => landIn(probe).has(id));
    const runs = []; let cur = [];
    for (const id of ROW) { if (picked.includes(id)) { if (cur.length) runs.push(cur); cur = []; } else cur.push(id); }
    if (cur.length) runs.push(cur);
    runs.sort((a, b) => b.length - a.length);
    const halfWater = 2 * (ROW.length - picked.length) >= PROVS.length;
    const cut = halfWater ? [] : runs.slice(1).flat();
    const m = makeMod("cut" + seed);
    const before = files(m, "", []).sort().join(",");
    // #generate-land-leaves-no-sea-cut-off — the join off: on this one-row ocean every cut-off stretch is longer than the picks walling
    // it off, so the join would keep them all open and charge nothing; what a FILL is charged is this section's question
    const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: step, seed, joinCutOffSeas: false });
    return { seed, picked, cut, tie: runs.length > 1 && runs[0].length === runs[1].length, fits: (picked.length + cut.length) * MEAN_SEA <= SMALLEST_PX, m, r, before };
  });
  const fit = cases.find((c) => c.fits && c.cut.length), over = cases.find((c) => !c.fits && c.cut.length);
  ok("THE CONTROL: one run's cut-off seas fit the allowance and another's do not, and no run leaves two equal stretches",
    !!fit && !!over && cases.every((c) => !c.tie && c.picked.length === step), cases.map((c) => ({ seed: c.seed, picked: c.picked, cut: c.cut, fits: c.fits })));
  if (fit) {
    const is = fit.r.inlandSeas || {};
    ok("⭐⭐ the seas a run cuts off within the allowance become land with it",
      fit.r.changed === true && is.filled === fit.cut.length && fit.cut.every((id) => landIn(fit.m).has(id)) && fit.r.flippedProvinces === step + fit.cut.length,
      { flipped: fit.r.flippedProvinces, seas: is, cut: fit.cut });
    const c = md.generatedLandClaim({ modRoot: fit.m, gameRoot: BASE, dependencyRoots: [], adding: 1 });
    ok("…and the mod is charged for them as for the rest", c.alreadyPx === (step + fit.cut.length) * MEAN_SEA, { alreadyPx: c.alreadyPx, want: (step + fit.cut.length) * MEAN_SEA });
  }
  if (over) {
    const is = over.r.inlandSeas || {};
    ok("⭐⭐⭐ a run whose cut-off seas would take it past the allowance is REFUSED, as a run past it is",
      over.r.changed === false && over.r.refusedRebuildsInheritedWorld === true && is.overAllowance === over.cut.length,
      { changed: over.r.changed, refused: over.r.refusedRebuildsInheritedWorld, seas: is, cut: over.cut });
    ok("⛔ …and NOTHING was written", files(over.m, "", []).sort().join(",") === over.before, { before: over.before, after: files(over.m, "", []).sort().join(",") });
    const e = String(over.r.error || "");
    ok("⭐⭐ …and the refusal says how many seas the land would cut off, and what to ask for instead",
      e.includes(over.cut.length.toLocaleString() + " sea province") && /fewer provinces/.test(e) && /another seed/.test(e), e);
    const rep = md.fixInlandSeas({ modRoot: over.m, gameRoot: BASE, dependencyRoots: [] });
    const c = md.generatedLandClaim({ modRoot: over.m, gameRoot: BASE, dependencyRoots: [], adding: 1 });
    ok("⭐⭐⭐ …so the Auto-fix repair after it has nothing to fill past the allowance, and the mod is charged nothing",
      !rep.error && rep.fixed === 0 && c.alreadyPx === 0, { repair: rep, alreadyPx: c.alreadyPx });
  }
}

console.log("\n=== 3. ⛔ THE REFUSAL: one province past the allowance is a claim, not an edit ===");
let refused = null;
{
  const m = makeMod("overby1");
  const before = files(m, "", []).sort().join(",");
  const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: ALLOWANCE + 1, seed: 5 });
  refused = r;
  ok("it is refused", r.changed === false, r);
  ok("…as a machine-readable reason, not only prose", r.refusedRebuildsInheritedWorld === true && r.claim && r.claim.over === true, r.claim);
  ok("⛔ …and NOTHING was written: no map/ folder, no state file, no heightmap",
    files(m, "", []).sort().join(",") === before, { before, after: files(m, "", []).sort().join(",") });
  ok("⛔ …and the base root it read from is untouched",
    fs.existsSync(path.join(BASE, "map", "provinces.bmp")) && listTxt(path.join(BASE, "history", "states")).length === 2);
}
{
  const r = md.generateLand({ modRoot: makeMod("wholeocean"), gameRoot: BASE, dependencyRoots: [], count: SEA.length, seed: 6 });
  ok("the whole ocean — what the owner's 35% amounted to — is refused too", r.changed === false && r.refusedRebuildsInheritedWorld === true, r);
  const e = String(r.error || "");
  ok("⭐ the sentence names the inherited file the shapes come from", e.indexOf(path.join(BASE, "map", "provinces.bmp")) !== -1, e);
  ok("⭐ …says a sea province is bigger than a land province, in pixels, off this map",
    e.indexOf(String(Math.round(MEAN_SEA))) !== -1 && e.indexOf("averages") !== -1, e);
  ok("⭐ …names the smallest continent it would exceed, and its size", e.indexOf(CONT_NAMES[SMALLEST_IDX - 1]) !== -1 && e.indexOf(SMALLEST_PX.toLocaleString()) !== -1, e);
  ok("⭐⭐ …and says how much it CAN do here, so the refusal is actionable",
    e.indexOf("Generate up to " + ALLOWANCE + " province") !== -1, e);
  ok("…and what to do to lift the limit, as the Delete map refusal does",
    /provinces\.bmp into your mod's map\/ folder/.test(e) && /paint anything on the map/.test(e), e);
}

console.log("\n=== 4. ⚠️ THE CONTROLS: what must NOT be gated ===");
{
  const m = makeMod("owns", { own: true });
  const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: SEA.length, seed: 7 });
  ok("⚠️ a mod that OWNS provinces.bmp may retype the whole ocean — one bitmap is the entire difference",
    r.changed === true && r.flippedProvinces === SEA.length, r.error);
  ok("…and the claim says so without measuring anything", md.generatedLandClaim({ modRoot: m, gameRoot: BASE, dependencyRoots: [], adding: SEA.length }).ownWorld === true);
}
{
  const m = makeMod("tcmap", { descriptor: 'name="TC"\nreplace_path="map"\n' });
  mk(path.join(m, "map", "definition.csv"), DEF);
  mk(path.join(m, "map", "strategicregions", "r.txt"), REGION);
  const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: SEA.length, seed: 8 });
  ok('⚠️ a total conversion whose replace_path="map" hides the base bitmap is not gated — it inherits no world', r.changed === true, r.error);
}
{
  const empty = tmp("nobase");
  const r = md.generateLand({ modRoot: makeMod("nobitmapanywhere"), gameRoot: empty, dependencyRoots: [] });
  ok("⚠️ a mod with no provinces.bmp ANYWHERE below it is not gated — nothing is being taken", r.changed === false && !r.refusedRebuildsInheritedWorld, r);
}
{
  // A DEPENDENCY's bitmap is just as much someone else's file as the base game's.
  const dep = makeMod("dep", { own: true });
  mk(path.join(dep, "map", "definition.csv"), DEF);
  mk(path.join(dep, "map", "continent.txt"), "continents = {\n\t" + CONT_NAMES.join("\n\t") + "\n}\n");
  const r = md.generateLand({ modRoot: makeMod("addon"), gameRoot: BASE, dependencyRoots: [dep], count: SEA.length, seed: 9 });
  ok("⭐ an add-on is gated over its DEPENDENCY's bitmap, not only over the base game's",
    r.changed === false && String(r.error).indexOf(path.join(dep, "map", "provinces.bmp")) !== -1, r.error);
}

console.log("\n=== 5. ⭐⭐ THE RATCHET: land already taken out of that ocean counts against the same allowance ===");
{
  const m = makeMod("ratchet");
  const step = Math.max(1, Math.floor(ALLOWANCE / 2));
  // #generate-land-fills-the-seas-it-cuts-off — the fill off, as in section 2: what the seas a run cuts off are charged is 2b's
  const first = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: step, seed: 11, fillCutOffSeas: false });
  ok("the first small run goes through", first.changed === true, first.error);
  const c = md.generatedLandClaim({ modRoot: m, gameRoot: BASE, dependencyRoots: [], adding: step });
  ok("…and the mod is now charged for what it took", c.alreadyPx === step * MEAN_SEA, { alreadyPx: c.alreadyPx, want: step * MEAN_SEA });
  ok("⭐⭐ …while the THRESHOLD has not grown — the generated land is kept out of the continent areas",
    c.smallestContinentPx === SMALLEST_PX, { got: c.smallestContinentPx, want: SMALLEST_PX });
  ok("…so the allowance left is what remains of that continent", c.allowance === Math.floor((SMALLEST_PX - step * MEAN_SEA) / MEAN_SEA), c.allowance);
  let runs = 1;
  for (let i = 0; i < 20; i++) { const r = md.generateLand({ modRoot: m, gameRoot: BASE, dependencyRoots: [], count: step, seed: 12 + i }); if (!r.changed) break; runs++; }
  ok("⭐⭐ repeating a small run cannot rebuild the world one step at a time", runs * step <= ALLOWANCE + step, { runs, step, allowance: ALLOWANCE });
}

console.log("\n=== 6. ⛔ THE GATE IS AHEAD OF EVERY WRITE, IN SOURCE ===");
{
  const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const at = SRC.indexOf("function generateLand(");
  ok("generateLand was found", at !== -1);
  const body = SRC.slice(at, SRC.indexOf("function blankMapToSea(", at) === -1 ? at + 20000 : SRC.indexOf("\nfunction ", at + 10));
  const gate = body.indexOf("generatedLandClaim(");
  const write = body.indexOf("safeModWrite(");
  const mkdir = body.indexOf("mkdirSync(");
  ok("⛔ the claim is consulted before the first safeModWrite", gate !== -1 && write !== -1 && gate < write, { gate, write });
  ok("⛔ …and before the first mkdirSync, so a refusal leaves no map/ folder behind", gate !== -1 && mkdir !== -1 && gate < mkdir, { gate, mkdir });
  // Items A and B are rewriting the selection and the terrain paint inside this same function; the gate must
  // not live among them. "Before the definition.csv is even read" is the property that keeps it out of reach.
  ok("⭐ …and before the definition.csv is read at all — nothing below it can skip the gate",
    gate !== -1 && gate < body.indexOf("readFileSync(srcCsv"), { gate, read: body.indexOf("readFileSync(srcCsv") });
  ok("both halves are exported so a test can run them without a fixture on disk",
    typeof md.generatedLandClaim === "function" && typeof md.generatedLandRefusal === "function");
}

console.log("\n=== 7. 🖥 THE PAGE: the allowed band must be reachable, and the shapes said out loud ===");
{
  const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const JS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  // DERIVED FROM BOTH SOURCES, never typed: the slider's floor and the handler's clamp are one number in two
  // files, and a drift between them silently changes what a modder can ask for.
  const slider = /<input id="mapGenPct"[^>]*\bmin="(\d+)"/.exec(HTML);
  const clamp = /const pct = Math\.max\((\d+), Math\.min\(90, parseInt\(\(\$\("mapGenPct"\)/.exec(JS);
  ok("the slider declares a floor and the handler clamps to one", !!slider && !!clamp, { slider: slider && slider[1], clamp: clamp && clamp[1] });
  ok("⭐ …and they are the same number", !!slider && !!clamp && slider[1] === clamp[1], { slider: slider && slider[1], clamp: clamp && clamp[1] });
  // 5% of vanilla's 3,133 sea provinces is 157 — more than twice a continent — so at the old floor the dialog
  // could not reach its own permitted band at all. Measured: the allowance there is 70, i.e. 2.23% of the ocean.
  ok("⭐⭐ …and it is low enough to reach an allowance of a couple of percent of the ocean",
    !!slider && parseInt(slider[1], 10) <= 2, slider && slider[1]);
  ok("the dialog has somewhere to say whose shapes the new land will wear", /id="mapGenShapes"/.test(HTML));
  // ⭐⭐ RUN IT. A source assertion over a toggled style is not a back-out control: commenting the toggle out
  // left every such check green. Lifted and executed exactly as the Delete map test does with blankRefusalBody.
  const RAW = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const fnSrc = (() => {
    const at = RAW.indexOf("function genShapesBody(");
    if (at === -1) return "";
    let d = 0;
    for (let i = RAW.indexOf("{", at); i < RAW.length; i++) {
      if (RAW[i] === "{") d++;
      else if (RAW[i] === "}") { d--; if (d === 0) return RAW.slice(at, i + 1); }
    }
    return "";
  })();
  ok("genShapesBody was lifted out of public/map.js", !!fnSrc);
  const build = fnSrc ? new Function(fnSrc + "\nreturn genShapesBody;")() : null;
  if (build) {
    const html = build({ provincesBmpFromMod: false, inheritedProvincesBmp: "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\map\\provinces.bmp" });
    ok("⭐ RUN: it says the mod owns no provinces.bmp", /no <code>map\/provinces\.bmp<\/code> of its own/.test(html), html.slice(0, 200));
    ok("⭐ RUN: …names the inherited file the shapes come from", html.indexOf("Hearts of Iron IV") !== -1, html.slice(0, 400));
    ok("⭐ RUN: …says the new land keeps the OCEAN'S shapes, which is what the owner saw",
      /shapes the <b>ocean<\/b> provinces had/.test(html), html.slice(0, 600));
    ok("⭐ RUN: …says Nova will still run it, and where it stops", /Nova will run this/.test(html) && /smallest continent/.test(html), html);
    ok("⭐ RUN: …and how to lift that, as the Delete map refusal does", /copy that <code>provinces\.bmp<\/code>/.test(html), html.slice(-400));
    ok("⚠️ RUN, THE CONTROL: a mod that owns its bitmap is told nothing at all",
      build({ provincesBmpFromMod: true, inheritedProvincesBmp: "" }) === "");
    ok("⚠️ RUN, THE CONTROL: a model that has not answered yet is not warned either", build({}) === "" && build(null) === "");
  }
  ok("⭐ …and it reads the SAME model fields the Delete map refusal reads, so the two cannot disagree",
    /provincesBmpFromMod === false \? String\(m\.inheritedProvincesBmp/.test(JS));
  // The builder above is RUN; this one line, which connects it to the click, can only be read. Pinned as the
  // WHOLE statement rather than a fragment of it, because `if (false && shapes)` satisfies any fragment.
  ok("⛔ …and the click fills the box from it, unconditionally — the toggle is not a decoration",
    /genShapesBody\(model\)/.test(JS)
    && /if \(shapes\) \{ shapes\.innerHTML = shapesHtml; shapes\.style\.display = shapesHtml \? "block" : "none"; \}/.test(JS));
  ok("…and it is wired with addEventListener, never an inline handler (CSP: script-src 'self')",
    !/onclick=|onerror=/.test(HTML.slice(HTML.indexOf('id="mapGenConfirm"'), HTML.indexOf('id="mapGenConfirm"') + 3000)));
  const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const ep = SERVER.indexOf('app.post("/api/map/generate-land"');
  // ⚠️ The window is the ROUTE, not a byte count. It was `ep + 900`, which passed only while this handler
  // stayed short: adding the populated-map gate above the call (#generate-land-is-gated-only-in-the-browser)
  // pushed the clause to 3,955 chars and failed a check whose subject had not changed at all. A window
  // measured in characters decays every time the thing it looks at grows.
  const epEnd = (() => {
    if (ep === -1) return 0;
    const next = SERVER.indexOf("\n  app.", ep + 10);
    return next === -1 ? SERVER.length : next;
  })();
  ok("…and the endpoint turns a refusal into a 400 the page reports, not a silent success",
    ep !== -1 && /!result\.changed && result\.error[\s\S]{0,120}status\(400\)/.test(SERVER.slice(ep, epEnd)));
}

console.log("\n=== 8. 🈯 THE CORPUS: this gate fires on no shipping map, because each one owns its world ===");
{
  // Derived from what is installed, never typed in. A map that owns its provinces.bmp is never measured at
  // all, so no rule can be gained by any of them — the cry-wolf check for this change.
  let roots = [];
  try { roots = fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => fs.statSync(d).isDirectory()); } catch (_) { roots = []; }
  if (fs.existsSync(path.join(GAME, "map", "definition.csv"))) roots.unshift(GAME);
  const maps = roots.filter((r) => fs.existsSync(path.join(r, "map", "definition.csv")));
  if (!maps.length) console.log("     (no installed maps here — the corpus half cannot run)");
  else {
    const gated = maps.filter((r) => md.generatedLandClaim({ modRoot: r, gameRoot: GAME, dependencyRoots: [], adding: 100000 }).over);
    console.log("     " + maps.length + " installed map root(s) asked as if each were the mod being edited");
    ok("⭐⭐ not one shipping map is gated, at any size — every one of them owns its own provinces.bmp",
      gated.length === 0, gated.map((d) => path.basename(d)));
  }
}

for (const d of tmps) { /* scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1) */ try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
