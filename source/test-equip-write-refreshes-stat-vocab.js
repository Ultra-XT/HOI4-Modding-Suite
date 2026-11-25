// #equipment-write-leaves-stat-vocab-stale — NOVA REFUSED A STAT THE USER HAD JUST CREATED.
//
// An upgrade's stats are checked against a vocabulary harvested from the mod's own common/units and
// common/units/equipment (plus the game's and the dependencies'). If a stat is not in it, saving the upgrade
// warns: "HOI4 doesn't know the stat …".
//
// upgradeStatVocabCache held that vocabulary and was NEVER invalidated — no delete, no clear, no TTL, no
// fingerprint. Keyed on the root list and frozen for the life of the process. So a stat introduced by an
// archetype saved THIS session was absent from it, and saving an upgrade that used that stat was told the
// name does not exist: Nova refusing the user's own work on the basis of a list built before they did it,
// until the app was restarted.
//
// Three equipment writers already dropped equipScanCache. The vocabulary reads the same files and none of
// them touched it. Both now go through one invalidateEquipmentCaches(), rather than a second .delete()
// beside each of the three — a fourth writer added later cannot clear one and forget the other, which is
// exactly how this pair came apart.
//
// ⚠️ The clear sits inside a try/catch, and the cache it clears is declared ~19k lines later in the same
// scope. That is fine at call time, but a silent catch is how a fix ends up doing nothing, so the check
// below is behavioural: it drives the real endpoints and reads the real warning.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vocab-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "vocabmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="VocabMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "vocabmod.mod"), 'name="VocabMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
// ⚠️ /api/equipment/save EDITS existing equipment — it answered "Equipment … wasn't found" for an id that
// did not exist yet. So the archetype has to be here first, declaring only ordinary stats; the save below
// is what ADDS the novel one, and that save is one of the three writers that must invalidate the caches.
fs.writeFileSync(path.join(MOD, "common", "units", "equipment", "zz_nova_vocab.txt"),
  "equipments = {\n\tnova_vocab_archetype = {\n\t\tis_archetype = yes\n\t\tyear = 1936\n" +
  "\t\tarmor_value = 10\n\t\treliability = 0.8\n\t}\n}\n");

const PORT = 53211;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    // A stat name nothing in vanilla declares, so it can only become known by this mod declaring it.
    const NOVEL = "nova_experimental_thrust";
    // public/army.js:3054 posts { modPath, id, abbreviation, cost, max_level, stats }.
    const upgrade = () => post("/api/equipment/upgrade", {
      modPath: MOD, id: "nova_test_upgrade", abbreviation: "nte", cost: "land", max_level: 5,
      stats: { [NOVEL]: 0.1 },
    });

    console.log("\n[CONTROL] before the mod declares it, the stat really is unknown");
    {
      const r = await upgrade();
      const w = String((r.body && (r.body.statWarning || r.body.refWarning)) || "");
      console.log(`     warning: ${JSON.stringify(w.slice(0, 120))}`);
      // ⚠️ If this does NOT warn, the vocabulary check is inert here and everything below is vacuous —
      // most likely because the harvest found fewer than 20 names and bailed.
      rec("an undeclared stat is warned about", new RegExp(NOVEL).test(w), w || "(silent — vocabulary may be empty)");
    }

    console.log("\n[the defect] declaring it in this session must make it known");
    {
      // Write an archetype that declares the stat, through the real equipment save.
      // ⭐ A CREATE, not an edit. /api/equipment/save overlays onto EXISTING equipment and filters to
      // stats it models, so it never introduced the novel name. chassis-new writes a new archetype and its
      // tier outright, baseStats and all — and it turned out to invalidate NOTHING, which is how the fourth
      // writer was found.
      const eq = await post("/api/equipment/chassis-new", {
        modPath: MOD, id: "nova_vocab_chassis", name: "Nova Vocab Chassis", domain: "armor", type: "armor",
        picture: "", priority: 100, year: 1936,
        slots: [{ name: "main_armament_slot", required: true, categories: ["tank_medium_main_armament"] }],
        baseStats: { [NOVEL]: 1, build_cost_ic: 10 },
      });
      console.log(`     chassis create: status=${eq.status} ${eq.body && eq.body.error ? eq.body.error : "ok"}`);
      rec("the chassis create succeeds", eq.status < 400 && eq.body && !eq.body.error, eq.body);
      const onDisk = (() => {
        try {
          return fs.readdirSync(path.join(MOD, "common", "units", "equipment"))
            .some((f) => fs.readFileSync(path.join(MOD, "common", "units", "equipment", f), "utf8").includes(NOVEL));
        } catch (_) { return false; }
      })();
      rec("…and the stat really is in the mod's files now", onDisk, "the fixture never declared the stat");

      const r = await upgrade();
      const w = String((r.body && (r.body.statWarning || r.body.refWarning)) || "");
      console.log(`     warning after declaring: ${JSON.stringify(w.slice(0, 120)) || '""'}`);
      // THE BUG: still warned, because the vocabulary was built before the archetype existed and never
      // rebuilt for the life of the process.
      rec("the stat is no longer reported unknown", !new RegExp(NOVEL).test(w), w);
    }

    console.log("\n[⭐ one invalidator] both caches must be dropped from a single place");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the shared invalidator exists", /function invalidateEquipmentCaches\(/.test(sv), "not found");
      // Derived: no writer may still drop only the scan cache. Exactly ONE equipScanCache.delete may remain
      // — the one inside the invalidator itself.
      const deletes = (sv.match(/equipScanCache\.delete\(/g) || []).length;
      console.log(`     equipScanCache.delete( occurrences: ${deletes} (1 = only inside the invalidator)`);
      rec("no writer drops the scan cache directly any more", deletes === 1, deletes);
      const callers = (sv.match(/invalidateEquipmentCaches\(/g) || []).length - 1; // minus the definition
      console.log(`     invalidateEquipmentCaches( call sites: ${callers}`);
      rec("…and every writer goes through the invalidator", callers >= 3, callers);
      rec("…which clears the stat vocabulary too", /upgradeStatVocabCache\.clear\(\)/.test(sv), "vocabulary never cleared");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== equip write refreshes stat vocab: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
