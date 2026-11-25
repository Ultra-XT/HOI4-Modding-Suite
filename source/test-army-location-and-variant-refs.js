// Two dangling-reference defects on the Army page, both reachable by typing into a free-text box.
//
//  #23 /api/army/naval-air — an air wing's `state` and a fleet's `naval_base` were written with NO existence
//      check. HOI4 silently drops them: the file loads and the units never spawn. Both are plain number
//      inputs with no picker, so 1236 for 12364 sails through. The SAME handler already refuses unknown
//      equipment (#oob-unknown-equipment) — it just never applied the contract to WHERE units are placed.
//      Measured: all 662 air-wing state keys and all 443 fleet naval_base values across vanilla and
//      Millennium Dawn resolve, so the guard adds no false positives on real content.
//
//  #24 /api/army/stockpile — `variant_name` was written verbatim. The only guard lived in the CLIENT, and it
//      self-disables: it checks against a list that is empty whenever the mod has no designs yet or the
//      variants fetch failed, so the state in which a typo is most likely is the state in which nothing
//      checks. Matched by NAME across every country, not by tag — of MD's 3,392 resolvable entries 2,686
//      name the PRODUCER's design, so a per-tag check would refuse real content wholesale.
//
// The naval/air half needs the base game installed to have a map to check against; it asserts that
// explicitly rather than skipping, because a skip reads as a pass.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-armyref-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "armymod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "units"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ArmyMod"\nsupported_version="1.18.*"\n', "utf8");

// A country file carrying one real design, so the stockpile catalogue has something to resolve against.
fs.writeFileSync(path.join(MOD, "history", "countries", "NVA - Novaland.txt"), [
  "capital = 1",
  "",
  "create_equipment_variant = {",
  '\tname = "Nova Rifle Mk1"',
  "\ttype = infantry_equipment_1",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 42447;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ok = (r) => r.status === 200 && r.body && r.body.ok !== false;

  try {
    console.log("\n[#24 stockpile] a design name that exists nowhere must be REPORTED, not refused");
    // Warn rather than block: pinning a stockpile to a design you are about to create is a legitimate order
    // of work. The first version of this guard refused it and broke three of the repo's own fixtures, which
    // is the evidence that it is normal practice rather than an error. The entry hands the country nothing
    // until the design exists, so the user needs telling — they do not need stopping.
    let r = await post("/api/army/stockpile", {
      modPath: MOD, tag: "NVA",
      entries: [{ type: "infantry_equipment_1", amount: 100, variant_name: "A Design That Does Not Exist" }],
    });
    rec("the save still succeeded", ok(r), r.body || r.status);
    rec("…but it carries a warning", !!(r.body && Array.isArray(r.body.warnings) && r.body.warnings.length), r.body);
    rec("…which names the missing design",
      !!(r.body && (r.body.warnings || []).some((w) => /A Design That Does Not Exist/.test(w))), r.body && r.body.warnings);

    console.log("\n[#24 control] the mod's OWN design is accepted");
    // Without this the guard could be "refuse every variant_name", which would break the feature.
    r = await post("/api/army/stockpile", {
      modPath: MOD, tag: "NVA",
      entries: [{ type: "infantry_equipment_1", amount: 100, variant_name: "Nova Rifle Mk1" }],
    });
    rec("a real design name was accepted", ok(r), r.body || r.status);
    rec("…with NO warning", !(r.body && r.body.warnings && r.body.warnings.length), r.body && r.body.warnings);

    console.log("\n[#24 control] an entry with NO design name is unaffected");
    r = await post("/api/army/stockpile", {
      modPath: MOD, tag: "NVA", entries: [{ type: "infantry_equipment_1", amount: 50 }],
    });
    rec("an entry without a variant_name still saves", ok(r), r.body || r.status);

    console.log("\n[#23 fixture control] the map index must actually be populated");
    // If this fails, the base game is not installed and the naval/air checks below cannot mean anything —
    // stated loudly rather than skipped, because a skipped control reads as a pass.
    const realState = 1;   // vanilla ships history/states/1-*.txt
    r = await post("/api/army/naval-air", {
      modPath: MOD, tag: "NVA", domain: "air",
      airWings: [{ state: 987654321, groups: [{ equipment: "fighter_equipment_0", owner: "NVA", amount: 10 }] }],
    });
    const indexUsable = r.body && r.body.ok === false && /wasn't found/.test(String(r.body.error || ""));
    rec("the map index is populated (needs the base game installed)", indexUsable, r.body);

    if (indexUsable) {
      console.log("\n[#23 air] a nonexistent state must be refused");
      rec("the bogus state was refused", r.body.ok === false, r.body);
      rec("…and the message names it", /987654321/.test(String(r.body.error || "")), r.body.error);

      console.log("\n[#23 air control] a REAL state is accepted");
      r = await post("/api/army/naval-air", {
        modPath: MOD, tag: "NVA", domain: "air",
        airWings: [{ state: realState, groups: [{ equipment: "fighter_equipment_0", owner: "NVA", amount: 10 }] }],
      });
      rec("a real state id was accepted", ok(r), r.body || r.status);

      console.log("\n[#23 naval] a nonexistent naval base must be refused");
      r = await post("/api/army/naval-air", {
        modPath: MOD, tag: "NVA", domain: "naval",
        fleets: [{ name: "Home Fleet", naval_base: 987654321, ships: [
          { name: "S1", definition: "destroyer", equipment: "destroyer_1", owner: "NVA" },
        ] }],
      });
      rec("the bogus naval base was refused", r.body && r.body.ok === false, r.body);
      rec("…and the message explains why", !!(r.body && /never spawn|isn't a province/.test(String(r.body.error || ""))),
        r.body && r.body.error);

      console.log("\n[#23 naval] the FLEET-level check must stand on its own");
      // When taskForces is omitted the handler synthesises one that inherits naval_base as its location, so
      // the task-force check masks the fleet check and a control cannot tell them apart. Supplying an
      // explicit task force with no location of its own leaves the fleet check as the only one that can fire.
      r = await post("/api/army/naval-air", {
        modPath: MOD, tag: "NVA", domain: "naval",
        fleets: [{
          name: "Home Fleet", naval_base: 987654321,
          taskForces: [{ name: "TF1", ships: [
            { name: "S1", definition: "destroyer", equipment: "destroyer_1", owner: "NVA" },
          ] }],
        }],
      });
      rec("a bogus naval_base is refused even when the task force has no location",
        r.body && r.body.ok === false && /Naval base 987654321/.test(String(r.body.error || "")), r.body);
    }

    console.log(`\n=== army location + variant refs: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
