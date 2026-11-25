// /api/mio/for-equipment — "which company designs this equipment" for the variant view's Designed-by panel.
// The hard parts, all covered here: an MIO links to equipment by TYPE (equipment_type = { mio_cat_eq_* }
// mapped to archetypes in equipment_groups); a country MIO usually INHERITS that via `include = <template>`;
// and a total conversion that replace_path's the organizations dir must NOT leak vanilla companies.
// Run: node test-mio-for-equipment.js
"use strict";
const fs = require("fs");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const PORT = 3947, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const GAME = "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV";
  const MD = "D:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\2777392649";
  const q = (root, arch, tag) => fetch(`${BASE}/api/mio/for-equipment?modPath=${encodeURIComponent(root)}&archetype=${encodeURIComponent(arch)}&tag=${tag}`).then((r) => r.json());
  const qm = (root, arch, tag, mio) => fetch(`${BASE}/api/mio/for-equipment?modPath=${encodeURIComponent(root)}&archetype=${encodeURIComponent(arch)}&tag=${tag}&mio=${encodeURIComponent(mio)}`).then((r) => r.json());
  try {
    if (!fs.existsSync(GAME)) { ok("SKIP — no HOI4 install", true); }
    else {
      const d = await q(GAME, "medium_tank_chassis", "USA");
      ok("endpoint answers", d && d.ok === true, d && d.error);
      const cos = d.companies || [];
      ok("returns companies for a medium tank", cos.length > 3, cos.length);
      // INCLUDE resolution: USA's real companies (which inherit equipment_type via `include`) must appear,
      // not just the generic manufacturers. This was the bug that made every country's companies vanish.
      ok("a country's OWN included companies resolve (Chrysler for USA)", cos.some((c) => /chrysler/i.test(c.name) || /chrysler/i.test(c.id)), cos.slice(0, 6).map((c) => c.name));
      ok("owner-country companies are ranked FIRST", cos[0] && cos[0].tag === "USA", cos.slice(0, 3).map((c) => ({ n: c.name, t: c.tag })));
      ok("companies carry an icon + bonuses", cos.some((c) => c.icon && Object.keys(c.bonuses || {}).length), cos[0]);
      ok("nested $loc$ names resolve (no raw $token$)", !cos.some((c) => /^\$.*\$$/.test(c.name)), cos.slice(0, 5).map((c) => c.name));
      // a nonsense archetype → clean empty, not a crash
      const none = await q(GAME, "not_a_real_archetype_xyz", "USA");
      ok("unknown archetype → empty, not a crash", none && none.ok === true && (none.companies || []).length === 0, none);
    }

    // MILLENNIUM DAWN replace_path's the organizations dir → vanilla companies must NOT leak in.
    if (fs.existsSync(MD)) {
      const plane = await q(MD, "medium_plane_airframe", "USA");
      ok("MD: endpoint answers", plane && plane.ok === true, plane && plane.error);
      ok("MD: returns its own aircraft manufacturers", (plane.companies || []).length > 3, (plane.companies || []).length);
      ok("MD: NO vanilla company leaks in (replace_path honoured)", !(plane.companies || []).some((c) => /crewe|marmon|chrysler/i.test(c.name + c.id)), (plane.companies || []).slice(0, 4).map((c) => c.name));
      // Country attribution must work for MD too — its MIO ids carry the tag (ENG_bae_land_systems…), and its
      // files are named MD_<TAG>_… (the first-segment read got "MD" and tagged everything generic — the bug).
      const engPlane = await q(MD, "medium_plane_cas_airframe", "ENG");
      ok("MD: a country's OWN company is attributed by the MIO id tag prefix (ENG → BAE Aerospace)", (engPlane.companies || []).some((c) => c.tag === "ENG"), (engPlane.companies || []).filter((c) => c.tag === "ENG").map((c) => c.name));
      // THE tank/ship "no company designed this" bug: MD declares equipment_type by listing the ARCHETYPES
      // DIRECTLY (equipment_type = { medium_tank_chassis … }) instead of vanilla's mio_cat_eq_* tokens. The
      // scanner used to only read the category tokens → MD tanks/ships matched NOTHING. #mio-direct-archetype
      const tank = await q(MD, "medium_tank_chassis", "USA");
      ok("MD: a tank archetype matches companies via the DIRECT equipment_type list (not mio_cat_eq_*)", (tank.companies || []).length > 3, (tank.companies || []).length);
      ok("MD: the owner country's tank company ranks first (USA → a USA-tagged manufacturer)", tank.companies && tank.companies[0] && tank.companies[0].tag === "USA", (tank.companies || []).slice(0, 3).map((c) => ({ n: c.name, t: c.tag })));
      const ship = await q(MD, "cruiser", "ENG");
      ok("MD: a legacy ship archetype (cruiser) matches companies directly — even with NO mio_cat_eq_* category", (ship.companies || []).length > 3, { n: (ship.companies || []).length, cats: ship.categories });
      ok("MD: the owner country's ship company ranks first (ENG cruiser → an ENG-tagged manufacturer)", ship.companies && ship.companies[0] && ship.companies[0].tag === "ENG", (ship.companies || []).slice(0, 3).map((c) => ({ n: c.name, t: c.tag })));

      // ── SINGLE DESIGNER: HOI4 ties exactly one MIO to a variant, never several. ──
      // TIER A: the variant's OWN design_team = mio:X resolves to that one company, authoritatively.
      const dt = await qm(MD, "medium_tank_chassis", "FRA", "FRA_nexter_tank_manufacturer");
      ok("MD: design_team mio resolves to the ONE authoritative designer", dt.designer && /giat|nexter/i.test(dt.designer.name + dt.designer.id), dt.designer);
      ok("MD: the authoritative designer carries the owner tag", dt.designer && dt.designer.tag === "FRA", dt.designer && dt.designer.tag);
      // TIER C: with NO design_team, the endpoint must sort so companies[0] is a SINGLE deterministic pick —
      // owner-first, then the MOST SPECIALIZED (fewest equipment types). USA has 3 tank MIOs; GDLS (narrowest) wins.
      const usaTank = await q(MD, "medium_tank_chassis", "USA");
      const c0 = (usaTank.companies || [])[0];
      const breadth = (m) => ((m.directArchetypes || []).length + (m.categories || []).length);
      ok("MD: companies[0] is a USA-owned manufacturer (single heuristic pick)", c0 && c0.tag === "USA", c0 && { n: c0.name, t: c0.tag });
      ok("MD: companies[0] is the MOST SPECIALIZED of the owner's tank MIOs (breadth-minimal)", c0 && (usaTank.companies || []).filter((m) => m.tag === "USA").every((m) => breadth(c0) <= breadth(m)), (usaTank.companies || []).filter((m) => m.tag === "USA").map((m) => ({ n: m.name, b: breadth(m) })));
      // parseVariantBlockBody must actually capture design_team from the real files.
      const dv = await fetch(`${BASE}/api/equipment/variants/all?modPath=${encodeURIComponent(MD)}`).then((r) => r.json());
      const withDT = (dv.variants || []).filter((v) => v.designTeam);
      ok("MD: the variant scan captures design_team (Leclerc → FRA_nexter…)", withDT.some((v) => /leclerc/i.test(v.name) && /nexter/i.test(v.designTeam)), withDT.slice(0, 3).map((v) => ({ n: v.name, dt: v.designTeam })));
      // A generic template gated `allowed = { NOT = { tag = VEN … } }` EXCLUDES those tags — they must NOT be
      // read as its owner. Before the fix the allowTag regex reached into the NOT block, tagged the generic
      // naval org "VEN", promoted it to owner-tier, and showed it as VEN's designer. #mio-tag
      const ven = await q(MD, "carrier", "VEN");
      ok("MD: a country in an allowed NOT-block does NOT own the generic (no generic tagged VEN)", !(ven.companies || []).some((c) => /generic/i.test(c.id) && c.tag === "VEN"), (ven.companies || []).filter((c) => c.tag === "VEN").map((c) => c.id));
      ok("MD: VEN's own naval company is the pick, not an excluded-generic", (ven.companies || []).filter((c) => c.tag === "VEN").every((c) => !/generic/i.test(c.id)), (ven.companies || []).filter((c) => c.tag === "VEN").map((c) => c.name));
    } else { ok("SKIP MD — not installed", true); }

    const bad = await q("", "medium_tank_chassis", "USA");
    ok("no mod → clean error/empty, not a crash", bad && (bad.ok === false || Array.isArray(bad.companies)), bad);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  }

  console.log(`\nMIO-FOR-EQUIPMENT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
