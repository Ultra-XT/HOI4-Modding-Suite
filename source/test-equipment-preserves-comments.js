// #equipment-save-eats-comments — saving an equipment archetype dropped every comment the modder had written
// inside the block. Preservation was by KEY (keep any old top-level statement the new block does not emit),
// and a comment is not a statement, so it fell through.
//
// Millennium Dawn's equipment files are commented throughout — "# Space taken in convoy" sits above
// lend_lease_cost in its tank chassis — and the loss was permanent and silent: the save reported success and
// the annotation was simply gone from the modder's own file.
//
// The comment is carried WITH the statement it annotates, not collected and re-appended: a comment moved away
// from the thing it explains has lost its meaning, which is arguably worse than dropping it. A blank line
// detaches it, and a comment above a statement Nova itself rewrites is not re-injected (the new value is
// emitted fresh, and duplicating the comment there would be wrong).
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqcomment-"));
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

const MOD = path.join(ROOT, "eqmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EqMod"\nsupported_version="1.18.*"\n', "utf8");

const ABS = path.join(MOD, "common", "units", "equipment", "nua_eq.txt");
const SEED = [
  "equipments = {",
  "\tnua_test_equipment = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t\ttype = medium_tank",
  "\t\tbuild_cost_ic = 4",
  "\t\treliability = 1.0",
  "\t\tarmor_value = 30",
  "\t\t# Space taken in convoy",
  "\t\tlend_lease_cost = 5",
  "\t\t# two lines of note",
  "\t\t# about the fuel figure",
  "\t\tfuel_consumption = 0.8",
  "",
  "\t\t# detached by a blank line above it",
  "\t\tmanpower = 2",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42303;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ modPath: MOD, id: "nua_test_equipment" }, body)),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");
  const lineAbove = (txt, needle) => {
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex((l) => l.includes(needle));
    return i > 0 ? lines[i - 1].trim() : "";
  };

  try {
    console.log("\n[statsAll save] comments inside the block survive");
    fs.writeFileSync(ABS, SEED, "utf8");
    let r = await save({ statsAll: { build_cost_ic: 7.25 } });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    let txt = read();
    rec("the edit landed", /build_cost_ic\s*=\s*7\.25/.test(txt), txt);
    rec("the single-line comment survived", /# Space taken in convoy/.test(txt), txt);
    rec("…and is still attached to the line it annotates",
      lineAbove(txt, "lend_lease_cost") === "# Space taken in convoy", lineAbove(txt, "lend_lease_cost"));
    rec("a two-line comment survived in full",
      /# two lines of note/.test(txt) && /# about the fuel figure/.test(txt), txt);
    rec("…in the right order above its statement",
      lineAbove(txt, "fuel_consumption") === "# about the fuel figure", lineAbove(txt, "fuel_consumption"));
    rec("the blank-line-detached comment also survived", /# detached by a blank line above it/.test(txt), txt);
    rec("the un-edited stats are untouched",
      /armor_value\s*=\s*30/.test(txt) && /lend_lease_cost\s*=\s*5/.test(txt) && /manpower\s*=\s*2/.test(txt), txt);
    rec("still brace-balanced",
      (txt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (txt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, txt);

    console.log("\n[repeat saves] comments must not multiply");
    const before = read();
    await save({ statsAll: { armor_value: 44 } });
    await save({ statsAll: { armor_value: 44 } });
    txt = read();
    rec("the comment appears exactly once", (txt.match(/# Space taken in convoy/g) || []).length === 1,
      (txt.match(/# Space taken in convoy/g) || []).length);
    rec("the two-line comment appears exactly once",
      (txt.match(/# about the fuel figure/g) || []).length === 1,
      (txt.match(/# about the fuel figure/g) || []).length);
    rec("a second identical save is byte-identical", read() === txt, "drifted");
    rec("…and the earlier edit is still there", /build_cost_ic\s*=\s*7\.25/.test(txt), txt);
    void before;

    console.log("\n[core-field save] the other payload shape behaves the same");
    fs.writeFileSync(ABS, SEED, "utf8");
    r = await save({ name: "Nua Test", year: "1936", buildCostIc: "9", armorValue: "30" });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    txt = read();
    rec("comments survived here too", /# Space taken in convoy/.test(txt) && /# about the fuel figure/.test(txt), txt);
    rec("…and the edit landed", /build_cost_ic\s*=\s*9\b/.test(txt), txt);

    console.log(`\n=== equipment comment preservation: ${checks} checks, ${fails.length} failed ===`);
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
