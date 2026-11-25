// /api/army/oob-equipment — the classified "add a ship / add a plane" list for the naval/air OOB editor.
// It must: exclude chassis (archetypes); split ship-vs-air by TYPE through the archetype chain (not a name
// keyword that files carrier-plane airframes under ships); and label each row generic (works without the
// designer DLC — a self-contained tier with its own default fit) vs modular (a bare hull that needs it).
// Run: node test-oob-equipment.js
"use strict";
const fs = require("fs");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const PORT = 3943, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    const GAME = "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV";
    if (!fs.existsSync(GAME)) { ok("SKIP — no HOI4 install on this machine", true); }
    else {
      const d = await fetch(`${BASE}/api/army/oob-equipment?modPath=${encodeURIComponent(GAME)}`).then((r) => r.json());
      ok("endpoint answers", d && d.ok === true, d);
      const ships = d.ships || [], air = d.air || [];
      ok("returns ships and aircraft", ships.length > 5 && air.length > 5, { ships: ships.length, air: air.length });
      const shipIds = new Set(ships.map((s) => s.id)), airIds = new Set(air.map((a) => a.id));

      // NO CHASSIS: a raw archetype must never be offered as a deployable ship.
      ok("the ship archetype 'ship_hull_light' is NOT offered (it's a chassis)", !shipIds.has("ship_hull_light"), [...shipIds].filter((x) => /^ship_hull_\w+$/.test(x) && !/\d/.test(x)));
      ok("the plane archetype is not offered either", ![...airIds].some((x) => /airframe$/.test(x) && !/\d/.test(x)), [...airIds].filter((x) => /airframe$/.test(x)).slice(0, 4));

      // THE SPLIT: a carrier NAVAL BOMBER is a PLANE — it must be in air, never ships, despite "naval" in the id.
      const navalBomberInShips = [...shipIds].filter((x) => /naval_bomber|airframe/i.test(x));
      ok("carrier/naval-bomber airframes are NOT in the ship list", navalBomberInShips.length === 0, navalBomberInShips.slice(0, 4));

      // GENERIC vs MODULAR, measured earlier from the real files:
      const byId = {}; for (const s of ships) byId[s.id] = s;
      const dest1 = byId["destroyer_1"], hull1 = byId["ship_hull_light_1"];
      if (dest1) ok("destroyer_1 (self-contained, 14 stats) is labelled GENERIC — buildable without MtG", dest1.generic === true, dest1);
      if (hull1) ok("ship_hull_light_1 (bare hull, ~1 stat) is labelled MODULAR — needs MtG", hull1.generic === false, hull1);
      const convoy = byId["convoy_1"];
      if (convoy) ok("convoy_1 (no modules at all) is GENERIC", convoy.generic === true, convoy);

      // At least SOME generic ships exist in vanilla (the DLC-free set the user wants).
      ok("vanilla exposes generic (DLC-free) ships", ships.some((s) => s.generic), ships.filter((s) => s.generic).slice(0, 5).map((s) => s.id));
    }

    // MILLENNIUM DAWN: modular-only, so the split + no-chassis rules still hold, and own-designs surface per tag.
    const MD = "D:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\2777392649";
    if (fs.existsSync(MD)) {
      const md = await fetch(`${BASE}/api/army/oob-equipment?modPath=${encodeURIComponent(MD)}&tag=USA`).then((r) => r.json());
      ok("MD: endpoint answers", md && md.ok === true, md && md.error);
      ok("MD: still no plane airframes in the ship list", !(md.ships || []).some((s) => /airframe/i.test(s.id)), (md.ships || []).filter((s) => /airframe/i.test(s.id)).slice(0, 3));
      ok("MD: a country's own designs are returned as a separate group", Array.isArray(md.ownShips) && Array.isArray(md.ownAir), { ownShips: (md.ownShips || []).length, ownAir: (md.ownAir || []).length });
    } else { ok("SKIP MD — not installed", true); }

    const bad = await fetch(`${BASE}/api/army/oob-equipment?modPath=`).then((r) => r.json());
    ok("no mod → clean error, not a crash", bad && (bad.ok === false || Array.isArray(bad.ships)), bad);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  }

  console.log(`\nOOB-EQUIPMENT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
