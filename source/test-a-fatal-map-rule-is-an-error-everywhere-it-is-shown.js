// A rule in the curated FATAL set is emitted as an ERROR — so the Save status line, the popup it opens and Mod
// Health's "Will it crash?" all agree that it will crash. #a-fatal-rule-is-always-an-error
//
// THE DEFECT. Of the rules in FATAL (public/map-rule-labels.js), every one was pushed with severity "error"
// except bmp_too_big, pushed as a "warning". The three places that count "will crash" disagreed about whether
// severity matters, so the same oversized map was reported three ways:
//   * mapCrashGate (public/map.js) filters problems by isFatalRule alone — "⛔ The map now has 1 error that will
//     crash HOI4 on launch — see the popup";
//   * openMapErrorsModal, the popup it opens, takes severity === "error" FIRST — so its will-crash section was
//     empty, the title read "Map Errors" and the type-"save" gate never armed;
//   * Mod Health (public/modhealth-crashcheck.js) does the same — "1 warning(s), but nothing that crashes".
// /api/map/validate counted it under `warnings`, so the gate's own "other problems" figure was 0 − 1 = −1.
//
// THE EVIDENCE for keeping it fatal and making it an error, rather than the reverse:
//   * HOI4 wiki, Map modding → Provinces: "Due to the engine limitations, the total area of the file in pixels
//     cannot exceed 13 238 272, approximately."
//   * HOI4 wiki, Troubleshooting → Main Menu Loading, the gfx/models/supply/railroad.shader crash: "Some causes
//     include provinces.bmp … having a size of over 40 MiB".
//   * 0 of 6 shipping maps exceed it (largest: Old World Blues, 5632x2304 = 12,976,128 px), so gating on it
//     cannot false-fire on shipping content.
// ⚠️ Honest caveat: the two wiki figures do not coincide — 13,238,272 px is a 37.9 MiB file, not 40 — and the
// first says "approximately". Nova's threshold is the stated engine limit and is unchanged here; this test is
// about the three counters agreeing on the same problem, which is true whichever figure is exact.
//
// The guard is derived from the source, not typed in: every FATAL rule, at every place map-data.js pushes it.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fatalsev-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];

// Every `rule: "<name>"` in the code, with the severity written beside it in the same object literal.
function emissionSeverities(src) {
  const out = [];
  const re = /rule:\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    const a = /severity:\s*"([a-z]+)"\s*,\s*$/.exec(before);
    let sev = a ? a[1] : null;
    if (!sev) {
      const b = /^rule:\s*"[a-z0-9_]+"\s*,\s*severity:\s*"([a-z]+)"/.exec(src.slice(m.index, m.index + 200));
      sev = b ? b[1] : null;
    }
    out.push({ rule: m[1], severity: sev, line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

// A 24-bit BMP header claiming W x H — validateMapFiles reads only the header for the size rules.
function header24(W, H) {
  const b = Buffer.alloc(54);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + W * H * 3, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  return b;
}

(async () => {
  try {
    console.log("1. Every FATAL rule is pushed as an error, at every site (derived from map-data.js)");
    {
      const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      const sites = emissionSeverities(src);
      rec("the sweep found the rule emissions", sites.length >= 40, sites.length);
      // THE CONTROL: the parser really does see a warning, in either key order — so a pass means something.
      const c1 = emissionSeverities('problems.push({ severity: "warning", rule: "bmp_too_big", file: "x" })');
      const c2 = emissionSeverities('problems.push({ rule: "bmp_too_big", severity: "warning" })');
      rec("THE CONTROL: a warning-severity push is read as a warning, either key order",
        c1.length === 1 && c1[0].severity === "warning" && c2.length === 1 && c2[0].severity === "warning", { c1, c2 });
      const fatal = [...labels.FATAL];
      const missing = fatal.filter((r) => !sites.some((s) => s.rule === r));
      rec("every FATAL rule has at least one push site", missing.length === 0, missing);
      const wrong = sites.filter((s) => labels.FATAL.has(s.rule) && s.severity !== "error");
      rec("⭐⭐⭐ no FATAL rule is ever pushed with a severity other than \"error\"", wrong.length === 0,
        wrong.map((s) => `${s.rule} at map-data.js:${s.line} is ${s.severity}`));
    }

    console.log("\n2. /api/map/validate counts errors by severity — the response the clients below read");
    {
      const server = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      rec("server.js derives `errors` from severity === \"error\"",
        /errors:\s*problems\.filter\(\(p\)\s*=>\s*p\.severity\s*===\s*"error"\)\.length/.test(server));
    }

    // An oversized provinces.bmp — one 256-step taller than Old World Blues, the largest shipping map.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fatalsev-mod-")); tmps.push(mod);
    fs.mkdirSync(path.join(mod, "map"), { recursive: true });
    fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), header24(5632, 2560));
    const NOGAME = path.join(os.tmpdir(), "nova-no-game-dir");
    const problems = md.validateMapFiles({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    const v = { ok: true, problems,
      errors: problems.filter((p) => p.severity === "error").length,
      warnings: problems.filter((p) => p.severity === "warning").length };

    console.log("\n3. The oversized map itself");
    {
      const p = problems.find((x) => x.rule === "bmp_too_big");
      rec("5632x2560 is reported as bmp_too_big", !!p, problems.map((x) => x.rule));
      rec("⭐⭐ …as an error, matching its place in the FATAL set", !!p && p.severity === "error", p && p.severity);
      rec("…and a fatal message does not hedge with \"may fail\"", !!p && !/may fail/i.test(p.message), p && p.message);

      const ok = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fatalsev-owb-")); tmps.push(ok);
      fs.mkdirSync(path.join(ok, "map"), { recursive: true });
      fs.writeFileSync(path.join(ok, "map", "provinces.bmp"), header24(5632, 2304));
      rec("THE CONTROL: Old World Blues' 5632x2304 is not", !md.validateMapFiles({ modRoot: ok, gameRoot: NOGAME }).some((x) => x.rule === "bmp_too_big"));
    }

    console.log("\n4. The Map editor after a Save — the REAL mapCrashGate and openMapErrorsModal, run");
    let editorFatal = -1, popupFatal = -1;
    {
      const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
      const MASKED = maskJsComments(MAP);
      const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP.slice(s, e + 4); };
      const gate = grab("async function mapCrashGate");
      const modal = grab("function openMapErrorsModal(");
      rec("mapCrashGate lifted", gate.length > 300, gate.length);
      rec("openMapErrorsModal lifted", modal.length > 2000, modal.length);
      let status = "";
      const overlays = [];
      const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "",
        addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el() });
      const sandbox = {
        console, JSON, encodeURIComponent,
        window: { NovaMapRuleLabels: labels },         // the real module, as map.html loads it
        document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; },
          body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
        setTimeout: () => 0,
        statusEl: { style: {} },
        setStatus: (s) => { status = String(s); },
        modPath: () => "D:/fixture",
        escHtml: (s) => String(s == null ? "" : s),
        hasPendingMapEdits: () => false,
        fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/validate") === 0 ? v : {}) }),
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(`${modal}\n${gate}\nglobalThis.__gate = mapCrashGate;`, sandbox);
      await sandbox.__gate({ done: 1 });
      const html = overlays.map((o) => o.innerHTML).join("\n");
      const g = /⛔ The map now has (\d+) problems? Save stops for/.exec(status);
      editorFatal = g ? +g[1] : 0;
      const pm = /💀 (\d+) problems? Save stops for/.exec(html);
      popupFatal = pm ? +pm[1] : 0;
      rec("the status line counts it among what Save stops for", editorFatal === 1, status);
      rec("⭐⭐⭐ …and the popup it opens lists it under what Save stops for", popupFatal === 1, html.slice(0, 200));
      rec("⭐⭐ …with the type-\"save\" gate armed", /id="mapErrGateInput"/.test(html));
      rec("…and no negative \"other problems\" count", !/-\d+ other problem/.test(status), status);
    }

    console.log("\n5. Mod Health's \"Will it crash?\" — the REAL panel script, run");
    let healthFatal = -1;
    {
      const panel = { innerHTML: "", insertAdjacentHTML() {} };
      let runFn = null;
      const sandbox = {
        console, JSON, encodeURIComponent,
        window: { NovaMapRuleLabels: labels },
        localStorage: { getItem: () => "D:/fixture-mod" },
        document: { readyState: "complete", addEventListener() {}, getElementById: (id) => (id === "mhCrashCheck" ? panel : null) },
        setTimeout: (fn) => { runFn = fn; return 0; },
        fetch: async (url) => ({ json: async () => {
          const u = String(url);
          if (u.indexOf("/api/root") === 0) return { hoi4GameRoot: "D:/fixture-game" };
          if (u.indexOf("/api/map/validate") === 0) return v;
          if (u.indexOf("/api/modversion") === 0) return { ok: true, severity: "ok" };
          if (u.indexOf("/api/modhealth/loc-check") === 0) return { ok: true, problems: [] };
          return {};
        } }),
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8"), sandbox);
      rec("the panel scheduled its check", typeof runFn === "function");
      if (runFn) await runFn();
      // Moved with #a-map-message-claims-only-what-the-engine-shows: Mod Health's line read "yes: N problem(s) that stop HOI4 loading or
      // crash on Play" for every fatal rule. It now counts what Save stops for and words its headline by FATAL_OUTCOME (fatalVerdict).
      const m = /Will it crash\? — [^:<]*: (\d+) problems? Save stops for/.exec(panel.innerHTML);
      healthFatal = m ? +m[1] : 0;
      rec("⭐⭐⭐ Mod Health counts it among the problems Save stops for", healthFatal === 1, panel.innerHTML.replace(/<[^>]+>/g, " ").slice(0, 200));
    }

    console.log("\n6. All three agree");
    rec("⭐⭐⭐ status line, popup and Mod Health count the same fatal problems", editorFatal === 1 && popupFatal === 1 && healthFatal === 1,
      { editorFatal, popupFatal, healthFatal });
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== a fatal map rule is an error everywhere it is shown: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
