// map/unitstacks.txt — the file Nova has never written, and the one that still describes the map you
// started from. #a-unit-stack-must-match-its-province
//
// It holds the model positions for unit counters: `province;type;x;y;z;rotation;scale`, 265,355 rows in
// vanilla. The type column is province-kind specific, and the split is absolute across six shipping maps:
//
//     types 11-18 and 30-37   SEA ONLY    zero rows on a land province in vanilla's 265,355
//     types 19 and 20         LAND ONLY   "ship in port", 2,236 provinces, every one coastal
//
// ⭐⭐⭐ EVERY SEA PROVINCE CARRIES THE SAME FLOOR, and that is what makes this fixable rather than guessed.
// All 3,133 of vanilla's sea provinces have at least {0,1,2,9,10,11,12,21,22,23,30,31,38}, and the SMALLEST
// one has exactly that set — so the floor is read off the corpus, not invented. Land has no equivalent:
// only type 1 is on every land province and the smallest land province has just {1,2}, against a median of
// 17 rows. That asymmetry decides the design. Sea → land needs rows REMOVED and nothing added, because two
// rows is a legal land province. Land → sea needs the thirteen added, because zero is not a legal sea one.
//
// ⚠️ SIX OF SIX SHIPPING MAPS THAT OWN A definition.csv ALSO OWN A unitstacks.txt — vanilla, Novum
// Vexillum, Rise of Nations, Old World Blues, Millennium Dawn, Road to 56. Of the owner's twelve mods that
// own a definition.csv, ZERO own a unitstacks.txt. So each inherits vanilla's rows describing vanilla's
// province types: five flipped provinces produce 54 naval slots sitting on land, and the stress-test map
// produces 13,988 across 1,131 provinces.
//
// ⚠️ A WARNING, NOT FATAL. Novum Vexillum ships five contradicting rows across two provinces and runs. A
// pattern being clean on five maps is not licence to gate Save on the sixth. "A validator must not cry
// wolf" — and the fatal set is a curated claim about crashing, not a tidiness score.
//
// ⚠️ SCOPED TO A MOD THAT CHANGED definition.csv. A mod that never touched province types inherits the base
// game's consistent pair; reporting that would be the add-on floodgate again, and "fixing" it would
// materialise a 10 MB whole-file override to repair nothing. #inherited-problem-not-yours
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 230)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-us-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; }
  }
  return buf;
}

try {
  // ── 1. THE GROUND TRUTH, DERIVED FROM THE GAME — never typed into this file ──────────────────────
  console.log("1. 🈯 The land/sea split, re-derived from vanilla on every run");
  const haveGame = fs.existsSync(path.join(GAME, "map", "unitstacks.txt"));
  if (!haveGame) {
    // Not a skip: a guard that cannot run says so, because a skip reads as a pass.
    rec("the base game is installed, so the ground truth can be re-derived", false, "no HOI4 at " + GAME);
  } else {
    const kind = new Map();
    for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
      if (!l.trim()) continue; const c = l.split(";"); const id = +c[0];
      if (Number.isFinite(id)) kind.set(id, c[4]);
    }
    const per = new Map();
    let rows = 0;
    for (const l of fs.readFileSync(path.join(GAME, "map", "unitstacks.txt"), "utf8").split(/\r?\n/)) {
      if (!l.trim()) continue; const c = l.split(";"); const p = +c[0], t = +c[1];
      if (!Number.isFinite(p) || !Number.isFinite(t)) continue;
      rows++;
      if (!per.has(p)) per.set(p, new Set());
      per.get(p).add(t);
    }
    const onLand = (t) => [...per].filter(([p, s]) => s.has(t) && kind.get(p) === "land").length;
    const onSea = (t) => [...per].filter(([p, s]) => s.has(t) && kind.get(p) === "sea").length;
    rec("vanilla's unitstacks is big enough to be a corpus", rows > 200000, rows + " rows");
    const seaOnlyBroken = [11, 12, 13, 14, 15, 16, 17, 18, 30, 31, 32, 33, 34, 35, 36, 37].filter((t) => onLand(t) > 0);
    rec("⭐⭐⭐ types 11-18 and 30-37 appear on NO land province", seaOnlyBroken.length === 0, seaOnlyBroken);
    const landOnlyBroken = [19, 20].filter((t) => onSea(t) > 0);
    rec("⭐⭐ types 19 and 20 appear on NO sea province", landOnlyBroken.length === 0, landOnlyBroken);
    // the floor, computed as the intersection over every sea province
    let floor = null;
    for (const [p, s] of per) { if (kind.get(p) !== "sea") continue; floor = floor === null ? new Set(s) : new Set([...floor].filter((t) => s.has(t))); }
    const derived = [...floor].sort((a, b) => a - b).join(",");
    rec("⭐⭐⭐ the sea floor derived from vanilla is the one the fixer writes", derived === "0,1,2,9,10,11,12,21,22,23,30,31,38", derived);
    // …and land has no comparable floor, which is why nothing is added for a new land province
    let landFloor = null;
    for (const [p, s] of per) { if (kind.get(p) !== "land") continue; landFloor = landFloor === null ? new Set(s) : new Set([...landFloor].filter((t) => s.has(t))); }
    rec("⚠️ …while LAND has almost none, so a new land province needs nothing added", landFloor.size <= 2, [...landFloor].sort((a, b) => a - b));
  }

  // ── 1b. ⚠️⚠️ ONE MAP IS NOT A CORPUS — the mistake this section exists to prevent ────────────────
  //
  // The first draft used vanilla's thirteen-type intersection as BOTH "what a sea province must have" and
  // "what to write for a new one". Run against the installed maps it reported 3,107 faults in Novum
  // Vexillum, which ships and runs — because NV's sea provinces stop at eight types and Old World Blues
  // goes to seventeen. Thirteen is vanilla's convention, not the engine's requirement.
  console.log("\n1b. ⚠️⚠️ The REQUIRED set is the intersection across every installed map, not vanilla's");
  {
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    const maps = [];
    if (haveGame) maps.push(["vanilla", GAME]);
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const r = path.join(WS, id);
      if (fs.existsSync(path.join(r, "map", "definition.csv")) && fs.existsSync(path.join(r, "map", "unitstacks.txt"))) maps.push([id, r]);
    }
    if (maps.length < 2) {
      rec("at least two installed maps to intersect", false, maps.length + " found — the corpus check could not run, and a skip reads as a pass");
    } else {
      let required = null, totalSea = 0, seaWithNoRows = 0;
      const perMapFloor = [];
      for (const [, root] of maps) {
        const k = new Map();
        for (const l of fs.readFileSync(path.join(root, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
          if (!l.trim()) continue; const c = l.split(";"); const id = +c[0];
          if (Number.isFinite(id)) k.set(id, c[4]);
        }
        const per2 = new Map();
        for (const l of fs.readFileSync(path.join(root, "map", "unitstacks.txt"), "utf8").split(/\r?\n/)) {
          if (!l.trim()) continue; const c = l.split(";"); const p = +c[0], t = +c[1];
          if (!Number.isFinite(p) || !Number.isFinite(t)) continue;
          if (!per2.has(p)) per2.set(p, new Set());
          per2.get(p).add(t);
        }
        let f = null;
        for (const [id, kk] of k) {
          if (kk !== "sea" || id < 1) continue;
          totalSea++;
          const s = per2.get(id);
          if (!s) { seaWithNoRows++; continue; }
          f = f === null ? new Set(s) : new Set([...f].filter((t) => s.has(t)));
        }
        if (f) { perMapFloor.push(f.size); required = required === null ? new Set(f) : new Set([...required].filter((t) => f.has(t))); }
      }
      rec("⭐⭐⭐ ZERO sea provinces anywhere have no unit positions — THAT is the real invariant",
        seaWithNoRows === 0, seaWithNoRows + " of " + totalSea + " across " + maps.length + " maps");
      rec("⭐⭐ the per-map floors genuinely differ, so vanilla's cannot be the requirement",
        new Set(perMapFloor).size > 1, perMapFloor.join(", "));
      rec("⭐⭐⭐ the corpus-wide REQUIRED set is what the validator demands",
        [...required].sort((a, b) => a - b).join(",") === "0,1,2,9,10,11,12,38", [...required].sort((a, b) => a - b).join(","));
      rec("…and it is a subset of what the fixer writes, so a repair is never short",
        [...required].every((t) => [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38].includes(t)));
    }
  }

  console.log("\n1c. ⚠️ ANTI-CRY-WOLF against the installed maps");
  {
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    const roots = haveGame ? [["vanilla", GAME]] : [];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const r = path.join(WS, id);
      if (fs.existsSync(path.join(r, "map", "definition.csv"))) roots.push([id, r]);
    }
    let short = 0;
    const noisy = [];
    for (const [id, root] of roots) {
      let f;
      try { f = md.findUnitStackMismatches({ modRoot: root, gameRoot: GAME, dependencyRoots: [] }); } catch (_) { continue; }
      short += f.seaMissingFloor.length;
      // A handful of contradicting rows is real (Novum Vexillum ships five). Hundreds is a broken rule.
      if (f.seaTypeOnLand.length + f.landTypeOnSea.length > 20) noisy.push(id + ": " + (f.seaTypeOnLand.length + f.landTypeOnSea.length));
    }
    rec("⭐⭐⭐ no shipping map has a sea province short of the required set", short === 0, short + " across " + roots.length + " roots");
    rec("…and none is reported for more than a handful of contradicting rows", noisy.length === 0, noisy);
  }

  // ── 2. The fixture: a base map, and a mod that flips two provinces ───────────────────────────────
  // 8x4, two rows of four provinces. Base: 1,2 sea and 3..8 land. The mod flips 1 -> land and 3 -> sea.
  const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
  const provAt = (x, y) => (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[Math.floor(x / 2)];
  const defCsv = (types) => ["0;0;0;0;land;false;unknown;0"].concat(
    [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i};${i * 20};0;0;${types[i]};false;${types[i] === "sea" ? "ocean" : "plains"};${types[i] === "sea" ? 0 : 1}`)
  ).join("\r\n") + "\r\n";
  const BASE_TYPES = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "land" };
  const MOD_TYPES = Object.assign({}, BASE_TYPES, { 1: "land", 3: "sea" });

  // base unitstacks: the sea provinces get the full floor, land ones get a couple of slots
  const baseStacks = [];
  for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const isSea = BASE_TYPES[i] === "sea";
    const types = isSea ? [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38] : [1, 2];
    for (const t of types) baseStacks.push(`${i};${t};${(i * 2).toFixed(2)};9.50;1.00;0.00;0.24`);
  }
  function makeBase() {
    const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-us-game-")); tmps.push(g);
    mk(path.join(g, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL[provAt(x, y)]));
    mk(path.join(g, "map", "definition.csv"), defCsv(BASE_TYPES));
    mk(path.join(g, "map", "unitstacks.txt"), baseStacks.join("\n") + "\n");
    return g;
  }
  // ⛔ #a-replaced-map-folder-is-judged-by-its-own-files — the mod INHERITS the base game's unitstacks.txt, the shape the header measures
  // (each of the owner's mods that owns a definition.csv owns no unitstacks.txt), so its descriptor declares no replace_path="map": under
  // that line HOI4 reads no unitstacks.txt from below at all. It declared one until B6-17, while Nova read past the line; section 7 holds
  // what the line does.
  function makeMod(types, opts) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-us-mod-")); tmps.push(d);
    mk(path.join(d, "descriptor.mod"), opts && opts.replacesMap ? 'name="US"\nreplace_path="map"\n' : 'name="US"\n');
    mk(path.join(d, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL[provAt(x, y)]));
    if (types) mk(path.join(d, "map", "definition.csv"), defCsv(types));
    if (opts && opts.ownStacks) mk(path.join(d, "map", "unitstacks.txt"), baseStacks.join("\n") + "\n");
    return d;
  }

  console.log("\n2. ⛔ The rule fires on a mod whose map moved on under it");
  const game = makeBase();
  {
    const mod = makeMod(MOD_TYPES);
    const A = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const f = md.findUnitStackMismatches(A);
    rec("province 1 became land and still carries naval slots", f.seaTypeOnLand.length > 0, f.seaTypeOnLand.map((r) => r.province + ":" + r.type));
    rec("…and every one of them names province 1", f.seaTypeOnLand.every((r) => r.province === 1));
    rec("⭐ province 3 became sea and is short of the floor", f.seaMissingFloor.length === 1 && f.seaMissingFloor[0].province === 3, f.seaMissingFloor);
    rec("…missing exactly the sea-only types it never had as land",
      f.seaMissingFloor.length === 1 && f.seaMissingFloor[0].missing.join(",") === "0,9,10,11,12,21,22,23,30,31,38", f.seaMissingFloor[0] && f.seaMissingFloor[0].missing.join(","));

    const probs = md.validateMapBitmap(A).filter((p) => p.rule === "unitstacks_disagrees_with_province_type");
    rec("the validator reports it", probs.length === 1, probs.length);
    // A WARNING (was an error): Novum Vexillum ships this and launches, and hoi4.exe's unitstacks loader
    // (nudgestacks.cpp) checks only ": Invalid province" and ": Invalid stack index" — never whether a slot's kind
    // matches its province. It misplaces counters; it is not a load fault. #a-map-message-matches-what-the-engine-checks
    rec("…as a warning", probs.length === 1 && probs[0].severity === "warning", probs[0] && probs[0].severity);
    rec("⭐⭐ …and NOT as fatal — Novum Vexillum ships five and runs",
      isFatalRule("unitstacks_disagrees_with_province_type") === false, isFatalRule("unitstacks_disagrees_with_province_type"));
    rec("…and it has a human label", mapRuleLabel("unitstacks_disagrees_with_province_type") !== "Unitstacks disagrees with province type",
      mapRuleLabel("unitstacks_disagrees_with_province_type"));
  }

  console.log("\n3. ⚠️ ANTI-CRY-WOLF: it stays quiet where the problem is not the mod's");
  {
    // owns definition.csv, but identical to the base — the shape that once produced 160 warnings from one click
    const same = makeMod(BASE_TYPES);
    const pSame = md.validateMapBitmap({ modRoot: same, gameRoot: game, dependencyRoots: [] }).filter((p) => p.rule === "unitstacks_disagrees_with_province_type");
    rec("⭐⭐⭐ a mod holding the base definition.csv verbatim is not reported", pSame.length === 0, pSame.map((p) => p.message.slice(0, 80)));

    // owns no definition.csv at all: it inherits a consistent pair
    const none = makeMod(null);
    const pNone = md.validateMapBitmap({ modRoot: none, gameRoot: game, dependencyRoots: [] }).filter((p) => p.rule === "unitstacks_disagrees_with_province_type");
    rec("…and neither is a mod that owns no definition.csv", pNone.length === 0, pNone.length);

    // and the fixer refuses to materialise anything for either
    const r1 = md.fixUnitStacks({ modRoot: same, gameRoot: game, dependencyRoots: [] });
    rec("…the fixer writes nothing for them", !r1.changed && !fs.existsSync(path.join(same, "map", "unitstacks.txt")), r1);
    const r2 = md.fixUnitStacks({ modRoot: none, gameRoot: game, dependencyRoots: [] });
    rec("⭐⭐ …and does not materialise a whole-file override to repair nothing",
      !r2.changed && !fs.existsSync(path.join(none, "map", "unitstacks.txt")), r2.skipped || r2);
  }

  console.log("\n4. ⭐ The fix: drop what contradicts, add only what a sea province cannot do without");
  {
    const mod = makeMod(MOD_TYPES);
    const A = { modRoot: mod, gameRoot: game, dependencyRoots: [] };

    const dry = md.fixUnitStacks(Object.assign({ dryRun: true }, A));
    rec("a dry run counts the work", dry.removed > 0 && dry.added > 0, { removed: dry.removed, added: dry.added });
    rec("…and writes absolutely nothing", !dry.changed && !fs.existsSync(path.join(mod, "map", "unitstacks.txt")));

    const r = md.fixUnitStacks(A);
    rec("the fix ran", r.changed === true, r);
    rec("…and the mod now owns the file, because a map file cannot be half-overridden", fs.existsSync(path.join(mod, "map", "unitstacks.txt")));

    const after = md.findUnitStackMismatches(A);
    rec("⭐⭐⭐ no naval slot is left on land", after.seaTypeOnLand.length === 0, after.seaTypeOnLand);
    rec("⭐⭐ …no port slot is left at sea", after.landTypeOnSea.length === 0, after.landTypeOnSea);
    rec("⭐⭐ …and the new sea province has the full floor", after.seaMissingFloor.length === 0, after.seaMissingFloor);
    rec("…the validator agrees", md.validateMapBitmap(A).filter((p) => p.rule === "unitstacks_disagrees_with_province_type").length === 0);

    // the added rows are positioned and shaped correctly
    const txt = fs.readFileSync(path.join(mod, "map", "unitstacks.txt"), "utf8");
    const rows3 = txt.split(/\r?\n/).filter((l) => l.startsWith("3;")).map((l) => l.split(";"));
    rec("province 3's rows are all seven columns", rows3.length > 0 && rows3.every((c) => c.length === 7), rows3.length + " rows");
    rec("⭐ …and the added sea slots sit at the waterline, 9.50",
      rows3.filter((c) => [11, 12, 30, 31].includes(+c[1])).every((c) => c[3] === "9.50"),
      rows3.filter((c) => [11, 12, 30, 31].includes(+c[1])).map((c) => c[3]));
    // province 3 is the third column of the top row: pixels x=4..5, y=0..1 -> centroid (4.5, 0.5)
    // x = 4.5 - 0.5 = 4.00 ; z = (H-1-0.5) - 0.5 = (4-1-0.5) - 0.5 = 2.00
    const added = rows3.find((c) => +c[1] === 11);
    rec("⭐⭐ …at the province's own centroid, in the bottom-up z frame buildings.txt uses",
      added && added[2] === "4.00" && added[4] === "2.00", added && { x: added[2], z: added[4] });

    const again = md.fixUnitStacks(A);
    rec("⭐ a second click changes nothing — idempotent", again.changed === false && again.removed === 0 && again.added === 0, again);
    const before = fs.readFileSync(path.join(mod, "map", "unitstacks.txt"));
    md.fixUnitStacks(A);
    rec("…and the file is byte-identical after it", Buffer.compare(before, fs.readFileSync(path.join(mod, "map", "unitstacks.txt"))) === 0);
  }

  console.log("\n5. It edits a file the mod already owns without materialising a second one");
  {
    const mod = makeMod(MOD_TYPES, { ownStacks: true });
    const A = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const r = md.fixUnitStacks(A);
    rec("the fix ran on the mod's own copy", r.changed === true && r.materialised === false, { changed: r.changed, materialised: r.materialised });
    rec("…and it is still clean afterwards", md.findUnitStackMismatches(A).seaTypeOnLand.length === 0);
  }

  console.log("\n6. It is reachable from Auto-fix, not merely present");
  {
    const mod = makeMod(MOD_TYPES);
    const A = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const res = md.autoFixMap(A);
    rec("⭐⭐⭐ one Auto-fix click repairs it", res.ok && !!res.fixes.unitStacks && res.fixes.unitStacks.changed === true, res.fixes && res.fixes.unitStacks);
    rec("…and the rule is gone afterwards",
      md.validateMapBitmap(A).filter((p) => p.rule === "unitstacks_disagrees_with_province_type").length === 0);
  }

  console.log("\n7. ⛔ A mod whose own descriptor says replace_path=\"map\" inherits no unitstacks.txt: nothing to judge, nothing copied in (B6-17)");
  {
    const mod = makeMod(MOD_TYPES, { replacesMap: true });
    const A = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const f = md.findUnitStackMismatches(A);
    rec("⭐⭐⭐ the base game's rows, which HOI4 does not read under the line, are not judged against the mod's provinces",
      f.seaTypeOnLand.length === 0 && f.landTypeOnSea.length === 0 && f.seaMissingFloor.length === 0, { seaTypeOnLand: f.seaTypeOnLand.length, seaMissingFloor: f.seaMissingFloor.length });
    rec("…and the validator says nothing of them", md.validateMapBitmap(A).filter((p) => p.rule === "unitstacks_disagrees_with_province_type").length === 0);
    const r = md.fixUnitStacks(A);
    rec("⭐⭐⭐ the fixer copies none of them in: the mod gets no unitstacks.txt of the base game's", !r.changed && !fs.existsSync(path.join(mod, "map", "unitstacks.txt")), r);
    const res = md.autoFixMap(A);
    rec("⭐⭐ …nor does one Auto-fix click", res.ok && !fs.existsSync(path.join(mod, "map", "unitstacks.txt")), res.fixes && res.fixes.unitStacks);
    rec("THE CONTROL: the same mod without the line is reported, as section 2 shows of every mod built here",
      md.findUnitStackMismatches({ modRoot: makeMod(MOD_TYPES), gameRoot: game, dependencyRoots: [] }).seaTypeOnLand.length > 0);
  }

  console.log(`\n=== a unit stack must match its province: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
