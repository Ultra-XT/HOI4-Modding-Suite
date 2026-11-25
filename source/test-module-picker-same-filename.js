// #module-picker-ignores-same-filename — WHICH ROOT OWNS EACH FILENAME, NOT JUST EACH ID.
//
// scanEquipmentModules merged per ID across roots and never asked which root last ships each FILENAME. HOI4
// loads only the LAST copy of a common/ file at a given relative path, so a mod shipping its own copy of a
// vanilla modules file kills every module vanilla defined there that the mod does not redefine — and the
// equipment designer went on offering them. Picking one writes a create_equipment_variant referencing a
// module that does not exist in the player's game.
//
// Measured on vanilla's biggest modules file: a mod shipping its own 00_ship_modules.txt containing ONE
// module left 116 of that file's 117 entries still on the palette. The picker's total went 313 → 197 once
// the rule was applied.
//
// Fixed in the SCANNER rather than the endpoint, because three callers share it — the designer's module
// list and two variant paths that resolve a module by id. A picker that offers a phantom and a writer that
// accepts one are the same bug from two ends.
//
// ⚠️ TWO TRAPS, both of which this test is shaped around:
//
//  1. ORDERING. `roots` is [gameRoot, …deps, modRoot] — LOAD order, lowest priority FIRST — so the owner is
//     the HIGHEST index. The battalion palette (#subunit-palette-ignores-same-filename) applies the same
//     rule to a list built the other way round and takes the LOWEST. Backwards here keeps vanilla's file
//     and silently drops the mod's own modules, while the totals still look plausible — so every case below
//     asserts the mod's OWN module survives, not just that the count moved.
//
//  2. THE CORPUS READER. Extracting the ids by guessing indentation produced 470 things that were not module
//     ids, and only the control caught it: it claimed 0 of them were offered for a mod that shadows nothing,
//     which cannot be true. The ids are walked by braces here, and `limit` — the has_dlc gate key, not a
//     module — is excluded because the scanner rightly does not treat it as one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modpick-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const VMOD = path.join(GAME, "common", "units", "equipment", "modules");
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(opts) {
  const o = opts || {};
  const n = "MP" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "units", "equipment", "modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n'
    + (o.deps ? 'dependencies={ "' + o.deps + '" }\n' : "")
    + (o.replace ? 'replace_path="common/units/equipment/modules"\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
// Top-level keys inside every `equipment_modules = { … }` wrapper, walked by braces so indentation cannot
// mislead. `limit` is the has_dlc gate, not a module.
function moduleIdsIn(text) {
  const src = String(text).replace(/#.*$/gm, "");
  const out = [];
  const wrapRe = /equipment_modules\s*=\s*\{/g;
  let wm;
  while ((wm = wrapRe.exec(src)) !== null) {
    const open = src.indexOf("{", wm.index);
    let d = 0, close = -1;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === "{") d++;
      else if (c === "}") { d--; if (!d) { close = i; break; } }
    }
    if (close === -1) break;
    const inner = src.slice(open + 1, close);
    wrapRe.lastIndex = close + 1;
    let depth = 0, m;
    const keyRe = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{|\{|\}/g;
    while ((m = keyRe.exec(inner)) !== null) {
      if (m[0] === "}") { depth--; continue; }
      if (m[0] === "{") { depth++; continue; }
      if (depth === 0 && m[1] !== "limit") out.push(m[1]);
      depth++;
    }
  }
  return out;
}
const MOD_ONE = (id) => "equipment_modules = {\n\t" + id
  + " = {\n\t\tcategory = ship_heavy_battery\n\t\tgui_category = ship_gui_heavy_battery\n\t\tadd_stats = { hg_attack = 1 }\n\t}\n}\n";
const putModules = (mod, file, id) =>
  fs.writeFileSync(path.join(mod, "common", "units", "equipment", "modules", file), MOD_ONE(id));

let PORT = 50370;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      modules: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/equipment/modules?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(VMOD)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] the file a mod is most likely to shadow");
    let victim = "", victimIds = [];
    for (const f of fs.readdirSync(VMOD).filter((x) => x.endsWith(".txt"))) {
      const ids = moduleIdsIn(fs.readFileSync(path.join(VMOD, f), "latin1"));
      if (ids.length > victimIds.length) { victim = f; victimIds = ids; }
    }
    console.log(`  ${victim} defines ${victimIds.length} modules, e.g. ${victimIds.slice(0, 3).join(", ")}`);
    rec("fixture: there is a real vanilla modules file to shadow", victimIds.length > 20, { victim, n: victimIds.length });

    api = await serve(createApp());

    console.log("\n[control] a mod that shadows nothing sees everything");
    const plain = mkMod({});
    putModules(plain.dir, "zz_mine.txt", "mp_own_module");
    const base = await api.modules(plain.dir);
    const baseIds = new Set((base.modules || []).map((m) => m.id));
    rec("the endpoint answers", base.ok === true, base);
    rec("…offering its own module", baseIds.has("mp_own_module"), "own module missing");
    // ⭐ This is the check that caught a broken corpus reader. If it fails, the ids are wrong, not the code.
    rec(`…and ALL ${victimIds.length} of ${victim}'s modules`,
      victimIds.every((k) => baseIds.has(k)),
      { missing: victimIds.filter((k) => !baseIds.has(k)).slice(0, 5) });

    console.log("\n[the mod ships that filename] vanilla's copy stops being offered");
    {
      const mod = mkMod({});
      putModules(mod.dir, victim, "mp_only_module");
      const r = await api.modules(mod.dir);
      rec("the endpoint answers", r.ok === true, r);
      rec("…and the mod's OWN module is offered", (r.modules || []).some((m) => m.id === "mp_only_module"),
        "the mod's own module was dropped — the ownership test is inverted");
      const ids = new Set((r.modules || []).map((m) => m.id));
      rec("…while none of the replaced file's modules are",
        victimIds.every((k) => !ids.has(k)), victimIds.filter((k) => ids.has(k)).slice(0, 5));
      rec("…so the count really moved", r.count < base.count, { before: base.count, after: r.count });
      rec("…without emptying the palette", r.count > 20, r.count);
    }

    console.log("\n[a dependency ships it] the base mod shadows vanilla, the add-on shadows the base");
    {
      const b = mkMod({});
      putModules(b.dir, victim, "mp_base_module");
      const addon = mkMod({ deps: b.name });
      const r1 = await api.modules(addon.dir);
      const ids1 = new Set((r1.modules || []).map((m) => m.id));
      rec("the add-on sees the BASE MOD's module", ids1.has("mp_base_module"), "base module missing");
      rec("…and not vanilla's from the file the base replaced",
        victimIds.every((k) => !ids1.has(k)), victimIds.filter((k) => ids1.has(k)).slice(0, 5));

      putModules(addon.dir, victim, "mp_addon_module");
      const r2 = await api.modules(addon.dir);
      const ids2 = new Set((r2.modules || []).map((m) => m.id));
      rec("…and its own file beats the base mod's", ids2.has("mp_addon_module"), "own module missing");
      rec("…so the base's module from that filename is gone too", !ids2.has("mp_base_module"), "base module still offered");
    }

    console.log("\n[replace_path] the rule that already worked still does");
    {
      const mod = mkMod({ replace: true });
      putModules(mod.dir, "zz_only.txt", "mp_replace_module");
      const r = await api.modules(mod.dir);
      rec("a declared replace_path collapses to the mod's own",
        r.count === 1 && (r.modules || [])[0] && r.modules[0].id === "mp_replace_module",
        { count: r.count, ids: (r.modules || []).map((m) => m.id).slice(0, 4) });
    }

    api.stop(); api = null;
    console.log(`\n=== module picker same filename: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
