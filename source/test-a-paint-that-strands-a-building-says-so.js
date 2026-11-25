// Paint shape can strand a building, and for as long as the rule has existed it could not say so.
// #paint-shape-strands-buildings-in-silence
//
// map/buildings.txt keys every row to a STATE and places it at an x/z POSITION. If the position stops
// being inside that state, HOI4 logs "location is not within specified state … BUILDING IGNORED" and the
// building silently disappears from the game. Nova has a rule for it — building_wrong_state — and an
// auto-fix that re-homes the row.
//
// The rule was gated on `problemIsTheModsOwn`: is either state involved defined by a file THIS MOD SHIPS?
// That gate was added for a real disaster (a mod that materialised vanilla's 3.2 MB buildings.txt was
// blamed for 160 of Paradox's own stale rows), and it is wrong for exactly one tool:
//
//   ⛔ applyProvinceDiff writes map/provinces.bmp and nothing else. Paint shape never writes a state file,
//      so a state-file test can never open on a paint — however much damage the paint did.
//
// The base subtraction beside it already asks the right question: did the layer BELOW already have this
// exact `from:province` problem? A paint creates a NEW key; inherited staleness does not. So the gate was
// protecting nothing the subtraction does not, and was hiding the one tool the rule exists to catch.
//
// ⚠️ Every number below is derived from the installed corpus at run time, never typed in.
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmps = [];
const mk = (name) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-strand-" + name + "-"));
  tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.copyFileSync(path.join(GAME, "map", "buildings.txt"), path.join(d, "map", "buildings.txt"));
  return d;
};
const look = (root) => {
  const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
  const probs = md.findBuildingPlacementProblems({ modRoot: root, gameRoot: GAME, dependencyRoots: [], model: m });
  const fix = md.fixBuildingsTxtPlacement({ modRoot: root, gameRoot: GAME, dependencyRoots: [], dryRun: true });
  return { reported: probs.length, rehome: fix.rehomed || 0, keys: probs.map((p) => p.stateId + ":" + p.provinceId) };
};

// ── the gate itself ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the rule is not gated on owning a state file ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const s = SRC.indexOf("function buildingsTxtPlacementScan");
  const body = s < 0 ? "" : SRC.slice(s, SRC.indexOf("\nfunction ", s + 10));
  ok(body.length > 500, "buildingsTxtPlacementScan was found", body.length);
  const loop = body.slice(body.indexOf("for (const r of rehome)"));
  ok(!/problemIsTheModsOwn\(/.test(loop),
    "⭐ the reporting loop no longer asks whether the mod owns a state file", loop.slice(0, 200));
  ok(/buildingProblemIsTheModsOwn\(/.test(loop),
    "…and still subtracts what the layer below already had", loop.slice(0, 200));
}

if (!fs.existsSync(path.join(GAME, "map", "buildings.txt")) || !fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) {
  console.log("\n  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  // ── ⚠️ THE CRY-WOLF CONTROLS FIRST. These are what the removed gate was protecting. ─────────────────
  console.log("\n=== ⚠️ a mod that only INHERITED the problem is still told nothing ===");
  {
    const a = mk("materialised");
    const r = look(a);
    // ⚠️ THIS ASSERTION USED TO READ `> 50`, AND THE 50 WAS THE BUG. #a-building-is-read-one-pixel-north
    // The scan resolved each row's province one bitmap row NORTH of where it sits, so 179 of vanilla's own
    // rows looked mis-stated and this control asserted that as though it were a property of vanilla. It was
    // a property of the reader. With the z→row mapping corrected, building_wrong_state reports ZERO on
    // every shipping map measured — vanilla, Millennium Dawn, Old World Blues and two more workshop mods —
    // which is what a rule about the MODDER's mistakes should say about content Paradox ships.
    //
    // ⭐ A clean corpus and an inert scan look identical here. What tells them apart is the PAINT block
    // below: on this same fixture it goes 0 → 2 and names the row the paint moved. That is the control;
    // this line is now just the measurement it rests on.
    ok(r.rehome === 0, `vanilla's own buildings.txt carries ${r.rehome} mis-keyed rows once each row is read on its own pixel`, r.rehome);
    ok(r.reported === 0,
      "⭐⭐ …and a mod holding it verbatim is blamed for NONE of them", r);

    // The harsher form: ship every vanilla state file too, so state-file ownership is total. This is the
    // exact shape that once produced 160 warnings.
    const b = mk("allstates");
    fs.mkdirSync(path.join(b, "history", "states"), { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(path.join(GAME, "history", "states"))) {
      fs.copyFileSync(path.join(GAME, "history", "states", f), path.join(b, "history", "states", f)); n++;
    }
    const r2 = look(b);
    ok(n > 500, `…and with all ${n} vanilla state files shipped byte-identical`, n);
    ok(r2.reported === 0,
      "⭐⭐⭐ …it is STILL blamed for none — the base subtraction, not the state-file test, is what does this", r2);
  }

  // ── the finding: a paint that moves a building's pixel out of its state ─────────────────────────────
  console.log("\n=== ⭐ …but a paint that strands one is reported ===");
  {
    const d = mk("painted");
    const before = look(d);
    ok(before.reported === 0, "before the paint: nothing is the mod's fault", before);

    // Derive a target from the data: a buildings.txt row whose pixel sits in the right state today, with a
    // neighbouring land province belonging to a DIFFERENT state to paint over it.
    const model = md.buildMapModel({ modRoot: d, gameRoot: GAME, dependencyRoots: [] });
    const pbuf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
    const dataOff = pbuf.readUInt32LE(10), W = pbuf.readInt32LE(18), H = pbuf.readInt32LE(22);
    const rowSize = Math.floor((24 * W + 31) / 32) * 4;
    const at = (x, y) => { const o = dataOff + (H - 1 - y) * rowSize + x * 3; return ((pbuf[o + 2] << 16) | (pbuf[o + 1] << 8) | pbuf[o]) >>> 0; };
    const provOf = new Map();
    for (const p of model.provinces || []) provOf.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p);

    let target = null;
    const lines = fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "utf8").split(/\r?\n/);
    for (const line of lines) {
      const c = line.split(";");
      if (c.length < 6) continue;
      const x = Math.round(parseFloat(c[2])), z = Math.round(parseFloat(c[4]));
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const py = H - 1 - z;                                   // buildings.txt z is bottom-up
      if (x < 3 || py < 3 || x >= W - 3 || py >= H - 3) continue;
      const here = provOf.get(at(x, py));
      if (!here || here.type !== "land") continue;
      let other = null;
      for (let dy = -3; dy <= 3 && !other; dy++) for (let dx = -3; dx <= 3; dx++) {
        const q = provOf.get(at(x + dx, py + dy));
        if (q && q.type === "land" && q.id !== here.id
            && model.provinceToState[q.id] !== model.provinceToState[here.id]) { other = q; break; }
      }
      if (!other) continue;
      target = { x, py, here, other, type: c[1],
        fromState: model.provinceToState[here.id], toState: model.provinceToState[other.id] };
      break;
    }
    ok(!!target, "found a real building whose pixel a paint can move between states",
      target && { type: target.type, from: target.here.id, to: target.other.id, fromState: target.fromState, toState: target.toState });

    if (target) {
      const diff = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        diff.push({ x: target.x + dx, y: target.py + dy, r: target.other.r, g: target.other.g, b: target.other.b });
      }
      const res = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
      ok(res && res.ok === true, `painted ${diff.length} pixels of province ${target.other.id} over the building`, res && res.error);

      const after = look(d);
      ok(after.rehome > before.rehome,
        `⭐ the paint really did strand a row (${before.rehome} → ${after.rehome} need re-homing)`, { before: before.rehome, after: after.rehome });
      ok(after.reported >= 1,
        "⭐⭐⭐ …and the modder is TOLD, where before this reported 0", after);
      const wanted = target.fromState + ":" + target.other.id;
      ok(after.keys.indexOf(wanted) >= 0,
        `⭐⭐ …naming the row the paint moved (${wanted})`, after.keys.slice(0, 8));
      // ⚠️ …and ONLY that. If removing the gate had let vanilla's own staleness through, this would be ~151.
      ok(after.reported === after.keys.filter((k) => k === wanted).length,
        "⭐⭐⭐ …and nothing else — none of vanilla's inherited rows came with it", after);

      // The rule must also be a warning, not an error: the map still loads, the building just vanishes.
      const m2 = md.buildMapModel({ modRoot: d, gameRoot: GAME, dependencyRoots: [] });
      const p2 = md.findBuildingPlacementProblems({ modRoot: d, gameRoot: GAME, dependencyRoots: [], model: m2 });
      ok(p2.every((p) => p.severity === "warning"),
        "…as a warning — HOI4 loads the map and drops the building, it does not crash", p2.map((p) => p.severity));
    }
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a paint that strands a building says so: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
