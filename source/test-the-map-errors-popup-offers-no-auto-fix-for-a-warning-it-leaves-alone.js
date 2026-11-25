// The Map Errors popup offers no "🔧 Auto-fix all" for a warning Auto-fix deliberately leaves alone.
// #a-warning-auto-fix-leaves-alone-offers-no-auto-fix
//
// THE DEFECT. Batch 5 (4490f94) made openMapErrorsModal offer the button for a warning whose message names Auto-fix — what
// the modder reads in that row. dated_naval_building_without_coast names Auto-fix only to say what it does NOT do: "Auto-fix
// repairs the undated block of the same file and deliberately leaves dated ones alone, because a dated block can be
// intentional". So a map whose only fixable-looking problem is that warning was offered a button that could do nothing.
//
// MEASURED on the base commit 21808ba, on a self-contained map (section 3) whose whole validate response — the four parts
// GET /api/map/validate concatenates — is that warning plus province_too_large (which names no Auto-fix): the real popup
// rendered "🔧 Auto-fix all" under "Auto-fix the warning whose message names it:", and one real autoFixMap click wrote no
// file and left the warning reported (section 4) — the popup's own click handler then says "Nothing auto-fixable was found."
//
// THE FIX. There is no rule-to-fixer table to derive from: autoFixMap's passes carry no rule identity, so what a click can
// repair is known only where a problem is pushed. So the problem says so itself — `autoFix: false` beside the message that
// explains why — and the popup offers the button for a warning whose message names Auto-fix unless it declines. Derived here
// from map-data.js: every push that declines gets no button on its own, and every other warning naming Auto-fix still does.
//
// ⛔ A PUSH CAN DECLINE FOR SOME OF ITS PROBLEMS AND NOT OTHERS (batch 8 discovery F2). building_not_over_land's message named
// Auto-fix and the push carried no autoFix, so a map whose only rows over water were a dockyard or a port — which
// fixStandardSlotsOverWater leaves, since only a standard position has somewhere to go back to — was offered the button, and
// the click wrote nothing. That push now decides per problem (autoFix: <an expression>), which the literal-false sweep above
// cannot see: section 2b derives those pushes too, and section 5 measures the real response and the real click (measured on
// 99a99a0 before the fix: the dockyard-only warning had no autoFix and the popup offered "🔧 Auto-fix all").
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-popupdecline-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];

// Every problem push in map-data.js: rule, severity, its message, and whether the object literal declines Auto-fix.
function pushes(src) {
  const out = [];
  const re = /rule:\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    const a = /severity:\s*"([a-z]+)"\s*,\s*$/.exec(before);
    let severity = a ? a[1] : null;
    if (!severity) { const b = /^rule:\s*"[a-z0-9_]+"\s*,\s*severity:\s*"([a-z]+)"/.exec(src.slice(m.index, m.index + 200)); severity = b ? b[1] : null; }
    // ⚠️ THE WINDOW IS STRUCTURAL, NOT A TYPED BUDGET. This used to stop at min(end, m.index + 3000), and a message
    // longer than that budget was silently cut in half — so a push that DOES name Auto-fix late in its text read as
    // one that never mentions it, and the CONTROL below failed while the behaviour it guards was correct. That
    // happened the moment division_starts_on_water grew from a one-line count into a full report (it names
    // Auto-fix, to decline it, about 1,200 characters in). A test that truncates its own evidence reports the
    // truncation as a finding. The push ends at its own "});" or where the next rule begins, whichever comes first.
    const end = src.indexOf("});", m.index);
    const nextRe = /rule:\s*"[a-z0-9_]+"/g;
    nextRe.lastIndex = m.index + m[0].length;
    const nm = nextRe.exec(src);
    const stop = Math.min(end < 0 ? Infinity : end, nm ? nm.index : Infinity);
    const body = src.slice(m.index, Number.isFinite(stop) ? stop : m.index + 1500);
    const at = body.indexOf("message:");
    // …and a message may not be written AT the push. A report long enough to be built up in pieces arrives here as
    // `message: msg`, and a sweep that reads only the push sees a rule with no words in it at all — which is how
    // division_starts_on_water, whose text names Auto-fix twice, read as a rule that never mentions it. Follow the
    // identifier back to where it is built, and take everything from there to the push.
    let msgText = at < 0 ? "" : body.slice(at);
    const ident = /message:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(msgText);
    if (ident) {
      const decl = src.lastIndexOf("const " + ident[1] + " =", m.index);
      if (decl >= 0) msgText += "\n" + src.slice(decl, m.index);
    }
    // declines: autoFix is the literal false. declinesSometimes: autoFix is an expression, so the push declines Auto-fix for some
    // of the problems it reports and not for others — invisible to a test that looks only for the literal.
    const af = /(^|[,{\s])autoFix:\s*([^,\n]+?)\s*,/.exec(at < 0 ? body : body.slice(0, at));
    out.push({ rule: m[1], severity, message: msgText, declines: !!af && af[2] === "false", declinesSometimes: !!af && af[2] !== "false" && af[2] !== "true",
      whole: Number.isFinite(stop) });   // false means no terminator was found and the fallback window was used
  }
  return out;
}

// The popup, lifted out of map.js and run, as test-the-map-errors-popup-offers-auto-fix-for-a-warning-it-can-fix.js does.
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP.slice(s, e + 4); };
const modal = grab("function openMapErrorsModal(");
function popupFor(res) {
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
  sandbox.__open(res);
  return overlays.map((o) => o.innerHTML).join("\n");
}
// What the endpoint sends: { ok, problems, errors, warnings } — the problems exactly as the validator pushed them.
const response = (problems) => ({ ok: true, problems, errors: problems.filter((p) => p.severity === "error").length, warnings: problems.filter((p) => p.severity === "warning").length });
const offersFix = (html) => /id="mapErrFix"/.test(html);

function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-popupdecline-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(d, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return d;
}
// ⛔ #a-file-listed-is-not-a-file-still-there — the shared walk, which tolerates a name the on-access scanner creates and deletes
// between readdirSync and readFileSync ("<NAME>.TXT.tmp"). This file kept a private copy that did not.
const { tree } = require("./testlib-two-layer-map.js");

try {
  console.log("1. The popup was found and runs");
  rec("openMapErrorsModal lifted", modal.length > 2000, modal.length);
  rec("THE CONTROL: a clean map gets no Auto-fix button", !offersFix(popupFor(response([]))));

  console.log("\n2. ⛔ Derived from map-data.js: a push that declines Auto-fix gets no button; every other warning naming it still does");
  const all = pushes(maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8")));
  // A WARNING that declines. The popup offers 🔧 for every error whatever its push says, so an ERROR push that declines —
  // inherited_states_still_load since B6-8, whose own row says "Auto-fix will not touch them" — is not this gate's: what it changes is
  // the footer's count of rows naming Auto-fix as their repair, which test-a-row-auto-fix-will-not-touch-declines-it.js holds.
  const declining = all.filter((p) => p.declines && p.severity === "warning");
  rec("⭐⭐ the sweep found a warning push that declines Auto-fix", declining.length >= 1, all.filter((p) => p.declines).map((p) => `${p.rule} (${p.severity})`));
  // ⭐ …and the sweep read each one WHOLE. Without this, the control below can fail for a reason that has nothing to
  // do with the popup: a message that outgrows the reading window arrives here cut in half, and the half that names
  // Auto-fix is the half that was dropped. Measured when division_starts_on_water became a full report.
  rec("⭐ …and read every push whole, so no message was cut short of the words being tested",
    all.every((p) => p.whole), all.filter((p) => !p.whole).map((p) => p.rule));
  rec("THE CONTROL: …and each names Auto-fix in its message, so the wording alone would have offered the button",
    declining.length >= 1 && declining.every((p) => /\bAuto-fix\b/.test(p.message)), declining.filter((p) => !/\bAuto-fix\b/.test(p.message)).map((p) => p.rule));
  {
    const offered = declining.filter((p) => offersFix(popupFor(response([{ severity: p.severity, rule: p.rule, message: p.message, autoFix: false }]))));
    rec(`⭐⭐⭐ none of the ${declining.length} warning push(es) that decline Auto-fix offers it`, declining.length >= 1 && declining.every((p) => p.severity === "warning") && offered.length === 0,
      { offered: offered.map((p) => p.rule), severities: declining.map((p) => p.severity) });
  }
  {
    const namesFix = all.filter((p) => p.severity === "warning" && !p.declines && /\bAuto-fix\b/.test(p.message));
    const without = namesFix.filter((p) => !offersFix(popupFor(response([{ severity: "warning", rule: p.rule, message: p.message }]))));
    rec(`⭐⭐ every one of the ${namesFix.length} other warning pushes naming Auto-fix still offers it`, namesFix.length >= 8 && without.length === 0, { without: without.map((p) => p.rule) });
  }

  console.log("\n2b. ⛔ Derived: a push that declines Auto-fix for only some of the problems it reports is seen too");
  {
    // WARNINGS only: the popup consults autoFix for a warning and offers the button whenever any ERROR is present, by design
    // (see offerFix in public/map.js). fleet_starts_on_land_with_no_sea decides autoFix per problem too, but became an error
    // on 2026-09-24 (#a-coastless-navy-goes-to-sea) — it is outside this section's premise, not a counterexample to it.
    const sometimes = all.filter((p) => p.declinesSometimes && p.severity === "warning");
    rec("⭐⭐ the sweep finds a push whose autoFix is decided per problem", sometimes.length >= 1, all.filter((p) => p.declines).map((p) => p.rule));
    rec("THE CONTROL: …each a warning whose message names Auto-fix, so the wording alone would offer the button",
      sometimes.length >= 1 && sometimes.every((p) => p.severity === "warning" && /\bAuto-fix\b/.test(p.message)), sometimes.map((p) => [p.rule, p.severity]));
    const wrong = sometimes.filter((p) => offersFix(popupFor(response([{ severity: p.severity, rule: p.rule, message: p.message, autoFix: false }])))
      || !offersFix(popupFor(response([{ severity: p.severity, rule: p.rule, message: p.message, autoFix: true }]))));
    rec(`⭐⭐⭐ each of the ${sometimes.length} offers the button when its problem says autoFix: true, and none when it says false`, sometimes.length >= 1 && wrong.length === 0, wrong.map((p) => p.rule));
  }

  console.log("\n3. The real validate response for a map whose only Auto-fix-naming problem is a dated dockyard");
  // 256x256: a sea strip on top (1); below it land 2 on the left, and on the right land 3 (on the sea) over land 4 (inland).
  // The game layer owns the map, ports for its coastal states 2 and 3, and state 1's air base and rocket site; the mod ships
  // only state 1, landlocked on province 4, with a dockyard dated 1939.
  const W = 256, H = 256;
  const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
  const provAt = (x, y) => (y < 64 ? 1 : x < 128 ? 2 : y < 160 ? 3 : 4);
  const st = (id, provs, history = "") => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n${history}\tprovinces={ ${provs} }\n}\n`;
  const GAME = dir("game", {
    "map/provinces.bmp": bmp24(W, H, (x, y) => COL[provAt(x, y)]),
    "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\r\n") + "\r\n",
    "map/buildings.txt": ["1;air_base;192.00;9.50;47.00;0.00;0", "1;rocket_site_spawn;192.00;9.50;47.00;0.00;0",
      "2;naval_base_spawn;64.00;9.50;191.00;0.00;1", "3;naval_base_spawn;192.00;9.50;191.00;0.00;1"].join("\n"),
    "history/states/2-West.txt": st(2, "2"),
    "history/states/3-East.txt": st(3, "3"),
  });
  const HISTORY = "\thistory={\n\t\towner = ENG\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 5\n\t\t\t}\n\t\t}\n\t}\n";
  const mod = dir("mod", { "descriptor.mod": 'name="Dated"\n', "history/states/1-Inland.txt": st(1, "4", HISTORY) });
  const opts = { modRoot: mod, gameRoot: GAME, dependencyRoots: [] };
  const validate = () => {
    const model = md.buildMapModel({ ...opts, cacheStableLayers: true });
    return [...md.findStateFileConflicts(mod), ...md.validateMapModel(model), ...md.findBuildingAnchorMismatches({ ...opts, model }), ...md.validateMapBitmap(opts)];
  };
  const problems = validate();
  const dated = problems.filter((p) => p.rule === "dated_naval_building_without_coast");
  rec("THE CONTROL: the validator reports the dated dockyard, as a warning", dated.length === 1 && dated[0].severity === "warning", problems.map((p) => p.rule));
  rec("THE CONTROL: …no error, so an error cannot be what brings the button", !problems.some((p) => p.severity === "error"), problems.filter((p) => p.severity === "error").map((p) => p.rule));
  rec("THE CONTROL: …and it is the only problem whose message names Auto-fix", problems.filter((p) => /\bAuto-fix\b/.test(String(p.message))).map((p) => p.rule).join() === "dated_naval_building_without_coast",
    problems.map((p) => p.rule));
  const html = popupFor(response(problems));
  rec("⭐⭐⭐ that response offers no 🔧 Auto-fix all", !offersFix(html));
  rec("⭐⭐ …and does not tell the modder to auto-fix the warning", !/Auto-fix the (warning|\d+ warnings) whose message names it/.test(html));
  rec("…while still listing the warning itself", /added on a later date/.test(html));

  console.log("\n4. THE PREMISE: Auto-fix really does leave it alone");
  {
    const before = tree(mod);
    const r = md.autoFixMap(opts);
    rec("the click ran — it was not 'nothing to fix'", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("⭐⭐ …wrote nothing into the mod", JSON.stringify(before) === JSON.stringify(tree(mod)), { before: Object.keys(before), after: Object.keys(tree(mod)) });
    rec("⭐⭐ …and the dated dockyard is still reported after it", validate().some((p) => p.rule === "dated_naval_building_without_coast"));
  }

  console.log("\n5. ⛔ The real validate response for a map whose only Auto-fix-naming problem is a building over water Auto-fix has no position for");
  // #a-warning-auto-fix-leaves-alone-offers-no-auto-fix — batch 8 discovery F2. building_not_over_land was pushed with no autoFix
  // at all, so a row over water that fixStandardSlotsOverWater leaves alone (it puts back only a STANDARD position: a dockyard or
  // a port has none) brought "🔧 Auto-fix all", and the click wrote nothing. Section 3's game; this mod ships its own
  // buildings.txt, every state's air base and rocket site on its land, and ports for the two coastal states.
  {
    const Z = (y) => (H - 1 - y).toFixed(2);                                     // the z a row needs to stand on top-down pixel row y
    const ROWS = ["1;air_base;192.00;9.50;47.00;0.00;0", "1;rocket_site_spawn;192.00;9.50;47.00;0.00;0",
      `2;air_base;32.00;9.50;${Z(128)};0.00;0`, `2;rocket_site_spawn;32.00;9.50;${Z(128)};0.00;0`,
      `3;air_base;192.00;9.50;${Z(100)};0.00;0`, `3;rocket_site_spawn;192.00;9.50;${Z(100)};0.00;0`,
      "2;naval_base_spawn;64.00;9.50;191.00;0.00;1", "3;naval_base_spawn;192.00;9.50;191.00;0.00;1"];
    const DOCKYARD = `1;dockyard;64.00;9.50;${Z(10)};0.00;0`;                   // over sea 1, and no standard position
    const BUNKER = `1;bunker;70.00;9.50;${Z(10)};0.00;0`;                       // over sea 1, a standard position
    // ⚠️ MOVED WITH THE FIX — #a-generated-world-nobody-rules. This section's whole argument is "no ERROR, so
    // an error cannot be what brings the button", and its mod used to ship state 1 with no history at all —
    // over a game layer whose states 2 and 3 have none either. That is a world in which NOT ONE state declares
    // an owner, which is now an error of its own (the shape that made the owner's launch unplayable), so the
    // control was measuring a second error rather than the one it names. One owner anywhere is enough, and a
    // state somebody owns is what a real map looks like. Section 3's mod already had `owner = ENG`.
    const OWNER = "\thistory={\n\t\towner = ENG\n\t}\n";
    const overWaterMod = (tag, extra) => dir(tag, { "descriptor.mod": `name="${tag}"\n`, "history/states/1-Inland.txt": st(1, "4", OWNER), "map/buildings.txt": ROWS.concat(extra).join("\n") });
    const validateMod = (m) => {
      const o = { modRoot: m, gameRoot: GAME, dependencyRoots: [] };
      const model = md.buildMapModel({ ...o, cacheStableLayers: true });
      return [...md.findStateFileConflicts(m), ...md.validateMapModel(model), ...md.findBuildingAnchorMismatches({ ...o, model }), ...md.validateMapBitmap(o)];
    };
    const wetOf = (probs) => probs.filter((p) => p.rule === "building_not_over_land");

    const only = overWaterMod("dockyardonly", [DOCKYARD]);
    const p1 = validateMod(only);
    const w1 = wetOf(p1);
    rec("THE CONTROL: the dockyard is reported as standing on water, and nothing else is", w1.length === 1 && (w1[0].items || []).length === 1 && w1[0].items[0].type === "dockyard", p1.map((p) => p.rule));
    rec("THE CONTROL: …no error, so an error cannot be what brings the button", !p1.some((p) => p.severity === "error"), p1.filter((p) => p.severity === "error").map((p) => p.rule));
    rec("THE CONTROL: …and it is the only problem whose message names Auto-fix", p1.filter((p) => /\bAuto-fix\b/.test(String(p.message))).map((p) => p.rule).join() === "building_not_over_land", p1.map((p) => p.rule));
    rec("⭐⭐⭐ the warning says Auto-fix will not put it back: autoFix is false", !!w1[0] && w1[0].autoFix === false, w1[0] && w1[0].autoFix);
    rec("⭐⭐ …and names the row as the modder's to move, in its items and its message", !!w1[0] && w1[0].items[0].autoFix === false && /Auto-fix leaves/.test(w1[0].message) && /dockyard of state 1/.test(String(w1[0].message).split("Auto-fix leaves")[1] || ""),
      w1[0] && { items: w1[0].items, message: w1[0].message });
    const html1 = popupFor(response(p1));
    rec("⭐⭐⭐ that response offers no 🔧 Auto-fix all", !offersFix(html1));
    rec("…while still listing the warning itself", /not over the land/.test(html1));
    {
      const before = tree(only);
      const r = md.autoFixMap({ modRoot: only, gameRoot: GAME, dependencyRoots: [] });
      rec("THE PREMISE: an Auto-fix click ran — it was not 'nothing to fix'", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
      rec("⭐⭐ …wrote nothing into the mod", JSON.stringify(before) === JSON.stringify(tree(only)), Object.keys(tree(only)).filter((k) => tree(only)[k] !== before[k]));
      rec("⭐⭐ …and the dockyard is still reported after it", wetOf(validateMod(only)).some((p) => (p.items || []).some((i) => i.type === "dockyard")));
    }

    const both = overWaterMod("dockyardbunker", [DOCKYARD, BUNKER]);
    const p2 = validateMod(both);
    const w2 = wetOf(p2);
    rec("THE CONTROL: with a bunker over the same water, both rows are reported in one warning", w2.length === 1 && (w2[0].items || []).length === 2, w2.map((p) => p.items));
    rec("⭐⭐⭐ …and that warning says Auto-fix will put one back: autoFix is true, the bunker's item true, the dockyard's false",
      !!w2[0] && w2[0].autoFix === true && w2[0].items.some((i) => i.type === "bunker" && i.autoFix === true) && w2[0].items.some((i) => i.type === "dockyard" && i.autoFix === false), w2[0] && { autoFix: w2[0].autoFix, items: w2[0].items });
    rec("⭐⭐ the popup offers 🔧 Auto-fix all for it", offersFix(popupFor(response(p2))));
    const r2 = md.autoFixMap({ modRoot: both, gameRoot: GAME, dependencyRoots: [] });
    const after = validateMod(both);
    const w3 = wetOf(after);
    rec("⭐⭐ the click took the bunker off the water", !!r2 && r2.ok === true && !(w3[0] && w3[0].items.some((i) => i.type === "bunker")), w3.map((p) => p.items));
    rec("⭐⭐⭐ …and what is left — the dockyard — says Auto-fix leaves it, and offers no button", w3.length === 1 && w3[0].autoFix === false && !offersFix(popupFor(response(after))), w3.map((p) => ({ autoFix: p.autoFix, items: p.items })));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== the map errors popup offers no auto-fix for a warning it leaves alone: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
