// ⛔ #the-eyedropper-picks-only-a-country-the-picker-offers — 🖌 PAINT'S EYEDROPPER (Alt+click, or a click with no brush) DOES NOT PUT A TAG THE
// PICKER LEAVES OUT INTO THE PICKER (review of group c's Q7 fix, L-eyedropper).
//
// The owner's Q7: every country picker offers the countries the game loads, less the ones declared after `dynamic_tags = yes`
// (pickerCountryTags). The eyedropper picked up the clicked state's owner and, when the picker did not list it, ADDED it: a state already
// owned by such a tag (after a hand edit, or in an old mod; state_owned_by_dynamic_tag reports it) made that tag the brush, and the next
// click painted more land to it. Now the eyedropper asks the picker's own predicate: a tag it would not offer is not picked up, the line says
// why and the brush stays; a tag it would offer that the list does not hold yet is still added, as before.
//
// RUN, not grepped: the page's own paintOwnerClick and pickerCountryTags, lifted out of public/map.js into a sandbox with a picker of
// options. Binds no port.
"use strict";
const vm = require("vm");
const T = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const SRC = T.lift("function paintOwnerClick(") + "\n" + T.lift("function pickerCountryTags(");
/** A page whose states 1..4 are owned by GER, D01 (declared after the marker), XYZ (declared nowhere) and FRA; the picker holds what
 *  pickerCountryTags offers (FRA and GER), less `drop` (a list gone stale). */
function page(brush, drop = []) {
  const model = {
    states: [{ id: 1, owner: "GER" }, { id: 2, owner: "D01" }, { id: 3, owner: "XYZ" }, { id: 4, owner: "FRA" }].map((s) => Object.assign(s, { provinces: [s.id * 10] })),
    loadedTags: ["D01", "FRA", "GER", "ITA"], dynamicTags: ["D01"], countryColors: {},
  };
  const statuses = [];
  const options = [];
  const countrySelect = { value: brush || "", get options() { return options; }, appendChild(o) { options.push(o); } };
  const ctx = {
    model, countrySelect, Array, Set, String, Object,
    stateById: new Map(model.states.map((s) => [s.id, s])),
    document: { createElement: () => ({ value: "", textContent: "" }) },
    setStatus: (s) => statuses.push(String(s)), syncCountryColorInput() {}, pushUndo() {}, assignSelectedTo: (t) => statuses.push("PAINTED " + t),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\nglobalThis.paintOwnerClick = paintOwnerClick; globalThis.pickerCountryTags = pickerCountryTags;", ctx);
  const pick = ctx.pickerCountryTags(model);
  for (const t of pick.owners.concat(pick.others)) if (!drop.includes(t)) options.push({ value: t, textContent: t });
  return { ctx, statuses, options, last: () => statuses[statuses.length - 1] || "", tags: () => options.map((o) => o.value), pick };
}

console.log("\n-- THE CONTROL: the picker offers what pickerCountryTags offers: FRA, GER and ITA, not D01 nor XYZ --");
{
  const p = page("GER");
  ok(JSON.stringify(p.tags().slice().sort()) === JSON.stringify(["FRA", "GER", "ITA"]), "the picker holds FRA, GER and ITA", p.tags());
}

console.log("\n-- 1. ALT+CLICK ON A STATE OWNED BY A TAG DECLARED AFTER THE DYNAMIC MARKER --");
{
  const p = page("GER");
  p.ctx.paintOwnerClick(2, true);
  ok(p.ctx.countrySelect.value === "GER", "⭐⭐⭐ the brush stays GER", p.ctx.countrySelect.value);
  ok(!p.tags().includes("D01"), "⭐⭐ …and D01 is not put into the picker", p.tags());
  ok(/^🚫 State 2 is owned by D01, a tag common\/country_tags declares after `dynamic_tags = yes`/.test(p.last()) && /the brush stays GER/.test(p.last()), "⭐ …and the line says why, and that the brush stays", p.last());
  ok(!p.statuses.some((s) => /^PAINTED/.test(s)), "…and nothing is painted", p.statuses);
}
{
  const p = page("");
  p.ctx.paintOwnerClick(2, false);
  ok(p.ctx.countrySelect.value === "" && !p.tags().includes("D01") && /no brush is set/.test(p.last()), "⭐⭐ a plain click with no brush does not pick it up either", { v: p.ctx.countrySelect.value, line: p.last() });
}

console.log("\n-- 2. A TAG NO country_tags FILE DECLARES --");
{
  const p = page("FRA");
  p.ctx.paintOwnerClick(3, true);
  ok(p.ctx.countrySelect.value === "FRA" && !p.tags().includes("XYZ"), "⭐⭐ the brush stays FRA, and XYZ is not put into the picker", { v: p.ctx.countrySelect.value, tags: p.tags() });
  ok(/^🚫 State 3 is owned by XYZ, a tag no common\/country_tags file of this mod or the layers below it declares/.test(p.last()), "⭐ …and the line says why", p.last());
}

console.log("\n-- 3. CONTROLS: A COUNTRY THE PICKER OFFERS IS PICKED UP AS BEFORE, EVEN ONE A STALE LIST DOES NOT HOLD --");
{
  const p = page("GER");
  p.ctx.paintOwnerClick(4, true);
  ok(p.ctx.countrySelect.value === "FRA" && /Paint country set to FRA/.test(p.last()), "Alt+click on FRA's state picks FRA", { v: p.ctx.countrySelect.value, line: p.last() });
}
{
  const p = page("GER", ["FRA"]);
  p.ctx.paintOwnerClick(4, true);
  ok(p.ctx.countrySelect.value === "FRA" && p.tags().includes("FRA"), "⭐ a country the picker would offer and the list does not hold yet is added and picked, as before", { v: p.ctx.countrySelect.value, tags: p.tags() });
}
{
  const p = page("GER");
  p.ctx.paintOwnerClick(4, false);
  ok(p.statuses.includes("PAINTED GER"), "a plain click with a brush paints, as before", p.statuses);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
