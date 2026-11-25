// #spirit-rename-forks-an-inherited-spirit — A RENAME THAT REACHED NOTHING REPORTED PLAIN SUCCESS.
//
// Renaming a spirit that comes from a DEPENDENCY: the add-on gets a new definition under the new id, the base
// mod keeps defining the old id, and the base's `add_ideas` still names the old one. So the countries that
// had the spirit keep the ORIGINAL and the renamed copy is granted to nobody — two spirits where the user
// believes there is one, and the one they edited is the one nobody has. The reply was `ok: true` with no
// warning, and the page said "Successfully saved".
//
// Nova must NOT write into a dependency, so the grants genuinely cannot be re-pointed; that half is correct
// and is asserted below (the base mod is checked byte-for-byte afterwards). The defect was silence.
//
// ⚠️ THE CONTROL THAT MATTERS IS THE QUIET ONE. A warning that fires on every rename would be worse than no
// warning at all, so an ordinary same-mod rename is exercised in the same run and must stay silent AND must
// still carry its grants. Without that half this test would pass just as happily if the warning were
// unconditional.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-renamefork-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => fs.mkdirSync(p, { recursive: true });
const IDEA_BLOCK = (id) => [
  "ideas = {",
  "\tcountry = {",
  "\t\t" + id + " = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { political_power_gain = 0.1 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// ── the BASE mod: defines a spirit and hands it to two countries ─────────────────────────────────────────
const BASE = path.join(ROOT, "basemod");
mk(path.join(BASE, "common", "ideas"));
mk(path.join(BASE, "history", "countries"));
// ⚠️ THE MOD'S NAME AND ITS FOLDER ARE DELIBERATELY DIFFERENT. They used to both be "basemod", so the check
// below that the warning names the owning mod passed whether the code read the descriptor or just took
// path.basename() — and for a real workshop dependency basename() is a numeric Steam id like "820260968".
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="Grand Campaign Overhaul"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "basemod.mod"),
  'name="Grand Campaign Overhaul"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "common", "ideas", "base.txt"), IDEA_BLOCK("base_spirit"));
for (const tag of ["AAA", "BBB"]) {
  fs.writeFileSync(path.join(BASE, "history", "countries", tag + " - Land.txt"),
    "capital = 1\nadd_ideas = {\n\tbase_spirit\n}\n");
}

// ── the ADD-ON: depends on the base, and owns one spirit of its own for the control ──────────────────────
const ADDON = path.join(ROOT, "addon");
mk(path.join(ADDON, "common", "ideas"));
mk(path.join(ADDON, "history", "countries"));
fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
  'name="Addon"\ndependencies={\n\t"Grand Campaign Overhaul"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "addon.mod"),
  'name="Addon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"Grand Campaign Overhaul"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ADDON, "common", "ideas", "custom_ideas.txt"), IDEA_BLOCK("my_own_spirit"));
fs.writeFileSync(path.join(ADDON, "history", "countries", "CCC - Mine.txt"),
  "capital = 1\nadd_ideas = {\n\tmy_own_spirit\n}\n");

// A fingerprint of the whole base mod, so "we did not touch it" is measured, not hoped for.
function fingerprint(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[toPosix(path.relative(dir, p))] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}
const BASE_BEFORE = fingerprint(BASE);

let PORT = 50494;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      save: (body) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/upsert-definition", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// The body public/ideas.js:1794 actually builds. `selectedEffects` are PLAIN SCRIPT STRINGS, not structured
// effects, and `formSections` names the boxes the form drew — omitting it makes the server clear sections it
// owns, which would be a loss of my own making rather than Nova's.
const saveBody = (over) => Object.assign({
  modPath: ADDON,
  targetRelativeFile: "custom_ideas.txt",
  targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
  name: "Renamed Spirit",
  desc: "",
  picture: "generic_morale_bonus",
  selectedEffects: ["modifier = {\npolitical_power_gain = 0.1\n}"],
  formSections: ["allowed", "modifier", "equipment_bonus", "visible", "on_add", "allowed_civil_war"],
  mode: "create",
  category: "country",
}, over);

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[renaming an INHERITED spirit] the rename cannot reach the base mod's grants");
    {
      const r = await api.save(saveBody({
        ideaId: "renamed_spirit",
        previousIdeaId: "base_spirit",
        sourceRoot: BASE,
      }));
      rec("the save itself succeeds", r && r.ok === true, r);

      const w = Array.isArray(r && r.warnings) ? r.warnings.join(" ") : "";
      rec("…and it warns instead of reporting plain success", !!w, r);
      rec("…naming the spirit that stays behind", w.includes("base_spirit"), w);
      rec("…and the mod that owns it, by the NAME in its descriptor",
        w.includes("Grand Campaign Overhaul"), w);
      // Not by its folder. A workshop dependency's folder is a numeric Steam id, so naming that tells the
      // author nothing about where the definition they would have to fork actually lives.
      rec("…not by its folder name", !/\bbasemod\b/i.test(w), w);
      rec("…and how many countries are affected", /\b2 countries\b/.test(w), w);
      rec("…and which ones", w.includes("AAA") && w.includes("BBB"), w);
      rec("…and what to do about it", /Country Setup/i.test(w), w);
      // Accuracy, not alarm: the mod loads fine. #validator-crywolf
      rec("…without claiming anything crashes or breaks",
        !/crash|corrupt|will not load|won't load|broken/i.test(w), w);
    }

    console.log("\n[the base mod] is never written, which is why the warning has to exist");
    {
      const after = fingerprint(BASE);
      const changed = Object.keys(after).filter((k) => after[k] !== BASE_BEFORE[k]);
      const added = Object.keys(after).filter((k) => !(k in BASE_BEFORE));
      rec("no base file was modified", changed.length === 0, changed);
      rec("no base file was added", added.length === 0, added);
      rec("…and it still grants the original spirit",
        fs.readFileSync(path.join(BASE, "history", "countries", "AAA - Land.txt"), "utf8").includes("base_spirit"));
    }

    console.log("\n[CONTROL — an ordinary same-mod rename] must stay silent and must still carry");
    {
      const r = await api.save(saveBody({
        ideaId: "my_renamed_spirit",
        previousIdeaId: "my_own_spirit",
        targetRelativeFile: "custom_ideas.txt",
      }));
      rec("the save succeeds", r && r.ok === true, r);
      rec("…and says NOTHING — the warning is not unconditional",
        !(Array.isArray(r && r.warnings) && r.warnings.length), r && r.warnings);
      const ccc = fs.readFileSync(path.join(ADDON, "history", "countries", "CCC - Mine.txt"), "utf8");
      rec("…and the grant really did move", ccc.includes("my_renamed_spirit"), ccc);
      rec("…leaving no grant for the old id", !ccc.includes("my_own_spirit"), ccc);
      const own = fs.readFileSync(path.join(ADDON, "common", "ideas", "custom_ideas.txt"), "utf8");
      rec("…and the old definition is gone", !/(^|\s)my_own_spirit\s*=/.test(own), own.slice(0, 300));
    }

    console.log("\n[CONTROL — a plain create, no rename at all] must also stay silent");
    {
      const r = await api.save(saveBody({ ideaId: "brand_new_spirit" }));
      rec("the save succeeds", r && r.ok === true, r);
      rec("…with no warning", !(Array.isArray(r && r.warnings) && r.warnings.length), r && r.warnings);
    }

    api.stop(); api = null;
    console.log(`\n=== inherited spirit rename: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
