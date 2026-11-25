// MOD-SWITCH GUARD invariants (#modswitch-guard).
//
// Changing the mod dropdown reloads the whole catalog (refreshCountryList -> loadCountryTechs ->
// loadCatalog), which discarded every unsaved edit without asking. Two properties keep that safe and
// they are easy to regress, so they are pinned here rather than only in the live test:
//
//   - the handler must CONSULT `dirty` before switching, and
//   - on cancel it must put the SELECTOR back. A selector showing mod B while the editor is still on
//     mod A is worse than the original bug: everything you do next looks like it applies to B.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// the whole change handler
const i = src.indexOf('selector.addEventListener("change"');
ok(i !== -1, "the mod selector has a change handler");
const open = src.indexOf("{", i);
let d = 0, end = open;
for (let j = open; j < src.length; j++) {
  if (src[j] === "{") d++;
  else if (src[j] === "}") { d--; if (!d) { end = j; break; } }
}
const handler = src.slice(open + 1, end);

ok(/\bdirty\b/.test(handler), "the mod switch consults the dirty flag");
ok(/e\.target\.value = lastModPath/.test(handler),
  "on an unsaved switch the selector is reverted until the user agrees");
ok(/novaConfirm/.test(handler), "it asks with the app's own confirm dialog");
ok(/confirm\(msg\)/.test(handler), "there is a plain-confirm fallback when novaConfirm is absent");
ok(/dirty = false/.test(handler), "confirming clears dirty so the reload does not double-prompt");
ok(/selector\.value = next/.test(handler), "confirming leaves the selector on the mod actually loaded");
ok(/applyModSwitch\(next\)/.test(handler), "both paths go through one apply function");

// the apply function must still do everything the original inline handler did
const ai = src.indexOf("const applyModSwitch =");
ok(ai !== -1, "applyModSwitch exists");
const abody = src.slice(ai, src.indexOf("};", ai));
for (const step of ["localStorage.setItem(\"activeModPath\"", "updateVanillaBanner()", "loadGenesisScriptedDefs", "refreshCountryList()"]) {
  ok(abody.includes(step), `applyModSwitch still performs: ${step}`);
}
ok(/lastModPath = value/.test(abody), "applyModSwitch records the new mod as the baseline for the next switch");

// the guard must not fire when there is nothing to lose
ok(/if \(!dirty \|\| next === lastModPath\)/.test(handler),
  "a clean switch (or a no-op re-select) is not interrupted");

console.log(`test-research-modswitch: ${checks} checks passed`);
