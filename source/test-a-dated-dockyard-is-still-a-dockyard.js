// A dockyard dated 1939 is still a dockyard, and state_naval_building_without_coast cannot see it.
// #a-dated-dockyard-is-still-a-dockyard
//
// That rule is FATAL, and it reads the UNDATED buildings block only: removeStateBuildingFromHistory walks
// history -> buildings and matches at brace depth 0, so anything inside `1939.1.1 = { buildings = { … } }`
// is structurally out of reach. The consequence is worse than merely missing one, because Auto-fix repairs
// the undated block of the very same file and leaves the dated one sitting under it:
//
//     buildings = { infrastructure = 3   industrial_complex = 1   air_base = 6 }     <- repaired
//     1939.1.1 = { buildings = { dockyard = 5   industrial_complex = 2 } }           <- untouched
//
// That is Northern England, in five of the owner's mods. Its three provinces are 351, 11270 and 11299 —
// three of the exact ten that HOI4's own error.log named as having lost their coast when four ocean
// provinces became an island. A 1936 start is clean, which is why nobody saw it; a 1939 start hands the
// game five dockyards in a state with no water.
//
// ⚠️ A WARNING, AND DELIBERATELY NOT AUTO-REMOVED. Rise of Nations ships one:
//
//     361-Maryland.txt   1923.1.1 = { buildings = { 3957 = { naval_base = 1
//                                    # United States Naval Research Laboratory (NRL)
//                                    naval_facility = 1 } } }
//
// on a province with no sea beside it, and Rise of Nations launches. So the undated rule's reason for being
// fatal — "no shipping map has one" — does not carry over here, and neither does its reason for deleting:
// that is named, commented, deliberate content in a real mod. An Auto-fix that removed it would be the same
// overreach that once copied 43.6 MB of a dependency's map into an add-on. Nova reports what it found and
// where; the modder decides.
//
// Corpus, measured: vanilla 0 · Novum Vexillum 0 · Old World Blues 0 · Millennium Dawn 0 · Road to 56 0 ·
// Rise of Nations 1 · five mods Nova built 1 each.
//
// ⛔ #a-coast-taken-away-keeps-its-naval-buildings (review of the coast rows, CR-R3) — Auto-fix no longer repairs the undated block by
// deleting it: a state with no coast left gives its dockyards to the nearest coastal state of its country, EVERY moment, as a state
// paint of its last coast carries them (#a-moved-coast-takes-its-dockyards). So section 5 now holds that the dated dockyard goes WITH
// the undated one, summed with what that state holds at each moment, and that nothing is deleted; a state whose only dockyard is dated
// is not the fatal rule's and is still only warned about (sections 2–4), for the modder to decide.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dd-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; }
  }
  return buf;
}

// 8x4: top row 1|2|3|4, bottom row 5|6|7|8 (2px each). 1 and 2 are SEA.
// So 5 and 6 touch sea; 7's neighbours are 3, 6 and 8 — all land — so a state holding only 7 is landlocked.
const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
const provAt = (x, y) => (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[Math.floor(x / 2)];
const TYPES = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "land" };

function makeMod(stateBody) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dd-mod-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), 'name="DD"\nreplace_path="map"\nreplace_path="history/states"\n');
  mk(path.join(d, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(
    [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i};${i * 20};0;0;${TYPES[i]};false;${TYPES[i] === "sea" ? "ocean" : "plains"};${TYPES[i] === "sea" ? 0 : 1}`)
  ).join("\r\n") + "\r\n");
  mk(path.join(d, "history", "states", "70-Inland.txt"), stateBody);
  return d;
}
const fire = (d) => md.validateMapBitmap({ modRoot: d, gameRoot: GAME, dependencyRoots: [] })
  .filter((p) => p.rule === "dated_naval_building_without_coast");

// province 7 only -> landlocked;  province 5 -> coastal
const stateFile = (provinces, history) =>
  `state={\n\tid=70\n\tname="STATE_70"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory={\n\t\towner = ENG\n${history}\t}\n\tprovinces={\n\t\t${provinces.join(" ")}\n\t}\n}\n`;

try {
  console.log("1. 🈯 The corpus decides the severity");
  {
    const roots = [];
    if (fs.existsSync(path.join(GAME, "history", "states"))) roots.push(["vanilla", GAME]);
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const r = path.join(WS, id);
      if (fs.existsSync(path.join(r, "history", "states"))) roots.push([id, r]);
    }
    if (roots.length < 3) {
      rec("enough installed maps to judge severity", false, roots.length + " found — a skip reads as a pass, so this is a failure");
    } else {
      let withOne = 0, total = 0; const shippingScopes = [];
      for (const [, r] of roots) {
        total++;
        let hits = [];
        try { hits = md.findDatedNavalBuildingsWithoutCoast({ modRoot: r, gameRoot: GAME, dependencyRoots: [] }); } catch (_) { continue; }
        if (hits.length) { withOne++; for (const h of hits) shippingScopes.push(h.scope); }
      }
      rec("⭐⭐ at least one SHIPPING map carries one, so this cannot be fatal", withOne >= 1, withOne + " of " + total + " installed maps");
      // ⭐ …and it is a PROVINCE naval_base, not a state dockyard — which is why quoting the state line for every hit was
      // wrong about the only shipping map that has this problem at all. Derived from the corpus, never typed in.
      rec("⭐⭐⭐ …and every shipping instance is read with its own scope, not assumed to be a state building",
        shippingScopes.length > 0 && shippingScopes.every((s) => s === "state" || s === "province"), shippingScopes);
      rec("⭐⭐⭐ …and the rule is NOT in the fatal set", isFatalRule("dated_naval_building_without_coast") === false);
      // ⛔ #a-refused-dockyard-is-not-a-save-gate — moved 2026-11-19 (B1-31): the undated version left the fatal set too
      rec("…and neither is the undated version: HOI4 refuses both and plays on",
        isFatalRule("state_naval_building_without_coast") === false);
      rec("…and it is rare enough not to be noise", withOne <= Math.ceil(total / 2), withOne + "/" + total);
    }
  }

  console.log("\n2. ⛔ It fires on the shape Auto-fix leaves behind");
  {
    const mod = makeMod(stateFile([7],
      "\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n" +
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 5\n\t\t\t\tindustrial_complex = 2\n\t\t\t}\n\t\t}\n"));
    const f = fire(mod);
    rec("⭐⭐⭐ a dated dockyard in a landlocked state is reported", f.length === 1, f.length);
    rec("…as a WARNING", f.length === 1 && f[0].severity === "warning", f[0] && f[0].severity);
    rec("…naming the date and the building", f.length === 1 && /1939\.1\.1/.test(f[0].message) && /dockyard = 5/.test(f[0].message), f[0] && f[0].message.slice(0, 140));
    rec("…and saying a 1936 start looks fine, which is why it went unseen", f.length === 1 && /1936/.test(f[0].message));
    // #a-map-message-claims-only-what-the-engine-shows — statehistory.cpp writes a different line for each shape, and this
    // rule reports both: line 270 for a STATE building, line 306 for a PROVINCE one. It used to quote the state line for
    // every hit, which made it wrong about the only instance on a shipping map (section 4 below).
    rec("⭐⭐ …quoting the line HOI4 writes for a STATE building",
      f.length === 1 && /Trying to set invalid state building/.test(f[0].message)
      && !/Trying to set invalid province building/.test(f[0].message), f[0] && f[0].message.slice(-320));
    rec("⭐ …and telling a landlocked STATE to get a coastal province",
      f.length === 1 && /give the state a coastal province/.test(f[0].message));
    rec("…and it has a human label", mapRuleLabel("dated_naval_building_without_coast") !== "Dated naval building without coast",
      mapRuleLabel("dated_naval_building_without_coast"));

    // ⭐ THE POINT: the undated rule cannot see it, which is why this rule exists.
    const undated = md.fixNavalBuildingsWithoutCoast({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    rec("⭐⭐⭐ the FATAL rule finds nothing here — it cannot see inside a dated block",
      (undated.removed || 0) === 0, undated.removed);
  }

  console.log("\n3. ⚠️ ANTI-CRY-WOLF: the three ways it must stay quiet");
  {
    const coastal = makeMod(stateFile([5],
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 5\n\t\t\t}\n\t\t}\n"));
    rec("⭐ a dated dockyard in a state that HAS coast is fine", fire(coastal).length === 0, fire(coastal).map((p) => p.message.slice(0, 70)));

    const commented = makeMod(stateFile([7],
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t# dockyard = 5\n\t\t\t\tindustrial_complex = 2\n\t\t\t}\n\t\t}\n"));
    rec("⭐⭐ a dockyard inside a COMMENT is not a building", fire(commented).length === 0, fire(commented).map((p) => p.message.slice(0, 70)));

    const zero = makeMod(stateFile([7],
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 0\n\t\t\t}\n\t\t}\n"));
    rec("…and a level of 0 is not a building either", fire(zero).length === 0, fire(zero).map((p) => p.message.slice(0, 70)));

    const undatedOnly = makeMod(stateFile([7], "\t\tbuildings = {\n\t\t\tdockyard = 5\n\t\t}\n"));
    rec("⭐ an UNDATED dockyard is the other rule's job, not this one's", fire(undatedOnly).length === 0, fire(undatedOnly).length);
    const other = md.validateMapBitmap({ modRoot: undatedOnly, gameRoot: GAME, dependencyRoots: [] })
      .filter((p) => p.rule === "state_naval_building_without_coast");
    rec("…and that rule DOES catch it, so the two are complementary and neither is redundant", other.length === 1, other.length);
  }

  console.log("\n4. ⭐ A province-level naval building on a province with no sea");
  {
    const mod = makeMod(stateFile([7],
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t7 = {\n\t\t\t\t\tnaval_base = 2\n\t\t\t\t}\n\t\t\t}\n\t\t}\n"));
    const f = fire(mod);
    rec("a dated naval_base on a landlocked province is reported", f.length === 1, f.length);
    rec("…naming the province, not the state", f.length === 1 && /province 7/.test(f[0].message), f[0] && f[0].message.slice(0, 150));
    rec("⭐⭐⭐ …and quoting the line HOI4 writes for a PROVINCE building, not the state one",
      f.length === 1 && /Trying to set invalid province building/.test(f[0].message)
      && !/Trying to set invalid state building/.test(f[0].message), f[0] && f[0].message.slice(-320));
    rec("⭐⭐ …and telling the modder to give the PROVINCE a coast, which is what the game refused it for",
      f.length === 1 && /give the province a coast/.test(f[0].message)
      && !/give the state a coastal province/.test(f[0].message));

    // ⭐⭐⭐ THE HEADLINE IS ABOUT THE SHAPE IT FOUND. The province branch of the finder never asks whether the STATE has
    // water — only whether the province has sea beside it — so a state holding one coastal province (5) and one inland
    // one (7) reaches this rule while having plenty of water. It used to open "added on a later date to a state with no
    // water", which is false of exactly that row.
    const wet = makeMod(stateFile([5, 7],
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t7 = {\n\t\t\t\t\tnaval_base = 2\n\t\t\t\t}\n\t\t\t}\n\t\t}\n"));
    const w = fire(wet);
    rec("⭐⭐ a dated naval_base on the dry province of a state that HAS water is still reported", w.length === 1, w.length);
    rec("⭐⭐⭐ …and is NOT called a state with no water, because that state has water",
      w.length === 1 && !/to a state with no water/.test(w[0].message), w[0] && w[0].message.slice(0, 190));
    rec("⭐⭐ …it is called what it is: a province with no sea beside it",
      w.length === 1 && /to a province with no sea beside it/.test(w[0].message), w[0] && w[0].message.slice(0, 190));

    // …and the same row on a coastal province is not
    const ok = makeMod(stateFile([5, 7],
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t5 = {\n\t\t\t\t\tnaval_base = 2\n\t\t\t\t}\n\t\t\t}\n\t\t}\n"));
    rec("⚠️ …while one on a province that touches sea is left alone", fire(ok).length === 0, fire(ok).map((p) => p.message.slice(0, 70)));
  }

  console.log("\n5. ⛔ Auto-fix moves the undated dockyard to a coast of its country — and the dated one with it, deleting neither");
  {
    const mod = makeMod(stateFile([7],
      "\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\tdockyard = 4\n\t\t}\n" +
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 5\n\t\t\t}\n\t\t}\n"));
    // ⚠️ THE FIXTURE HAS TO PIN THE STATE LANDLOCKED, and the first version did not. With provinces
    // 3,4,5,6,8 belonging to nobody, autoFixMap's fixStatelessLand handed them to state 70 — including 5,
    // which touches sea — so the state GAINED a coast and this rule correctly went quiet. That is a better
    // repair than deleting the dockyard, and it is worth knowing Auto-fix can produce it. But it measures
    // fixStatelessLand, not this rule, so the other land is given to a second state first.
    //
    // ⚠️ MOVED 2026-09-15: AND IT HAS TO KEEP THE STATE IDS CONTIGUOUS. The mod declares replace_path="history/states", so ids 70
    // and 71 alone are a state-id gap (state_id_gap, which HOI4 refuses to load). Auto-fix could not close that gap in a mod
    // replacing history/states until #auto-fix-closes-a-state-id-gap-in-a-mod-that-replaces-history-states; now it renumbers 70
    // to 1 and renames the file this section reads, so the click measured a renumber as well. The two states are 1 and 2.
    fs.rmSync(path.join(mod, "history", "states", "70-Inland.txt"));
    const file = path.join(mod, "history", "states", "1-Inland.txt");
    mk(file, stateFile([7],
      "\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\tdockyard = 4\n\t\t}\n" +
      "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 5\n\t\t\t}\n\t\t}\n").replace(/id=70/, "id=1").replace(/STATE_70/, "STATE_1"));
    mk(path.join(mod, "history", "states", "2-Elsewhere.txt"),
      stateFile([3, 4, 5, 6, 8], "\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n").replace(/id=70/, "id=2").replace(/STATE_70/, "STATE_2"));
    const fx = md.autoFixMap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const after = fs.readFileSync(file, "utf8");
    const undatedPart = after.slice(0, after.indexOf("1939.1.1") === -1 ? after.length : after.indexOf("1939.1.1"));
    rec("⭐⭐⭐ the UNDATED dockyard has left the landlocked state — the fatal rule did its job", !/dockyard/.test(undatedPart), undatedPart.replace(/\s+/g, " ").slice(0, 120));
    // moved with #a-coast-taken-away-keeps-its-naval-buildings: this was "…and the DATED one is still there, untouched"
    const two = fs.readFileSync(path.join(mod, "history", "states", "2-Elsewhere.txt"), "utf8");
    const twoUndated = two.slice(0, two.indexOf("1939.1.1") === -1 ? two.length : two.indexOf("1939.1.1"));
    const c = (((fx.fixes || {}).navalNoCoast || {}).carried || [])[0] || {};
    rec("⭐⭐⭐ …it is state 2's, the coastal state of the same country, and so is the dated one: 4 from the start and 5 from 1939",
      /dockyard\s*=\s*4/.test(twoUndated) && /1939\.1\.1[\s\S]*dockyard\s*=\s*5/.test(two) && c.from === 1 && c.to === 2
      && JSON.stringify((c.levels || []).map((l) => `${l.date || "-"}:${l.level}`)) === JSON.stringify(["-:4", "1939.1.1:5"]), { two: two.replace(/\s+/g, " "), carried: c });
    rec("⭐⭐⭐ …so neither is left in state 1, and neither was deleted", !/dockyard/.test(after) && !(((fx.fixes || {}).navalNoCoast || {}).removed), after.replace(/\s+/g, " ").slice(-160));
    rec("⭐⭐ …and the warning goes quiet because the dated dockyard now has a coast, not because it was hidden", fire(mod).length === 0, fire(mod).map((p) => p.message.slice(0, 90)));
    rec("…which is the honest outcome: the modder is told what moved where, and nothing of theirs was deleted", true);
  }

  console.log(`\n=== a dated dockyard is still a dockyard: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
