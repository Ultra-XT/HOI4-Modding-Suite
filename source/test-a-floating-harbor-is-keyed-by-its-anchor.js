// A buildings.txt row with a LAND anchor is keyed by that anchor, not by where it sits.
// #a-floating-harbor-is-keyed-by-its-anchor
//
// Column 7 means two different things, and Nova had two rules that disagreed about it:
//
//   building_wrong_state         — the key must match the state of the row's POSITION
//   building_anchor_wrong_state  — the key must match the state of the row's ANCHOR province
//
// The corpus says BOTH are right, for different row types:
//
//   naval_base_spawn  column 7 is a SEA province — vanilla 2,362/2,362, MD 2,750/2,750, OWB 4,421/4,421 —
//                     and the key matches the POSITION's state 96.5-100%, the anchor's 0%.
//   floating_harbor   column 7 is a LAND province (0% sea in all three) and the key matches the ANCHOR's
//                     state 99.3-99.7%, the position's only 1.7-19.9%. A floating harbour SITS AT SEA and
//                     belongs to the land state it serves.
//
// fixBuildingsTxtPlacement re-homed everything by position. On the owner's mod that re-keyed 190 rows, after
// which its floating harbours matched their position and stopped matching their anchor — turning 8 correct
// rows into 8 that Nova's own sibling rule then reported. An auto-fix manufacturing the defect another rule
// complains about.
//
// ⚠️ The guard tests the DATA (is column 7 a land province?), not the type name, so a future anchored
// building type is covered without anyone remembering to add it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── 🈯 the measurement the rule rests on, re-derived here ────────────────────────────────────────────
console.log("\n=== 🈯 the two column-7 meanings, measured on the shipped maps ===");
if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) {
  console.log("  ..   (the base game is not installed)");
} else {
  for (const [label, root] of [["vanilla", GAME], ["Millennium Dawn", path.join(WS, "2777392649")]]) {
    if (!fs.existsSync(path.join(root, "map", "buildings.txt")) && root !== GAME) { console.log(`  ..   (${label} not installed)`); continue; }
    const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
    const p2s = m.provinceToState || {};
    const typeOf = new Map((m.provinces || []).map((p) => [p.id, p.type]));
    const txt = fs.readFileSync(path.join(fs.existsSync(path.join(root, "map", "buildings.txt")) ? root : GAME, "map", "buildings.txt"), "utf8");
    const acc = { harborRows: 0, harborAnchorMatch: 0, harborAnchorIsSea: 0, spawnRows: 0, spawnAnchorIsSea: 0 };
    for (const ln of txt.split(/\r?\n/)) {
      const c = ln.trim().split(";");
      if (c.length < 7) continue;
      const st = parseInt(c[0], 10), anchor = parseInt(c[6], 10);
      const type = (c[1] || "").trim().toLowerCase();
      if (!Number.isFinite(st) || !Number.isFinite(anchor) || anchor <= 0) continue;
      if (type === "floating_harbor") {
        acc.harborRows++;
        if (p2s[anchor] === st) acc.harborAnchorMatch++;
        if (typeOf.get(anchor) === "sea") acc.harborAnchorIsSea++;
      } else if (type === "naval_base_spawn") {
        acc.spawnRows++;
        if (typeOf.get(anchor) === "sea") acc.spawnAnchorIsSea++;
      }
    }
    if (!acc.harborRows) { console.log(`  ..   (${label}: no anchored rows)`); continue; }
    ok(acc.harborAnchorMatch / acc.harborRows > 0.95,
      `⭐⭐ ${label}: ${(100 * acc.harborAnchorMatch / acc.harborRows).toFixed(1)}% of floating_harbor rows are keyed to their ANCHOR's state`, acc);
    ok(acc.harborAnchorIsSea === 0,
      `⭐ ${label}: …and not one of their anchors is a sea province — the anchor is LAND`, acc.harborAnchorIsSea);
    ok(acc.spawnRows > 0 && acc.spawnAnchorIsSea === acc.spawnRows,
      `⚠️ ${label}: while EVERY naval_base_spawn anchor IS sea — the same column, a different meaning`, acc);
  }
}

// ── the behaviour ────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== a land-anchored row is left alone; a sea-anchored one is still re-homed ===");
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchor-")); tmps.push(d);
  tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="ANCH"\nreplace_path="map"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });

  // 4 columns of provinces: 1 and 2 land (states 1 and 2), 3 sea, 4 land.
  const W = 16, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
  const provAtX = (x) => (x < 4 ? 1 : x < 8 ? 2 : x < 12 ? 3 : 4);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; buf[o++] = c[2]; buf[o++] = c[1]; buf[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), buf);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;true;plains;1",
    "2;20;20;20;land;true;plains;1",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;land;true;plains;1",
  ].join("\n") + "\n");
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  const stf = (id, prov) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n`
    + `\tprovinces = { ${prov.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"), stf(1, [1]));
  fs.writeFileSync(path.join(d, "history", "states", "2.txt"), stf(2, [2, 4]));

  // ⚠️ THE HARBOUR MUST SIT ON *LAND* THAT IS NOT ITS ANCHOR'S STATE, or this fixture proves nothing.
  //
  // The loop already skips any row whose position is over sea, so a harbour parked at sea — where a real one
  // usually is — is left alone for a reason that has nothing to do with the anchor. A first version of this
  // test did exactly that and its back-out control did not bite.
  //
  // The case that actually happened: the owner turned four SEA provinces into LAND to build an island, so
  // harbours sitting in that water were suddenly positioned on land, and the re-home dragged their keys with
  // them. Reproduce that shape — positioned on province 2 (state 2), anchored to province 1 (state 1).
  const z = (y) => (H - 1 - y).toFixed(2);
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), [
    `1;floating_harbor;5.00;9.50;${z(1)};0.00;1`,
    `1;naval_base_spawn;5.00;9.50;${z(1)};0.00;3`,
  ].join("\n") + "\n");

  const before = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8");
  const dry = md.fixBuildingsTxtPlacement({ modRoot: d, gameRoot: path.join(d, "__nogame__"), dependencyRoots: [], dryRun: true });
  ok(!!dry, "the placement scan ran", dry && dry.error);

  const r = md.fixBuildingsTxtPlacement({ modRoot: d, gameRoot: path.join(d, "__nogame__"), dependencyRoots: [] });
  const after = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8");
  const harborRow = after.split(/\r?\n/).find((l) => l.indexOf("floating_harbor") >= 0) || "";
  ok(/^1;floating_harbor/.test(harborRow),
    "⭐⭐⭐ the floating_harbor keeps its key — it is anchored to province 1, which IS in state 1", { harborRow, rehomed: r && r.rehomed });
  ok(harborRow === before.split(/\r?\n/)[0],
    "⭐⭐ …byte-identical, so nothing about it was rewritten", { harborRow });

  // ⚠️ THE CONTROL: a genuinely mis-keyed, sea-anchored row must STILL be re-homed, or the guard is too wide.
  const spawnRow = after.split(/\r?\n/).find((l) => l.indexOf("naval_base_spawn") >= 0) || "";
  ok(/^2;naval_base_spawn/.test(spawnRow),
    "⚠️⚠️ …while the sea-anchored naval_base_spawn IS re-homed to the state its position is in", { spawnRow });
}

// ── the guard is derived from the data, not a type-name list ─────────────────────────────────────────
console.log("\n=== the rule reads the anchor's TYPE, not the building's name ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const M = maskJsComments(SRC);
  const s = M.indexOf("function buildingsTxtPlacementScan");
  const body = M.slice(s, M.indexOf("\nfunction ", s + 10));
  // ⭐ ASSERT THE MEANING, NOT THE SPELLING. This used to pin the literal `isSea.get(anchorProv) === false`
  // — "column 7 names a land province". That test of the DATA was a good proxy for "is this a
  // floating_harbor" right up until an edit turned a port's SEA anchor into land, at which point the proxy
  // said "anchor-keyed" about twelve naval_base_spawn rows and Nova destroyed twelve vanilla ports
  // (#a-moved-sea-tile-drags-twelve-ports-with-it). The question is now asked once, per TYPE, by
  // anchorKeyedBuildingTypes — so pin what it ANSWERS, which a spelling change cannot fake.
  ok(/anchorKeyed/.test(body),
    "⭐⭐ the scan asks the shared anchor-keyed predicate", body.length);
  {
    const set = md.anchorKeyedBuildingTypes({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
    ok(!!set && set.has("floating_harbor") && !set.has("naval_base_spawn") && !set.has("arms_factory"),
      "⭐⭐⭐ …and on the shipped map it answers: harbours by anchor, ports and factories by position",
      set && [...set]);
  }
  ok(!/floating_harbor/.test(body),
    "⚠️⚠️ …without naming floating_harbor, so a future anchored type is covered too", body.length);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a floating harbor is keyed by its anchor: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
