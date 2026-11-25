// #decision-category-undefined — A DECISION IN A CATEGORY NOTHING DEFINES NEVER APPEARS IN GAME, AND NOVA
// DREW IT LIKE ANY OTHER.
//
// The user reported "many decisions had no effect". Most of that turned out to be content, but one was
// this: `vrf51_cat` is defined nowhere — not in the mod's 5 category files, not in vanilla's 591 — so the
// category and its decision never load. Nova's /api/decisions/list took the category straight from the
// top-level block key and never read common/decisions/categories at all, so it reported vrf51_cat as an
// ordinary category with one decision, indistinguishable from the five real ones. Mod Health had the same
// blind spot: 188 problems reported on that mod, none of them this.
//
// The list now answers the question the game answers: will this category load?
//
// EXISTENCE, NOT SUITABILITY — this only reports whether a definition exists anywhere the game reads
// (mod, dependency, or vanilla), which is objective. It never refuses a save.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deccat-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

const MOD = path.join(ROOT, "catmod");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CatMod"\nsupported_version="1.19.*"\n', "utf8");

const dec = (cat, id) => `${cat} = {\n\t${id} = {\n\t\tcost = 10\n\t\tcomplete_effect = { add_political_power = 5 }\n\t}\n}\n`;

// THREE categories that differ only in whether anything defines them:
//   own_cat      — defined by this mod
//   political_actions — defined by VANILLA (a real base-game decision category)
//   ghost_cat    — defined nowhere, the vrf51_cat shape
fs.writeFileSync(path.join(MOD, "common", "decisions", "nova_probe.txt"),
  dec("own_cat", "probe_own") + "\n" + dec("political_actions", "probe_vanilla") + "\n" + dec("ghost_cat", "probe_ghost"), "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "own_cat.txt"),
  "own_cat = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n", "utf8");

const PORT = 42485;
const app = createApp();
const server = app.listen(PORT, async () => {
  const list = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/decisions/list?modPath=${encodeURIComponent(MOD)}`);
    return r.json();
  };
  try {
    const d = await list();
    const byId = Object.fromEntries((d.categories || []).map((c) => [c.id, c]));

    console.log("\n[all three categories are still listed — this reports, it does not hide]");
    rec("own_cat is listed", !!byId.own_cat, Object.keys(byId));
    rec("political_actions is listed", !!byId.political_actions, Object.keys(byId));
    rec("ghost_cat is listed", !!byId.ghost_cat, Object.keys(byId));
    rec("…and each still carries its decision",
      (byId.ghost_cat && (byId.ghost_cat.decisions || []).length === 1), byId.ghost_cat);

    console.log("\n[control] a category the mod or the base game defines must NOT be flagged");
    // First, so a check that simply flags everything cannot pass this file.
    rec("own_cat (defined by this mod) is reported as defined", byId.own_cat && byId.own_cat.categoryDefined === true, byId.own_cat);
    rec("political_actions (defined by VANILLA) is reported as defined",
      byId.political_actions && byId.political_actions.categoryDefined === true, byId.political_actions);

    console.log("\n[the bug] a category nothing defines is reported as undefined");
    rec("ghost_cat is reported as UNDEFINED", byId.ghost_cat && byId.ghost_cat.categoryDefined === false, byId.ghost_cat);

    console.log("\n[and defining it flips the answer]");
    fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "ghost_cat.txt"),
      "ghost_cat = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n", "utf8");
    const d2 = await list();
    const byId2 = Object.fromEntries((d2.categories || []).map((c) => [c.id, c]));
    rec("ghost_cat is now reported as defined", byId2.ghost_cat && byId2.ghost_cat.categoryDefined === true, byId2.ghost_cat);
    rec("…and the others did not change", byId2.own_cat.categoryDefined === true && byId2.political_actions.categoryDefined === true, byId2);

    console.log(`\n=== decision category undefined: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
