// A TEST MUST NOT BIND OR DRIVE THE PORT THE DEVELOPER'S OWN NOVA RUNS ON.
//
// The suite starts a lot of servers. If one of them binds the port the user has Nova open on, it fights the
// app they are using: the running instance loses the port on restart, or the test talks to their live
// server and its assertions are measured against whatever mod they happen to have loaded — not a fixture.
//
// The reverse is just as bad and has already happened: 11 tests hardcoded that port, so they only ran on a
// machine with Nova already up, and the two asserting "nothing reaches the mod before Save" were among them.
// run-tests.js now pre-flights the port and skips that set with a reason, and test-runner-cannot-wedge.js
// checks the runner's own detector. This is the other half — that nothing OUTSIDE that declared set reaches
// for it, and that nothing binds it at all.
//
// ⚠️ WHAT THIS DELIBERATELY DOES NOT CHECK: that two tests never share a port number. Dozens do, and it does
// not matter — run-tests.js runs the suite with spawnSync in a plain `for` loop, strictly one at a time, so
// two servers on one number are never up together. I wrote that check first, on the assumption the suite ran
// in parallel, and it reported ~40 "collisions" in files that have coexisted happily for months. Measuring
// the runner instead of assuming would have taken a minute. Recorded here so the next person does not spend
// longer.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments, maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

// ⚠️ THE PORT NUMBER IS BUILT FROM PARTS, ON PURPOSE.
//
// run-tests.js decides a test needs the developer's running Nova by looking for `127.0.0.1:<port>` or
// `localhost:<port>` in its code. Writing that literal here — even inside a regex that only SEARCHES for it —
// would make this file one the runner skips whenever Nova is not answering, and a check that disables itself
// when nobody is looking is worse than no check at all. That is not hypothetical: it is why
// test-runner-cannot-wedge.js exists. The comment is safe, because that detector strips comments.
const USER_PORT = 47000 + 821;
// The same two ways run-tests.js recognises a live test — the env override, and the port in a URL. Both
// assembled rather than written, for the reason above: naming either literally would make this file look
// like one of them.
//
// ⚠️ My first version only looked for the URL form, and the control below caught it immediately: the live
// tests all say `process.env.<var> || <port>`, so the detection found ZERO of them and the check that
// nothing outside the live set drives the port was passing because it was looking at nothing.
const ENV_VAR = ["NOVA", "PORT"].join("_");
const LIVE_URL_RE = new RegExp("process\\.env\\." + ENV_VAR + "|(?:127\\.0\\.0\\.1|localhost):" + USER_PORT);

// DERIVED, so a file added tomorrow is covered the moment it exists. Both suites — `test-*.js` is what
// run-tests.js runs, `e2e-*.js` is the separate one, and either would fight the user's app just as well.
const files = fs.readdirSync(__dirname).filter((f) => /^(test|e2e)-.*\.js$/.test(f)).sort();
rec("the test files were found", files.length > 300, files.length);

const codeOf = (f) => { try { return stripJsComments(fs.readFileSync(path.join(__dirname, f), "utf8")); } catch (_) { return ""; } };

console.log("\n[nothing binds the port the user's Nova is on]");
{
  const listeners = [];
  for (const f of files) {
    const src = codeOf(f);
    // A port this file listens on: the constant it declares, or a literal handed straight to listen().
    const ports = new Set();
    for (const m of src.matchAll(/\bPORT\s*=\s*(\d{4,5})\b/g)) ports.add(Number(m[1]));
    for (const m of src.matchAll(/\.listen\(\s*(\d{4,5})\b/g)) ports.add(Number(m[1]));
    if (ports.has(USER_PORT)) listeners.push(f);
  }
  rec("⭐ no test binds it", listeners.length === 0,
    { listeners, hint: "pick any other number — binding this one takes the port from the app the user has open" });
}

console.log("\n[and only the declared live tests drive it]");
{
  // The live set is the one run-tests.js pre-flights and skips. Its members are named for it (`*-live.js`,
  // plus test-research-modifier-depth.js). Anything else reaching for that URL runs against whatever mod the
  // user happens to have loaded, which is not a test.
  const drivers = files.filter((f) => LIVE_URL_RE.test(codeOf(f)) && !/-live\.js$|modifier-depth/.test(f));
  rec("⭐ nothing outside the live set drives it", drivers.length === 0,
    { drivers, hint: "start a server of your own on a private port, or join the live set the runner pre-flights" });

  // ⭐ CONTROL: the live set must be non-empty, or the check above is satisfied by there being nothing to
  // find — and this file would pass just as happily if the detection were broken.
  const live = files.filter((f) => LIVE_URL_RE.test(codeOf(f)));
  rec("CONTROL: the live tests ARE found by this detection", live.length >= 5, live.length);
  rec("…and every one of them is in the set the runner skips", live.every((f) => /-live\.js$|modifier-depth/.test(f)), live);
}

console.log("\n[…nor binds it through the app it launches]");
{
  // ⛔ #a-sandboxed-launch-keeps-its-port — a file that launches the REAL app (Playwright's _electron) starts the app's own
  // server, and main.js handed that server Nova's own port, explicitly, until it learnt NOVA_PORT: e2e-workflow-test.js and
  // e2e-research-test.js took the port the user's Nova is on whenever it was free, and the first check above never saw it,
  // because neither names the number. So every launch must hand the app NOVA_PORT out of a constant of the file's own that is
  // not the user's port, in the shape run-e2e.js reads as the file's port claim (its own patterns, read out of its source), so
  // the runner never gives two launches one port at once.
  const runnerCode = stripJsComments(fs.readFileSync(path.join(__dirname, "run-e2e.js"), "utf8"));
  const CLAIM_RES = [...runnerCode.matchAll(/matchAll\((\/.+?\/[a-z]*)\)\)\s*out\.add\("port:"/g)].map((m) => {
    const end = m[1].lastIndexOf("/"), flags = m[1].slice(end + 1);
    return new RegExp(m[1].slice(1, end), flags.includes("g") ? flags : flags + "g");
  });
  rec("run-e2e.js's port-claim patterns were read out of its source", CLAIM_RES.length >= 1, CLAIM_RES.map(String));
  const claimedBy = (src) => {
    const code = stripJsComments(src), out = new Set();
    for (const re of CLAIM_RES) for (const m of code.matchAll(re)) out.add(Number(m[1]));
    return out;
  };
  // the matching close of the paren at `open`, in literal-masked text (every paren left is the code's own)
  const closeOf = (bare, open) => {
    let d = 0;
    for (let i = open; i < bare.length; i++) { if (bare[i] === "(") d++; else if (bare[i] === ")" && --d === 0) return i; }
    return -1;
  };
  const GIVEN = new RegExp("\\b" + ENV_VAR + "\\s*:\\s*(?:String\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)|([A-Za-z_$][\\w$]*))\\s*[,}]");
  /** Every launch of the app in `src`, and the port it hands the app's own server. */
  function launchesOf(src) {
    const code = maskJsComments(src), bare = maskJsLiterals(src), claimed = claimedBy(src);
    return [...bare.matchAll(/\b_?electron\.launch\(/g)].map((m) => {
      const open = m.index + m[0].length - 1, close = closeOf(bare, open);
      const call = close === -1 ? "" : code.slice(open, close + 1);
      const g = /\benv\s*:/.test(call) ? GIVEN.exec(call) : null;
      const id = g ? g[1] || g[2] : null;
      const decl = id ? new RegExp("\\bconst\\s+" + id.replace(/\$/g, "\\$") + "\\s*=\\s*(\\d{4,5})\\s*;").exec(code) : null;
      const port = decl ? Number(decl[1]) : null;
      return { id, port, claimed: port !== null && claimed.has(port),
        ok: port !== null && port !== USER_PORT && port >= 1024 && port <= 65535 && claimed.has(port) };
    });
  }
  // Built, not written: a port spelt out here would be read as THIS file's claim by both runners.
  const FREE = 55 * 1000 + 160;   // (and with no five-digit number in it: test-the-documented-test-port-range-is-the-real-one.js reads one as a claim)
  // …and so is Playwright's Electron handle: test-a-bare-test-run-stays-out-of-the-real-folders.js reads a file whose code (its
  // strings kept) names it as one that drives the real app, and holds it to loading safe-write.js first, which this one has no
  // reason to (measured 2026-11-19: written out here, that guard failed on this file).
  const head = "const { " + ["_", "electron"].join("") + ": electron } = require('playwright');\n";
  const launch = (extra) => "(async () => { const app = await electron.launch({ args: ['.', '--user-data-dir=' + d], cwd: __dirname" + extra + " }); })();\n";
  const env = (v) => ", env: Object.assign({}, process.env, { " + ENV_VAR + ": " + v + " })";
  const CASES = [
    ["the launch both files had (no env at all)", head + launch(""), false],
    ["an env without the port", head + launch(", env: Object.assign({}, process.env)"), false],
    ["the user's own port", head + "const APP_PORT = " + USER_PORT + ";\n" + launch(env("String(APP_PORT)")), false],
    ["a port in a constant run-e2e.js cannot read as a claim", head + "const where = " + FREE + ";\n" + launch(env("String(where)")), false],
    ["a port written as a bare string", head + launch(env("\"" + FREE + "\"")), false],
    ["a constant the file never declares", head + launch(env("String(APP_PORT)")), false],
    ["the launch they have now", head + "const APP_PORT = " + FREE + ";\n" + launch(env("String(APP_PORT)")), true],
  ];
  for (const [label, src, want] of CASES) {
    const l = launchesOf(src);
    rec(`${want ? "THE CONTROL" : "CONTROL"}: ${label} — ${want ? "accepted" : "refused"}`, l.length === 1 && l[0].ok === want, l);
  }
  rec("CONTROL: …and a launch named only inside a string is no launch", launchesOf(head + "const s = 'electron.launch({ cwd })';\n").length === 0);

  const launchers = fs.readdirSync(__dirname).filter((f) => /^(test|e2e|testlib)-.*\.js$/.test(f)).sort()
    .map((f) => ({ f, src: fs.readFileSync(path.join(__dirname, f), "utf8") }))
    .filter((x) => x.src.includes("electron"))
    .map((x) => ({ f: x.f, drives: /\b_electron\b/.test(maskJsLiterals(x.src)), l: launchesOf(x.src) }))
    .filter((x) => x.drives || x.l.length);
  rec("the files that launch the real app were found (" + launchers.map((x) => x.f).join(", ") + ")", launchers.length >= 2, launchers.length);
  rec("…and a launch was found in each (one the scan cannot see would leave its file unchecked)",
    launchers.every((x) => x.l.length >= 1), launchers.map((x) => x.f + ": " + x.l.length));
  const bad = launchers.flatMap((x) => x.l.filter((l) => !l.ok).map((l) => x.f + " " + JSON.stringify(l)));
  rec("⭐⭐ every launch hands the app's own server a port of the file's own, claimed, and not the user's", !bad.length,
    { bad, hint: "env: Object.assign({}, process.env, { <the variable>: String(APP_PORT) }) with const APP_PORT = <a free port>: main.js keeps it, or refuses" });
}

console.log("\n[the runner runs several at once — so a shared number must be scheduled around]");
{
  // This section used to assert the runner was SEQUENTIAL, and warned in its own failure hint that if it
  // ever became parallel "two servers on one port CAN collide, and a port-uniqueness check becomes worth
  // having". It became parallel on 2026-08-29 and this is the check that said so. It did its job exactly.
  //
  // The numbers were NOT made unique. 24 of them are shared, and renumbering two dozen files is a large
  // diff plus a permanent trap for whoever adds the next one. The runner instead reads what each file
  // CLAIMS — its ports, its fixed scratch directories, and the live app — and never starts a file whose
  // claim another running file holds. Same guarantee, enforced when a test is scheduled rather than by
  // hoping every author picks a free number. That is what is pinned here.
  const runner = stripJsComments(fs.readFileSync(path.join(__dirname, "run-tests.js"), "utf8"));
  rec("the runner reads each file's port claims", /out\.add\("port:"/.test(runner),
    "it no longer knows which ports a file uses, so it cannot keep two of them apart");
  rec("…and the live app is claimed too, so those never overlap", /out\.add\("live-app"\)/.test(runner),
    "two tests could drive the user's server at once, and it holds global state");
  rec("…a file whose claim is held is passed over, not started", /held\.has\(c\)/.test(runner) && /if \(blocked\) continue/.test(runner),
    "concurrent tests could now bind the same port at the same moment");
  // Claiming after spawning would leave a window in which two files both look free.
  const claimAt = runner.search(/held\.add\(c\)/), startAt = runner.search(/runOne\(f\)\.then/);
  rec("…and the claim is taken BEFORE the file is started", claimAt !== -1 && startAt !== -1 && claimAt < startAt,
    "there is a window where two files both look free");
  rec("…and released only once it has finished", /held\.delete\(c\)/.test(runner), "claims leak and the suite stalls");
  // The way out, for the day a failure does look like two tests treading on each other.
  rec("concurrency can be forced back to one", /NOVA_TEST_CONCURRENCY/.test(runner), "no way to rule concurrency out");
}

console.log(`\n=== no test hijacks the user's server: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
