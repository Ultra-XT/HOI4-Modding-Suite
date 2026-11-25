// ⛔ #inherited-buildings-not-yours, ONE LEVEL FINER — "SHIPS THE FILE" BECAME TRUE THE MOMENT NOVA WROTE IT.
//
// Both buildings.txt rules were gated on whether the mod ships map/buildings.txt. That was already the fix
// for a content-only mod, and the code says so. What it missed is that NOVA MATERIALISES THE FILE ITSELF:
// moving a province re-keys the rows that follow it, and to write those rows it copies the base game's whole
// 3.2 MB buildings.txt into the mod. From that instant the gate is open on all ~66,000 rows.
//
// Measured on a brand-new mod whose only edit was "New state" over two Icelandic provinces:
//
//     ✓ Saved 3 changes. 160 warnings (loads, but check before playing):
//       • map/buildings.txt has a floating_harbor keyed to state 679 but anchored to province 12883 …
//
// against a file differing from vanilla by exactly the two lines Nova had just written — and not one of the
// 160 was either of them. They were states 19, 23, 31, 679… none of which the mod had touched. After the
// fix: 2, both genuinely caused by the split. After the split itself was fixed too: 0.
//
// The right question is the one problemIsTheModsOwn already asks for victory points, and which these two
// callers never adopted: IS EITHER STATE INVOLVED DEFINED BY A FILE THIS MOD SHIPS? A content-only mod
// still gets silence — it ships no state files either — so nothing the old gate protected is lost.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// prov 1 | prov 2 | prov 3 (sea).  Pixel = (floor(x), H - floor(z)).
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3);
const W = 9, H = 4;
const DEF = [
  "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
].join("\r\n") + "\r\n";

// The BASE GAME, already carrying a stale row of its own: an arms_factory keyed to state 100 while its
// position sits on province 2, which state 200 owns. Vanilla is full of these and plays fine.
function makeGame(tmps) {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bldggame-")); tmps.push(g);
  mk(path.join(g, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(g, "map", "definition.csv"), DEF);
  mk(path.join(g, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(g, "history", "states", "200.txt"), 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = BBB }\n}\n');
  mk(path.join(g, "map", "buildings.txt"), [
    "100;arms_factory;4.00;10.0;2.00;0.00;0",   // stale in the BASE GAME itself
    "100;floating_harbor;4.00;9.5;2.00;0.00;2", // anchored to prov 2, keyed 100 — stale too
    "200;bunker;4.00;10.0;2.00;0.00;0",         // CORRECT here — a mod's own edit can break it
    "200;floating_harbor;5.00;9.5;2.00;0.00;2", // …and so is this anchor, until province 2 moves
  ].join("\n") + "\n");
  return g;
}
const mod = (tmps, tag, files) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="' + tag + '"\nsupported_version="1.19.*"\n');
  for (const [rel, body] of Object.entries(files)) mk(path.join(m, ...rel.split("/")), body);
  return m;
};
const scan = (modRoot, gameRoot) => {
  const model = md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [] });
  return {
    placement: md.findBuildingPlacementProblems({ modRoot, gameRoot, dependencyRoots: [], model }),
    anchor: md.findBuildingAnchorMismatches({ modRoot, gameRoot, dependencyRoots: [], model }),
  };
};

const tmps = [];
(() => {
  const game = makeGame(tmps);

  console.log("\n=== the base game really does ship stale rows, so the fixture is honest ===");
  {
    const s = scan(game, game);   // editing the base game directly: everything is yours
    ok(s.placement.length > 0, "vanilla's own stranded arms_factory exists", s.placement.map((p) => p.rule));
    ok(s.anchor.length > 0, "…and its own anchor mismatch", s.anchor.map((p) => p.rule));
  }

  console.log("\n=== a content-only mod is told nothing (this part already worked) ===");
  {
    const m = mod(tmps, "contentonly", { "common/characters/c.txt": "characters = {\n}\n" });
    const s = scan(m, game);
    ok(s.placement.length === 0, "no placement warnings", s.placement);
    ok(s.anchor.length === 0, "no anchor warnings", s.anchor);
  }

  console.log("\n=== ⭐ …AND SO IS A MOD THAT MERELY HAS THE FILE COPIED INTO IT ===");
  {
    // This is what Nova produces the instant it re-keys one row: a byte-identical buildings.txt in the mod,
    // and state files for something else entirely. The old gate flipped to "yours" on all of it.
    const m = mod(tmps, "materialised", {
      "map/buildings.txt": fs.readFileSync(path.join(game, "map", "buildings.txt"), "utf8"),
      "history/states/900.txt": 'state = {\n\tid = 900\n\tname = "S900"\n\tmanpower = 1\n\tprovinces = { }\n\thistory = { owner = CCC }\n}\n',
    });
    ok(fs.readFileSync(path.join(m, "map", "buildings.txt")).equals(fs.readFileSync(path.join(game, "map", "buildings.txt"))),
      "the copy really is byte-identical to the base game's");
    const s = scan(m, game);
    ok(s.placement.length === 0, "the base game's stranded building is not blamed on it", s.placement);
    ok(s.anchor.length === 0, "…nor the base game's anchor mismatch", s.anchor);
  }

  console.log("\n=== ⭐ but a mod whose OWN EDIT makes a row wrong is told ===");
  {
    // ⭐ THE HALF THAT MUST KEEP BITING, and it took a second look to state it honestly.
    //
    // This case used to redefine state 200 with `provinces = { 2 }` — BYTE-IDENTICAL to the base game's
    // state 200 — and assert the warning fired, on the reasoning that a mod redefining the state "might
    // well have made it by moving province 2". It hadn't moved anything: the row was stale before and
    // stale after, in exactly the same way, and telling that modder about it is the cry-wolf this whole
    // file exists to stop. The fixture proved the coarse rule rather than the intent behind it.
    //
    // So make the mod actually do what the old comment described. It SWAPS the two states' provinces —
    // state 100 takes province 2, state 200 takes province 1 — and the base game's own `200;bunker` row,
    // which sits on province 2 and was CORRECT in the base, is now keyed to a state that no longer holds
    // that province. That mismatch did not exist below; the mod created it; the mod is told.
    const SWAP = {
      "history/states/100.txt": 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n',
      "history/states/200.txt": 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = BBB }\n}\n',
    };
    const m = mod(tmps, "swapped", Object.assign({
      "map/buildings.txt": fs.readFileSync(path.join(game, "map", "buildings.txt"), "utf8"),
    }, SWAP));
    const s = scan(m, game);
    ok(s.placement.some((p) => p.rule === "building_wrong_state" && p.stateId === 200),
      "⭐ the row the mod's own swap stranded IS reported", s.placement.map((p) => p.rule + ":" + p.stateId));
    // Moved with #a-map-message-matches-what-the-engine-checks: the anchor rule is ONE problem listing its rows in
    // items[], not one problem per row carrying its own stateId.
    ok(s.anchor.some((p) => p.rule === "building_anchor_wrong_state" && (p.items || []).some((i) => i.stateId === 200)),
      "…and so is the anchor the swap broke", s.anchor.map((p) => p.rule + ":" + JSON.stringify(p.items)));
    // …while the base game's OWN two stale rows, which the swap happens to have corrected, stay quiet.
    ok(!s.placement.some((p) => p.stateId === 100),
      "…and the base game's pre-existing stale row is still not blamed on it", s.placement.map((p) => p.stateId));
  }

  console.log("\n=== an identical redefinition changes nothing, so it is told nothing ===");
  {
    // The old shape of the case above, kept as the negative: redefining a state to exactly what the base
    // already says cannot have caused anything.
    const m = mod(tmps, "identicalredef", {
      "map/buildings.txt": fs.readFileSync(path.join(game, "map", "buildings.txt"), "utf8"),
      "history/states/200.txt": 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = BBB }\n}\n',
    });
    const s = scan(m, game);
    ok(s.placement.length === 0 && s.anchor.length === 0,
      "a state redefined to the base's own content raises nothing",
      { placement: s.placement.map((p) => p.rule), anchor: s.anchor.map((p) => p.rule) });
  }

  console.log("\n=== with no mod selected everything is reported — there is nobody else to blame ===");
  {
    const s = scan(undefined, game);
    ok(s.placement.length > 0, "the placement rule still fires with no modRoot", s.placement.map((p) => p.rule));
    ok(s.anchor.length > 0, "…and so does the anchor rule", s.anchor.map((p) => p.rule));
  }

  console.log("\n=== the AUTO-FIX answers to the same gate: it re-homes the row the mod's edit stranded, and leaves an inherited one ===");
  {
    // Moved with #auto-fix-leaves-a-building-row-the-mod-inherited. This said suppressing the warning must not disarm the repair,
    // because materialising is right "when the modder has actually asked for it", and asserted a content-only mod's dry run
    // still re-homed the base game's row. The only caller is Auto-fix all, which repairs what the screen shows, and one click
    // copied the base's whole buildings.txt into the mod for a row no rule named. What must not be disarmed is the repair of
    // the mod's OWN stranded row, so that is what this pins now.
    const m = mod(tmps, "fixinherited", { "common/characters/c.txt": "characters = {\n}\n" });
    const dry = md.fixBuildingsTxtPlacement({ modRoot: m, gameRoot: game, dependencyRoots: [], dryRun: true });
    ok(!dry.error && (dry.rehomed || 0) === 0 && !dry.trimmed, "a dry run plans no re-home of the base game's own stale row", dry);
    ok(!fs.existsSync(path.join(m, "map", "buildings.txt")), "…and writes nothing into the mod");
    const swapped = mod(tmps, "fixswapped", {
      "map/buildings.txt": fs.readFileSync(path.join(game, "map", "buildings.txt"), "utf8"),
      "history/states/100.txt": 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n',
      "history/states/200.txt": 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = BBB }\n}\n',
    });
    const own = md.fixBuildingsTxtPlacement({ modRoot: swapped, gameRoot: game, dependencyRoots: [], dryRun: true });
    const planned = ((own.details || {}).rehome || []).map((r) => r.from + ":" + r.province + "->" + r.to);
    ok(!own.error && JSON.stringify(planned) === '["200:2->100"]', "⭐ …while the row the mod's own swap stranded is still planned, and only it", own);
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== a materialised map file is not an authorship claim: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
