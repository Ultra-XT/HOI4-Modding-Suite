// #ctrl-s-saves-the-hidden-editor
//
// CTRL+S SAVED AN EDITOR THAT WAS NOT ON SCREEN.
//
// save-shortcut.js maps Ctrl/Cmd+S onto the page's primary Save button, by taking the first id in a list
// that EXISTS in the document. That is fine while a page has one editor. The Spirit maker has two: its
// "Designers & Companies" mode hides the national-spirit form (body.mio-mode CSS) and renders a company
// editor in its place, and hides #saveIdeaBtn with it — #mioSaveBtn, "💾 Save company", is the button
// actually on screen.
//
// Ctrl+S still found #saveIdeaBtn. It exists, it is not disabled, it is merely invisible. So the shortcut
// clicked it and saved the hidden spirit form. Measured on Millennium Dawn with a company half-written:
//
//     Ctrl+S in Designers & Companies mode  →  POST /api/ideas/upsert-definition
//                                           →  no /api/mio at all
//
// Two things went wrong at once: the company draft — id, name, equipment and research categories, base
// bonuses, traits with bonus rows — was never written, and an unrelated idea was rewritten from whatever
// the hidden fields still held from the last spirit that was open.
//
// The rule is now: Ctrl+S saves the editor you can see, and if none is visible it does nothing. Saving
// something the user cannot see is worse than not saving.
//
// Verified in the running Spirit maker on Millennium Dawn, after the fix:
//     National Spirits mode      → Ctrl+S sends POST /api/ideas/upsert-definition   (unchanged)
//     Designers & Companies mode → Ctrl+S reaches the company editor's own validation,
//                                  and once the draft is valid sends POST /api/mio and nothing else
//
// One claim from the same sweep is REFUTED and recorded here so it is not re-filed: that the header Save
// button could be CLICKED in company mode and rewrite a spirit. It cannot — it is hidden, with
// getClientRects().length === 0. Only the keyboard shortcut could reach it.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
const SRC = stripJsComments(fs.readFileSync(path.join(PUB, "save-shortcut.js"), "utf8"));

console.log("\n[the rule] Ctrl+S targets what is rendered");
{
  rec("the shortcut still exists", /keydown/.test(SRC) && /\.click\(\)/.test(SRC), "save-shortcut.js changed shape");
  rec("…and knows about the company editor's Save", /"mioSaveBtn"/.test(SRC), "the second editor on the Spirit page is invisible to it again");
  rec("…and picks by whether the button is on screen", /getClientRects\(\)\.length > 0/.test(SRC), "it takes the first button that merely EXISTS");
  // ⚠️ offsetParent is null for position:fixed too, so a save button in a fixed toolbar would be skipped.
  rec("…using getClientRects, not offsetParent", !/offsetParent/.test(SRC), "offsetParent would skip a fixed-position save button");
  rec("…and still refuses a disabled button", /btn\.disabled/.test(SRC), "a disabled Save could be triggered");
  rec("…and still stops the browser's own Save dialog", /preventDefault\(\)/.test(SRC), "Ctrl+S would open 'Save page as'");
}

console.log("\n[RUN IT] the picker, against stand-in documents");
{
  // Lift SAVE_IDS + isOnScreen + findSaveBtn out and run them over fake documents.
  const from = SRC.indexOf("const SAVE_IDS");
  const at = SRC.indexOf("function findSaveBtn()", from);
  let block = "";
  if (at !== -1) {
    const open = SRC.indexOf("{", at);
    let d = 0;
    for (let i = open; i < SRC.length; i++) { if (SRC[i] === "{") d++; else if (SRC[i] === "}") { d--; if (d === 0) { block = SRC.slice(from, i + 1); break; } } }
  }
  rec("the picker was extracted", block.includes("findSaveBtn") && block.length > 150, block.length);

  const btn = (id, visible) => ({ id, disabled: false, getClientRects: () => (visible ? [{}] : []) });
  const run = (buttons) => {
    const byId = Object.fromEntries(buttons.map((b) => [b.id, b]));
    const ctx = { document: { getElementById: (id) => byId[id] || null }, picked: null };
    vm.createContext(ctx);
    vm.runInContext(block + "\nconst _b = findSaveBtn(); picked = _b ? _b.id : null;", ctx);
    return ctx.picked;
  };

  rec("an ordinary page picks its one visible Save",
    run([btn("saveCharBtn", true)]) === "saveCharBtn", run([btn("saveCharBtn", true)]));

  // ⭐ THE BUG, PINNED: both buttons exist; only the company one is rendered.
  rec("the Spirit page in company mode picks the COMPANY save",
    run([btn("saveIdeaBtn", false), btn("mioSaveBtn", true)]) === "mioSaveBtn",
    run([btn("saveIdeaBtn", false), btn("mioSaveBtn", true)]));
  // …and the other way round, which is the same page a moment earlier.
  rec("…and in spirit mode picks the SPIRIT save",
    run([btn("saveIdeaBtn", true), btn("mioSaveBtn", false)]) === "saveIdeaBtn",
    run([btn("saveIdeaBtn", true), btn("mioSaveBtn", false)]));
  rec("…even though the spirit button is listed first", SRC.indexOf('"saveIdeaBtn"') < SRC.indexOf('"mioSaveBtn"'), "list order changed — the visibility rule is what decides, but keep the note honest");

  // Nothing rendered → do nothing. Falling back to a hidden button is the bug itself.
  rec("a page with only hidden Saves does nothing",
    run([btn("saveIdeaBtn", false), btn("mioSaveBtn", false)]) === null,
    run([btn("saveIdeaBtn", false), btn("mioSaveBtn", false)]));
  rec("…and a page with no Save at all does nothing", run([]) === null, run([]));
}

console.log("\n[the page] the two editors really are exclusive");
{
  const HTML = fs.readFileSync(path.join(PUB, "ideas.html"), "utf8");
  // The CSS that hides one editor is what creates the situation; if it goes, re-check the premise.
  rec("company mode still hides the spirit form", /body\.mio-mode .idea-editor-panel > \*:not\(#ideaModeSwitch\):not\(#mioEditorMount\)/.test(HTML), "the mode CSS changed");
  rec("…and the company editor mounts inside the panel", /id="mioEditorMount"/.test(HTML), "the mount moved");
  // The header Save sits OUTSIDE the panel, which is why the CSS above does not hide it — ideas.js hides it
  // separately. That asymmetry is the reason the shortcut could still find it.
  rec("the header Save is outside that panel", HTML.indexOf('id="saveIdeaBtn"') < HTML.indexOf('class="idea-editor-panel"'), "layout changed — re-check which Save is visible when");
  const IDEAS = stripJsComments(fs.readFileSync(path.join(PUB, "ideas.js"), "utf8"));
  rec("…and ideas.js is what hides it in company mode", /mio-mode/.test(IDEAS), "nothing hides the spirit Save any more");
}

console.log(`\n=== ctrl+s saves the visible editor: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
