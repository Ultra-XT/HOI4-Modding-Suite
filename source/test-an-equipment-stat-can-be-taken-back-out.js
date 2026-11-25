// ⛔ #equipment-stat-cannot-be-removed — A SAVE REPORTED SUCCESS FOR A CHANGE IT DID NOT MAKE.
//
// test-cleared-fields-clear.js recorded this as a known limitation and called it "a feature rather than a
// fix": a blank field is omitted by the client and the server overlays, so blank means "unchanged" and no
// payload could take an extra stat back out. Measured before the fix — omitting the key, sending "" and
// sending null all left `armor_value` on disk, and all three answered ok:true. The editor showed "✓ Saved"
// each time. A silent no-op reported as success is worse than a missing control.
//
// It has an in-game meaning, which is what makes it worth a control rather than a shrug. An ABSENT stat
// inherits the archetype's value; an explicit `armor_value = 0` forces zero. So the nearest thing a stuck
// modder could do writes something that means something else, and Nova offered no way back.
//
// ⚠️ THE OLD RULE IS DELIBERATELY KEPT, and the first section pins it. "Blank means unchanged" exists
// because the specialized gear views (missiles, drones) hide most inputs, and a blank they never rendered
// must not wipe a stat they never showed. The new control is EXPLICIT — the client names the key — and the
// client only ever names one whose input it actually rendered and the user actually emptied.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqclear-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const MOD = path.join(ROOT, "eqclear_mod");
const EQDIR = path.join(MOD, "common", "units", "equipment");
fs.mkdirSync(EQDIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'version="1"\nname="eqclear_mod"\nsupported_version="1.19.*"\n', "utf8");
const EQFILE = path.join(EQDIR, "probe_equipment.txt");
const ORIGINAL =
  "equipments = {\n" +
  "\tprobe_tank_equipment = {\n" +
  "\t\tyear = 1936\n" +
  "\t\tarchetype = probe_tank_chassis\n" +
  "\t\tbuild_cost_ic = 4\n" +
  "\t\tdefense = 10\n" +
  "\t\tarmor_value = 5\n" +
  "\t\tmaximum_speed = 8\n" +
  "\t\tdefault_modules = {\n" +
  "\t\t\tmain_armament_slot = tank_heavy_cannon\n" +
  "\t\t}\n" +
  "\t}\n" +
  "}\n";
const reset = () => fs.writeFileSync(EQFILE, ORIGINAL, "utf8");

const statOf = (key) => {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, "m").exec(fs.readFileSync(EQFILE, "utf8"));
  return m ? m[1] : "(absent)";
};
const hasBlock = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\{`, "m").test(fs.readFileSync(EQFILE, "utf8"));

const PORT = 42573;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const save = async (extra) => {
      const body = Object.assign({
        modPath: MOD, id: "probe_tank_equipment", name: "Probe Tank", year: "1936",
        build_cost_ic: "4", defense: "10",
      }, extra);
      const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      // READ THE RESPONSE FIRST. A rejected save leaves the file untouched, which looks exactly like
      // "the stat could not be removed" — the right bytes, the wrong conclusion.
      if (!r.ok || !d.ok) throw new Error(`save rejected (${r.status}): ${d.error || "?"}`);
      return d;
    };

    console.log("\n-- POSITIVE CONTROL: the save path works at all --");
    {
      reset();
      await save({ statsAll: { armor_value: 9, maximum_speed: 8 } });
      ok(statOf("armor_value") === "9", "an edited stat really is written", statOf("armor_value"));
    }

    console.log("\n-- the old rule is KEPT: blank still means unchanged --");
    {
      for (const [label, sa] of [
        ["omitting the key", { maximum_speed: 8 }],
        ["sending an empty string", { armor_value: "", maximum_speed: 8 }],
        ["sending null", { armor_value: null, maximum_speed: 8 }],
      ]) {
        reset();
        await save({ statsAll: sa });
        ok(statOf("armor_value") === "5", `${label} leaves the stat alone`, statOf("armor_value"));
      }
    }

    console.log("\n-- ⭐ THE CONTROL: naming the key takes the stat back out --");
    {
      reset();
      await save({ statsAll: { maximum_speed: 8 }, clearStats: ["armor_value"] });
      ok(statOf("armor_value") === "(absent)", "the cleared stat is gone", statOf("armor_value"));
      ok(statOf("maximum_speed") === "8", "…and its neighbour is untouched", statOf("maximum_speed"));
      ok(statOf("defense") === "10", "…as are the core stats", statOf("defense"));
      ok(hasBlock("default_modules"), "…and the hand-written block is still preserved");
    }

    console.log("\n-- what the control must REFUSE --");
    {
      reset();
      await save({ statsAll: { maximum_speed: 8 }, clearStats: ["default_modules"] });
      ok(hasBlock("default_modules"), "a BLOCK is never removed by naming it — a typo must not delete a sub-block");

      reset();
      await save({ statsAll: { armor_value: 7 }, clearStats: ["armor_value"] });
      ok(statOf("armor_value") === "7", "setting and clearing the same key writes the value — a set beats a clear", statOf("armor_value"));

      reset();
      await save({ statsAll: { maximum_speed: 8 }, clearStats: ["archetype"] });
      ok(statOf("archetype") === "probe_tank_chassis", "archetype is not a stat box and cannot be cleared this way", statOf("archetype"));

      reset();
      await save({ statsAll: { maximum_speed: 8 }, clearStats: ["armor_value; rm -rf", "", null, 7] });
      ok(statOf("armor_value") === "5", "a key that is not an identifier is ignored, not guessed at", statOf("armor_value"));
    }

    console.log("\n-- the editor actually sends it --");
    {
      // Anchored on the smallest thing that carries the meaning: the signal is "rendered with a value, now
      // empty", and defaultValue is what makes that knowable. A view that never renders the input cannot
      // produce it, which is how the hidden-input rule survives without a check of its own.
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const army = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));
      ok(army.includes("defaultValue"), "the save reads what the box was RENDERED with, not just what it holds");
      ok(/body\.clearStats\s*=\s*clearStats/.test(army), "…and puts the cleared keys on the payload");
      ok(army.includes("clearStats.push("), "…collected as the box is read");
    }

    console.log(`\n=== an equipment stat can be taken back out: ${pass} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
  } catch (e) {
    console.log("THREW " + (e && e.stack ? e.stack : e));
    fails.push("threw");
  } finally {
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    process.exit(fails.length ? 1 : 0);
  }
});
