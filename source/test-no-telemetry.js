// #no-telemetry — NOVA COLLECTS NOTHING, AND THIS TEST IS THE PROOF THAT STAYS.
//
// A user grepped the source, found the word "geolocation", and told a Discord server the app was spyware.
// The one line in the codebase containing that word is a SECURITY HEADER that turns geolocation OFF:
//     Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
// — an empty `()` is an empty allowlist, meaning no origin may use it. The other word they could have found
// was POST /api/telemetry, which appended its body to logs/telemetry.jsonl on the user's own disk, sent
// nothing anywhere, and had zero callers from the day it was written. It has been removed.
//
// This test is not about a bug. It is a standing, checkable claim about what the program does, so the next
// person who asks can be answered with a command instead of a promise, and so nobody reintroduces a
// collection point by accident.
//
// ⚠️ SCOPE, stated honestly: this measures NOVA'S OWN SOURCE — server.js, the map/unit/index modules, the
// Electron main process and every page script. It does not audit node_modules, and it cannot speak for a
// binary somebody else rebuilt and redistributed.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const ROOT = __dirname;
const PUB = path.join(ROOT, "public");
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; } };

// Every file Nova ships and runs. Tests and scratch files are excluded on purpose: they never reach a user.
//
// ⚠️ DERIVED, NOT LISTED. This was a hardcoded array of nine filenames, and `update-checker.js` was not among
// them — a module whose entire job is to talk to the network. So the "complete list of outbound destinations"
// below silently omitted https://api.github.com, and the claim was made to a user as though it were complete.
// `mod-version.js` was missing too. Walk what the entry points actually require, so a module added later is
// covered the day it appears rather than the day someone remembers to add it here.
const ENTRIES = ["server.js", "main.js", "electron-main.js", "preload.js"];
const BACKEND = (() => {
  const seen = new Set();
  const queue = ENTRIES.map((f) => path.join(ROOT, f)).filter((p) => fs.existsSync(p));
  while (queue.length) {
    const p = queue.shift();
    const key = path.resolve(p).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let src = "";
    try { src = fs.readFileSync(p, "utf8"); } catch (_) { continue; }
    // Only LOCAL modules — node_modules is out of scope and is stated as such below.
    for (const m of src.matchAll(/require\(\s*["']\.\/([A-Za-z0-9._-]+\.js)["']\s*\)/g)) {
      const dep = path.join(ROOT, m[1]);
      if (fs.existsSync(dep)) queue.push(dep);
    }
  }
  return [...seen].map((k) => k);
})().map((p) => p);
let PAGES = [];
try { PAGES = fs.readdirSync(PUB).filter((f) => f.endsWith(".js")).map((f) => path.join(PUB, f)); } catch (_) {}
const SHIPPED = [...BACKEND, ...PAGES];

// Comments do not execute. A line that only TALKS about telemetry (this fix's own note in server.js does)
// must not be mistaken for one that performs it.
// ⚠️ A regex pair is not good enough here. Stripping BLOCK comments first is backwards: a `/*` sitting
// inside a LINE comment (public/army.js:45 has one) opens a phantom block that swallows the rest of the file
// until the next `*/`. The shared scanner walks the source once, respecting strings, template literals and
// regex literals.
const { stripJsComments: stripComments } = require("./testlib-strip-comments.js");

(async () => {
  console.log(`\n[scope] ${SHIPPED.length} shipped source files (${BACKEND.length} backend, ${PAGES.length} page scripts)`);
  rec("there is something to check", SHIPPED.length > 10 && PAGES.length > 5, { backend: BACKEND.length, pages: PAGES.length });

  console.log("\n[1. the accusation] the only 'geolocation' in the source DISABLES it");
  {
    // Comments stripped first: what executes is the claim. The fix's own note in server.js explains the
    // header in prose and mentions the word, which is not a second occurrence of anything.
    const hits = [];
    for (const p of SHIPPED) {
      for (const line of stripComments(read(p)).split(/\r?\n/)) {
        if (/geolocation/i.test(line)) hits.push({ file: path.basename(p), line: line.trim() });
      }
    }
    console.log(`     ${hits.length} line(s) mention it:`);
    hits.forEach((h) => console.log(`       ${h.file}: ${h.line.slice(0, 120)}`));
    rec("it appears exactly once", hits.length === 1, hits);
    rec("…in a Permissions-Policy header", hits.length === 1 && /Permissions-Policy/i.test(hits[0].line), hits[0]);
    // `geolocation=()` — empty allowlist. `geolocation=(self)` or `=*` would be the opposite.
    rec("…switching it OFF, not on", hits.length === 1 && /geolocation=\(\)/.test(hits[0].line), hits[0]);
    rec("…alongside camera, microphone, payment and usb, all off too",
      hits.length === 1 && /camera=\(\)/.test(hits[0].line) && /microphone=\(\)/.test(hits[0].line)
        && /payment=\(\)/.test(hits[0].line) && /usb=\(\)/.test(hits[0].line), hits[0]);
    rec("nothing ever asks the browser for a position",
      !SHIPPED.some((p) => /navigator\s*\.\s*geolocation|getCurrentPosition|watchPosition/.test(stripComments(read(p)))), "a position API is called");
  }

  console.log("\n[2. the collection point] POST /api/telemetry is gone");
  {
    const sv = stripComments(read(path.join(ROOT, "server.js")));
    rec("the endpoint no longer exists", !/["'`]\/api\/telemetry["'`]/.test(sv), "still registered");
    rec("…and nothing writes a telemetry log", !/telemetry\.jsonl/.test(sv), "still writing the file");
    rec("…and no page ever posted to it", !PAGES.some((p) => /api\/telemetry/.test(read(p))), "a page still calls it");
  }

  console.log("\n[3. what leaves the machine] the complete list of outbound destinations");
  {
    // Every absolute http(s) URL in shipped code, reduced to its host. This is the whole egress surface.
    const hosts = new Map();
    for (const p of SHIPPED) {
      const src = stripComments(read(p));
      for (const m of src.matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&*+,;=%${}-]+/g)) {
        const host = (m[0].match(/^https?:\/\/([^/"'`\s${]*)/) || [])[1] || m[0];
        if (!host) continue;
        if (!hosts.has(host)) hosts.set(host, new Set());
        hosts.get(host).add(path.basename(p));
      }
    }
    for (const [h, files] of [...hosts].sort()) console.log(`     ${h}  <- ${[...files].join(", ")}`);

    // Each of these is allowed for exactly one reason, stated. Anything else is a new destination and must be
    // justified deliberately rather than slipped in.
    const ALLOWED = {
      "www.w3.org": "the SVG XML namespace string passed to createElementNS — a constant, never fetched",
      "generativelanguage.googleapis.com": "Google Gemini, called only with the user's OWN pasted API key",
      "aistudio.google.com": "a link the user clicks to obtain that key",
      "raw.githubusercontent.com": "public HOI4 placeholder icons; images only, and pinned in the CSP img-src",
      "127.0.0.1": "the app's own local server",
      "localhost": "the app's own local server",
      // ⚠️ THE ONE THIS TEST ORIGINALLY MISSED. update-checker.js asks GitHub for the latest release so the
      // home page can show a dismissible "update available" banner. It is a plain GET carrying only a
      // User-Agent; the running version is compared LOCALLY and is never transmitted, and no mod data,
      // identifier or user data goes with it. Cached 6h, 4s timeout, fails silently. Only home.html loads
      // the script that triggers it.
      "api.github.com": "update check: GET /repos/<repo>/releases/latest, no user data sent",
      "github.com": "the releases page URL shown in the update banner — a link, not a request",
    };
    const unexpected = [...hosts.keys()].filter((h) => {
      const bare = h.replace(/:.*$/, "").replace(/^\$\{.*$/, "");
      return !Object.keys(ALLOWED).some((a) => bare === a || bare.endsWith("." + a));
    });
    rec("no destination outside the declared list", unexpected.length === 0, unexpected);
    rec("…and the list is real, not an empty sweep", hosts.size >= 3, [...hosts.keys()]);
  }

  console.log("\n[4. no analytics, no fingerprinting, no phoning home]");
  {
    // Names that would each be a collection mechanism if present.
    const BANNED = [
      "sendBeacon", "navigator.sendBeacon", "google-analytics", "googletagmanager", "gtag(",
      "mixpanel", "amplitude", "posthog", "segment.io", "@sentry", "Sentry.init", "bugsnag",
      "ipapi", "ip-api.com", "ipinfo.io", "geoip", "freegeoip", "api.ipify.org", "whatismyipaddress",
      "os.networkInterfaces", "macAddress", "getMac", "machineId", "machine-id",
    ];
    const found = [];
    for (const p of SHIPPED) {
      const src = stripComments(read(p));
      for (const b of BANNED) if (src.includes(b)) found.push(`${path.basename(p)}: ${b}`);
    }
    rec("none of the known collection mechanisms is present", found.length === 0, found);
  }

  console.log("\n[5. the AI calls are the user's own, and opt-in]");
  {
    const sv = read(path.join(ROOT, "server.js"));
    // Every Gemini call carries the key the user pasted; there is no bundled key to fall back on.
    //
    // ⚠️ Match every fetch, not just the ones that spell the host out. Three of the four Gemini calls build
    // their URL from a `baseUrl` variable, so grepping for "generativelanguage" found one of four and would
    // have reported near-total coverage of a quarter of the surface.
    const calls = [...stripComments(sv).matchAll(/fetch\(\s*(?:`[^`]*`|"[^"]*"|'[^']*'|[A-Za-z_$][\w.$]*)[^)]{0,80}/g)]
      .map((m) => m[0])
      .filter((c) => !/127\.0\.0\.1|localhost/.test(c));
    console.log(`     ${calls.length} outbound fetch site(s) in server.js`);
    calls.forEach((c) => console.log(`       ${c.replace(/\s+/g, " ").slice(0, 96)}`));
    rec("every outbound call carries the user's apiKey", calls.length > 0 && calls.every((c) => /apiKey/.test(c)), calls);
    rec("…and the only external base URL is Google's Gemini endpoint",
      /const geminiGenerateUrl = \(model\) => `https:\/\/generativelanguage\.googleapis\.com/.test(sv), "the base URL changed");
    rec("…and no API key is baked into the source",
      !/AIza[0-9A-Za-z_-]{30,}/.test(sv), "a literal Google API key is embedded");
    rec("…with no key, the model lookup returns without calling out", /if \(!apiKey\) return GEMINI_MODELS;/.test(sv), "the no-key early return is gone");
  }

  console.log("\n[6. the server is not reachable from the network]");
  {
    const sv = read(path.join(ROOT, "server.js"));
    rec("it binds to the loopback address explicitly", /app\.listen\(port,\s*["']127\.0\.0\.1["']\)/.test(sv), "binds to all interfaces");
  }

  console.log(`\n=== no telemetry: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
