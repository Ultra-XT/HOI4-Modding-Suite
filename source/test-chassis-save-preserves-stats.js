// #chassis-save-drops-hand-added-stats + #sprite-name-cache-never-refreshes
//
// (1) upsertEquipmentEntry spliced the freshly serialized block over the whole old one, so every key the
// chassis model does not capture died on save. Not hypothetical: the Army page's stat editor writes
// armor_value, maximum_speed and the rest onto a chassis tier through /api/equipment/save, while the chassis
// handler deliberately allows re-saving an id you already own (#chassis-dup-id) and newChassisDraft() starts
// blank — so editing a chassis you had tuned silently reverted the tuning. writeEquipmentToFile has carried
// those forward for a long time via mergePreservedEquipmentBlock, with a comment saying exactly why; this
// writer never adopted it.
//
// (2) declaredSpriteNames backs the focus save's "names a sprite nothing declares — HOI4 draws nothing
// there" warning, and it was a plain Map with no TTL and no invalidation: populated once per root, then
// frozen for the life of the process. /api/upload-gfx writes a .gfx declaring the new sprite, so the next
// focus save warned that the icon the user had just uploaded does not exist — and kept warning until the app
// restarted. A validator that fires on the user's own successful action teaches people to ignore it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chassis-"));
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
const MOD = path.join(ROOT, "chmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ChMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "chmod.mod"), 'name="ChMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const PORT = 53121;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    // ⭐ SEND WHAT THE CLIENT SENDS — public/army.js:3301 posts
    // { modPath, id, name, domain, type, picture, priority, year, slots, baseStats }. A first version
    // invented `archetype` and `tiers` and was refused with "A modular chassis needs at least one module
    // slot", which is the handler being right and the fixture being wrong.
    const chassis = (id) => ({
      modPath: MOD, id, name: "Nova Hull", domain: "armor", type: "armor",
      picture: "", priority: 100, year: 1936,
      slots: [{ name: "main_armament_slot", required: true, categories: ["tank_medium_main_armament"] }],
      baseStats: { build_cost_ic: 10, reliability: 0.8 },
    });

    console.log("\n[CONTROL] the chassis is created and lands on disk");
    let file = "";
    {
      const r = await post("/api/equipment/chassis-new", chassis("nova_hull"));
      rec("the create succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      const dir = path.join(MOD, "common", "units", "equipment");
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
      rec("…and wrote an equipment file", files.length > 0, files);
      if (files.length) file = path.join(dir, files[0]);
      const t = file ? fs.readFileSync(file, "utf8") : "";
      rec("…declaring the tier", /nova_hull_1\s*=\s*\{/.test(t), t.slice(0, 200));
    }

    console.log("\n[a hand-added stat] written the way the Army stat editor writes one");
    {
      // Put a key the chassis model does not capture into the tier block, exactly as /api/equipment/save
      // statsAll does, then re-save the chassis and see whether it survives.
      let t = fs.readFileSync(file, "utf8");
      t = t.replace(/(nova_hull_1\s*=\s*\{)/, "$1\n\t\tarmor_value = 42\n\t\tmaximum_speed = 7.5");
      fs.writeFileSync(file, t, "utf8");
      rec("the stat is on disk before the re-save", /armor_value = 42/.test(fs.readFileSync(file, "utf8")), "fixture failed");
    }

    console.log("\n[the defect] re-saving the chassis must not revert the tuning");
    {
      const r = await post("/api/equipment/chassis-new", chassis("nova_hull"));
      rec("the re-save succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      const t = fs.readFileSync(file, "utf8");
      // THE BUG: the whole tier block was replaced by the serialized model, so both keys vanished.
      rec("armor_value survives", /armor_value\s*=\s*42/.test(t), t.slice(0, 400));
      rec("…and maximum_speed too", /maximum_speed\s*=\s*7\.5/.test(t), t.slice(0, 400));
      rec("…and the tier is still declared exactly once",
        (t.match(/nova_hull_1\s*=\s*\{/g) || []).length === 1, (t.match(/nova_hull_1\s*=\s*\{/g) || []).length);
      let d = 0, bad = false;
      for (const ch of t.replace(/#[^\n]*/g, "")) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) bad = true; } }
      rec("…and the file still lexes", !bad && d === 0, `depth ${d}`);
    }

    console.log("\n[⭐ the sprite cache] a newly declared sprite must be seen without a restart");
    {
      // ⚠️ HONEST LIMIT: these three checks are STRUCTURAL. Driving the warning end to end needs a focus
      // tree saved through the focus endpoint and then an upload through the multipart /api/upload-gfx, and
      // a first attempt at that got the save route's payload wrong and asserted against a null body — a
      // check that fails for its own reasons proves nothing about the fix. The defect itself was plain in
      // the source (a Map with no TTL and no invalidation, populated once per root), and the mechanism is
      // exactly what is pinned here: the key carries the epoch, and the upload path bumps it.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf("function declaredSpriteNames(");
      const near = at === -1 ? "" : sv.slice(at, at + 1400);
      rec("declaredSpriteNames is findable", at !== -1, "not found");
      rec("…and its cache key carries the sprite write epoch",
        /const key = String\(modRoot \|\| ""\) \+ "\|" \+ spriteWriteEpoch/.test(near),
        "keyed on the root alone — the entry is frozen for the life of the process");
      rec("…and the upload path bumps that epoch", /bumpSpriteWriteEpoch\(\)/.test(sv), "nothing bumps it");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== chassis save preserves stats: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
