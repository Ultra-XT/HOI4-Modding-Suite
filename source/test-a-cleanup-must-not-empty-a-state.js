// A repair that removes a state's LAST province manufactures the worst problem Nova has out of a lesser one.
// #a-cleanup-must-not-empty-a-state
//
// fixSeaProvinceLeftovers removes every sea province a state still references — the half-converted
// make-water class. When ALL of a state's provinces have become sea it removed all of them, and a state with
// content and no provinces is `empty_state_with_content`, which Nova's own curated fatal set says stops HOI4
// loading. `non_land_province_in_state` — the thing it was repairing — is an error but NOT fatal, and is
// reported once for the whole map.
//
// ⚠️ MEASURED ON THE WORKFLOW THE OWNER ASKED FOR. "Delete map" is step one of building a map from scratch;
// it turns all 10,154 land provinces into sea. On a mod shaped the way Nova's own wizard writes them the
// states survive that (deleting your copy of a base-game file just stops overriding it), still claiming
// provinces that are now water. One Auto-fix click on that map:
//
//     after Delete map     4 errors,   2 fatal
//     after ONE Auto-fix   405 errors, 404 FATAL   (245 empty_state_with_content, 156 empty_capital_state)
//
// …in 7.5 minutes, and it did not converge: a second click reshuffled the counts (245 -> 266) and stayed at
// 405. That is the "an Auto-fix announced it prevented a crash and then caused it" class again.
//
// ⭐ IT WAS NOT NEW. The identical 405/404 came out of the code as it stood before the session that found it
// (f0d232f), so this is long-standing. Worth stating, because the first question about a number that bad is
// whether you just broke it, and the honest way to answer is to run the same probe against the old code.
//
// The cascade needs two steps, which is why it grows between clicks: editStateBlock MATERIALISES a base-game
// state into the mod whenever a transform changes it, so some other fixer makes a vanilla state the mod's
// (adding manpower, removing a naval building), and only then does this one see it as fair game and strip
// every province. Returning the block UNCHANGED stops both halves — nothing is written, and no base state is
// materialised.
//
// ⚠️ THE GUARD IS DELIBERATELY NARROW. editStateBlock looks like the right choke point until you read its
// callers: fixProvinceInTwoStates legitimately empties a loser state before it is deleted, so a blanket
// refusal there would break state merges. This belongs in the one fixer whose transform demonstrably empties
// states as a side effect of cleaning them.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isFatalRule } = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ce-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");

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

const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
const provAt = (x, y) => (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[Math.floor(x / 2)];
const defCsv = (types) => ["0;0;0;0;land;false;unknown;0"].concat(
  [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i};${i * 20};0;0;${types[i]};false;${types[i] === "sea" ? "ocean" : "plains"};${types[i] === "sea" ? 0 : 1}`)
).join("\r\n") + "\r\n";

const stateFile = (id, provinces) =>
  `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n` +
  `\thistory={\n\t\towner = ENG\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n\t}\n` +
  `\tprovinces={\n\t\t${provinces.join(" ")}\n\t}\n}\n`;

// The mod OWNS both state files (so fixSeaProvinceLeftovers considers them its own) and owns a
// definition.csv in which provinces 6 and 7 have become sea.
function makeMod(types) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ce-mod-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), 'name="CE"\nreplace_path="map"\nreplace_path="history/states"\n');
  mk(path.join(d, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(d, "map", "definition.csv"), defCsv(types));
  mk(path.join(d, "history", "states", "70-AllGone.txt"), stateFile(70, [6, 7]));   // BOTH become sea
  mk(path.join(d, "history", "states", "71-Partly.txt"), stateFile(71, [3, 4, 6])); // only 6 becomes sea
  return d;
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const ALL_LAND = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "land" };
const SIX_SEVEN_SEA = Object.assign({}, ALL_LAND, { 6: "sea", 7: "sea" });

try {
  console.log("1. ⛔ A state whose every province became sea is LEFT ALONE");
  {
    const mod = makeMod(SIX_SEVEN_SEA);
    const f70 = path.join(mod, "history", "states", "70-AllGone.txt");
    const f71 = path.join(mod, "history", "states", "71-Partly.txt");
    const before70 = fs.readFileSync(f70, "utf8");

    const r = md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("the fixer ran", !r.error, r.error);
    rec("⭐⭐⭐ state 70 is reported as one it refused to empty", (r.wouldEmpty || []).includes(70), r.wouldEmpty);
    rec("⭐⭐⭐ …and its file is byte-identical — nothing was written", fs.readFileSync(f70, "utf8") === before70);
    rec("…so it still lists both provinces", /provinces\s*=\s*\{[^}]*\b6\b[^}]*\b7\b/.test(fs.readFileSync(f70, "utf8")),
      fs.readFileSync(f70, "utf8").replace(/\s+/g, " ").slice(0, 120));

    console.log("\n2. ⭐ THE CONTROL: a state that keeps at least one province IS still cleaned");
    const now71 = fs.readFileSync(f71, "utf8");
    rec("⭐⭐ province 6 was removed from state 71", !/provinces\s*=\s*\{[^}]*\b6\b/.test(now71), now71.replace(/\s+/g, " ").slice(0, 140));
    rec("…and its land provinces 3 and 4 are untouched", /provinces\s*=\s*\{[^}]*\b3\b[^}]*\b4\b/.test(now71));
    rec("…so the fixer is still doing its job, not switched off", (r.provincesRemoved || 0) >= 1, r.provincesRemoved);
    rec("⚠️ …and 71 is NOT in the refused list", !(r.wouldEmpty || []).includes(71), r.wouldEmpty);
  }

  console.log("\n3. ⭐⭐⭐ The trade this makes: one non-fatal report instead of a fatal one");
  {
    const mod = makeMod(SIX_SEVEN_SEA);
    md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const m = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
    const probs = md.validateMapModel(m);
    const empty = probs.filter((p) => /^empty_state/.test(p.rule));
    const nonLand = probs.filter((p) => p.rule === "non_land_province_in_state");
    rec("⭐⭐⭐ no empty-state problem was manufactured", empty.length === 0, empty.map((p) => p.rule + ": " + String(p.message).slice(0, 60)));
    rec("…the state still reports the lesser problem instead", nonLand.length >= 1, nonLand.length);
    rec("⭐⭐ …and THAT one is not fatal, while the one avoided is",
      isFatalRule("non_land_province_in_state") === false && isFatalRule("empty_state_with_content") === true,
      { nonLand: isFatalRule("non_land_province_in_state"), empty: isFatalRule("empty_state_with_content") });
  }

  console.log("\n4. ⚠️ Nothing to clean is still nothing to clean");
  {
    const mod = makeMod(ALL_LAND);   // no province became sea
    const before = fs.readFileSync(path.join(mod, "history", "states", "70-AllGone.txt"), "utf8");
    const r = md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("a map with no sea leftovers edits nothing", (r.statesEdited || 0) === 0 && (r.provincesRemoved || 0) === 0, r);
    rec("…and refuses nothing, so `wouldEmpty` is not just always-on", (r.wouldEmpty || []).length === 0, r.wouldEmpty);
    rec("…and the file is byte-identical", fs.readFileSync(path.join(mod, "history", "states", "70-AllGone.txt"), "utf8") === before);
  }

  console.log("\n5. ⭐ It runs twice with the same answer");
  {
    const mod = makeMod(SIX_SEVEN_SEA);
    const A = { modRoot: mod, gameRoot: GAME, dependencyRoots: [] };
    md.fixSeaProvinceLeftovers(A);
    const snap = fs.readdirSync(path.join(mod, "history", "states")).sort()
      .map((f) => fs.readFileSync(path.join(mod, "history", "states", f), "utf8")).join("\0");
    const r2 = md.fixSeaProvinceLeftovers(A);
    const snap2 = fs.readdirSync(path.join(mod, "history", "states")).sort()
      .map((f) => fs.readFileSync(path.join(mod, "history", "states", f), "utf8")).join("\0");
    rec("⭐⭐ a second pass writes nothing", snap === snap2);
    rec("…and still refuses the same state, rather than forgetting", (r2.wouldEmpty || []).includes(70), r2.wouldEmpty);
  }

  console.log(`\n=== a cleanup must not empty a state: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
