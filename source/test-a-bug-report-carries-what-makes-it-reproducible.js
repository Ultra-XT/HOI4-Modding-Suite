// 🐞 Roadmap item 4 — a bug report worth reading, without a server behind it.
//
// The owner files the best reports this project gets, and the reason is that they say WHICH MOD, WHICH
// SCREEN and WHAT THE FILE LOOKED LIKE. Nobody else supplies that unprompted, and the published issue
// template is GitHub's stock default — it asks about smartphones and browsers. So the job is not another way
// to complain (the Discord link is on every page now); it is to make the report carry the four or five facts
// that turn "the map editor is broken" into something reproducible.
//
// ⭐⭐ AND THE REASON THERE IS NO SERVER. A 24/7 endpoint that receives reports costs money every month,
// needs uptime, and turns a desktop app that has never sent a byte anywhere into one that handles other
// people's data. Nova builds the text; the user reads it; the user sends it. What is lost is automatic
// collection. What is kept is that the user sees exactly what they are sending.
//
// ⛔ WHICH IS WHY THE `~` COLLAPSING IS LOAD-BEARING AND NOT A NICETY. A report is pasted into a public
// issue or a Discord channel, and `C:\Users\<their real name>\…` is the one piece of personal data this
// would otherwise leak by default, in every single report, forever. The first version got it wrong —
// os.homedir() answers `C:\Users\name` with BACKSLASHES while a path that has been through a URL or a config
// file arrives with forward slashes, so the naive startsWith matched neither, silently. Caught by driving
// the real endpoint with a real home-directory path, not by reading the code.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53701);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 340) : "")); }
};

const roots = [];
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bug-ad-")); roots.push(appdata);
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bug-")); roots.push(mod);
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Reportable"\n', "utf8");

const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: Object.assign({}, process.env, {
    PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
  }),
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 160; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    const about = async (modPath) =>
      (await fetch(`http://127.0.0.1:${PORT}/api/about${modPath === undefined ? "" : "?modPath=" + encodeURIComponent(modPath)}`)).json();

    console.log("\n[⭐ the facts that make a report reproducible]");
    {
      const d = await about(mod);
      ok(d && d.ok === true, "/api/about answers", d);
      ok(/^\d+\.\d+\.\d+/.test(String(d.nova)), "…Nova's version", d.nova);
      ok(String(d.nova) === require("./package.json").version, "…and it is the REAL one, not a literal", d.nova);
      ok(typeof d.platform === "string" && d.platform.length > 3, "…the platform", d.platform);
      ok(d.mod && d.mod.name === "Reportable", "…the mod's own name from its descriptor, not its folder", d.mod);
      ok(Array.isArray(d.dependencies), "…its dependencies", d.dependencies);
      ok(d.game && typeof d.game.path === "string", "…and where the game is", d.game);
    }

    console.log("\n[…offline, because a report that stalls is a report nobody sends]");
    {
      // /api/update-check reaches GitHub and can take four seconds. This one must not.
      const t0 = Date.now();
      await about(mod);
      const ms = Date.now() - t0;
      ok(ms < 1500, `it answers in ${ms}ms`, ms);
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = SRV.indexOf('app.get("/api/about"');
      let i = SRV.indexOf("{", at), d = 0, end = at;
      for (; i < SRV.length; i++) { if (SRV[i] === "{") d++; else if (SRV[i] === "}") { d--; if (!d) { end = i; break; } } }
      const handler = SRV.slice(at, end + 1);
      ok(handler.length > 400, "the handler was extracted", handler.length);
      ok(!/updateChecker|fetch\(|https:/.test(handler), "…and it reaches the network for nothing", "a bug report must not depend on GitHub being up");
    }

    console.log("\n[⛔ the account name does not leave the machine]");
    {
      // Drive it with a real home-directory path, in BOTH separator styles — the exact thing the first
      // version got wrong, and the only way to catch it.
      const home = os.homedir();
      for (const [label, p] of [
        ["backslashes", path.join(home, "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "x")],
        ["forward slashes", (home + "/Documents/Paradox Interactive/Hearts of Iron IV/mod/x").replace(/\\/g, "/")],
        ["the home directory itself", home],
      ]) {
        const d = await about(p);
        const shown = (d.mod && d.mod.path) || "";
        ok(shown.startsWith("~"), `${label}: collapsed to ~`, shown);
        const user = path.basename(home);
        ok(user.length < 2 || !shown.toLowerCase().includes(user.toLowerCase()),
          `${label}: …and the account name is gone`, { shown, user });
      }
      // A path OUTSIDE the home directory is not mangled — the mod's own folder is the content being
      // discussed (a Workshop id, a mod name), and hiding that would make the report useless.
      //
      // ⚠️ Not the scratch mod: on Windows os.tmpdir() is C:\Users\<name>\AppData\Local\Temp, so it IS
      // under the home directory and collapsing it is the CORRECT answer. Asserting on it failed here and
      // the code was right — build a path that provably cannot be under home instead.
      const outside = path.join(path.parse(os.homedir()).root, "NovaNotUnderHome", "SomeMod");
      ok(!outside.toLowerCase().startsWith(os.homedir().toLowerCase()), "the probe path really is outside home", { outside, home });
      const d = await about(outside);
      ok((d.mod.path || "").indexOf("~") === -1, "a path outside the home directory is shown as it is", d.mod.path);
      ok((d.mod.path || "").includes("NovaNotUnderHome"), "…in full", d.mod.path);
    }

    console.log("\n[⭐ CONTROL: nothing here sends anything]");
    {
      // The whole argument for not running a server is that Nova never transmits. If a POST appeared, that
      // claim would be false and nobody would notice from the UI.
      const REPORTER = fs.readFileSync(path.join(__dirname, "public", "nova-bug-report.js"), "utf8");
      ok(!/method:\s*["']POST["']/i.test(REPORTER), "the reporter makes no POST", "it would be transmitting");
      const fetches = [...REPORTER.matchAll(/fetch\(\s*"([^"]*)"/g)].map((m) => m[1]);
      ok(fetches.every((u) => u.startsWith("/api/")), "…and only reads from Nova's own backend", fetches);
      ok(/github\.com\/Ultra-XT\/HOI4-Modding-Suite\/issues\/new/.test(REPORTER),
        "…while the GitHub link opens the COMPOSE form, which the user still submits themselves");
      ok(!/navigator\.sendBeacon|XMLHttpRequest/.test(REPORTER), "…no beacon, no XHR");
      const HOME = fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8");
      ok(/Read it through, then copy it or open an issue/.test(HOME),
        "…and the UI tells the user to read it before sending — that instruction IS the privacy model");
    }

    console.log("\n[the report says which screen, in the words the nav uses]");
    {
      const REPORTER = fs.readFileSync(path.join(__dirname, "public", "nova-bug-report.js"), "utf8");
      ok(/querySelector\("\.suite-nav-link\.active"\)/.test(REPORTER),
        "the screen name comes from the nav's own active tab", "'map.html' tells a reader less than 'Map Editor'");
      ok(/window\.addEventListener\("error"/.test(REPORTER) && /unhandledrejection/.test(REPORTER),
        "recent script errors are captured");
      ok(/if \(!ev \|\| !ev\.message\) return;/.test(REPORTER),
        "…but a missing image is not an error worth reporting — every page has a capture-phase listener for those");
      ok(/errors\.length > MAX/.test(REPORTER), "…and the ring is bounded, so this is never a log file");
      ok(!/\son[a-z]+\s*=\s*["']/.test(REPORTER), "no inline handler, which the CSP kills silently");
      ok((() => { try { new Function(REPORTER); return true; } catch (e) { return String(e.message); } })() === true,
        "it parses", (() => { try { new Function(REPORTER); return "ok"; } catch (e) { return String(e.message); } })());
    }

    console.log("\n[it is reachable from wherever the user is]");
    {
      const DIR = path.join(__dirname, "public");
      const pages = fs.readdirSync(DIR).filter((f) => f.endsWith(".html") &&
        /class="suite-nav-link/.test(fs.readFileSync(path.join(DIR, f), "utf8")));
      for (const f of pages) {
        ok(/nova-bug-report\.js/.test(fs.readFileSync(path.join(DIR, f), "utf8")),
          `${f}: loads the reporter, so an error there is captured`, "the error would be gone by the time they reached Settings");
      }
      const HTML = fs.readFileSync(path.join(DIR, "home.html"), "utf8");
      ok(/id="bugPreviewBtn"/.test(HTML) && /id="bugReport"/.test(HTML), "…and Settings can build one");
      ok(/id="bugReport"[^>]*hidden/.test(HTML), "…with the report hidden until it exists");
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    try { srv.kill(); } catch (_) {}
    setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
    process.exitCode = fail ? 1 : 0;
    setTimeout(() => process.exit(fail ? 1 : 0), 1200);
  }
})();
