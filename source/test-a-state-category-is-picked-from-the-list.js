// ⛔ #a-state-category-is-picked-from-the-list — THE STATE PANEL'S CATEGORY IS A LIST OF THE CATEGORIES THE GAME LOADS (tool campaign B2-7).
//
// The panel's Category was a free-text box (map.html #miCategoryInp). A typo ("twon") was written as typed; Map Errors then reported
// unknown_state_category, an error (the category is what gives a state its building slots), offered 🔧 Auto-fix for it, and Auto-fix changed
// nothing: no fixer handles the rule. The bulk bar next door already offered a select built from model.categorySlots. The panel now does
// the same, and keeps the state's own value visible whatever it is, so opening the panel never changes a state.
//
// map.html's tag, read; populateCategorySelect, lifted from public/map.js and run on a fake select; showInfo and 📋 Paste, read (comments
// masked). Binds no port, starts no server.
// Run: node test-a-state-category-is-picked-from-the-list.js
"use strict";
const vm = require("vm");
const { lift, MASKED, readSource } = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + JSON.stringify(x).slice(0, 600) : "")); }
};

console.log("=== 1. the panel's Category is a list, not a free-text box ===");
const html = readSource("public", "map.html");
const tag = (html.match(/<[^>]*\bid="miCategoryInp"[^>]*>/) || [""])[0];
ok(/^<select\b/i.test(tag), "map.html's #miCategoryInp is a <select>", tag);
ok(!/^<input\b/i.test(tag), "…not an <input> a typo can be typed into", tag);

console.log("=== 2. populateCategorySelect: the categories the game loads, and the state's own value always among them ===");
const code = lift("function populateCategorySelect(");
const run = (slots, current) => {
  const sel = { innerHTML: "", value: "" };
  const sb = { model: { categorySlots: slots } };
  vm.createContext(sb);
  vm.runInContext(code + "\nglobalThis.__f = populateCategorySelect;", sb);
  sb.__f(sel, current);
  const options = [...sel.innerHTML.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map((m) => ({ value: m[1], label: m[2] }));
  return { sel, options, values: options.map((o) => o.value) };
};
const SLOTS = { wasteland: 0, rural: 4, town: 6, city: 8, enclave: 0, megalopolis: 12 };
const KNOWN = Object.keys(SLOTS).sort();
{
  const r = run(SLOTS, "town");
  ok(JSON.stringify(r.values) === JSON.stringify(KNOWN), "a known category: the list is every category the mod loads, sorted, and nothing else", r.values);
  ok(r.sel.value === "town", "…the state's own is chosen", r.sel.value);
}
{
  const r = run(SLOTS, "twon");
  ok(r.values[0] === "twon" && /no state_category file defines it: pick one/.test(r.options[0].label) && r.sel.value === "twon",
    "a category no layer defines stays visible, first, and says so (so opening the panel does not change it)", r.options[0]);
  ok(JSON.stringify(r.values.slice(1)) === JSON.stringify(KNOWN), "…with every real category after it to pick from", r.values);
}
{
  const r = run(SLOTS, "ENCLAVE");
  ok(r.values.includes("ENCLAVE") && !r.values.includes("enclave") && r.values.length === KNOWN.length && r.sel.value === "ENCLAVE",
    "a category the game matches in another capitalisation is shown as written, in the known one's place, and not called unknown", r.options);
}
{
  const r = run(SLOTS, "");
  ok(r.values[0] === "" && /none/.test(r.options[0].label) && r.sel.value === "", "a state with no category: \"— none —\" is offered, and chosen", r.options[0]);
  const t = run(SLOTS, "town");
  ok(!t.values.includes(""), "…and is NOT offered to a state that has one (it would only make state_no_category)", t.values);
}
{
  const r = run(SLOTS, 'a"b<c');
  ok(r.values[0] === "a&quot;b&lt;c", "a value is escaped into the option", r.options[0]);
}
{
  const r = run({}, "rural");
  ok(JSON.stringify(r.values) === JSON.stringify(["rural"]) && r.sel.value === "rural", "with no category table loaded, the state's own value still shows", r.values);
}

console.log("=== 3. showInfo and 📋 Paste fill it through populateCategorySelect ===");
const show = lift("function showInfo(");
const showM = MASKED.slice(MASKED.indexOf("\n  function showInfo("), MASKED.indexOf("\n  function showInfo(") + show.length);
const paste = lift("function pasteStateAttrs(");
const pasteM = MASKED.slice(MASKED.indexOf("\n  function pasteStateAttrs("), MASKED.indexOf("\n  function pasteStateAttrs(") + paste.length);
ok(/populateCategorySelect\(\$\("miCategoryInp"\), st\.category \|\| ""\)/.test(showM), "showInfo fills the list with the state's own category");
ok(/populateCategorySelect\(\$\("miCategoryInp"\), attrClipboard\.category\)/.test(pasteM), "📋 Paste fills it with the copied category");
ok(!/\$\("miCategoryInp"\)\.value\s*=[^=]/.test(MASKED), "nothing sets the list's value directly any more (a value with no option shows as blank)");
const bulk = MASKED.slice(MASKED.indexOf('const catSel = $("mapMultiCategory")'), MASKED.indexOf('const catSel = $("mapMultiCategory")') + 400);
ok(/Object\.keys\(m\.categorySlots \|\| \{\}\)\.sort\(\)/.test(bulk) && /Object\.keys\(\(model && model\.categorySlots\) \|\| \{\}\)\.sort\(\)/.test(code),
  "the panel and the bulk bar list the same table (categorySlots), in the same order");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
