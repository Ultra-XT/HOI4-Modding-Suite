// ⛔ #bug-report-ring-died-with-the-page — THE REPORT COULD NOT NAME THE SCREEN IT WAS ABOUT.
//
// nova-bug-report.js states its own job at the top: a report is worth reading because it says WHICH MOD,
// WHICH SCREEN and what went wrong. It loads on all eleven screens and keeps a ring of the errors each one
// hit. But the button that builds a report exists only inside Home's Settings modal — no other page has
// `bugPreviewBtn` or `settingsModal` — and Nova's nav is ordinary <a href> navigation, so every screen is a
// fresh document.
//
// So the ring was collected on the page that broke and read on a different one. Measured in the running app:
// throw an uncaught TypeError on the Map Editor, walk to Home, press Build report —
//
//     Screen:   Home (home.html)
//     (no "Errors" section at all)
//
// Two of the three facts the module exists to carry were wrong in every report a user could produce, and the
// third — the mod — was the only one that worked, because it comes from localStorage.
//
// Fixed in two halves, and BOTH are needed: the ring is persisted to sessionStorage with the screen recorded
// per error, and a breadcrumb of screens visited is kept as well — because most reports are not about a JS
// error at all ("I changed the terrain and the game still shows the old one" throws nothing), so the ring
// alone still could not answer "which screen".
//
// The module is loaded here the way a browser loads it — once per simulated page, against one shared
// sessionStorage — rather than reimplemented.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const SRC = fs.readFileSync(path.join(__dirname, "public", "nova-bug-report.js"), "utf8");

// One storage object shared by every simulated page load, exactly like a browser tab's sessionStorage.
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

const ABOUT = {
  ok: true, nova: "1.0.6", platform: "win32 10.0.26200",
  mod: { name: "Nova Map Test 0907", path: "~\\mod\\nova_map_test_0907" },
  game: { version: "1.19.2.0", path: "D:\\SteamLibrary" },
};

// Load the module as one page. `navLabel` is what the nav's active link says; `file` is the filename.
// `headLoad: true` reproduces home.html, which includes the script in <head> — the DOM is not parsed yet.
function loadPage(sessionStorage, { navLabel, file, headLoad = false, about = ABOUT } = {}) {
  const winHandlers = {};
  const docHandlers = {};
  let domReady = !headLoad;

  const documentStub = {
    get readyState() { return domReady ? "complete" : "loading"; },
    addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); },
    querySelector: (sel) => (domReady && sel === ".suite-nav-link.active" ? { textContent: navLabel } : null),
  };
  const windowStub = {
    addEventListener: (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); },
  };

  const fn = new Function("window", "document", "sessionStorage", "localStorage", "location", "fetch", SRC);
  fn(windowStub, documentStub, sessionStorage,
    { getItem: () => "C:\\mod\\nova_map_test_0907", setItem: () => {} },
    { pathname: "/" + file },
    async () => ({ json: async () => about }));

  // A <head>-loaded script sees the DOM arrive afterwards. Fire DOMContentLoaded as the browser would.
  const finishLoad = () => {
    domReady = true;
    for (const h of docHandlers.DOMContentLoaded || []) h();
  };
  if (headLoad) finishLoad();

  return {
    api: windowStub.novaBugReport,
    throwError: (msg) => { for (const h of winHandlers.error || []) h({ message: msg, filename: "http://x/" + file, lineno: 42 }); },
  };
}

(async () => {
  console.log("\n=== the journey that produced an empty report ===");
  const store = makeStorage();

  // 1. The user is on the Map Editor and something throws.
  const mapPage = loadPage(store, { navLabel: "Map Editor", file: "map.html" });
  mapPage.throwError("Uncaught TypeError: Cannot read properties of undefined (reading 'boom')");
  ok(mapPage.api.recentErrors().length === 1, "the Map Editor catches its own error", mapPage.api.recentErrors());

  // 2. They walk to Home, which is a whole new document — the only screen with the button.
  const homePage = loadPage(store, { navLabel: "Home", file: "home.html", headLoad: true });
  const report = await homePage.api.build("I changed the terrain and the game still shows the old one");

  ok(homePage.api.recentErrors().length === 1,
    "…and Home still has it after the navigation (the ring used to be empty here)", homePage.api.recentErrors());
  ok(/Cannot read properties of undefined/.test(report),
    "the report carries what actually went wrong", report);
  ok(/\[Map Editor \(map\.html\)\]/.test(report),
    "…tagged with the screen it happened on, not the one the report was built from", report);
  ok(/Errors this session/.test(report),
    "…and the section is no longer titled \"on this screen\", which it never was", report);

  console.log("\n=== the ordinary report, where nothing threw at all ===");
  {
    // The terrain complaint above throws nothing. Without the breadcrumb, "Screen: Home" is the only screen
    // the report can name, and it is the wrong one.
    ok(/Was on:\s+Map Editor \(map\.html\)\s+→\s+Home \(home\.html\)/.test(report),
      "the trail says where the user actually was", report);
  }
  {
    const quiet = makeStorage();
    loadPage(quiet, { navLabel: "Research Tree", file: "research.html" });
    const h = loadPage(quiet, { navLabel: "Home", file: "home.html", headLoad: true });
    const r = await h.api.build("the tech tree is empty");
    ok(/Was on:\s+Research Tree/.test(r), "…even with no error anywhere in the session", r);
    ok(!/Errors this session/.test(r), "…and no empty error section is invented", r);
  }

  console.log("\n=== a <head>-loaded script still gets the nav's label, not the filename ===");
  {
    // home.html loads this script at line 9, before the nav exists; map.html loads it at the end of <body>.
    // Recording the visit immediately would have written "home.html" for one screen and
    // "Map Editor (map.html)" for the others, from the same line of code.
    const s = makeStorage();
    loadPage(s, { navLabel: "Home", file: "home.html", headLoad: true });
    const trail = JSON.parse(s.getItem("novaBugTrail") || "[]");
    ok(trail[0] === "Home (home.html)", "the label is the nav's, even loaded from <head>", trail);
  }

  console.log("\n=== the ring stays a ring, and stays private ===");
  {
    const s = makeStorage();
    const p = loadPage(s, { navLabel: "Map Editor", file: "map.html" });
    for (let i = 0; i < 30; i++) p.throwError("boom " + i);
    ok(p.api.recentErrors().length === 12, "it is still capped at 12, not a log file", p.api.recentErrors().length);
    ok(p.api.recentErrors()[11].detail.indexOf("boom 29") === 0, "…keeping the NEWEST", p.api.recentErrors()[11]);
    const stored = JSON.parse(s.getItem("novaBugRing") || "[]");
    ok(stored.length === 12, "…and what is stored is capped too", stored.length);
    // sessionStorage is per tab and dies with the app. Nothing here may reach localStorage, which persists.
    ok(s._dump().novaBugRing !== undefined, "the ring lives in sessionStorage", Object.keys(s._dump()));
  }

  console.log("\n=== storage being unavailable must not break the reporter ===");
  {
    // Private mode, or a browser set to block site data: the accessor itself throws. The one moment this
    // module runs is the moment something else already broke, so it must never be the second failure.
    const hostile = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    let threw = null, r = null;
    try {
      const p = loadPage(hostile, { navLabel: "Map Editor", file: "map.html" });
      p.throwError("still recorded in memory");
      r = await p.api.build("hello");
    } catch (e) { threw = e.message; }
    ok(threw === null, "loading and building still work with storage blocked", threw);
    ok(/still recorded in memory/.test(r || ""), "…and the in-memory ring still carries the error", r);
  }

  console.log("\n=== a failed /api/about is still said out loud ===");
  {
    const s = makeStorage();
    const p = loadPage(s, { navLabel: "Home", file: "home.html", about: { ok: false } });
    const r = await p.api.build("x");
    ok(/backend did not answer/.test(r), "the report says the details are missing rather than looking complete", r);
  }

  console.log(`\n=== a bug report survives the walk to the button: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
