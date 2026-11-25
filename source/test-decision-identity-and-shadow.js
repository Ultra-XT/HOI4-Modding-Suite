// A decision has ONE identity, and saving one must never replace somebody else's file.
//
// Five defects:
//
//   1. #decision-rename-move — the save had no notion of a previous identity. The id box is a plain
//      editable input on a loaded decision, so retyping it (the only rename affordance there is) ADDED a
//      second decision and left the original live in-game, with the old localisation keys orphaned.
//      Retyping the category did the same across two files. HOI4 keys decisions by id in one database, so
//      which definition won came down to load order.
//   2. #literal-loc-replacement — a built localisation line was handed to String.replace as the
//      REPLACEMENT, where `$&`, `` $` ``, `$'` and `$1` are backreferences. Renaming a decision to
//      "Bonds worth $'000" spliced the entire file inside an unterminated quoted value and left 5
//      duplicated keys; the next save couldn't match the mangled line and appended a third copy.
//      escapeLocalizationValue deliberately leaves `$` alone so `$var$` refs keep working — the fix
//      belongs at the point of substitution, and every maker's loc writer shared the bug.
//   3. #no-shadow-write — a mod file at a vanilla-or-dependency relative path REPLACES it wholesale.
//      The decisions content path checked dependency roots but not the game root; the categories path
//      checked neither. That second hole was the dangerous one: MD ships
//      common/decisions/categories/custom_decisions_category.txt and `custom_decisions` is this maker's
//      DEFAULT category, so the first save in an MD add-on replaced MD's file and took its other category
//      definitions with it.
//   4. A category already defined by a DEPENDENCY was redefined locally, duplicating the database entry
//      and reducing it to a bare `{ icon = … }` stub.
//   5. Deleting one of two same-id decisions stripped the shared localisation, blanking the survivor's
//      name to a raw red key in-game.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
// A MODS ROOT OF ITS OWN. Until 09-30 this was the temp folder itself, and a dependency is resolved by scanning every
// immediate subfolder of the mods root: on the owner's machine that was 32,628 entries, so each save scanned them all
// (257 s alone, and killed at the runner's 300 s in a loaded suite). A folder of this test's own holds the same two mods.
const MODS_ROOT = path.join(os.tmpdir(), "nova-decision-identity-mods");
const ROOT = path.join(MODS_ROOT, "nova-decision-identity-test");
process.env.HOI4_MODS_ROOT = MODS_ROOT;
// Made BEFORE server.js loads: it takes HOI4_MODS_ROOT only when the folder exists, and otherwise names no mods folder at
// all — so the dependency below would sit in a folder the server never looks in.
fs.mkdirSync(MODS_ROOT, { recursive: true });
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(ROOT, { recursive: true, force: true });
// A dependency that ships a decisions file AND a categories file we must not replace.
// It has to sit DIRECTLY under the mods root: dependencies are resolved by scanning the workshop dirs and the
// mods root's immediate subdirectories for a descriptor.mod whose `name` matches.
const DEP = path.join(MODS_ROOT, "nova_dec_identity_depmod_fixture");
fs.rmSync(DEP, { recursive: true, force: true });
fs.mkdirSync(path.join(DEP, "common", "decisions", "categories"), { recursive: true });
fs.writeFileSync(path.join(DEP, "descriptor.mod"), 'name="DepMod"\nsupported_version="1.19.*"\n');
const DEP_CATS = [
  "custom_decisions = {",
  "\ticon = GFX_dep_category",
  "\tpriority = 55",
  "}",
  "dep_other_category = {",
  "\ticon = GFX_dep_other",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(DEP, "common", "decisions", "categories", "custom_decisions_category.txt"), DEP_CATS, "utf8");
fs.writeFileSync(path.join(DEP, "common", "decisions", "Egypt.txt"),
  "dep_cat = {\n\tdep_only_decision = {\n\t\ticon = GFX_dep\n\t\tcost = 5\n\t}\n}\n", "utf8");

// The add-on under test, declaring that dependency.
const MOD = path.join(ROOT, "addon");
fs.mkdirSync(path.join(MOD, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'name="AddOn"\nsupported_version="1.19.*"\ndependencies={\n\t"DepMod"\n}\n', "utf8");

const decDir = path.join(MOD, "common", "decisions");
const catDir = path.join(decDir, "categories");
const FILE = "AAA_theme_decisions.txt"; // named nothing like its category, the way real content is
fs.writeFileSync(path.join(decDir, FILE), [
  "origin_cat = {",
  "\tmover = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 15",
  "\t\tselectable_mission = yes",   // un-modeled: must travel with a rename
  "\t\tfixed_random_seed = no",     // ditto
  "\t\tavailable = { always = yes }",
  "\t\tcomplete_effect = { add_political_power = 3 }",
  "\t}",
  "\tsibling = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 1",
  "\t\tavailable = { always = yes }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const readF = (f) => { try { return fs.readFileSync(path.join(decDir, f), "utf8"); } catch (_) { return ""; } };
const allDecText = () => fs.readdirSync(decDir).filter((f) => /\.txt$/i.test(f)).map(readF).join("\n");
const defCount = (id) => (allDecText().match(new RegExp("(?:^|\\n)\\s*" + esc(id) + "\\s*=\\s*\\{", "g")) || []).length;
const inFile = (f, id) => new RegExp("(?:^|\\n)\\s*" + esc(id) + "\\s*=\\s*\\{").test(readF(f));
const locPath = path.join(MOD, "localisation", "english", "custom_decisions_l_english.yml");
const locText = () => { try { return fs.readFileSync(locPath, "utf8"); } catch (_) { return ""; } };
const locKeys = () => [...locText().matchAll(/^[ \t]*([A-Za-z0-9_]+):\d*/gm)].map((m) => m[1]);
const balanced = (t) => { let d = 0; for (const ch of String(t).replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };

const PORT = 39587, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));
  const save = (over) => post("/api/decisions/save", Object.assign({
    modPath: MOD, categoryId: "origin_cat", id: "mover", fileName: FILE,
    name: "Mover", cost: 15, icon: "GFX_decision_generic_decision", days: 0, fireOnce: "no",
    available: "always = yes", modifier: "", effect: "add_political_power = 3",
    decisionType: "decision", scope: "national", cooldown: "", targetTrigger: "", removeEffect: "",
  }, over || {}));

  try {
    // ── 1. RENAME the id ──────────────────────────────────────────────────────────────────────────────
    const r1 = await save({ id: "mover_renamed", previousId: "mover", previousCategoryId: "origin_cat", name: "Mover Renamed" });
    ok("rename → 200", r1.s === 200, r1.b);
    ok("the new id exists exactly once", defCount("mover_renamed") === 1, defCount("mover_renamed"));
    ok("the OLD id is gone", defCount("mover") === 0, readF(FILE));
    ok("it stayed in its real file", inFile(FILE, "mover_renamed"));
    ok("no stray <categoryId>.txt appeared", !fs.existsSync(path.join(decDir, "origin_cat.txt")));
    ok("its un-modeled fields travelled with it",
      /selectable_mission\s*=\s*yes/.test(readF(FILE)) && /fixed_random_seed\s*=\s*no/.test(readF(FILE)), readF(FILE));
    ok("the sibling was untouched", defCount("sibling") === 1);
    ok("the file is still brace-balanced", balanced(readF(FILE)));
    ok("the old localisation keys were cleaned up", !locKeys().includes("mover"), locKeys());
    ok("the new localisation key is present", locKeys().includes("mover_renamed"), locKeys());

    // ── 2. MOVE it to another category ────────────────────────────────────────────────────────────────
    await breathe();
    const r2 = await save({ id: "mover_renamed", categoryId: "second_cat", previousId: "mover_renamed", previousCategoryId: "origin_cat" });
    ok("category move → 200", r2.s === 200, r2.b);
    ok("it is defined exactly once across every file", defCount("mover_renamed") === 1,
      { count: defCount("mover_renamed"), files: fs.readdirSync(decDir).filter((f) => /\.txt$/i.test(f)) });
    ok("the origin category no longer holds it", !inFile(FILE, "mover_renamed"), readF(FILE));
    ok("the origin file is still valid and keeps its sibling", balanced(readF(FILE)) && defCount("sibling") === 1);

    // ── 3. a $-bearing name must not rewrite the localisation file ─────────────────────────────────────
    await breathe();
    const keysBefore = locKeys().length;
    const r3 = await save({ id: "mover_renamed", categoryId: "second_cat", previousId: "mover_renamed", previousCategoryId: "second_cat", name: "Bonds worth $'000" });
    ok("a $' name saves → 200", r3.s === 200, r3.b);
    ok("the name is stored literally", /mover_renamed:0\s+"Bonds worth \$'000"/.test(locText()), locText());
    ok("no key was duplicated", new Set(locKeys()).size === locKeys().length, locKeys());
    ok("the key count did not grow", locKeys().length === keysBefore, { now: locKeys().length, was: keysBefore });
    ok("every value is still terminated (even quote count)", (locText().match(/"/g) || []).length % 2 === 0);
    await breathe();
    const r3b = await save({ id: "mover_renamed", categoryId: "second_cat", previousId: "mover_renamed", previousCategoryId: "second_cat", name: "Cost $& more" });
    ok("a $& name is stored literally too", r3b.s === 200 && /mover_renamed:0\s+"Cost \$& more"/.test(locText()), locText());
    ok("still no duplicated keys", new Set(locKeys()).size === locKeys().length, locKeys());

    // ── 4. the dependency's categories file must survive ──────────────────────────────────────────────
    await breathe();
    const depCatFile = path.join(DEP, "common", "decisions", "categories", "custom_decisions_category.txt");
    const r4 = await save({ id: "in_default_cat", categoryId: "custom_decisions", previousId: "", previousCategoryId: "", name: "In Default Cat" });
    ok("saving into the default category → 200", r4.s === 200, r4.b);
    ok("the dependency's categories file is byte-identical", fs.readFileSync(depCatFile, "utf8") === DEP_CATS);
    ok("the add-on did NOT write a file at that same relative path",
      !fs.existsSync(path.join(catDir, "custom_decisions_category.txt")),
      fs.existsSync(catDir) ? fs.readdirSync(catDir) : "(no categories dir)");
    ok("a category the dependency already defines is not redefined locally",
      !(fs.existsSync(catDir) && fs.readdirSync(catDir).some((f) => /(?:^|\n)\s*custom_decisions\s*=\s*\{/.test(fs.readFileSync(path.join(catDir, f), "utf8")))),
      fs.existsSync(catDir) ? fs.readdirSync(catDir) : "(none)");
    ok("the dependency's decisions file is untouched",
      /dep_only_decision\s*=\s*\{/.test(fs.readFileSync(path.join(DEP, "common", "decisions", "Egypt.txt"), "utf8")));

    // a brand-new category IS defined (in a non-shadowing file), so it renders in-game
    await breathe();
    const r5 = await save({ id: "in_fresh_cat", categoryId: "zz_fresh_category", previousId: "", previousCategoryId: "", name: "In Fresh Cat" });
    ok("saving into a brand-new category → 200", r5.s === 200, r5.b);
    ok("the new category was defined",
      fs.existsSync(catDir) && fs.readdirSync(catDir).some((f) => /zz_fresh_category\s*=\s*\{/.test(fs.readFileSync(path.join(catDir, f), "utf8"))),
      fs.existsSync(catDir) ? fs.readdirSync(catDir) : "(none)");
    ok("it uses a real category sprite, not the sprite that exists nowhere",
      fs.readdirSync(catDir).some((f) => /icon\s*=\s*GFX_decision_category_/.test(fs.readFileSync(path.join(catDir, f), "utf8"))) &&
      !fs.readdirSync(catDir).some((f) => /icon\s*=\s*GFX_decision_generic\b/.test(fs.readFileSync(path.join(catDir, f), "utf8"))),
      fs.readdirSync(catDir).map((f) => fs.readFileSync(path.join(catDir, f), "utf8")));

    // ── 5. deleting one of two same-id decisions must not blank the survivor's name ───────────────────
    await breathe();
    fs.writeFileSync(path.join(decDir, "BBB_twin.txt"),
      "twin_cat_a = {\n\ttwin = {\n\t\ticon = GFX_decision_generic_decision\n\t\tcost = 1\n\t}\n}\n" +
      "twin_cat_b = {\n\ttwin = {\n\t\ticon = GFX_decision_generic_decision\n\t\tcost = 2\n\t}\n}\n", "utf8");
    await save({ id: "twin", categoryId: "twin_cat_a", fileName: "BBB_twin.txt", previousId: "", previousCategoryId: "", name: "Twin Name" });
    ok("the shared name was written", locKeys().includes("twin"), locKeys());
    const d = await post("/api/decisions/delete-definition", { modPath: MOD, categoryId: "twin_cat_a", decisionId: "twin", fileName: "BBB_twin.txt" });
    ok("delete → 200", d.s === 200, d.b);
    ok("one twin remains on disk", defCount("twin") === 1, defCount("twin"));
    ok("the survivor kept its name (loc not stripped while still in use)", locKeys().includes("twin"), { keys: locKeys(), removed: d.b.removedLocalizationFiles });
    await breathe();
    const d2 = await post("/api/decisions/delete-definition", { modPath: MOD, categoryId: "twin_cat_b", decisionId: "twin", fileName: "BBB_twin.txt" });
    ok("deleting the last one → 200", d2.s === 200, d2.b);
    ok("now the localisation IS cleaned up", !locKeys().includes("twin"), locKeys());

    // ── the untrimmed-id guard ────────────────────────────────────────────────────────────────────────
    const bad = await save({ id: "  spaced_id  ", categoryId: "  spaced_cat  ", previousId: "", previousCategoryId: "" });
    ok("a padded id is accepted but TRIMMED, not used raw", bad.s === 200, bad.b);
    ok("no file with a space in its name was created",
      !fs.readdirSync(decDir).some((f) => /^\s|\s\.txt$/.test(f)), fs.readdirSync(decDir));
    ok("it was written under the trimmed ids", defCount("spaced_id") === 1, defCount("spaced_id"));

    console.log("\ntest-decision-identity-and-shadow: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 30 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(DEP, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmdirSync(MODS_ROOT); } catch (_) {}   // only when empty: nothing else of anyone's is ever in it
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
