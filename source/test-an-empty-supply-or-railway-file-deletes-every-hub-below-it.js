// An EMPTY map/supply_nodes.txt or map/railways.txt is "none", not "no opinion", and the modder is told so.
// #an-empty-supply-or-railway-file-deletes-every-hub-below-it
//
// ⛔ THE CONDITION, from the owner's own build. The world he launched on 2026-09-16 — new mod, Delete map, Generate
// land at 35%, Auto-fix twice — ships map/railways.txt and map/supply_nodes.txt AT ZERO BYTES, over a base game
// that has 727 supply hubs and 909 railways. A same-named file in map/ replaces the one below it WHOLESALE, with
// no replace_path line, so those two empty files delete every hub and every railway in the game. That map has
// 4,655 land provinces and 1,380 states and not one supply hub anywhere, and Nova said nothing about it.
//
// WHO WROTE THEM: Nova did, and on purpose — section 1 runs the real blankMapToSea and watches it happen. Delete
// map flips every land province to sea and then calls fixWaterSupplyRail with those ids, which drops every hub and
// railway standing on the water it has just made. That is right at that moment: the alternative is vanilla's 727
// hubs left on open ocean, and a hub on water is a measured divide-by-zero five seconds into loading. What nothing
// does is put anything back when Generate land builds a new world over it — and that is what this rule reports.
//
// ⚠️ NOT A CRASH, AND THE MESSAGE MAY NOT SAY IT IS. The game is the oracle: that mod launched, reached the menu
// and started a 1936 singleplayer game with both files at 0 bytes (game.log "Loaded 13414 provinces"), and neither
// error.log nor graphics.log mentions supply or rail. The project's note that an EMPTY map/buildings.txt crashes is
// about buildings.txt and is NOT generalised to these two — they were checked on their own, and they load.
//
// ⚠️ AND IT MUST STAY SILENT where it should: on a map with no land (a blank ocean canvas has no use for a hub, and
// saying this mid-flow is noise), on a file the mod does not ship, and on a file that has rows. Measured on the six
// shipping maps: supply hubs 727 / 914 / 734 / 1,624 / 701 / 717, railways 909 / 1,323 / 979 / 1,424 / 1,655 / 898 —
// none empty, so this cannot fire on shipping content (six-map-diff: "no rule changed" on all six).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptyrail-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptyrail-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
const tmps = [HOME, APPDATA_DIR];

const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// 8x8 provinces of 32px: ids 1..64 by row. Rows 0-5 (1..48) land below, rows 6-7 sea.
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const definition = (isLand) => ["0;0;0;0;land;false;unknown;0"].concat(
  Array.from({ length: 64 }, (_, i) => { const p = i + 1, [r, g, b] = COL(p), L = isLand(p);
    return `${p};${r};${g};${b};${L ? "land" : "sea"};false;${L ? "plains" : "ocean"};${L ? 1 : 0}`; })
).join("\n") + "\n";
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// The rows the base game ships, in the shape the writers use ("<level> <province> " / "<level> <count> <ids…> ").
const BASE_HUBS = range(1, 12);                                        // 12 hubs, all on land
const BASE_RAILS = [[1, [1, 2, 3]], [2, [9, 10, 11]], [1, [17, 18, 19, 20]]];   // 3 railways, all on land
const SUPPLY_TXT = BASE_HUBS.map((p) => `1 ${p} `).join("\n") + "\n";
const RAIL_TXT = BASE_RAILS.map(([lv, ps]) => `${lv} ${ps.length} ${ps.join(" ")} `).join("\n") + "\n";

function newGame() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptyrail-game-")); tmps.push(g);
  mk(g, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(g, "map/definition.csv", definition((p) => p <= 48));
  mk(g, "map/supply_nodes.txt", SUPPLY_TXT);
  mk(g, "map/railways.txt", RAIL_TXT);
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n`;
  mk(g, "history/states/1.txt", st(1, range(1, 24)));
  mk(g, "history/states/2.txt", st(2, range(25, 48)));
  mk(g, "history/countries/ZZZ - Zzzland.txt", "capital = 1\n");
  return g;
}
function newMod(name) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptyrail-" + name + "-")); tmps.push(m);
  mk(m, "descriptor.mod", `name="${name}"\n`);
  return m;
}
const fire = (modRoot, gameRoot) => (md.validateMapBitmap({ modRoot, gameRoot, dependencyRoots: [] }) || [])
  .filter((p) => p.rule === "supply_nodes_empty" || p.rule === "railways_empty");
const size = (p) => { try { return fs.statSync(p).size; } catch (_) { return -1; } };

try {
  console.log("\n=== 1. Delete map really does write both files empty (the REAL blankMapToSea, run) ===");
  const game = newGame();
  const blanked = newMod("blanked");
  // ⛔ THE BLANK NOW HAS A PRECONDITION, AND THIS FIXTURE HAS TO MEET IT.
  // #a-blank-cannot-claim-a-world-the-mod-does-not-own landed in the same batch as this file and refuses
  // blankMapToSea outright when the mod does not own map/provinces.bmp — because retyping rows while the SHAPES
  // stay the base game's is what drowned two thirds of the owner's world in place. This mod owned only a
  // descriptor, so the blank returned { changed: false } and all twelve checks below it fell, on a rule that is
  // still exactly right. Give it its own bitmap: an empty supply_nodes.txt hides the layer below whoever wrote it.
  mk(blanked, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  {
    const r = md.blankMapToSea({ modRoot: blanked, gameRoot: game, dependencyRoots: [] });
    rec("the blank ran and flipped the land", !!(r && r.changed) && r.flippedProvinces === 48, r && { changed: r.changed, flipped: r.flippedProvinces });
    rec("⭐⭐⭐ it left map/supply_nodes.txt in the mod at zero bytes", size(path.join(blanked, "map", "supply_nodes.txt")) === 0, size(path.join(blanked, "map", "supply_nodes.txt")));
    rec("⭐⭐⭐ …and map/railways.txt too", size(path.join(blanked, "map", "railways.txt")) === 0, size(path.join(blanked, "map", "railways.txt")));
    rec("…and it reports what it took down", !!(r && r.supplyRail) && r.supplyRail.supplyRemoved === BASE_HUBS.length, r && r.supplyRail);
    // The base game still has its own — the mod's empty copy is what hides them.
    rec("the layer below is untouched", size(path.join(game, "map", "supply_nodes.txt")) > 0 && size(path.join(game, "map", "railways.txt")) > 0);
  }

  console.log("\n=== 2. …and on a world with no land, that is correct and nothing is said ===");
  {
    const p = fire(blanked, game);
    rec("⭐⭐ a blank ocean canvas is not told its hubs are missing", p.length === 0, p.map((x) => x.rule));
  }

  console.log("\n=== 3. Generate land puts a world back — and the empty files are still there ===");
  {
    // What Generate land leaves behind, in the one respect this rule reads: land rows in the mod's own
    // definition.csv, over the empty supply/railway files the blank wrote.
    mk(blanked, "map/definition.csv", definition((p) => p <= 24));
    const p = fire(blanked, game);
    const supply = p.find((x) => x.rule === "supply_nodes_empty");
    const rail = p.find((x) => x.rule === "railways_empty");
    rec("⭐⭐⭐ the modder is told the map has no supply hubs", !!supply, p.map((x) => x.rule));
    rec("⭐⭐⭐ …and no railways", !!rail, p.map((x) => x.rule));
    rec("both are WARNINGS (the game loads this map — the owner's launch reached a 1936 game)",
      !!supply && supply.severity === "warning" && !!rail && rail.severity === "warning", p.map((x) => x.rule + "=" + x.severity));
    rec("⭐⭐ and neither is in the FATAL set, so Save does not stop for them",
      !labels.isFatalRule("supply_nodes_empty") && !labels.isFatalRule("railways_empty"));
    const claims = (m) => /will crash|crashes the|guaranteed crash|stops? HOI4 loading/i.test(String(m));
    rec("⭐⭐ neither message claims a crash", !!supply && !claims(supply.message) && !!rail && !claims(rail.message),
      [supply && supply.message.slice(0, 120), rail && rail.message.slice(0, 120)]);
    rec("each names its own file", !!supply && /map\/supply_nodes\.txt/.test(supply.message) && !!rail && /map\/railways\.txt/.test(rail.message));
    // The number of hubs the empty file hides is READ from the layer below, not assumed.
    rec("⭐⭐ the message counts what the layer below actually has", !!supply && supply.below === BASE_HUBS.length && !!rail && rail.below === BASE_RAILS.length,
      { supply: supply && supply.below, rail: rail && rail.below, want: [BASE_HUBS.length, BASE_RAILS.length] });
    rec("…and prints it, so the modder knows what is being hidden",
      !!supply && supply.message.indexOf(String(BASE_HUBS.length)) > 0 && !!rail && rail.message.indexOf(String(BASE_RAILS.length)) > 0);
    rec("⭐ neither offers Auto-fix (Nova cannot decide where a hub belongs on a redrawn world)",
      !!supply && supply.autoFix === false && !!rail && rail.autoFix === false);
    rec("both have a friendly label, so the panel never shows the raw rule name",
      !!labels.LABELS.supply_nodes_empty && !!labels.LABELS.railways_empty,
      [labels.mapRuleLabel("supply_nodes_empty"), labels.mapRuleLabel("railways_empty")]);
  }

  console.log("\n=== 4. silence where it belongs ===");
  {
    const plain = newMod("plain");
    mk(plain, "map/definition.csv", definition((p) => p <= 24));       // a mod that edits terrain and nothing else
    rec("⭐⭐ a mod that ships neither file is not told anything (the layer below's are loaded)", fire(plain, game).length === 0,
      fire(plain, game).map((x) => x.rule));

    const full = newMod("full");
    mk(full, "map/definition.csv", definition((p) => p <= 24));
    mk(full, "map/supply_nodes.txt", SUPPLY_TXT);
    mk(full, "map/railways.txt", RAIL_TXT);
    rec("a mod that ships them WITH rows is not told anything", fire(full, game).length === 0, fire(full, game).map((x) => x.rule));

    const oneEmpty = newMod("oneempty");
    mk(oneEmpty, "map/definition.csv", definition((p) => p <= 24));
    mk(oneEmpty, "map/supply_nodes.txt", "");
    mk(oneEmpty, "map/railways.txt", RAIL_TXT);
    const p1 = fire(oneEmpty, game);
    rec("⭐ one empty file is one problem, not two", p1.length === 1 && p1[0].rule === "supply_nodes_empty", p1.map((x) => x.rule));

    // A file of nothing but blank lines is empty too — that is what the writers leave behind.
    const blankLines = newMod("blanklines");
    mk(blankLines, "map/definition.csv", definition((p) => p <= 24));
    mk(blankLines, "map/supply_nodes.txt", "\n\n  \n");
    rec("⭐ a file of blank lines counts as empty", fire(blankLines, game).some((x) => x.rule === "supply_nodes_empty"),
      fire(blankLines, game).map((x) => x.rule));

    // A naval total conversion IS allowed to exist: an all-sea map is never told about its missing hubs.
    const allSea = newMod("allsea");
    mk(allSea, "map/definition.csv", definition(() => false));
    mk(allSea, "map/supply_nodes.txt", "");
    mk(allSea, "map/railways.txt", "");
    rec("⭐⭐ an all-sea map is not told about hubs it has no land for", fire(allSea, game).length === 0, fire(allSea, game).map((x) => x.rule));
  }

  console.log("\n=== 5. a mod that hides the map folder is judged on its own file alone ===");
  {
    const tc = newMod("tc");
    fs.writeFileSync(path.join(tc, "descriptor.mod"), 'name="TC"\nreplace_path="map"\n');
    mk(tc, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
    mk(tc, "map/definition.csv", definition((p) => p <= 24));
    mk(tc, "map/supply_nodes.txt", "");
    const p = fire(tc, game).find((x) => x.rule === "supply_nodes_empty");
    rec("it is still told its map has no supply hubs", !!p, fire(tc, game).map((x) => x.rule));
    rec("⭐⭐ …but not that a layer below had any, because replace_path=\"map\" hides them",
      !!p && p.below === 0 && !/the map below yours has/.test(p.message), p && { below: p.below });
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== an empty supply or railway file deletes every hub below it: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
