// #dlc-gate-husk — a create_equipment_variant is very often the ONLY effect inside a has_dlc gate:
// Millennium Dawn has 105 such gates over 1,306 gated variants, vanilla 137 over 605. Removing the variant
// on its own left `if = { limit = { has_dlc = "..." } }` behind holding nothing — legal Clausewitz, but dead
// script, and it accumulates one husk per deletion.
//
// The interesting half of this is what must NOT happen. Collapsing a gate that still carries other effects,
// or one with an else/else_if chained to it, would delete the modder's real logic — so most of the checks
// below are negative: the gate has to SURVIVE unless it is provably empty afterwards.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-husk-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "huskmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="HuskMod"\nsupported_version="1.18.*"\n', "utf8");

const FILE = "NVA - Novaland.txt";
const ABS = path.join(MOD, "history", "countries", FILE);

const VARIANT = (name) => [
  "\t\tcreate_equipment_variant = {",
  `\t\t\tname = "${name}"`,
  "\t\t\ttype = infantry_equipment_1",
  "\t\t}",
].join("\n");

const PORT = 42453;
const app = createApp();
const server = app.listen(PORT, async () => {
  const remove = async (blockIdx) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/variant/remove-block`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, file: FILE, blockIdx }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");
  const balanced = (t) => {
    let d = 0;
    for (const c of t.replace(/#[^\n]*/g, "")) { if (c === "{") d++; else if (c === "}") d--; if (d < 0) return false; }
    return d === 0;
  };

  try {
    console.log("\n[the husk] a gate holding ONLY the variant must go with it");
    fs.writeFileSync(ABS, [
      "capital = 1",
      "",
      "if = {",
      '\tlimit = { has_dlc = "Man the Guns" }',
      VARIANT("Gated Only"),
      "}",
      "",
    ].join("\n"), "utf8");
    let r = await remove(0);
    rec("the removal succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the variant is gone", !/Gated Only/.test(read()), read());
    rec("the empty gate went with it", !/has_dlc/.test(read()), read());
    rec("…and it says so", r.body && r.body.gateRemoved === true, r.body);
    rec("the file is still brace-balanced", balanced(read()), read());
    rec("unrelated content survived", /capital = 1/.test(read()), read());

    console.log("\n[over-reach] a gate with ANOTHER effect must SURVIVE");
    fs.writeFileSync(ABS, [
      "capital = 1",
      "",
      "if = {",
      '\tlimit = { has_dlc = "Man the Guns" }',
      "\tset_stability = 0.6",
      VARIANT("Gated With Sibling"),
      "}",
      "",
    ].join("\n"), "utf8");
    r = await remove(0);
    rec("the removal succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the variant is gone", !/Gated With Sibling/.test(read()), read());
    rec("the gate SURVIVED", /has_dlc\s*=\s*"Man the Guns"/.test(read()), read());
    rec("…with its other effect intact", /set_stability\s*=\s*0\.6/.test(read()), read());
    rec("…and it reports no gate removal", !(r.body && r.body.gateRemoved), r.body);

    console.log("\n[over-reach] a gate holding TWO variants must survive removing one");
    fs.writeFileSync(ABS, [
      "capital = 1",
      "",
      "if = {",
      '\tlimit = { has_dlc = "Man the Guns" }',
      VARIANT("Keep Me"),
      VARIANT("Remove Me"),
      "}",
      "",
    ].join("\n"), "utf8");
    r = await remove(1);
    rec("the removal succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the right variant went", !/Remove Me/.test(read()), read());
    rec("the sibling variant stayed", /Keep Me/.test(read()), read());
    rec("the gate SURVIVED", /has_dlc/.test(read()), read());

    console.log("\n[over-reach] a gate with an else chained to it must survive");
    // Deleting the `if` would orphan the `else`, which is a parse error, not just dead script.
    fs.writeFileSync(ABS, [
      "capital = 1",
      "",
      "if = {",
      '\tlimit = { has_dlc = "Man the Guns" }',
      VARIANT("Chained Gate"),
      "}",
      "else = {",
      "\tset_stability = 0.4",
      "}",
      "",
    ].join("\n"), "utf8");
    r = await remove(0);
    rec("the removal succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the variant is gone", !/Chained Gate/.test(read()), read());
    rec("the gate SURVIVED so the else is not orphaned", /has_dlc/.test(read()), read());
    rec("the else block is intact", /else\s*=\s*\{/.test(read()), read());
    rec("the file is still brace-balanced", balanced(read()), read());

    console.log("\n[control] an UNGATED variant is removed exactly as before");
    fs.writeFileSync(ABS, [
      "capital = 1",
      "",
      VARIANT("Plain Variant").replace(/^\t\t/gm, ""),
      "",
      "set_stability = 0.5",
      "",
    ].join("\n"), "utf8");
    r = await remove(0);
    rec("the removal succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the variant is gone", !/Plain Variant/.test(read()), read());
    rec("nothing else was touched", /capital = 1/.test(read()) && /set_stability\s*=\s*0\.5/.test(read()), read());
    rec("no gate removal was reported", !(r.body && r.body.gateRemoved), r.body);

    console.log(`\n=== variant remove DLC husk: ${checks} checks, ${fails.length} failed ===`);
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
