// The Map Errors popup offers "🔧 Auto-fix all" for a warning whose message says Auto-fix repairs it, not only for an
// error. #a-fixable-warning-gets-the-auto-fix-button
//
// THE DEFECT. openMapErrorsModal (public/map.js) rendered the button only when errs.length > 0. Batch 4 made several
// auto-fixable problems warnings, because the engine logs them and loads on: coastal_province_has_no_sea ("Auto-fix
// recomputes it"), adjacency_bom ("Auto-fix strips it"), building_not_over_land, unitstacks_disagrees_with_province_type.
// A map whose only problems are those showed each message telling the modder Auto-fix repairs it — and no button.
//
// ⚠️ THERE IS NO OTHER WAY IN. The b4 report's note that "the Problems panel 'Fix all' still works" was wrong: the 🩺
// Problems panel and its #mapProblemsFix button were removed from map.html in fcb7e7b ("folded its value into the Map
// Errors modal"). map.js still wires fixAllProblems to $("mapProblemsFix"), which is null on the page. That removed
// panel offered "Fix all" whenever it listed anything; Mod Health's "Will it crash?" links to the Map Editor "to
// auto-fix" for errors OR warnings. The popup was the one place that dropped warnings.
//
// THE FIX. The popup offers the button when there is an error (unchanged) or a warning whose own message names
// Auto-fix — what the modder is reading in that row. Derived here from map-data.js itself: every warning push whose
// message names Auto-fix must get the button on its own, and every one whose message does not must not.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-popupfix-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];

// Every problem push in map-data.js: its rule, its severity, and the text of its object literal from the rule onwards.
function pushes(src) {
  const out = [];
  const re = /rule:\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    const a = /severity:\s*"([a-z]+)"\s*,\s*$/.exec(before);
    let severity = a ? a[1] : null;
    if (!severity) { const b = /^rule:\s*"[a-z0-9_]+"\s*,\s*severity:\s*"([a-z]+)"/.exec(src.slice(m.index, m.index + 200)); severity = b ? b[1] : null; }
    // ⚠️ Read each push WHOLE, and follow a message that is built elsewhere. The old window stopped at
    // min(end, m.index + 3000) and took only the literal at the push, so a rule whose text is long enough to be
    // assembled in a variable (`message: msg`) arrived here with no words in it and was sorted into `silent` —
    // "a warning that never mentions Auto-fix" — when its text names Auto-fix twice. That misfiled
    // division_starts_on_water here while this file still reported 12 of 12, which is the shape to distrust: the
    // sibling test failed on the same cause and this one stayed quiet. #a-problem-count-is-not-the-length-of-its-example-list
    const end = src.indexOf("});", m.index);
    const nextRe = /rule:\s*"[a-z0-9_]+"/g;
    nextRe.lastIndex = m.index + m[0].length;
    const nm = nextRe.exec(src);
    const stop = Math.min(end < 0 ? Infinity : end, nm ? nm.index : Infinity);
    const body = src.slice(m.index, Number.isFinite(stop) ? stop : m.index + 1500);
    const at = body.indexOf("message:");
    let msgText = at < 0 ? "" : body.slice(at);
    const ident = /message:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(msgText);
    if (ident) {
      const decl = src.lastIndexOf("const " + ident[1] + " =", m.index);
      if (decl >= 0) msgText += "\n" + src.slice(decl, m.index);
    }
    out.push({ rule: m[1], severity, message: msgText });
  }
  return out;
}

// The popup, lifted out of map.js and run, the way test-a-fatal-map-rule-is-an-error-everywhere-it-is-shown.js does.
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP.slice(s, e + 4); };
const modal = grab("function openMapErrorsModal(");
function popupFor(problems) {
  const overlays = [];
  const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "",
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el() });
  const sandbox = {
    console, JSON, encodeURIComponent,
    window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; },
      body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0, statusEl: { style: {} }, setStatus: () => {}, modPath: () => "D:/fixture",
    escHtml: (s) => String(s == null ? "" : s), hasPendingMapEdits: () => false, load: async () => {},
    fetch: async () => ({ json: async () => ({}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${modal}\nglobalThis.__open = openMapErrorsModal;`, sandbox);
  const v = { ok: true, problems, errors: problems.filter((p) => p.severity === "error").length, warnings: problems.filter((p) => p.severity !== "error").length };
  sandbox.__open(v);
  return overlays.map((o) => o.innerHTML).join("\n");
}
const offersFix = (html) => /id="mapErrFix"/.test(html);

try {
  console.log("1. The popup was found and runs");
  rec("openMapErrorsModal lifted", modal.length > 2000, modal.length);
  const clean = popupFor([]);
  rec("THE CONTROL: a clean map gets no Auto-fix button", !offersFix(clean) && /No problems found/.test(clean));

  const all = pushes(maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8")));
  const warnings = all.filter((p) => p.severity === "warning");
  const namesFix = warnings.filter((p) => /\bAuto-fix\b/.test(p.message));
  const silent = warnings.filter((p) => p.message && !/\bAuto-fix\b/.test(p.message));
  rec("the sweep found the warning pushes", warnings.length >= 25, warnings.length);
  rec("…with messages", warnings.filter((p) => p.message).length >= 25, warnings.filter((p) => !p.message).map((p) => p.rule));
  const namedRules = new Set(namesFix.map((p) => p.rule));
  const demoted = ["coastal_province_has_no_sea", "adjacency_bom", "building_not_over_land", "unitstacks_disagrees_with_province_type"];
  rec("THE CONTROL: the four problems batch 4 made warnings are among those whose message names Auto-fix — the derivation is not vacuous",
    demoted.every((r) => namedRules.has(r)), demoted.filter((r) => !namedRules.has(r)));

  console.log("\n2. ⛔ A warning whose message says Auto-fix repairs it gets the button, on its own");
  {
    const without = namesFix.filter((p) => !offersFix(popupFor([{ severity: "warning", rule: p.rule, message: p.message }])));
    rec(`⭐⭐⭐ every one of the ${namesFix.length} warning pushes whose message names Auto-fix offers "🔧 Auto-fix all"`, without.length === 0 && namesFix.length >= 8,
      { without: without.map((p) => p.rule), n: namesFix.length });
  }

  console.log("\n3. …and one whose message does not, does not");
  {
    const offered = silent.filter((p) => offersFix(popupFor([{ severity: "warning", rule: p.rule, message: p.message }])));
    rec(`⭐⭐ none of the ${silent.length} warning pushes whose message does not name Auto-fix offers it`, offered.length === 0 && silent.length >= 8,
      { offered: offered.map((p) => p.rule), n: silent.length });
  }

  console.log("\n4. An error still offers it, as before");
  {
    const err = all.find((p) => p.severity === "error" && p.message && !/\bAuto-fix\b/.test(p.message) && !labels.isFatalRule(p.rule));
    rec("THE CONTROL: found an error push whose message does not name Auto-fix", !!err);
    rec("⭐ an error offers the button whatever its message says", !!err && offersFix(popupFor([{ severity: "error", rule: err.rule, message: err.message }])), err && err.rule);
  }

  console.log("\n5. What the validator really returns for a map whose one problem is a coastal flag");
  {
    // test-the-coastal-column-is-derived.js's fixture, with province 3 retyped to land in the csv and nothing recomputed.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-popupfix-mod-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="Popup"\nreplace_path="map"\n');
    const W = 256, H = 256, COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
    const rowSize = (W * 3 + 3) & ~3, bmp = Buffer.alloc(54 + rowSize * H);
    bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(54 + rowSize * H, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(rowSize * H, 34);
    for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[Math.min(4, Math.floor(x / 64) + 1)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
    fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
    fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1",
      "2;20;20;20;land;true;plains;1", "3;30;30;30;land;false;plains;1", "4;40;40;40;land;true;plains;1"].join("\n") + "\n");
    const NOGAME = path.join(os.tmpdir(), "__no_game_popupfix__");
    const problems = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
    const coastal = problems.filter((p) => p.rule === "coastal_province_has_no_sea");
    rec("THE CONTROL: the validator reports the coastal flags", coastal.length === 1, problems.map((p) => p.rule));
    rec("THE CONTROL: …and no error, so an error cannot be what brings the button", !problems.some((p) => p.severity === "error"),
      problems.filter((p) => p.severity === "error").map((p) => p.rule));
    rec("⭐⭐⭐ that response offers Auto-fix all", offersFix(popupFor(problems)));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== the map errors popup offers auto-fix for a warning it can fix: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
