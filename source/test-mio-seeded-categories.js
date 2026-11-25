// #mio-seeded-categories-do-not-exist — every company the MIO maker created was pre-filled with an equipment
// category and a research category that exist nowhere, so the saved company worked on nothing.
//
// COMPANY_TYPES seeded each slot with `mio_cat_all_armor` / `CAT_armor`, `mio_cat_all_naval` / `CAT_naval_all`,
// `mio_cat_all_aircraft` / `CAT_air`, `mio_cat_all_infantry_weapons` / `CAT_inf_wep`, and `CAT_industry`.
// The real vanilla ids are `mio_cat_eq_all_*` (21 of them) and `mio_cat_tech_*` — note the `_eq_` / `_tech_`
// segment the seeds lacked. freshDraft copied them straight into the draft and switching slot re-seeded them.
//
// save()'s only cross-reference check asked whether the lists were NON-EMPTY, never whether the values were
// real. So a modder picked a slot, filled in name/icon/bonuses, hit Save, got a green ✓ — and in game the
// company could never be assigned to any equipment and never gave its bonuses. On any mod not derived from
// Millennium Dawn that was all five slots.
//
// The fix seeds NOTHING. The correct id set differs per mod — MD lists equipment archetypes directly rather
// than using vanilla's mio_cat_eq_* groups at all — so any hardcoded default is a guess that silently produces
// a broken company on some mods. The existing save guard ("Add at least one equipment or research category it
// works on") plus the ＋ picker, which lists the REAL values for the active mod, guide the user to a working
// choice instead of handing them a broken one that looks authoritative.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-miocat-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const cli = fs.readFileSync(path.join(__dirname, "public", "mio-editor.js"), "utf8");
const code = cli.replace(/^\s*\/\/.*$/gm, ""); // the marker comment quotes the old ids on purpose

// ── the invented ids must be gone from the CODE ──────────────────────────────────────────────────
["mio_cat_all_armor", "mio_cat_all_naval", "mio_cat_all_aircraft", "mio_cat_all_infantry_weapons",
 "CAT_armor", "CAT_naval_all", "CAT_air", "CAT_inf_wep", "CAT_industry"].forEach((id) => {
  ok(`the invented id ${id} is no longer seeded`, !code.includes(id), "still seeded");
});
ok("…while the comment still records what they were", cli.includes("mio_cat_all_armor"), "provenance lost");

// ── the slots still exist, with their icons ──────────────────────────────────────────────────────
const table = code.slice(code.indexOf("var COMPANY_TYPES = ["), code.indexOf("var typeOf ="));
["tank_manufacturer", "naval_manufacturer", "aircraft_manufacturer", "materiel_manufacturer", "industrial_concern"]
  .forEach((k) => ok(`the ${k} slot is still offered`, table.includes(k), table.slice(0, 300)));
ok("every slot seeds an empty equipment list", (table.match(/eq: \[\]/g) || []).length === 5, (table.match(/eq: \[\]/g) || []).length);
ok("…and an empty research list", (table.match(/research: \[\]/g) || []).length === 5, (table.match(/research: \[\]/g) || []).length);
ok("…but keeps its default picture", (table.match(/picture: "/g) || []).length === 5, (table.match(/picture: "/g) || []).length);
ok("freshDraft still copies the (now empty) seeds", /eq: t\.eq\.slice\(\), tech: t\.research\.slice\(\)/.test(cli), "draft wiring changed");

// ── the guard that now carries the weight ────────────────────────────────────────────────────────
ok("save() still refuses a company that works on nothing",
  cli.includes('return warn("Add at least one equipment or research category it works on.");'), "guard gone — an empty company could save");
ok("…and it explains why", /#mio-seeded-categories-do-not-exist/.test(cli), "no marker comment");
ok("the cache version was bumped",
  (() => { const m = /mio-editor\.js\?v=(\d+)/.exec(fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8")); return !!m && Number(m[1]) >= 10; })(), "stale cache version");

// ── the real ids, from the endpoint the ＋ picker uses ────────────────────────────────────────────
const MOD = path.join(ROOT, "probe");
fs.mkdirSync(MOD, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="C"\nsupported_version="1.18.*"\n');

const PORT = 40021, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const j = await fetch(`http://127.0.0.1:${PORT}/api/mio/categories?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    ok("the categories endpoint answers", j && j.ok, j);
    const eq = j.equipment || [];
    ok("…with real equipment categories", eq.length > 0, eq.length);
    ok("…which are the `mio_cat_eq_*` form the seeds got wrong", eq.every((c) => /^mio_cat_eq_/.test(c)), eq.slice(0, 4));
    ok("…and none of the invented ids is among them", !eq.includes("mio_cat_all_armor") && !eq.includes("mio_cat_all_naval"), eq.slice(0, 4));
    const res = j.research || [];
    ok("research categories are offered too", res.length > 0, res.length);
    ok("…and none of the invented CAT_* ids is among them", !res.includes("CAT_armor") && !res.includes("CAT_air"), res.slice(0, 6));

    console.log("\ntest-mio-seeded-categories: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 24 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
