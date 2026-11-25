// ⛔ #a-deep-link-picks-only-a-country-the-picker-offers (final round, L6) — A ?tag= THAT OPENS THE MAP DOES NOT PUT A TAG THE PAINT
// PICKER LEAVES OUT INTO THE PICKER, OR MAKE IT THE BRUSH. The deep-link twin of #the-eyedropper-picks-only-a-country-the-picker-offers.
//
// The owner's Q7: every country picker offers the countries the game loads, less the ones declared after `dynamic_tags = yes`
// (pickerCountryTags). applyDeepLink added ANY ?tag= to the Paint picker and made it the brush. Country Setup lists a mod's own
// countries (catalog isMod), and a mod that ships common/country_tags/zz_dynamic_countries.txt owns D01…D50 there; its "Edit on Map ↗"
// sends map.html?tag=<the selected country>&tool=paint. MEASURED 2026-11-20 on the real pages (probe-L6: Country Setup → D01 → Edit on
// Map): D01 became the brush and a picker option, the line said only "No state is owned by D01.", and a real click on Brandenburg painted
// it D01. Now the link asks the picker's own predicate, as the eyedropper does: a tag it would not offer is not made the brush, and the
// line says why in the eyedropper's words; a tag it would offer that a stale list does not hold yet is still added, as before.
//
// RUN, not grepped: the page's own applyDeepLink, paintOwnerClick and pickerCountryTags, lifted out of public/map.js into a sandbox with a
// picker of options; the link's input is derived from Country Setup's button and the page's own query parsing. Binds no port.
"use strict";
const vm = require("vm");
const T = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};

console.log("-- what the client sends (derived) --");
const CS = maskJsComments(T.readSource("public", "country-setup.js"));
ok(/const q = selectedTag \? "\?tag=" \+ encodeURIComponent\(selectedTag\) \+ "&tool=paint" : "\?tool=paint";\s*window\.location\.href = "map\.html" \+ q;/.test(CS),
  "THE CONTROL: Country Setup's Edit on Map opens map.html?tag=<the selected country>&tool=paint");
ok(/countries = isVanilla \? norm\(raw\) : norm\(raw\)\.filter\(\(c\) => c\.isMod\);/.test(CS), "THE CONTROL: …and its list is the catalog's countries of the mod's own (isMod)");
ok(/const tag = \(q\.get\("tag"\) \|\| q\.get\("country"\) \|\| ""\)\.trim\(\)\.toUpperCase\(\);/.test(T.MASKED) && /deepLink = \{ tag, tool, state:/.test(T.MASKED),
  "THE CONTROL: the Map reads ?tag= upper-cased into the deep link applyDeepLink applies");
const toolsSrc = /const DEEPLINK_TOOLS = new Set\((\[[^\]]*\])\);/.exec(T.MASKED);
const TOOLS = toolsSrc ? JSON.parse(toolsSrc[1]) : [];
ok(TOOLS.includes("paint"), "THE CONTROL: paint is a tool a link may name", TOOLS);

const SRC = T.lift("function applyDeepLink(") + "\n" + T.lift("function paintOwnerClick(") + "\n" + T.lift("function pickerCountryTags(");
/** A page whose states 1..4 are owned by GER, D01 (declared after the marker), XYZ (declared nowhere) and FRA; the picker holds what
 *  pickerCountryTags offers (FRA, GER and ITA), less `drop` (a list gone stale), and the link names `tag` (and `tool`, `state`). */
function page(link, { brush = "", drop = [] } = {}) {
  const model = {
    states: [{ id: 1, owner: "GER" }, { id: 2, owner: "D01" }, { id: 3, owner: "XYZ" }, { id: 4, owner: "FRA" }].map((s) => Object.assign(s, { provinces: [s.id * 10] })),
    loadedTags: ["D01", "FRA", "GER", "ITA"], dynamicTags: ["D01"], countryColors: {},
  };
  const calls = [], statuses = [], options = [];
  const countrySelect = { value: brush, get options() { return options; }, appendChild(o) { options.push(o); } };
  const ctx = {
    model, countrySelect, Array, Set, String, Object, deepLink: link, DEEPLINK_TOOLS: new Set(TOOLS),
    stateById: new Map(model.states.map((s) => [s.id, s])),
    document: { createElement: () => ({ value: "", textContent: "" }) },
    setStatus: (s) => statuses.push(String(s)), syncCountryColorInput() {}, pushUndo() {}, assignSelectedTo: (t) => statuses.push("PAINTED " + t),
    setMode: (m) => calls.push("mode " + m), jumpToCountry: (t) => { calls.push("jump " + t); statuses.push("JUMPED " + t); },
    selectAndCenterState: (st) => calls.push("centre " + st.id),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\nglobalThis.applyDeepLink = applyDeepLink; globalThis.paintOwnerClick = paintOwnerClick; globalThis.pickerCountryTags = pickerCountryTags;", ctx);
  const pick = ctx.pickerCountryTags(model);
  for (const t of pick.owners.concat(pick.others)) if (!drop.includes(t)) options.push({ value: t, textContent: t });
  return { ctx, calls, statuses, last: () => statuses[statuses.length - 1] || "", tags: () => options.map((o) => o.value) };
}
const link = (tag, tool = "paint") => ({ tag, tool, state: null });
/** the reason clause each path gives for a tag: the link's "names TAG, <why>. The Paint picker" and the eyedropper's "is owned by TAG, <why>. The Paint picker" */
const whyOf = (line, tag) => ((new RegExp("(?:names|is owned by) " + tag + ", (.*?)\\. The Paint picker does not offer it")).exec(line) || [])[1] || null;

console.log("\n-- THE CONTROL: the picker offers what pickerCountryTags offers: FRA, GER and ITA, not D01 nor XYZ --");
{
  const p = page(null);
  ok(JSON.stringify(p.tags().slice().sort()) === JSON.stringify(["FRA", "GER", "ITA"]), "the picker holds FRA, GER and ITA", p.tags());
}

console.log("\n-- 1. ⭐⭐⭐ COUNTRY SETUP'S EDIT ON MAP FOR D01 (declared after the dynamic marker): map.html?tag=D01&tool=paint --");
{
  const p = page(link("D01"));
  p.ctx.applyDeepLink();
  ok(p.ctx.countrySelect.value === "", "⭐⭐⭐ D01 is not made the brush", p.ctx.countrySelect.value);
  ok(!p.tags().includes("D01"), "⭐⭐ …and is not put into the Paint picker", p.tags());
  ok(/^🚫 The link that opened the Map names D01, a tag common\/country_tags declares after `dynamic_tags = yes`/.test(p.last()) && /so it was not made the brush: no brush is set/.test(p.last()),
    "⭐⭐ …and the line says why, and that no brush is set (the last word, after the view's)", p.last());
  ok(p.calls.includes("mode paint") && p.calls.includes("jump D01"), "…the Paint tool is still opened and the view still goes to D01's land", p.calls);
  const e = page(null); e.ctx.paintOwnerClick(2, true);
  ok(!!whyOf(p.last(), "D01") && whyOf(p.last(), "D01") === whyOf(e.last(), "D01"), "⭐ …in the eyedropper's words for the same tag", [whyOf(p.last(), "D01"), whyOf(e.last(), "D01")]);
  // the click that follows: with no brush, a click on a state is the eyedropper, so nothing is painted to D01
  p.ctx.paintOwnerClick(1, false);
  ok(p.ctx.countrySelect.value === "GER" && !p.statuses.some((s) => /^PAINTED/.test(s)), "⭐⭐ the click that follows picks up the clicked state's owner and paints nothing", { v: p.ctx.countrySelect.value, s: p.statuses });
}
{
  const p = page(link("D01"), { brush: "FRA" });
  p.ctx.applyDeepLink();
  ok(p.ctx.countrySelect.value === "FRA" && /the brush stays FRA/.test(p.last()), "⭐ a brush already set stays, and the line says so", { v: p.ctx.countrySelect.value, line: p.last() });
}

console.log("\n-- 2. A TAG NO country_tags FILE DECLARES --");
{
  const p = page(link("XYZ"));
  p.ctx.applyDeepLink();
  const e = page(null); e.ctx.paintOwnerClick(3, true);
  ok(p.ctx.countrySelect.value === "" && !p.tags().includes("XYZ"), "⭐⭐ XYZ is not made the brush nor put into the picker", { v: p.ctx.countrySelect.value, tags: p.tags() });
  ok(/no common\/country_tags file of this mod or the layers below it declares/.test(p.last()) && whyOf(p.last(), "XYZ") === whyOf(e.last(), "XYZ"), "⭐ …and the line says why, in the eyedropper's words", [p.last(), e.last()]);
}

console.log("\n-- 3. CONTROLS: A COUNTRY THE PICKER OFFERS IS MADE THE BRUSH AS BEFORE --");
{
  const p = page(link("GER"));
  p.ctx.applyDeepLink();
  ok(p.ctx.countrySelect.value === "GER" && p.calls.includes("jump GER") && !p.statuses.some((s) => /🚫/.test(s)) && p.last() === "JUMPED GER", "?tag=GER&tool=paint makes GER the brush and goes to its land, no refusal", { v: p.ctx.countrySelect.value, calls: p.calls, s: p.statuses });
}
{
  const p = page(link("FRA"), { drop: ["FRA"] });
  p.ctx.applyDeepLink();
  ok(p.ctx.countrySelect.value === "FRA" && p.tags().includes("FRA"), "⭐ a country the picker would offer that a stale list does not hold yet is added and made the brush, as before", { v: p.ctx.countrySelect.value, tags: p.tags() });
}
{
  const p = page({ tag: "", tool: "", state: 4 });
  p.ctx.applyDeepLink();
  ok(p.calls.join() === "centre 4" && p.statuses.length === 0, "?state=4 still only centres on the state", { calls: p.calls, s: p.statuses });
}
{
  const p = page(link("GER", "capital"));
  p.ctx.applyDeepLink();
  ok(p.calls.includes("mode capital") && p.ctx.countrySelect.value === "GER", "?tag=GER&tool=capital still opens Set capital with GER", p.calls);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail || pass < 18 ? 1 : 0);
