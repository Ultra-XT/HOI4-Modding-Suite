// #subunit-palette-ignores-same-filename — WHICH ROOT OWNS EACH FILENAME, NOT JUST EACH KEY.
//
// The Division Template Designer's battalion palette merged common/units/*.txt across mod → dependencies →
// vanilla and kept the first definition of each KEY. It never asked which root last ships each FILENAME.
// HOI4 replaces a common/ file wholesale when a later-loading root ships one at the same relative path, so
// every sub_unit that lived only in a vanilla file the mod shadows is dead in game — and the palette went on
// offering it as a brush to drop into a division template. A phantom is indistinguishable from a real entry.
//
// Measured on Novum Vexillum's real common/units (42 files, 37 of them shadowing a vanilla basename, and NO
// replace_path): 61 dead vanilla battalions, all 61 offered. Rise of Nations shadows 38 files (11 dead), The
// Road to 56 shadows 10 (0 dead). Millennium Dawn and Old World Blues declare replace_path and were already
// handled by the sibling rule.
//
// The endpoint's own comment says why it matters: "Offering vanilla's infantry / motorized alongside them let
// a division template be built out of sub-units the game does not have." It honoured a declared replace_path
// and never the filename rule.
//
// Nova already models the filename rule twice in this file — collectAllEquipments (#equip-same-filename) for
// common/units/equipment, a subdirectory of this very folder, and the technology catalogue. Third caller.
//
// ⚠️ The ordering is inverted between them: those two walk lowest-priority-first and keep the HIGHEST index,
// while this endpoint's root list is already highest-priority-first, so the owner is the LOWEST. Getting that
// backwards keeps vanilla's file and drops the mod's — which is why the mod's own content is asserted below
// in every case, not just the counts.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-supal-"));
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
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "SU" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "units"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const bat = (key) => [
  "\t" + key + " = {",
  "\t\tsprite = infantry",
  "\t\tmap_icon_category = infantry",
  "\t\tpriority = 500",
  "\t\tactive = yes",
  "\t\ttype = { infantry }",
  "\t\tgroup = infantry",
  "\t\tcombat_width = 2",
  "\t\tneed = { infantry_equipment = 100 }",
  "\t\tmanpower = 1000",
  "\t}",
].join("\n");
const unitsFile = (keys) => "sub_units = {\n" + keys.map(bat).join("\n") + "\n}\n";

let PORT = 49910;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      subunits: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/subunits?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(GAME)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] which installed mods shadow a vanilla common/units filename");
    let victimFile = "", victimKeys = [];
    {
      const vd = path.join(GAME, "common", "units");
      const vFiles = fs.readdirSync(vd).filter((f) => /\.txt$/i.test(f));
      // Pick a vanilla file with several battalions, so the loss is measurable rather than a single key.
      for (const f of vFiles) {
        const keys = [...fs.readFileSync(path.join(vd, f), "latin1").replace(/#.*$/gm, "")
          .matchAll(/(?:^|\n)\t([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g)].map((m) => m[1]);
        if (keys.length > victimKeys.length) { victimFile = f; victimKeys = keys; }
      }
      console.log(`  vanilla's biggest common/units file is ${victimFile} with ${victimKeys.length} battalions`);
      rec("fixture: there is a real vanilla file to shadow", victimKeys.length >= 5, { victimFile, n: victimKeys.length });

      const ws = "D:/SteamLibrary/steamapps/workshop/content/394360";
      if (fs.existsSync(ws)) {
        const rows = [];
        for (const d of fs.readdirSync(ws)) {
          const ud = path.join(ws, d, "common", "units");
          if (!fs.existsSync(ud)) continue;
          let nm = d, rp = false;
          try {
            const t = fs.readFileSync(path.join(ws, d, "descriptor.mod"), "utf8");
            nm = (/\bname\s*=\s*"(.*?)"/.exec(t) || [, d])[1];
            rp = /replace_path\s*=\s*"common\/units"/.test(t);
          } catch (_) {}
          let shadowed = 0;
          try { shadowed = fs.readdirSync(ud).filter((f) => /\.txt$/i.test(f) && vFiles.some((v) => v.toLowerCase() === f.toLowerCase())).length; } catch (_) {}
          if (shadowed) rows.push(`${nm}: shadows ${shadowed}${rp ? " (declares replace_path, already handled)" : ""}`);
        }
        console.log(rows.length ? "  " + rows.join("\n  ") : "  (no workshop mod shadows one)");
      }
    }

    api = await serve(createApp());

    console.log("\n[control] a mod whose filename collides with nothing changes nothing");
    const plain = mkMod(null);
    fs.writeFileSync(path.join(plain.dir, "common", "units", "zz_mine.txt"), unitsFile(["zz_own_bat"]));
    const baseline = await api.subunits(plain.dir);
    rec("the endpoint answers", baseline.ok === true, baseline);
    rec("…offering vanilla's battalions", baseline.count > 50, baseline.count);
    rec("…and the mod's own", baseline.subunits.some((s) => s.key === "zz_own_bat"), "own battalion missing");
    rec("…including the ones in the file we are about to shadow",
      victimKeys.every((k) => baseline.subunits.some((s) => s.key === k)), victimKeys.slice(0, 4));

    console.log("\n[the mod ships that filename] vanilla's copy stops being offered");
    {
      const mod = mkMod(null);
      fs.writeFileSync(path.join(mod.dir, "common", "units", victimFile), unitsFile(["zz_replacement_bat"]));
      const r = await api.subunits(mod.dir);
      rec("the endpoint answers", r.ok === true, r);
      rec("…and the mod's own battalion IS offered", r.subunits.some((s) => s.key === "zz_replacement_bat"), "own battalion dropped");
      const survivors = victimKeys.filter((k) => r.subunits.some((s) => s.key === k));
      rec(`…while none of ${victimFile}'s ${victimKeys.length} vanilla battalions are`, survivors.length === 0, survivors.slice(0, 6));
      rec("…and the count really moved", r.count < baseline.count, { before: baseline.count, after: r.count });
      rec("…without emptying the palette", r.count > 20, r.count);
    }

    console.log("\n[a dependency ships it] the base mod shadows vanilla, and the add-on shadows the base");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "units", victimFile), unitsFile(["zz_base_bat"]));
      const addon = mkMod(base.name);
      const r1 = await api.subunits(addon.dir);
      rec("an add-on sees the BASE MOD's battalion", r1.subunits.some((s) => s.key === "zz_base_bat"), "base battalion missing");
      rec("…and not vanilla's from the file the base replaced",
        victimKeys.every((k) => !r1.subunits.some((s) => s.key === k)),
        victimKeys.filter((k) => r1.subunits.some((s) => s.key === k)).slice(0, 4));

      fs.writeFileSync(path.join(addon.dir, "common", "units", victimFile), unitsFile(["zz_addon_bat"]));
      const r2 = await api.subunits(addon.dir);
      rec("…and its own file beats the base mod's", r2.subunits.some((s) => s.key === "zz_addon_bat"), "own battalion missing");
      rec("…so the base's battalion from that filename is gone too",
        !r2.subunits.some((s) => s.key === "zz_base_bat"), "base battalion still offered");
    }

    console.log("\n[replace_path] the rule that already worked still does");
    {
      const mod = mkMod(null);
      fs.writeFileSync(path.join(mod.dir, "descriptor.mod"),
        'name="SUrp"\nsupported_version="1.19.*"\nreplace_path="common/units"\n');
      fs.writeFileSync(path.join(ROOT, "surp.mod"),
        'name="SUrp"\npath="' + toPosix(mod.dir) + '"\nsupported_version="1.19.*"\n');
      fs.writeFileSync(path.join(mod.dir, "common", "units", "zz_only.txt"), unitsFile(["zz_only_bat"]));
      const r = await api.subunits(mod.dir);
      rec("a declared replace_path still collapses to the mod's own",
        r.count === 1 && r.subunits[0].key === "zz_only_bat", { count: r.count, keys: (r.subunits || []).map((s) => s.key).slice(0, 4) });
    }

    api.stop(); api = null;
    console.log(`\n=== subunit palette same filename: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
