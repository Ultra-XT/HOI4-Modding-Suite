// #spirit-delete-splits-across-two-mods — ONE DELETE REACHED INTO TWO MODS.
//
// POST /api/ideas/delete-definition resolves the definition's file as `sourceRoot ? … : activeRoot` — the
// spirit editor sends `sourceRoot` naming whichever mod the selected spirit actually lives in. But the
// handler then unwired the game-start grants with `activeRoot`, which is a different mod whenever the user
// is editing a spirit that does not live in the currently-active one.
//
// Measured on a fixture where two mods each define the same spirit and each grant it at game start, one
// delete produced:
//   · the SOURCE mod lost the definition but KEPT its grant — that country then starts with
//     `add_ideas = { <a spirit that no longer exists> }`, precisely the state #delete-leaves-grant exists
//     to prevent;
//   · the ACTIVE mod, which the user was not editing at all, silently lost a working grant to a spirit it
//     still defines.
// The dangling-reference note that rides along was computed against the wrong mod too: it named a file
// that was perfectly fine and said nothing about the grant it had just orphaned.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritdel-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const toPosix = (p) => p.split(path.sep).join("/");
const PORT = 53365;
const SPIRIT = "doomed_spirit";

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(ROOT, `${name}.mod`),
    `name="${name}"\npath="${toPosix(dir)}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(dir, "common", "ideas", "custom_ideas.txt"),
    `ideas = {\n\tcountry = {\n\t\t${SPIRIT} = {\n\t\t\tpicture = GFX_idea_generic_desk\n` +
    "\t\t\tmodifier = { political_power_factor = 0.1 }\n\t\t}\n\t}\n}\n");
  fs.writeFileSync(path.join(dir, "history", "countries", "GER - Germany.txt"),
    `capital = 64\nadd_ideas = {\n\t${SPIRIT}\n}\n`);
  fs.writeFileSync(path.join(dir, "common", "national_focus", "tree.txt"),
    `focus_tree = {\n\tid = ${name}_tree\n\tcountry = { factor = 1 }\n` +
    `\tfocus = {\n\t\tid = ${name}_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n}\n`);
  return dir;
}
const reset = (dir, name) => mkMod(name);
const hasDef = (root) => {
  try { return fs.readFileSync(path.join(root, "common", "ideas", "custom_ideas.txt"), "utf8").includes(`${SPIRIT} = {`); }
  catch (_) { return false; }
};
const hasGrant = (root) => {
  try { return new RegExp(`add_ideas\\s*=\\s*\\{[^}]*${SPIRIT}`).test(fs.readFileSync(path.join(root, "history", "countries", "GER - Germany.txt"), "utf8")); }
  catch (_) { return false; }
};

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  const J = (u, o) => fetch(`http://127.0.0.1:${PORT}${u}`, o).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  const makeActive = (root) => J("/api/load", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: path.join(root, "common", "national_focus", "tree.txt") }),
  });
  const del = (body) => J("/api/ideas/delete-definition", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ ideaId: SPIRIT, targetRelativeFile: "common/ideas/custom_ideas.txt", targetLocalizationPath: "" }, body)),
  });

  try {
    console.log("\n[THE BUG] the selected spirit lives in a DIFFERENT mod than the active one");
    {
      const SOURCE = reset(null, "sourcemod");
      const ACTIVE = reset(null, "activemod");
      await makeActive(ACTIVE);
      // ⚠️ Assert the fixture really has the property under test, or every check below passes vacuously.
      rec("both mods define the spirit and both grant it", hasDef(SOURCE) && hasGrant(SOURCE) && hasDef(ACTIVE) && hasGrant(ACTIVE),
        { SOURCE: [hasDef(SOURCE), hasGrant(SOURCE)], ACTIVE: [hasDef(ACTIVE), hasGrant(ACTIVE)] });

      // Exactly what public/app.js sends from the national-spirit editor: sourceRoot, no modPath.
      const r = await del({ sourceRoot: SOURCE });
      rec("the delete succeeds", r && r.ok === true, r);
      rec("the definition is gone from the source mod", !hasDef(SOURCE), "still there");
      // THE BUG: this grant used to survive, leaving `add_ideas = { doomed_spirit }` pointing at nothing.
      rec("…and its grant goes with it", !hasGrant(SOURCE), "the source mod still grants a spirit it no longer defines");
      // THE OTHER HALF: a mod the user was not editing must not be touched at all.
      rec("the active mod keeps its definition", hasDef(ACTIVE), "the wrong mod lost its definition");
      rec("…and keeps its grant", hasGrant(ACTIVE), "the wrong mod's country history was rewritten");
    }

    console.log("\n[CONTROL] with no sourceRoot, the active mod is still the target");
    {
      const ACTIVE = reset(null, "activemod");
      const OTHER = reset(null, "sourcemod");
      await makeActive(ACTIVE);
      const r = await del({});                      // no sourceRoot, no modPath — the old behaviour
      rec("the delete succeeds", r && r.ok === true, r);
      rec("the active mod loses the definition", !hasDef(ACTIVE), "not deleted");
      rec("…and the grant", !hasGrant(ACTIVE), "grant left behind");
      rec("the other mod is untouched", hasDef(OTHER) && hasGrant(OTHER), "the other mod was modified");
    }

    console.log("\n[CONTROL] sourceRoot pointing at the active mod behaves identically");
    {
      const ACTIVE = reset(null, "activemod");
      const OTHER = reset(null, "sourcemod");
      await makeActive(ACTIVE);
      const r = await del({ sourceRoot: ACTIVE });
      rec("the delete succeeds", r && r.ok === true, r);
      rec("definition and grant both go", !hasDef(ACTIVE) && !hasGrant(ACTIVE), { def: hasDef(ACTIVE), grant: hasGrant(ACTIVE) });
      rec("the other mod is untouched", hasDef(OTHER) && hasGrant(OTHER), "the other mod was modified");
    }
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  console.log("\n[the sibling deletes] only this one has a sourceRoot, and must stay the only one changed");
  {
    // event / decision / character / technology deletes have no sourceRoot concept — their definition
    // always lives in the active mod, so passing activeRoot is right for them. Pinned so that a later
    // "make it consistent" pass does not redirect them at a root they never had.
    const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const viaActive = (SRV.match(/unwireStartupItemEverywhere\(activeRoot,/g) || []).length;
    const viaDefinition = (SRV.match(/unwireStartupItemEverywhere\(definitionRoot,/g) || []).length;
    rec("the spirit delete unwires in the definition's mod", viaDefinition === 1, viaDefinition);
    rec("…and the other five still use the active mod", viaActive === 5, viaActive);
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== spirit delete stays in one mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
