// #chassis-missing-required-slot — A TANK HULL THAT COULD NOT MOUNT A GUN.
//
// From a play-test error.log, twelve times:
//
//   Module tank_medium_two_man_tank_turret cannot add category tank_medium_main_armament to slot
//   main_armament_slot of equipment nua_medium_hull as the equipment does not have this slot.
//
// A module names the SLOT it mounts into. Nova's chassis editor asks the modder to type those engine-defined
// slot names by hand, offering only a placeholder, so the hull was written with turret_type_slot and
// armor_type_slot and nothing else — no gun slot, no engine slot, no suspension slot. It is not merely
// missing modules: the design can never be completed, so the chassis is unbuildable.
//
// GROUND TRUTH, measured against the shipping game rather than assumed: among archetypes of the same `type`,
// take the slot-name set the MAJORITY declare. For armor that is decisive — all six real tank chassis declare
// the identical nine slots (five required), and land_cruiser_chassis is the lone outlier the majority rule
// excludes. Types with one or two archetypes trivially agree.
//
// Two halves, because the warning alone would only tell the modder afterwards: the editor now SEEDS its
// draft from that template, and the save says so if a required slot is still absent.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slots-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

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
  const p = path.join(__dirname, `.ctl-slots-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}

let PORT = 44840;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const TANK_SLOTS = ["turret_type_slot", "main_armament_slot", "suspension_type_slot", "armor_type_slot", "engine_type_slot"];
const slot = (name, cats) => ({ name, required: true, categories: cats || ["tank_armor_type"] });
const newChassis = (api, mod, id, slots) => api.post("/api/equipment/chassis-new", {
  modPath: mod, id, name: id, domain: "armor", type: "armor", year: 1939, priority: 100,
  slots, baseStats: { build_cost_ic: 10, reliability: 0.8 },
});

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] what the game's own tank chassis declare");
    const tankFile = path.join(V, "common", "units", "equipment", "tank_chassis.txt");
    const haveGame = fs.existsSync(tankFile);
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else {
      const txt = fs.readFileSync(tankFile, "utf8").replace(/#[^\n]*/g, "");
      for (const id of ["light_tank_chassis", "medium_tank_chassis", "heavy_tank_chassis"]) {
        const i = txt.indexOf(`${id} = {`);
        let d = 0, blk = "";
        for (let k = txt.indexOf("{", i); k < txt.length; k++) {
          if (txt[k] === "{") d++;
          else if (txt[k] === "}") { d--; if (!d) { blk = txt.slice(i, k); break; } }
        }
        rec(`${id} declares every required slot`,
          TANK_SLOTS.every((s) => new RegExp(`(^|[^A-Za-z0-9_])${s}\\s*=\\s*\\{`).test(blk)),
          TANK_SLOTS.filter((s) => !new RegExp(`(^|[^A-Za-z0-9_])${s}\\s*=\\s*\\{`).test(blk)));
      }
    }

    api = await serve(createApp());

    console.log("\n[the template] read from the game, not invented here");
    const t = await api.get("/api/equipment/chassis-slot-template?type=armor");
    rec("the endpoint answers", t.s === 200 && t.b.ok, t.b);
    if (haveGame) {
      const names = (t.b.slots || []).map((s) => s.name);
      rec("…naming a real vanilla chassis as its source", /_chassis$/.test(String(t.b.from)), t.b.from);
      rec("…and the majority agrees on it", t.b.agree >= 6 && t.b.agree < t.b.of + 1,
        { agree: t.b.agree, of: t.b.of });
      rec("…the outlier land_cruiser_chassis is NOT the source", t.b.from !== "land_cruiser_chassis", t.b.from);
      rec("…carrying all nine slots", names.length === 9, names);
      rec("…with the five the game requires marked required",
        TANK_SLOTS.every((s) => (t.b.slots || []).some((x) => x.name === s && x.required)),
        (t.b.slots || []).filter((x) => x.required).map((x) => x.name));
      rec("…and each slot carries its module categories",
        (t.b.slots || []).every((s) => Array.isArray(s.categories) && s.categories.length),
        (t.b.slots || []).map((s) => `${s.name}:${(s.categories || []).length}`));
      const unknown = await api.get("/api/equipment/chassis-slot-template?type=not_a_real_type");
      rec("an unknown type yields no template rather than a guess",
        unknown.b.ok && (unknown.b.slots || []).length === 0, unknown.b);
    }

    console.log("\n[the bug] the exact slot set the user's hull was written with");
    {
      const mod = mkMod("m1");
      const r = await newChassis(api, mod, "nua_medium_hull", [
        slot("turret_type_slot", ["tank_medium_turret_type"]),
        slot("armor_type_slot", ["tank_armor_type"]),
      ]);
      rec("the chassis is still created — a warning is not a refusal", r.s === 200 && r.b.ok, r.b);
      const onDisk = fs.readFileSync(path.join(mod, "common", "units", "equipment", "nova_custom_chassis.txt"), "utf8");
      rec("…and really is on disk", onDisk.includes("nua_medium_hull"), onDisk.slice(0, 200));
      if (haveGame) {
        const w = String(r.b.slotWarning || "");
        rec("…and the save says a slot is missing", !!w, "(no warning)");
        rec("…naming main_armament_slot, the one the modules complained about",
          /main_armament_slot/.test(w), w);
        rec("…and the engine and suspension slots too",
          /engine_type_slot/.test(w) && /suspension_type_slot/.test(w), w);
        rec("…quoting what the game will actually say", /does not have this slot/.test(w), w);
        rec("…and not naming the slots it DOES have as missing",
          !/missing[^.]*turret_type_slot/.test(w), w);
      }
    }

    console.log("\n[no over-reach] a complete tank chassis says nothing");
    if (haveGame) {
      const mod = mkMod("m2");
      const full = (t.b.slots || []).map((s) => ({ name: s.name, required: !!s.required, categories: s.categories }));
      const r = await newChassis(api, mod, "nua_full_hull", full);
      rec("a chassis built from the template is created", r.s === 200 && r.b.ok, r.b);
      rec("…with no warning at all", !r.b.slotWarning, r.b.slotWarning);
    }

    console.log("\n[no over-reach] a type the game has no archetype for is not second-guessed");
    {
      const mod = mkMod("m3");
      // `submarine` HAS a template, so use a domain/type pair that resolves but whose archetype set is tiny —
      // the point is that a valid, complete set for its own type is silent.
      const r = await api.post("/api/equipment/chassis-new", {
        modPath: mod, id: "nua_sub_hull", name: "nua_sub_hull", domain: "ship", type: "submarine",
        year: 1936, priority: 100, baseStats: { build_cost_ic: 10, reliability: 0.8 },
        slots: [
          { name: "fixed_ship_torpedo_slot", required: true, categories: ["ship_torpedo"] },
          { name: "fixed_ship_engine_slot", required: true, categories: ["ship_engine"] },
        ],
      });
      rec("a submarine hull with both required slots is created", r.s === 200 && r.b.ok, r.b);
      rec("…and is not warned about", !r.b.slotWarning, r.b.slotWarning);
    }
    api.stop(); api = null;

    console.log("\n[the client] the editor seeds the draft so the modder never types these from memory");
    {
      const A = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
      rec("army.js has a seeding step", /async function seedChassisSlots\(/.test(A), "no seeder");
      rec("…that asks the server for the template",
        /chassis-slot-template\?type=/.test(A), "never calls the endpoint");
      rec("…and only when the modder has typed nothing, so it cannot overwrite work",
        /const untouched =[\s\S]{0,200}?if \(!untouched/.test(A), "seeds unconditionally");
      for (const entry of ["openWeaponCreator", "openChassisEditor"]) {
        const i = A.indexOf(`function ${entry}(`);
        const body = i === -1 ? "" : A.slice(i, A.indexOf("\n  }", i));
        rec(`${entry} seeds before rendering`, /seedChassisSlots\(/.test(body), body.slice(0, 200));
      }
      rec("changing the type re-seeds", /chType[\s\S]{0,120}?seedChassisSlots\(/.test(A), "type change does not re-seed");
      rec("changing the domain re-seeds", /chDomain[\s\S]{0,260}?seedChassisSlots\(/.test(A), "domain change does not re-seed");
      rec("the save-time warning is shown to the modder", /r\.slotWarning/.test(A), "slotWarning never read");
      // nbAlert lives in ai-field-assist.js, which army.html does not load — calling it here would throw into
      // a catch and the message would be lost. This asserts the page uses a modal it actually has.
      const HTML = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");
      rec("…via a modal this page really loads",
        /r\.slotWarning[\s\S]{0,220}?showNovaInfoModal/.test(A) && /nova-info-modal\.js/.test(HTML),
        "uses a helper army.html does not load");
      rec("army.js is syntactically valid",
        (() => { try { new Function(A); return true; } catch (e) { return String(e.message); } })() === true,
        (() => { try { new Function(A); return "ok"; } catch (e) { return String(e.message); } })());
    }

    console.log("\n[back-out] stop consulting the game's own chassis");
    if (haveGame) {
      const built = controlApp("notmpl", [[
        "        const tmpl = chassisSlotTemplate(chassisGameRoot, type);",
        "        const tmpl = null;"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const c = await newChassis(capi, cmod, "nua_medium_hull", [
            slot("turret_type_slot", ["tank_medium_turret_type"]),
            slot("armor_type_slot", ["tank_armor_type"]),
          ]);
          rec("…and a hull that can never mount a gun is created with nothing said",
            c.s === 200 && c.b.ok && !c.b.slotWarning, c.b);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== chassis required slots: ${checks} checks, ${fails.length} failed ===`);
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
