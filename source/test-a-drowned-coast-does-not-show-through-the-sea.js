// ⛔ #a-drowned-coast-shows-through-the-sea — THE OWNER'S "LONE TINY ISLANDS".
//
// After playing TEST 28 (a world Nova built: Delete map → Generate land → Auto-fix → Redraw regions) the owner wrote:
// "a LOT of lone tiny islands that are not owned by anyone … they usually follow the line of the inner sea province,
// like the caspian sea … the islands follow the boarders of the provinces perfectly … the sandy color following the
// black line".
//
// They were not land. HOI4's water shader (gfx/FX/pdxwater.shader) draws water opaque only at or below a height of 91,
// and more and more see-through from 92 to 95. Vanilla's beach is a one-pixel ring of 94 on the land side of every
// coast, and the sink under Delete map and the erase brush lowered only what stood ABOVE 95 — so the whole of the old
// world's beach stayed in the new sea, and the land under it showed through, exactly along the old coasts. A coast is
// always a province border, which is why it followed the black lines. On TEST 28: 47,606 sea pixels at 94–95, 92% of
// them on a province border, and 692 of the 733 drowned vanilla islands still outlined in sand.
//
// The writers now sink land that WAS land from above 89 — beach included — and settle the vanilla shallows left in open
// sea beside it (within 3 px of the drowned land, with no standing land as close). Worlds built before the fix get a
// Map Errors warning and an Auto-fix step that recognises only what the old sink left, by its fingerprint: every pixel
// 89 or exactly the layer below's own height at or under 95. A rule on height alone fires on every shipping map.
//
// Pinned here: a Delete map over the real base game leaves no drowned pixel above 89 and exactly vanilla's own deep
// shallows; the repair settles a fabricated old-sink world, leaves a hand-shaped decoy byte-identical, writes nothing
// the second time, and never takes a heightmap the mod inherits; and every land-to-water sink in the source says
// whether the land was land.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");
const L = require("./public/map-rule-labels.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const roots = [];
const mkMod = () => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-drowned-coast-"));
  roots.push(m);
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="drowned coast"\n', "utf8");
  fs.mkdirSync(path.join(m, "map"), { recursive: true });
  return m;
};
const hashDir = (d) => {
  const out = {};
  for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isFile()) out[f] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); }
  return out;
};

console.log("\n-- every land-to-water sink says whether the land was land --");
{
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const calls = [];
  for (let i = src.indexOf("sinkProvincesInHeightmap("); i >= 0; i = src.indexOf("sinkProvincesInHeightmap(", i + 1)) {
    if (src.slice(Math.max(0, i - 9), i) === "function ") continue;
    let depth = 0, j = i + "sinkProvincesInHeightmap".length;
    for (; j < src.length; j++) { if (src[j] === "(") depth++; else if (src[j] === ")" && --depth === 0) break; }
    calls.push(src.slice(i, j + 1));
  }
  const sinks = calls.filter((c) => !/raise:\s*true/.test(c));
  ok(calls.length >= 5 && sinks.length >= 3, `found the sink's call sites (${calls.length}, ${sinks.length} of them lowering)`, calls.map((c) => c.slice(0, 90)));
  const silent = sinks.filter((c) => !/drowned:/.test(c));
  ok(!silent.length, "…and every one that lowers passes `drowned:` explicitly", silent.map((c) => c.slice(0, 160)));
}

if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp")) || !fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + (pass + fail)));
  process.exitCode = fail ? 1 : 0;
} else {
  // ── the base game, read once ──────────────────────────────────────────────────────────────────────────────
  const defText = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8");
  const defEol = defText.includes("\r\n") ? "\r\n" : "\n";
  const rows = defText.split(/\r?\n/);
  const typeOf = new Map(), idOf = new Map(), coastal = new Set();
  for (const l of rows) {
    const c = l.split(";");
    if (c.length < 8 || !(+c[0] > 0)) continue;
    const k = ((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0;
    typeOf.set(k, c[4]); idOf.set(k, +c[0]);
    if (c[4] === "land" && c[5] === "true") coastal.add(+c[0]);
  }
  const vHm = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")), hmv = md.readIndexedBmp(vHm);
  const pb = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const off = pb.readUInt32LE(10), W = pb.readInt32LE(18), H = pb.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
  const pixId = new Int32Array(W * H), isLand = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = off + (H - 1 - y) * rs + x * 3, k = ((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0;
    pixId[y * W + x] = idOf.get(k) || 0;
    if (typeOf.get(k) === "land") isLand[y * W + x] = 1;
  }
  const hAt = (buf, x, y) => buf[hmv.pixelOffset(x, y)];
  const FR = md.HEIGHTMAP_SEA_FRINGE;
  const nearLand = (x, y) => {
    for (let dy = -FR; dy <= FR; dy++) {
      const ny = y + dy; if (ny < 0 || ny >= H) continue;
      const reach = FR - Math.abs(dy);
      for (let dx = -reach; dx <= reach; dx++) if ((dx || dy) && isLand[ny * W + (((x + dx) % W) + W) % W]) return true;
    }
    return false;
  };

  try {
    console.log("\n-- ⭐ Delete map over the real base game leaves no old coast in the sea --");
    {
      const m = mkMod();
      fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(m, "map", "provinces.bmp"));   // the blank needs an owned world
      // What should be left above the sea floor afterwards, worked out from vanilla alone: the base game's own water above 89
      // with no land within the fringe. Everything else above 89 was land, or shallows beside land that is now gone.
      let keep = 0, landWasAbove = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, h = hAt(vHm, x, y);
        if (h <= md.HEIGHTMAP_SEA_VALUE) continue;
        if (isLand[i]) landWasAbove++;
        else if (!nearLand(x, y)) keep++;
      }
      const r = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
      ok(r.changed && r.flippedProvinces > 1000, `the blank retyped ${r.flippedProvinces} provinces`, r.error);
      ok(r.heightmap && r.heightmap.drowned === true && r.heightmap.fringe > 0,
        `…sank them as land that was land, shallows beside them included (${r.heightmap && r.heightmap.fringe} fringe pixels)`, r.heightmap);
      const mHm = fs.readFileSync(path.join(m, "map", "heightmap.bmp"));
      let drownedAbove = 0, waterAbove = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const h = hAt(mHm, x, y);
        if (h <= md.HEIGHTMAP_SEA_VALUE) continue;
        if (isLand[y * W + x]) drownedAbove++; else waterAbove++;
      }
      ok(landWasAbove > 3000000 && drownedAbove === 0,
        `not one of the ${landWasAbove.toLocaleString()} drowned pixels that stood above the sea floor is left above it`, { drownedAbove });
      ok(waterAbove === keep,
        `the only water left above 89 is the base game's own, far from any coast it ever had (${waterAbove} = ${keep})`, { waterAbove, keep });
      const f = md.findDrownedCoast({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
      ok(f.remnantPixels === 0 && f.fringePixels === 0, "…so Map Errors has nothing to report on a world blanked today", f);
      const again = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
      ok(Buffer.compare(fs.readFileSync(path.join(m, "map", "heightmap.bmp")), mHm) === 0 && !(again.heightmap && again.heightmap.pixels),
        "…and a second blank leaves the heightmap byte-identical", again.heightmap);
    }

    console.log("\n-- ⭐ erasing an island leaves the reef a modder built beside it (review of 620258f) --");
    {
      // The shore fringe settles shallows only while they still read the layer below's height. A reef the mod shaped is
      // not the old coast: before this, erasing island 11047 flattened 675 of 675 pixels of one in the sea beside it.
      const touchesLand = new Set(), size = new Map();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!isLand[i]) continue;
        const id = pixId[i]; size.set(id, (size.get(id) || 0) + 1);
        for (const q of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (q >= 0 && q < W * H && isLand[q] && pixId[q] !== id) touchesLand.add(id);
      }
      const islands = [...size].filter(([id, n]) => !touchesLand.has(id) && n >= 20).map(([id]) => id).sort((a, b) => a - b);
      let island = null, reef = [];
      const near = (i, R, pred) => { const x = i % W, y = (i - x) / W; for (let dy = -R; dy <= R; dy++) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const r = R - Math.abs(dy); for (let dx = -r; dx <= r; dx++) { const q = ny * W + (((x + dx) % W) + W) % W; if ((dx || dy) && pred(q)) return true; } } return false; };
      for (const id of islands.slice(0, 40)) {
        const px = []; for (let i = 0; i < W * H; i++) if (pixId[i] === id) px.push(i);
        const cand = new Set();
        for (const i of px) { const x = i % W, y = (i - x) / W; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const q = ny * W + (((x + dx) % W) + W) % W; if (!isLand[q]) cand.add(q); } }
        const r = [...cand].filter((q) => !near(q, 4, (k) => isLand[k] && pixId[k] !== id));
        if (r.length >= 20) { island = id; reef = r; break; }
      }
      ok(island != null, `found a small island standing alone in the sea (${island}), with ${reef.length} pixels of water around it for a reef`);
      if (island != null) {
        const m = mkMod();
        const hmReef = Buffer.from(vHm);
        for (const q of reef) { const x = q % W; hmReef[hmv.pixelOffset(x, (q - x) / W)] = 93; }
        fs.writeFileSync(path.join(m, "map", "heightmap.bmp"), hmReef);
        const r = md.flipProvinceToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [], provinceId: island });
        ok(r && r.changed && r.heightmap && r.heightmap.changed, "the island was erased and sunk", r && (r.error || r.heightmap));
        const after = fs.readFileSync(path.join(m, "map", "heightmap.bmp"));
        const flattened = reef.filter((q) => { const x = q % W; return after[hmv.pixelOffset(x, (q - x) / W)] !== 93; }).length;
        ok(flattened === 0, `⭐ …and every one of the ${reef.length} reef pixels the mod shaped beside it is still 93`, { flattened, fringe: r.heightmap && r.heightmap.fringe });
      }
    }

    // ── a world built BEFORE the fix, fabricated with the old sink's exact fingerprint ─────────────────────────
    // Thirty coastal land provinces retyped to sea, their pixels above 95 lowered to 89 and nothing else — what the old
    // sink wrote. The last of them is a DECOY: one of its shore pixels hand-shaped to a height neither 89 nor the base
    // game's, which is how a modder's own sea floor looks to the repair.
    const stats = new Map();
    for (let i = 0; i < W * H; i++) {
      const id = pixId[i]; if (!coastal.has(id)) continue;
      const x = i % W, h = hAt(vHm, x, (i - x) / W);
      let s = stats.get(id); if (!s) stats.set(id, s = { hi: 0, shore: 0, px: [] });
      s.px.push(i);
      if (h > md.HEIGHTMAP_SEA_LEVEL) s.hi++; else if (h > md.HEIGHTMAP_SEA_VALUE) s.shore++;
    }
    const picked = [...stats.entries()].filter(([, s]) => s.hi > 20 && s.shore > 5).sort((a, b) => a[0] - b[0]).slice(0, 30);
    const pickedIds = new Set(picked.map(([id]) => id));
    // ⚠️ The decoy BORDERS another drowned province (review of 620258f): the shore fringe then reaches into it, and a decoy
    // off on its own proved nothing about the fringe — that is how 498 of 498 hand-shaped pixels went flat unseen.
    const within = (i, R, pred) => { const x = i % W, y = (i - x) / W; for (let dy = -R; dy <= R; dy++) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const r = R - Math.abs(dy); for (let dx = -r; dx <= r; dx++) if ((dx || dy) && pred(pixId[ny * W + (((x + dx) % W) + W) % W])) return true; } return false; };
    const decoyEntry = picked.slice().reverse().find(([id, s]) => s.px.some((i) => within(i, 1, (q) => q !== id && pickedIds.has(q))));
    const decoyId = decoyEntry ? decoyEntry[0] : picked[picked.length - 1][0];
    const old = Buffer.from(vHm);
    let decoyPixel = -1, decoyValue = 0, shoal = 0;
    for (const [id, s] of picked) for (const i of s.px) {
      const x = i % W, y = (i - x) / W, o = hmv.pixelOffset(x, y), h = old[o];
      if (h > md.HEIGHTMAP_SEA_LEVEL) old[o] = md.HEIGHTMAP_SEA_VALUE;
      // the decoy's hand-made shoal: every one of its pixels within the fringe's reach of the drowned province beside it
      if (id === decoyId && within(i, md.HEIGHTMAP_SEA_FRINGE, (q) => q !== id && pickedIds.has(q))) {
        const v = h === 93 ? 92 : 93; old[o] = v; shoal++;
        if (decoyPixel < 0) { decoyPixel = i; decoyValue = v; }
      }
    }
    const defOut = rows.map((l) => {
      const c = l.split(";");
      if (c.length >= 8 && pickedIds.has(+c[0])) { c[4] = "sea"; c[5] = "false"; c[6] = "ocean"; c[7] = "0"; return c.join(";"); }
      return l;
    }).join(defEol);
    const oldWorld = () => {
      const m = mkMod();
      fs.writeFileSync(path.join(m, "map", "definition.csv"), defOut);
      fs.writeFileSync(path.join(m, "map", "heightmap.bmp"), old);
      return m;
    };
    let remnant = 0;
    for (const [id, s] of picked) if (id !== decoyId) remnant += s.shore;

    console.log("\n-- ⭐ a world built before the fix is found by the old sink's fingerprint, and only that --");
    const m = oldWorld();
    const ctx = { modRoot: m, gameRoot: GAME, dependencyRoots: [] };
    {
      ok(picked.length === 30 && decoyPixel >= 0 && !!decoyEntry && shoal >= 10,
        `fabricated 30 drowned provinces, one of them (${decoyId}) with a hand-made shoal of ${shoal} pixels beside its drowned neighbour`, { n: picked.length, decoyPixel, shoal });
      const f = md.findDrownedCoast(ctx);
      const want = picked.map(([id]) => id).filter((id) => id !== decoyId);
      ok(JSON.stringify([...f.provinceIds].sort((a, b) => a - b)) === JSON.stringify(want),
        "it finds exactly the 29 the old sink left, and not the decoy", { got: f.provinceIds.length, leftAlone: f.leftAlone });
      ok(f.leftAlone >= 1, "…and says it left the hand-shaped one alone", f.leftAlone);
      ok(f.remnantPixels === remnant, `…with exactly their ${remnant} shore pixels still above the sea floor`, f.remnantPixels);
      const probs = md.validateMapBitmap(ctx);
      const p = probs.find((q) => q.rule === "drowned_coast_shows_through_the_sea");
      ok(!!p && p.total === f.remnantPixels + f.fringePixels && p.severity === "warning" && p.autoFix === true,
        "Map Errors reports it, as a warning Auto-fix can repair, counting what it will settle", p && { total: p.total, severity: p.severity });
      ok(!L.isFatalRule("drowned_coast_shows_through_the_sea"), "…and it is not in the fatal set: the owner played three worlds like this");
    }

    console.log("\n-- ⭐ Auto-fix's repair settles it, leaves the decoy, and settles ONCE --");
    {
      const before = fs.readFileSync(path.join(m, "map", "heightmap.bmp"));
      // every file of the mod, by path, so the summary can be held to what was really written
      const treeHash = (root) => {
        const out = {};
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(root, p).split(path.sep).join("/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } };
        walk(root);
        return out;
      };
      const tree0 = treeHash(m);
      const f0 = md.findDrownedCoast(ctx);
      const r = md.settleDrownedSeaFloor(ctx);
      ok(r.changed && r.pixels === f0.remnantPixels + f0.fringePixels,
        `it lowered exactly what Map Errors counted (${r.pixels})`, { pixels: r.pixels, counted: f0.remnantPixels + f0.fringePixels, error: r.error });
      const after = fs.readFileSync(path.join(m, "map", "heightmap.bmp"));
      let moved = 0, notToFloor = 0, outside = 0;
      const domain = new Set(f0.provinceIds);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = hmv.pixelOffset(x, y);
        if (after[o] === before[o]) continue;
        moved++;
        if (after[o] !== md.HEIGHTMAP_SEA_VALUE) notToFloor++;
        if (!domain.has(pixId[y * W + x]) && isLand[y * W + x]) outside++;
      }
      ok(moved === r.pixels && notToFloor === 0 && outside === 0,
        "…every pixel it moved went to the sea floor, and no land outside the drowned provinces moved", { moved, notToFloor, outside });
      let decoySame = true;
      for (const i of stats.get(decoyId).px) { const x = i % W, o = hmv.pixelOffset(x, (i - x) / W); if (after[o] !== before[o]) decoySame = false; }
      ok(decoySame, "⭐ the hand-shaped province is byte-identical — a sea floor somebody made is not the repair's");
      const stillAbove = [];
      for (const [id] of picked) if (id !== decoyId) {
        let above = 0;
        for (const i of stats.get(id).px) { const x = i % W; if (after[hmv.pixelOffset(x, (i - x) / W)] > md.HEIGHTMAP_SEA_VALUE) above++; }
        if (above) stillAbove.push({ id, above });
      }
      ok(!stillAbove.length, "none of the 29 has a pixel left above the sea floor", stillAbove);
      ok(fs.existsSync(path.join(m, "map", "terrain.bmp")), "…and the ground under the water was repainted with it (terrain.bmp)", r.terrain);
      // ⭐ …and the Auto-fix line names every file the step really wrote — read off the disk, not off the answer. It named the
      // bitmaps and the colour pictures and left out the minimap and the model files (reviews of add0eb0 and 6a1fd27).
      const tree1 = treeHash(m);
      const written = Object.keys(tree1).filter((f) => tree1[f] !== tree0[f] && /^(map|gfx)\//.test(f)).sort();
      const said = require("./testlib-map-page.js").autoFixSummary({ ok: true, fixes: { drownedCoast: r } });
      ok(written.includes("gfx/minimap/minimap.dds"), "CONTROL: the step repainted the minimap on the base game's own map", written);
      ok(written.length >= 3 && written.every((f) => said.includes(f)), "⭐⭐ the Auto-fix summary names every file the step wrote, the minimap among them", { missing: written.filter((f) => !said.includes(f)), said });
      const f1 = md.findDrownedCoast(ctx);
      ok(f1.remnantPixels === 0 && f1.fringePixels === 0, "the check, asked again at once, finds nothing (no stale cached answer)", f1);
      const probs = md.validateMapBitmap(ctx);
      ok(!probs.some((q) => q.rule === "drowned_coast_shows_through_the_sea"), "…and Map Errors no longer reports it");
      const snap = hashDir(path.join(m, "map"));
      const r2 = md.settleDrownedSeaFloor(ctx);
      ok(!r2.changed && JSON.stringify(hashDir(path.join(m, "map"))) === JSON.stringify(snap),
        "⭐ a second repair writes nothing: every file in map/ is byte-identical", r2);
    }

    console.log("\n-- it never takes a heightmap the mod inherits --");
    {
      const m2 = mkMod();
      fs.writeFileSync(path.join(m2, "map", "definition.csv"), defOut);
      const f = md.findDrownedCoast({ modRoot: m2, gameRoot: GAME, dependencyRoots: [] });
      const r = md.settleDrownedSeaFloor({ modRoot: m2, gameRoot: GAME, dependencyRoots: [] });
      ok(!f.provinceIds.length && /does not own/.test(String(f.reason)), "the check declines, and says why", f);
      ok(!r.changed && !fs.existsSync(path.join(m2, "map", "heightmap.bmp")), "…and the repair copies nothing into the mod", r);
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
