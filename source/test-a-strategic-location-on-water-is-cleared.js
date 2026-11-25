// ⭐⭐ #a-strategic-location-on-water-is-cleared — A COAST-ONLY ALLOWANCE HANDED TO OPEN OCEAN, AND THE CLICK THAT
// LEFT IT THERE.
//
// #a-strategic-location-the-game-refuses gave Nova the rule: `strategic_province_location = { natural_harbor = 12140 }`
// raises the max level of a coastal building on one of a state's provinces, and when that province is not coastal HOI4
// logs "Building: … did not exist or is invalid in the province: N" and never applies the levels. It REPORTED them and
// cleared none.
//
// ⛔ MEASURED on the owner's finished world (own the map → Delete map → Generate land 35% → Auto-fix ×2), the biggest
// single entry left on it: 12 of these, in 10 vanilla state files the flow had materialised into the mod, and 11 of the
// 12 name a province that is now OCEAN. Handing a coast-only allowance to open sea is the same shape as the ports,
// victory points and unit positions fixSeaProvinceLeftovers already scrubs off a drowned province — so it takes these
// too, in the same pass. On that world: 12 reported → 1, slRemoved 11, nine files touched out of 854.
//
// ⛔⛔ THE TRAP THAT MAKES THIS MORE THAN ONE LINE: that pass gives the whole block back untouched when taking the sea
// out would leave the state with no provinces at all (#a-cleanup-must-not-empty-a-state — the guard that stopped one
// click manufacturing 404 fatal problems). On the world this was written for, that is the NORMAL case: 216 states hit
// it, and ALL NINE carrying a clearable location are among them, because every province they own is now water. A cut
// done after it, or one thrown away by its `return b`, would have cleared ZERO of the eleven and looked like it worked.
//
// ⚠️ AND THREE THINGS IT MUST NOT TOUCH, each with a control below:
//   • a location whose province is still LAND — three possible repairs, none of them deleting a line the modder wrote
//     on land they still own. One of the owner's 12 is this (13071 in state 178) and a click leaves it standing.
//   • a location on a LAKE — a lake sits inside a state legitimately (vanilla ships 118), exactly as the water cleanup
//     beside this one is sea-only. A lake reaches the same "not land at all" sentence, so the message and the fixer must
//     agree about it or the popup promises a repair the click does not make.
//   • a location in a state file the mod does not SHIP — editing it materialises a base-game state into the mod
//     (#seafix-materialises-vanilla-states, which took a fixture from 0 map errors to 3).
//
// Run: node test-a-strategic-location-on-water-is-cleared.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))).slice(0, 400));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slwater-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const M = require("./map-data.js");
const COAST = "strategic_location_building_needs_coast";
const NOGAME = path.join(ROOT, "no-game");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const SHIPPING = { vanilla: GAME, MD: W + "2777392649", R56: W + "820260968", OWB: W + "2265420196", NV: W + "1827273767", RoN: W + "2026448968" };

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────────────
// Two bundles that need a coast, one that does not — shaped like vanilla's own common/strategic_locations.
const LOCATIONS = ["harbour_bundle = {", "\tnaval_base = 2", "}", "", "fort_bundle = {", "\tcoastal_bunker = 2", "}", "", "inland_bundle = {", "\tbunker = 2", "}", ""].join("\n");
const BUILDINGS = [
  "buildings = {", "",
  "\tnaval_base = {", "\t\tonly_costal = yes", "\t\tis_port = yes", "\t\tlevel_cap = { province_max = 10 }", "\t}", "",
  "\tcoastal_bunker = {", "\t\tonly_costal = yes", "\t\tlevel_cap = { province_max = 10 }", "\t}", "",
  "\tbunker = {", "\t\tlevel_cap = { province_max = 10 }", "\t}", "",
  "}", "",
].join("\n");
// 1 and 9 are coastal land; 2 is LANDLOCKED land and 13 a LAKE (the two leave-alone shapes); the rest is drowned world.
const TYPE = { 1: "land", 2: "land", 3: "sea", 4: "sea", 5: "sea", 6: "sea", 7: "sea", 8: "sea", 9: "land", 10: "sea", 11: "land", 12: "sea", 13: "lake", 14: "land" };
const COASTAL = { 1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: true, 10: false, 11: false, 12: false, 13: false, 14: false };
const definitionCsv = (type, coastal) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 14; p++) rows.push(`${p};${p * 17};${p};0;${type[p]};${coastal[p] ? "true" : "false"};${type[p] === "sea" ? "ocean" : "plains"};${type[p] === "sea" ? 0 : 1}`);
  return rows.join("\n") + "\n";
};
const state = (id, provinces, historyLines) => [
  "state = {", `\tid = ${id}`, `\tname = "STATE_${id}"`, "\tmanpower = 1000", "\tstate_category = rural",
  `\tprovinces = { ${provinces.join(" ")} }`, "\thistory = {", `\t\towner = A${id}A`,
  ...historyLines.map((l) => "\t\t" + l), "\t}", "}", "",
].join("\n");

const STATES = {
  // ── 1. LAND that merely lost its coast: reported, and the click must leave the file byte-identical.
  "1-Land.txt": state(1, [1, 2], [
    "strategic_province_location = { harbour_bundle = 2 }",
  ]),
  // ── 2. EVERY province drowned — the wouldEmpty shape, which is where the whole thing lives or dies.
  //      The comment above the statement and the one trailing it belong to it and go with it; the ones below do not.
  "2-Drowned.txt": state(2, [3, 4], [
    "victory_points = {",
    "\t3 5 # Portsmouth",
    "}",
    "# the harbour the island was famous for",
    "strategic_province_location = { harbour_bundle = 3 } # and it is under water now",
    "# a bunker needs no coast, so the game takes this one",
    "strategic_province_location = { inland_bundle = 4 }",
    "strategic_state_location = { harbour_bundle = 3 }",
    "1939.1.1 = {",
    "\tstrategic_province_location = { harbour_bundle = 3 }",
    "}",
  ]),
  // ── 3. ONE BLOCK, TWO KEYS: only the drowned one goes, the block stays for the other, and the comment ABOVE the
  //      inner key goes with that key — without reaching back past the opening brace for the statement's own caption.
  "3-Two.txt": state(3, [5, 6], [
    "# the whole bundle, both halves of it",
    "strategic_province_location = {",
    "\t# the harbour, now under water",
    "\tharbour_bundle = 5",
    "\tinland_bundle = 6 # this one the game takes",
    "}",
  ]),
  // ── 4. written CRLF (see below) — a cut anchored on a bare \n silently matches nothing and reports success.
  "4-Crlf.txt": state(4, [7, 8], [
    "strategic_province_location = { fort_bundle = 7 }",
  ]),
  // ── 5. a state that still owns LAND: it takes the province cut AND the location cut in the same pass.
  "5-Mixed.txt": state(5, [9, 10], [
    "strategic_province_location = { harbour_bundle = 10 }",
  ]),
  // ── 6. a LAKE inside a state, which is legal and normal. Reported (the game refuses the building all the same),
  //      never cut — and the message must say so rather than promising the click.
  "6-Lake.txt": state(6, [13, 14], [
    "strategic_province_location = { harbour_bundle = 13 }",
  ]),
  // ── 7. ⛔ A COMMENTED-OUT COPY OF THE VERY LINE, directly above the live one. String.replace takes the FIRST match,
  //      which is the disabled one; and a caption walk that reads `#}` as prose eats the middle and end of the disabled
  //      block and leaves its opening dangling — an unmatched brace inside a comment, which loses the whole state file
  //      (#a-caption-ate-a-commented-out-block). All four comment lines must survive byte for byte.
  "7-Disabled.txt": state(7, [11, 12], [
    "# an older version, kept for reference",
    "#strategic_province_location = {",
    "#\tharbour_bundle = 12",
    "#}",
    "strategic_province_location = { harbour_bundle = 12 }",
  ]),
};

// ⭐ THE KNOWN ANSWER, declared ONCE beside the fixture that produces it: every [state, province] the rule must report
// and the shape it is. Every count below is derived from this — a hand-typed 4 and a hand-typed 5 in six places is how
// a fixture grows a seventh state and the test starts asserting the old world.
const EXPECT = [[1, 2, "land"], [2, 3, "sea"], [3, 5, "sea"], [4, 7, "sea"], [5, 10, "sea"], [6, 13, "lake"], [7, 12, "sea"]];
const EXPECT_SEA = EXPECT.filter((e) => e[2] === "sea");

function writeRoot(root, { descriptor = null, states = STATES, type = TYPE, coastal = COASTAL, common = true, map = true, crlf = ["4-Crlf.txt"] } = {}) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  if (descriptor) mk("descriptor.mod", descriptor);
  if (map) mk("map/definition.csv", definitionCsv(type, coastal));
  if (common) { mk("common/strategic_locations/00_locations.txt", LOCATIONS); mk("common/buildings/00_buildings.txt", BUILDINGS); }
  for (const [f, body] of Object.entries(states)) mk("history/states/" + f, (crlf || []).includes(f) ? body.replace(/\n/g, "\r\n") : body);
  return root;
}
const readState = (root, f) => fs.readFileSync(path.join(root, "history", "states", f), "utf8");
const modelOf = (modRoot, gameRoot) => { M.clearMapLayerCache(); return M.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false }); };
const reported = (modRoot, gameRoot) => M.validateMapModel(modelOf(modRoot, gameRoot)).filter((p) => p.rule === COAST);
const eolOf = (s) => (s.indexOf("\r\n") !== -1 ? "CRLF" : "LF");
const mixed = (s) => s.indexOf("\r\n") !== -1 && /[^\r]\n/.test(s);
const occurrences = (s, needle) => String(s).split(needle).length - 1;
/** What left the file and what arrived, as line bags — the shape a splice is judged by. */
const lineDiff = (a, b) => {
  const bag = (s) => { const m = new Map(); for (const l of s.replace(/\r\n/g, "\n").split("\n")) m.set(l, (m.get(l) || 0) + 1); return m; };
  const ba = bag(a), bb = bag(b), gone = [], added = [];
  for (const [l, n] of ba) for (let i = 0; i < n - (bb.get(l) || 0); i++) gone.push(l);
  for (const [l, n] of bb) for (let i = 0; i < n - (ba.get(l) || 0); i++) added.push(l);
  return { gone, added };
};
// ⭐ COMMENTS ARE CONTENT: comment text → the key on the next code line. A writer that keeps every comment and
// re-attaches it to the wrong statement passes a multiset comparison at identical byte count.
const captionMap = (txt) => {
  const lines = txt.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith("#")) continue;
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith("#"))) j++;
    out.push(t + " -> " + (j < lines.length ? lines[j].trim() : "(eof)"));
  }
  return out;
};
/** ⛔ EVERY comment → the code it belongs to, TRAILING ONES INCLUDED. captionMap above only sees a comment on its own
 *  line, and vanilla's 526-Okinawa.txt has none at all — so comparing two of its caption maps compares [] with [] and
 *  passes whatever the writer did. A vacuous check reads exactly like a real one. This is what section 5 asserts on,
 *  and it asserts the map is non-empty first. */
const commentOwners = (txt) => {
  const out = [];
  const lines = txt.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].indexOf("#");
    if (h === -1) continue;
    const before = lines[i].slice(0, h).trim(), c = lines[i].slice(h).trim();
    if (before) { out.push(c + " -> (same line) " + before); continue; }
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith("#"))) j++;
    out.push(c + " -> " + (j < lines.length ? lines[j].trim() : "(eof)"));
  }
  return out;
};

try {
  console.log("0. THE CONTROL — the fixture really carries every shape, and the rule reports the ones it should");
  const mod = writeRoot(path.join(ROOT, "mod"), { descriptor: 'name="SL water"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common"\n' });
  {
    const before = reported(mod, NOGAME);
    const byProv = before.map((p) => [p.stateId, p.province, p.provinceType]).sort();
    rec("⭐⭐ the rule reports exactly the known answer — every drowned one, the landlocked one and the lake",
      JSON.stringify(byProv) === JSON.stringify(EXPECT.slice().sort()), byProv);
    const sea = before.filter((p) => p.provinceType === "sea");
    const land = before.filter((p) => p.provinceType === "land");
    const lake = before.filter((p) => p.provinceType === "lake");
    rec(`THE CONTROL: ${EXPECT_SEA.length} of them are on SEA…`, sea.length === EXPECT_SEA.length, sea.map((p) => p.province));
    rec("THE CONTROL: …one on LAND that merely lost its coast…", land.length === 1 && land[0].province === 2, land.map((p) => p.province));
    rec("THE CONTROL: …and one on a LAKE", lake.length === 1 && lake[0].province === 13, lake.map((p) => p.province));
    rec("⚠️ a bundle needing no coast is not among them (province 4, 6)", !before.some((p) => p.province === 4 || p.province === 6), before.map((p) => p.province));
    rec("⚠️ nor the strategic_state_location, nor the dated entry", before.filter((p) => p.province === 3).length === 1, before.filter((p) => p.province === 3).length);
    rec("THE CONTROL: the CRLF fixture really is CRLF on disk", eolOf(readState(mod, "4-Crlf.txt")) === "CRLF" && !mixed(readState(mod, "4-Crlf.txt")));
    // findStrategicLocationsWithoutCoast is the ONE answer both the rule and the fixer read.
    const found = M.findStrategicLocationsWithoutCoast(modelOf(mod, NOGAME));
    rec("⭐⭐⭐ the rule and the repair read one list, not two",
      found.length === before.length && found.every((h) => before.some((p) => p.stateId === h.stateId && p.province === h.province && p.location === h.location)),
      [found.length, before.length]);
    // ⭐⭐⭐ …and `clearable` is what the MESSAGE promises from and what the FIXER filters on. If these two ever came
    // apart, the popup would offer a button that does nothing — so the list itself is asserted, not just its length.
    // Derived from the fixture's own TYPE map, never typed in: clearable is exactly "refused AND the province is sea".
    const ids = (xs) => xs.map((h) => h.province).sort((a, b) => a - b).join(",");
    rec("⭐⭐⭐ clearable is exactly the SEA ones — not the land one, not the lake",
      ids(found.filter((h) => h.clearable)) === ids(found.filter((h) => TYPE[h.province] === "sea"))
        && ids(found.filter((h) => h.clearable)) === EXPECT_SEA.map((e) => e[1]).sort((a, b) => a - b).join(","),
      found.map((h) => [h.province, h.provinceType, h.clearable]));
  }

  console.log("\n1. THE SPLICE ITSELF — driven on the block, key by key");
  {
    const b2 = M.findStateBlockById(readState(mod, "2-Drowned.txt"), 2).block;
    const cut = M.removeStrategicLocationFromBlock(b2, "harbour_bundle", 3);
    // Three mentions of the bundle on province 3 go in — the undated province effect, the state effect, the dated one.
    // Exactly ONE leaves, and #a-strategic-location-the-game-refuses says which: "after X" is not "only after X".
    rec("⭐ the undated statement for the drowned province is gone, and it alone",
      occurrences(b2, "harbour_bundle = 3") === 3 && occurrences(cut, "harbour_bundle = 3") === 2
        && occurrences(cut.split("1939.1.1")[0], "strategic_province_location = { harbour_bundle = 3 }") === 0,
      [occurrences(b2, "harbour_bundle = 3"), occurrences(cut, "harbour_bundle = 3")]);
    rec("⭐⭐ …with its caption comment and its trailing comment, which belonged to it",
      cut.indexOf("# the harbour the island was famous for") === -1 && cut.indexOf("# and it is under water now") === -1);
    rec("⭐⭐ …and the DATED copy of the very same line is still there — position, not presence",
      /1939\.1\.1\s*=\s*\{[\s\S]*harbour_bundle\s*=\s*3[\s\S]*?\}/.test(cut));
    rec("⭐ the strategic_state_location naming the same province is untouched", /strategic_state_location\s*=\s*\{\s*harbour_bundle\s*=\s*3\s*\}/.test(cut));
    rec("⭐ the bundle that needs no coast is untouched, with its own caption",
      /# a bunker needs no coast[\s\S]*strategic_province_location\s*=\s*\{\s*inland_bundle\s*=\s*4\s*\}/.test(cut));
    rec("⭐ the victory point and its comment are untouched", /3 5 # Portsmouth/.test(cut));
    const caps = captionMap(cut);
    rec("⭐⭐⭐ every comment left is still above the key it captioned",
      caps.includes("# a bunker needs no coast, so the game takes this one -> strategic_province_location = { inland_bundle = 4 }"), caps);
    rec("THE CONTROL: a name the block does not carry changes nothing",
      M.removeStrategicLocationFromBlock(b2, "no_such_bundle", 3) === b2 && M.removeStrategicLocationFromBlock(b2, "harbour_bundle", 999) === b2);
    rec("THE CONTROL: a province id that is a prefix of the real one is not the real one",
      M.removeStrategicLocationFromBlock(b2, "harbour_bundle", 33) === b2 && M.removeStrategicLocationFromBlock(b2, "harbour_bundle", 1) === b2);

    const b3 = M.findStateBlockById(readState(mod, "3-Two.txt"), 3).block;
    const two = M.removeStrategicLocationFromBlock(b3, "harbour_bundle", 5);
    rec("⭐⭐ a block granting two loses only the key named…", two.indexOf("harbour_bundle = 5") === -1 && /inland_bundle = 6 # this one the game takes/.test(two), two.slice(two.indexOf("history"), two.indexOf("history") + 260));
    rec("⭐⭐ …and keeps the statement itself, rather than leaving an empty one behind",
      /strategic_province_location\s*=\s*\{[\s\S]*inland_bundle = 6[\s\S]*\}/.test(two) && !/strategic_province_location\s*=\s*\{\s*\}/.test(two));
    rec("⭐⭐⭐ the comment above the INNER key went with that key…", two.indexOf("# the harbour, now under water") === -1, two);

    // ⛔ THE COMMENTED-OUT COPY — the first textual match is the disabled one, and it is not the one to cut.
    const b7 = M.findStateBlockById(readState(mod, "7-Disabled.txt"), 7).block;
    const dis = M.removeStrategicLocationFromBlock(b7, "harbour_bundle", 12);
    rec("⭐⭐⭐ the LIVE statement was cut, not the commented-out copy above it",
      occurrences(b7, "harbour_bundle = 12") === 2 && occurrences(dis, "harbour_bundle = 12") === 1
        && !/^[ \t]*strategic_province_location/m.test(dis.split("provinces")[0].replace(/^[ \t]*#.*$/gm, "")),
      [occurrences(b7, "harbour_bundle = 12"), occurrences(dis, "harbour_bundle = 12")]);
    rec("⭐⭐⭐ …and every line of the disabled block survived, braces and all",
      ["# an older version, kept for reference", "#strategic_province_location = {", "#\tharbour_bundle = 12", "#}"].every((l) => dis.indexOf(l) !== -1),
      dis.split("\n").filter((l) => l.trim().startsWith("#")));
    // ⛔ …and captionStart was floored at the block's own inner start: a partial cut that walked past the opening brace
    // would have taken the statement's caption — and with it the line that opens the block that still has to stand.
    rec("⭐⭐⭐ …while the STATEMENT's own caption, above the opening brace, stayed put",
      /# the whole bundle, both halves of it\s*\n\s*strategic_province_location\s*=\s*\{/.test(two), two.slice(two.indexOf("# the whole"), two.indexOf("# the whole") + 120));
  }

  console.log("\n2. ⛔ THE CLICK, on the shape that made this hard: every province drowned");
  {
    const before = { ...Object.fromEntries(Object.keys(STATES).map((f) => [f, readState(mod, f)])) };
    const r = M.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    console.log("   fixer: " + JSON.stringify({ statesEdited: r.statesEdited, slRemoved: r.slRemoved, provincesRemoved: r.provincesRemoved, wouldEmpty: r.wouldEmpty }));
    const after = reported(mod, NOGAME);
    rec("⭐⭐⭐ every drowned location is gone from the report", after.every((p) => p.provinceType !== "sea"), after.map((p) => [p.stateId, p.province, p.provinceType]));
    rec("⭐⭐⭐ …and the LAND one is still reported, because Nova left it exactly alone",
      after.some((p) => p.province === 2) && readState(mod, "1-Land.txt") === before["1-Land.txt"], after.map((p) => p.province));
    rec("⭐⭐⭐ …and so is the LAKE, byte-identical on disk — the fixer is sea-only, exactly as its message says",
      after.some((p) => p.province === 13) && readState(mod, "6-Lake.txt") === before["6-Lake.txt"], after.map((p) => [p.province, p.provinceType]));
    rec("⭐ the fixer says how many it took", r.slRemoved === EXPECT_SEA.length, [r.slRemoved, EXPECT_SEA.length]);
    rec("⭐⭐ THE TRAP: the states whose every province is water were cleared, though the province cut had to be abandoned",
      (r.wouldEmpty || []).includes(2) && (r.wouldEmpty || []).includes(3)
        && occurrences(readState(mod, "2-Drowned.txt").split("1939.1.1")[0], "strategic_province_location = { harbour_bundle = 3 }") === 0
        && occurrences(readState(mod, "2-Drowned.txt"), "harbour_bundle = 3") === 2,
      { wouldEmpty: r.wouldEmpty, left: occurrences(readState(mod, "2-Drowned.txt"), "harbour_bundle = 3") });
    rec("⭐⭐ …and those states still list their provinces, so the cleanup did not empty one",
      /provinces\s*=\s*\{\s*3 4\s*\}/.test(readState(mod, "2-Drowned.txt")) && /provinces\s*=\s*\{\s*5 6\s*\}/.test(readState(mod, "3-Two.txt")));
    rec("⭐⭐ a state that still owns land takes BOTH cuts in one pass",
      !/harbour_bundle = 10/.test(readState(mod, "5-Mixed.txt")) && /provinces\s*=\s*\{\s*9\s*\}/.test(readState(mod, "5-Mixed.txt")), readState(mod, "5-Mixed.txt").match(/provinces[^}]*\}/));
    rec("⭐⭐⭐ the CRLF file is still CRLF and has not gained a pocket of LF",
      eolOf(readState(mod, "4-Crlf.txt")) === "CRLF" && !mixed(readState(mod, "4-Crlf.txt")) && !/fort_bundle/.test(readState(mod, "4-Crlf.txt")),
      { eol: eolOf(readState(mod, "4-Crlf.txt")), mixed: mixed(readState(mod, "4-Crlf.txt")) });
    rec("⭐ the dated entry survived the click", /1939\.1\.1\s*=\s*\{[\s\S]*harbour_bundle\s*=\s*3/.test(readState(mod, "2-Drowned.txt")));
    rec("⭐ the state effect survived the click", /strategic_state_location\s*=\s*\{\s*harbour_bundle\s*=\s*3\s*\}/.test(readState(mod, "2-Drowned.txt")));

    // ⭐⭐⭐ RUN IT TWICE AND HASH THE DISK — "fixed=N" with the tree byte-identical is the shape that hid a bug class.
    const snap = Object.fromEntries(Object.keys(STATES).map((f) => [f, readState(mod, f)]));
    const r2 = M.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    rec("⭐⭐ a second click takes nothing and writes nothing",
      r2.slRemoved === 0 && Object.keys(STATES).every((f) => readState(mod, f) === snap[f]), { slRemoved: r2.slRemoved });
  }

  console.log("\n3. ⛔ #seafix-materialises-vanilla-states — a state file the mod does not SHIP is not the mod's to rewrite");
  {
    // The owner's own shape with one thing changed: the mod drowned the province in ITS definition.csv, and inherits
    // every state file. The rule still fires — the row is the mod's — and the click must not copy a state in to edit it.
    const base = writeRoot(path.join(ROOT, "base"), { type: { ...TYPE, 3: "land" }, coastal: { ...COASTAL, 3: false } });
    const drowner = path.join(ROOT, "drowner");
    writeRoot(drowner, { descriptor: 'name="Drowner"\n', states: {}, common: false });   // its own map/, no states at all
    const before = reported(drowner, base);
    rec("THE CONTROL: the rule fires — the mod's own row is what drowned the province",
      before.some((p) => p.province === 3 && p.provinceType === "sea"), before.map((p) => [p.stateId, p.province, p.provinceType]));
    rec("⭐⭐ …and says Auto-fix leaves it alone, rather than promising a repair it will not make",
      before.filter((p) => p.province === 3).every((p) => p.autoFix === false && /Auto-fix leaves it alone/.test(String(p.message)) && /does not ship this state's file/.test(String(p.message))),
      before.filter((p) => p.province === 3).map((p) => [p.autoFix, String(p.message).slice(-170)]));
    const dir = path.join(drowner, "history", "states");
    const r = M.fixSeaProvinceLeftovers({ modRoot: drowner, gameRoot: base, dependencyRoots: [] });
    const made = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    rec("⭐⭐⭐ the click created no state file in the mod", made.length === 0 && !r.slRemoved, { made, slRemoved: r.slRemoved });
    rec("…and the base game's own file is untouched", readState(base, "2-Drowned.txt") === STATES["2-Drowned.txt"]);
    rec("⭐ the report still names it afterwards, so nothing is silently dropped",
      reported(drowner, base).some((p) => p.province === 3), reported(drowner, base).map((p) => p.province));
  }

  console.log("\n4. ⭐⭐ THE MESSAGE SAYS WHICH OF THE THREE IT IS — the popup counts the sentence it reads");
  {
    const all = reported(mod, NOGAME).concat(reported(path.join(ROOT, "drowner"), path.join(ROOT, "base")));
    const land = all.filter((p) => p.provinceType === "land");
    const lake = all.filter((p) => p.provinceType === "lake");
    rec("THE CONTROL: there is a land one, a lake one and an inherited-file one to compare",
      land.length >= 1 && lake.length >= 1 && all.some((p) => p.autoFix === false && p.provinceType === "sea"), all.length);
    rec("⭐⭐ the LAND one declines Auto-fix in its own words",
      land.every((p) => p.autoFix === false && /Auto-fix leaves it alone/.test(String(p.message)) && /your decision/.test(String(p.message))),
      land.map((p) => String(p.message).slice(-200)));
    rec("⭐⭐⭐ so does the LAKE — and it does NOT say a click will clear it",
      lake.every((p) => p.autoFix === false && /Auto-fix leaves it alone/.test(String(p.message)) && /legitimately/.test(String(p.message)) && !/Auto-fix all clears it/.test(String(p.message))),
      lake.map((p) => String(p.message).slice(-230)));
    // …and the one the click DOES clear must name Auto-fix, or the popup's "n of the m below name it as their repair"
    // never counts it and the modder is never offered the button. Read off a fresh fixture, since `mod` is now clean.
    const again = writeRoot(path.join(ROOT, "mod2"), { descriptor: 'name="SL water 2"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common"\n' });
    const fixable = reported(again, NOGAME).filter((p) => p.provinceType === "sea");
    rec("⭐⭐⭐ a drowned one in the mod's own file names Auto-fix as its repair and does not decline it",
      fixable.length > 0 && fixable.every((p) => p.autoFix !== false && /\bAuto-fix\b/.test(String(p.message)) && /Auto-fix all clears it/.test(String(p.message))),
      fixable.map((p) => [p.province, p.autoFix, String(p.message).slice(-150)]));
  }

  console.log("\n5. ⭐⭐ THE REAL DATA — vanilla's own 526-Okinawa.txt, with the two edits the owner's flow made");
  if (!fs.existsSync(path.join(GAME, "history", "states", "526-Okinawa.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    // Vanilla 526 carries four entries — three strategic_province_location (11932, 10124, 11932) and one
    // strategic_state_location — and the flow turned 10124 and 11932 into sea. defensive_chokepoint grants `bunker`,
    // which needs no coast, so only the two defensible_coastline entries are refused, and only those may be cut.
    // ⭐ THE DISCRIMINATOR THE CORPUS SUPPLIES FOR FREE: defensible_coastline = 11932 goes and
    // defensive_chokepoint = 11932 stays, so the cut is by LOCATION NAME and not merely by province id.
    const vanillaState = fs.readFileSync(path.join(GAME, "history", "states", "526-Okinawa.txt"), "utf8");
    const def = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)
      .map((l) => (/^(10124|11932);/.test(l) ? l.replace(/;land;(?:true|false);[^;]*;/, ";sea;false;ocean;") : l)).join("\n");
    rec("the fixture really turned both provinces into sea", /^10124;.*;sea;false;/m.test(def) && /^11932;.*;sea;false;/m.test(def));
    const oki = path.join(ROOT, "okinawa");
    fs.mkdirSync(path.join(oki, "history", "states"), { recursive: true });
    fs.mkdirSync(path.join(oki, "map"), { recursive: true });
    fs.writeFileSync(path.join(oki, "descriptor.mod"), 'name="Okinawa"\n');
    fs.writeFileSync(path.join(oki, "history", "states", "526-Okinawa.txt"), vanillaState);
    fs.writeFileSync(path.join(oki, "map", "definition.csv"), def);
    const before = reported(oki, GAME);
    rec("⭐⭐ two of vanilla's own entries are refused for want of a coast", before.length === 2 && before.every((p) => p.location === "defensible_coastline"), before.map((p) => [p.province, p.location]));
    const capsBefore = commentOwners(vanillaState);
    rec("THE CONTROL: vanilla's own file really carries comments to lose — the check below is not comparing [] with []",
      capsBefore.length >= 2, capsBefore);
    M.fixSeaProvinceLeftovers({ modRoot: oki, gameRoot: GAME, dependencyRoots: [] });
    const after = readState(oki, "526-Okinawa.txt");
    rec("⭐⭐⭐ the click clears both and reports none", reported(oki, GAME).length === 0, reported(oki, GAME).map((p) => [p.province, p.location]));
    rec("⭐⭐ the defensive_chokepoint entry the game accepts is still there, on the same province",
      /strategic_province_location\s*=\s*\{\s*defensive_chokepoint\s*=\s*11932\s*\}/.test(after.replace(/\r/g, "")));
    rec("⭐⭐ so is the strategic_state_location", /strategic_state_location\s*=\s*\{\s*favorable_approach\s*=\s*11932\s*\}/.test(after.replace(/\r/g, "")));
    rec("⭐⭐⭐ every comment vanilla wrote that is not about a drowned province still belongs to the key it captioned",
      JSON.stringify(commentOwners(after)) === JSON.stringify(capsBefore.filter((c) => !/11932|10124/.test(c))), { before: capsBefore, after: commentOwners(after) });
    rec("⭐ everything vanilla wrote that is not about a drowned province is exactly as it wrote it",
      ["coal = 4 # Represents the Iriomote and Utara coal mines", "infrastructure = 2", "air_base = 3", "add_core_of = OKN", "local_supplies = 0.0", 'name="STATE_526"'].every((s) => after.indexOf(s) !== -1));
    rec("⭐ the file's line endings are vanilla's, unmixed", eolOf(after) === eolOf(vanillaState) && !mixed(after), { before: eolOf(vanillaState), after: eolOf(after) });
    // ⚠️ THE REST OF THE PASS RUNS TOO, and must: 1123 and 7115 are still land, so this state does NOT hit the
    // empty-state guard and the ordinary water cleanup takes 11932's victory point, its naval base and both ids out of
    // the provinces list. That is #a-province-turned-to-water-leaves-no-history-behind, not this cut. So the claim to
    // make is the one that covers both: NOT ONE LINE LEFT THIS FILE THAT WAS NOT ABOUT A PROVINCE THE MAP DROWNED.
    {
      const { gone, added } = lineDiff(vanillaState, after);
      const aboutDrowned = (l) => /11932|10124/.test(l) || /^\s*[}{]\s*$/.test(l) || /^\s*(strategic_province_location|victory_points)\s*=\s*\{\s*$/.test(l) || /^\s*naval_base\s*=\s*\d+\s*$/.test(l);
      rec("⭐⭐⭐ every line that left the file was about province 11932 or 10124 (or a brace closing one)",
        gone.length > 0 && gone.every(aboutDrowned), gone);
      rec("⭐⭐ …and the only line added is the provinces list rewritten without them",
        added.length === 1 && /^\s*1123 7115\s*$/.test(added[0]), added);
    }
  }

  console.log("\n6. ⭐⭐⭐ NO SHIPPING MAP GIVES THIS CUT ANYTHING TO DO — every one of them launches");
  {
    let seen = 0;
    for (const [key, root] of Object.entries(SHIPPING)) {
      if (!fs.existsSync(path.join(root, "history", "states"))) { console.log("  ..   (" + key + " is not installed)"); continue; }
      seen++;
      M.clearMapLayerCache();
      const model = M.buildMapModel({ modRoot: key === "vanilla" ? null : root, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      let entries = 0;
      for (const st of model.states || []) entries += (st.strategicLocations || []).length;
      const hits = M.findStrategicLocationsWithoutCoast(model);
      const clearable = hits.filter((h) => h.clearable);
      rec(`⭐⭐ ${key}: ${entries} strategic-location entries, ${hits.length} refused, 0 the cut would touch`,
        hits.length === 0 && clearable.length === 0, clearable.map((h) => [h.stateId, h.province, h.location]));
    }
    rec("at least the base game was measured", seen >= 1, seen);
  }
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== a strategic location on water is cleared: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
}
