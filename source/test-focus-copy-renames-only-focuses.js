// #focus-copy-renames-more-than-focuses — COPYING A TREE BROKE EVERY REWARD THAT SHARED A NAME WITH A FOCUS.
//
// Copying a focus tree has to give the copy its own focus ids, or the two trees collide (focus ids are
// globally unique in HOI4). renameFocusTreeIdentity does that by collecting every id in the tree and running
// ONE regex over the whole file:
//
//     kept.replace(new RegExp("\\b(?:" + olds.join("|") + ")\\b", "g"), tok => renames.get(tok) || tok)
//
// That renames the token EVERYWHERE, not only where it is used as a focus. And HOI4's own convention is to
// name an idea after the focus that grants it:
//
//     focus = { id = special_forces  … completion_reward = { add_ideas = special_forces } }
//
// so the copy came out granting `<prefix>_special_forces` — an idea that does not exist. The focus completes,
// grants nothing, and the game logs the missing idea.
//
// 🈯 Measured over the shipped corpora — focus ids that collide with an IDEA name:
//     vanilla 405, The Road to 56 727, Rise of Nations 321, Millennium Dawn 194, Novum Vexillum 120,
//     Old World Blues 103.
//   And the grants actually at risk (a focus granting an idea named after a focus in the SAME file):
//     vanilla 278 across 34 files.
//
// The rename must therefore apply only where a token IS a focus reference: the focus's own `id`, a
// `prerequisite`/`mutually_exclusive` `focus =`, `relative_position_id`, and `has_completed_focus`. Not
// `add_ideas`, not `set_technology`, not anything else that happens to share the name.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fcopy-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");

const MOD = path.join(ROOT, "fcmod");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FcMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "fcmod.mod"), 'name="FcMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

// A tree shaped exactly like vanilla's: a focus, an idea NAMED AFTER IT, and the focus granting that idea.
// Plus a prerequisite and a relative position, which MUST be renamed, and a technology which must not.
const SRC_REL = "common/national_focus/src_tree.txt";
fs.writeFileSync(path.join(MOD, SRC_REL), [
  "focus_tree = {",
  "\tid = src_tree",
  "\tcountry = { factor = 0 modifier = { add = 10 tag = FCM } }",
  "",
  "\tfocus = {",
  "\t\tid = army_effort",
  "\t\ticon = GFX_goal_generic_construct_civ_factory",
  "\t\tx = 0 y = 0 cost = 7",
  "\t\tcompletion_reward = { army_experience = 5 }",
  "\t}",
  "",
  "\tfocus = {",
  "\t\tid = special_forces",
  "\t\ticon = GFX_goal_generic_special_forces",
  "\t\tcost = 7",
  "\t\tprerequisite = { focus = army_effort }",
  "\t\trelative_position_id = army_effort",
  "\t\tx = 1 y = 1",
  "\t\tcompletion_reward = {",
  "\t\t\tadd_ideas = special_forces",
  "\t\t\tset_technology = { infantry_weapons = 1 }",
  "\t\t}",
  "\t}",
  "",
  "\tfocus = {",
  "\t\tid = deterrence",
  "\t\ticon = GFX_goal_generic_army_doctrines",
  "\t\tcost = 7",
  "\t\tmutually_exclusive = { focus = special_forces }",
  "\t\tx = 3 y = 1",
  "\t\tavailable = { has_completed_focus = army_effort }",
  "\t\tcompletion_reward = { add_ideas = deterrence }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
// The ideas the tree grants — named after the focuses, exactly as vanilla does it.
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"), [
  "ideas = {",
  "\tcountry = {",
  "\t\tspecial_forces = { picture = GFX_idea_unknown allowed = { always = yes } modifier = { army_org_factor = 0.05 } }",
  "\t\tdeterrence = { picture = GFX_idea_unknown allowed = { always = yes } modifier = { war_support_factor = 0.05 } }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

let PORT = 52610;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) })).catch((e) => ({ s: 0, b: { error: String(e) } }));

    console.log("\n[ground truth] HOI4 names ideas after the focus that grants them");
    {
      const walk = (dir, out) => { let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; } for (const x of e) { const p = path.join(dir, x.name); if (x.isDirectory()) walk(p, out); else if (p.endsWith(".txt")) out.push(p); } };
      const read = (p) => { try { return fs.readFileSync(p, "latin1").replace(/#[^\n]*/g, ""); } catch (_) { return ""; } };
      const files = []; walk(path.join(GAME, "common", "national_focus"), files);
      let grants = 0, hitFiles = 0;
      const ex = [];
      for (const p of files) {
        const t = read(p);
        const ids = new Set([...t.matchAll(/(?:^|\n)\s*id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
        let local = 0;
        for (const m of t.matchAll(/\badd_ideas\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/g)) if (ids.has(m[1])) { local++; if (ex.length < 3) ex.push(`${path.basename(p)}: ${m[1]}`); }
        if (local) { hitFiles++; grants += local; }
      }
      if (!files.length) console.log("     (no HOI4 install — skipped)");
      else {
        console.log(`     ${grants} grants across ${hitFiles} vanilla focus files name an idea after a focus in the same file`);
        ex.forEach((e) => console.log(`       ${e}`));
        rec("this convention is real and common in vanilla", grants > 100, grants);
      }
    }

    console.log("\n[copy the tree] focus references are renamed, everything else is left alone");
    {
      // The real path a user takes: "start from the generic tree". It copies vanilla's generic.txt, which is
      // precisely where `add_ideas = special_forces` lives — the case that produced this finding.
      const r = await post("/api/mod/copy-generic-focus-tree", { modPath: MOD });
      let copiedText = "";
      let copiedPath = "";
      const dir = path.join(MOD, "common", "national_focus");
      const after = fs.readdirSync(dir).filter((f) => f !== "src_tree.txt");
      if (after.length) { copiedPath = path.join(dir, after[0]); copiedText = fs.readFileSync(copiedPath, "utf8"); }
      rec("a copy was produced", !!copiedText, { status: r.s, body: r.b, files: fs.readdirSync(dir) });
      if (copiedText) {
        console.log(`     copy: ${path.basename(copiedPath)}`);
        const ids = [...copiedText.matchAll(/(?:^|\n)\s*id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
        console.log(`     focus ids: ${JSON.stringify(ids)}`);
        rec("the copy's focus ids were renamed", ids.some((i) => /special_forces$/.test(i) && i !== "special_forces"), ids);

        // ⚠️ THE DEFECT. The reward must still name the idea that exists.
        const grants = [...copiedText.matchAll(/\badd_ideas\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/g)].map((m) => m[1]);
        console.log(`     add_ideas now names: ${JSON.stringify(grants)}`);
        rec("add_ideas still names the REAL idea, not the renamed focus",
          grants.includes("special_forces") && grants.includes("deterrence"), grants);

        // …and the things that ARE focus references must have moved.
        const prereq = /prerequisite\s*=\s*\{\s*focus\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(copiedText);
        const relpos = /relative_position_id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(copiedText);
        const mutex = /mutually_exclusive\s*=\s*\{\s*focus\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(copiedText);
        const done = /has_completed_focus\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(copiedText);
        console.log(`     prerequisite=${prereq && prereq[1]} relative_position_id=${relpos && relpos[1]} mutually_exclusive=${mutex && mutex[1]} has_completed_focus=${done && done[1]}`);
        // These assert against the file that was ACTUALLY copied (vanilla's generic tree), not the fixture
        // above — this endpoint copies the base game's tree, and asserting on a local fixture it never reads
        // measured nothing.
        const idSet = new Set(ids);
        rec("prerequisite points at the COPY's focus", prereq && idSet.has(prereq[1]), prereq && prereq[1]);
        rec("relative_position_id too", relpos && idSet.has(relpos[1]), relpos && relpos[1]);
        rec("mutually_exclusive too", mutex && idSet.has(mutex[1]), mutex && mutex[1]);
        // EVERY focus reference of each kind must resolve inside the copy, not just the first one.
        const allRefs = (re) => [...copiedText.matchAll(re)].map((m) => m[1]);
        for (const [what, re] of [
          ["prerequisite", /prerequisite\s*=\s*\{[^{}]*?\bfocus\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g],
          ["mutually_exclusive", /mutually_exclusive\s*=\s*\{[^{}]*?\bfocus\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g],
          ["relative_position_id", /relative_position_id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g],
        ]) {
          const refs = allRefs(re);
          const dangling = refs.filter((x) => !idSet.has(x));
          console.log(`     ${what}: ${refs.length} references, ${dangling.length} dangling`);
          rec(`every ${what} resolves inside the copy`, dangling.length === 0, dangling.slice(0, 5));
        }
        if (done) rec("has_completed_focus resolves too", idSet.has(done[1]), done[1]);

        // Every focus id in the copy must be unique against the original, or the two trees collide.
        const srcIds = new Set([...fs.readFileSync(path.join(MOD, SRC_REL), "utf8").matchAll(/(?:^|\n)\s*id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
        const shared = ids.filter((i) => srcIds.has(i));
        rec("no focus id is shared with the original", shared.length === 0, shared);
      }
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== focus copy renames only focuses: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
