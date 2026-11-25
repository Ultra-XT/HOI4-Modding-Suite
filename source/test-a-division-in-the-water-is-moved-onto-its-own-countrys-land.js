// #an-order-of-battle-under-water — THE REPAIR, for the half a mod can answer for.
//
// division_starts_on_water shipped as a report with no fixer, and its reasoning was half right. A
// history/units file replaces the same-named file below it whole, so moving a location in an INHERITED order
// of battle means adopting that country's entire army, frozen at this build of the game — measured on the
// owner's first rebuilt world, where all 180 files were the base game's. That objection stands and nothing
// here touches it.
//
// What it never separated out is the other case: a mod that ALREADY OWNS the file. There is nothing left to
// adopt, so the objection simply does not apply — and Nova's own Delete-map flow produces exactly that,
// because taking the drowned fleets out makes the mod declare replace_path="history/units" and own all 609.
//
// ⭐⭐⭐ WHY IT MATTERS ENOUGH TO CHANGE. The owner's 2026-09-24 launch reached 1936.01.01 and crashed on the
// FIRST AI tick, in ai_general.cpp's theatre manager and ai_military_minister.cpp — front planning, whose
// input is where the divisions are. The handover had dismissed this class as "not the crash — Millennium Dawn
// and Rise of Nations both ship some and launch". Then it was measured:
//
//     vanilla 0 of 5,074 · Old World Blues 0 of 4,028 · Hearts of Minecraft 0 of 1,258
//     Millennium: Damaged Continuum 1 of 5,094 · The Road to 56 1 of 6,478
//     Novum Vexillum 3 of 3,783 · Rise of Nations 23 of 41,289     → the corpus maximum is 0.1%
//     a Nova-built world: 2,922 of 4,566                           → 64%
//
// SOME IS 1 AND 23. The identical reasoning error the fleet crash had already taught, one file over.
//
// ⭐⭐⭐ THE ASSERTION THIS TEST EXISTS FOR is the destination, because the first implementation got it wrong
// in a way that measured green. provinceCentroids returns { x, z } — z, because HOI4 measures that axis
// BOTTOM-UP. Reading `.y` gives undefined, so the squared distance is NaN, and `NaN < best` is false for
// every candidate: the loop chooses nothing and falls through to whatever it was seeded with. A scratch build
// of the owner's test mod did precisely that — 620 divisions piled into one province — while still satisfying
// "0 divisions on water", which was the property being checked.
//
// So the fixture is built so that ONE assertion catches both ways of getting it wrong. The drowned division
// sits at province 40. Its own country owns 1 and 8, listed with 1 FIRST; another country owns 16.
//
//     40 -> 8   is  0 columns and 4 rows away    (ZZZ's, and the right answer)
//     40 -> 16  is  0 columns and 3 rows away    (NEARER — but it belongs to AAA)
//     40 -> 1   is  7 columns and 4 rows away    (ZZZ's, but FURTHEST — what the NaN bug picks)
//
// Landing on 1 means the distance never worked. Landing on 16 means ownership was never checked.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-divfix-appdata-"));
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
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-divfix-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// ── the fixture map: 8x8 provinces of 32px in a 256x256 bitmap, ids 1..64 by row ─────────────────────
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
const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;

// ZZZ's order of battle, CRLF on purpose — the mix is real and per-file, and a repair that emits the wrong
// ending leaves a pocket exactly where the next anchored edit will look. #always-detect-line-endings
const ZZZ_OOB = [
  'division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }',
  "units = {",
  "\t# the drowned one — province 40 was land below and is sea now",
  '\tdivision = { name = "Z Drowned" location = 40 division_template = "Inf" }',
  "\t# already at home, and must not move",
  '\tdivision = { name = "Z Home" location = 1 division_template = "Inf" }',
  "\t# a FLEET, whose own location must never be touched by a division fixer",
  "\tfleet = {",
  '\t\tname = "Z Fleet"',
  '\t\ttask_force = { name = "Z TF" location = 40 }',
  "\t}",
  "}",
  "",
].join("\r\n");
const AAA_OOB = [
  'division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }',
  "units = {",
  '\tdivision = { name = "A Drowned" location = 41 division_template = "Inf" }',
  "}",
  "",
].join("\n");

function writeGame(g) {
  mk(g, "map/provinces.bmp", BMP);
  mk(g, "map/definition.csv", definition((p) => p <= 48));       // rows 0-5 land below
  mk(g, "history/states/1.txt", st(1, [1, 8], "ZZZ"));
  mk(g, "history/states/2.txt", st(2, [16], "AAA"));
  for (const tag of ["ZZZ", "AAA"]) mk(g, `history/countries/${tag} - ${tag}land.txt`, `capital = 1\noob = "${tag}_1936"\n`);
  mk(g, "history/units/ZZZ_1936.txt", ZZZ_OOB);
  mk(g, "history/units/AAA_1936.txt", AAA_OOB);
}
// the mod drowns everything from row 2 down: only 1..16 stay land
function writeMod(m, { ownZZZ }) {
  mk(m, "descriptor.mod", 'name="div fix fixture"\n');
  mk(m, "map/definition.csv", definition((p) => p <= 16));
  if (ownZZZ) mk(m, "history/units/ZZZ_1936.txt", ZZZ_OOB);      // same name -> replaces the one below
}

const GAME = tmp("game"); writeGame(GAME);
const MOD = tmp("mod"); writeMod(MOD, { ownZZZ: true });
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const zzzText = (root) => fs.readFileSync(path.join(root, "history", "units", "ZZZ_1936.txt"), "utf8");
const locsIn = (s) => (s.match(/location\s*=\s*(\d+)/g) || []).map((x) => Number(x.replace(/\D/g, "")));

// ── 1. it moves, and to the RIGHT province ───────────────────────────────────────────────────────────
console.log("=== the repair ===");
const found = md.drownedDivisionsInOwnFiles(ctx(MOD));
rec("THE CONTROL: the fixture drowns two divisions — one in a file the mod owns, one it only inherits",
  found.movable.length === 2 && found.inherited.length === 1 && found.noLand.length === 0,
  { movable: found.movable.map((u) => [u.file, u.province]), inherited: found.inherited.map((u) => u.file), noLand: found.noLand.length });
rec("THE CONTROL: ZZZ's own land is listed with the FURTHEST province first — so a fixer that never measures picks 1",
  JSON.stringify(found.byTag.get("ZZZ")) === JSON.stringify([1, 8]), found.byTag.get("ZZZ"));

const r = md.fixDrownedDivisions(ctx(MOD));
rec("⭐⭐ it moves BOTH — the one in the mod's own file, and the one it has to copy in",
  r.moved === 2 && (r.files || []).slice().sort().join() === "AAA_1936.txt,ZZZ_1936.txt", r);
rec("⭐⭐ …and names the base-game file it copied in, because that is the cost the modder pays",
  (r.materialised || []).join() === "AAA_1936.txt", r.materialised);

const after = zzzText(MOD);
const got = locsIn(after);
rec("⭐⭐⭐ THE ASSERTION: the drowned division lands on 8 — its own country's NEAREST land",
  got[0] === 8, { got, meaning: got[0] === 1 ? "picked the FIRST in the list: the distance never worked (the .y/.z bug)" : got[0] === 16 ? "picked AAA's province: ownership was never checked" : "?" });
rec("⭐⭐⭐ …and NOT 16, which is nearer but belongs to another country", got[0] !== 16, got);
rec("⭐⭐⭐ …and NOT 1, which is its own but furthest — the NaN-distance fallback", got[0] !== 1 || got.length < 1, got);
rec("⭐⭐ the division already at home is untouched", got[1] === 1, got);
rec("⭐⭐⭐ the FLEET's own location is untouched — a division fixer must not move a task force",
  got[2] === 40 && /task_force = \{ name = "Z TF" location = 40 \}/.test(after), after.slice(after.indexOf("task_force")));

// ── 2. nothing is copied in ──────────────────────────────────────────────────────────────────────────
// ⚠️ THIS SECTION ASSERTED THE OPPOSITE UNTIL 2026-09-24 — "AAA's order of battle is NOT copied into the
// mod" — and that scope helped nobody: on a world built by Nova's OWN flow every order-of-battle file is
// inherited, so the repair fixed 0 of 2,563. It moved with the fix once the cost was MEASURED rather than
// guessed at: 52 files, not the "~180" I had claimed, and the fleet repair beside it already copies 34.
console.log("\n=== the inherited half is repaired too, and the layer below is never touched ===");
rec("⭐⭐⭐ AAA's order of battle IS copied into the mod, and its division moved onto AAA's own land",
  fs.existsSync(path.join(MOD, "history", "units", "AAA_1936.txt"))
  && locsIn(fs.readFileSync(path.join(MOD, "history", "units", "AAA_1936.txt"), "utf8"))[0] === 16, null);
rec("⭐⭐⭐ …and the BASE GAME's own copy is unchanged — Nova writes into the mod, never into the layer below",
  fs.readFileSync(path.join(GAME, "history", "units", "AAA_1936.txt"), "utf8") === AAA_OOB, null);
rec("⭐⭐ …and an LF file is still LF after being materialised",
  !/\r/.test(fs.readFileSync(path.join(MOD, "history", "units", "AAA_1936.txt"), "utf8")), null);
rec("⭐⭐ …and so is the base game's copy of ZZZ's, which the mod overrode rather than edited",
  fs.readFileSync(path.join(GAME, "history", "units", "ZZZ_1936.txt"), "utf8") === ZZZ_OOB, null);

// ── 3. SPLICE, NOT REBUILD, and the line endings ─────────────────────────────────────────────────────
console.log("\n=== splice, not rebuild ===");
rec("⭐⭐⭐ the file changed", after !== ZZZ_OOB, null);
rec("⭐⭐⭐ …and undoing only that one number gives the base game's bytes back exactly",
  after.replace("location = 8", "location = 40") === ZZZ_OOB,
  { at: [...after].findIndex((c, i) => c !== ZZZ_OOB[i]) });
const endings = (s) => { let crlf = 0, lf = 0; for (let i = 0; i < s.length; i++) if (s[i] === "\n") { if (s[i - 1] === "\r") crlf++; else lf++; } return { crlf, lf }; };
const e = endings(after);
rec("⭐⭐⭐ the CRLF file stays ALL CRLF — no pocket of LF", e.crlf === endings(ZZZ_OOB).crlf && e.lf === 0, { got: e, want: endings(ZZZ_OOB) });
rec("⭐⭐ every comment is still there, above the statement it belongs to",
  /# the drowned one[^\n]*\r\n\tdivision = \{ name = "Z Drowned"/.test(after) && /# already at home[^\n]*\r\n\tdivision = \{ name = "Z Home"/.test(after),
  after.slice(0, 400));

// ── 4. idempotence, and the rule goes quiet ──────────────────────────────────────────────────────────
console.log("\n=== a second click writes nothing ===");
const r2 = md.fixDrownedDivisions(ctx(MOD));
rec("⭐⭐⭐ the second click moves 0 and the bytes are identical", r2.moved === 0 && zzzText(MOD) === after, { r2, same: zzzText(MOD) === after });
{
  const rows = (md.validateMapBitmap(ctx(MOD)) || []).filter((p) => p.rule === "division_starts_on_water");
  rec("⭐⭐⭐ the rule goes silent — nothing is left on water", rows.length === 0, rows.map((p) => ({ total: p.total, autoFix: p.autoFix })));
}

// ── 5. THE BACK-OUT CONTROL ──────────────────────────────────────────────────────────────────────────
// A mod that drowns nothing must produce no move at all. A fixer that fires on a healthy world is cry-wolf
// with a write behind it.
console.log("\n=== THE BACK-OUT CONTROL: a mod that drowns nothing ===");
{
  const dry = tmp("dry");
  mk(dry, "descriptor.mod", 'name="drowns nothing"\n');
  mk(dry, "map/definition.csv", definition((p) => p <= 48));     // the same land as below
  mk(dry, "history/units/ZZZ_1936.txt", ZZZ_OOB);
  const rr = md.fixDrownedDivisions(ctx(dry));
  rec("⭐⭐⭐ nothing is moved and the file is byte-identical", rr.moved === 0 && zzzText(dry) === ZZZ_OOB, rr);
}

// ── 6. a mod that owns NOTHING gets no button and no write ───────────────────────────────────────────
// ⭐⭐⭐ THE CASE THE OLD SCOPE COULD NOT ANSWER, AND THE ONE THAT MATTERS MOST. A mod that ships no
// history/units at all is exactly what Nova's own flow produces — new mod, Delete map, Generate land — and
// under the old scope the repair moved 0 of them. This is the shape a real modder hits.
console.log("\n=== a mod that ships NO order of battle is the normal case, and is repaired ===");
{
  const bare = tmp("bare"); writeMod(bare, { ownZZZ: false });
  const f = md.drownedDivisionsInOwnFiles(ctx(bare));
  rec("THE CONTROL: every drowned division is inherited, and every one has land to go to",
    f.inherited.length === 2 && f.movable.length === 2 && f.noLand.length === 0,
    { movable: f.movable.length, inherited: f.inherited.length, noLand: f.noLand.length });
  const rr = md.fixDrownedDivisions(ctx(bare));
  rec("⭐⭐⭐ both are moved, and both base-game files are copied in and named",
    rr.moved === 2 && (rr.materialised || []).slice().sort().join() === "AAA_1936.txt,ZZZ_1936.txt", rr);
  rec("⭐⭐⭐ …each onto its OWN country's nearest land, not a neighbour's",
    locsIn(fs.readFileSync(path.join(bare, "history", "units", "ZZZ_1936.txt"), "utf8"))[0] === 8
    && locsIn(fs.readFileSync(path.join(bare, "history", "units", "AAA_1936.txt"), "utf8"))[0] === 16,
    { ZZZ: locsIn(fs.readFileSync(path.join(bare, "history", "units", "ZZZ_1936.txt"), "utf8"))[0],
      AAA: locsIn(fs.readFileSync(path.join(bare, "history", "units", "AAA_1936.txt"), "utf8"))[0] });
  const rows = (md.validateMapBitmap(ctx(bare)) || []).filter((p) => p.rule === "division_starts_on_water");
  rec("⭐⭐⭐ …and the rule goes silent afterwards", rows.length === 0, rows.map((p) => ({ total: p.total, autoFix: p.autoFix })));
}

// ── 7. wired into the click ──────────────────────────────────────────────────────────────────────────
console.log("\n=== wired into Auto-fix all ===");
{
  const m2 = tmp("click"); writeMod(m2, { ownZZZ: true });
  const fx = (md.autoFixMap(ctx(m2)) || {}).fixes || {};
  rec("⭐⭐⭐ one click on Auto-fix all runs it — the rule is no use without the button",
    ((fx.drownedDivisions || {}).moved || 0) === 2, fx.drownedDivisions);
  rec("⭐⭐ …and it lands on 8, the same answer the direct call gives", locsIn(zzzText(m2))[0] === 8, locsIn(zzzText(m2)));
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a division in the water is moved onto its own country's land: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
