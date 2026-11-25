// ⛔ A FIX THAT NEVER REACHES THE USER IS NOT A FIX.
//
// collectAllTechnologies caches the parsed tech catalogue to disk, keyed on
// `fingerprintDirs(dirs) + "|tcpNN"`. fingerprintDirs hashes only each .txt file's SIZE and MTIME, so it
// cannot notice that NOVA'S OWN PARSER changed — carrying that is the entire job of the tcpNN suffix, and the
// comment above it says so twice.
//
// It stopped being maintained. The tag sat on tcp16 from 2026-07-29 while FIVE commits changed the shape of
// the parse:
//     407fb89 08-01  modifier / ai_will_do re-read from the UN-stripped block
//     e77065d 08-15  scalarComments          (the note beside a value)
//     c5ad1f4 08-16  enableEquipmentsRawAll  (a second enable_equipments block and its DLC limit)
//     683b65e 08-28  researchCostRaw         (`research_cost = 2.0` rewritten as `2`)
//     231568b 08-28  leadComments            (every note moved to the bottom of the block)
//
// A modder holding a warm cache kept the OLD parse, so serializeTechnology found none of those fields on the
// model, fell back, and every one of those bugs came back — silently, and arriving one save too late.
//
// ⭐ THE GUARD IS DERIVED, NOT TYPED. It reads the set of model fields serializeTechnology actually depends
// on, straight out of the source, and pins it. Add a field to the parse and this fails, telling you to bump
// the tag — which is the step that was missed five times running. A hand-written field list would rot the
// same way the tag did.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

function extractFunction(src, name) {
  const at = src.indexOf("function " + name);
  if (at === -1) return null;
  const open = src.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// The fields the WRITER depends on. If the parse stops producing one of these, or starts producing a new one,
// a cache written by the old build feeds the new writer a model it cannot serialize correctly.
const PINNED_FIELDS = [
  "aiWillDo", "authoredFields", "categories", "categoriesRaw", "dependencies", "doctrine",
  "enableEquipments", "enableEquipmentsRaw", "enableEquipmentsRawAll", "extraScript", "folder",
  "folderRaw", "forceSmallLayout", "headerComment", "id", "isHidden", "leadComments", "leadsTo", "modifiers", "mutuallyExclusive",
  "pathMeta", "posVarX", "posVarY", "prerequisites", "researchCost", "researchCostRaw", "scalarComments",
  "showEquipmentIcon", "startYear", "subTechnologies", "subTechnologiesRaw", "x", "y", "year",
];
// Bump BOTH of these together, or neither. That is the whole point.
//
// tcp19 is the first bump here whose cause was NOT a change to the field list, so PINNED_FIELDS is
// deliberately unchanged: #vanilla-owns-itself changed WHICH FILES get read for a given pair of roots, not
// what is read out of them. The cached answer for "activeRoot === the game directory" was an empty array,
// and fingerprintDirs hashes only each .txt's size and mtime — neither of which a server.js fix moves — so
// without the bump every user who had ever opened the base game in Research would keep the empty tree.
// The lesson generalises: this tag has to move when the RESULT changes, not only when the SHAPE does.
//
// tcp20 is the same story from the other direction. #tech-in-two-tabs ADDED a model field, `extraFolders`,
// and my first move was to add it to PINNED_FIELDS — which this test correctly rejected with
// "gone: extraFolders". PINNED_FIELDS is derived from what serializeTechnology reads, and extraFolders is
// deliberately DISPLAY-ONLY: the writer must never see it, or the model's single folder name would overwrite
// the first folder block. So the list is unchanged and only the tag moved.
//
// ⚠️ Note the gap that leaves: a display-only field still has to bump the tag, because a warm cache without
// it serves an incomplete tree, and NOTHING here derives that. The tag comment in server.js is the record.
//
// tcp22 is tcp19's kind again: #tech-catalog-lists-nested-blocks changed WHICH BLOCKS count as technologies (brace
// depth instead of indentation), not what is read out of one, so PINNED_FIELDS is unchanged and only the tag moved.
const PINNED_TAG = "tcp22";

try {
  console.log("1. The tag exists and is the one this test was pinned against");
  // (any arguments: fingerprintDirs also hands back each file's time now, for savedInTheTickOf)
  const tagMatch = /fingerprintDirs\(dirs\b[^)]*\) \+ "\|(tcp\d+)"/.exec(SRC);
  rec("the cache fingerprint carries a parser tag", !!tagMatch, tagMatch ? tagMatch[1] : "NOT FOUND");
  rec(`…and it is ${PINNED_TAG}`, !!tagMatch && tagMatch[1] === PINNED_TAG,
    tagMatch ? `found ${tagMatch[1]}, pinned ${PINNED_TAG}` : "no tag");

  console.log("\n2. The bump is documented, like every one before it");
  // Each historical bump has a `// tcpNN = …` line saying what changed. An undocumented bump is how the next
  // person fails to notice the convention exists.
  rec(`there is a "// ${PINNED_TAG} = …" line explaining it`,
    new RegExp("//\\s*" + PINNED_TAG + "\\s*=").test(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")),
    "the comment block is the only record of why each bump happened");

  console.log("\n3. The parse shape is what the tag was bumped for");
  const fn = extractFunction(SRC, "serializeTechnology");
  rec("serializeTechnology was found", !!fn && fn.length > 2000, fn ? fn.length + " chars" : "NOT FOUND");
  if (fn) {
    const found = [...new Set((fn.match(/\btech\.[A-Za-z_][A-Za-z0-9_]*/g) || []).map((s) => s.slice(5)))].sort();
    const added = found.filter((f) => !PINNED_FIELDS.includes(f));
    const gone = PINNED_FIELDS.filter((f) => !found.includes(f));
    rec("no NEW model field appeared without the tag being bumped", added.length === 0,
      added.length ? `added: ${added.join(", ")} — bump the tag and update PINNED_FIELDS` : "none");
    rec("…and none disappeared", gone.length === 0,
      gone.length ? `gone: ${gone.join(", ")} — bump the tag and update PINNED_FIELDS` : "none");
    // A single hash makes the failure message short when several change at once.
    const h = (a) => crypto.createHash("sha1").update(a.join("|")).digest("hex").slice(0, 12);
    rec("…so the parse shape still hashes to the pinned value", h(found) === h(PINNED_FIELDS),
      `${h(found)} vs ${h(PINNED_FIELDS)}`);
  }

  console.log("\n4. The fields the five missed commits added are all present");
  // If any of these is absent, the catch-up bump was premature or a fix was reverted.
  for (const f of ["scalarComments", "enableEquipmentsRawAll", "researchCostRaw", "leadComments"]) {
    rec(`${f} is still read by the writer`, !!fn && fn.includes("tech." + f));
  }

  console.log("\n5. The mechanism this guards is still the mechanism");
  // If the fingerprint ever starts hashing content rather than size+mtime, this whole tag convention becomes
  // unnecessary — and this test should be revisited rather than left asserting a dead rule.
  const fp = extractFunction(SRC, "fingerprintDirs");
  rec("fingerprintDirs was found", !!fp, fp ? fp.length + " chars" : "NOT FOUND");
  rec("…and it still hashes only size and mtime, which is why the tag is needed",
    !!fp && /mtimeMs/.test(fp) && !/readFileSync/.test(fp),
    "if it hashed content, a parser change would still be invisible — but a FILE change would not need the tag");

  console.log("\n6. This would have caught the five that slipped through");
  // Compose the pre-fix field set: the four fields those commits added, removed.
  const preFix = PINNED_FIELDS.filter((f) => !["scalarComments", "enableEquipmentsRawAll", "researchCostRaw", "leadComments"].includes(f));
  const h2 = (a) => crypto.createHash("sha1").update(a.join("|")).digest("hex").slice(0, 12);
  rec("the old parse shape hashes differently", h2(preFix) !== h2(PINNED_FIELDS),
    "so adding those fields would have failed this test until the tag moved");

  console.log(`\n=== the tech cache tag tracks the parse: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
