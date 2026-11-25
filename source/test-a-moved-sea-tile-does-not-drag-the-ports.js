// Turning a sea province into land and moving it must not drag the ports floating on that water with it.
// #a-moved-sea-tile-drags-twelve-ports-with-it
//
// FOUND BY THE OWNER'S LAUNCH, twelve times in one error.log:
//
//   map/buildings.txt error at line 1893: map building(naval_base_spawn) location is not within specified
//   state. Supposed to be '1082 - STATE_1082' but was '121 - STATE_121' for province 9383. BUILDING IGNORED!
//
// The torture mod turned sea provinces 2918/2942 into land and moved them into a new island state.
// rekeyBuildingAnchorsForProvince's ANCHOR loop re-keys every row whose column 7 names the moved province —
// and for naval_base_spawn column 7 is THE SEA TILE THE SHIPS LIE IN, not an anchor. Twelve VANILLA ports
// around Japan and Korea followed the island into state 1082 and HOI4 threw all twelve away. That left
// Scottish Lowlands with 0 of its 4 ports and Northern England 0 of 3, which is why the same log then
// reports "invalid state building dockyard" for both states. One edit, sixteen of the log's fifty-two lines.
//
// ⚠️ THE OBVIOUS GUARD DOES NOT WORK. "Skip a row whose anchor is a SEA province" describes the corpus
// perfectly — but at the moment of the move, province 2942's type is already `land`, because making it land
// is what the edit DID. The guard cannot ask about the map; it has to ask about the row's TYPE.
//
// ⚠️ AND THE OBVIOUS ALTERNATIVE IS WORSE. "Skip a row sitting on another province's land" was measured and
// refuted: Old World Blues has 1,575 floating_harbor rows in exactly that position, and vanilla 21. That
// guard would block ~1,700 legitimate re-keys on OWB. Hence per-TYPE, not per-position.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── 🈯 the census, on every installed map ────────────────────────────────────────────────────────────
console.log("\n=== 🈯 which types are keyed by their anchor? (derived, never hardcoded) ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const p = path.join(WS, id);
      if (fs.existsSync(path.join(p, "map", "buildings.txt")) && fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
    }
    let checked = 0;
    for (const [label, root] of roots) {
      const s = md.anchorKeyedBuildingTypes({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      if (!s) { console.log(`  ..   (${label}: no buildings.txt)`); continue; }
      checked++;
      ok(s.has("floating_harbor") === true,
        `⭐⭐ ${label}: floating_harbor is anchor-keyed`, [...s].slice(0, 6));
      ok(s.has("naval_base_spawn") === false,
        `⭐⭐⭐ ${label}: naval_base_spawn is POSITION-keyed — its column 7 is the water, not an anchor`, s.has("naval_base_spawn"));
    }
    ok(checked >= 2, `${checked} shipping map(s) measured`, checked);
  }
}

// ── ⭐⭐⭐ THE REPLAY: the owner's exact edit, against pristine vanilla ───────────────────────────────
console.log("\n=== ⭐⭐⭐ replaying the four moves that destroyed twelve ports ===");
{
  const V = path.join(GAME, "map", "buildings.txt");
  if (!fs.existsSync(V)) console.log("  ..   (the base game is not installed)");
  else {
    // The mod as the torture built it: vanilla's map, with 2918/2942/2966/2993 turned to land.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portdrag-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PD"\nreplace_path="map"\n');
    fs.copyFileSync(V, path.join(d, "map", "buildings.txt"));
    fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(d, "map", "provinces.bmp"));
    const ISLAND = [2918, 2942, 2966, 2993];
    const csv = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split("\n").map((ln) => {
      const c = ln.split(";");
      if (c.length >= 7 && ISLAND.indexOf(parseInt(c[0], 10)) >= 0) { c[4] = "land"; c[5] = "true"; c[6] = "hills"; if (c.length >= 8) c[7] = "1"; return c.join(";"); }
      return ln;
    }).join("\n");
    fs.writeFileSync(path.join(d, "map", "definition.csv"), csv);
    fs.writeFileSync(path.join(d, "history", "states", "1082-ISLAND.txt"),
      `state = {\n\tid = 1082\n\tname = "STATE_1082"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${ISLAND.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);

    // The exact rows HOI4 named, and the states it said they should have stayed in.
    const HOI4 = { 1893: 121, 1894: 121, 1895: 121, 1896: 121, 2178: 130, 2179: 130,
      2359: 136, 2362: 136, 2363: 136, 35471: 131, 35472: 131, 35473: 131 };
    const vanillaLines = fs.readFileSync(V, "utf8").split("\n");

    let totalRekeyed = 0, totalSkipped = 0;
    for (const pid of ISLAND) {
      const r = md.rekeyBuildingAnchorsForProvince({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceId: pid, toStateId: 1082 });
      totalRekeyed += (r && r.rekeyed) || 0;
      totalSkipped += (r && r.anchorSkipped) || 0;
    }
    const after = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split("\n");

    // Every row HOI4 complained about must still carry the state it had in vanilla.
    const moved = [];
    for (const [lnStr, wantState] of Object.entries(HOI4)) {
      const i = parseInt(lnStr, 10) - 1;
      const got = parseInt((after[i] || "").split(";")[0], 10);
      const was = parseInt((vanillaLines[i] || "").split(";")[0], 10);
      if (got !== was || got !== wantState) moved.push(`line ${lnStr}: vanilla ${was}, now ${got}, HOI4 wanted ${wantState}`);
    }
    ok(moved.length === 0,
      "⭐⭐⭐ all twelve ports HOI4 threw away keep the state they had in vanilla", moved);
    ok(totalSkipped >= 12,
      `⚠️ …and the writer reports that it declined to move them (${totalSkipped} skipped)`, totalSkipped);

    // ⚠️ NOT A VACUITY PROBLEM, AND WORTH SAYING WHY. Nothing at all should change here: 2918/2942/
    // 2966/2993 were open OCEAN in vanilla, so no building stands on their pixels for the position loop to
    // find, and the only rows naming them are the twelve ports whose ships lie in that water. The correct
    // outcome for this replay is a byte-identical file. The guard is proved non-blanket by the fixture
    // section below, where a harbour anchored to a moved LAND province is still re-keyed.
    let diff = 0;
    for (let i = 0; i < Math.min(after.length, vanillaLines.length); i++) if (after[i] !== vanillaLines[i]) diff++;
    ok(diff === 0,
      `⭐⭐ the whole 3.2 MB file comes back byte-identical — nothing was collateral`, { diff, totalRekeyed });
    ok(totalRekeyed === 0,
      "…and the writer claims no re-keys, so it is not quietly counting work it did not do", totalRekeyed);

    // …and none of what DID move is a naval_base_spawn.
    const wrongType = [];
    for (let i = 0; i < Math.min(after.length, vanillaLines.length); i++) {
      if (after[i] === vanillaLines[i]) continue;
      const t = (after[i].split(";")[1] || "").trim().toLowerCase();
      if (t === "naval_base_spawn") wrongType.push(`line ${i + 1}: ${after[i].trim().slice(0, 60)}`);
    }
    ok(wrongType.length === 0,
      "⭐⭐ …and not one of them is a naval_base_spawn", wrongType.slice(0, 5));
  }
}

// ── ✅ a genuine floating harbour still follows its anchor ───────────────────────────────────────────
console.log("\n=== ✅ the harbour that SHOULD move still moves ===");
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portdrag2-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PD2"\nreplace_path="map"\n');
  const W = 12, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
  const provAtX = (x) => (x < 4 ? 1 : x < 8 ? 2 : 3);
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
  ].join("\n") + "\n");
  // Enough rows for the census to see what each type anchors to.
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), [
    "5;floating_harbor;10.00;9.50;2.00;0.00;1",    // anchored to LAND province 1 — must follow it
    "5;floating_harbor;10.00;9.50;2.00;0.00;2",
    // ⚠️ x=5 is a province-2 column. The port must STAND on a province that does not move, or the
    // position loop claims it for perfectly good reasons and the test measures the wrong thing — which is
    // exactly what happened when this row sat at x=1, on province 1.
    "7;naval_base_spawn;5.00;9.50;2.00;0.00;3",    // stands on province 2, anchored to SEA province 3
  ].join("\n") + "\n");

  const s = md.anchorKeyedBuildingTypes({ modRoot: d, gameRoot: path.join(os.tmpdir(), "__no_game__"), dependencyRoots: [] });
  ok(!!s && s.has("floating_harbor") && !s.has("naval_base_spawn"),
    "the census reads this little file the same way it reads a shipping one", s && [...s]);

  const r = md.rekeyBuildingAnchorsForProvince({ modRoot: d, gameRoot: path.join(os.tmpdir(), "__no_game__"), dependencyRoots: [], provinceId: 1, toStateId: 9 });
  const rows = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(";"));
  const harbour = rows.find((c) => c[1] === "floating_harbor" && c[6] === "1");
  ok(!!harbour && harbour[0] === "9",
    "⭐⭐⭐ the harbour anchored to the moved LAND province is re-keyed", harbour);
  ok(r && r.rekeyed >= 1, "…and the writer says it moved it", r);

  // …and moving the SEA province the port anchors to leaves the port alone.
  const r2 = md.rekeyBuildingAnchorsForProvince({ modRoot: d, gameRoot: path.join(os.tmpdir(), "__no_game__"), dependencyRoots: [], provinceId: 3, toStateId: 9 });
  const rows2 = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(";"));
  const spawn = rows2.find((c) => c[1] === "naval_base_spawn");
  ok(!!spawn && spawn[0] === "7",
    "⭐⭐⭐ …while the port anchored to the moved SEA province keeps its own state", spawn);
  ok(!r2 || !r2.rekeyed, "…and the writer moved nothing for it", r2);
}

// ── ⭐⭐ THE SIBLING RULE MUST NOT CRY WOLF ABOUT THE ROWS IT NOW LEAVES ALONE ─────────────────
console.log("\n=== ⭐⭐ building_anchor_wrong_state does not report a position-keyed row ===");
{
  // Fixing the writer surfaced this immediately: with the ports correctly left in states 121/130/131/136
  // and their anchor 2942 now sitting in state 1082, findBuildingAnchorMismatches began reporting four
  // fresh warnings — "a naval_base_spawn keyed to state 121 but anchored to province 2942, which is in
  // state 1082" — about rows that are exactly right. It was asking "is the anchor land?", the same proxy
  // the edit breaks. All four sites now ask the same derived question.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portdrag4-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PD4"\nreplace_path="map"\nreplace_path="history/states"\n');
  const W = 12, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
  const provAtX = (x) => (x < 4 ? 1 : x < 8 ? 2 : 3);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  // Province 3 is LAND now — it is the sea tile the edit just reclaimed — and it belongs to state 2.
  // Province 4 is ordinary ocean, so the file still contains sea-anchored ports, as any real map does.
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;true;plains;1",
    "2;20;20;20;land;true;plains;1",
    "3;30;30;30;land;true;hills;1",
    "4;40;40;40;sea;false;ocean;0",
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  fs.writeFileSync(path.join(d, "history", "states", "2.txt"),
    'state = {\n\tid = 2\n\tname = "S2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
  // The port under test stands on province 1 (state 1) and faces province 3, which is now land in state 2.
  // ⚠️ THE OTHER PORTS ARE NOT PADDING. The census is a majority over the file, so a fixture holding ONE
  // naval_base_spawn — whose anchor the edit has just turned to land — has no evidence that the type is
  // normally sea-anchored, and correctly concludes the opposite. That is the honest limit of the rule, and
  // a real map never looks like that: vanilla carries 2,362 sea-anchored ports, the tortured mod 2,357
  // against the 12 the edit created. These three stand in for that.
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), [
    "1;naval_base_spawn;1.00;9.50;2.00;0.00;3",
    "1;naval_base_spawn;2.00;9.50;2.00;0.00;4",
    "1;naval_base_spawn;3.00;9.50;2.00;0.00;4",
    "2;naval_base_spawn;5.00;9.50;2.00;0.00;4",
    "1;floating_harbor;1.00;9.50;2.00;0.00;1",
    "1;floating_harbor;1.00;9.50;2.00;0.00;2",
  ].join("\n") + "\n");

  const NOGAME = path.join(os.tmpdir(), "__no_game_pd4__");
  const m = md.buildMapModel({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const probs = md.findBuildingAnchorMismatches({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], model: m });
  // The anchor rule is one problem with its rows in items[] (#a-map-message-matches-what-the-engine-checks), and its
  // message names only the first; ask every row's type, not the prose.
  const aboutPort = probs.filter((p) => (p.items || []).some((i) => /naval_base_spawn/.test(String(i.type))) || /naval_base_spawn/.test(String(p.message)));
  ok(aboutPort.length === 0,
    "⭐⭐⭐ a port whose reclaimed sea tile now sits in another state is NOT reported",
    aboutPort.map((p) => String(p.message).slice(0, 120)));
}

// ── ⚠️ POLARITY: no evidence must not become a vote ──────────────────────────────────────────────────
console.log("\n=== ⚠️ a type the definition cannot resolve keeps the behaviour it has ===");
{
  // An early cut counted an unresolvable anchor as a SEA vote, which made floating_harbor look
  // position-keyed on any fixture whose definition.csv does not list the anchor — and took
  // test-building-anchor.js from 13 green to 4 red. Absence of evidence casts no vote.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portdrag3-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PD3"\nreplace_path="map"\n');
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), "5;floating_harbor;10.00;9.50;2.00;0.00;777\n");
  const s = md.anchorKeyedBuildingTypes({ modRoot: d, gameRoot: path.join(os.tmpdir(), "__no_game__"), dependencyRoots: [] });
  ok(!!s && s.has("floating_harbor"),
    "⭐⭐ with no definition.csv to resolve province 777, floating_harbor stays anchor-keyed", s && [...s]);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a moved sea tile does not drag the ports: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
