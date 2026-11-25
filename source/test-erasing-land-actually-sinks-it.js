// ⛔ #erase-leaves-the-land-standing — NOVA SHOWED OCEAN AND THE GAME DREW LAND ON THE SAME PIXELS.
//
// The Erase tool retypes a province to "sea" in definition.csv and tidies up around it — states, supply
// nodes, railways, naval strategic region. It never touched map/heightmap.bmp, and nothing else in Nova did
// either: `grep -rn heightmap` over the whole tree returned zero hits.
//
// heightmap.bmp is what decides what is above or below water. The wiki (Map modding, heightmap.bmp) is
// explicit: "The sea level is set at the height of 9.5 by default, and so anything below the value of 95
// (on the scale from 0 to 255) will be shown as underwater, while everything above 95 will be shown as
// above water."
//
// So an erased province kept its terrain. Measured on province 4861: definition.csv said sea/ocean while
// 1,703 of its 1,817 pixels still stood above 95, and its real sea neighbours read a flat 89. Same for
// every other province tried — 3008 at 84.6% above, 3838 at 68.8%, 12251 at 36.1%.
//
// This is the rivers bug in another costume: every layer Nova can see agreed, and the game disagreed.
//
// ⚠️ 89 IS NOT A GUESS. Sampled over real vanilla provinces, sea reads mean 89.0 with 0% of pixels above
// sea level, against 106.3 and 92% for land — and that sampling also settled the coordinate convention,
// which is the part that would have been catastrophic to get wrong: pixelOffset takes the SAME top-down y
// that provinces.bmp indexing produces. Read the other way round, vanilla's land reads 89.0/0% too, which
// is nonsense — and a write using it would have sunk terrain on the opposite side of the world.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const mkMod = () => {
    const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sink-"));
    roots.push(m);
    fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="sink"\n', "utf8");
    return m;
  };
  // Count a province's pixels that stand above sea level, reading heightmap the way the fix does.
  const aboveSeaLevel = (mod, pid) => {
    const hmPath = fs.existsSync(path.join(mod, "map", "heightmap.bmp"))
      ? path.join(mod, "map", "heightmap.bmp") : path.join(GAME, "map", "heightmap.bmp");
    const hb = fs.readFileSync(hmPath), hm = md.readIndexedBmp(hb);
    const pb = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
    const off = pb.readUInt32LE(10), W = pb.readInt32LE(18), H = pb.readInt32LE(22);
    const rs = Math.floor((24 * W + 31) / 32) * 4;
    const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const p = (model.provinces || []).find((x) => x.id === pid);
    if (!p) return null;
    const key = ((p.r << 16) | (p.g << 8) | p.b) >>> 0;
    // `aboveFloor` is what #a-drowned-coast-shows-through-the-sea sinks when the province was land: everything above
    // the sea floor, beach included, because HOI4 draws water see-through from 92 up.
    let above = 0, aboveFloor = 0, total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = off + (H - 1 - y) * rs + x * 3;
      if ((((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0) !== key) continue;
      total++;
      const h = hb[hm.pixelOffset(x, y)];
      if (h > md.HEIGHTMAP_SEA_LEVEL) above++;
      if (h > md.HEIGHTMAP_SEA_VALUE) aboveFloor++;
    }
    return { above, aboveFloor, total };
  };

  try {
    console.log("\n-- ⭐ the coordinate convention, settled from vanilla's own data --");
    {
      // If this is ever read the other way round, the fix sinks terrain somewhere else entirely. Assert the
      // invariant that decides it rather than trusting a comment.
      const hb = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")), hm = md.readIndexedBmp(hb);
      const pb = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
      const off = pb.readUInt32LE(10), W = pb.readInt32LE(18), H = pb.readInt32LE(22);
      const rs = Math.floor((24 * W + 31) / 32) * 4;
      const type = new Map();
      for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
        const c = l.split(";");
        if (c.length >= 8) type.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, c[4]);
      }
      let seaAbove = 0, seaN = 0, landAbove = 0, landN = 0;
      for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
        const o = off + (H - 1 - y) * rs + x * 3;
        const t = type.get(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0);
        if (t !== "sea" && t !== "land") continue;
        const h = hb[hm.pixelOffset(x, y)];
        if (t === "sea") { seaN++; if (h > 95) seaAbove++; } else { landN++; if (h > 95) landAbove++; }
      }
      ok(seaN > 1000 && landN > 1000, "sampled enough of both", { seaN, landN });
      ok(seaAbove / seaN < 0.05, `vanilla SEA is below sea level (${Math.round((seaAbove / seaN) * 100)}% above)`, seaAbove / seaN);
      ok(landAbove / landN > 0.8, `vanilla LAND is above it (${Math.round((landAbove / landN) * 100)}% above)`, landAbove / landN);
    }

    console.log("\n-- erasing a province sinks its terrain --");
    {
      const mod = mkMod();
      const before = aboveSeaLevel(mod, 4861);
      ok(before && before.above > 1000, `province 4861 starts with ${before && before.above} of ${before && before.total} pixels above water`, before);

      const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 4861 });
      ok(r && r.changed, "the erase succeeded", r && r.error);
      ok(/;sea;/.test(String(r.definition && r.definition.line)), "definition.csv now calls it sea", r.definition && r.definition.line);
      ok(r.heightmap && r.heightmap.changed, "…and the heightmap was written", r.heightmap);
      // #a-drowned-coast-shows-through-the-sea: it WAS land, so its beach goes under too — every pixel above the
      // sea floor, not only those above 95. It used to be 1,703 of 1,817, leaving 114 pixels of shore at 92–95
      // that the water shader draws through as sand.
      ok(before.aboveFloor > before.above, "the province has beach pixels between the sea floor and sea level", before);
      ok(r.heightmap && r.heightmap.pixels === before.aboveFloor && r.heightmap.fringe === 0,
        "…and the erase lowered every pixel above the sea floor, beach included, and nothing beside it",
        { sunk: r.heightmap && r.heightmap.pixels, fringe: r.heightmap && r.heightmap.fringe, wereAboveFloor: before.aboveFloor, wereAboveSeaLevel: before.above });

      const after = aboveSeaLevel(mod, 4861);
      ok(after.above === 0, `no pixel of it is above water any more (0 of ${after.total})`, after);
      ok(after.aboveFloor === 0, "…and none is left at beach height to show through the water", after);
      ok(after.total === before.total, "…and the province still has all its pixels — nothing was resized", { before: before.total, after: after.total });
    }

    console.log("\n-- it is idempotent, and materialises the file once --");
    {
      const mod = mkMod();
      md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 4861 });
      const first = fs.readFileSync(path.join(mod, "map", "heightmap.bmp"));
      const again = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceIds: [4861] });
      ok(again && again.changed === false, "sinking the same province twice writes nothing", again);
      ok(Buffer.compare(fs.readFileSync(path.join(mod, "map", "heightmap.bmp")), first) === 0,
        "…and the file is byte-identical");
    }

    console.log("\n-- only the erased province is touched --");
    {
      const mod = mkMod();
      const vanilla = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp"));
      const own = aboveSeaLevel(mod, 4861);
      md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 4861 });
      const mine = fs.readFileSync(path.join(mod, "map", "heightmap.bmp"));
      ok(mine.length === vanilla.length, "the heightmap is the same size as the one it was copied from", { a: vanilla.length, b: mine.length });
      let diff = 0;
      for (let i = 0; i < mine.length; i++) if (mine[i] !== vanilla[i]) diff++;
      ok(diff === own.aboveFloor, `exactly ${own.aboveFloor.toLocaleString()} bytes differ — the province's own pixels above the sea floor (${diff})`, diff);
    }

    console.log("\n-- ⭐ a small coastal province goes all the way under, not just its top two pixels --");
    {
      // 12126 is 29 pixels of coast. The old sink moved 2 of them and left 27 at shoreline height: a sandy speck
      // in open sea, the owner's "lone tiny islands" at the scale of one province.
      const mod = mkMod();
      const before = aboveSeaLevel(mod, 12126);
      ok(before && before.aboveFloor > before.above, "12126 has more beach than dry land", before);
      const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 12126 });
      ok(r && r.changed, "the erase succeeded", r && r.error);
      const after = aboveSeaLevel(mod, 12126);
      ok(after.aboveFloor === 0, `none of its ${after.total} pixels is left above the sea floor`, after);
    }

    console.log("\n-- ⭐ erasing what is ALREADY sea keeps its shallows --");
    {
      // The lower threshold is for land that just went under. A sea province erased again must keep the old rule —
      // only what stands above 95 — or erasing water would rewrite its own shallows, and take heightmap.bmp,
      // terrain.bmp and world_normal.bmp into the mod for a click that changed nothing it could see.
      // Derived, not typed: the first vanilla sea province with pixels between the floor and sea level.
      // One pass over the base game for every sea province at once.
      const seaOf = new Map();
      for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
        const c = l.split(";");
        if (c.length >= 8 && c[4] === "sea" && +c[0] > 0) seaOf.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]);
      }
      const hb = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")), hm = md.readIndexedBmp(hb);
      const pb = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
      const off = pb.readUInt32LE(10), W = pb.readInt32LE(18), H = pb.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
      const st = new Map();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = off + (H - 1 - y) * rs + x * 3;
        const id = seaOf.get((((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0));
        if (id === undefined) continue;
        const h = hb[hm.pixelOffset(x, y)];
        let s = st.get(id); if (!s) st.set(id, s = { above: 0, aboveFloor: 0 });
        if (h > md.HEIGHTMAP_SEA_LEVEL) s.above++;
        if (h > md.HEIGHTMAP_SEA_VALUE) s.aboveFloor++;
      }
      let sea = null, seaBefore = null;
      for (const [id, s] of [...st].sort((a, b) => a[0] - b[0])) if (s.above > 0 && s.aboveFloor > s.above + 20) { sea = id; seaBefore = s; break; }
      ok(sea != null, `found a vanilla sea province with shallows of its own (${sea})`, seaBefore);
      if (sea != null) {
        const mod = mkMod();
        const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: sea });
        ok(r && r.heightmap && r.heightmap.pixels === seaBefore.above && !r.heightmap.drowned,
          `…erasing it lowers only what stood above sea level (${seaBefore.above}), not its ${seaBefore.aboveFloor} shallows`,
          { pixels: r && r.heightmap && r.heightmap.pixels, above: seaBefore.above, aboveFloor: seaBefore.aboveFloor });
      }
    }

    console.log("\n-- ⭐ the brush can cut deeper than one province --");
    {
      // #erase-can-only-cut-one-province-deep — the guard trusted definition.csv's `coastal` column, which
      // nothing updates when the map changes. Erase a coastal province and its inland neighbour is now on
      // the shore, but its column still says false, so the next erase was refused with "Province N isn't
      // coastal" — no longer true. The workaround was to run Auto-fix between every ring.
      const mod = mkMod();
      const before176 = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8")
        .split(/\r?\n/).find((l) => l.startsWith("176;"));
      ok(/;land;false;/.test(String(before176)),
        "province 176 starts as land with coastal=false — the case that used to be refused", before176);

      const first = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 3008 });
      ok(first && first.changed, "the first ring erases", first && first.error);

      const second = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 176 });
      ok(second && second.changed, "…and so does the second, which now borders the sea just made", second && second.error);
      ok(!second.isolatedWater, "…without the stale 'isn't coastal' refusal", second && second.error);

      const after = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")
        .split(/\r?\n/).find((l) => l.startsWith("176;"));
      ok(/;sea;/.test(String(after)), "…and 176 really is sea now", after);
    }

    console.log("\n-- ⭐ but genuinely inland land is STILL refused --");
    {
      // The guard exists because an isolated water province makes HOI4 divide by zero building the
      // gamestate. Loosening it to consult the bitmap must not loosen it to nothing.
      const mod = mkMod();
      // 3838 is deep inland in vanilla; nothing around it is water.
      // ⚠️ Province 0 is the special 0,0,0 "no province" dummy and is NOT a meaningful inland case — an
      // earlier version of this check found it first and passed for a reason that proved nothing. Require a
      // real land province, and stop after a handful since each check is a full pass over provinces.bmp.
      const inland = (() => {
        const defs = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/);
        let tried = 0;
        for (const l of defs) {
          const c = l.split(";");
          if (c.length < 8 || c[4] !== "land" || c[5] !== "false") continue;
          const id = +c[0];
          if (!Number.isFinite(id) || id <= 0) continue;
          if (++tried > 12) break;
          if (!md.provinceTouchesWater({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: id })) return id;
        }
        return null;
      })();
      ok(inland != null && inland > 0, "found a REAL land province that touches no water at all", inland);
      if (inland != null) {
        const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: inland });
        ok(r && r.changed === false && r.isolatedWater,
          `erasing genuinely inland province ${inland} is still refused`, r);
        ok(!fs.existsSync(path.join(mod, "map", "definition.csv")),
          "…and nothing was written for the refusal");
      }
    }

    console.log("\n-- a province already at sea level is left alone --");
    {
      const mod = mkMod();
      // 209 is a real sea province; its heightmap is already flat 89.
      const r = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceIds: [209] });
      ok(r && r.changed === false, "an existing sea province needs no change", r);
      ok(!fs.existsSync(path.join(mod, "map", "heightmap.bmp")),
        "…and the mod does not get a pointless 11MB copy of the heightmap", fs.existsSync(path.join(mod, "map", "heightmap.bmp")));
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }

  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
