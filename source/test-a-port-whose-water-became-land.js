// A naval base's 7th column is the SEA its ships lie in. Turn that water into land and the port has
// nowhere to spawn a fleet — and HOI4 dies about a second after the main menu.
// #a-port-whose-water-became-land
//
// FOUND BY THE OWNER'S SECOND LAUNCH. It crashed where the one before it had survived, and the two mods
// differed by fourteen rows of map/buildings.txt and nothing else — every other file byte-identical:
//
//   EXCEPTION_ACCESS_VIOLATION, 15:38:15
//   frontend.cpp:177  Startup time: 23725ms          <- it had reached the main menu at 15:38:14
//
// ⚠️⚠️ THE PART WORTH REMEMBERING: those twelve rows were ALREADY broken in the launch that survived. They
// were merely mis-keyed to a state they did not belong to, so HOI4 rejected each with "BUILDING IGNORED"
// before it ever read column 7. Fixing the keying — a real bug that was destroying twelve vanilla ports —
// made the game ACCEPT the rows and dereference the column. A correct fix uncovered a fault that an
// incorrect one had been hiding. Neither was optional, and the second was invisible until the first landed.
//
// The invariant is absolute in shipping content. A position-keyed anchored row whose column 7 is LAND:
//   vanilla 0/2,362 · Novum Vexillum 0/2,752 · Rise of Nations 0/2,358
//   Old World Blues 0/4,421 · Millennium Dawn 0/2,750 · Road to 56 0/2,544      = 0 of 17,187
// So this is gated as FATAL: nothing that ships can trip it.
//
// Two halves: removePortsAnchoredTo runs when the water is raised, so it cannot happen again; and
// fixPortsWhoseWaterIsGone repairs a map that already carries them — which is exactly the owner's.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── ⚠️ ANTI-CRY-WOLF FIRST — a fatal rule must never fire on content that ships ──────────────────────
console.log("\n=== ⚠️ no shipping map has a port pointing at land ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const p = path.join(WS, id);
      if (fs.existsSync(path.join(p, "map", "buildings.txt")) && fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
    }
    let checked = 0, rows = 0;
    for (const [label, root] of roots) {
      const probs = md.validateMapBitmap({ modRoot: root, gameRoot: GAME, dependencyRoots: [] })
        .filter((p) => p.rule === "naval_base_water_is_gone");
      checked++;
      // count the anchored rows this map has, so a pass cannot be vacuous
      let bp = path.join(root, "map", "buildings.txt");
      if (!fs.existsSync(bp)) bp = path.join(GAME, "map", "buildings.txt");
      for (const ln of fs.readFileSync(bp, "utf8").split("\n")) {
        const c = ln.trim().split(";");
        if (c.length >= 7 && (c[1] || "").trim().toLowerCase() === "naval_base_spawn") rows++;
      }
      ok(probs.length === 0, `⭐⭐ ${label}: no stranded port`, probs.map((p) => String(p.message).slice(0, 110)));
    }
    ok(checked >= 2 && rows > 10000,
      `${checked} shipping map(s), ${rows} naval_base_spawn rows examined — not a vacuous pass`, { checked, rows });
  }
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// 12x4, four provinces: 1 and 2 land, 3 sea (the one that gets raised), 4 ordinary ocean that stays put.
//
// ⚠️ PROVINCE 4 IS NOT PADDING. The type census is a majority over the file, so a fixture whose ONLY sea
// province is the one just turned to land has no evidence that naval_base_spawn is normally sea-anchored,
// and correctly concludes the opposite — nothing is removed and the rule never fires. That is the honest
// limit of the rule, and no real map looks like it: vanilla carries 2,362 sea-anchored ports and the
// owner's mod 2,357 against the 12 the edit stranded. Province 4 and its two ports stand in for that.
function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portwater-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PW"\nreplace_path="map"\n');
  const W = 12, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
  const provAtX = (x) => (x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;true;plains;1",
    "2;20;20;20;land;true;plains;1",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;sea;false;ocean;0",
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), [
    "1;naval_base_spawn;1.00;9.50;2.00;0.00;3",     // the one under test: faces province 3
    "2;naval_base_spawn;4.00;9.50;2.00;0.00;4",     // faces ocean that stays ocean — must survive
    "2;naval_base_spawn;5.00;9.50;2.00;0.00;4",
    "1;floating_harbor;1.00;9.50;2.00;0.00;2",      // anchored to LAND on purpose — must survive
    "1;arms_factory;1.00;9.50;2.00;0.00;0",         // no anchor at all — must survive
  ].join("\n") + "\n");
  return d;
}
const rows = (d) => fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.trim());
const NOGAME = path.join(os.tmpdir(), "__no_game_portwater__");

// ── ⛔ raising the water takes its ports with it ─────────────────────────────────────────────────────
console.log("\n=== ⛔ turning a port's sea into land removes the port ===");
{
  const d = makeMod();
  ok(rows(d).length === 5, "the fixture starts with five rows", rows(d).length);

  const r = md.setProvinceDefinition({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 3, type: "land", terrain: "plains", coastal: true });
  ok(!r.error && r.changed, "the sea province became land", r.error);
  ok(!!r.orphanedPorts && r.orphanedPorts.removed === 1,
    "⭐⭐⭐ the port that faced that water is gone", r.orphanedPorts);

  const anchors = rows(d).filter((l) => l.split(";")[1] === "naval_base_spawn").map((l) => l.split(";")[6]);
  ok(anchors.indexOf("3") < 0, "…no naval_base_spawn is left pointing at the raised province", anchors);
  ok(anchors.length === 2, "⚠️ …and the two facing ocean that is still ocean are untouched", anchors);
  const types = rows(d).map((l) => l.split(";")[1]);
  ok(types.indexOf("floating_harbor") >= 0,
    "⚠️ …while the floating_harbor, which anchors to LAND by design, is untouched", types);
  ok(types.indexOf("arms_factory") >= 0, "⚠️ …and so is the factory with no anchor at all", types);
}

// ── ⭐⭐⭐ the validator sees a map that already carries them, and Auto-fix repairs it ───────────────
console.log("\n=== ⭐⭐⭐ a map already in that state is reported and repairable ===");
{
  const d = makeMod();
  // Flip the type in definition.csv DIRECTLY, so nothing cleans up — this is the state the owner's mod
  // was in, built before the write-time cleanup existed.
  const csv = fs.readFileSync(path.join(d, "map", "definition.csv"), "utf8").replace("3;30;30;30;sea;false;ocean;0", () => "3;30;30;30;land;true;plains;1");
  fs.writeFileSync(path.join(d, "map", "definition.csv"), csv);

  const probs = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const p = probs.find((x) => x.rule === "naval_base_water_is_gone");
  ok(!!p, "⭐⭐⭐ the validator reports it", probs.map((x) => x.rule));
  ok(!!p && p.severity === "error", "…as an ERROR", p && p.severity);
  ok(isFatalRule("naval_base_water_is_gone") === true,
    "⭐⭐ …and it is in the curated FATAL set, so Save gates on it — nothing that ships can trip it", true);
  ok(mapRuleLabel("naval_base_water_is_gone") !== "Naval base water is gone",
    "…and it has a human label rather than a raw token", mapRuleLabel("naval_base_water_is_gone"));
  ok(!!p && p.items && p.items.length === 1, "…naming the row", p && p.items && p.items.length);

  const fix = md.fixPortsWhoseWaterIsGone({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(fix.removed === 1, "⭐⭐⭐ Auto-fix removes it", fix);
  const after = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((x) => x.rule === "naval_base_water_is_gone");
  ok(after.length === 0, "…and the map comes back clean", after.map((x) => String(x.message).slice(0, 90)));
  ok(rows(d).map((l) => l.split(";")[1]).indexOf("floating_harbor") >= 0,
    "⚠️ …without taking the land-anchored harbour with it", rows(d));
}

// ── ⚠️ an ordinary terrain repaint must not trigger any of this ──────────────────────────────────────
console.log("\n=== ⚠️ repainting terrain on land leaves every port alone ===");
{
  const d = makeMod();
  const before = rows(d).length;
  const r = md.setProvinceDefinition({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 1, terrain: "forest" });
  ok(!r.error, "the repaint ran", r.error);
  ok(!r.orphanedPorts || !r.orphanedPorts.removed,
    "⭐⭐ nothing was removed — this only fires on a water→land change", r.orphanedPorts);
  ok(rows(d).length === before, "…and the file still has all five rows", { before, after: rows(d).length });
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a port whose water became land: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
