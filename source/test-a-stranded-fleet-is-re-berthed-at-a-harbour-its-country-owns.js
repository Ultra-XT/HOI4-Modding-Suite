// #a-fleet-berthed-where-the-map-took-the-land-away — THE REPAIR.
//
// ⭐⭐⭐ WHAT ACTUALLY CRASHES, established 2026-09-24 by workflow wf_bd965dd5-59d (five investigators, a synthesis,
// three skeptics, none refuted). Every one of the eleven crashes at PHYSFS_swapULE64 +12011578 holds the province
// being dereferenced in [rbx+0xA4]: 6332 (Germany's Ostseeflotte, Königsberg) in all ten layer-1 launches, and 9340
// (Latvia's squadron, Riga) in the owner's TEST 21. Both are LAND WITH NO SEA NEIGHBOUR. The naval-region getter
// tests the location's land bit; for a sea province it returns the province's own region and never looks anything
// up — which is why Germany's Hochseeflotte, berthed AT SEA on 241, loaded fine immediately before every crash.
// For land it looks up the port's sea zone, finds none, and reads [null+0xC8].
//
// So a fleet at sea is untidy; a fleet on land with no sea beside it is fatal. This test pins both halves.
//
// ⚠️⚠️ AND THIS FILE ONCE CERTIFIED A CRASH. Its first fixture put the destination harbours at provinces 1 and 8,
// in a world whose land was rows 0–1 — so row 0 was ringed by land and both "harbours" were inland. The fixer
// re-berthed a fleet into 8, the test said "fixed", and it passed because the validator only flags a berth that
// was coastal in the layer below (8 was inland there too). That is the exact shape that killed TEST 21. The fixer
// now refuses any destination that does not touch sea, and this geometry has a real coastline.
//
// THE FIXTURE (8x8 provinces of 32px, ids 1..64 by row; row r holds 8r+1 .. 8r+8):
//     base game  land = rows 0–5 (1..48)          mod  land = rows 0–2 (1..24), so row 2 (17..24) is the COAST
//
// The stranded fleet sits at 40 (row 4, col 7), which the mod turned to sea. Its own country ZZZ owns harbours at
// 17 and 23, listed with 17 FIRST; AAA owns a harbour at 24.
//
//     40 -> 24   0 cols, 2 rows   =  64px   NEAREST — but it is AAA's
//     40 -> 23   1 col,  2 rows   ≈  72px   ZZZ's nearest: THE ANSWER
//     40 -> 17   7 cols, 2 rows   ≈ 233px   ZZZ's, listed first, furthest — what a NaN distance picks
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-berth-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-berth-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// ── the fixture map ──────────────────────────────────────────────────────────────────────────────────
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
const definition = (isLand) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) {
    const [r, g, b] = COL(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("")
  + `\t\t}\n\t}\n}\n`;

// ZZZ's navy, CRLF on purpose — the mix is real and per-file. 31.3% of vanilla's 6,104 berth lines carry a
// trailing comment naming the province, so one is here: swapping the number under it must not leave a lie.
const ZZZ_OOB = [
  'units = {',
  '\tfleet = {',
  '\t\tname = "Z Fleet"',
  '\t\tnaval_base = 40 # Old Harbour',
  '\t\ttask_force = {',
  '\t\t\tname = "Z TF"',
  '\t\t\tlocation = 40 # Old Harbour',
  '\t\t\tship = { name = "S1" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = ZZZ } } }',
  '\t\t}',
  '\t}',
  '}',
  '',
].join("\r\n");
// BBB owns land (inland, at 9) but NO harbour — nowhere honest to put this one, and it is AT SEA, so not fatal.
const BBB_OOB = [
  'units = {',
  '\tfleet = {',
  '\t\tname = "B Fleet"',
  '\t\tnaval_base = 41',
  '\t\ttask_force = { name = "B TF" location = 41 ship = { name = "S2" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = BBB } } } }',
  '\t}',
  '}',
  '',
].join("\n");

function writeGame(g) {
  mk(g, "map/provinces.bmp", BMP);
  mk(g, "map/definition.csv", definition((p) => p <= 48));      // rows 0-5 are land below
  mk(g, "history/states/1.txt", state(1, [17, 23], "ZZZ", [17, 23]));
  mk(g, "history/states/2.txt", state(2, [24], "AAA", [24]));
  mk(g, "history/states/3.txt", state(3, [9], "BBB", []));
  for (const tag of ["ZZZ", "AAA", "BBB"]) mk(g, `history/countries/${tag} - ${tag}land.txt`, `capital = 1\noob = "${tag}_1936_naval"\n`);
  mk(g, "history/units/ZZZ_1936_naval.txt", ZZZ_OOB);
  mk(g, "history/units/BBB_1936_naval.txt", BBB_OOB);
  mk(g, "history/units/AAA_1936_naval.txt", 'units = {\n\tfleet = { name = "A Fleet" naval_base = 24 task_force = { name = "A TF" location = 24 } }\n}\n');
}
function writeMod(m) {
  mk(m, "descriptor.mod", 'name="berth fixture"\n');
  mk(m, "map/definition.csv", definition((p) => p <= 24));      // rows 0-2 land: row 2 is the coast
}

const GAME = tmp("game"); writeGame(GAME);
const MOD = tmp("mod"); writeMod(MOD);
const ctx = (modRoot, gameRoot = GAME) => ({ modRoot, gameRoot, dependencyRoots: [] });
const read = (root, f) => fs.readFileSync(path.join(root, "history", "units", f), "utf8");
const nums = (s, key) => (s.match(new RegExp(key + "\\s*=\\s*(\\d+)", "g")) || []).map((x) => Number(x.replace(/\D/g, "")));

// ── 0. the geometry really has a coast where the test says it does ───────────────────────────────────
console.log("=== THE CONTROL: the coast is where the fixture says ===");
{
  const model = md.buildMapModel(ctx(MOD));
  const coast = md.landProvincesTouchingSea({ ...ctx(MOD), model });
  rec("THE CONTROL: row 2 (17..24) touches sea, and row 0 does not",
    [17, 23, 24].every((p) => coast.has(p)) && ![1, 8, 9].some((p) => coast.has(p)),
    { coastal: [17, 23, 24, 1, 8, 9].map((p) => p + ":" + coast.has(p)) });
}

// ── 1. what the finder sees ──────────────────────────────────────────────────────────────────────────
console.log("\n=== what can honestly be re-berthed ===");
const found = md.strandedFleetBerths(ctx(MOD));
rec("THE CONTROL: both fleets are stranded by the mod's own map",
  found.stranded.length === 2, found.stranded.map((u) => `${u.tag}@${u.province}`));
rec("⭐⭐ ZZZ's can move (its country owns a real harbour); BBB's cannot (it owns land, no harbour)",
  found.movable.length === 1 && found.movable[0].tag === "ZZZ" && found.noHarbour.length === 1 && found.noHarbour[0].tag === "BBB",
  { movable: found.movable.map((u) => u.tag), noHarbour: found.noHarbour.map((u) => u.tag) });
rec("THE CONTROL: ZZZ's harbours are listed with the FURTHEST first, so a fixer that never measures picks 17",
  JSON.stringify(found.byTag.get("ZZZ")) === JSON.stringify([17, 23]), found.byTag.get("ZZZ"));
rec("⭐⭐ both stranded fleets are AT SEA, so neither is marked fatal",
  found.stranded.every((u) => u.fatal === false), found.stranded.map((u) => `${u.tag}:${u.fatal}`));

// ── 2. the repair ────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the repair ===");
const r = md.fixDrownedFleetBerths(ctx(MOD));
rec("⭐⭐ it moves the one task force it can, and the fleet's home base with it",
  r.moved === 1 && r.rebased === 1 && (r.files || []).join() === "ZZZ_1936_naval.txt", r);
rec("⭐⭐ …counts the one it could not re-berth — and knows it is at sea, so NOT fatal",
  r.noHarbour === 1 && r.noHarbourFatal === 0, { noHarbour: r.noHarbour, noHarbourFatal: r.noHarbourFatal });
rec("⭐⭐ …by copying the base game's file in, and it names it", (r.materialised || []).join() === "ZZZ_1936_naval.txt", r.materialised);

const zz = read(MOD, "ZZZ_1936_naval.txt");
const got = nums(zz, "location")[0];
rec("⭐⭐⭐ THE ASSERTION: the task force lands on 23 — its own country's NEAREST harbour",
  got === 23,
  { got, meaning: got === 17 ? "picked the FIRST listed: the distance never worked (the .y/.z bug)" : got === 24 ? "picked AAA's harbour: ownership was never checked" : "?" });
rec("⭐⭐⭐ …NOT 24, which is nearer but belongs to another country", got !== 24, got);
rec("⭐⭐⭐ …NOT 17, its own but furthest — the NaN-distance fallback", got !== 17, got);
rec("⭐⭐⭐ the fleet's naval_base moved too — a home base left on the broken province is still broken",
  nums(zz, "naval_base")[0] === 23, nums(zz, "naval_base"));

// ── 3. NOTHING IS DELETED, NOTHING IS INVENTED ───────────────────────────────────────────────────────
console.log("\n=== move only ===");
rec("⭐⭐⭐ the ship is still there — no fleet is ever removed", /name = "S1"/.test(zz) && /fleet = \{/.test(zz), null);
rec("⭐⭐⭐ BBB's fleet is untouched and its file is NOT copied in",
  !fs.existsSync(path.join(MOD, "history", "units", "BBB_1936_naval.txt")), null);
rec("⭐⭐⭐ no naval_base was invented anywhere in the mod's states", !fs.existsSync(path.join(MOD, "history", "states")), null);
rec("⭐⭐ the base game's own copy is unchanged", fs.readFileSync(path.join(GAME, "history", "units", "ZZZ_1936_naval.txt"), "utf8") === ZZZ_OOB, null);

// ── 4. splice, line endings, and an honest comment ───────────────────────────────────────────────────
console.log("\n=== splice, not rebuild ===");
rec("⭐⭐⭐ the file changed", zz !== ZZZ_OOB, null);
const endings = (s) => { let crlf = 0, lf = 0; for (let i = 0; i < s.length; i++) if (s[i] === "\n") { if (s[i - 1] === "\r") crlf++; else lf++; } return { crlf, lf }; };
rec("⭐⭐⭐ the CRLF file stays ALL CRLF — no pocket of LF",
  endings(zz).crlf === endings(ZZZ_OOB).crlf && endings(zz).lf === 0, { got: endings(zz), want: endings(ZZZ_OOB) });
rec("⭐⭐⭐ no stray carriage return mid-line", !/\r(?!\n)/.test(zz), (zz.match(/\r(?!\n)/g) || []).length);
// #comments-are-content — the line said "# Old Harbour" about province 40. Leaving that beside a 23 is a lie.
rec("⭐⭐⭐ the trailing comment is made HONEST, and the original text is kept",
  /location = 23\s+# Nova: moved from 40\s+# Old Harbour/.test(zz) && /naval_base = 23\s+# Nova: moved from 40\s+# Old Harbour/.test(zz),
  zz.split(/\r?\n/).filter((l) => /Nova:/.test(l)));
rec("⭐⭐ every other line is byte-identical to the base game's",
  zz.split("\r\n").filter((l) => !/Nova:/.test(l)).join("|") === ZZZ_OOB.split("\r\n").filter((l) => !/location|naval_base/.test(l)).join("|"),
  { got: zz.split("\r\n").filter((l) => !/Nova:/.test(l)).slice(0, 4) });

// ⛔ a whole block on ONE line must never gain a `#`, or everything after it is commented out.
console.log("\n=== a one-line block keeps its code ===");
{
  const one = tmp("oneline"); writeMod(one);
  mk(one, "descriptor.mod", 'name="one line"\nreplace_path="history/states"\n');
  mk(one, "history/states/1.txt", state(1, [17, 23], "ZZZ", [17, 23]));
  mk(one, "history/states/2.txt", state(2, [24], "AAA", [24]));
  mk(one, "history/states/3.txt", state(3, [18], "BBB", [18]));   // give BBB a real harbour so this one IS movable
  mk(one, "history/units/BBB_1936_naval.txt", BBB_OOB.replace("naval_base = 41", "naval_base = 18"));
  md.fixDrownedFleetBerths(ctx(one));
  const b = read(one, "BBB_1936_naval.txt");
  rec("THE CONTROL: BBB's one-line task force really was moved", /location = 18/.test(b), b.split("\n").find((l) => /task_force/.test(l)));
  rec("⭐⭐⭐ the ship on the same line as the location is still live script, not commented out",
    /ship = \{ name = "S2"/.test(b) && !/#[^\n]*ship = \{ name = "S2"/.test(b), b.split("\n").find((l) => /task_force/.test(l)));
}

// ── 5. ⛔ AN INLAND "HARBOUR" IS NOT A HARBOUR ─────────────────────────────────────────────────────────
// The regression this file used to certify. A naval_base building is a declaration; whether the port has any sea
// to open onto is a fact of the map. A country whose only naval_base sits on land ringed by land must be left
// reported, never re-berthed into it — re-berthing there is the berth that crashes.
console.log("\n=== an inland naval_base is refused as a destination ===");
{
  const inl = tmp("inland"); writeMod(inl);
  mk(inl, "descriptor.mod", 'name="inland harbour"\nreplace_path="history/states"\n');
  mk(inl, "history/states/1.txt", state(1, [1, 8], "ZZZ", [1, 8]));   // row 0: ringed by land
  mk(inl, "history/states/2.txt", state(2, [24], "AAA", [24]));
  mk(inl, "history/states/3.txt", state(3, [9], "BBB", []));
  const f = md.strandedFleetBerths(ctx(inl));
  rec("THE CONTROL: ZZZ really does declare naval_base on 1 and 8",
    /1 = \{ naval_base = 3 \}/.test(fs.readFileSync(path.join(inl, "history", "states", "1.txt"), "utf8")), null);
  rec("⭐⭐⭐ neither counts as a harbour — ZZZ's fleet has nowhere honest to go",
    !(f.byTag.get("ZZZ") || []).length && f.noHarbour.some((u) => u.tag === "ZZZ"),
    { ZZZharbours: f.byTag.get("ZZZ"), noHarbour: f.noHarbour.map((u) => u.tag) });
  const rr = md.fixDrownedFleetBerths(ctx(inl));
  rec("⭐⭐⭐ …so it is NOT re-berthed into a province with no sea", rr.moved === 0 && !fs.existsSync(path.join(inl, "history", "units")), rr);
}

// ── 6. ⛔ A FLEET STRANDED ON INLAND LAND IS FATAL — ONE AT SEA IS NOT ─────────────────────────────────
// The Generate-land shape exactly: a port that was coastal in the base game, left inland by the mod's own land.
// Base: land rows 0–1, so row 1 (9..16) is the coast. Mod: land rows 0–2, so row 1 is now ringed by land.
console.log("\n=== a berth on land with no sea is fatal; a berth at sea is not ===");
{
  const g2 = tmp("game2"), m2 = tmp("mod2");
  mk(g2, "map/provinces.bmp", BMP);
  mk(g2, "map/definition.csv", definition((p) => p <= 16));
  mk(g2, "history/states/1.txt", state(1, [10], "CCC", []));
  mk(g2, "history/countries/CCC - CCCland.txt", 'capital = 1\noob = "CCC_1936_naval"\n');
  mk(g2, "history/units/CCC_1936_naval.txt", 'units = {\n\tfleet = { name = "C Fleet" naval_base = 10 task_force = { name = "C TF" location = 10 } }\n}\n');
  mk(m2, "descriptor.mod", 'name="landlocked port"\n');
  mk(m2, "map/definition.csv", definition((p) => p <= 24));       // row 2 becomes land: row 1 loses its sea
  const c2 = { modRoot: m2, gameRoot: g2, dependencyRoots: [] };
  const coast = md.landProvincesTouchingSea({ ...c2, model: md.buildMapModel(c2) });
  rec("THE CONTROL: province 10 is land with no sea beside it in the mod", !coast.has(10), { coastal10: coast.has(10) });
  const f = md.strandedFleetBerths(c2);
  rec("⭐⭐⭐ CCC's fleet is stranded on inland land, and is marked FATAL",
    f.stranded.length === 1 && f.stranded[0].fatal === true, f.stranded.map((u) => `${u.tag}@${u.province}:${u.fatal}`));
  // ⚓ MOVED 2026-09-24 with #a-coastless-navy-goes-to-sea. This asserted "it cannot be moved" — CCC has no coast left, so
  // no harbour — and that was the remaining crash: TEST 22 had to remove such navies by hand. A fleet AT SEA loads (Rise
  // of Nations starts Austria-Hungary's Qingdao fleet with naval_base and location on sea 5246), so it goes to the nearest
  // sea now, home base with it. The fixture makes the answer obvious: row 3 (25..32) is the first sea row, and 10 is row 1
  // col 1, so 26 — straight down two rows, 64px — is the nearest; every other sea is further.
  const rr = md.fixDrownedFleetBerths(c2);
  rec("⭐⭐⭐ …it goes to the NEAREST SEA, not left to crash: one task force moved to sea, nothing left fatal",
    rr.toSea === 1 && rr.moved === 0 && rr.noHarbourFatal === 0, { toSea: rr.toSea, moved: rr.moved, noHarbourFatal: rr.noHarbourFatal });
  const cc = fs.readFileSync(path.join(m2, "history", "units", "CCC_1936_naval.txt"), "utf8");
  rec("⭐⭐⭐ …to 26, and its home base with it", /naval_base = 26\b/.test(cc) && /location = 26\b/.test(cc), cc);
  rec("⭐⭐ …copying the file in, and saying so", (rr.materialised || []).includes("CCC_1936_naval.txt"), rr.materialised);
  rec("⭐⭐⭐ …after which the fleet is no longer stranded at all", md.strandedFleetBerths(c2).stranded.length === 0);

  // …and with NO sea anywhere there is nowhere honest to go: still reported, still fatal, nothing written.
  const m3 = tmp("mod3");
  mk(m3, "descriptor.mod", 'name="no sea at all"\n');
  mk(m3, "map/definition.csv", definition(() => true));
  const c3 = { modRoot: m3, gameRoot: g2, dependencyRoots: [] };
  const r3 = md.fixDrownedFleetBerths(c3);
  rec("⭐⭐ in a world with no sea at all it cannot be moved, and is still reported as the crash",
    r3.toSea === 0 && r3.noHarbourFatal === 1 && !fs.existsSync(path.join(m3, "history", "units")), r3);
}

// ── 7. idempotence and the back-out control ──────────────────────────────────────────────────────────
console.log("\n=== a second click writes nothing ===");
const r2 = md.fixDrownedFleetBerths(ctx(MOD));
rec("⭐⭐⭐ the second click moves 0 and leaves the bytes identical", r2.moved === 0 && r2.rebased === 0 && read(MOD, "ZZZ_1936_naval.txt") === zz, { r2 });

console.log("\n=== THE BACK-OUT CONTROL: a mod that drowns nothing ===");
{
  const dry = tmp("dry");
  mk(dry, "descriptor.mod", 'name="drowns nothing"\n');
  mk(dry, "map/definition.csv", definition((p) => p <= 48));     // the same land as below
  const rr = md.fixDrownedFleetBerths(ctx(dry));
  rec("⭐⭐⭐ nothing is moved and no order-of-battle file is created",
    rr.moved === 0 && !fs.existsSync(path.join(dry, "history", "units")), rr);
}

// ── 8. wired into the click, and the affordance matches what it can do ───────────────────────────────
console.log("\n=== wired into Auto-fix all ===");
{
  const m3 = tmp("click"); writeMod(m3);
  const fx = (md.autoFixMap(ctx(m3)) || {}).fixes || {};
  rec("⭐⭐⭐ one click runs it — the rule is no use without the button",
    ((fx.fleetBerths || {}).moved || 0) === 1 && ((fx.fleetBerths || {}).rebased || 0) === 1, fx.fleetBerths);
  rec("⭐⭐ …and it lands on 23, the same answer the direct call gives", nums(read(m3, "ZZZ_1936_naval.txt"), "location")[0] === 23, null);
  const rows = (md.validateMapBitmap(ctx(m3)) || []).filter((p) => /^fleet_starts/.test(p.rule));
  rec("⭐⭐⭐ afterwards only BBB's remains, and it offers NO button — there is nowhere honest to move it",
    rows.length === 1 && rows[0].total === 1 && rows[0].autoFix === false,
    rows.map((p) => ({ rule: p.rule, total: p.total, autoFix: p.autoFix, movable: p.movable })));
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a stranded fleet is re-berthed at a harbour its country owns: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
