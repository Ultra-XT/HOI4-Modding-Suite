// ⛔ #a-river-without-a-source-is-invisible  +  #inherited-problem-not-yours
//
// The owner's report was "we can't add rivers". Every layer of the tool turned out to work — the palette
// loads, a drag paints, Save writes rivers.bmp — and the river still does not appear IN THE GAME, because
// the wiki is explicit: "each river must have exactly one, by default green, start marker" and without one
// HOI4 renders nothing. So the tool did its job perfectly and produced an invisible river.
//
// The repair already existed inside fixMalformedRivers (turn an endpoint green) and only ran if the modder
// happened to open Map Errors and press Auto-fix — which is not something you know to do when nothing looks
// wrong. The paint path now runs it for the river you just drew.
//
// Safe automatically because the check is per CONNECTED COMPONENT: a stroke touching an existing river joins
// it and inherits its source, so a tributary never gets a second one. Measured below both ways.
//
// ⛔ AND THE WARNING WAS BLAMING PARADOX'S RIVERS ON THE MODDER. The base game's own rivers.bmp holds 12
// sourceless components (1,32,5,1,1,5,9,30,5,33,5,107 px). Road to 56 ships a near-identical copy, so before
// touching anything Map Errors said "12 rivers have no source" — and Auto-fix would have EDITED PARADOX'S
// SHIPPED MAP, adding 9 green sources and wiping 3 pixels as noise, in a mod whose author drew no rivers.
// The old guard ("only check when the mod ships its own rivers.bmp") did not help: the paint tool CREATES
// the mod's copy from the base one, so drawing a single river made all 12 "yours".
//
// ⚠️ The comparison is PER PIXEL, not per file byte. R56's rivers.bmp is 11,535,414 bytes against vanilla's
// 11,535,416 — two bytes of header — and a length-gated compare rejected it outright and reported all twelve.
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
const VAN = path.join(GAME, "map", "rivers.bmp");
if (!fs.existsSync(VAN)) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const modFrom = (src) => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), "nova-riversrc-"));
    roots.push(r);
    fs.mkdirSync(path.join(r, "map"), { recursive: true });
    fs.writeFileSync(path.join(r, "descriptor.mod"), 'version="1.0"\nname="River Source Test"\n', "utf8");
    if (src) fs.copyFileSync(src, path.join(r, "map", "rivers.bmp"));
    return r;
  };
  const dry = (r) => md.fixMalformedRivers({ modRoot: r, gameRoot: GAME, dependencyRoots: [], dryRun: true });
  // An isolated patch of land with no river in it, found rather than guessed — a river drawn on top of an
  // existing one would join it and inherit its source, which is a different case (covered separately below).
  const emptySpot = (file) => {
    const buf = fs.readFileSync(file), bmp = md.readIndexedBmp(buf), pal = bmp.palette;
    const grey = (c) => c && Math.abs(c.r - c.g) <= 12 && Math.abs(c.g - c.b) <= 12 && Math.abs(c.r - c.b) <= 12;
    let land = -1;
    for (let i = 0; i < pal.length; i++) { const c = pal[i]; if (grey(c) && c.r > 40 && c.r < 210) { land = i; break; } }
    for (let x = 2600; x < 3200; x += 4) for (let y = 700; y < 900; y += 4) {
      let clear = true;
      for (let dy = 0; dy < 12 && clear; dy++) for (let dx = 0; dx < 60; dx++) {
        if (buf[bmp.pixelOffset(x + dx, y + dy)] !== land) { clear = false; break; }
      }
      if (clear) return { x, y, land };
    }
    return null;
  };
  const strokeAt = (p, n = 40) => {
    const out = [];
    for (let d = 0; d < n; d++) {
      const cur = { x: p.x + d, y: p.y + Math.floor(d / 4), index: 3 };
      const nxt = { x: p.x + d + 1, y: p.y + Math.floor((d + 1) / 4) };
      out.push(cur);
      if (nxt.y !== cur.y) out.push({ x: nxt.x, y: cur.y, index: 3 }); // orthogonal bridge, as the tool draws
    }
    return out;
  };

  try {
    console.log("\n-- ⭐ THE CRY-WOLF CONTROL: the base game's own rivers must not be reported --");
    {
      const m = modFrom(VAN);                       // a mod whose rivers.bmp IS vanilla's, byte for byte
      const d = dry(m);
      ok((d.sourceless || []).length === 0,
        "an untouched copy of vanilla's rivers.bmp reports nothing", (d.sourceless || []).slice(0, 3));
      ok((d.inheritedSkipped || 0) >= 10,
        `…because its ${d.inheritedSkipped} sourceless rivers are recognised as inherited`, d.inheritedSkipped);
      ok((d.addedSources || 0) === 0 && (d.removedComponents || 0) === 0,
        "…and Auto-fix would not touch Paradox's shipped map", { add: d.addedSources, del: d.removedComponents });
    }

    console.log("\n-- a river you draw yourself IS reported, and gets its source on save --");
    {
      const m = modFrom(VAN);
      const spot = emptySpot(VAN);
      ok(!!spot, "found a patch of land with no existing river to join", spot);
      if (spot) {
        const res = md.writeRiversPaint({ modRoot: m, gameRoot: GAME, dependencyRoots: [], edits: strokeAt(spot) });
        ok(res.ok && res.changed > 0, "the river is written", { ok: res.ok, changed: res.changed });
        ok(res.addedSource === 1, "…and exactly one green source was added for it", res.addedSource);
        ok(res.sourceAt && Number.isFinite(res.sourceAt.x), "…and the caller is told WHERE, so it can say so", res.sourceAt);

        const buf = fs.readFileSync(path.join(m, "map", "rivers.bmp"));
        const bmp = md.readIndexedBmp(buf);
        const counts = {};
        for (const p of strokeAt(spot)) { const v = buf[bmp.pixelOffset(p.x, p.y)]; counts[v] = (counts[v] || 0) + 1; }
        ok(counts[0] === 1, "the river carries EXACTLY ONE source pixel — more than one is also invalid", counts);
        ok((counts[3] || 0) > 10, "…and the rest of it is river body", counts);
        ok((dry(m).sourceless || []).length === 0, "…so nothing is left sourceless", dry(m).sourceless);
      }
    }

    console.log("\n-- ⭐ CONTROL: without the fix that same river is invisible in game --");
    {
      // Paint the identical pixels with no source, exactly as the tool used to leave them.
      const m = modFrom(VAN);
      const spot = emptySpot(VAN);
      const buf = fs.readFileSync(path.join(m, "map", "rivers.bmp"));
      const bmp = md.readIndexedBmp(buf);
      for (const p of strokeAt(spot)) buf[bmp.pixelOffset(p.x, p.y)] = 3;
      fs.writeFileSync(path.join(m, "map", "rivers.bmp"), buf);
      ok((dry(m).sourceless || []).length === 1,
        "a hand-painted river with no source IS reported — the fix above is load-bearing", dry(m).sourceless);
    }

    console.log("\n-- a tributary joining an existing river must NOT get a second source --");
    {
      // The wiki: "Only the 'main branch' of the river should have the green source pixel, any branch
      // connected to it via the red flow-in shouldn't have it." A stroke touching an existing river becomes
      // one component with it, so the per-component check gives it no source of its own — by construction.
      const m = modFrom(VAN);
      const spot = emptySpot(VAN);
      const first = strokeAt(spot);
      md.writeRiversPaint({ modRoot: m, gameRoot: GAME, dependencyRoots: [], edits: first });
      // a second stroke starting ON the first river
      const join = first[first.length - 1];
      const branch = [];
      for (let d = 1; d <= 12; d++) branch.push({ x: join.x, y: join.y + d, index: 3 });
      const res2 = md.writeRiversPaint({ modRoot: m, gameRoot: GAME, dependencyRoots: [], edits: branch });
      ok(res2.ok, "the branch is written", res2.error);
      ok(res2.addedSource === 0, "…and gets NO source of its own, because it joins a river that has one",
        res2.addedSource);

      const buf = fs.readFileSync(path.join(m, "map", "rivers.bmp"));
      const bmp = md.readIndexedBmp(buf);
      let greens = 0;
      for (const p of first.concat(branch)) if (buf[bmp.pixelOffset(p.x, p.y)] === 0) greens++;
      ok(greens === 1, "the whole river still has exactly one source", greens);
    }

    console.log("\n-- the comparison survives a mod whose rivers.bmp differs only in header bytes --");
    {
      // Road to 56's file is 2 bytes smaller than vanilla's with identical pixels. A length-gated compare
      // called every one of its inherited rivers the modder's own.
      const R56 = "D:/SteamLibrary/steamapps/workshop/content/394360/820260968/map/rivers.bmp";
      if (!fs.existsSync(R56)) console.log("  ..   skipped: Road to 56 is not installed");
      else {
        const van = fs.statSync(VAN).size, r56 = fs.statSync(R56).size;
        const m = modFrom(R56);
        const d = dry(m);
        ok(van !== r56, `the two files really are different sizes (${van} vs ${r56}), so this is the real case`);
        ok((d.inheritedSkipped || 0) >= 10,
          `${d.inheritedSkipped} of its rivers are recognised as inherited despite the size difference`, d.inheritedSkipped);
        ok((d.sourceless || []).length <= 2,
          "…leaving only what Road to 56 itself changed", (d.sourceless || []).length);
      }
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }

  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
