// #return-from-map-lands-on-nothing — THE COUNTRY YOU JUST MADE IS THE ONE THE DEEP LINK CANNOT FIND.
//
// Found by walking the real flow in a browser, not by reading a diff. After creating a country on the Map,
// Nova offers "✅ Placed on the map. Continue setting up Atlantis (ATL) →", which opens
// country-setup.html?tag=ATL — and the page landed with NOTHING selected: empty editor, "Select a country to
// preview its location on the map", while ATL sat in the list right beside it.
//
// The catalogue is stale-while-revalidate. fetchCachedJson returns the SESSION-CACHED list immediately and
// re-fetches in the background. The auto-select ran against that immediate return — and anyone arriving from
// the Map has already been on Country Setup, because that is where the flow starts, so a cache entry exists
// and it predates the country they just made. The check looked for ATL in a list written before ATL existed,
// missed, and called showEmpty(). The revalidation then delivered the real list and, exactly as its own
// comment promises, "only rebuilds the LIST, never the selection or the editor pane".
//
// Both halves were individually right, which is why it survived: the cache should be fast, and a background
// refresh should not yank a selection out from under someone. What was missing is that a deep link is an
// instruction that has not been carried out yet.
//
// Not map-specific: every "open this country in Country Setup" link — from Characters, Military, the focus
// editor — lands the same way for a country created in the same session.
//
// This RUNS the shipped function rather than grepping for it. A static check would have passed on the broken
// version too: the old code did read sp.get("tag"). What was wrong was WHEN it read it.
"use strict";
const fs = require("fs");
const path = require("path");

const CS = path.join(__dirname, "public", "country-setup.js");
const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

// Lift the real block out of the shipped file, so this cannot drift into testing a copy.
const src = fs.readFileSync(CS, "utf8");
const START = "  let deepLinkHonoured = false;";
const END = "  // ── Load countries ─";
const i = src.indexOf(START), j = src.indexOf(END, i);
rec("the deep-link retry is in the shipped file", i !== -1 && j > i, { start: i, end: j });
if (i === -1 || j <= i) {
  console.log(`\n=== deep link select: ${checks} checks, ${fails.length} failed ===`);
  process.exitCode = 1;
  return;
}
const block = src.slice(i, j);

// A harness that gives the block the outer variables it closes over, and records what it did.
function makeHarness(search) {
  const calls = [];
  const factory = new Function("ctx", `
    let selectedTag = null;
    let countries = [];
    const window = { location: { search: ctx.search } };
    const URLSearchParams = ctx.URLSearchParams;
    const selectCountry = (tag, name) => { selectedTag = tag; ctx.calls.push({ tag, name }); };
${block}
    return {
      run: () => selectFromDeepLink(),
      setCountries: (c) => { countries = c; },
      setSelected: (t) => { selectedTag = t; },
      getSelected: () => selectedTag,
    };
  `);
  return { api: factory({ search, calls, URLSearchParams }), calls };
}
const ATL = { tag: "ATL", name: "Atlantis" };
const GER = { tag: "GER", name: "Germany" };

(async () => {
  try {
    console.log("\n[the actual failure] a stale list, then the refresh that has the country");
    {
      const h = makeHarness("?tag=ATL");
      h.api.setCountries([]); // the cache, written before the country existed
      rec("the first pass cannot find it — this is the stale render", h.api.run() === false, h.calls);
      rec("…and nothing was selected", h.calls.length === 0, h.calls);
      h.api.setCountries([GER, ATL]); // the revalidation arrives
      rec("the refresh honours the deep link", h.api.run() === true, h.calls);
      rec("…selecting the country that was asked for", h.calls.length === 1 && h.calls[0].tag === "ATL", h.calls);
      rec("…with its name, not just its tag", h.calls[0] && h.calls[0].name === "Atlantis", h.calls);
    }

    console.log("\n[it fires once] a later refresh must not re-impose it");
    {
      const h = makeHarness("?tag=ATL");
      h.api.setCountries([ATL]);
      rec("honoured the first time", h.api.run() === true, h.calls);
      h.api.setSelected(null); // the author cleared the selection themselves
      rec("…and NOT a second time", h.api.run() === false, h.calls);
      rec("…so selectCountry ran exactly once", h.calls.length === 1, h.calls);
    }

    console.log("\n[⚠️ CONTROL — someone is mid-choice] a background refresh must never yank the page");
    {
      const h = makeHarness("?tag=ATL");
      h.api.setCountries([]);
      h.api.run(); // misses, as above
      h.api.setSelected("GER"); // the author clicked Germany while the fetch was in flight
      h.api.setCountries([GER, ATL]);
      rec("the refresh declines", h.api.run() === false, h.calls);
      rec("…leaving the country they chose selected", h.api.getSelected() === "GER", h.api.getSelected());
      rec("…and never calling selectCountry", h.calls.length === 0, h.calls);
    }

    console.log("\n[⚠️ CONTROL — no deep link] a remembered tag is not an instruction");
    {
      // The first pass still honours localStorage; the RETRY deliberately does not. Re-imposing a soft
      // memory after a background refresh would be a page that changes under the reader.
      const h = makeHarness("");
      h.api.setCountries([GER, ATL]);
      rec("nothing is selected without a ?tag=", h.api.run() === false, h.calls);
      rec("…and selectCountry never ran", h.calls.length === 0, h.calls);
    }

    console.log("\n[the other spelling] ?country= is the same instruction");
    {
      const h = makeHarness("?country=atl");
      h.api.setCountries([ATL]);
      rec("?country= is honoured too", h.api.run() === true, h.calls);
      rec("…case-insensitively, as the first pass always was", h.calls[0] && h.calls[0].tag === "ATL", h.calls);
    }

    console.log("\n[the tag is not there at all] stays quiet rather than guessing");
    {
      const h = makeHarness("?tag=ZZZ");
      h.api.setCountries([GER, ATL]);
      rec("an unknown tag selects nothing", h.api.run() === false, h.calls);
      rec("…and does not fall back to the first country in the list", h.calls.length === 0, h.calls);
    }

    console.log("\n[the wiring] the retry has to be reachable from the revalidation");
    {
      const flat = src.replace(/\r\n/g, "\n");
      // It is handed the whole catalog (#country-card: a tag the mod inherits opens as the inherited country), so the
      // call carries an argument.
      rec("the catalogue's apply() calls it", /renderCountryList\(\);[\s\S]{0,300}?selectFromDeepLink\([^)]*\)/.test(flat),
        "the refresh never retries the deep link");
      // This used to match `deepLinkHonoured = true;` followed by selectCountry — which is also exactly what
      // selectFromDeepLink's own body looks like, so it stayed green with the first pass's flag removed.
      // Assert the property that actually prevents the double load instead: the first pass gives up entirely
      // once apply() has already honoured the link.
      rec("…and the first pass stands down once apply() has honoured the link",
        /if \(deepLinkHonoured\) return;/.test(flat),
        "the first pass would select the country a second time");
      rec("…which it does BEFORE reading the query string, so no work is repeated",
        flat.indexOf("if (deepLinkHonoured) return;") <
          flat.indexOf('const urlTag = sp.get("tag")'),
        "the early return comes after the work it exists to skip");
    }

    console.log(`\n=== deep link select: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
