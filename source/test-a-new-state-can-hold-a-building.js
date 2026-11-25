// ⛔ #a-new-state-has-no-building-slots — NOVA MADE STATES HOI4 CANNOT PUT A BUILDING IN.
//
// map/buildings.txt holds the MODEL POSITION for everything buildable, keyed by state:
//     stateId;type;x;y;z;rotation;anchorProvince
// The nudger's wiki page says of that section, and this is its only warning about it:
//     "Will cause crashes if a new state is created without that being adjusted."
//
// createState wrote history/states/<id>-<name>.txt and nothing else. Measured, the invariant it broke is
// absolute across every real map:
//     vanilla 1081/1081 · Road to 56 1143/1143 · Millennium Dawn 1221/1221 · Rise of Nations 1154/1154
// Four out of four keep it; Nova kept it zero times. And rekeyBuildingAnchorsForProvince, immediately above
// the fix, already records what this file does when it disagrees with the states: "crashes HOI4 at session
// launch … with NO error.log entry — found the hard way on Millennium Dawn (Gaza/Negev, Jun 2026)".
//
// The owner's words were: "a lot of them dont even work as they are now cuz we have no clue how the nudge
// system works so its hard to make a map there". This is the nudge system.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const BUILDINGS = path.join(GAME, "map", "buildings.txt");
if (!fs.existsSync(BUILDINGS)) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const rowsOf = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.includes(";"));

  try {
    console.log("\n-- ⭐ the invariant, re-derived from the installed game --");
    {
      // DERIVED, never typed: which types does EVERY state carry, and how many of each? If Paradox changes
      // the set in a patch, this fails rather than silently writing a stale template into people's mods.
      const perState = new Map();
      for (const r of rowsOf(BUILDINGS)) {
        const c = r.split(";");
        const key = c[0] + ";" + c[1];
        perState.set(key, (perState.get(key) || 0) + 1);
      }
      const states = new Set(), byType = new Map();
      for (const k of perState.keys()) {
        const [s, t] = k.split(";");
        states.add(s);
        if (!byType.has(t)) byType.set(t, new Map());
        const m = byType.get(t);
        const n = perState.get(k);
        m.set(n, (m.get(n) || 0) + 1);
      }
      // ⛔ #a-slot-is-per-land-province-not-per-state — THE MODE IS ONLY THE RULE WHEN THE COUNT IS CONSTANT.
      // The first version of this took, for every type present in all states, the MODE of its per-state row
      // count. For arms_factory (always 6) the mode IS the rule. For supply_node the per-state count is spread
      // over 44 distinct values from 1 to 70, and its mode — 4 — is merely the commonest LAND-PROVINCE COUNT.
      // Nova wrote that 4 as a per-state constant, so a generated world had 3,328 slots where its 4,722 land
      // provinces call for one each. The discriminator is derived here, never typed: ONE distinct count means
      // a per-state constant, a spread means one per land province.
      const universal = [], spread = [];
      for (const [t, counts] of byType) {
        let inStates = 0, mode = 0, modeN = 0;
        for (const [n, k] of counts) { inStates += k; if (k > modeN) { modeN = k; mode = n; } }
        if (inStates !== states.size) continue;
        if (counts.size === 1) universal.push([t, mode]); else spread.push(t);
      }
      universal.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
      spread.sort();
      const mine = md.STATE_BUILDING_SLOTS.slice().sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
      ok(states.size === 1081, `the game ships ${states.size} states in buildings.txt`, states.size);
      ok(JSON.stringify(universal) === JSON.stringify(mine),
        "STATE_BUILDING_SLOTS still matches the types whose per-state count is CONSTANT",
        { derived: universal, constant: mine });
      ok(JSON.stringify(spread) === JSON.stringify(md.PER_LAND_PROVINCE_BUILDING_SLOTS.slice().sort()),
        "PER_LAND_PROVINCE_BUILDING_SLOTS still matches the types whose count VARIES",
        { derived: spread, constant: md.PER_LAND_PROVINCE_BUILDING_SLOTS });

      // …and that the varying ones vary with exactly the state's own LAND province count, on every state.
      const landOfState = new Map();
      {
        const isLand = new Set();
        for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)) {
          const c = l.split(";");
          if (c.length >= 8 && /^\d+$/.test(c[0]) && (c[4] || "").trim() === "land") isLand.add(+c[0]);
        }
        for (const f of fs.readdirSync(path.join(GAME, "history", "states"))) {
          if (!/\.txt$/i.test(f)) continue;
          const t = fs.readFileSync(path.join(GAME, "history", "states", f), "latin1").replace(/#[^\n]*/g, "");
          const idm = /\bid\s*=\s*(\d+)/.exec(t);
          if (!idm) continue;
          const pv = /provinces\s*=\s*\{([^}]*)\}/.exec(t);
          const ps = pv ? (pv[1].match(/\d+/g) || []).map(Number) : [];
          landOfState.set(+idm[1], ps.filter((p) => isLand.has(p)).length);
        }
      }
      for (const t of md.PER_LAND_PROVINCE_BUILDING_SLOTS) {
        let exact = 0;
        for (const [st, land] of landOfState) if ((perState.get(st + ";" + t) || 0) === land) exact++;
        ok(exact === landOfState.size,
          `${t}: every vanilla state has exactly one per land province`, exact + "/" + landOfState.size);
      }
    }

    console.log("\n-- a state created by Nova gets slots --");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slots-"));
      roots.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Slots"\n', "utf8");

      // Two real vanilla land provinces, so the anchor has actual pixels to find.
      const res = md.createState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], name: "Slotland", owner: "GER", provinces: [3838, 11374] });
      ok(res && res.ok, "the state was created", res && res.error);
      const bf = path.join(mod, "map", "buildings.txt");
      ok(fs.existsSync(bf), "map/buildings.txt was materialised into the mod", bf);

      const mine = rowsOf(bf).filter((r) => parseInt(r.split(";")[0], 10) === res.id);
      const types = {};
      for (const r of mine) { const t = r.split(";")[1]; types[t] = (types[t] || 0) + 1; }

      // ⚠️ NOT an equality check on the whole set. createState re-keys existing rows anchored to the
      // provinces the new state took (rekeyBuildingAnchorsForProvince), so a legitimately created state can
      // also own e.g. two floating_harbor rows it inherited with province 3838. What must hold is that every
      // type in the template is present AT LEAST its vanilla count — that is what "can build here" means.
      // The first version of this test asserted exact equality and failed for a correct reason: the anchors
      // had already been moved, and an any-row "already furnished" check then skipped the state entirely.
      const short = md.STATE_BUILDING_SLOTS.filter(([t, n]) => (types[t] || 0) < n);
      ok(short.length === 0, "every buildable type has at least vanilla's per-state count",
        { missing: short, got: types });
      ok((types.arms_factory || 0) >= 6 && (types.industrial_complex || 0) >= 6,
        "…including the six factory slots of each kind", { arms: types.arms_factory, ind: types.industrial_complex });

      // Shape and plausibility of the rows themselves — a malformed row is as bad as a missing one.
      const added = mine.filter((r) => md.STATE_BUILDING_SLOTS.some(([t]) => t === r.split(";")[1]));
      const bad = added.filter((r) => r.split(";").length !== 7);
      ok(bad.length === 0, "every row has exactly 7 fields", bad.slice(0, 2));
      const ys = added.map((r) => parseFloat(r.split(";")[3]));
      ok(ys.every((y) => y >= 9 && y <= 24), "…and a world height inside vanilla's observed range (9.10-23.80)", ys.slice(0, 3));
      const xs = added.map((r) => parseFloat(r.split(";")[2])), zs = added.map((r) => parseFloat(r.split(";")[4]));
      ok(xs.every((v) => v >= 0 && v < 5632) && zs.every((v) => v >= 0 && v < 2048),
        "…and coordinates inside the map", { x: xs[0], z: zs[0] });
      ok(added.every((r) => r.split(";")[6] === "0"), "…with the anchor column 0, as vanilla uses for non-naval rows");

      // ⛔ #a-new-states-slots-land-in-another-state — READ THE POSITION BACK, the way every reader does.
      // stateBuildingAnchor wrote the province centroid's top-down pixel ROW as z, while buildingZToPixelY — which the
      // placement scan, the re-key writer and Auto-fix's buildings.txt pass all use — reads z bottom-up. Every check
      // above passed on rows standing in another state entirely: measured on vanilla, 1,065 of 1,081 states' slots read
      // back outside the state (546 on water), and Auto-fix then re-homed all 34 rows to whoever owned that pixel.
      {
        const bmp = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
        const off = bmp.readUInt32LE(10), W = bmp.readInt32LE(18), H = bmp.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
        const c2i = new Map();
        for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
          const c = l.split(";");
          if (c.length < 4) continue;
          const id = parseInt(c[0], 10);
          if (Number.isFinite(id)) c2i.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, id);
        }
        const provAt = (x, y) => { const o = off + (H - 1 - y) * rs + x * 3; return c2i.get(((bmp[o + 2] << 16) | (bmp[o + 1] << 8) | bmp[o]) >>> 0); };
        void W;
        const own = new Set([3838, 11374]);
        const outside = added.filter((r) => {
          const c = r.split(";");
          return !own.has(provAt(Math.floor(parseFloat(c[2])), md.buildingZToPixelY(H, parseFloat(c[4]))));
        });
        ok(outside.length === 0, "⭐⭐⭐ every slot stands inside the new state's own provinces, read back the way every reader reads it",
          { outside: outside.length, of: added.length, first: outside[0], readsAs: outside[0] && provAt(Math.floor(parseFloat(outside[0].split(";")[2])), md.buildingZToPixelY(H, parseFloat(outside[0].split(";")[4]))) });
      }

      console.log("\n-- and the file it appended to is still intact --");
      // ⚠️ NOT "+34", and NOT byte-identity on the first rows — for the reason the block above already
      // gives, one step further. Taking a province now brings ALL of its buildings, not just the ones with
      // an anchor in the 7th column (#moved-province-strands-its-position-buildings): provinces 3838 and
      // 11374 carry 27 vanilla rows between them — 2 by anchor, 25 by position — so the top-up appends only
      // what is still missing, and some of those 27 are among the file's very first lines.
      //
      // What must hold is stronger and does not drift: NO ROW IS LOST OR DUPLICATED, and every vanilla row
      // still has its exact geometry — only the state key may differ, and only where the row belongs to a
      // province this state took.
      const all = rowsOf(bf);
      const van = rowsOf(BUILDINGS);
      const geom = (r) => r.split(";").slice(1).join(";");            // everything except the state key
      ok(all.length > van.length, "the file only grew", { before: van.length, after: all.length });

      // Nothing lost, nothing duplicated: every vanilla geometry still appears at least as often.
      const bag = (rs) => { const m = new Map(); for (const r of rs) m.set(geom(r), (m.get(geom(r)) || 0) + 1); return m; };
      const bVan = bag(van), bAll = bag(all);
      let missing = 0, firstMissing = null;
      for (const [g, n] of bVan) { const got = bAll.get(g) || 0; if (got < n) { missing += n - got; if (!firstMissing) firstMissing = g; } }
      ok(missing === 0, "every vanilla row is still present, geometry unchanged", { missing, firstMissing });

      // The prefix is positional — all[i] is van[i] edited in place — so a re-key is visible per row, and
      // the ONLY thing a re-key may change is the state key.
      let reKeyed = 0, mangled = 0, firstMangled = null;
      for (let i = 0; i < van.length; i++) {
        if (all[i] === van[i]) continue;
        if (geom(all[i]) === geom(van[i])) reKeyed++;
        else { mangled++; if (!firstMangled) firstMangled = { was: van[i], now: all[i] }; }
      }
      ok(mangled === 0, "no vanilla row had anything but its state key changed", firstMangled);
      ok(reKeyed > 0, "vanilla rows sitting on the state's own provinces were re-keyed to it", reKeyed);
      // ⭐ And specifically the POSITION-placed ones, which have no anchor to find them by. Counting only
      // re-keys is not enough: the two anchored rows would satisfy that on their own, and did before
      // #moved-province-strands-its-position-buildings — while 25 factories, bunkers and supply nodes on the
      // same provinces stayed keyed to the state they came from and vanished from the game.
      let reKeyedByPosition = 0;
      for (let i = 0; i < van.length; i++) {
        if (all[i] === van[i]) continue;
        if (parseInt(van[i].split(";")[6], 10) === 0) reKeyedByPosition++;
      }
      ok(reKeyedByPosition > 0,
        "…including the ones placed only by POSITION, which have no anchor column to be found by", reKeyedByPosition);
      ok(all.every((r, i) => i >= van.length || parseInt(all[i].split(";")[0], 10) === res.id || all[i] === van[i]),
        "…and every row that changed now belongs to the new state", "some row changed to a third state");
    }

    console.log("\n-- it is idempotent: a state that already has slots is left alone --");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slots2-"));
      roots.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Slots2"\n', "utf8");
      const res = md.createState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], name: "Twice", owner: "GER", provinces: [3838] });
      const bf = path.join(mod, "map", "buildings.txt");
      const after1 = fs.readFileSync(bf, "utf8");
      const again = md.ensureBuildingSlotsForState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: res.id, provinces: [3838] });
      ok(again && again.changed === false, "a second call reports no change", again);
      ok(fs.readFileSync(bf, "utf8") === after1, "…and the file is byte-identical");
    }

    console.log("\n-- the state key is matched exactly, not as a substring --");
    {
      // "1" must not be considered already-present because "1081" exists. Getting this wrong would silently
      // skip nine states in ten and be invisible until a crash.
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slots3-"));
      roots.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Slots3"\n', "utf8");
      fs.mkdirSync(path.join(mod, "map"), { recursive: true });
      fs.writeFileSync(path.join(mod, "map", "buildings.txt"), "1081;air_base;100.00;10.00;100.00;0.00;0\n", "utf8");
      const r = md.ensureBuildingSlotsForState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 108, provinces: [3838] });
      ok(r && r.changed === true, "state 108 is furnished even though 1081 is present", r);
      const mine = rowsOf(path.join(mod, "map", "buildings.txt")).filter((x) => parseInt(x.split(";")[0], 10) === 108);
      // DERIVED, not typed: the per-state constants plus one of each varying type per LAND province of the
      // state — here province 3838 alone. The literal this replaced was 34, which was the old flat-4 table.
      const want = md.STATE_BUILDING_SLOTS.reduce((a, [, n]) => a + n, 0) + md.PER_LAND_PROVINCE_BUILDING_SLOTS.length * 1;
      ok(mine.length === want, `…with its own ${want} rows`, mine.length);
    }

    console.log("\n-- ⭐ CONTROL: without the fix, the state has nothing --");
    {
      // Prove the fix is load-bearing by asking the question the old code answered: a state file exists and
      // buildings.txt has no row for it.
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slots4-"));
      roots.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Slots4"\n', "utf8");
      fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
      fs.writeFileSync(path.join(mod, "history", "states", "999-Bare.txt"),
        'state = {\n\tid = 999\n\tname = "STATE_999"\n\tprovinces = { 3838 }\n\thistory = { owner = GER }\n}\n', "utf8");
      const hasSlots = fs.existsSync(path.join(mod, "map", "buildings.txt"));
      ok(!hasSlots, "a hand-written state file leaves buildings.txt absent — the shape of the bug");
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }

  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
