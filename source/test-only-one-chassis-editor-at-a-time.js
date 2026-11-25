// #two-chassis-editors — THE MODULAR CHASSIS EDITOR WIRED ITSELF TO A HIDDEN COPY OF ITSELF.
//
// The same editor has two entrances. "＋ New weapon…" inside the designer renders it INLINE into #dsgBody;
// "＋ New equipment" → Modular chassis renders it into the MODAL overlay #dsgPicker. Both write the same
// markup, so both produce elements carrying the same ids — chId, chName, chAddSlot, chType, chDomain,
// chPriority, chYear, chSlots, chStatus — and slot rows carrying the same data-si indices.
//
// Open the second while the first is still on screen and every one of those exists TWICE. Measured in the
// running app before the fix: 9 duplicated ids, .mio-trait[data-si="0"] matching 2 elements, 9 slots in
// #dsgBody plus 10 in the modal, and document.getElementById("chId") returning the INLINE one while the
// MODAL was the editor actually on screen.
//
// Everything the editor does to itself goes through exactly those lookups — the bind() calls that keep the
// draft in step with what is typed, $("chAddSlot"), and the per-slot .ch-cat-add inputs. So the modal's
// buttons operated on the hidden inline form. Adding a module category to a new slot did nothing visible,
// and add/remove slot re-rendered from a draft the visible fields were never writing into. Reported as
// "add on new part slots broken" and "add/remove slot resets the mini page".
//
// The invariant: ONE chassis editor at a time. Whichever host is not the active one is torn down before
// rendering, through the paths the editor's own Cancel and close buttons already use.
//
// Comments are stripped first — the fix explains itself in prose directly above the code, and a naive grep
// would match its own explanation.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + detail));
  if (!ok) fails.push(label);
};

// The body of renderChassisEditor, from its declaration to the next top-level function.
function chassisEditorBody(src) {
  const at = src.indexOf("function renderChassisEditor()");
  if (at === -1) return "";
  const next = src.indexOf("\n  function ", at + 10);
  return src.slice(at, next === -1 ? at + 12000 : next);
}

try {
  const body = chassisEditorBody(SRC);
  rec("renderChassisEditor was found", body.length > 200, body.length + " chars");

  console.log("\n1. Both entrances really do collide (or there is nothing to guard)");
  // If these two facts ever stop being true the guard is pointless, and this test should say so rather
  // than quietly passing over a changed design.
  rec("there are two hosts for the one editor", /chassisHostEl\s*=\s*\(\)\s*=>/.test(SRC) &&
    /dsgBody/.test(SRC) && /dsgPicker/.test(SRC));
  rec("both render the same id-bearing markup", /id="chId"/.test(body) && /id="chAddSlot"/.test(body));

  console.log("\n2. The other host is torn down BEFORE this one renders");
  const guardAt = body.search(/stale\s*=\s*inline\s*\?/);
  const renderAt = body.search(/ov\.innerHTML\s*=/);
  rec("a teardown of the non-active host exists", guardAt !== -1);
  rec("...and it runs before the editor is written", guardAt !== -1 && renderAt !== -1 && guardAt < renderAt,
    "teardown@" + guardAt + "  render@" + renderAt);
  // Cheap enough to run on every re-render: add/remove slot calls this function again each time.
  rec("it only acts when the other host actually holds an editor",
    /stale\s*&&\s*stale\.querySelector\("#chId"\)/.test(body));

  console.log("\n3. It tears down through the paths that already existed");
  // Blanking #dsgBody outright would leave the designer empty; renderModularDesigner is what the editor's
  // own Cancel button uses to put it back.
  rec("the inline host is restored to the designer, not blanked", /else\s+renderModularDesigner\(\)/.test(body));
  rec("the modal host is closed the way its own close button closes it",
    /stale\.style\.display\s*=\s*"none";\s*stale\.innerHTML\s*=\s*""/.test(body));

  console.log("\n4. The check can fail (composed here, not assumed)");
  const OLD = 'function renderChassisEditor() {\n' +
    '    const inline = S.chassisHost === "inline";\n' +
    '    const ov = chassisHostEl(); if (!ov) return;\n' +
    '    const d = S.chassisDraft;\n' +
    '    ov.innerHTML = "x";\n';
  const oldGuard = OLD.search(/stale\s*=\s*inline\s*\?/);
  rec("the version that shipped the bug is rejected", oldGuard === -1);

  console.log(`\n=== only one chassis editor at a time: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
