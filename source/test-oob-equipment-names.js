// #oob-equipment-shows-raw-tokens — THE SHIP AND AIRCRAFT PICKERS NAMED NOTHING.
//
// The Military page's starting-navy and starting-air-force cards ask /api/army/oob-equipment for what can be
// deployed, and it answered `name: e.name || null` — never touching localisation. The catalogue object has no
// `name` field, so the answer was null for EVERY row, and army.js falls back to `r.name || r.id`. So the
// picker listed `ship_hull_pre_dreadnought` and `cv_small_plane_naval_bomber_airframe_0` where the game says
// "Pre-Dreadnought" and "Inter-War Carrier Naval Bomber".
//
// 🈯 Measured against the real install: of the 76 ships the endpoint returns, 0 carried a name and 75 have
// one in the game's own localisation; of the 130 aircraft, 0 and 116.
//
// /api/equipment/list — the same catalogue, a different endpoint — has always resolved these, including
// HOI4's nested "$OTHER_KEY$" alias form. This is the sibling that never adopted it.
//
// The contract stays "null when genuinely unnamed", because the page's own `r.name || r.id` fallback is what
// keeps an un-localised mod equipment visible while it is being built.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobnames-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");

// A mod with its own ship: one localised, one not, and one named through HOI4's $ALIAS$ form.
const MOD = path.join(ROOT, "eqmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EqMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "eqmod.mod"), 'name="EqMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
// zz_ so it sorts AFTER vanilla's files: equipment merges alphabetically and an archetype must already exist.
fs.writeFileSync(path.join(MOD, "common", "units", "equipment", "zz_nova_ships.txt"), [
  "equipments = {",
  "\tzeph_cruiser_1 = {",
  "\t\tyear = 1936",
  "\t\tarchetype = ship_hull_cruiser",
  "\t\ttype = screen_ship",
  "\t\tmax_strength = 100",
  "\t\tnaval_speed = 30",
  "\t\tarmor_value = 20",
  "\t\tlg_attack = 12",
  "\t\tbuild_cost_ic = 100",
  "\t}",
  "\tzeph_unnamed_1 = {",
  "\t\tyear = 1936",
  "\t\tarchetype = ship_hull_cruiser",
  "\t\ttype = screen_ship",
  "\t\tmax_strength = 90",
  "\t\tnaval_speed = 28",
  "\t\tarmor_value = 18",
  "\t\tlg_attack = 10",
  "\t\tbuild_cost_ic = 90",
  "\t}",
  "\tzeph_alias_1 = {",
  "\t\tyear = 1936",
  "\t\tarchetype = ship_hull_cruiser",
  "\t\ttype = screen_ship",
  "\t\tmax_strength = 95",
  "\t\tnaval_speed = 29",
  "\t\tarmor_value = 19",
  "\t\tlg_attack = 11",
  "\t\tbuild_cost_ic = 95",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "zz_eq_l_english.yml"),
  "\uFEFFl_english:\n zeph_cruiser_1: \"Zephyr-class Cruiser\"\n zeph_alias_1: \"$zeph_cruiser_1$\"\n", "utf8");

let PORT = 51660;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const oob = (mod, tag) => fetch(`http://127.0.0.1:${PORT}/api/army/oob-equipment?modPath=${encodeURIComponent(mod)}&tag=${tag || ""}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const find = (rows, id) => (rows || []).find((r) => r.id === id) || null;

    console.log("\n[ground truth] the game names almost all of them");
    let vanillaLoc = {};
    {
      let files = [];
      try { files = fs.readdirSync(path.join(GAME, "localisation", "english")).filter((f) => f.endsWith(".yml")); } catch (_) { files = []; }
      for (const f of files) {
        let t = ""; try { t = fs.readFileSync(path.join(GAME, "localisation", "english", f), "latin1"); } catch (_) { continue; }
        for (const m of t.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*\d*\s*"([^"]*)"/gm)) if (vanillaLoc[m[1]] === undefined) vanillaLoc[m[1]] = m[2];
      }
      if (!Object.keys(vanillaLoc).length) console.log("     (no HOI4 install — skipped)");
    }

    if (Object.keys(vanillaLoc).length) {
      const d = await oob(GAME, "GER");
      const ships = d.ships || [], air = d.air || [];
      const shipsWithLoc = ships.filter((r) => vanillaLoc[r.id]);
      const airWithLoc = air.filter((r) => vanillaLoc[r.id]);
      console.log(`     ${ships.length} ships (${shipsWithLoc.length} localised) · ${air.length} aircraft (${airWithLoc.length} localised)`);
      rec("there is something to name", ships.length > 20 && air.length > 20, { ships: ships.length, air: air.length });
      rec("…and the game names nearly all of it", shipsWithLoc.length > 60 && airWithLoc.length > 90, { shipsWithLoc: shipsWithLoc.length, airWithLoc: airWithLoc.length });

      console.log("\n[the endpoint] hands over the names, not the tokens");
      const namedShips = ships.filter((r) => r.name);
      const namedAir = air.filter((r) => r.name);
      console.log(`     named by the endpoint: ${namedShips.length} ships, ${namedAir.length} aircraft`);
      rec("the ships are named", namedShips.length >= shipsWithLoc.length, { got: namedShips.length, want: shipsWithLoc.length });
      rec("the aircraft are named", namedAir.length >= airWithLoc.length, { got: namedAir.length, want: airWithLoc.length });
      // Spot-check two the picker actually shows first.
      for (const [id, want] of [["ship_hull_pre_dreadnought", "Pre-Dreadnought"], ["cv_fighter_equipment_0", "Inter-War Carrier Fighter"]]) {
        const row = find(ships, id) || find(air, id);
        if (!vanillaLoc[id]) continue;
        console.log(`     ${id} -> ${JSON.stringify(row && row.name)}`);
        rec(`${id} is "${want}"`, row && row.name === want, row);
      }
      rec("…and no row leaks the raw token as its name",
        !ships.concat(air).some((r) => r.name === r.id), ships.concat(air).filter((r) => r.name === r.id).slice(0, 3));
    }

    console.log("\n[a mod's own equipment] is named from the mod's localisation");
    {
      const d = await oob(MOD, "GER");
      const ships = d.ships || [];
      const mine = find(ships, "zeph_cruiser_1");
      console.log(`     zeph_cruiser_1 -> ${JSON.stringify(mine && mine.name)}`);
      rec("the mod's ship is found at all", !!mine, (ships || []).filter((r) => r.isMod).map((r) => r.id));
      rec("…and carries the mod's own name", mine && mine.name === "Zephyr-class Cruiser", mine);

      // HOI4 loc supports "$OTHER_KEY$" aliases and /api/equipment/list already resolves them; a picker
      // showing the literal "$zeph_cruiser_1$" would be a different kind of wrong, not a fix.
      const alias = find(ships, "zeph_alias_1");
      console.log(`     zeph_alias_1 -> ${JSON.stringify(alias && alias.name)}`);
      rec("an alias name resolves to what it points at", alias && alias.name === "Zephyr-class Cruiser", alias);

      // CONTROL: the contract is "null when genuinely unnamed" — army.js falls back to `r.name || r.id`, and
      // an un-localised mod equipment must stay visible while the author is still building it.
      const un = find(ships, "zeph_unnamed_1");
      console.log(`     zeph_unnamed_1 -> ${JSON.stringify(un && un.name)}`);
      rec("CONTROL: an unnamed equipment is still listed", !!un, ships.map((r) => r.id).filter((i) => /^zeph/.test(i)));
      rec("CONTROL: …with a null name, so the page falls back to the id", un && (un.name === null || un.name === undefined), un);
    }

    console.log("\n[the page] still falls back when the name is null");
    {
      const army = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
      rec("army.js keeps the id fallback", /name:\s*r\.name\s*\|\|\s*r\.id/.test(army), "fallback gone — an unnamed row would render blank");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== oob equipment names: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
