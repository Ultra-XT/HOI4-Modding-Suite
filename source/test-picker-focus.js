// Every "Browse" picker modal must focus its search box when it opens, so you can type to filter immediately
// instead of having to click the field first. Country Setup got this in 95dc485; this locks the same invariant
// across the maker pickers (events image / decisions icon / ideas icon / characters portrait). Static source
// check (the picker open handlers live deep in editor flows that are awkward to drive headlessly; the runtime
// behaviour is spot-checked live). Run: node test-picker-focus.js  (auto-picked up by run-tests.js)
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const read = (f) => fs.readFileSync(path.join(__dirname, "public", f), "utf8");

// [file, modal-open marker, the .focus() call its open handler must make]
const PICKERS = [
  ["events.js", 'eventImagePickerModal.style.display = "block"', "eventImagePickerSearch.focus()"],
  ["decisions.js", 'decisionIconPickerModal.style.display = "block"', "decisionIconPickerSearch.focus()"],
  ["ideas.js", 'iconPickerModal.style.display = "block"', "iconPickerSearch.focus()"],
  ["characters.js", 'portraitPickerModal.style.display = "block"', "portraitPickerSearch.focus()"],
  ["research.js", 'iconPickerModal.style.display = "block"', "iconPickerSearch.focus()"],
  ["country-setup.js", 'modal.style.display = "block"', "search.focus()"],
];

(() => {
  console.log("=== Picker search boxes focus on open ===");
  for (const [file, openMarker, focusCall] of PICKERS) {
    const src = read(file);
    ok(`${file}: picker open handler present`, src.includes(openMarker));
    ok(`${file}: focuses its search box on open (${focusCall})`, src.includes(focusCall));
  }
  // Research's icon picker also gained Esc + backdrop dismiss this pass (it only had the ✕ before).
  const research = read("research.js");
  ok("research.js: icon picker closes on a backdrop click", research.includes("e.target === iconPickerModal"));
  ok("research.js: icon picker closes on Escape", /Escape.*iconPickerModal|iconPickerModal[\s\S]{0,80}Escape/.test(research));
  console.log(`\nPICKER-FOCUS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
