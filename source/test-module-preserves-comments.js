// #preserve-comments-by-key — the last of the nine preserve-merges worth fixing, and the choice of WHICH
// half to fix was made by counting, not by symmetry with the others.
//
// Comments inside equipment module definitions, measured across both corpora:
//   Millennium Dawn  128, every one above a key this serializer REBUILDS
//   vanilla           53, of which 16 above a rebuilt key and 37 above one carried through
//
// Both placements occur in real content, so both are handled here. That is not true of the other helpers:
// equipment upgrades carry 4 comments across MD and vanilla combined, and MIO traits carry 2 — measured and
// deliberately left alone rather than changed for consistency's sake at ship time.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modcmt-"));
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

const MOD = path.join(ROOT, "modmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment", "modules"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ModMod"\nsupported_version="1.18.*"\n', "utf8");

const ABS = path.join(MOD, "common", "units", "equipment", "modules", "nova_modules.txt");
const SEED = [
  "equipment_modules = {",
  "\tnova_super_engine = {",
  "\t\t# the workhorse engine, do not rebalance without checking the AI",
  "\t\tcategory = tank_engine_type",
  "\t\tgui_category = tank_engine",
  "\t\tabbreviation = nse",
  "\t\t# chain: feeds nova_super_engine_2",
  "\t\tparent = nova_base_engine",
  "\t\t# priced against the medium chassis",
  "\t\txp_cost = 5",
  "\t\tadd_stats = {",
  "\t\t\tmaximum_speed = 5",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42361;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (b) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/module`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ modPath: MOD }, b)),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // Read the file the save REPORTS, not the one we seeded. Editing a module the mod already owns writes an
  // override into nova_custom_modules.txt (#module-inherit-preserve), seeded from the original — so reading
  // the seed file shows it untouched and every comment assertion passes without testing anything. That is
  // exactly how the first version of this test was vacuous.
  let WRITTEN = ABS;
  const read = () => fs.readFileSync(WRITTEN, "utf8");
  const lineAbove = (txt, needle) => {
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex((l) => l.includes(needle));
    return i > 0 ? lines[i - 1].trim() : "";
  };
  const countOf = (txt, lit) => (txt.match(new RegExp(lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

  try {
    console.log("\n[edit] annotations inside a module survive");
    fs.writeFileSync(ABS, SEED, "utf8");
    const r = await post({
      id: "nova_super_engine", category: "tank_engine_type", gui_category: "tank_engine",
      abbreviation: "nse", add_stats: { maximum_speed: 9 }, multiply_stats: {},
    });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    WRITTEN = path.join(MOD, "common", "units", "equipment", "modules", (r.body && r.body.file) || "nova_custom_modules.txt");
    rec("…and it names the file it wrote", fs.existsSync(WRITTEN), r.body && r.body.file);

    const txt = read();
    rec("the edit landed", /maximum_speed = 9/.test(txt), txt);

    // Above a REBUILT key — the dominant case in Millennium Dawn.
    rec("a comment above a REBUILT key survived",
      /# the workhorse engine, do not rebalance without checking the AI/.test(txt), txt);
    rec("…directly above the category it annotates",
      lineAbove(txt, "category = tank_engine_type") === "# the workhorse engine, do not rebalance without checking the AI",
      lineAbove(txt, "category = tank_engine_type"));

    // Above a CARRIED-THROUGH key — the dominant case in vanilla.
    rec("a comment above a carried-through key survived", /# chain: feeds nova_super_engine_2/.test(txt), txt);
    rec("…and that un-modelled key is still there", /\bparent = nova_base_engine\b/.test(txt), txt);
    rec("the second carried-through note survived", /# priced against the medium chassis/.test(txt), txt);
    rec("…and its key too", /\bxp_cost = 5\b/.test(txt), txt);

    rec("the file is brace-balanced",
      (txt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (txt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, txt);

    console.log("\n[repeat] comments must not multiply");
    await post({
      id: "nova_super_engine", category: "tank_engine_type", gui_category: "tank_engine",
      abbreviation: "nse", add_stats: { maximum_speed: 9 }, multiply_stats: {},
    });
    await post({
      id: "nova_super_engine", category: "tank_engine_type", gui_category: "tank_engine",
      abbreviation: "nse", add_stats: { maximum_speed: 9 }, multiply_stats: {},
    });
    const txt2 = read();
    for (const c of [
      "# the workhorse engine, do not rebalance without checking the AI",
      "# chain: feeds nova_super_engine_2",
      "# priced against the medium chassis",
    ]) {
      rec(`"${c.slice(0, 30)}…" appears exactly once`, countOf(txt2, c) === 1, countOf(txt2, c));
    }
    rec("the un-modelled keys are still single too",
      countOf(txt2, "parent = nova_base_engine") === 1 && countOf(txt2, "xp_cost = 5") === 1,
      { parent: countOf(txt2, "parent = nova_base_engine"), xp: countOf(txt2, "xp_cost = 5") });

    console.log(`\n=== module comment preservation: ${checks} checks, ${fails.length} failed ===`);
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
