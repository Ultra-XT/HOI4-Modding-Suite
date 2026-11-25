// #deploy-state-id-blind-box — TWO BOXES ASKED FOR A STATE ID; ONLY ONE OFFERED THE LIST.
//
// The Military page's Air-base state box has had a Browse picker since #airbase-state-owner: it asks
// /api/buildings/state-catalog, shows every state with its display name and owner, and sorts the selected
// country's own states to the front. The LAND deploy box, three cards above it, asked for the same thing —
// "State ID", type=number, placeholder "e.g. 100" — with no list at all. There are thousands of states, so
// the author either already knew the number or left the page to find it.
//
// Same picker, same owner-first ordering. The only differences are which input it fills and where it
// reports, so the fix is a parameter on the existing function rather than a second copy of it.
//
// ⚠️ The deploy card has NO owner dropdown — it is always about the country being edited — so it passes an
// EMPTY ownerFrom. The first cut read that with `||`, which fell straight through to the AIR WING's owner
// select and would have ordered the land list by whoever the air tab happened to have selected. That is why
// this test drives the function rather than grepping for the button.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUB = path.join(__dirname, "public");
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

const HTML = fs.readFileSync(path.join(PUB, "army.html"), "utf8");
const JS = fs.readFileSync(path.join(PUB, "army.js"), "utf8");

console.log("\n[the markup] the land box has the same affordance as its sibling");
rec("the air-base box still has its Browse button", /id="naStateBrowseBtn"/.test(HTML), "the sibling lost it");
rec("…and the deploy box now has one too", /id="deployStateBrowseBtn"/.test(HTML), "still a blind number box");
{
  // It has to sit next to the field it fills, not somewhere else on the page.
  const at = HTML.indexOf('id="deployState"');
  const btn = HTML.indexOf('id="deployStateBrowseBtn"');
  rec("…placed immediately after the State ID input", at !== -1 && btn > at && btn - at < 400, { at, btn });
}

console.log("\n[the behaviour] the picker is driven, not just declared");
{
  // Pull openStateBrowser out of army.js and run it against a stub, so what is measured is which input it
  // fills and which country it orders by — the two things the parameterisation could get wrong.
  const start = JS.indexOf("async function openStateBrowser");
  rec("openStateBrowser is findable in the shipped file", start !== -1, "not found");
  if (start === -1) {
    console.log(`\n=== deploy state picker: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((x) => console.log("   FAILED: " + x));
    process.exitCode = 1;
    return;
  }
  // Brace-match the function body so the extract is the whole function and nothing after it.
  let depth = 0, end = -1, seen = false;
  for (let i = JS.indexOf("{", start); i < JS.length; i++) {
    if (JS[i] === "{") { depth++; seen = true; }
    else if (JS[i] === "}") { depth--; if (seen && !depth) { end = i; break; } }
  }
  const fnSrc = JS.slice(start, end + 1);

  const run = async ({ opts, country, airOwner, items }) => {
    const calls = { picked: [], browser: null, setInput: [], status: [] };
    const els = {
      naAirOwner: { value: airOwner },
      naStatus: { style: {}, set textContent(v) { calls.status.push(["naStatus", v]); }, get textContent() { return ""; } },
      deployStatus: { style: {}, set textContent(v) { calls.status.push(["deployStatus", v]); }, get textContent() { return ""; } },
    };
    const ctx = {
      S: { country },
      $: (id) => els[id] || null,
      modPath: () => "D:/fake/mod",
      URLSearchParams: URLSearchParams,
      fetch: (url) => { calls.url = url; return Promise.resolve({ json: () => Promise.resolve({ items }) }); },
      openEquipmentBrowser: (cfg) => { calls.browser = cfg; },
      eqbSetInput: (id, v) => calls.setInput.push([id, v]),
      Promise, console, Array, String, Object, JSON,
    };
    ctx.globalThis = ctx;
    vm.runInNewContext(`${fnSrc}; __p = openStateBrowser(__opts);`, Object.assign(ctx, { __opts: opts, __p: null }));
    await ctx.__p;
    return calls;
  };

  const ITEMS = [
    { stateId: 11, displayName: "Bavaria", ownerTag: "GER" },
    { stateId: 22, displayName: "Île-de-France", ownerTag: "FRA" },
    { stateId: 33, displayName: "Zephyr Coast", ownerTag: "Z00" },
  ];

  (async () => {
    console.log("\n  · the deploy card");
    {
      const c = await run({
        opts: { target: "deployState", status: "deployStatus", ownerFrom: "", title: "Pick a state to deploy in" },
        country: "Z00", airOwner: "FRA", items: ITEMS,
      });
      rec("it opens a browser with the states in it", !!c.browser && (c.browser.rows || []).length === 3, c.browser);
      rec("…titled for deploying, not for air bases", /deploy/i.test(String((c.browser || {}).title || "")), (c.browser || {}).title);
      // THE TRAP: an empty ownerFrom must mean "the country being edited", not "fall through to the air tab".
      rec("…ordered by the country being edited, NOT the air wing's owner",
        /countryTag=Z00/.test(String(c.url || "")), c.url);
      rec("…and it fills the DEPLOY box", (c.browser.onPick && (c.browser.onPick(33), true)) && c.setInput.some(([id, v]) => id === "deployState" && v === 33), c.setInput);
      rec("…never the air-base box", !c.setInput.some(([id]) => id === "naState"), c.setInput);
      rec("…and reports on the deploy card's own status line", c.status.every(([id]) => id === "deployStatus"), c.status);
      const own = (c.browser.rows || []).find((r) => r.id === "33");
      rec("…marking the country's own states as its own", own && own.own === true, own);
    }

    console.log("\n  · CONTROL: the air-base card is unchanged");
    {
      // Same function, no options — it must behave exactly as it did before it was parameterised.
      const c = await run({ opts: undefined, country: "Z00", airOwner: "FRA", items: ITEMS });
      rec("CONTROL: it still reads the AIR owner dropdown", /countryTag=FRA/.test(String(c.url || "")), c.url);
      rec("CONTROL: …still titled for air bases", /air-base/i.test(String((c.browser || {}).title || "")), (c.browser || {}).title);
      rec("CONTROL: …and still fills naState", (c.browser.onPick && (c.browser.onPick(11), true)) && c.setInput.some(([id, v]) => id === "naState" && v === 11), c.setInput);
      rec("CONTROL: …never the deploy box", !c.setInput.some(([id]) => id === "deployState"), c.setInput);
    }

    console.log("\n  · an empty catalogue says so rather than opening an empty list");
    {
      const c = await run({
        opts: { target: "deployState", status: "deployStatus", ownerFrom: "" },
        country: "Z00", airOwner: "", items: [],
      });
      rec("no browser is opened", !c.browser, c.browser);
      rec("…and the deploy status line explains why", c.status.some(([id, v]) => id === "deployStatus" && /couldn't read/i.test(String(v))), c.status);
    }

    console.log("\n[wiring] the button actually calls it, with the deploy options");
    rec("the deploy button is bound", /deployStateBrowseBtn[\s\S]{0,260}openStateBrowser\(\{/.test(JS), "declared but never wired");
    rec("…passing the deploy target", /target: "deployState"/.test(JS), "no target passed");

    console.log(`\n=== deploy state picker: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  })();
}
