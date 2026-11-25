// ⛔ #erase-leaves-the-land-standing — AT 10,000× THE SCALE.
//
// Retyping a province to "sea" in definition.csv does not lower it. heightmap.bmp is what decides whether
// terrain is drawn above or below water. That was found and fixed for the ERASE brush, which sinks the one
// province it drowns — measured at the time on province 4861: definition.csv said sea/ocean while 1,703 of
// its 1,817 pixels still stood above 95, and "the map editor showed ocean and the game drew land".
//
// "Delete map" retypes EVERY land row in the file — 10,154 of them on the base game — and never called the
// same function. Its "blank ocean canvas to build a new world from scratch" was an ocean with every
// continent still standing at full height underneath it, and then the land generator the dialog recommends
// builds the new world on that terrain.
//
// 📊 Measured against the real base game, sampling every third pixel of the first land provinces:
//
//     before   province 2  mean height 102.2, 14 of 14 sampled pixels above sea level
//              province 3  mean height 101.4, 17 of 17 above
//     after    province 2  mean 89.0, ZERO above       (89.0 is what vanilla's own sea reads)
//              province 3  mean 89.0, ZERO above
//
//     3,969,959 pixels lowered, in one pass, and the whole blank still takes ~350 ms.
//
// ⚠️ The mod therefore acquires its own 11.5 MB heightmap.bmp. That is unavoidable — you cannot lower
// terrain you do not own — but it is a big file to gain silently, so the save says so.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

console.log("\n=== the blank asks the same helper the erase brush does ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  // ⚠️ MOVED WITH 🌍 Generate a world: blankMapToSea is now the wrapper that opens ONE backup scope over the whole blank
  // (blanked_maps/<stamp>), and the blank itself is blankMapToSeaInto — so the body read here is that one's.
  const a = SRC.indexOf("function blankMapToSeaInto(");
  const body = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10));
  ok(body.length > 0 && /\nfunction blankMapToSea\(opts\)[^]*?return blankMapToSeaInto\(/.test(SRC), "blankMapToSeaInto was found, and blankMapToSea hands the blank to it");
  ok(/sinkProvincesInHeightmap\(/.test(body),
    "⭐ it calls sinkProvincesInHeightmap, which only the erase path used to", body.slice(0, 120));
  ok(/provinceIds: flippedIds/.test(body),
    "…with the ids it actually flipped, in ONE pass rather than one call per province");
  ok(/heightmap = \{ changed: false/.test(body),
    "…best-effort, so a blank that has already rewritten definition.csv cannot fail on the heightmap");
  // ⚠️ THIS ASSERTION MOVED WITH THE FIX. It used to grep for the literal
  // `res.heightmap && res.heightmap.materialized` in the page, which stopped being true when
  // #a-retyped-province-keeps-its-old-look moved the decision into heightmapNote — the note now names EVERY
  // bitmap the mod has just taken a copy of, heightmap.bmp and terrain.bmp alike, and the call sites simply
  // ask it. A source-shape grep is a proxy anyway; RUN the function instead.
  // 🈯 Lifted CRLF-tolerantly on purpose: this repo checks out CRLF, and a bare-newline anchor finds nothing
  // in a fresh worktree while reporting success.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  ok(/res\.heightmap && res\.heightmap\.pixels/.test(MAP),
    "…and the save reads res.heightmap rather than only res.warnings");
  const s0 = MAP.indexOf("function heightmapNote(hm) {");
  const noteBody = s0 < 0 ? "" : MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
  let note = null;
  try { note = new Function(noteBody + "\nreturn heightmapNote;")(); } catch (_) { note = null; }
  const said = typeof note === "function" ? note({ pixels: 1703, raised: false, materialized: true }) : "";
  ok(/map\/heightmap\.bmp/.test(said),
    "…and the note tells the modder their mod just took its own heightmap.bmp", said);
}

console.log("\n=== 🈯 against the real base game ===");
if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp")) || !fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) {
  console.log("  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sink-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="Sink"\nsupported_version="1.19.*"\n');
  // ⛔ #a-blank-claims-a-world-the-mod-does-not-own — THIS FIXTURE MOVED WITH THE FIX.
  // The blank refuses outright on a mod that owns no map/provinces.bmp: it would be retyping 10,154
  // provinces whose shapes are the base game's, which is the moth-eaten world the owner played. This
  // section is about the HEIGHTMAP the blank lowers, so the fixture owns the world first — the one thing
  // the refusal tells the modder to do. (The refusal itself is owned by
  // test-a-blank-cannot-claim-a-world-the-mod-does-not-own.js.)
  fs.mkdirSync(path.join(m, "map"), { recursive: true });
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(m, "map", "provinces.bmp"));

  // Sample the height of a few land provinces, straight off the bitmaps, the way the sink itself reads them.
  const pbuf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const model = md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const land = (model.provinces || []).filter((p) => p.type === "land" && p.id > 0).slice(0, 3);
  ok(land.length === 3, "picked three land provinces to measure", land.map((p) => p.id));

  const sample = (hmPath) => {
    const hbuf = fs.readFileSync(hmPath);
    const hm = md.readIndexedBmp(hbuf);
    const dataOff = pbuf.readUInt32LE(10), W = pbuf.readInt32LE(18), H = pbuf.readInt32LE(22);
    const rowSize = Math.floor((24 * W + 31) / 32) * 4;
    const want = new Map();
    for (const p of land) want.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p.id);
    const per = {};
    for (const p of land) per[p.id] = { n: 0, above: 0 };
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
      const o = dataOff + (H - 1 - y) * rowSize + x * 3;
      const id = want.get(((pbuf[o + 2] << 16) | (pbuf[o + 1] << 8) | pbuf[o]) >>> 0);
      if (id === undefined) continue;
      per[id].n++;
      if (hbuf[hm.pixelOffset(x, y)] > 94) per[id].above++;   // 94 is the sink's own sea-level threshold
    }
    return per;
  };

  const before = sample(path.join(GAME, "map", "heightmap.bmp"));
  const measured = land.filter((p) => before[p.id].n > 0);
  ok(measured.length > 0, "…and they have pixels to measure", Object.entries(before).map(([k, v]) => k + ":" + v.n));
  ok(measured.every((p) => before[p.id].above > 0),
    "⚠️ they really do stand above sea level to begin with", before);

  const r = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  ok(r.changed === true && r.flippedProvinces > 1000,
    `the blank retyped ${r.flippedProvinces} provinces to sea`, r.flippedProvinces);
  ok(!!(r.heightmap && r.heightmap.changed && r.heightmap.pixels > 0),
    `⭐ …and lowered ${(r.heightmap || {}).pixels} heightmap pixels with them`, r.heightmap);
  ok(fs.existsSync(path.join(m, "map", "heightmap.bmp")),
    "…which means the mod now owns its own heightmap.bmp");
  ok(r.heightmap.materialized === true,
    "…and it says so, because 11.5 MB is not a file to gain in silence", r.heightmap);

  const after = sample(path.join(m, "map", "heightmap.bmp"));
  ok(measured.every((p) => after[p.id].above === 0),
    "⭐ NOT ONE sampled pixel of those provinces is still above sea level",
    { before: Object.fromEntries(measured.map((p) => [p.id, before[p.id]])),
      after: Object.fromEntries(measured.map((p) => [p.id, after[p.id]])) });
  ok(measured.every((p) => after[p.id].n === before[p.id].n),
    "…and the pixels are all still there — the provinces were lowered, not erased");

  console.log("\n=== ⚠️ a second blank writes nothing more ===");
  {
    // The sink only touches pixels ABOVE sea level, so the whole thing is idempotent.
    const r2 = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
    ok(!(r2.heightmap && r2.heightmap.pixels), "no pixels lowered the second time", r2.heightmap);
  }

  console.log("\n=== ⭐ THE MIRROR: Generate land raises the sea floor it built on ===");
  {
    // Generate land carves continents out of SEA provinces. Sea reads 89, sea level is 95 — so without
    // this the map says land and the game draws water, which is the same bug pointing the other way.
    const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-raise-")); tmps.push(g);
    mk(path.join(g, "descriptor.mod"), 'name="Raise"\nsupported_version="1.19.*"\n');
    const before = md.buildMapModel({ modRoot: g, gameRoot: GAME, dependencyRoots: [] });
    const wasSea = new Set((before.provinces || []).filter((p) => p.type === "sea").map((p) => p.id));

    const gen = md.generateLand({ modRoot: g, gameRoot: GAME, dependencyRoots: [], count: 60, seed: 11 });
    ok(gen.changed === true && gen.flippedProvinces > 0,
      `generated ${gen.flippedProvinces} land provinces`, gen.flippedProvinces);
    ok(!!(gen.heightmap && gen.heightmap.raised === true && gen.heightmap.pixels > 0),
      `⭐ …and raised ${(gen.heightmap || {}).pixels} heightmap pixels with them`, gen.heightmap);

    // Measure ONLY the provinces that actually went sea -> land.
    const after = md.buildMapModel({ modRoot: g, gameRoot: GAME, dependencyRoots: [] });
    const made = (after.provinces || []).filter((p) => p.type === "land" && wasSea.has(p.id));
    ok(made.length > 0, "…and they really did change type", made.length);

    const pbuf2 = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
    const dataOff = pbuf2.readUInt32LE(10), W = pbuf2.readInt32LE(18), H = pbuf2.readInt32LE(22);
    const rowSize = Math.floor((24 * W + 31) / 32) * 4;
    const want = new Map();
    for (const p of made) want.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p.id);
    const measure = (buf) => {
      const hmm = md.readIndexedBmp(buf);
      let n = 0, above = 0;
      for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
        const o = dataOff + (H - 1 - y) * rowSize + x * 3;
        if (!want.has(((pbuf2[o + 2] << 16) | (pbuf2[o + 1] << 8) | pbuf2[o]) >>> 0)) continue;
        n++;
        if (buf[hmm.pixelOffset(x, y)] > 95) above++;
      }
      return { n, above };
    };
    // ⚠️ Fall back to the base heightmap when the mod has none: a back-out that stops the raise leaves no
    // mod-side file, and a throw here would kill the run's summary instead of failing one check.
    const modHm = path.join(g, "map", "heightmap.bmp");
    const wasAt = measure(fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")));
    const nowAt = measure(fs.readFileSync(fs.existsSync(modHm) ? modHm : path.join(GAME, "map", "heightmap.bmp")));
    ok(wasAt.n > 0 && wasAt.above === 0,
      "⚠️ under those pixels the base heightmap really is entirely BELOW sea level", wasAt);
    // ⚠️ THIS ASSERTED "EVERY pixel above sea level", AND VANILLA ITSELF BREAKS THAT.
    // #new-land-needs-a-beach — raised land now meets the water with vanilla's own beach ramp
    // (89 sea → 94 shore → 97 → rising), so the shoreline fringe sits just BELOW the render waterline of
    // 95, exactly as the base game does: 6,961 of vanilla's sampled coastal land pixels are 94. Requiring
    // every pixel to clear 95 is requiring a cliff, which is what crashed the owner's map at render time.
    // The property that matters is that the province is LAND — overwhelmingly above, with a thin fringe.
    ok(nowAt.n === wasAt.n && nowAt.above > nowAt.n * 0.8,
      `⭐ …and ${nowAt.above} of ${nowAt.n} are now above it, the rest being the beach fringe`,
      { before: wasAt, after: nowAt });

    const again = md.generateLand({ modRoot: g, gameRoot: GAME, dependencyRoots: [], count: 1, seed: 11 });
    ok(!(again.heightmap && again.heightmap.pixels && again.flippedProvinces === 0),
      "…and land that is already high keeps its own contour", again.heightmap);
  }

  console.log("\n=== ⭐ THE THIRD INSTANCE: the province inspector's own type dropdown ===");
  {
    // flipProvinceToSea sinks the province it drowns. The opposite change — sea → land — comes through
    // setProvinceDefinition instead, and nothing raised it. Measured on vanilla province 4: definition.csv
    // said land while heightmap.bmp kept the flat 89.0 sea floor it was carved out of, 0% above sea level,
    // and the mod ended up shipping no heightmap at all.
    const s = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sea2land-")); tmps.push(s);
    mk(path.join(s, "descriptor.mod"), 'name="Sea2Land"\nsupported_version="1.19.*"\n');
    const model2 = md.buildMapModel({ modRoot: s, gameRoot: GAME, dependencyRoots: [] });
    const seaProv = (model2.provinces || []).find((p) => p.type === "sea" && p.id > 0);
    ok(!!seaProv, "picked a sea province to raise", seaProv && seaProv.id);

    const pb = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
    const dOff = pb.readUInt32LE(10), W2 = pb.readInt32LE(18), H2 = pb.readInt32LE(22);
    const rs = Math.floor((24 * W2 + 31) / 32) * 4;
    const key = ((seaProv.r << 16) | (seaProv.g << 8) | seaProv.b) >>> 0;
    const look = (buf) => {
      const hmm = md.readIndexedBmp(buf);
      let n = 0, above = 0;
      for (let y = 0; y < H2; y += 2) for (let x = 0; x < W2; x += 2) {
        const o = dOff + (H2 - 1 - y) * rs + x * 3;
        if ((((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0) !== key) continue;
        n++;
        if (buf[hmm.pixelOffset(x, y)] > 95) above++;
      }
      return { n, above };
    };
    const was = look(fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")));
    ok(was.n > 0 && was.above === 0, "⚠️ it really is entirely below sea level to begin with", was);

    const r = md.setProvinceDefinition({
      modRoot: s, gameRoot: GAME, dependencyRoots: [],
      provinceId: seaProv.id, type: "land", terrain: "plains", coastal: false,
    });
    ok(r.changed === true, "the type change is written", r.error);
    ok(!!(r.heightmap && r.heightmap.raised === true && r.heightmap.pixels > 0),
      "⭐ …and the terrain is raised with it", r.heightmap);
    const hmFile = path.join(s, "map", "heightmap.bmp");
    const now = look(fs.readFileSync(fs.existsSync(hmFile) ? hmFile : path.join(GAME, "map", "heightmap.bmp")));
    // ⚠️ Same correction as above: the shoreline fringe is DELIBERATELY below the waterline now, because
    // that is what vanilla does. #new-land-needs-a-beach
    ok(now.n === was.n && now.above > now.n * 0.8,
      `⭐ …so ${now.above} of ${now.n} of its pixels are now above sea level, the rest being its beach`,
      { before: was, after: now });

    // ⚠️ THE CONTROL THAT MATTERS. An ordinary terrain repaint on land must not touch the heightmap at all —
    // otherwise painting one province forest reads and rewrites 11.5 MB and materialises the file.
    const t = fs.mkdtempSync(path.join(os.tmpdir(), "nova-repaint-")); tmps.push(t);
    mk(path.join(t, "descriptor.mod"), 'name="Repaint"\nsupported_version="1.19.*"\n');
    // …and it has to actually CHANGE something, or "no heightmap written" is true for the wrong reason:
    // editDefinitionCsv reports no change when the terrain is already what you asked for.
    const landProv = (model2.provinces || []).find((p) => p.type === "land" && p.id > 0 && p.terrain !== "forest");
    const r2 = md.setProvinceDefinition({
      modRoot: t, gameRoot: GAME, dependencyRoots: [], provinceId: landProv.id, terrain: "forest",
    });
    ok(r2.changed === true, "an ordinary terrain repaint still works", r2.error);
    ok(!(r2.heightmap && r2.heightmap.pixels), "⚠️ …and touches no heightmap pixel", r2.heightmap);
    ok(!fs.existsSync(path.join(t, "map", "heightmap.bmp")),
      "⚠️ …and does NOT make the mod acquire an 11.5 MB heightmap.bmp");
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== delete map lowers the land it drowned: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
