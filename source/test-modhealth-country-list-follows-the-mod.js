// #modhealth-country-list-outlives-the-mod — THE FIX PICKER OFFERED ONE MOD'S TAGS WHILE WRITING INTO ANOTHER.
//
// Mod Health's orphan-spirit fix lets you pick a country to grant the spirit to. The country list came from
// loadCountries(), a module-scope promise cached on the FIRST call with modPath read only then — and nothing
// reset it: not the mod selector's change handler (which does call scan()), not anything else.
//
// So after a mid-session mod switch the picker still offered mod A's tags, while the POST that follows sends
// the CURRENT activeModPath. Nova then wrote <modB>/history/countries/<modA tag> - Custom.txt. HOI4 ignores
// that file wholesale — it reports the tag "is not in the tag list" — so nothing is granted at all.
//
// And the user was told it worked. The server staples a refWarning onto the reply saying exactly that the
// file is inert; the handler read `data.error` and nothing else, printed "✓ Added to <tag>", and rescanned.
// The rescan then reported the orphan spirit as FIXED, because mod-index's grant walk finds the add_ideas
// line in the dead file. Three surfaces agreeing on a grant the game never sees.
//
// The pages that load loading-overlay.js drain refWarning into a modal automatically. modhealth.html does
// not load it, so this page has to read the field itself.
//
// THE RULE: key a cache on what it was fetched FOR. Same rule as the focus-tree localisation map the user
// reported (#loc-map-follows-open-tree) — a key that can disagree with the request turns one wrong answer
// into a permanent one.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const SRC = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
const CODE = stripJsComments(SRC);

function lift(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return null;
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === "{") d++;
    else if (CODE[i] === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); }
  }
  return null;
}

console.log("\n[THE BUG] the country list must follow the selected mod");
const body = lift("loadCountries");
rec("loadCountries is liftable", !!body, "not found");
if (body) {
  const calls = [];
  const store = { activeModPath: "" };
  const h = new Function("record", "store", `
    let countriesPromise = null;
    let countriesModKey = null;
    const localStorage = { getItem: (k) => (k in store ? store[k] : null) };
    const fetch = (url) => { record(url); return Promise.resolve({ json: () => Promise.resolve([{ tag: "AAA" }]) }); };
    ${body}
    return { load: () => loadCountries(), setMod: (p) => { store.activeModPath = p; } };
  `)((u) => calls.push(u), store);

  (async () => {
    h.setMod("D:/mods/alpha");
    await h.load();
    rec("the request names the selected mod", calls.length === 1 && /modPath=D%3A%2Fmods%2Falpha/.test(calls[0]), calls);

    // The cache must still be a cache — otherwise this is just a slower picker.
    await h.load();
    rec("a second call for the same mod is cached", calls.length === 1, calls);

    // THE BUG: switching mod must refetch. It used to return mod A's list forever.
    h.setMod("D:/mods/beta");
    await h.load();
    rec("switching mod REFETCHES", calls.length === 2, calls);
    rec("…for the new mod", /modPath=D%3A%2Fmods%2Fbeta/.test(calls[1]), calls[1]);

    // …and back, so the key is a key and not a one-way latch.
    h.setMod("D:/mods/alpha");
    await h.load();
    rec("switching back refetches the first mod", calls.length === 3 && /Falpha/.test(calls[2]), calls);

    // CONTROL: no mod selected must not masquerade as a real path.
    h.setMod("");
    await h.load();
    rec("no mod selected still asks (and is not confused with a path)", calls.length === 4 && !/modPath=/.test(calls[3]), calls[3]);

    part2();
  })();
} else {
  part2();
}

function part2() {
  console.log("\n[THE SILENCE] the warning that says the write is inert must be shown");
  {
    rec("the fix handler reads refWarning", /data\.refWarning/.test(CODE), "refWarning still dropped");
    // ⭐ It must be read on the SUCCESS path. Reading it only inside catch() would never fire: the server
    // answers 200 with the warning attached, so `res.ok` is true and `data.error` is undefined.
    const at = CODE.indexOf('status.textContent = "✓ Added to "');
    const before = at === -1 ? "" : CODE.slice(Math.max(0, at - 700), at);
    rec("…on the success path, before the tick", /data\.refWarning/.test(before), "read too late to matter");
    // And it must stop the rescan: mod-index's grant walk finds the add_ideas line in the dead file, so a
    // rescan would report the problem fixed and contradict the warning printed a line above it.
    rec("…and suppresses the rescan", /return;/.test(before.slice(before.indexOf("data.refWarning"))), "rescans anyway");
  }

  console.log("\n[why this page needs its own read] it has no automatic drain");
  {
    const html = fs.readFileSync(path.join(__dirname, "public", "modhealth.html"), "utf8");
    rec("modhealth.html does not load loading-overlay.js", !/loading-overlay/.test(html), "it does now — the inline read may be redundant");
    // CONTROL: the pages that DO load it are why this is a page-level gap and not a server one.
    const withDrain = ["research.html", "events.html", "army.html", "country-setup.html"]
      .filter((f) => /loading-overlay/.test(fs.readFileSync(path.join(__dirname, "public", f), "utf8")));
    rec("…while the maker pages do", withDrain.length === 4, withDrain);
    rec("the drain reads refWarning", /body\.refWarning/.test(fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8")), "drain changed");
  }

  console.log("\n[the mod selector still rescans]");
  {
    rec("changing mod stores the new path", /localStorage\.setItem\("activeModPath", sel\.value\)/.test(CODE), "selector changed");
    rec("…and rescans", /sel\.addEventListener\("change"[\s\S]{0,200}scan\(\)/.test(CODE), "no rescan on switch");
  }

  console.log(`\n=== modhealth country list follows the mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
