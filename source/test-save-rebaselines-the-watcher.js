// #save-does-not-rebaseline-the-watcher
//
// SAVING ASKED WHETHER TO DISCARD THE WORK IT HAD JUST SAVED.
//
// A successful save leaves the form holding exactly what is now on disk, so it has to become the watcher's
// new baseline. The Decisions maker did that, with a comment saying why — "saved, so there is nothing
// unsaved to warn about". The Spirit, Event and Character makers did not, and their baseline stayed at
// whatever the item was LOADED with. So the moment a save finished the page still read dirty:
//
//   Spirits and Events auto-select the saved item, and that click goes through the item-switch guard — so
//   the "unsaved changes" prompt lands immediately, stacked on top of the success dialog.
//   Characters does not auto-select, so the prompt is deferred to the next character the user clicks.
//
// Measured in all three running makers, with the write endpoints stubbed so nothing reached disk:
//
//   Spirits    "Successfully saved tp_communism_banned into tp_ideas.txt!"
//              then "You have unsaved changes in the Spirit maker. Switch spirit anyway and…"
//   Events     "Successfully saved to events/tp_events.txt and generated English local…"
//              then "You have unsaved changes in the Event Maker. Switch event anyway and l…"
//   Characters "✓ Saved to history/characters/ABK.txt", then on the NEXT card clicked:
//              "You have unsaved changes in the Character maker. Switch character…"
//
// ⭐ The page list is DERIVED. Any maker that owns an unsaved-work watcher has to appear here — a new one
// added without a re-baseline fails this test rather than shipping the same bug a fourth time.
"use strict";
const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const PUB = path.join(__dirname, "public");
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));

console.log("\n[which makers own an unsaved-work watcher]");
const OWNERS = [];
{
  for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith(".js")).sort()) {
    const src = read(f);
    // Two shapes exist: the shared watcher, and the Decisions maker's own snapshot-compare.
    if (/novaWatchUnsaved\(\{/.test(src)) OWNERS.push({ file: f, kind: "shared" });
    else if (/const decEditorSnapshot = /.test(src)) OWNERS.push({ file: f, kind: "own snapshot" });
  }
  console.log("  found: " + OWNERS.map((o) => o.file + " (" + o.kind + ")").join(", "));
  rec("the makers with a watcher were found", OWNERS.length >= 4, OWNERS);
  // If this list grows, the new page needs a row in the table below — that is the point of deriving it.
  const known = ["characters.js", "decisions.js", "events.js", "ideas.js"];
  rec("…and every one of them is covered below",
    OWNERS.every((o) => known.includes(o.file)),
    { found: OWNERS.map((o) => o.file), covered: known });
}

// Per page: where the save commits, and the re-baseline that must follow it.
const TABLE = [
  { file: "ideas.js", watcher: "ideaUnsaved", rebaseline: "if (ideaUnsaved) ideaUnsaved.markClean();",
    committed: 'nbAlert(`Successfully saved ${ideaId} into ${targetRelativeFile}!${dupeLine}${ownerWarn}`);',
    threw: "if (data.error) throw new Error(data.error);", reload: "loadIdeasList();", endpoint: "/api/ideas/upsert-definition" },
  { file: "events.js", watcher: "evUnsaved", rebaseline: "if (evUnsaved) evUnsaved.markClean();",
    committed: "const savedFileName = data.eventPath", threw: "if (data.error) throw new Error(data.error);", reload: "loadEventsList();", endpoint: "/api/events/save" },
  { file: "characters.js", watcher: "chUnsaved", rebaseline: "if (chUnsaved) chUnsaved.markClean();",
    committed: "loadedToken = body.token;", threw: 'if (!res.ok || data.error) throw new Error(data.error || "Save failed");', reload: "await loadList();", endpoint: "/api/characters/save" },
  { file: "decisions.js", watcher: "decCleanSnapshot", rebaseline: "markDecisionEditorClean();",
    committed: "nbAlert(`Successfully saved to ${data.decisionPath}", threw: "if (data.error) throw new Error(data.error);", reload: "loadDecisionsList(", endpoint: "/api/decisions/save" },
];

console.log("\n[every one of them re-baselines on a successful save]");
for (const t of TABLE) {
  const src = read(t.file);
  const name = t.file.replace(".js", "");
  const committedAt = src.indexOf(t.committed);
  // ⭐ SCOPED TO THE SAVE HANDLER. Searching from the FIRST error check in the file put the window around
  // most of the page, and every one of these makers calls markClean somewhere else too — on loading an item
  // and on starting a new draft. Written that way, this test passed for a page with no save re-baseline at
  // all, because it found the new-draft one 200 lines earlier. The window runs from the error check
  // IMMEDIATELY BEFORE the commit point to the list reload that follows it.
  const threwAt = committedAt === -1 ? src.indexOf(t.threw) : src.lastIndexOf(t.threw, committedAt);
  const reloadAt = src.indexOf(t.reload, committedAt === -1 ? 0 : committedAt);
  let rebaseAt = -1;
  for (let i = src.indexOf(t.rebaseline); i !== -1; i = src.indexOf(t.rebaseline, i + 1)) {
    if (i > threwAt && (reloadAt === -1 || i < reloadAt)) { rebaseAt = i; break; }
  }
  rec(`${name}: the save's error check was found`, threwAt !== -1, t.threw);
  rec(`${name}: …and the point the save has committed`, committedAt !== -1, t.committed);
  rec(`${name}: re-baselines after a successful save`, rebaseAt !== -1, `no ${t.rebaseline} between the error check and ${t.reload}`);
  rec(`${name}: …after the error check, so a FAILED save stays dirty`, rebaseAt > threwAt, { threwAt, rebaseAt });
  rec(`${name}: …and before the list reload that re-selects the item`, reloadAt === -1 || rebaseAt < reloadAt, { rebaseAt, reloadAt });
  // ⭐ AND NOWHERE EARLIER IN THE HANDLER. "after the error check" alone passes with a SECOND re-baseline
  // added before it, because the later one is still there to be found — the back-out proved exactly that.
  // A re-baseline between the request and the error check would mark a page clean on a save that FAILED,
  // which is the same silent loss from the other side.
  const fetchAt = src.lastIndexOf(t.endpoint, threwAt === -1 ? undefined : threwAt);
  rec(`${name}: the save request was found`, fetchAt !== -1, t.endpoint);
  const early = fetchAt !== -1 && threwAt !== -1 && src.slice(fetchAt, threwAt).includes(t.rebaseline);
  rec(`${name}: …and nothing re-baselines before the error check`, !early,
    "a failed save would mark the page clean and lose the work");
  // ⭐ markClean, not markCleanUnlessTouched: at this instant the form IS the file. Using the "unless touched"
  // variant here would keep the page dirty whenever the user had typed at any point, which is always.
  const window300 = src.slice(Math.max(0, rebaseAt - 60), rebaseAt + 120);
  rec(`${name}: …with markClean, not markCleanUnlessTouched`, rebaseAt !== -1 && !/markCleanUnlessTouched/.test(window300), window300.slice(0, 160));
}

console.log("\n[CONTROL] the guards this makes usable are still there");
{
  rec("Spirits still asks before switching spirit", /confirmDiscard\("Switch spirit"/.test(read("ideas.js")), "the guard went");
  rec("Events still asks before switching event", /confirmDiscard\("Switch event"/.test(read("events.js")), "the guard went");
  rec("Characters still asks before switching character", /confirmDiscard\("Switch character"/.test(read("characters.js")), "the guard went");
  rec("Decisions still asks before switching decision", /confirmDiscardDecisionEdits\(/.test(read("decisions.js")), "the guard went");
  rec("…and an untouched new draft is still baselined", /#new-draft-is-not-unsaved-work/.test(fs.readFileSync(path.join(PUB, "events.js"), "utf8")),
    "the prompt-about-the-blank-form bug would come back");
}

console.log(`\n=== save re-baselines the watcher: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
