// #raw-number-interpolation — A BIG NUMBER FROM A FORM BOX BROKE THE FILE IT WAS WRITTEN INTO.
//
// JavaScript renders any number >= 1e21 in exponential form ("1e+21"), and Clausewitz cannot lex that: the
// block containing it stops parsing. formatHoi4Number exists for this and clamps to 1e18; pdxCoordinate is
// the signed 1e6 version for positions.
//
// Four writers interpolated a raw number anyway, each sitting beside a line that already formatted:
//   the focus tree's selection weight — <input type="number" min="1"> with no max, and the endpoint checks
//     only finite-and-at-least-1, so `country = { factor = 1e+21 }` reached the file and the tree lost its
//     ownership entirely
//   an MIO trait's position — mioBonusLines directly above it formats, and says why
//   an equipment upgrade's max_level — the stats loop two lines down formats
//   a chassis's priority — normalised with a floor of 0 and no ceiling
//
// ⭐ THE LAST CHECK IS A SWEEP, NOT A LIST. After driving the writers, every file Nova wrote is scanned for
// exponential notation. Enumerating the four sites would pin these four; scanning what landed on disk
// catches the fifth.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pdxnum-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp, setFocusTreeOwnership } = require("./server.js");

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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "numbermod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "military_industrial_organization", "organizations"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NumberMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "numbermod.mod"), 'name="NumberMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
// /api/equipment/upgrade edits an existing archetype's neighbourhood; give it something real to sit beside.
fs.writeFileSync(path.join(MOD, "common", "units", "equipment", "zz_nova_base.txt"),
  "equipments = {\n\tnova_num_archetype = {\n\t\tis_archetype = yes\n\t\tyear = 1936\n\t\tarmor_value = 10\n\t}\n}\n");

// A value every one of these boxes will hand over: <input type="number"> accepts scientific notation.
const HUGE = 1e21;
const EXP = /=\s*-?\d*\.?\d+[eE][+-]?\d+/;

const PORT = 53257;
(async () => {
  let srv = null;
  try {
    console.log("\n[the focus tree's selection weight]");
    {
      const TREE = "focus_tree = {\n\tid = nova_num_tree\n\tfocus = {\n\t\tid = nova_num_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n}\n";
      const w = (opts) => {
        const r = setFocusTreeOwnership(TREE, opts);
        return typeof r === "string" ? r : (r && r.text) || String(r);
      };
      // ⚠️ CONTROL FIRST: if an ordinary weight does not appear, the fixture is wrong and the rest is vacuous.
      const ok = w({ treeId: "nova_num_tree", tag: "GER", weight: 10 });
      rec("an ordinary weight is written as itself", /add = 10\b/.test(ok), ok.slice(0, 260));

      const big = w({ treeId: "nova_num_tree", tag: "GER", weight: HUGE });
      const shared = w({ treeId: "nova_num_tree", shared: true, weight: HUGE });
      console.log(`     ${(big.match(/add = [^\s\n]+/) || ["(none)"])[0]}   ${(shared.match(/factor = [^\s\n]+/) || ["(none)"])[0]}`);
      rec("a huge weight is not written as an exponent", !EXP.test(big) && !EXP.test(shared),
        { add: (big.match(/add = [^\s\n]+/) || [])[0], factor: (shared.match(/factor = [^\s\n]+/) || [])[0] });
      rec("…and what it writes still lexes as a PDX number",
        /add = -?\d+(?:\.\d+)?\s/.test(big + " "), (big.match(/add = [^\s\n]+/) || [])[0]);
    }

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    console.log("\n[an equipment upgrade's max_level]  public/army.js:3054 posts { modPath, id, abbreviation, cost, max_level, stats }");
    {
      const r = await post("/api/equipment/upgrade", {
        modPath: MOD, id: "nova_num_upgrade", abbreviation: "nnu", cost: "land",
        max_level: HUGE, stats: { armor_value: 0.1 },
      });
      console.log(`     -> ${r.status} ${r.body && r.body.error ? r.body.error : "ok"}`);
      rec("the upgrade saves", r.status < 400 && r.body && !r.body.error, r.body);
    }

    console.log("\n[a chassis's priority]  public/army.js:3297 posts the chassis creator's form");
    {
      const r = await post("/api/equipment/chassis-new", {
        modPath: MOD, id: "nova_num_chassis", name: "Nova Number Chassis", domain: "armor", type: "armor",
        picture: "", priority: HUGE, year: 1936,
        slots: [{ name: "main_armament_slot", required: true, categories: ["tank_medium_main_armament"] }],
        baseStats: { build_cost_ic: 10 },
      });
      console.log(`     -> ${r.status} ${r.body && r.body.error ? r.body.error : "ok"}`);
      rec("the chassis saves", r.status < 400 && r.body && !r.body.error, r.body);
    }

    console.log("\n[an MIO trait's position]  public/mio-editor.js:583 posts x/y per trait");
    {
      const r = await post("/api/mio", {
        modPath: MOD, id: "nova_num_mio", name: "Nova Number MIO", desc: "", allowedTag: "GER",
        icon: "", fileName: "nova_mio.txt", equipmentType: ["infantry_equipment"], researchCategories: [], include: [],
        initial: { equipmentBonus: {}, productionBonus: {} },
        traits: [{ token: "nova_num_trait", name: "Nova Number Trait", x: HUGE, y: -HUGE,
          relativeTo: "", icon: "", parents: [], equipmentBonus: {}, productionBonus: {} }],
        writeIdeaFallback: false, companyType: "", previousId: "",
      });
      console.log(`     -> ${r.status} ${r.body && r.body.error ? r.body.error : "ok"}`);
      rec("the organization saves", r.status < 400 && r.body && !r.body.error, r.body);
    }

    console.log("\n[⭐ THE SWEEP] nothing Nova wrote may contain exponential notation");
    {
      const files = [];
      const walk = (d) => {
        let e = [];
        try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        for (const x of e) {
          const f = path.join(d, x.name);
          if (x.isDirectory()) { walk(f); continue; }
          if (/\.(txt|gfx|gui|yml)$/i.test(x.name)) files.push(f);
        }
      };
      walk(MOD);
      console.log(`     ${files.length} files written into the mod`);
      // ⚠️ If nothing was written the sweep proves nothing.
      rec("the writers actually produced files", files.length >= 3, files.map((f) => path.relative(MOD, f)));

      const offenders = [];
      for (const f of files) {
        let t = "";
        try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
        for (const line of t.split(/\r?\n/)) {
          if (EXP.test(line)) offenders.push(`${path.relative(MOD, f)}: ${line.trim().slice(0, 90)}`);
        }
      }
      for (const o of offenders.slice(0, 8)) console.log(`     ${o}`);
      rec("no file carries an exponent Clausewitz cannot read", offenders.length === 0, offenders.slice(0, 8));

      // …and the huge values really did reach those files, so the sweep had something to catch.
      const all = files.map((f) => { try { return fs.readFileSync(f, "utf8"); } catch (_) { return ""; } }).join("\n");
      rec("…and the writers did record the large values (the sweep was not looking at empty files)",
        /max_level = \d{6,}/.test(all) || /priority = \d{6,}/.test(all) || /x=-?\d{4,}/.test(all),
        all.slice(0, 400));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== pdx numbers never exponential: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
