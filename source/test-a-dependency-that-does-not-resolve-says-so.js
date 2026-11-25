// ⛔ #dependency-name-typo-is-silent — ONE WRONG CHARACTER PRODUCED TEN ERRORS ABOUT THINGS THAT EXIST.
//
// Nova matches a mod's declared dependency names EXACTLY (case-insensitively) against the installed mods'
// descriptor names. One character out and the dependency resolves to nothing — silently. Every reference
// into that mod is then reported as a broken reference, because Nova never opened it.
//
// Found on the OWNER'S OWN `unity` mod:
//     unity/descriptor.mod : dependencies={ "Millennium Dawn: Modern Day Mod" }
//     the installed mod is : "Millennium Dawn: A Modern Day Mod"
// The missing "A " produced TEN broken_reference ERRORS through the real /api/mod/index endpoint, against
// ideas that plainly exist — `mixed_economy`, `draft_army`, `volunteer_army`, `consumption_economy`.
//
// ⚠️ THE GAME NEVER COMPLAINS. HOI4 uses `dependencies` only to order loading; the player enables
// Millennium Dawn in the launcher and everything works. So nothing in-game points at descriptor.mod, and
// the modder is left with ten impossible errors. A rule that only goes quiet is indistinguishable from a
// dead one — this one now names the dependency, and when exactly one installed mod is a near miss, says so.
//
// The suggestion is deliberately conservative: exactly one candidate within a small edit distance, or none.
// Guessing between two is worse than not guessing.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// MODS_ROOT is read when server.js is required, so this must be set first.
const MODS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depsroot-"));
process.env.HOI4_MODS_ROOT = MODS_ROOT;
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PORT = 53703;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 200))));
  if (!ok) fails.push(label);
};

// A mod folder plus the launcher .mod file that names it — resolution reads the latter.
//
// `replacePaths` reproduces what every large mod's .mod file looks like: a long run of replace_path lines
// BEFORE its own path. `path\s*=\s*"…"` matches the tail of `replace_path="…"`, so an unanchored read takes
// the first one and resolves the dependency to a folder that does not exist. #mod-path-matched-replace-path
function makeMod(folder, displayName, extra, replacePaths) {
  const dir = path.join(MODS_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `version="1"\nname="${displayName}"\n` + (extra || ""), "utf8");
  const rp = (replacePaths || []).map((p) => `replace_path="${p}"\n`).join("");
  fs.writeFileSync(path.join(MODS_ROOT, folder + ".mod"),
    `version="1"\nname="${displayName}"\n` + rp + `path="${dir.replace(/\\/g, "/")}"\n`, "utf8");
  return dir;
}

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // The dependency: a mod that owns an idea. Its .mod file carries replace_path lines the way every big
    // mod's does — Millennium Dawn's has about seventy of them before its own path.
    const base = makeMod("base_mod", "Millennium Dawn: A Modern Day Mod", "", [
      "events", "common/abilities", "common/characters", "common/ideas", "history/states",
    ]);
    fs.mkdirSync(path.join(base, "common", "ideas"), { recursive: true });
    fs.writeFileSync(path.join(base, "common", "ideas", "laws.txt"),
      "ideas = {\n\tcountry = {\n\t\tmixed_economy = { removal_cost = -1 }\n\t}\n}\n", "utf8");

    // A consumer that references it, in three flavours of declared name.
    const consumer = (folder, depName) => {
      const dir = makeMod(folder, folder, `dependencies={\n\t"${depName}"\n}\n`);
      fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
      fs.writeFileSync(path.join(dir, "common", "national_focus", "f.txt"),
        "focus_tree = {\n\tid = t\n\tcountry = { factor = 1 }\n"
        + "\tfocus = {\n\t\tid = uses_the_dep\n\t\ticon = GFX_a\n\t\tx = 1\n\t\ty = 1\n\t\tcost = 1\n"
        + "\t\tcompletion_reward = { add_ideas = mixed_economy }\n\t}\n}\n", "utf8");
      fs.mkdirSync(path.join(dir, "localisation", "english"), { recursive: true });
      fs.writeFileSync(path.join(dir, "localisation", "english", "l_l_english.yml"),
        "﻿l_english:\n uses_the_dep:0 \"Uses The Dep\"\n", "utf8");
      return dir;
    };
    const exact = consumer("exact_mod", "Millennium Dawn: A Modern Day Mod");
    const typo = consumer("typo_mod", "Millennium Dawn: Modern Day Mod");   // the owner's real typo
    const unknown = consumer("unknown_mod", "Some Mod Nobody Has Installed");

    const scan = async (dir) => (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(dir))).json();

    console.log("\n-- the control: an exactly-named dependency resolves THROUGH its replace_path lines --");
    // This is the case that was broken. The dependency's .mod file lists replace_path entries before its
    // own path, and the resolver took the first `path="…"` it saw — `events` — which does not exist, so a
    // correctly-declared dependency silently resolved to nothing. Measured over the 25 installed .mod files
    // it picked the wrong path for exactly the four mods people write add-ons for: Millennium Dawn, Old
    // World Blues, Rise of Nations and Novum Vexillum. They are the ones big enough to use replace_path.
    const a = await scan(exact);
    const aDep = (a.problems || []).filter((p) => p.rule === "dependency_not_found");
    const aBroken = (a.problems || []).filter((p) => p.rule === "broken_reference");
    rec("no dependency_not_found when the name matches", aDep.length === 0, aDep.map((p) => p.entityId));
    rec("...and the reference into it resolves", aBroken.length === 0, aBroken.map((p) => p.refId));

    console.log("\n-- the owner's real case: one missing word --");
    const b = await scan(typo);
    const bDep = (b.problems || []).filter((p) => p.rule === "dependency_not_found");
    rec("the unresolved dependency IS reported", bDep.length === 1, bDep.map((p) => p.entityId));
    rec("...naming the dependency that failed", bDep[0] && bDep[0].entityId === "Millennium Dawn: Modern Day Mod", bDep[0] && bDep[0].entityId);
    rec("...suggesting the mod they meant", bDep[0] && bDep[0].suggestion === "Millennium Dawn: A Modern Day Mod", bDep[0] && bDep[0].suggestion);
    rec("...and saying the game will not complain about it", bDep[0] && /only uses dependencies to order loading/i.test(bDep[0].message), bDep[0] && bDep[0].message);
    rec("...pointing at descriptor.mod", bDep[0] && bDep[0].file === "descriptor.mod", bDep[0] && bDep[0].file);
    rec("it is listed FIRST, above the errors it causes", (b.problems || [])[0] && b.problems[0].rule === "dependency_not_found", (b.problems || [])[0] && b.problems[0].rule);

    console.log("\n-- the causal link: the broken reference is a CONSEQUENCE, not a separate defect --");
    const bBroken = (b.problems || []).filter((p) => p.rule === "broken_reference");
    rec("the typo mod DOES report the reference as broken", bBroken.length === 1, bBroken.map((p) => p.refId));
    rec("...for the idea that lives in the unresolved dependency", bBroken[0] && bBroken[0].refId === "mixed_economy", bBroken[0] && bBroken[0].refId);

    console.log("\n-- and a name nobody could have meant gets no guess --");
    const c = await scan(unknown);
    const cDep = (c.problems || []).filter((p) => p.rule === "dependency_not_found");
    rec("an unknown dependency is still reported", cDep.length === 1, cDep.map((p) => p.entityId));
    rec("...with NO suggestion, because guessing is worse than not", cDep[0] && !cDep[0].suggestion, cDep[0] && cDep[0].suggestion);

    console.log("\n-- derived: every rule mod-index can emit has a human label --");
    // Nothing guarded this, so a new rule showed its raw snake_case name in the category chips. The map
    // panel has had this guard for a while (map-rule-labels.js); Mod Health's own list had none.
    const miSrc = stripJsComments(fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8"));
    const emitted = [...new Set([...miSrc.matchAll(/rule:\s*"([a-z_]+)"/g)].map((m) => m[1]))];
    const uiSrc = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8"));
    const labelBlock = uiSrc.slice(uiSrc.indexOf("const RULE_LABEL"), uiSrc.indexOf("const DETERMINISTIC_FIXES"));
    const unlabelled = emitted.filter((r) => !new RegExp("(^|[^A-Za-z_])" + r + "\\s*:").test(labelBlock));
    rec("the sweep found the rules to check", emitted.length >= 15, emitted.length + " rules");
    rec("every one of them has a friendly label", unlabelled.length === 0, unlabelled);
    rec("...including the new one", /dependency_not_found\s*:/.test(labelBlock));
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    server.closeAllConnections && server.closeAllConnections();
    server.close();
    try { fs.rmSync(MODS_ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }

  console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
  process.exitCode = fails.length ? 1 : 0;
})();
