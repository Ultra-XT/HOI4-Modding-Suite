// Map Editor foundation — parsers for definition.csv + history/states and the merged map model.
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ── definition.csv ──
const defText = "province;red;green;blue;type;coastal;terrain;continent\r\n" + // header (skipped)
  "0;0;0;0;land;false;unknown;0\r\n" +
  "7;212;179;179;sea;true;ocean;0\r\n" +
  "114;40;15;15;land;false;plains;1\r\n";
const defs = md.parseDefinitionCsv(defText);
check("parses definition rows, skips header", defs.length === 3 && defs[0].id === 0, JSON.stringify(defs.map(d => d.id)));
const p114 = defs.find(d => d.id === 114);
check("parses rgb + land/continent", p114 && p114.r === 40 && p114.g === 15 && p114.b === 15 && p114.type === "land" && p114.continent === 1, JSON.stringify(p114));
const p7 = defs.find(d => d.id === 7);
check("parses sea + coastal=true", p7 && p7.type === "sea" && p7.coastal === true, JSON.stringify(p7));
check("clamps rgb to 0-255 and ignores junk lines", md.parseDefinitionCsv("9;999;-5;x;land;false;plains;1\ngarbage\n")[0].r === 255, "");

// ── states ──
const stateText = `
state = {
  id = 42
  name = "STATE_42"
  manpower = 120000
  state_category = town
  provinces = { 114 115 116 }
  history = {
    owner = GRE
    add_core_of = GRE
    add_core_of = TUR
    victory_points = { 114 5 }
    buildings = { infrastructure = 3 }
  }
}
`;
const states = md.parseStatesText(stateText);
check("parses one state with id/name", states.length === 1 && states[0].id === 42 && states[0].name === "STATE_42", JSON.stringify(states));
check("parses provinces list", JSON.stringify(states[0].provinces) === JSON.stringify([114, 115, 116]), JSON.stringify(states[0].provinces));
check("parses owner", states[0].owner === "GRE", states[0].owner);
check("parses multiple add_core_of", states[0].cores.length === 2 && states[0].cores.includes("GRE") && states[0].cores.includes("TUR"), JSON.stringify(states[0].cores));
check("parses victory_points pair", states[0].victoryPoints.length === 1 && states[0].victoryPoints[0].province === 114 && states[0].victoryPoints[0].value === 5, JSON.stringify(states[0].victoryPoints));
check("buildings count not mistaken for a province", !states[0].provinces.includes(3), JSON.stringify(states[0].provinces));

// ── merged model with mod overriding vanilla by state id ──
const tmpGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamap-game-"));
const tmpMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamap-mod-"));
try {
  fs.mkdirSync(path.join(tmpGame, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(tmpGame, "map"), { recursive: true });
  fs.writeFileSync(path.join(tmpGame, "map", "definition.csv"), defText, "utf8");
  fs.writeFileSync(path.join(tmpGame, "history", "states", "1-vanilla.txt"),
    `state = { id = 42 name = "STATE_42" provinces = { 114 115 } history = { owner = TUR } }`, "utf8");

  fs.mkdirSync(path.join(tmpMod, "history", "states"), { recursive: true });
  // Mod overrides state 42's owner to GRE — by shipping the game's file under its own name, which replaces it. A file of another
  // name loads beside the game's, and HOI4 keeps the first block by file name (#the-state-the-game-keeps): "GRE_states.txt" sorts
  // after "1-vanilla.txt", so the game's TUR would be the state that loads.
  fs.writeFileSync(path.join(tmpMod, "history", "states", "1-vanilla.txt"),
    `state = { id = 42 name = "STATE_42" provinces = { 114 115 } history = { owner = GRE } }`, "utf8");

  const model = md.buildMapModel({ modRoot: tmpMod, gameRoot: tmpGame });
  check("model loads provinces from game definition", model.provinces.length === 3, String(model.provinces.length));
  check("mod state overrides vanilla owner (TUR -> GRE)", model.states.find(s => s.id === 42).owner === "GRE", JSON.stringify(model.states.find(s => s.id === 42)));
  check("provinceToState maps province -> state", model.provinceToState[114] === 42, JSON.stringify(model.provinceToState));
  check("provinceOwner colours province by owner", model.provinceOwner[114] === "GRE" && model.provinceOwner[115] === "GRE", JSON.stringify(model.provinceOwner));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmpGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmpMod, { recursive: true, force: true }); } catch (_) {}
}

// ── writeStateOwner ──
// setOwnerInStateBlock: replace / insert / create-history.
check("setOwner replaces existing owner", /owner\s*=\s*GRE/.test(md.setOwnerInStateBlock(`state = { id = 1 history = { owner = TUR } }`, "GRE")) && !/owner\s*=\s*TUR/.test(md.setOwnerInStateBlock(`state = { id = 1 history = { owner = TUR } }`, "GRE")), "");
check("setOwner inserts owner into history with none", /owner\s*=\s*GRE/.test(md.setOwnerInStateBlock(`state = { id = 1 history = { add_core_of = GRE } }`, "GRE")), "");
check("setOwner creates history when absent", /history\s*=\s*\{[\s\S]*owner\s*=\s*GRE/.test(md.setOwnerInStateBlock(`state = { id = 1 provinces = { 1 2 } }`, "GRE")), "");

const wGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapw-game-"));
const wMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapw-mod-"));
try {
  fs.mkdirSync(path.join(wGame, "history", "states"), { recursive: true });
  // A vanilla file with TWO states; we'll override one's owner and expect the whole file copied.
  fs.writeFileSync(path.join(wGame, "history", "states", "10-Region.txt"),
    `state = { id = 10 name = "S10" provinces = { 1 2 } history = { owner = TUR add_core_of = TUR } }\n` +
    `state = { id = 11 name = "S11" provinces = { 3 } history = { owner = TUR } }\n`, "utf8");
  fs.mkdirSync(path.join(wMod, "history", "states"), { recursive: true });
  // A mod file that already defines state 20.
  fs.writeFileSync(path.join(wMod, "history", "states", "mod_states.txt"),
    `state = { id = 20 name = "S20" provinces = { 9 } history = { owner = ITA } }\n`, "utf8");

  // 1. State already in the mod → edited in place.
  const r1 = md.writeStateOwner({ modRoot: wMod, gameRoot: wGame, stateId: 20, newOwner: "GRE" });
  check("edits a mod state's owner in place", r1.changed && r1.location === "mod" && !r1.created, JSON.stringify(r1));
  check("mod state file now owns GRE", /owner\s*=\s*GRE/.test(fs.readFileSync(path.join(wMod, "history", "states", "mod_states.txt"), "utf8")), "");

  // 2. Vanilla-only state → vanilla file copied to mod (same name), target owner changed, sibling kept.
  const r2 = md.writeStateOwner({ modRoot: wMod, gameRoot: wGame, stateId: 10, newOwner: "GRE" });
  check("overrides a vanilla state by copying its file into the mod", r2.changed && r2.created && r2.location === "vanilla-override" && r2.file === "10-Region.txt", JSON.stringify(r2));
  const overTxt = fs.readFileSync(path.join(wMod, "history", "states", "10-Region.txt"), "utf8");
  check("override sets state 10 to GRE and KEEPS sibling state 11 verbatim", /id\s*=\s*10[\s\S]*owner\s*=\s*GRE/.test(overTxt) && /id\s*=\s*11[\s\S]*owner\s*=\s*TUR/.test(overTxt), overTxt);
  check("override did NOT touch the game directory", /owner\s*=\s*TUR/.test(fs.readFileSync(path.join(wGame, "history", "states", "10-Region.txt"), "utf8")), "");

  // 3. Refuses to write into the game directory.
  const r3 = md.writeStateOwner({ modRoot: wGame, gameRoot: wGame, stateId: 10, newOwner: "GRE" });
  check("refuses to write to the game directory", !r3.changed && /game directory/i.test(r3.error || ""), JSON.stringify(r3));

  // 4. Unknown state → no change, error.
  const r4 = md.writeStateOwner({ modRoot: wMod, gameRoot: wGame, stateId: 9999, newOwner: "GRE" });
  check("unknown state id returns an error, writes nothing", !r4.changed && !!r4.error, JSON.stringify(r4));
} catch (e) {
  fail++; console.log("  FAIL writer-harness →", e.message);
} finally {
  try { fs.rmSync(wGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(wMod, { recursive: true, force: true }); } catch (_) {}
}

// ── setStateFieldsInBlock (editable state panel) ──
const fblock = `state = {
\tid = 50
\tname = "STATE_50"
\tmanpower = 1000
\tstate_category = rural
\thistory = {
\t\towner = TUR
\t\tadd_core_of = TUR
\t\tvictory_points = { 200 5 }
\t}
\tprovinces = { 200 201 }
}`;
const edited = md.setStateFieldsInBlock(fblock, { owner: "GRE", cores: ["GRE", "BUL"], manpower: 250000, category: "town" });
check("field edit sets owner", /owner\s*=\s*GRE/.test(edited) && !/owner\s*=\s*TUR/.test(edited), edited);
check("field edit replaces cores with new set", /add_core_of\s*=\s*GRE/.test(edited) && /add_core_of\s*=\s*BUL/.test(edited) && !/add_core_of\s*=\s*TUR/.test(edited), edited);
check("field edit updates state-level manpower", /manpower\s*=\s*250000/.test(edited) && !/manpower\s*=\s*1000/.test(edited), edited);
check("field edit updates state_category", /state_category\s*=\s*town/.test(edited), edited);
check("field edit keeps victory_points + provinces verbatim", /victory_points\s*=\s*\{\s*200 5\s*\}/.test(edited) && /provinces\s*=\s*\{\s*200 201\s*\}/.test(edited), edited);
// inserts when absent
const bare = `state = { id = 51 provinces = { 9 } }`;
const e2 = md.setStateFieldsInBlock(bare, { owner: "GRE", manpower: 5000, category: "town", cores: ["GRE"] });
check("field edit inserts owner+cores via a created history block", /history\s*=\s*\{[\s\S]*owner\s*=\s*GRE[\s\S]*add_core_of\s*=\s*GRE/.test(e2), e2);
check("field edit inserts manpower + category when absent", /manpower\s*=\s*5000/.test(e2) && /state_category\s*=\s*town/.test(e2), e2);
// clearing cores
const e3 = md.setStateFieldsInBlock(fblock, { cores: [] });
check("empty cores array removes all add_core_of", !/add_core_of/.test(e3), e3);
// partial edit leaves untouched fields alone
const e4 = md.setStateFieldsInBlock(fblock, { manpower: 7 });
check("partial edit leaves owner untouched", /owner\s*=\s*TUR/.test(e4) && /manpower\s*=\s*7/.test(e4), e4);

// writeStateFields end-to-end (vanilla override path)
const fGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapf-game-"));
const fMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapf-mod-"));
try {
  fs.mkdirSync(path.join(fGame, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(fGame, "history", "states", "60.txt"),
    `state = { id = 60 name = "S60" manpower = 100 state_category = rural provinces = { 1 } history = { owner = TUR } }`, "utf8");
  fs.mkdirSync(path.join(fMod, "history", "states"), { recursive: true });
  const rf = md.writeStateFields({ modRoot: fMod, gameRoot: fGame, stateId: 60, fields: { owner: "GRE", cores: ["GRE"], manpower: 9000, category: "town" } });
  check("writeStateFields overrides a vanilla state into the mod", rf.changed && rf.created, JSON.stringify(rf));
  const outF = fs.readFileSync(path.join(fMod, "history", "states", "60.txt"), "utf8");
  check("writeStateFields wrote owner+cores+manpower+category", /owner\s*=\s*GRE/.test(outF) && /add_core_of\s*=\s*GRE/.test(outF) && /manpower\s*=\s*9000/.test(outF) && /state_category\s*=\s*town/.test(outF), outF);
} catch (e) {
  fail++; console.log("  FAIL fields-harness →", e.message);
} finally {
  try { fs.rmSync(fGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(fMod, { recursive: true, force: true }); } catch (_) {}
}

// ── parseCountryColors ──
const colText = `#comment
GER = {
\tcolor = rgb { 60 70 80 }
\tcolor_ui = rgb { 1 2 3 }
}
GRE = {
\tcolor = hsv { 0.0 1.0 1.0 }
}
SOV = {
\tcolor = { 200 10 10 }
}`;
const cols = md.parseCountryColors(colText);
check("parses rgb color (uses color, not color_ui)", JSON.stringify(cols.GER) === JSON.stringify([60, 70, 80]), JSON.stringify(cols.GER));
check("parses hsv color → red", cols.GRE && cols.GRE[0] === 255 && cols.GRE[1] === 0 && cols.GRE[2] === 0, JSON.stringify(cols.GRE));
check("parses bare rgb braces", JSON.stringify(cols.SOV) === JSON.stringify([200, 10, 10]), JSON.stringify(cols.SOV));

const cGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapc-game-"));
const cMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapc-mod-"));
try {
  fs.mkdirSync(path.join(cGame, "common", "countries"), { recursive: true });
  fs.writeFileSync(path.join(cGame, "common", "countries", "colors.txt"), `GRE = { color = rgb { 10 10 10 } }\nUSA = { color = rgb { 0 0 200 } }`, "utf8");
  fs.mkdirSync(path.join(cMod, "common", "countries"), { recursive: true });
  fs.writeFileSync(path.join(cMod, "common", "countries", "colors.txt"), `GRE = { color = rgb { 0 150 0 } }`, "utf8"); // mod overrides GRE
  const model = md.buildMapModel({ modRoot: cMod, gameRoot: cGame });
  check("model includes countryColors", !!model.countryColors && JSON.stringify(model.countryColors.USA) === JSON.stringify([0, 0, 200]), JSON.stringify(model.countryColors));
  check("mod colors.txt overrides vanilla per tag", JSON.stringify(model.countryColors.GRE) === JSON.stringify([0, 150, 0]), JSON.stringify(model.countryColors.GRE));
} catch (e) {
  fail++; console.log("  FAIL colors-harness →", e.message);
} finally {
  try { fs.rmSync(cGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(cMod, { recursive: true, force: true }); } catch (_) {}
}

// ── victory points: parse-all + set ──
const multiVp = `state = {
\tid = 70
\thistory = {
\t\towner = GRE
\t\tvictory_points = { 100 5 }
\t\tvictory_points = { 101 20 }
\t}
\tprovinces = { 100 101 }
}`;
const vpStates = md.parseStatesText(multiVp);
check("parses MULTIPLE victory_points blocks", vpStates[0].victoryPoints.length === 2 && vpStates[0].victoryPoints[1].province === 101 && vpStates[0].victoryPoints[1].value === 20, JSON.stringify(vpStates[0].victoryPoints));
const vpEdited = md.setStateFieldsInBlock(multiVp, { victoryPoints: [{ province: 100, value: 50 }, { province: 999, value: 0 }] });
check("setStateFields replaces VPs, drops value<=0", /victory_points\s*=\s*\{\s*100 50\s*\}/.test(vpEdited) && !/101 20/.test(vpEdited) && !/999/.test(vpEdited), vpEdited);
check("clearing VPs ([]) removes all victory_points", !/victory_points/.test(md.setStateFieldsInBlock(multiVp, { victoryPoints: [] })), "");
check("VP edit preserves owner", /owner\s*=\s*GRE/.test(vpEdited), vpEdited);

// ── move provinces between states ──
check("removeProvinceFromBlock drops the id, keeps siblings", /provinces\s*=\s*\{\s*5 7\s*\}/.test(md.removeProvinceFromBlock(`state = { id=1 provinces = { 5 6 7 } }`, 6)), md.removeProvinceFromBlock(`state = { id=1 provinces = { 5 6 7 } }`, 6));
check("removeProvinceFromBlock leaves a non-substring match alone", /provinces\s*=\s*\{\s*1 100 101\s*\}/.test(md.removeProvinceFromBlock(`state = { provinces = { 1 10 100 101 } }`, 10)), "");
check("addProvinceToBlock appends a new id", /provinces\s*=\s*\{\s*5 6 9\s*\}/.test(md.addProvinceToBlock(`state = { provinces = { 5 6 } }`, 9)), "");
check("addProvinceToBlock is a no-op if already present", (md.addProvinceToBlock(`state = { provinces = { 5 6 } }`, 6).match(/6/g) || []).length === 1, "");

const mGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapm-game-"));
const mMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapm-mod-"));
try {
  fs.mkdirSync(path.join(mMod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mMod, "history", "states", "states.txt"),
    `state = { id = 1 provinces = { 10 11 12 } history = { owner = GRE } }\n` +
    `state = { id = 2 provinces = { 20 21 } history = { owner = TUR } }\n`, "utf8");
  const mv = md.moveProvince({ modRoot: mMod, gameRoot: mGame, provinceId: 11, fromStateId: 1, toStateId: 2 });
  check("moveProvince reports changed", mv.changed, JSON.stringify(mv));
  const out = fs.readFileSync(path.join(mMod, "history", "states", "states.txt"), "utf8");
  check("province removed from source state 1", /id = 1[\s\S]*provinces\s*=\s*\{\s*10 12\s*\}/.test(out), out);
  check("province added to target state 2", /id = 2[\s\S]*provinces\s*=\s*\{\s*20 21 11\s*\}/.test(out), out);
  const same = md.moveProvince({ modRoot: mMod, gameRoot: mGame, provinceId: 12, fromStateId: 1, toStateId: 1 });
  check("moveProvince rejects same source/target", !same.changed && /same/i.test(same.error || ""), JSON.stringify(same));
} catch (e) {
  fail++; console.log("  FAIL move-harness →", e.message);
} finally {
  try { fs.rmSync(mGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(mMod, { recursive: true, force: true }); } catch (_) {}
}

// ── validateMapModel ──
const vModel = {
  states: [
    { id: 1, name: "A", provinces: [10, 11], owner: "GRE" },
    { id: 2, name: "B", provinces: [11, 12], owner: "TUR" }, // 11 overlaps state 1
    { id: 3, name: "C", provinces: [], owner: "BUL" },        // empty
    { id: 4, name: "D", provinces: [20], owner: "USA" },      // clean
  ],
};
const vProblems = md.validateMapModel(vModel);
check("flags province in two states", vProblems.some((p) => p.rule === "province_in_two_states" && p.province === 11), JSON.stringify(vProblems));
check("flags empty state", vProblems.some((p) => p.rule === "empty_state" && p.stateId === 3), JSON.stringify(vProblems));
check("does NOT flag clean states", !vProblems.some((p) => p.stateId === 4 || p.stateId === 1 && p.rule === "empty_state"), JSON.stringify(vProblems));
check("clean model → no problems", md.validateMapModel({ states: [{ id: 1, name: "X", provinces: [1, 2], owner: "GRE" }] }).length === 0, "");

// ── state buildings: parse + write ──
const bState = `state = {
\tid = 80
\thistory = {
\t\towner = GRE
\t\tbuildings = {
\t\t\tinfrastructure = 3
\t\t\tarms_factory = 2
\t\t\t1234 = { naval_base = 4 }
\t\t}
\t}
\tprovinces = { 1234 }
}`;
const bParsed = md.parseStatesText(bState)[0];
check("parses state-level buildings", bParsed.buildings.infrastructure === 3 && bParsed.buildings.arms_factory === 2, JSON.stringify(bParsed.buildings));
check("ignores nested province building blocks (naval_base)", bParsed.buildings.naval_base === undefined, JSON.stringify(bParsed.buildings));
const bEdited = md.setStateFieldsInBlock(bState, { buildings: { infrastructure: 5, industrial_complex: 4, arms_factory: 0 } });
check("buildings: updates existing level", /infrastructure\s*=\s*5/.test(bEdited) && !/infrastructure\s*=\s*3/.test(bEdited), bEdited);
check("buildings: inserts a new building", /industrial_complex\s*=\s*4/.test(bEdited), bEdited);
check("buildings: level 0 removes the building", !/arms_factory/.test(bEdited), bEdited);
check("buildings: keeps nested province naval_base verbatim", /1234\s*=\s*\{\s*naval_base = 4\s*\}/.test(bEdited), bEdited);
check("buildings: preserves owner", /owner\s*=\s*GRE/.test(bEdited), bEdited);
// creates buildings block when absent
const bNone = `state = { id = 81 history = { owner = GRE } provinces = { 9 } }`;
const bCreated = md.setStateFieldsInBlock(bNone, { buildings: { infrastructure: 2 } });
check("buildings: creates the buildings block when absent", /buildings\s*=\s*\{[\s\S]*infrastructure\s*=\s*2/.test(bCreated), bCreated);

// ── create + delete state ──
const csGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapcs-game-"));
const csMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapcs-mod-"));
try {
  fs.mkdirSync(path.join(csGame, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(csGame, "history", "states", "v.txt"),
    `state = { id = 5 provinces = { 1 } history = { owner = TUR } }\nstate = { id = 9 provinces = { 2 } }`, "utf8");
  fs.mkdirSync(path.join(csMod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(csMod, "history", "states", "m.txt"), `state = { id = 12 provinces = { 3 } }`, "utf8");

  check("nextFreeStateId = max(all)+1", md.nextFreeStateId({ modRoot: csMod, gameRoot: csGame }) === 13, String(md.nextFreeStateId({ modRoot: csMod, gameRoot: csGame })));
  const cr = md.createState({ modRoot: csMod, gameRoot: csGame, name: "New Land", owner: "GRE" });
  check("createState returns a fresh id (13)", cr.ok && cr.id === 13, JSON.stringify(cr));
  const newTxt = fs.readFileSync(path.join(csMod, "history", "states", cr.file), "utf8");
  check("createState writes a valid state block with owner+core", /id\s*=\s*13/.test(newTxt) && /owner\s*=\s*GRE/.test(newTxt) && /add_core_of\s*=\s*GRE/.test(newTxt), newTxt);
  check("createState refuses the game dir", !md.createState({ modRoot: csGame, gameRoot: csGame, name: "x" }).ok, "");

  // delete the mod state 12 (its file had only that state → file removed)
  const del = md.deleteState({ modRoot: csMod, gameRoot: csGame, stateId: 12 });
  check("deleteState removes a mod state", del.changed, JSON.stringify(del));
  check("deleteState removed the now-empty file", !fs.existsSync(path.join(csMod, "history", "states", "m.txt")), "");
  // refuse to delete a vanilla-only state
  const delV = md.deleteState({ modRoot: csMod, gameRoot: csGame, stateId: 5 });
  check("deleteState refuses a vanilla-only state", !delV.changed && /mod/i.test(delV.error || ""), JSON.stringify(delV));
} catch (e) {
  fail++; console.log("  FAIL create/delete-harness →", e.message);
} finally {
  try { fs.rmSync(csGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(csMod, { recursive: true, force: true }); } catch (_) {}
}

// ── provinces.bmp codec + paint diff ──
// Build a 3x2 24-bit BMP, round-trip it, then paint a pixel via the diff path.
const bmp = md.writeBmp24({ width: 3, height: 2, rgb: new Uint8Array([
  255, 0, 0,  255, 0, 0,  0, 0, 255,   // row y=0 (top): red, red, blue (red ×2 so painting one red pixel doesn't erase the province)
  10, 20, 30, 40, 50, 60, 70, 80, 90,  // row y=1
]) });
check("writeBmp24 produces a 'BM' header + 24bpp", bmp[0] === 0x42 && bmp[1] === 0x4d && bmp.readUInt16LE(28) === 24, "");
const decoded = md.readBmp24(bmp);
check("readBmp24 round-trips dimensions", decoded.width === 3 && decoded.height === 2, JSON.stringify([decoded.width, decoded.height]));
check("readBmp24 round-trips top-left pixel (red)", decoded.rgb[0] === 255 && decoded.rgb[1] === 0 && decoded.rgb[2] === 0, JSON.stringify([decoded.rgb[0], decoded.rgb[1], decoded.rgb[2]]));
check("readBmp24 round-trips a mid pixel", decoded.rgb[(1 * 3 + 0) * 3] === 10 && decoded.rgb[(1 * 3 + 0) * 3 + 1] === 20 && decoded.rgb[(1 * 3 + 0) * 3 + 2] === 30, "");

const pGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapp-game-"));
const pMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapp-mod-"));
try {
  fs.mkdirSync(path.join(pGame, "map"), { recursive: true });
  fs.writeFileSync(path.join(pGame, "map", "provinces.bmp"), bmp);
  // paint top-left pixel (0,0) to a new colour; mod has no bmp → copied from vanilla
  const r = md.applyProvinceDiff({ modRoot: pMod, gameRoot: pGame, diff: [{ x: 0, y: 0, r: 1, g: 2, b: 3 }] });
  check("applyProvinceDiff writes the mod bmp from vanilla", r.ok && r.applied === 1 && r.fromVanilla, JSON.stringify(r));
  const re = md.readBmp24(fs.readFileSync(path.join(pMod, "map", "provinces.bmp")));
  check("painted pixel persisted to mod bmp", re.rgb[0] === 1 && re.rgb[1] === 2 && re.rgb[2] === 3, JSON.stringify([re.rgb[0], re.rgb[1], re.rgb[2]]));
  check("unpainted pixel unchanged", re.rgb[3] === 255 && re.rgb[4] === 0 && re.rgb[5] === 0, "");
  check("applyProvinceDiff refuses the game dir", !md.applyProvinceDiff({ modRoot: pGame, gameRoot: pGame, diff: [{ x: 0, y: 0, r: 1, g: 1, b: 1 }] }).ok, "");
} catch (e) {
  fail++; console.log("  FAIL paint-harness →", e.message);
} finally {
  try { fs.rmSync(pGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(pMod, { recursive: true, force: true }); } catch (_) {}
}

// ── province-level buildings (naval base) ──
const pbState = `state = {
\tid = 90
\thistory = {
\t\towner = GRE
\t\tbuildings = {
\t\t\tinfrastructure = 3
\t\t\t1500 = { naval_base = 2 }
\t\t}
\t}
\tprovinces = { 1500 1501 }
}`;
const pbParsed = md.parseStatesText(pbState)[0];
check("parses province buildings (naval_base on 1500)", pbParsed.provinceBuildings[1500] && pbParsed.provinceBuildings[1500].naval_base === 2, JSON.stringify(pbParsed.provinceBuildings));
check("state-level buildings still parsed alongside province ones", pbParsed.buildings.infrastructure === 3, JSON.stringify(pbParsed.buildings));
// update existing province building
const pbUp = md.setStateFieldsInBlock(pbState, { provinceBuildings: [{ province: 1500, building: "naval_base", level: 5 }] });
check("province building: updates existing level", /1500\s*=\s*\{\s*naval_base = 5\s*\}/.test(pbUp), pbUp);
// add a new province building
const pbAdd = md.setStateFieldsInBlock(pbState, { provinceBuildings: [{ province: 1501, building: "naval_base", level: 3 }] });
check("province building: adds a new province block", /1501\s*=\s*\{\s*naval_base = 3\s*\}/.test(pbAdd), pbAdd);
check("province building: keeps state-level infrastructure", /infrastructure\s*=\s*3/.test(pbAdd), pbAdd);
// remove via level 0
const pbDel = md.setStateFieldsInBlock(pbState, { provinceBuildings: [{ province: 1500, building: "naval_base", level: 0 }] });
check("province building: level 0 removes it", !/naval_base/.test(pbDel), pbDel);

// ── strategic regions: parse + model + move ──
const srText = `strategic_region = { id = 1 name = "AEGEAN" provinces = { 100 101 102 } }
strategic_region = { id = 2 name = "BALKANS" provinces = { 200 } }`;
const srParsed = md.parseStrategicRegions(srText);
check("parses strategic regions", srParsed.length === 2 && srParsed[0].id === 1 && srParsed[0].provinces.length === 3, JSON.stringify(srParsed));

const srGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapsr-game-"));
const srMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapsr-mod-"));
try {
  fs.mkdirSync(path.join(srMod, "map", "strategicregions"), { recursive: true });
  fs.writeFileSync(path.join(srMod, "map", "strategicregions", "r.txt"), srText, "utf8");
  fs.mkdirSync(path.join(srGame, "map"), { recursive: true });
  const model = md.buildMapModel({ modRoot: srMod, gameRoot: srGame });
  check("model includes strategicRegions + provinceToRegion", model.strategicRegions.length === 2 && model.provinceToRegion[100] === 1 && model.provinceToRegion[200] === 2, JSON.stringify(model.provinceToRegion));
  const mv = md.moveProvinceToRegion({ modRoot: srMod, gameRoot: srGame, provinceId: 100, fromRegionId: 1, toRegionId: 2 });
  check("moveProvinceToRegion reports changed", mv.changed, JSON.stringify(mv));
  const out = fs.readFileSync(path.join(srMod, "map", "strategicregions", "r.txt"), "utf8");
  check("province removed from source region 1", /id = 1[\s\S]*provinces\s*=\s*\{\s*101 102\s*\}/.test(out), out);
  check("province added to target region 2", /id = 2[\s\S]*provinces\s*=\s*\{\s*200 100\s*\}/.test(out), out);
  check("moveProvinceToRegion rejects same region", !md.moveProvinceToRegion({ modRoot: srMod, gameRoot: srGame, provinceId: 101, fromRegionId: 1, toRegionId: 1 }).changed, "");
} catch (e) {
  fail++; console.log("  FAIL strat-region-harness →", e.message);
} finally {
  try { fs.rmSync(srGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(srMod, { recursive: true, force: true }); } catch (_) {}
}

// ── state resources ──
const resState = `state = {
\tid = 95
\tresources = { oil = 4 steel = 10 }
\thistory = { owner = GRE }
\tprovinces = { 1 }
}`;
const resParsed = md.parseStatesText(resState)[0];
check("parses state resources", resParsed.resources.oil === 4 && resParsed.resources.steel === 10, JSON.stringify(resParsed.resources));
const resEdited = md.setStateFieldsInBlock(resState, { resources: { oil: 12, aluminium: 6, steel: 0 } });
check("resources: updates existing (oil)", /oil\s*=\s*12/.test(resEdited), resEdited);
check("resources: adds new (aluminium)", /aluminium\s*=\s*6/.test(resEdited), resEdited);
check("resources: 0 removes (steel)", !/steel/.test(resEdited), resEdited);
check("resources: preserves owner", /owner\s*=\s*GRE/.test(resEdited), resEdited);
const resCreated = md.setStateFieldsInBlock(`state = { id = 96 history = { owner = GRE } provinces = { 2 } }`, { resources: { oil: 3 } });
check("resources: creates the block when absent", /resources\s*=\s*\{[\s\S]*oil\s*=\s*3/.test(resCreated), resCreated);

// ── supply areas: parse + model + move a state ──
const saText = `supply_area = { id = 1 name = "AREA1" value = 5 states = { 10 11 } }
supply_area = { id = 2 name = "AREA2" value = 3 states = { 20 } }`;
const saParsed = md.parseSupplyAreas(saText);
check("parses supply areas (states list)", saParsed.length === 2 && JSON.stringify(saParsed[0].states) === JSON.stringify([10, 11]), JSON.stringify(saParsed));
const saGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapsa-game-"));
const saMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapsa-mod-"));
try {
  fs.mkdirSync(path.join(saMod, "map", "supplyareas"), { recursive: true });
  fs.writeFileSync(path.join(saMod, "map", "supplyareas", "a.txt"), saText, "utf8");
  fs.mkdirSync(path.join(saGame, "map"), { recursive: true });
  const model = md.buildMapModel({ modRoot: saMod, gameRoot: saGame });
  check("model includes supplyAreas + stateToSupplyArea", model.supplyAreas.length === 2 && model.stateToSupplyArea[10] === 1 && model.stateToSupplyArea[20] === 2, JSON.stringify(model.stateToSupplyArea));
  const mv = md.moveStateToSupplyArea({ modRoot: saMod, gameRoot: saGame, stateId: 10, fromAreaId: 1, toAreaId: 2 });
  check("moveStateToSupplyArea changed", mv.changed, JSON.stringify(mv));
  const out = fs.readFileSync(path.join(saMod, "map", "supplyareas", "a.txt"), "utf8");
  check("state removed from source area 1", /id = 1[\s\S]*states\s*=\s*\{\s*11\s*\}/.test(out), out);
  check("state added to target area 2", /id = 2[\s\S]*states\s*=\s*\{\s*20 10\s*\}/.test(out), out);
} catch (e) {
  fail++; console.log("  FAIL supply-area-harness →", e.message);
} finally {
  try { fs.rmSync(saGame, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(saMod, { recursive: true, force: true }); } catch (_) {}
}

// ── dependency-aware model + writers (e.g. an add-on for Millennium Dawn) ──
const depGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapdep-game-"));
const depDep = fs.mkdtempSync(path.join(os.tmpdir(), "novamapdep-dep-"));
const depMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapdep-mod-"));
try {
  // Game ships state 50 (owner VAN) + definition with 1 province. Its file is named to sort after the dependency's md_states.txt:
  // HOI4 keeps the first block for an id across every layer's files sorted by name (#the-state-the-game-keeps), so the dependency's
  // state 50 is the one that loads — a game file that sorted first ("50.txt" does) would keep VAN's.
  fs.mkdirSync(path.join(depGame, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(depGame, "history", "states", "state_50.txt"),
    `state = { id = 50 name = "STATE_50" provinces = { 1 } history = { owner = VAN add_core_of = VAN } }`, "utf8");
  fs.mkdirSync(path.join(depGame, "map"), { recursive: true });
  fs.writeFileSync(path.join(depGame, "map", "definition.csv"), "0;0;0;0;land;false;unknown;0\r\n1;10;10;10;land;false;plains;0\r\n", "utf8");
  // Dependency (MD) OVERRIDES state 50 (owner MD) and ADDS state 51; ships its own definition.
  fs.mkdirSync(path.join(depDep, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(depDep, "history", "states", "md_states.txt"),
    `state = { id = 50 name = "STATE_50" provinces = { 1 } history = { owner = MD add_core_of = MD } }\nstate = { id = 51 name = "STATE_51" provinces = { 2 } history = { owner = MD } }`, "utf8");
  fs.mkdirSync(path.join(depDep, "map"), { recursive: true });
  fs.writeFileSync(path.join(depDep, "map", "definition.csv"), "0;0;0;0;land;false;unknown;0\r\n1;10;10;10;land;false;plains;0\r\n2;20;20;20;land;false;hills;0\r\n", "utf8");

  md.clearMapLayerCache();
  const dm = md.buildMapModel({ modRoot: depMod, gameRoot: depGame, dependencyRoots: [depDep] });
  const s50 = dm.states.find((s) => s.id === 50);
  check("dependency overrides game state (owner MD, not VAN)", s50 && s50.owner === "MD", JSON.stringify(s50));
  check("dependency-only state appears in model", dm.states.some((s) => s.id === 51), JSON.stringify(dm.states.map((s) => s.id)));
  check("dependency definition wins over game (province 2 present)", dm.provinces.some((p) => p.id === 2), JSON.stringify(dm.provinces.map((p) => p.id)));
  check("nextFreeStateId counts dependency states (→ 52)", md.nextFreeStateId({ modRoot: depMod, gameRoot: depGame, dependencyRoots: [depDep] }) === 52);

  // Editing a dependency-only state copies MD's file into the mod (dependency-override), not vanilla.
  const ed = md.writeStateOwner({ modRoot: depMod, gameRoot: depGame, dependencyRoots: [depDep], stateId: 51, newOwner: "GRE" });
  check("edit of dep-only state is a dependency-override", ed.changed && ed.location === "dependency-override" && ed.file === "md_states.txt", JSON.stringify(ed));
  const wrote = fs.readFileSync(path.join(depMod, "history", "states", "md_states.txt"), "utf8");
  check("override file written into the mod with the edit", /id = 51/.test(wrote) && /owner = GRE/.test(wrote), wrote);

  // Cache: with caching on, a later game-file change isn't seen until the cache is cleared.
  md.clearMapLayerCache();
  md.buildMapModel({ modRoot: depMod, gameRoot: depGame, dependencyRoots: [depDep], cacheStableLayers: true });
  fs.writeFileSync(path.join(depGame, "history", "states", "52.txt"), `state = { id = 52 name = "X" provinces = { 9 } }`, "utf8");
  const cached = md.buildMapModel({ modRoot: depMod, gameRoot: depGame, dependencyRoots: [depDep], cacheStableLayers: true });
  check("stable-layer cache hides new game state until cleared", !cached.states.some((s) => s.id === 52));
  md.clearMapLayerCache();
  const fresh = md.buildMapModel({ modRoot: depMod, gameRoot: depGame, dependencyRoots: [depDep], cacheStableLayers: true });
  check("clearMapLayerCache picks up the new game state", fresh.states.some((s) => s.id === 52));
} catch (e) {
  fail++; console.log("  FAIL dependency-aware-harness →", e.message);
} finally {
  for (const d of [depGame, depDep, depMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  md.clearMapLayerCache();
}

// ── province terrain: parse categories, edit a csv row, write a mod override ──
const terrText = `categories = {
  plains = { color = { 1 1 1 } movement_cost = 1.0 }
  forest = { color = { 2 2 2 } combat_width = 2 sound_type = forest }
  mountain = { color = { 3 3 3 } }
}
# a province-terrain mapping block (must NOT be picked up as a category)
1234 = { type = forest }`;
const cats = md.parseTerrainCategories(terrText);
check("parses terrain categories (direct children only)", JSON.stringify(cats) === JSON.stringify(["plains", "forest", "mountain"]), JSON.stringify(cats));

const csv = "0;0;0;0;land;false;unknown;0\r\n114;40;15;15;land;false;plains;1\r\n7;212;179;179;sea;true;ocean;0\r\n";
const e1 = md.editDefinitionCsv(csv, 114, { terrain: "mountain", coastal: true });
check("editDefinitionCsv changes terrain + coastal of the right row", e1.changed && /114;40;15;15;land;true;mountain;1/.test(e1.text), e1.line);
check("editDefinitionCsv preserves the other rows + CRLF", e1.text.includes("7;212;179;179;sea;true;ocean;0") && e1.text.includes("\r\n"), JSON.stringify(e1.text));
check("editDefinitionCsv id-anchored (1 ≠ 114)", md.editDefinitionCsv(csv, 1, { terrain: "x" }).changed === false);
check("editDefinitionCsv no-op when unchanged", md.editDefinitionCsv(csv, 114, { terrain: "plains" }).changed === false);

const terrGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamapterr-game-"));
const terrMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamapterr-mod-"));
try {
  fs.mkdirSync(path.join(terrGame, "map"), { recursive: true });
  fs.writeFileSync(path.join(terrGame, "map", "definition.csv"), csv, "utf8");
  fs.mkdirSync(path.join(terrGame, "common", "terrain"), { recursive: true });
  fs.writeFileSync(path.join(terrGame, "common", "terrain", "00_terrain.txt"), terrText, "utf8");
  md.clearMapLayerCache();
  const tm = md.buildMapModel({ modRoot: terrMod, gameRoot: terrGame });
  check("model exposes terrainTypes", Array.isArray(tm.terrainTypes) && tm.terrainTypes.includes("forest"), JSON.stringify(tm.terrainTypes));
  const sp = md.setProvinceDefinition({ modRoot: terrMod, gameRoot: terrGame, provinceId: 114, terrain: "forest", coastal: true });
  check("setProvinceDefinition writes a mod definition.csv override", sp.changed && sp.wroteFullCsv, JSON.stringify(sp));
  const wrote = fs.readFileSync(path.join(terrMod, "map", "definition.csv"), "utf8");
  check("mod override has the edited row + the untouched rows", /114;40;15;15;land;true;forest;1/.test(wrote) && wrote.includes("7;212;179;179;sea;true;ocean;0"), wrote);
  // Second edit now sources the mod's own csv (already an override).
  const sp2 = md.setProvinceDefinition({ modRoot: terrMod, gameRoot: terrGame, provinceId: 7, type: "lake", coastal: false });
  check("setProvinceDefinition edits the existing mod csv in place", sp2.changed, JSON.stringify(sp2));
  check("setProvinceDefinition rejects writing to the game dir", md.setProvinceDefinition({ modRoot: terrGame, gameRoot: terrGame, provinceId: 114, terrain: "plains" }).changed === false);
} catch (e) {
  fail++; console.log("  FAIL terrain-harness →", e.message);
} finally {
  for (const d of [terrGame, terrMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  md.clearMapLayerCache();
}

// ── paint-shape safety: refuse a paint that erases a province to 0 pixels (would break the map) ──
const pgGame = fs.mkdtempSync(path.join(os.tmpdir(), "novapaint-game-"));
const pgMod = fs.mkdtempSync(path.join(os.tmpdir(), "novapaint-mod-"));
try {
  fs.mkdirSync(path.join(pgMod, "map"), { recursive: true });
  // 4×1 image: province A (10,20,30) ×2, province B (40,50,60) ×2.
  const rgb = new Uint8Array([10, 20, 30, 10, 20, 30, 40, 50, 60, 40, 50, 60]);
  fs.writeFileSync(path.join(pgMod, "map", "provinces.bmp"), md.writeBmp24({ width: 4, height: 1, rgb }));
  // Paint BOTH of B's pixels with A → B would have 0 pixels → must be refused, nothing written.
  const wipeRes = md.applyProvinceDiff({ modRoot: pgMod, gameRoot: pgGame, diff: [{ x: 2, y: 0, r: 10, g: 20, b: 30 }, { x: 3, y: 0, r: 10, g: 20, b: 30 }] });
  check("paint-shape AUTO-FIXES erasing a province to 0 px (reseeds, doesn't refuse)", wipeRes.ok === true && (wipeRes.warnings || []).some((w) => /Auto-fixed|fully covered/i.test(w)), JSON.stringify(wipeRes));
  const stillOriginal = md.readBmp24(fs.readFileSync(path.join(pgMod, "map", "provinces.bmp")));
  check("the reseed kept province B alive (B pixels restored, not 0)", stillOriginal.rgb[6] === 40 && stillOriginal.rgb[9] === 40, JSON.stringify(Array.from(stillOriginal.rgb)));
  // Paint only ONE of B's pixels → B still has a pixel → allowed.
  const safeRes = md.applyProvinceDiff({ modRoot: pgMod, gameRoot: pgGame, diff: [{ x: 2, y: 0, r: 10, g: 20, b: 30 }] });
  check("paint-shape allows a shrink that leaves pixels", safeRes.ok === true && safeRes.applied === 1, JSON.stringify(safeRes));
} catch (e) {
  fail++; console.log("  FAIL paint-safety-harness →", e.message);
} finally {
  for (const d of [pgGame, pgMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

// ── moveProvince carries the province's victory point + buildings (the Gaza→map-break bug) ──
const mvGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamove-game-"));
const mvMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamove-mod-"));
try {
  fs.mkdirSync(path.join(mvMod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mvMod, "history", "states", "a.txt"),
    'state = { id = 1 name = "S1" provinces = { 10 11 } history = { owner = AAA victory_points = { 11 5 } buildings = { 11 = { naval_base = 2 } } } }\n' +
    'state = { id = 2 name = "S2" provinces = { 20 } history = { owner = BBB } }', "utf8");
  fs.mkdirSync(path.join(mvGame, "history", "states"), { recursive: true });
  const mv = md.moveProvince({ modRoot: mvMod, gameRoot: mvGame, provinceId: 11, fromStateId: 1, toStateId: 2 });
  check("moveProvince changed", mv.changed, JSON.stringify(mv));
  const movedStates = md.parseStatesText(fs.readFileSync(path.join(mvMod, "history", "states", "a.txt"), "utf8"));
  const s1 = movedStates.find((s) => s.id === 1), s2 = movedStates.find((s) => s.id === 2);
  check("move strips province from source", !s1.provinces.includes(11) && s1.provinces.includes(10), JSON.stringify(s1.provinces));
  check("move adds province to target", s2.provinces.includes(11), JSON.stringify(s2.provinces));
  check("move takes the VP off the source (no stranded VP → no map break)", !(s1.victoryPoints || []).some((v) => v.province === 11), JSON.stringify(s1.victoryPoints));
  check("move carries the VP to the target", (s2.victoryPoints || []).some((v) => v.province === 11 && v.value === 5), JSON.stringify(s2.victoryPoints));
  check("move takes the province building off the source", !(s1.provinceBuildings && s1.provinceBuildings[11]), JSON.stringify(s1.provinceBuildings));
  check("move carries the province building to the target", !!(s2.provinceBuildings && s2.provinceBuildings[11] && s2.provinceBuildings[11].naval_base === 2), JSON.stringify(s2.provinceBuildings));
} catch (e) {
  fail++; console.log("  FAIL move-vp-harness →", e.message);
} finally {
  for (const d of [mvGame, mvMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

// validateMapModel flags a victory point on a province the state doesn't own. HOI4 tolerates this
// (logs it, VP won't show, but still loads — vanilla ships a few), so it's a WARNING, not a crash.
const vpProbs = md.validateMapModel({ states: [{ id: 5, name: "X", provinces: [1, 2], victoryPoints: [{ province: 99, value: 3 }] }] });
check("validate flags VP-not-in-state as a warning (not a load-crash)", vpProbs.some((p) => p.rule === "vp_not_in_state" && p.province === 99 && p.severity === "warning"), JSON.stringify(vpProbs));
const vpOk = md.validateMapModel({ states: [{ id: 5, name: "X", provinces: [1, 2], victoryPoints: [{ province: 2, value: 3 }] }] });
check("validate accepts a VP on an owned province", !vpOk.some((p) => p.rule === "vp_not_in_state"), JSON.stringify(vpOk));

// An emptied state that still has buildings/VP is a GAME-START CRASH (moving a state's last province) →
// must be an ERROR. A truly blank empty state is ALSO fatal: HOI4 crashes with "no provinces in state … id N"
// (state.cpp) before the menu, so it is now an ERROR too (it was wrongly a warning, which let a stress test
// pass with "0 errors" yet crash in-game).
const emptyBuilt = md.validateMapModel({ states: [{ id: 209, name: "Gaza", provinces: [], buildings: { industrial_complex: 1 }, victoryPoints: [] }] });
check("validate flags emptied-but-built state as an ERROR", emptyBuilt.some((p) => p.rule === "empty_state_with_content" && p.severity === "error"), JSON.stringify(emptyBuilt));
check("emptied-but-built state is NOT a mere warning", !emptyBuilt.some((p) => p.rule === "empty_state"), JSON.stringify(emptyBuilt));
const emptyVp = md.validateMapModel({ states: [{ id: 9, name: "Z", provinces: [], buildings: {}, victoryPoints: [{ province: 13207, value: 5 }] }] });
check("validate flags emptied state with a stranded VP as an ERROR", emptyVp.some((p) => p.rule === "empty_state_with_content" && p.severity === "error"), JSON.stringify(emptyVp));
const emptyBlank = md.validateMapModel({ states: [{ id: 8, name: "Blank", provinces: [], buildings: { infrastructure: 0 }, victoryPoints: [] }] });
check("truly blank empty state is an ERROR (HOI4 crashes on it)", emptyBlank.some((p) => p.rule === "empty_state" && p.severity === "error"), JSON.stringify(emptyBlank));

// An empty state that is a country's CAPITAL is a crash even with NO buildings (the Gaza/HAM case:
// Hamas's capital was state 209, its only land — emptying it left a landless puppet → crash).
const emptyCap = md.validateMapModel({ states: [{ id: 209, name: "Gaza", provinces: [], buildings: {}, victoryPoints: [] }], capitals: { HAM: 209, GRE: 999 } });
check("validate flags an empty CAPITAL state as an ERROR (even with no buildings)", emptyCap.some((p) => p.rule === "empty_capital_state" && p.severity === "error" && (p.tags || []).includes("HAM")), JSON.stringify(emptyCap));
// ⚠️ MOVED WITH THE FIX — #a-generated-world-nobody-rules. This fixture is "HAM's capital, with land", and it
// used to give that state no owner at all, which is now a finding of its own: a world in which NOT ONE state
// declares an owner has no countries on it (the shape that filled the owner's error.log with 166,849 lines).
// HAM owning the state it capitals is what the check was always about, so the fixture says so now.
const okCap = md.validateMapModel({ states: [{ id: 209, name: "Gaza", owner: "HAM", provinces: [13207], buildings: {}, victoryPoints: [] }], capitals: { HAM: 209 } });
check("a capital state WITH land is fine", !okCap.some((p) => p.severity === "error" && p.rule !== "state_id_gap"), JSON.stringify(okCap));

// Deleting a capital state entirely → capital points at a state that no longer exists.
// ⭐ STATE 210 IS HAM'S. capital_state_missing gates Save only for a country that OWNS LAND (2026-09-23,
// #a-refused-capital-is-what-two-shipping-maps-already-do); the fixture used to leave state 210 ownerless, so
// HAM owned nothing and the row that came back was capital_state_missing_no_land. JOR's capital 210 still
// exists either way, which is what the second check below is for.
const missingCap = md.validateMapModel({ states: [{ id: 210, name: "Amman", owner: "HAM", provinces: [7151], buildings: {}, victoryPoints: [] }], capitals: { HAM: 209, JOR: 210 } });
// #a-renumbered-worlds-missing-capitals-are-one-problem — the rule now reports ONE row for the class carrying
// every missing capital in `items`, the way state_owns_no_land and non_land_province_in_state report; it used
// to push a row per state id, and these two checks read `p.stateId` off that row.
check("validate flags a capital pointing at a deleted/missing state", missingCap.some((p) => p.rule === "capital_state_missing" && (p.items || []).some((i) => i.stateId === 209 && (i.tags || []).includes("HAM")) && p.severity === "error"), JSON.stringify(missingCap));
check("present capital state is NOT flagged as missing", !missingCap.some((p) => p.rule === "capital_state_missing" && (p.items || []).some((i) => i.stateId === 210)), JSON.stringify(missingCap));

// ── moveProvince is overlap-proof: it clears the province from EVERY state that has it ──
// (the crash cause: the UI's fromStateId drifted, so a province ended up in two states).
const ovGame = fs.mkdtempSync(path.join(os.tmpdir(), "novaov-game-"));
const ovMod = fs.mkdtempSync(path.join(os.tmpdir(), "novaov-mod-"));
try {
  fs.mkdirSync(path.join(ovMod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(ovMod, "history", "states", "a.txt"),
    'state = { id = 1 name = "A" provinces = { 10 11 } history = { owner = AAA } }\n' +
    'state = { id = 2 name = "B" provinces = { 11 20 } history = { owner = BBB } }\n' + // 11 ALSO here (overlap)
    'state = { id = 3 name = "C" provinces = { 30 } history = { owner = CCC } }', "utf8");
  fs.mkdirSync(path.join(ovGame, "history", "states"), { recursive: true });
  // Move 11 → state 3, passing only fromStateId=1. The scan must ALSO find & clear state 2.
  const mv = md.moveProvince({ modRoot: ovMod, gameRoot: ovGame, provinceId: 11, fromStateId: 1, toStateId: 3 });
  check("moveProvince scans every state holding the province", mv.changed && mv.sources.includes(1) && mv.sources.includes(2), JSON.stringify(mv.sources));
  const stx = md.parseStatesText(fs.readFileSync(path.join(ovMod, "history", "states", "a.txt"), "utf8"));
  const A = stx.find((s) => s.id === 1), B = stx.find((s) => s.id === 2), C = stx.find((s) => s.id === 3);
  check("cleared from the named source (1)", !A.provinces.includes(11), JSON.stringify(A.provinces));
  check("cleared from the UNNAMED source (2) — no more province-in-two-states", !B.provinces.includes(11), JSON.stringify(B.provinces));
  check("present in exactly the target (3)", C.provinces.includes(11), JSON.stringify(C.provinces));
} catch (e) {
  fail++; console.log("  FAIL move-overlap-harness →", e.message);
} finally {
  for (const d of [ovGame, ovMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

// ── findStateFileConflicts: catch duplicate state id / province across files (the MD-206 crash) ──
// The merged model keys states by id, so a 2nd file with a duplicate id silently overwrites and hides
// the conflict — exactly what let MD ship two id-206 files and fail "errors in the map definition".
const fcMod = fs.mkdtempSync(path.join(os.tmpdir(), "novafc-mod-"));
try {
  fs.mkdirSync(path.join(fcMod, "history", "states"), { recursive: true });
  // Clean mod first → no conflicts.
  fs.writeFileSync(path.join(fcMod, "history", "states", "ok.txt"),
    'state = { id = 1 name = "A" provinces = { 10 11 } }\nstate = { id = 2 name = "B" provinces = { 20 } }', "utf8");
  check("findStateFileConflicts: clean mod has none", md.findStateFileConflicts(fcMod).length === 0, JSON.stringify(md.findStateFileConflicts(fcMod)));

  // Now add a 2nd file that re-declares id 1 (vanilla "206-Minsk.txt" copied beside MD's own 206).
  fs.writeFileSync(path.join(fcMod, "history", "states", "dupe.txt"),
    'state = { id = 1 name = "A-vanilla" provinces = { 99 } }', "utf8");
  const conf = md.findStateFileConflicts(fcMod);
  const dupId = conf.find((p) => p.rule === "duplicate_state_id" && p.stateId === 1);
  check("findStateFileConflicts: flags duplicate state id across files", !!dupId && dupId.severity === "error", JSON.stringify(conf));
  check("duplicate_state_id names both files", dupId && dupId.files.includes("ok.txt") && dupId.files.includes("dupe.txt"), JSON.stringify(dupId && dupId.files));
  // The message must NOT cry wolf: HOI4 resolves duplicate state ids first-wins (loads past them — clean,
  // launchable MD ships such <id>-restored.txt stubs), so it must not claim the map "will fail to load".
  check("duplicate_state_id message is accurate (no false 'fail to load' crash claim)",
    dupId && !/fail to load/i.test(dupId.message) && /first file/i.test(dupId.message), JSON.stringify(dupId && dupId.message));

  // Province double-claim across files.
  fs.writeFileSync(path.join(fcMod, "history", "states", "dupe.txt"),
    'state = { id = 7 name = "C" provinces = { 10 } }', "utf8"); // 10 also in ok.txt's state 1
  const conf2 = md.findStateFileConflicts(fcMod);
  check("findStateFileConflicts: flags province in two files", conf2.some((p) => p.rule === "province_in_two_states_files" && p.province === 10 && p.severity === "error"), JSON.stringify(conf2));
} catch (e) {
  fail++; console.log("  FAIL findStateFileConflicts-harness →", e.message);
} finally {
  try { fs.rmSync(fcMod, { recursive: true, force: true }); } catch (_) {}
}

// ── editStateBlock guard: never create a 2nd file for an id the mod already defines under another name ──
const gGame = fs.mkdtempSync(path.join(os.tmpdir(), "novag-game-"));
const gMod = fs.mkdtempSync(path.join(os.tmpdir(), "novag-mod-"));
try {
  fs.mkdirSync(path.join(gGame, "history", "states"), { recursive: true });
  // Vanilla defines state 206 in "206-Minsk.txt".
  fs.writeFileSync(path.join(gGame, "history", "states", "206-Minsk.txt"),
    'state = { id = 206 name = "STATE_206" provinces = { 216 294 } history = { owner = SOV } }', "utf8");
  fs.mkdirSync(path.join(gMod, "history", "states"), { recursive: true });
  // Mod ALSO defines 206 under a DIFFERENT name that sorts FIRST, so its block is the one HOI4 keeps (#the-state-the-game-keeps) and
  // the edit belongs in it. (A name sorting after "206-Minsk.txt" loses its block to the game's: that case is pinned in
  // test-the-map-shows-and-edits-the-state-hoi4-keeps-when-two-files-declare-its-id.js, where the edit lands in a copy of the game's file.)
  fs.writeFileSync(path.join(gMod, "history", "states", "206-Israel.txt"),
    'state = { id = 206 name = "STATE_206" provinces = { 1015 } history = { owner = ISR } }', "utf8");
  const g = md.writeStateOwner({ modRoot: gMod, gameRoot: gGame, stateId: 206, newOwner: "PAL" });
  check("editStateBlock edits the mod's existing 206 in place (no vanilla copy)", g.changed && g.location === "mod" && !g.created, JSON.stringify(g));
  check("editStateBlock did NOT create a second id-206 file (no 206-Minsk.txt copy)", !fs.existsSync(path.join(gMod, "history", "states", "206-Minsk.txt")), "");
  check("after edit the mod still has exactly one file declaring state 206", md.findStateFileConflicts(gMod).filter((p) => p.rule === "duplicate_state_id").length === 0, JSON.stringify(md.findStateFileConflicts(gMod)));
} catch (e) {
  fail++; console.log("  FAIL editStateBlock-guard-harness →", e.message);
} finally {
  for (const d of [gGame, gMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

// ── replace_path honoring: a mod that replaces history/states hides vanilla's states entirely ──
// (MD does exactly this; without honoring it the model leaks phantom vanilla states and the writers
// would materialise a vanilla state that doesn't exist in-game.)
const rpGame = fs.mkdtempSync(path.join(os.tmpdir(), "novarp-game-"));
const rpDep  = fs.mkdtempSync(path.join(os.tmpdir(), "novarp-dep-"));
const rpMod  = fs.mkdtempSync(path.join(os.tmpdir(), "novarp-mod-"));
try {
  md.clearMapLayerCache();
  fs.mkdirSync(path.join(rpGame, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(rpGame, "history", "states", "100.txt"), 'state = { id = 100 name = "V100" provinces = { 1 2 } history = { owner = VVV } }', "utf8");
  fs.writeFileSync(path.join(rpGame, "history", "states", "200.txt"), 'state = { id = 200 name = "V200" provinces = { 9 } history = { owner = VVV } }', "utf8");
  // Dependency (MD-like) replaces history/states and redefines ONLY state 100 (different provinces).
  fs.mkdirSync(path.join(rpDep, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(rpDep, "descriptor.mod"), 'name="DepMod"\nreplace_path = "history/states"\n', "utf8");
  fs.writeFileSync(path.join(rpDep, "history", "states", "100.txt"), 'state = { id = 100 name = "D100" provinces = { 3 4 } history = { owner = DDD } }', "utf8");
  fs.mkdirSync(path.join(rpMod, "history", "states"), { recursive: true });

  const m = md.buildMapModel({ modRoot: rpMod, gameRoot: rpGame, dependencyRoots: [rpDep] });
  const s100 = m.states.find((s) => s.id === 100);
  check("replace_path: state 100 comes from the dep, not vanilla", s100 && JSON.stringify(s100.provinces) === JSON.stringify([3, 4]), JSON.stringify(s100));
  check("replace_path: vanilla-only state 200 is NOT leaked into the model", !m.states.some((s) => s.id === 200), JSON.stringify(m.states.map((s) => s.id)));
  check("replace_path: no false province-in-two-states from leaked vanilla", !md.validateMapModel(m).some((p) => p.rule === "province_in_two_states"), JSON.stringify(md.validateMapModel(m)));

  // Writer: editing vanilla-only state 200 in the add-on must NOT materialise it (vanilla is replaced).
  const w = md.writeStateOwner({ modRoot: rpMod, gameRoot: rpGame, dependencyRoots: [rpDep], stateId: 200, newOwner: "GRE" });
  check("replace_path: writer refuses to copy a replaced vanilla state into the mod", !w.changed && /not found/i.test(w.error || ""), JSON.stringify(w));
  check("replace_path: no stray 200.txt written to the mod", !fs.existsSync(path.join(rpMod, "history", "states", "200.txt")), "");

  // Control: WITHOUT replace_path, vanilla state 200 is visible and editable.
  md.clearMapLayerCache();
  fs.writeFileSync(path.join(rpDep, "descriptor.mod"), 'name="DepMod"\n', "utf8"); // remove replace_path
  const m2 = md.buildMapModel({ modRoot: rpMod, gameRoot: rpGame, dependencyRoots: [rpDep] });
  check("control: without replace_path, vanilla state 200 IS visible", m2.states.some((s) => s.id === 200), JSON.stringify(m2.states.map((s) => s.id)));
} catch (e) {
  fail++; console.log("  FAIL replace_path-harness →", e.message);
} finally {
  md.clearMapLayerCache();
  for (const d of [rpGame, rpDep, rpMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

// ── mergeState: move ALL of a state's provinces into a neighbour, then delete it (safe one-click) ──
const mgGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamg-game-"));
const mgMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamg-mod-"));
try {
  md.clearMapLayerCache();
  fs.mkdirSync(path.join(mgGame, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(mgMod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mgMod, "history", "states", "s.txt"),
    'state = { id = 1 name = "Src" provinces = { 10 11 } history = { owner = AAA victory_points = { 11 5 } buildings = { 11 = { naval_base = 2 } } } }\n' +
    'state = { id = 2 name = "Dst" provinces = { 20 } history = { owner = AAA } }', "utf8");
  const mg = md.mergeState({ modRoot: mgMod, gameRoot: mgGame, sourceStateId: 1, targetStateId: 2 });
  check("mergeState reports changed + moved provinces", mg.changed && mg.movedProvinces.includes(10) && mg.movedProvinces.includes(11), JSON.stringify(mg));
  const after = md.buildMapModel({ modRoot: mgMod, gameRoot: mgGame });
  const s1 = after.states.find((s) => s.id === 1), s2 = after.states.find((s) => s.id === 2);
  check("mergeState deletes the source state", !s1, JSON.stringify(after.states.map((s) => s.id)));
  check("mergeState moves all provinces to target", s2 && [10, 11, 20].every((p) => s2.provinces.includes(p)), JSON.stringify(s2 && s2.provinces));
  check("mergeState carries the VP", s2 && (s2.victoryPoints || []).some((v) => v.province === 11 && v.value === 5), JSON.stringify(s2 && s2.victoryPoints));
  check("mergeState carries the province building", s2 && s2.provinceBuildings && s2.provinceBuildings[11] && s2.provinceBuildings[11].naval_base === 2, JSON.stringify(s2 && s2.provinceBuildings));
  check("merged map validates clean (no empty/orphan/overlap)", md.validateMapModel(after).filter((p) => p.severity === "error" && p.rule !== "state_id_gap").length === 0, JSON.stringify(md.validateMapModel(after)));
} catch (e) { fail++; console.log("  FAIL mergeState-harness →", e.message); }
finally { md.clearMapLayerCache(); for (const d of [mgGame, mgMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

// mergeState refuses to merge away a capital state (would dangle the capital → crash).
const mgcGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamgc-game-"));
const mgcMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamgc-mod-"));
try {
  md.clearMapLayerCache();
  fs.mkdirSync(path.join(mgcGame, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(mgcMod, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(mgcMod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mgcMod, "history", "states", "s.txt"),
    'state = { id = 1 name = "Cap" provinces = { 10 } history = { owner = ABC } }\nstate = { id = 2 name = "D" provinces = { 20 } history = { owner = ABC } }', "utf8");
  fs.writeFileSync(path.join(mgcMod, "history", "countries", "ABC - Test.txt"), "capital = 1\n", "utf8");
  const mgc = md.mergeState({ modRoot: mgcMod, gameRoot: mgcGame, sourceStateId: 1, targetStateId: 2 });
  check("mergeState refuses to merge away a capital state", !mgc.changed && /capital/i.test(mgc.error || ""), JSON.stringify(mgc));
  check("refused capital merge left the source intact", md.buildMapModel({ modRoot: mgcMod, gameRoot: mgcGame }).states.some((s) => s.id === 1 && s.provinces.includes(10)), "");
} catch (e) { fail++; console.log("  FAIL mergeState-capital-harness →", e.message); }
finally { md.clearMapLayerCache(); for (const d of [mgcGame, mgcMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

// mergeState refuses when deleting the source would resurface a base-game state (non-replace_path mod).
const mgbGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamgb-game-"));
const mgbMod = fs.mkdtempSync(path.join(os.tmpdir(), "novamgb-mod-"));
try {
  md.clearMapLayerCache();
  fs.mkdirSync(path.join(mgbGame, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(mgbMod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mgbGame, "history", "states", "v.txt"), 'state = { id = 5 name = "V5" provinces = { 50 } history = { owner = VVV } }', "utf8");
  fs.writeFileSync(path.join(mgbMod, "history", "states", "m.txt"),
    'state = { id = 5 name = "V5" provinces = { 50 } history = { owner = MMM } }\nstate = { id = 6 name = "M6" provinces = { 60 } history = { owner = MMM } }', "utf8");
  const mgb = md.mergeState({ modRoot: mgbMod, gameRoot: mgbGame, sourceStateId: 5, targetStateId: 6 });
  check("mergeState refuses to merge a base-defined state (non-replace mod) — would reappear", !mgb.changed && /reappear|base game/i.test(mgb.error || ""), JSON.stringify(mgb));
} catch (e) { fail++; console.log("  FAIL mergeState-base-harness →", e.message); }
finally { md.clearMapLayerCache(); for (const d of [mgbGame, mgbMod]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

// ── fixDuplicateStateFiles: auto-remove the stray duplicate (the MD 206-Minsk case), conservatively ──
const fxMod = fs.mkdtempSync(path.join(os.tmpdir(), "novafx-mod-"));
try {
  fs.mkdirSync(path.join(fxMod, "history", "states"), { recursive: true });
  // Legit state 206 (its own provinces) + the OTHER states that really own the stray's provinces.
  fs.writeFileSync(path.join(fxMod, "history", "states", "206-Negev.txt"), 'state = { id = 206 name = "Negev" provinces = { 1015 4088 } history = { owner = ISR } }', "utf8");
  fs.writeFileSync(path.join(fxMod, "history", "states", "703-Minsk.txt"), 'state = { id = 703 name = "Minsk" provinces = { 216 294 } history = { owner = BLR } }', "utf8");
  fs.writeFileSync(path.join(fxMod, "history", "states", "43-Bayern.txt"), 'state = { id = 43 name = "Bayern" provinces = { 342 } history = { owner = GER } }', "utf8");
  // Stray duplicate id 206 whose provinces (216,294,342) are ALL owned by other states above.
  fs.writeFileSync(path.join(fxMod, "history", "states", "206-Minsk.txt"), 'state = { id = 206 name = "STATE_206" provinces = { 216 294 342 } history = { owner = SOV } }', "utf8");
  check("before fix: duplicate id 206 detected", md.findStateFileConflicts(fxMod).some((p) => p.rule === "duplicate_state_id" && p.stateId === 206), "");
  const fx = md.fixDuplicateStateFiles({ modRoot: fxMod });
  check("fix removes the stray 206-Minsk.txt", fx.removed.some((r) => r.id === 206 && r.file === "206-Minsk.txt"), JSON.stringify(fx));
  check("fix kept the legit 206 file", fs.existsSync(path.join(fxMod, "history", "states", "206-Negev.txt")) && !fs.existsSync(path.join(fxMod, "history", "states", "206-Minsk.txt")), "");
  check("after fix: no duplicate-state-id conflicts remain", !md.findStateFileConflicts(fxMod).some((p) => p.rule === "duplicate_state_id"), JSON.stringify(md.findStateFileConflicts(fxMod)));
  check("after fix: Negev still owns its real provinces", md.buildMapModel({ modRoot: fxMod, gameRoot: fxMod }).states.find((s) => s.id === 206).provinces.includes(1015), "");
} catch (e) { fail++; console.log("  FAIL fixDuplicate-harness →", e.message); }
finally { try { fs.rmSync(fxMod, { recursive: true, force: true }); } catch (_) {} }

// fixDuplicateStateFiles is conservative: when BOTH dup files own unique provinces, it won't guess.
const fx2 = fs.mkdtempSync(path.join(os.tmpdir(), "novafx2-mod-"));
try {
  fs.mkdirSync(path.join(fx2, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(fx2, "history", "states", "a.txt"), 'state = { id = 9 name = "A" provinces = { 100 } history = {} }', "utf8");
  fs.writeFileSync(path.join(fx2, "history", "states", "b.txt"), 'state = { id = 9 name = "B" provinces = { 200 } history = {} }', "utf8"); // both own UNIQUE provinces
  const r = md.fixDuplicateStateFiles({ modRoot: fx2 });
  check("fix leaves an ambiguous duplicate untouched (both own unique land)", r.removed.length === 0 && r.unresolved.some((u) => u.id === 9), JSON.stringify(r));
  check("ambiguous dup: both files still present", fs.existsSync(path.join(fx2, "history", "states", "a.txt")) && fs.existsSync(path.join(fx2, "history", "states", "b.txt")), "");
} catch (e) { fail++; console.log("  FAIL fixDuplicate-conservative-harness →", e.message); }
finally { try { fs.rmSync(fx2, { recursive: true, force: true }); } catch (_) {} }

// ── fixDuplicateStateFiles edge cases: multi-state file (only the dup block removed), 3-way dup ──
const fx3 = fs.mkdtempSync(path.join(os.tmpdir(), "novafx3-mod-"));
try {
  fs.mkdirSync(path.join(fx3, "history", "states"), { recursive: true });
  // legit state 1 (its own province 11); a separate state 99 truly owns province 77.
  fs.writeFileSync(path.join(fx3, "history", "states", "real.txt"), 'state = { id = 1 name = "Keep1" provinces = { 11 } }', "utf8");
  fs.writeFileSync(path.join(fx3, "history", "states", "owner77.txt"), 'state = { id = 99 name = "Owner77" provinces = { 77 } }', "utf8");
  // a stray dup of id 1 (claims 77, owned by state 99) that ALSO defines a legit sibling state 50 —
  // only the dup block (id 1) must be removed; the sibling must survive.
  fs.writeFileSync(path.join(fx3, "history", "states", "mixed.txt"),
    'state = { id = 1 name = "StrayDup" provinces = { 77 } }\nstate = { id = 50 name = "Sibling" provinces = { 500 } }', "utf8");
  const r = md.fixDuplicateStateFiles({ modRoot: fx3 });
  check("fix removes the dup BLOCK from a multi-state file", r.removed.some((x) => x.id === 1 && x.file === "mixed.txt"), JSON.stringify(r));
  check("fix keeps the sibling state in that same file (file not deleted)", fs.existsSync(path.join(fx3, "history", "states", "mixed.txt")), "");
  const m = md.buildMapModel({ modRoot: fx3, gameRoot: fx3 });
  check("sibling state 50 survives the dup repair", m.states.some((s) => s.id === 50 && s.provinces.includes(500)), JSON.stringify(m.states.map((s) => s.id)));
  check("no duplicate-id conflicts remain after repair", !md.findStateFileConflicts(fx3).some((p) => p.rule === "duplicate_state_id"), JSON.stringify(md.findStateFileConflicts(fx3)));
} catch (e) { fail++; console.log("  FAIL fixDuplicate-multistate-harness →", e.message); }
finally { try { fs.rmSync(fx3, { recursive: true, force: true }); } catch (_) {} }

// ── mergeState rejects a target that doesn't exist ──
const mgx = fs.mkdtempSync(path.join(os.tmpdir(), "novamgx-mod-"));
const mgxGame = fs.mkdtempSync(path.join(os.tmpdir(), "novamgx-game-"));
try {
  fs.mkdirSync(path.join(mgx, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(mgxGame, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mgx, "history", "states", "s.txt"), 'state = { id = 1 name = "A" provinces = { 10 } history = {} }', "utf8");
  const r = md.mergeState({ modRoot: mgx, gameRoot: mgxGame, sourceStateId: 1, targetStateId: 999 });
  check("mergeState rejects a non-existent target", !r.changed && /target.*not found/i.test(r.error || ""), JSON.stringify(r));
  check("rejected merge left the source untouched", md.buildMapModel({ modRoot: mgx, gameRoot: mgxGame }).states.some((s) => s.id === 1 && s.provinces.includes(10)), "");
} catch (e) { fail++; console.log("  FAIL mergeState-badtarget-harness →", e.message); }
finally { for (const d of [mgx, mgxGame]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

// ── strategic-region split: a state whose provinces span >1 strategic region crashes on launch ──
const splitR = md.validateMapModel({ states: [{ id: 5, name: "X", provinces: [1, 2], victoryPoints: [] }], provinceToRegion: { 1: 10, 2: 20 } });
check("flags a state split across strategic regions (crash on launch)", splitR.some((p) => p.rule === "state_split_strategic_regions" && p.stateId === 5 && p.severity === "error"), JSON.stringify(splitR));
const sameR = md.validateMapModel({ states: [{ id: 5, name: "X", provinces: [1, 2], victoryPoints: [] }], provinceToRegion: { 1: 10, 2: 10 } });
check("a state whose provinces share one region is fine", !sameR.some((p) => p.rule === "state_split_strategic_regions"), JSON.stringify(sameR));
const noRegionInfo = md.validateMapModel({ states: [{ id: 5, name: "X", provinces: [1, 2], victoryPoints: [] }] });
check("no false split-region error when region data is absent", !noRegionInfo.some((p) => p.rule === "state_split_strategic_regions"), JSON.stringify(noRegionInfo));

console.log(`\nMAP-DATA TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
