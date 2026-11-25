// A NEWLY CREATED TECH MUST GET A GRIDBOX (#new-tech-gridbox).
//
// A tech with no `gridboxtype = { name = "<id>_tree" }` is invisible: HOI4 logs "Found no grid box for
// tech X" and draws nothing, and Nova drops it as engine-unplaced. So adding a tech to an existing
// mod folder used to save correctly to disk and then VANISH from the tree on reload — in the editor and
// in the game alike. Reproduced on a throwaway copy of Millennium Dawn: created, drawn, written to
// custom_technologies.txt at 1,1, and gone after a reload.
//
// THE DANGEROUS PART, and why these checks are strict: the obvious fix — "give every tech without a
// gridbox one" — is wrong twice over.
//   1. A tech does NOT need its own gridbox. It normally renders through the one its prerequisite chain
//      resolves to; MD's support_weapons2 has none and draws correctly. Handing such a tech a gridbox
//      RE-ANCHORS it somewhere else and silently moves it.
//   2. Mods ship unplaced techs of their own. Millennium Dawn has ~51 with no DLC gate and no hidden
//      flag. Giving those gridboxes would make 51 techs appear in someone's tree that the mod never
//      showed — changing their mod, uninvited.
// A first attempt did both, and also cloned the folder's item templates, which rewrote MD's
// techtree_electronics_folder_item and moved icon positions: 561 lines of diff against the original.
// The shipped version writes ONE gridbox per newly created tech and produces a 12-line diff.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const client = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
// Slice from a top-level function declaration to the next one. Deliberately NOT brace-counting: these
// functions contain regex literals like /position\s*=\s*\{/ whose escaped `\{` has no matching `\}`, so
// a naive counter closes the body early and every "this must NOT appear" check then passes vacuously.
const bodyOf = (src, needle) => {
  const i = src.indexOf(needle);
  if (i === -1) return "";
  const next = src.indexOf("\nfunction ", i + needle.length);
  return src.slice(i, next === -1 ? src.length : next);
};

// ---- CLIENT: track what WE created, and only that ----
ok(/let newlyCreatedTechIds = new Set\(\);/.test(client), "the client tracks newly created techs");
ok(/newlyCreatedTechIds\.add\(id\);/.test(client), "creating a tech records its id");
ok(/newTechIds: \[\.\.\.newlyCreatedTechIds\],/.test(client), "the save payload carries those ids");
ok(/newlyCreatedTechIds = new Set\(\); \/\/ their gridboxes are written/.test(client),
  "the set is cleared after a successful save, so a later save cannot re-add gridboxes");

// ---- SERVER: scoped strictly to the reported ids ----
const fn = bodyOf(server, "function addGridboxesForNewTechs(");
ok(fn.length > 0, "addGridboxesForNewTechs exists");
ok(/const wanted = new Set\(Array\.isArray\(newIds\) \? newIds : \[\]\);/.test(fn),
  "it works from the caller's id list");
ok(/if \(!wanted\.size\) return \{ changed: false, added: 0 \};/.test(fn),
  "no ids means no write at all");
ok(/wanted\.has\(t\.name\) && !baseNames\.has\(`\$\{t\.name\}_tree`\)/.test(fn),
  "only a REQUESTED tech that has no gridbox gets one — never a mod's own unplaced techs");
// the thing that corrupted MD last time must not be reachable from here
ok(!/ensureFolderItemTemplates/.test(fn),
  "it never clones item templates (that rewrote Millennium Dawn's electronics layout)");
ok(!/relayout/i.test(fn), "it never relayouts a folder");
ok(!/folder\.position|position\s*=\s*\{\s*x\s*=\s*\$\{t\.x\}/.test(fn), "it never rewrites a tech's position");

// ---- SERVER: works for a mod that does NOT ship its own gui ----
// Most mods don't. Bailing when the file is absent left the original bug fully intact for them —
// verified on a throwaway copy with no interface/ directory: the tech still vanished on reload.
ok(/if \(fs\.existsSync\(modGuiPath\)\) \{[\s\S]{0,200}?\} else \{/.test(fn),
  "a missing mod gui is handled rather than bailed on");
ok(/resolveDependencyRootsForAssets\(modRoot\), gameRoot/.test(fn),
  "the base gui is taken from the dependency mod first, then the game");
// The gui filename is chosen at runtime now — a doctrine folder lives in countrydoctrinetreeview.gui, not
// countrytechtreeview.gui (#doctrine-folder-no-gridbox) — so the reason names whichever file was needed.
// The behaviour this pins is unchanged: decline, do not throw.
ok(/return \{ changed: false, added: 0, reason: `no base \$\{guiName\} to copy` \}/.test(fn),
  "with no base gui anywhere it declines rather than throwing");
ok(/fs\.mkdirSync\(path\.dirname\(modGuiPath\), \{ recursive: true \}\)/.test(fn),
  "the interface directory is created when materialising the copy");
// ...and it must not dump a base-gui copy into a mod for nothing
ok(/if \(!wanted\.size\) return/.test(fn) && /if \(!missing\.length\) return/.test(fn),
  "both early returns fire BEFORE any copy is materialised, so a no-op save writes nothing");

// ---- SERVER: the write itself is guarded like every other gui write ----
ok(/if \(!bracesAreBalanced\(text\)\) throw new Error/.test(fn), "it refuses to start on an unbalanced file");
ok(/assertFolderGridboxesUnique\(updated, folderKey\)/.test(fn), "it refuses to create a duplicate gridbox");
ok(/if \(!bracesAreBalanced\(updated\)\) throw new Error/.test(fn), "it refuses to write an unbalanced result");
ok(/writeTechTreeGuiBackedUp\(modGuiPath, updated\)/.test(fn), "the write is backed up first");

// ---- SERVER: anchored on the folder's own first gridbox, as a SIBLING of it ----
ok(/firstGridboxGeometryInFolder\(text, folderKey\)/.test(fn), "it reads the folder's first gridbox geometry");
ok(/geo\.parentName && geo\.parentName !== folderKey \? geo\.parentName : folderKey/.test(fn),
  "the new gridbox is injected as a SIBLING of the existing ones (positions are parent-relative)");
const geoFn = bodyOf(server, "function firstGridboxGeometryInFolder(");
ok(/parentName/.test(geoFn), "the geometry helper reports the enclosing container");
ok(/slotW: slot \? \+slot\[1\] : 70/.test(geoFn), "it carries slotsize across");

// ---- SERVER: its own marker, so it cannot disturb anything else ----
const appendFn = bodyOf(server, "function appendBlockInsideContainer(");
ok(appendFn.length > 0, "appendBlockInsideContainer exists");
ok(/NOVA_NEW_TECH_GRIDBOXES/.test(fn), "the block carries its own distinct marker");
ok(!/NOVA_GRIDBOXES[^_]/.test(fn), "it does not reuse the custom-folder marker (which is relayout-managed)");

// ---- SAVE PATH: wired in, and a gui failure never undoes a committed tech save ----
ok(/const newIds = Array\.isArray\(req\.body && req\.body\.newTechIds\)/.test(server),
  "save-batch reads newTechIds from the request");
ok(/addGridboxesForNewTechs\(activeRoot, folderKey, ids\)/.test(server), "save-batch calls it per folder");
ok(/\/\/ Never fail the save for this: the techs are already written/.test(server),
  "a gridbox failure is caught — the tech save has already committed");

console.log(`test-research-new-tech-gridbox: ${checks} checks passed`);
