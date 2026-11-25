// #archetype-missions-add-on-cannot-edit — SEED FROM THE LAYER BELOW INSTEAD OF REFUSING.
//
// An add-on could not change the mission roles of ANY aircraft its base mod supplies. The endpoint built its
// path out of activeRoot alone:
//
//     const abs = path.join(activeRoot, "common", "units", "equipment", safeFile);
//     if (!fs.existsSync(abs)) return { ok:false, error: "Equipment file not found: " + safeFile };
//
// and `cur.fileName` is the file the equipment actually lives in — for an add-on, the BASE MOD's. Measured:
// the add-on got {"ok":false,"error":"Equipment file not found: bm_planes.txt"} while the identical edit on a
// standalone mod succeeded and left every other field intact.
//
// This was not a degraded result, it was a wall. Roles live on the ARCHETYPE — a create_equipment_variant
// cannot carry allow_mission_type — so when this refuses there is no other route to change them.
//
// Fixed with the pattern the module and upgrade writers already use (#dep-equip-preserve): copy-then-edit.
// The seed brings the WHOLE file, so overriding one aircraft keeps every other equipment that file defines —
// which is what makes creating a same-basename file here safe rather than destructive, and is the property
// most of the checks below are spent on.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airmiss-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "AM" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
// TWO aircraft in one file — the second one is how "the seed brought the whole file" is proved.
const PLANES = [
  "equipments = {",
  "\tbm_fighter_equipment = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t\ttype = { fighter }",
  "\t\tgroup_by = archetype",
  "\t\tinterface_category = interface_category_air",
  "\t\tallow_mission_type = { air_superiority interception }",
  "\t\tair_range = 1000",
  "\t\tmaximum_speed = 400",
  "\t\tbuild_cost_ic = 20",
  "\t\tresources = { aluminium = 2 }",
  "\t}",
  "\tbm_bomber_equipment = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t\ttype = { tactical_bomber }",
  "\t\tgroup_by = archetype",
  "\t\tinterface_category = interface_category_air",
  "\t\tallow_mission_type = { strategic_bomber }",
  "\t\tair_range = 2000",
  "\t\tbuild_cost_ic = 35",
  "\t}",
  "}",
  "",
].join("\n");
const eqDir = (mod) => {
  const d = path.join(mod, "common", "units", "equipment");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};
// Read defensively: when an earlier assertion fails the file may not exist, and throwing here would hide
// every remaining section of this test behind a stack trace — including the checks that say WHY it failed.
const readEq = (mod, f) => {
  try { return fs.readFileSync(path.join(mod, "common", "units", "equipment", f), "utf8"); }
  catch (_) { return ""; }
};
function blockOf(txt, id) {
  const m = new RegExp("(^|\\n)\\s*" + id + "\\s*=\\s*\\{").exec(txt);
  if (!m) return null;
  const open = txt.indexOf("{", m.index + m[0].length - 1);
  let d = 0;
  for (let i = open; i < txt.length; i++) {
    const c = txt[i];
    if (c === "{") d++; else if (c === "}") { d--; if (!d) return txt.slice(open + 1, i); }
  }
  return null;
}
const missionsOf = (body) => {
  const m = /allow_mission_type\s*=\s*\{([\s\S]*?)\}/.exec(String(body || ""));
  return m ? m[1].trim().split(/\s+/).filter(Boolean).sort() : [];
};

let PORT = 50310;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      set: (b) => fetch("http://127.0.0.1:" + PORT + "/api/equipment/archetype-missions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[a standalone mod] the case that always worked, kept working");
    {
      const solo = mkMod(null);
      fs.writeFileSync(path.join(solo.dir, "common", "units", "equipment", "bm_planes.txt"), PLANES);
      const r = await api.set({ modPath: solo.dir, id: "bm_fighter_equipment", missions: ["air_superiority", "cas"] });
      rec("the edit succeeds", r.ok === true, r);
      const t = readEq(solo.dir, "bm_planes.txt");
      rec("…the roles are what was asked for",
        missionsOf(blockOf(t, "bm_fighter_equipment")).join() === "air_superiority,cas",
        missionsOf(blockOf(t, "bm_fighter_equipment")));
      rec("…and nothing else in the block moved",
        /air_range = 1000/.test(t) && /maximum_speed = 400/.test(t) && /aluminium = 2/.test(t), t.slice(0, 200));
      rec("…and no second file was minted", eqDir(solo.dir).join() === "bm_planes.txt", eqDir(solo.dir));
    }

    console.log("\n[an add-on] can now edit its base mod's aircraft at all");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "bm_planes.txt"), PLANES);
      const addon = mkMod(base.name);
      const r = await api.set({ modPath: addon.dir, id: "bm_fighter_equipment", missions: ["air_superiority", "cas"] });
      rec("the edit succeeds instead of refusing", r.ok === true, r);
      rec("…not with the old 'file not found'", !/Equipment file not found/.test(String(r.error || "")), r);
      rec("…writing into the add-on", eqDir(addon.dir).includes("bm_planes.txt"), eqDir(addon.dir));

      const t = readEq(addon.dir, "bm_planes.txt");
      rec("…with the roles that were asked for",
        missionsOf(blockOf(t, "bm_fighter_equipment")).join() === "air_superiority,cas",
        missionsOf(blockOf(t, "bm_fighter_equipment")));
      // THE POINT OF SEEDING: the file replaces the base mod's by name, so it must carry everything.
      rec("…and the OTHER aircraft in that file carried across", !!blockOf(t, "bm_bomber_equipment"), eqDir(addon.dir));
      rec("…with its own roles untouched",
        missionsOf(blockOf(t, "bm_bomber_equipment")).join() === "strategic_bomber",
        missionsOf(blockOf(t, "bm_bomber_equipment")));
      rec("…and its other fields too", /air_range = 2000/.test(t) && /build_cost_ic = 35/.test(t), t.slice(0, 300));
      rec("…while the base mod is untouched",
        readEq(base.dir, "bm_planes.txt") === PLANES, "the base mod was written to");
    }

    console.log("\n[clearing the roles] still works across the seam");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "bm_planes.txt"), PLANES);
      const addon = mkMod(base.name);
      const r = await api.set({ modPath: addon.dir, id: "bm_fighter_equipment", missions: [] });
      rec("the edit succeeds", r.ok === true, r);
      const t = readEq(addon.dir, "bm_planes.txt");
      rec("…the block no longer restricts its missions",
        missionsOf(blockOf(t, "bm_fighter_equipment")).length === 0, missionsOf(blockOf(t, "bm_fighter_equipment")));
      rec("…and the sibling aircraft is still there", !!blockOf(t, "bm_bomber_equipment"), eqDir(addon.dir));
    }

    console.log("\n[an id nothing supplies] still refused, and said plainly");
    {
      const addon = mkMod(null);
      const r = await api.set({ modPath: addon.dir, id: "no_such_equipment", missions: ["cas"] });
      rec("the edit is refused", r.ok !== true, r);
      rec("…naming the equipment, not a file path", /wasn't found/i.test(String(r.error || "")), r.error);
    }

    console.log("\n[base-game equipment] still off limits");
    {
      const solo = mkMod(null);
      const r = await api.set({ modPath: solo.dir, id: "fighter_equipment", missions: ["cas"] });
      rec("editing vanilla's own equipment is refused", r.ok !== true, r);
    }

    api.stop(); api = null;
    console.log(`\n=== archetype missions inherited: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
