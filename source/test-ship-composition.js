// #ship-composition — A SHIP ROW NEVER SAID WHAT THE SHIP WAS MADE OF.
//
// Reported from play: ships don't show what they consist of.
//
// The naval / air picker listed an id, a name and where the design came from. For a country's own designs
// that is the least interesting third of what is known about them: the whole point of a design is the
// modules fitted to it, and the server was already reading those to build the list.
//
// Each row now carries what it CONSISTS OF:
//   · a design → its real modules, from the country's create_equipment_variant blocks
//   · anything else → its headline stats, because a plain tier's fitted modules are not something Nova
//     parses (default_modules is not in the equipment catalogue), and the numbers are what tell one hull
//     from another anyway
//
// Two module shapes reach the server here, which is the part worth guarding: a Nova-managed design stores a
// LIST of {slot, module}, while a parsed create_equipment_variant block gives a MAP of slot -> module. Both
// normalise to the same thing, and the "empty" placeholder Nova writes for a deliberately open slot is
// dropped — an empty slot is not a part of the ship.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shipcomp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}
const ARMY = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
const CSS = fs.readFileSync(path.join(__dirname, "public", "styles.css"), "utf8");

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-shipcomp-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// A mod with one modular hull, a tier that inherits it, and a country design fitting two modules.
function mkMod() {
  const dir = path.join(ROOT, "m");
  fs.mkdirSync(path.join(dir, "common", "units", "equipment", "modules"), { recursive: true });
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "units", "equipment", "zz_hulls.txt"), [
    "equipments = {",
    "\tnua_hull = {",
    "\t\tyear = 1936", "\t\tis_archetype = yes", "\t\tis_buildable = no", "\t\ttype = screen_ship",
    "\t\tgroup_by = archetype", "\t\tinterface_category = interface_category_capital_ships", "\t\tpriority = 100",
    "\t\tmodule_slots = {",
    "\t\t\tfixed_ship_battery_slot = { required = yes allowed_module_categories = { ship_light_battery } }",
    "\t\t\tfixed_ship_engine_slot = { required = yes allowed_module_categories = { ship_engine } }",
    "\t\t}",
    "\t}",
    "\tnua_hull_1 = {",
    "\t\tarchetype = nua_hull", "\t\tpriority = 100", "\t\tvisual_level = 0", "\t\tyear = 1936",
    "\t\tmodule_slots = inherit",
    "\t\tmax_strength = 120", "\t\tnaval_speed = 28", "\t\tbuild_cost_ic = 900", "\t\tarmor_value = 11",
    "\t}",
    "}", ""].join("\n"), "utf8");
  fs.writeFileSync(path.join(dir, "common", "units", "equipment", "modules", "zz_mods.txt"), [
    "equipment_modules = {",
    "\tnua_gun = { category = ship_light_battery }",
    "\tnua_engine = { category = ship_engine }",
    "}", ""].join("\n"), "utf8");
  // A country design with one slot fitted, one left explicitly "empty" — the placeholder must not be listed.
  fs.writeFileSync(path.join(dir, "history", "countries", "NUA - Nova.txt"), [
    "capital = 1", "",
    "# >>> NOVA equipment variants (managed by Nova — do not edit inside) >>>",
    '# NOVA-VARIANT {"name":"Test Escort","chassisType":"nua_hull_1","dlc":"Man the Guns","designer":"ships","modules":[{"slot":"fixed_ship_battery_slot","module":"nua_gun"},{"slot":"fixed_ship_engine_slot","module":"empty"}],"upgrades":{},"fallbackType":"","fallbackUpgrades":{},"icon":"","obsolete":false}',
    "create_equipment_variant = {",
    '\tname = "Test Escort"', "\ttype = nua_hull_1", "\tparent_version = 0",
    "\tmodules = {", "\t\tfixed_ship_battery_slot = nua_gun", "\t\tfixed_ship_engine_slot = empty", "\t}",
    "}",
    "# <<< NOVA equipment variants <<<", ""].join("\n"), "utf8");
  return dir;
}

let PORT = 45900;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    const mod = mkMod();
    api = await serve(createApp());
    const url = `/api/army/oob-equipment?modPath=${encodeURIComponent(mod)}&tag=NUA`;
    let r = await api.get(url);
    if (r.s !== 200 || !r.b.ok) {
      // the endpoint name is the one the client calls; find it rather than guess
      const m = /fetch\(`?\/api\/(army\/[a-z-]*naval[a-z-]*)/.exec(ARMY);
      if (m) r = await api.get(`/api/${m[1]}?modPath=${encodeURIComponent(mod)}&tag=NUA`);
    }
    console.log("\n[the payload] a row now carries what the thing is made of");
    rec("the naval/air endpoint answers", r.s === 200 && r.b.ok, r.b.error || r.b);
    const own = (r.b.ownShips || [])[0];
    const ships = r.b.ships || [];
    rec("the country's own design is listed", !!own, r.b.ownShips);
    if (own) {
      rec("…and carries its modules", Array.isArray(own.modules) && own.modules.length > 0, own.modules);
      rec("…naming the fitted one", (own.modules || []).some((m) => m.module === "nua_gun"), own.modules);
      rec("…with the slot it sits in", (own.modules || []).some((m) => m.slot === "fixed_ship_battery_slot"), own.modules);
      rec("…and NOT listing the \"empty\" placeholder as a part",
        !(own.modules || []).some((m) => m.module === "empty"), own.modules);
    }
    const tier = ships.find((x) => x.id === "nua_hull_1");
    rec("the plain tier is listed", !!tier, ships.map((x) => x.id).slice(0, 6));
    if (tier) {
      rec("…and carries headline stats instead, since its fit is not parsed",
        Array.isArray(tier.stats) && tier.stats.length > 0, tier.stats);
      rec("…in reading order, strongest first", tier.stats[0] && tier.stats[0].k === "max_strength", tier.stats);
      rec("…capped to a caption, not a spreadsheet", tier.stats.length <= 4, tier.stats.length);
      rec("…and only stats it actually declares", tier.stats.every((s) => Number.isFinite(s.v) && s.v !== 0), tier.stats);
    }
    api.stop(); api = null;

    console.log("\n[the tile] renders it, and says which it is showing");
    rec("army.js has a parts line", /function eqbPartsLine\(/.test(ARMY), "no parts line");
    rec("…preferring modules when the design has them", /const mods = Array\.isArray\(r\.modules\)[\s\S]{0,300}?if \(mods\.length\)/.test(ARMY), "stats win over modules");
    rec("…falling back to stats", /else if \(stats\.length\)/.test(ARMY), "no stat fallback");
    rec("…and rendering nothing at all when neither is known", /if \(!text\) return "";/.test(ARMY), "renders an empty line");
    rec("…with the untouched ids in the tooltip", /title="' \+ esc\(title\)/.test(ARMY), "no tooltip");
    rec("the browser rows carry both fields through",
      /modules: Array\.isArray\(r\.modules\) \? r\.modules : \[\], stats: Array\.isArray\(r\.stats\) \? r\.stats : \[\]/.test(ARMY),
      "fields dropped on the way to the tile");
    rec("the tile grows for the extra line instead of clipping it",
      /min-height: 124px/.test(CSS) && !/\n  height: 124px/.test(CSS), "still a fixed height");

    console.log("\n[back-out] stop sending the modules");
    {
      const built = controlApp("nomods", [[
        "            const row = { id: v.type, name: v.name, ownDesign: true, generic: false, dlc: base ? base.dlc : null,\n              modules: mods, stats: base ? headlineStatsFor(base, dom) : [] };",
        "            const row = { id: v.type, name: v.name, ownDesign: true, generic: false, dlc: base ? base.dlc : null };"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const c = await capi.get(`/api/army/oob-equipment?modPath=${encodeURIComponent(mod)}&tag=NUA`);
          const o = (c.b.ownShips || [])[0];
          rec("…and the design is back to saying nothing about itself",
            !!o && !o.modules, o);
        } finally { capi.stop(); }
      }
    }

    console.log("\n[still valid]");
    rec("army.js parses", (() => { try { new Function(ARMY); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(ARMY); return "ok"; } catch (e) { return String(e.message); } })());

    console.log(`\n=== ship composition: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
