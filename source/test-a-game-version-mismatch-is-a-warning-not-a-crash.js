// ⛔ #a-game-version-mismatch-is-a-warning-not-a-crash (final round, L5) — MOD HEALTH'S "WILL IT CRASH?" CARD FILES A
// supported_version MISMATCH WITH THE WARNINGS, IN mod-version.js'S OWN WORDS, AND EVERY OTHER PLACE THAT SHOWS IT AGREES.
//
// THE DEFECT. public/modhealth-crashcheck.js made the mismatch an ERROR row, first in the list, counted it as a crash and added a
// clause to the red headline. Measured 2026-11-20 against a real server (probe-L5: a fresh vanilla add-on whose descriptor says
// supported_version="1.19.*", on the 1.20.0.0 install): with nothing else wrong the card read
//     ⛔ Will it crash? — fix this before launch: a game version this mod was not made for. Fix before launch.      (red)
// while the row under it, the server's own message, said "Many mods still run fine across a branch, so this isn't necessarily a
// problem". Owner, 2026-11-20: amber, not red. The version banner on every page and the Map editor's box showed that same message
// in red, and two code comments still promised a crash on Play.
//
// HOW IT IS TESTED: the REAL panel is executed over answers of the server's shape (as test-the-crash-card-names-a-problem-this-map-has.js
// runs it), with /api/modversion built from the REAL mod-version.js the way server.js builds it (pinned below from the comment-masked
// source), and the rendered card and the 📋 Copy report items are read. The control is a real FATAL map rule: it must still turn the
// card red on its own. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { maskJsComments } = require("./testlib-strip-comments.js");
const labels = require("./public/map-rule-labels.js");
const MV = require("./mod-version.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 600) : "")); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), "utf8");
const CRASHCHECK = read("public", "modhealth-crashcheck.js");
const RED = "#f85149";

/** What GET /api/modversion answers for a mod declaring `supported` on a game reporting `raw`/`display` (server.js's own spread). */
const versionAnswer = (supported, raw, display) => Object.assign({ ok: true, isVanilla: false, bootId: "t" }, MV.checkModGameVersion(supported, raw, display));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function renderCard(problems, version) {
  const v = { ok: true, problems, errors: problems.filter((p) => p.severity === "error").length, warnings: problems.filter((p) => p.severity !== "error").length };
  const panel = { innerHTML: "", insertAdjacentHTML(_w, h) { this.innerHTML += h; } };
  const els = { mhCrashCheck: panel };
  const el = (id) => (els[id] = els[id] || { style: {}, value: "", disabled: false, textContent: "", innerHTML: "", addEventListener() {} });
  let runFn = null;
  const win = { NovaMapRuleLabels: labels };
  const sandbox = {
    console, JSON, encodeURIComponent, Number, String, Array, Math, Date, Object,
    window: win,
    localStorage: { getItem: () => "D:/fixture-mod" },
    document: { readyState: "complete", addEventListener() {}, getElementById: (id) => (id === "mhCrashCheck" ? panel : el(id)) },
    setTimeout: (fn) => { runFn = fn; return 0; },
    fetch: async (url) => ({ json: async () => {
      const u = String(url);
      if (u.indexOf("/api/root") === 0) return { hoi4GameRoot: "D:/fixture-game" };
      if (u.indexOf("/api/map/validate") === 0) return v;
      if (u.indexOf("/api/modversion") === 0) return version;
      if (u.indexOf("/api/modhealth/loc-check") === 0) return { ok: true, problems: [] };
      return {};
    } }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CRASHCHECK, sandbox);
  if (typeof runFn === "function") await runFn();
  const html = panel.innerHTML;
  const m = /font-weight:600; color:([^;"]*);">([^<]*)</.exec(html) || [];
  const row = /<span style="color:([^;]*); font-weight:600;">Game version:<\/span> ([^<]*)<\/div>/.exec(html);
  const items = (win.__mhCrashReport && win.__mhCrashReport.items) || [];
  return { html, color: m[1] || "", head: m[2] || "", row: row ? { color: row[1], text: row[2] } : null, item: items.find((i) => i && i.label === "Game version") || null, items };
}

(async () => {
  try {
    console.log("-- the mismatch, as the server words it (derived) --");
    const mis = versionAnswer("1.19.*", "1.20.0.0", "Operation Postern v1.20.0.0");
    const same = versionAnswer("1.20.*", "1.20.0.0", "Operation Postern v1.20.0.0");
    ok(mis.severity === "warning" && /1\.19\.\*/.test(mis.message) && /1\.20/.test(mis.message), "THE CONTROL: a 1.19.* mod on a 1.20 game is a mismatch, and the message names both", mis);
    ok(same.severity !== "warning" && !same.message, "THE CONTROL: a 1.20.* mod on the same game is not", same);
    ok(!/crash/i.test(mis.message) && /Many mods still run fine across a branch/.test(mis.message), "THE CONTROL: mod-version.js's message claims no crash and says many mods run fine across a branch", mis.message);
    const S = maskJsComments(read("server.js"));
    const route = S.slice(S.indexOf('app.get("/api/modversion"'), S.indexOf('app.get("/api/modversion"') + 2600);
    ok(S.indexOf('app.get("/api/modversion"') !== -1 && /const result = modVersion\.checkModGameVersion\(/.test(route) && /res\.json\(\{ ok: true, isVanilla, bootId: SERVER_BOOT_ID, \.\.\.result \}\)/.test(route),
      "THE CONTROL: GET /api/modversion answers checkModGameVersion's result spread into { ok, isVanilla, bootId } — the shape fed to the card here");

    console.log("\n-- ⭐⭐⭐ a mod made for 1.19 on a 1.20 install, nothing else wrong --");
    const a = await renderCard([], mis);
    ok(a.color !== RED && !/^⛔/.test(a.head), "⭐⭐⭐ the card is not red", [a.color, a.head]);
    ok(/^⚠ Will it crash\? — 1 warning\(s\), but nothing that crashes the game\./.test(a.head), "⭐⭐ …it is the amber warnings verdict, with the mismatch as its one warning", a.head);
    ok(!/not made for/.test(a.head), "⭐ …and the headline carries no version clause", a.head);
    ok(!!a.row && a.row.color !== RED && a.row.color === "#9e6a00", "⭐⭐ the Game version row is a warning row (amber label)", a.row);
    ok(!!a.row && a.row.text === esc(mis.message), "⭐⭐ …worded as mod-version.js words it, roll-back advice and all", a.row);
    ok(!!a.item && a.item.sev === "warning" && a.item.msg === mis.message, "⭐⭐ 📋 Copy report files it as [WARNING] with the same words", a.item);

    console.log("\n-- the controls: what the mismatch does not change --");
    const fatal = { severity: "error", rule: "land_not_in_state", message: "a land province has no state" };
    ok(labels.isFatalRule("land_not_in_state") === true, "THE CONTROL: land_not_in_state is in the curated FATAL set");
    const b = await renderCard([fatal], mis);
    ok(b.color === RED && /^⛔ Will it crash\? — /.test(b.head) && /1 problem Save stops for/.test(b.head), "⭐⭐⭐ a real fatal rule still turns the card red on its own", b.head);
    ok(b.head.indexOf(labels.fatalVerdict(["land_not_in_state"]).headline) !== -1, "…worded by fatalVerdict, as the Save gate words it", b.head);
    ok(!/not made for|game version/i.test(b.head) && !!b.row && b.row.color === "#9e6a00", "⭐ …with no version clause, the mismatch still listed as a warning", [b.head, b.row]);
    const b0 = await renderCard([fatal], same);
    ok(b0.color === RED && b0.head === b.head, "⭐ the red verdict is the same with or without the mismatch", [b0.head, b.head]);
    const nf = { severity: "error", rule: "state_no_category", total: 3, totalNoun: "states", message: "3 states have no category" };
    ok(labels.isFatalRule("state_no_category") === false, "THE CONTROL: state_no_category is not FATAL");
    const c = await renderCard([nf], mis);
    ok(c.color === "#d29922" && /no, it loads, but 1 serious problem\(s\)/.test(c.head), "⭐ a map that loads but is broken stays the amber “it loads, but” verdict, the mismatch not counted as a serious problem", c.head);
    const clean = await renderCard([], same);
    ok(/Good to launch/.test(clean.head) && !clean.row, "THE CONTROL: no mismatch, nothing wrong: “Good to launch” and no version row", clean.head);
    const CC = maskJsComments(CRASHCHECK);
    ok(!/a game version this mod was not made for/.test(CC) && !/crashCount = [^;]*versionWarn/.test(CC) && !/totalBad = [^;]*versionWarn/.test(CC),
      "⭐ the panel's code holds no version clause and counts the mismatch in neither crashCount nor totalBad");

    console.log("\n-- every other place that shows the mismatch says the same --");
    const VB = read("public", "version-banner.js"), VBm = maskJsComments(VB);
    const MJ = maskJsComments(read("public", "map.js"));
    const cmv = MJ.slice(MJ.indexOf("async function checkModVersion("), MJ.indexOf("async function checkModVersion(") + 1600);
    ok(/esc\(v\.message\)/.test(VBm) && /v\.severity !== "warning" \|\| !v\.message/.test(VBm), "⭐ the page banner shows the server's message itself, only for a mismatch");
    ok(MJ.indexOf("async function checkModVersion(") !== -1 && /v\.message\.replace\(/.test(cmv) && /v\.severity === "warning" && v\.message/.test(cmv), "⭐ …and so does the Map editor's box");
    const barStyle = (/bar\.style\.cssText =\s*("[^"]*"\s*\+\s*)*"[^"]*";/.exec(VBm) || [""])[0];
    const mapBox = (/<div id="mapVersionWarn" style="([^"]*)"/.exec(read("public", "map.html")) || [])[1] || "";
    ok(!!barStyle && !/#f85149|#5a1d1d/i.test(barStyle), "⭐⭐ the banner is not red", barStyle);
    ok(!!mapBox && !/#f85149|#5a1d1d/i.test(mapBox), "⭐⭐ the Map editor's box is not red", mapBox);
    // Whole files that are only about the version, the server's comment above the route, and in the card the lines that name the
    // branch or the version (its other comments quote what the FATAL rules' headline used to say, which is not this).
    const PLAY = /crash(es|ed)?( the instant you press| on) Play|likely crash|loads to (the )?menu,? (and then )?crash/i;
    const SV = read("server.js"), at = SV.indexOf("// Mod ↔ game version compatibility.");
    const lines = (t) => t.split(/\r?\n/);
    const said = [
      ["mod-version.js", lines(read("mod-version.js"))],
      ["public/version-banner.js", lines(VB)],
      ["public/modhealth-crashcheck.js", lines(CRASHCHECK).filter((l) => /branch|version|mismatch/i.test(l))],
      ["server.js above /api/modversion", at === -1 ? ["(the comment above the route is gone)"] : lines(SV.slice(at, SV.indexOf('app.get("/api/modversion"')))],
    ].map(([f, ls]) => [f, ls.filter((l) => PLAY.test(l) || /is gone\)$/.test(l)).map((s) => s.trim().slice(0, 140))]).filter(([, hits]) => hits.length);
    ok(said.length === 0, "⭐ no comment beside the check promises a crash on Play for a mismatch (comments are content: read as written)", said);
  } catch (e) {
    ok(false, "harness", String((e && e.stack) || e));
  } finally {
    console.log(`\n=== a game version mismatch is a warning, not a crash: ${checks - fails.length}/${checks} ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length || checks < 24 ? 1 : 0;
  }
})();
