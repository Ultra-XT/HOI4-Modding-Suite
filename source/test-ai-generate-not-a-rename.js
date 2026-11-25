// #ai-generate-renames-the-open-item — pressing an AI "Generate" button and then Save DELETED the item you
// had merely been looking at.
//
// Selecting an item in a sidebar records its on-disk identity (loadedEventFullId / loadedIdeaId /
// loadedToken / loadedIdentity) so that retyping the id is treated as a RENAME: the server strips the old
// block and deletes its localisation keys. That is correct for a rename.
//
// An AI generation REPLACES the whole form with a different item. It is a create, not a rename. But the AI
// handlers never cleared the recorded identity, so:
//
//   click a decision to look at it -> type a prompt -> Generate -> Save
//     => the decision you had open is gone from the file and stripped from the .yml,
//        under a status line reading "AI Decision successfully parsed and loaded into the form!"
//
// The ⧉ Duplicate button on each of these pages clears the identity for exactly this reason and says so in
// its own comment ("otherwise saving the copy would be read as renaming the ORIGINAL and delete it, which is
// the opposite of duplicating"). The AI paths simply never got the line.
//
// Found on Decisions, then confirmed on Events, Characters and National Spirits by checking each AI handler
// rather than trusting a file-wide grep: ideas.js DOES contain `loadedIdeaId = null`, but that line is in its
// Duplicate handler, not its AI handler — counting occurrences would have wrongly cleared it.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// Slice out the AI handler: from its parseJsonResponse call to the end of that try-block's success path.
// Scoping to the handler is the whole point — the identity clear must be THERE, not merely somewhere in the file.
function aiHandlerSlice(file) {
  const src = fs.readFileSync(path.join(__dirname, "public", file), "utf8");
  const at = src.indexOf("NovaAI.parseJsonResponse");
  if (at === -1) return "";
  // Back up a little to catch a clear placed just before the parse, and take a generous forward window.
  return src.slice(Math.max(0, at - 400), at + 2600);
}

const PAGES = [
  { file: "decisions.js", ident: "loadedIdentity" },
  { file: "events.js", ident: "loadedEventFullId" },
  { file: "characters.js", ident: "loadedToken" },
  { file: "ideas.js", ident: "loadedIdeaId" },
];

for (const p of PAGES) {
  const slice = aiHandlerSlice(p.file);
  ok(`${p.file}: the AI handler was found`, slice.length > 0, "no parseJsonResponse call");
  const clears = new RegExp(`${p.ident}\\s*=\\s*null`).test(slice);
  ok(`${p.file}: its AI handler clears ${p.ident}`, clears, slice.slice(0, 200));
  ok(`${p.file}: …and says why`, /ai-generate-renames-the-open/.test(slice), "no explanation comment");
}

// The Duplicate handlers must still clear it too — that is the precedent this fix follows, and losing it
// would reintroduce the original bug this project already fixed once.
const dupChecks = [
  ["events.js", "loadedEventFullId", "A copy is a NEW event"],
  ["ideas.js", "loadedIdeaId", "A copy is a NEW spirit"],
];
for (const [file, ident, marker] of dupChecks) {
  const src = fs.readFileSync(path.join(__dirname, "public", file), "utf8");
  const at = src.indexOf(marker);
  // Window sized from the real handlers: events.js has 627 chars of guard clauses between the comment and
  // the clear, so a 600-char window reported a regression that was not there.
  ok(`${file}: the Duplicate handler still clears ${ident}`,
    at !== -1 && new RegExp(`${ident}\\s*=\\s*null`).test(src.slice(at, at + 1200)), marker);
}

// characters.js clears the role record too — a generated character's roles are not the open character's.
{
  const slice = aiHandlerSlice("characters.js");
  ok("characters.js: the AI handler also clears the loaded ROLE record",
    /loadedRoles\s*=\s*null/.test(slice), slice.slice(0, 200));
}

console.log("\ntest-ai-generate-not-a-rename: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 15 ? 0 : 1;
