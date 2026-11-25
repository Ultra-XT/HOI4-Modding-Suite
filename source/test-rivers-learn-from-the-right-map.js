// A generated world's rivers are learnt from the map they will stand in: the mod's own, when it draws its own rivers, else the
// whole map below it — and nothing is learnt from a map that is not there or paints from another palette.
// #rivers-learn-from-the-right-map (critic R4)
//
// THE DEFECT, in the design. "Learn from the first layer below" is vanilla for every installed total conversion, because none of
// them replaces map/ itself (HoM ships map/strategicregions only). Their own worlds draw rivers on 3.95% (HoM) and 6.51% (OWB)
// of their land-land borders against vanilla's 21.57%, so new land there would get 3.3–5.5× its world's rivers.
//
// THE RULE (riversLearnt): the mod's own map when it owns provinces.bmp and rivers.bmp and has rivers on land outside the provinces
// this write raises and outside those an earlier Generate land drew rivers for (both left out of the sample) — enough of them to
// say what its rivers are like; else the map below as the game loads it, each file from the first layer that ships it. A Nova
// world after Delete map has no river left, and so still learns from what it was built over.
//
// THE REVIEW (F1, F2, F4): one short river of the mod's own taught a climb cap of 0, and the new land got no rivers; a second
// Generate land learnt from the first one's rivers, cut at the caps they were drawn by, so every generation drifted (TEST 31:
// minMain 38 → 62 in four); and an add-on over a mod shipping only rivers.bmp learnt the base game's rivers, 4× what the game shows.
//
// Fixtures on disk (testlib-river-world.js): a base game holding the hand-drawn sample, and mods over it. Every share expected
// here is counted by this test off the arrays it wrote.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const RW = require("./testlib-river-world.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rivers-learn-"));
process.env.NOVA_HOME_DIR = path.join(TMP, "home");   // the record of Nova's own rivers lives under ~/.nova: this test's, not yours
const S = RW.gridSample();
// short rivers by the coast, one to a band of squares (heads x 70..106), and the fewest a map must draw to be learnt from: the 95th
// percentile by nearest rank of n values is the one at rank floor(0.95 (n − 1) + 0.5), and under `fewest` that is the largest
const SHORT = Array.from({ length: 13 }, (_, i) => ({ y: 31 + 16 * i, head: 70 + ((i * 7) % 41) }));
let fewest = 1; while (Math.floor(0.95 * (fewest - 1) + 0.5) >= fewest - 1) fewest++;
// a SPARSE world: one long river with a tributary, and the short ones — rivers on a small share of its border
const SPARSE = RW.gridSample({ mains: [RW.SAMPLE_MAINS[0], ...SHORT], tribs: [RW.SAMPLE_TRIBS[0]] });
const shareOf = (w, skip = null) => RW.borderShareOf({ W: w.W, H: w.H, isLand: (k) => w.type[k] === 1 && !(skip && skip.has(w.pid[k])), pid: w.pid, isRiver: (k) => RW.isRiverIndex(w.idx[k]) && !(skip && skip.has(w.pid[k])) }).share;
const mod = (name, descriptor = "") => { const d = path.join(TMP, "mods", name); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${name}"\n${descriptor}`); return d; };
const ask = (modRoot, gameRoot, provinceIds = []) => md.riversLearnt({ modRoot, gameRoot, dependencyRoots: [], provinceIds });

try {
  const GAME = path.join(TMP, "game"); RW.writeMap(GAME, S);
  const denseShare = shareOf(S);

  console.log("1. A mod that draws no rivers of its own learns from the map below");
  {
    const r = ask(mod("Plain"), GAME);
    rec("⭐ learnt from the map underneath, the base game's share as this test counts it", !!r.learnt && r.from === "the map underneath" && Math.abs(r.learnt.borderShare - denseShare) < 1e-12, { from: r.from, got: r.learnt && r.learnt.borderShare, denseShare });
    rec("…and from the base game's own root", r.root === GAME, r.root);
  }

  console.log("\n2. Nothing below → nothing learnt, and the reason");
  {
    const EMPTY = path.join(TMP, "game-no-rivers"); RW.writeMap(EMPTY, S, { rivers: false });
    const r = ask(mod("Over A Riverless Game"), EMPTY);
    rec("⭐ a base game with no rivers.bmp: learnt null, with a reason", r.learnt === null && /rivers\.bmp/.test(r.reason || ""), r);
    const cut = ask(mod("Replaces Map", 'replace_path="map"\n'), GAME);
    rec("⭐ a mod whose replace_path=\"map\" hides the map below: learnt null, with a reason", cut.learnt === null && typeof cut.reason === "string" && cut.reason.length > 0, cut);
    const DRY = path.join(TMP, "game-dry"); RW.writeMap(DRY, S, { idx: new Uint8Array(S.N).fill(RW.BG) });
    const dry = ask(mod("Over A Dry Game"), DRY);
    rec("⭐ a map below whose rivers.bmp holds no river: learnt null, with a reason", dry.learnt === null && /no river/.test(dry.reason || ""), dry);
  }

  console.log("\n3. A palette that paints an index the plan writes in another colour → refused");
  {
    // the indices a plan from this sample writes: its green, its red and the widths it draws with — read off the sample here
    const L = md.riversLearntFromMap(S), roles = md.riverIndexRoles(RW.PALETTE);
    const writes = new Set([L.source, L.flowIn, ...Object.keys(L.bodyShare).map(Number)]);
    const body = Math.min(...Object.keys(L.bodyShare).map(Number));
    const unwritten = RW.PALETTE.map((c, i) => i).filter((i) => !roles.bg[i] && !writes.has(i));
    const recolour = (idxs) => RW.PALETTE.map((c, i) => (idxs.includes(i) ? { r: c.r ^ 0x55, g: c.g, b: c.b ^ 0x2a } : c));
    const odd = mod("Odd Palette"); fs.mkdirSync(path.join(odd, "map"), { recursive: true });
    fs.writeFileSync(path.join(odd, "map", "rivers.bmp"), RW.bmp8(S.W, S.H, new Uint8Array(S.N).fill(RW.BG), recolour([body])));
    const r = ask(odd, GAME);
    rec(`⭐ the mod's rivers.bmp paints index ${body}, a width the plan writes, another colour: learnt null, and the reason names the palette and the index`,
      r.learnt === null && /palette/.test(r.reason || "") && new RegExp("\\b" + body + "\\b").test(r.reason || ""), r);
    rec("THE CONTROL: the sample's palette has river entries a plan never writes (the yellow, the widths the sample does not draw)", unwritten.length > 0 && unwritten.some((i) => roles.flowOut[i]), unwritten);
    const resaved = mod("Re-saved Palette"); fs.mkdirSync(path.join(resaved, "map"), { recursive: true });
    fs.writeFileSync(path.join(resaved, "map", "rivers.bmp"), RW.bmp8(S.W, S.H, new Uint8Array(S.N).fill(RW.BG), recolour(unwritten)));
    const r2 = ask(resaved, GAME);
    rec("⭐ …but one that repaints only entries the plan never writes is not refused: the new rivers mean what they meant below",
      !!r2.learnt && r2.from === "the map underneath", r2.reason || r2.from);
    const same = mod("Same Palette"); fs.mkdirSync(path.join(same, "map"), { recursive: true });
    fs.writeFileSync(path.join(same, "map", "rivers.bmp"), RW.bmp8(S.W, S.H, new Uint8Array(S.N).fill(RW.BG), RW.PALETTE));
    const ok = ask(same, GAME);
    rec("THE CONTROL: the same mod with the map below's palette learns from it", !!ok.learnt && ok.from === "the map underneath", ok.reason || ok.from);
  }

  console.log("\n4. ⛔ A mod that draws its own rivers learns from its own map, without the land this write raises");
  // the raised provinces: the squares east of x 528 in the top four bands — the long main on row 15 crosses them
  const raised = new Set(); for (let k = 0; k < SPARSE.N; k++) { const x = k % SPARSE.W, y = (k - x) / SPARSE.W; if (SPARSE.type[k] === 1 && x >= 528 && y < 64) raised.add(SPARSE.pid[k]); }
  const own = shareOf(SPARSE, raised), ownWhole = shareOf(SPARSE);
  rec("THE CONTROL: this world's own share is not the base game's, and leaving the raised provinces out changes it",
    Math.abs(own - denseShare) > 0.05 && Math.abs(own - ownWhole) > 1e-6 && raised.size > 0, { own, ownWhole, denseShare, raised: raised.size });
  {
    const tc = mod("Total Conversion"); RW.writeMap(tc, SPARSE);
    const r = ask(tc, GAME, [...raised]);
    rec("⭐⭐⭐ learnt from the mod's own map, its share as this test counts it without the raised provinces",
      !!r.learnt && r.from === "the mod's own map" && r.root === tc && Math.abs(r.learnt.borderShare - own) < 1e-12, { from: r.from, got: r.learnt && r.learnt.borderShare, own, denseShare });
    const all = ask(tc, GAME);
    rec("⭐ …and with nothing raised, over the whole of it", !!all.learnt && Math.abs(all.learnt.borderShare - ownWhole) < 1e-12, { got: all.learnt && all.learnt.borderShare, ownWhole });
  }
  {
    // after Delete map: the mod owns the files, and its only river stands on the land this write raises
    const onlyRaised = RW.gridSample({ mains: [], tribs: [] });
    for (let x = 540; x <= 600; x++) onlyRaised.idx[15 * onlyRaised.W + x] = x === 600 ? RW.GREEN : 3;
    const blank = mod("Blanked World"); RW.writeMap(blank, onlyRaised);
    const r = ask(blank, GAME, [...raised]);
    rec("⭐⭐ a world whose only river is on the raised land learns from the map below", !!r.learnt && r.from === "the map underneath" && Math.abs(r.learnt.borderShare - denseShare) < 1e-12, { from: r.from, got: r.learnt && r.learnt.borderShare });
    const none = mod("No Rivers At All"); RW.writeMap(none, onlyRaised, { idx: new Uint8Array(onlyRaised.N).fill(RW.BG) });
    const r2 = ask(none, GAME, [...raised]);
    rec("⭐ …as does one with no river left at all", !!r2.learnt && r2.from === "the map underneath", r2.reason || r2.from);
  }

  console.log("\n5. ⛔ A mod's own map teaches only when it draws enough rivers to say what they are like (review F1)");
  {
    rec("THE CONTROL: the fixture has more short rivers than the fewest a map must draw", SHORT.length > fewest && fewest > 1, { short: SHORT.length, fewest });
    const one = mod("One Test River"); RW.writeMap(one, RW.gridSample({ mains: [SHORT[0]], tribs: [] }));
    const r1 = ask(one, GAME);
    rec("⭐⭐ one river of the mod's own (the review's case: it taught a climb cap of 0, and the new land got no rivers) — learnt from the map underneath, and it says why",
      !!r1.learnt && r1.from === "the map underneath" && Math.abs(r1.learnt.borderShare - denseShare) < 1e-12 && /\b1 river\b/.test(r1.ownMap || ""), { from: r1.from, ownMap: r1.ownMap });
    const few = mod("Too Few Rivers"); RW.writeMap(few, RW.gridSample({ mains: SHORT.slice(0, fewest - 1), tribs: [] }));
    const r2 = ask(few, GAME);
    rec(`⭐ ${fewest - 1} rivers, one fewer than ${fewest}: still the map underneath, and the note names both numbers`,
      !!r2.learnt && r2.from === "the map underneath" && new RegExp("\\b" + (fewest - 1) + " rivers\\b").test(r2.ownMap || "") && new RegExp("\\b" + fewest + "\\b").test(r2.ownMap || ""), { from: r2.from, ownMap: r2.ownMap });
    const ENOUGH = RW.gridSample({ mains: SHORT.slice(0, fewest), tribs: [] });
    const enough = mod("Just Enough Rivers"); RW.writeMap(enough, ENOUGH);
    const r3 = ask(enough, GAME);
    rec(`⭐⭐ ${fewest} rivers: the mod's own map, its share as this test counts it, and nothing to explain`,
      !!r3.learnt && r3.from === "the mod's own map" && Math.abs(r3.learnt.borderShare - shareOf(ENOUGH)) < 1e-12 && r3.ownMap === undefined, { from: r3.from, got: r3.learnt && r3.learnt.borderShare, want: shareOf(ENOUGH), ownMap: r3.ownMap });
  }

  console.log("\n6. ⛔ Never from the rivers an earlier Generate land drew (review F2)");
  {
    // the land Nova raised and drew rivers for: the squares of the five bands of columns nearest the coast (x < 128)
    const novaLand = (w) => { const ids = new Set(); for (let k = 0; k < w.N; k++) if (w.type[k] === 1 && k % w.W < 128) ids.add(w.pid[k]); return ids; };
    // A: the modder's own rivers, one to a band, rising inland (heads x 300..600) and running down across Nova's land to the coast,
    // and two short ones of Nova's own wholly on it
    const LONG = SHORT.map((m, i) => ({ y: m.y, head: 300 + ((i * 23) % 301) }));
    const A = RW.gridSample({ mains: [{ y: 15, head: 90 }, ...LONG, { y: 239, head: 100 }], tribs: [] }), novaA = novaLand(A);
    const own = shareOf(A, novaA), whole = shareOf(A);
    rec("THE CONTROL: Nova's land changes this world's share: counted with it and without it, the two differ", Math.abs(own - whole) > 0.01 && novaA.size > 0, { own, whole });
    const a = mod("Nova Drew Some"); RW.writeMap(a, A);
    const rec1 = md.recordGeneratedRivers({ modRoot: a, provinceIds: [...novaA] });
    rec("the record of the land Nova drew rivers for is kept, outside the mod", rec1.ok === true && rec1.provinces === novaA.size && fs.existsSync(md.generatedRiversRecordPath(a)) && !md.generatedRiversRecordPath(a).startsWith(a), rec1);
    const ra = ask(a, GAME);
    rec("⭐⭐⭐ learnt from the mod's own map WITHOUT the land Nova drew rivers for: its share as this test counts it without that land",
      !!ra.learnt && ra.from === "the mod's own map" && Math.abs(ra.learnt.borderShare - own) < 1e-12, { from: ra.from, got: ra.learnt && ra.learnt.borderShare, own, whole });
    const copyA = mod("Same Files No Record"); RW.writeMap(copyA, A);
    const rc = ask(copyA, GAME);
    rec("THE CONTROL: the same files with no record are learnt whole — the record is what left Nova's rivers out", !!rc.learnt && Math.abs(rc.learnt.borderShare - whole) < 1e-12, { got: rc.learnt && rc.learnt.borderShare, whole });
    // B: every river on the map is one Nova drew — a world after one Generate land
    const B = RW.gridSample({ mains: SHORT, tribs: [] }), novaB = novaLand(B);
    const b = mod("Nova Drew All"); RW.writeMap(b, B);
    md.recordGeneratedRivers({ modRoot: b, provinceIds: [...novaB].filter((id, i) => i % 2 === 0) });
    md.recordGeneratedRivers({ modRoot: b, provinceIds: [...novaB].filter((id, i) => i % 2 === 1) });
    let kept = null; try { kept = JSON.parse(fs.readFileSync(md.generatedRiversRecordPath(b), "utf8")).provinces; } catch (_) {}
    rec("⭐ a record written in two Generate lands holds both", Array.isArray(kept) && kept.length === novaB.size && kept.every((id) => novaB.has(id)), { kept: kept && kept.length, want: novaB.size });
    const rb = ask(b, GAME);
    rec("⭐⭐⭐ a world whose every river Nova drew learns from the map underneath, as the first Generate land did",
      !!rb.learnt && rb.from === "the map underneath" && Math.abs(rb.learnt.borderShare - denseShare) < 1e-12, { from: rb.from, got: rb.learnt && rb.learnt.borderShare });
    const copyB = mod("Nova Drew All No Record"); RW.writeMap(copyB, B);
    const rcb = ask(copyB, GAME);
    rec("THE CONTROL: without the record, those rivers are enough to learn from — the drift the review measured", !!rcb.learnt && rcb.from === "the mod's own map", rcb.from || rcb.reason);
    // a record that cannot be read: nothing can be told apart, so nothing is learnt from the mod's own, and nothing writes over it
    const c = mod("Unreadable Record"); RW.writeMap(c, B);
    const recFile = md.generatedRiversRecordPath(c);
    fs.mkdirSync(path.dirname(recFile), { recursive: true }); fs.writeFileSync(recFile, "{ not json");
    const rr = ask(c, GAME);
    rec("⭐ an unreadable record: learnt from the map underneath, and the note says the record could not be read",
      !!rr.learnt && rr.from === "the map underneath" && /record/.test(rr.ownMap || ""), { from: rr.from, ownMap: rr.ownMap });
    const w = md.recordGeneratedRivers({ modRoot: c, provinceIds: [1, 2, 3] });
    rec("⭐ …and recording over it is refused, the file left as it was", w.ok === false && fs.readFileSync(recFile, "utf8") === "{ not json", w);
  }

  console.log("\n7. ⛔ The map below, as the game loads it: each file from the first layer that ships it (review F4)");
  {
    // a dependency that ships its rivers.bmp alone — a river overhaul — over the base game's provinces
    const DEP_R = path.join(TMP, "dep-rivers-only"); fs.mkdirSync(path.join(DEP_R, "map"), { recursive: true });
    fs.writeFileSync(path.join(DEP_R, "map", "rivers.bmp"), RW.bmp8(SPARSE.W, SPARSE.H, SPARSE.idx));
    const sparseOverGame = shareOf({ ...S, idx: SPARSE.idx });
    rec("THE CONTROL: the dependency's rivers over the game's provinces are not the game's own share", Math.abs(sparseOverGame - denseShare) > 0.05, { sparseOverGame, denseShare });
    const r = md.riversLearnt({ modRoot: mod("Add-on Over A River Overhaul"), gameRoot: GAME, dependencyRoots: [DEP_R], provinceIds: [] });
    rec("⭐⭐ learnt from the dependency's rivers.bmp, read over the base game's provinces — what the game draws", !!r.learnt && r.from === "the map underneath" && r.root === DEP_R && Math.abs(r.learnt.borderShare - sparseOverGame) < 1e-12,
      { root: r.root, got: r.learnt && r.learnt.borderShare, sparseOverGame, reason: r.reason });
    // a dependency that ships its heightmap alone: the game's rivers stand on ITS ground, so their climbs are measured there
    const steep = (x, y) => Math.min(250, 96 + Math.round((x - 48) * 0.15 + 30 * Math.sin(x / 23) * Math.cos(y / 17)));
    const DEP_H = path.join(TMP, "dep-heightmap-only"); fs.mkdirSync(path.join(DEP_H, "map"), { recursive: true });
    const hs = new Uint8Array(S.N); for (let k = 0; k < S.N; k++) hs[k] = S.type[k] === 1 ? steep(k % S.W, Math.floor(k / S.W)) : S.height[k];
    fs.writeFileSync(path.join(DEP_H, "map", "heightmap.bmp"), RW.bmp8(S.W, S.H, hs, RW.PALETTE.map((c, i) => ({ r: i, g: i, b: i }))));
    const p95 = (height) => {
      const h5 = RW.smoothed5({ W: S.W, H: S.H, height }), cl = [];
      for (const t of RW.riverTrees({ W: S.W, H: S.H, idx: S.idx })) if (t.main && t.px.length >= 20) cl.push(RW.climbAlong(h5, t.main));
      cl.sort((u, v) => u - v);
      return cl[Math.min(cl.length - 1, Math.floor(0.95 * (cl.length - 1) + 0.5))];
    };
    const onSteep = p95(hs), onGame = p95(S.height);
    rec("THE CONTROL: the game's mains climb differently on the dependency's ground", Math.abs(onSteep - onGame) > 1, { onSteep, onGame });
    const rh = md.riversLearnt({ modRoot: mod("Add-on Over A Relief Mod"), gameRoot: GAME, dependencyRoots: [DEP_H], provinceIds: [] });
    rec("⭐⭐ the base game's rivers, their climbs measured on the dependency's heightmap — the ground the game puts under them",
      !!rh.learnt && rh.root === GAME && Math.abs(rh.learnt.climbP95 - onSteep) < 1e-9, { root: rh.root, got: rh.learnt && rh.learnt.climbP95, onSteep, onGame });
  }

  console.log("\n8. The map below is read once per version of its files");
  {
    const m = mod("Asked Twice");
    const r1 = ask(m, GAME), r2 = ask(m, GAME);
    rec("⭐ asked twice, the second answer is the first one (the learning did not run again)", !!r1.learnt && r1.learnt === r2.learnt);
    // the base game's rivers.bmp replaced by the sparse drawing, renamed over as an editor saves
    const file = path.join(GAME, "map", "rivers.bmp"), tmp = file + ".new";
    fs.writeFileSync(tmp, RW.bmp8(SPARSE.W, SPARSE.H, SPARSE.idx)); fs.renameSync(tmp, file);
    const r3 = ask(m, GAME);
    rec("⭐ …and once the map below changes, it is learnt again from what is there now", !!r3.learnt && r3.learnt !== r1.learnt && Math.abs(r3.learnt.borderShare - ownWhole) < 1e-12, { got: r3.learnt && r3.learnt.borderShare, ownWhole });
  }
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== rivers learn from the right map: ${checks} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exitCode = fails.length ? 1 : 0;
}
