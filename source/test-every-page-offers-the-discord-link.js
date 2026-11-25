// ⛔ #discord-link-reached-one-nav-of-eleven — "PUT A DISCORD LINK IN THE TOP NAV" LANDED ON ONE PAGE.
//
// Commit 2440995 is titled "Put a Discord link in the top nav, where people will actually find it". The top
// nav is duplicated in every page's HTML — there is no shared header — and the link went into home.html
// only. Ten of the eleven pages carrying that nav had no way to reach it, which is every screen a modder is
// on while something goes wrong and they want to ask about it.
//
// The same shape as the rest of this project's dominant bug: the fix exists and one caller never adopted it.
// Here it was ten callers.
//
// The page list is DERIVED from disk, so a new maker page cannot quietly be the twelfth. splash.html is
// excluded by the same derivation rather than by name: it carries no suite nav, so there is nothing to add
// it to.
"use strict";

const fs = require("fs");
const path = require("path");

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

const DIR = path.join(__dirname, "public");
const DISCORD = "https://discord.gg/Z6P23hjEsM";

// Every page that carries the suite nav — derived, never typed.
const pages = [];
const noNav = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith(".html")) continue;
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  (/class="suite-nav-link/.test(src) ? pages : noNav).push(f);
}

console.log("\n[the nav is per-page, so every page has to carry it]");
rec(`${pages.length} pages carry the suite nav`, pages.length >= 10, pages);
rec("…and the list is derived from the files, not written down here", pages.includes("home.html"), pages);
console.log("     without a suite nav: " + (noNav.join(", ") || "(none)"));

console.log("\n[⭐ every one of them can reach the Discord]");
for (const f of pages) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  rec(`${f}: has the Discord link`, src.indexOf(DISCORD) !== -1,
    "this page is a dead end for anyone who wants to report what just went wrong");
}

console.log("\n[⭐ and it is the SAME link, not ten drifting copies]");
{
  // Lifted verbatim from home.html when it was added everywhere. If someone edits one page's copy, the
  // others must move with it or this fails — which is the only defence when the markup lives in eleven files.
  const home = fs.readFileSync(path.join(DIR, "home.html"), "utf8");
  const lift = (src) => {
    const a = src.indexOf(`<a href="${DISCORD}"`);
    if (a === -1) return "";
    const b = src.indexOf("</a>", a);
    return b === -1 ? "" : src.slice(a, b + 4).replace(/\s+/g, " ");
  };
  const ref = lift(home);
  rec("home.html's link was found", ref.length > 400, ref.length);
  for (const f of pages) {
    if (f === "home.html") continue;
    rec(`${f}: byte-for-byte the same anchor`, lift(fs.readFileSync(path.join(DIR, f), "utf8")) === ref,
      "a copy has drifted — the mark, the title or the URL differs from home.html's");
  }
}

console.log("\n[the things that make it actually work]");
for (const f of pages) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  const a = src.indexOf(`<a href="${DISCORD}"`);
  const anchor = a === -1 ? "" : src.slice(a, src.indexOf("</a>", a) + 4);
  // main.js denies in-window navigation to a non-app origin and routes window-open to shell.openExternal,
  // so without target="_blank" the link reads as an error instead of opening the browser.
  rec(`${f}: opens in the real browser (target=_blank)`, /target="_blank"/.test(anchor),
    "main.js blocks the in-window navigation and the user sees a 'network blocked' warning");
  rec(`${f}: …with rel=noopener`, /rel="noopener noreferrer"/.test(anchor), "opener is reachable from the new context");
  // The page CSP is img-src 'self' data: blob: https://raw.githubusercontent.com — a remote icon would be
  // blocked outright and silently, so the mark has to be inline SVG.
  rec(`${f}: …and the mark is inline SVG, which the CSP allows`, /<svg /.test(anchor), "a remote icon is blocked by the CSP with no error");
  rec(`${f}: …and it loads the stylesheet that colours it`, /styles\.css/.test(src), "suite-nav-discord is defined in styles.css");
}

console.log("\n[CONTROL: the styling this depends on still exists]");
{
  const css = fs.readFileSync(path.join(DIR, "styles.css"), "utf8");
  rec("styles.css still defines .suite-nav-discord", /\.suite-nav-link\.suite-nav-discord\s*\{/.test(css),
    "the link would render as a plain nav tab");
  rec("…and the inline mark's alignment", /\.suite-nav-discord-mark\s*\{/.test(css), "the icon would sit off the baseline");
}

console.log("\n[CONTROL: no page grew an inline handler doing it]");
for (const f of pages) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  const a = src.indexOf(`<a href="${DISCORD}"`);
  const anchor = a === -1 ? "" : src.slice(a, src.indexOf("</a>", a) + 4);
  rec(`${f}: no inline handler on the link`, !/\son[a-z]+=/.test(anchor), "the CSP kills inline handlers silently");
}

console.log(`\n=== every page offers the Discord link: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
