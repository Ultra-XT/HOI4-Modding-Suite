// Auto-fix told a modder it found nothing, after finding 216 states and refusing them on purpose.
// #auto-fix-says-it-found-nothing-after-refusing-216-states
//
// THE DEFECT. fixSeaProvinceLeftovers strips sea provinces a state still lists, and REFUSES when they are all
// of that state's provinces — emptying it would turn one non-fatal `non_land_province_in_state` into a
// curated-FATAL `empty_state_with_content` (#a-cleanup-must-not-empty-a-state). It has returned `wouldEmpty`
// ever since that guard was written, and its own closing comment says why:
//
//     "say which states were left alone rather than emptied, so the caller can tell 'nothing to do' from
//      'there was something to do and doing it would have broken the map'"
//
// Nothing ever read it. Grepping the repo, `wouldEmpty` appears in map-data.js and in that fixer's own test,
// and in no client at all. The dominant bug shape here: the answer already existed next door and one caller
// never adopted it.
//
// ⚠️ MEASURED ON THE WORLD THE OWNER'S FLOW BUILDS (own the map → Delete map → Generate land 35% → Auto-fix
// ×2 — 18 problems, 1 error, 0 fatal). A third Auto-fix click on a copy of it:
//
//     autoFixMap                18.1 s, every one of its 27 fixers returning zero, not a byte written
//     seaLeftovers.wouldEmpty   216 states found and refused, 192 of them files the mod itself owns
//     what the modder read      "Nothing auto-fixable was found."           ← the whole status line
//
// So the one screen that could have said "here is what is left and what to do about it" said instead that
// there was nothing to look at. Two things are wrong with that sentence and both are fixed here:
//
//   1. it names no decline, though the fixers reported one;
//   2. "was found" is a claim about the SEARCH, and the search found plenty. What the click knows for certain
//      is what it DID — nothing — so that is what it now says, unless the server's own `nothingToFix` flag
//      (set only when the mod has no map problems of its own) says the screen really was empty.
//
// How it is checked: the fixture is the smallest shape that produces the refusal — a mod owning two states,
// one of whose provinces have ALL become sea and one of whose have not. autoFixMap runs on it for real, and
// the page's OWN summary code is lifted out of public/map.js and run on the response it returns, so a wording
// change that stops naming the refusal fails here. Section 3 is the negative control: a mod with nothing
// wrong keeps "Nothing auto-fixable was found.", so the new branch is not simply always on.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afref-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const P = require("./testlib-map-page.js");   // for withNoteHelpers: the summary's note helpers, derived not named

const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; }
  }
  return buf;
}
const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
const provAt = (x, y) => (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[Math.floor(x / 2)];
const defCsv = (types) => ["0;0;0;0;land;false;unknown;0"].concat(
  [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i};${i * 20};0;0;${types[i]};false;${types[i] === "sea" ? "ocean" : "plains"};${types[i] === "sea" ? 0 : 1}`)
).join("\r\n") + "\r\n";
const stateFile = (id, provinces) =>
  `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n` +
  `\thistory={\n\t\towner = ENG\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n\t}\n` +
  `\tprovinces={\n\t\t${provinces.join(" ")}\n\t}\n}\n`;

// The state ids are the fixture's own input, not a number typed from a result: DROWNED owns only provinces
// that have become sea (so the cleanup would empty it), KEPT owns one that has not. They are 1 and 2 because
// the whole autoFixMap pipeline runs here, and closeStateIdGaps slides ids down to 1..max — with 70 and 71 the
// state the summary then names is not the one the fixture wrote, which would make the assertion read its own
// renumbering rather than the refusal.
const DROWNED = 1, KEPT = 2;
const ALL_LAND = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "land" };
const FIVE_SIX_SEVEN_SEA = Object.assign({}, ALL_LAND, { 5: "sea", 6: "sea", 7: "sea" });

function makeMod(types) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afref-mod-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), 'name="AFRef"\nreplace_path="map"\nreplace_path="history/states"\n');
  mk(path.join(d, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(d, "map", "definition.csv"), defCsv(types));
  mk(path.join(d, "history", "states", `${DROWNED}-AllGone.txt`), stateFile(DROWNED, [5, 6]));
  mk(path.join(d, "history", "states", `${KEPT}-Partly.txt`), stateFile(KEPT, [3, 4, 7, 8]));
  return d;
}

// ── The page's own summary, lifted out of public/map.js and run on a real auto-fix response. ──────────
// The three note helpers the summary calls, then the click handler's body from `const ro =` down to the
// `summaryLine` it builds. Lifting rather than re-describing is the point: a wording change that drops the
// refusal is a change to the very lines this runs.
const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP_SRC);
function liftSummary() {
  const grabFn = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP_SRC.slice(s, e + 4); };
  const s = MASKED.indexOf("const ro = (fr.fixes");
  const at = MASKED.indexOf("const summaryLine = (parts.length", s);
  const e = at < 0 ? -1 : MASKED.indexOf(";", at);
  // ⚠️ The helpers are DERIVED, not named. This used to list three by hand and broke the day a fourth
  // (duplicateStatesLeftNote) was added to public/map.js — "is not defined", thrown from inside the click's
  // own catch, which reports it as "Auto-fix failed: …" and blames the page rather than the missing lift.
  // testlib-map-page.js already solved this for runPage's callers; this is the same derivation.
  return { body: s >= 0 && e >= 0 ? MAP_SRC.slice(s, e + 1) : "", helpers: [] };
}
const LIFT = liftSummary();
function summaryFor(fr) {
  const sandbox = { console, JSON, Set, Math, Array, Number, String, Object, fr };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(P.withNoteHelpers(`var statusEl = null;\n${LIFT.body}`) + "\nglobalThis.__line = summaryLine;", sandbox);
  return String(sandbox.__line);
}

(async () => {
  try {
    console.log("=== 0. THE CONTROL: the page's summary code was found and runs ===");
    rec("the summary body was lifted out of public/map.js", LIFT.body.length > 2000, LIFT.body.length);
    rec("…and its three note helpers with it", LIFT.helpers.every((h) => h.length > 100), LIFT.helpers.map((h) => h.length));
    rec("…and it builds a line from an empty response", summaryFor({ ok: true, fixes: {} }).length > 0, summaryFor({ ok: true, fixes: {} }));

    console.log("\n=== 1. a click that finds work and refuses it ===");
    const mod = makeMod(FIVE_SIX_SEVEN_SEA);
    const before = fs.readFileSync(path.join(mod, "history", "states", `${DROWNED}-AllGone.txt`), "utf8");
    const fr = md.autoFixMap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("autoFixMap ran", !!(fr && fr.ok), fr && fr.error);
    const slv = (fr.fixes && fr.fixes.seaLeftovers) || {};
    rec(`⭐⭐⭐ the fixer reports state ${DROWNED} as one it refused to empty`, (slv.wouldEmpty || []).includes(DROWNED), slv.wouldEmpty);
    rec("…and wrote nothing to it", fs.readFileSync(path.join(mod, "history", "states", `${DROWNED}-AllGone.txt`), "utf8") === before);
    rec(`THE CONTROL: it did clean ${KEPT}, which keeps a province`, (slv.provincesRemoved || 0) >= 1, slv);

    console.log("\n=== 2. and the line the modder reads says so ===");
    const line = summaryFor(fr);
    console.log("  LINE: " + line);
    rec("⭐⭐⭐ it does NOT say nothing was found", !/Nothing auto-fixable was found/.test(line), line);
    rec("⭐⭐ it names how many states were left alone", new RegExp(`\\b${(slv.wouldEmpty || []).length} state`).test(line), line);
    rec(`⭐⭐ …and names ${DROWNED} among them, so the modder can go to it`, new RegExp(`\\b${DROWNED}\\b`).test(line), line);
    rec("⭐⭐ …says why, in terms of what HOI4 does — a state with no provinces at all", /no\s+provinces at all/.test(line) && /refuses to load/.test(line), line);
    rec("…and what to do instead", /land again|delete the state/.test(line), line);
    // …of the NEW clause only. The rest of the line quotes hoi4.exe's own coastal-no-port text, which really
    // does say "will likely crash the game" — a scan of the whole sentence would fail on somebody else's
    // correctly-attributed quote rather than on anything this change wrote.
    const clause = (/\(⛔ [^)]*left alone[^)]*\)/.exec(line) || [""])[0];
    rec("THE CONTROL: the new clause was isolated from the line", clause.length > 80, clause);
    rec("⛔ …and it claims no crash it cannot show", clause.length > 0 && !/crash/i.test(clause), clause);

    console.log("\n=== 3. THE NEGATIVE CONTROL: a mod with nothing wrong still says nothing was found ===");
    {
      // The server's real shape for that case, taken from map-data.js's own source rather than typed here, so a
      // rename of the flag or the note is a failure and not a silent pass. What PRODUCES it — an add-on with no
      // map content of its own — is measured in test-auto-fix-writes-nothing-when-nothing-is-wrong.js; this
      // section is about the sentence the page then writes.
      const mdSrc = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      const at = mdSrc.indexOf("nothingToFix: true");
      rec("THE CONTROL: map-data.js still answers nothingToFix for a mod with no map problems of its own", at > 0, at);
      const noteM = /note:\s*"((?:[^"\\]|\\.)*)"\s*\n?\s*\+?\s*"?((?:[^"\\]|\\.)*)?/.exec(mdSrc.slice(at, at + 600));
      const note = noteM ? (noteM[1] + (noteM[2] || "")) : "";
      rec("…and its note was read out of the source", note.length > 40, note);
      const fr2 = { ok: true, fixes: {}, nothingToFix: true, note };
      const l2 = summaryFor(fr2);
      console.log("  LINE: " + l2);
      rec("⭐⭐ the old sentence is kept for the case it was true of", /Nothing auto-fixable was found/.test(l2), l2);
      rec("…with the server's reason beside it", fr2 && fr2.note ? l2.indexOf(fr2.note) > 0 : true, l2);
      rec("…and it names no refusal, so the new clause is not always on", !/left alone/.test(l2), l2);
    }

    console.log("\n=== 4. the two heads, on the shape each is for ===");
    {
      const l3 = summaryFor({ ok: true, fixes: { categories: { count: 2 }, seaLeftovers: { wouldEmpty: [DROWNED] } } });
      console.log("  FIXED SOMETHING: " + l3);
      rec("⭐ the head is still what it fixed", /^🔧 Auto-fixed:/.test(l3), l3);
      rec("⭐⭐ …and the refusal rides along with it, not only when nothing was fixed", /left alone/.test(l3), l3);

      // ⭐⭐⭐ THE MEASURED CASE ITSELF: the owner's finished world, where every fixer returns zero and
      // seaLeftovers hands back the states it refused. This is the response that produced, at the commit before
      // this one, the four words "Nothing auto-fixable was found." and nothing else.
      const l4 = summaryFor({ ok: true, fixes: { seaLeftovers: { statesEdited: 0, provincesRemoved: 0, wouldEmpty: [DROWNED, KEPT] } } });
      console.log("  FIXED NOTHING:  " + l4);
      rec("⭐⭐⭐ a click that changed nothing says that, and does not claim the search came up empty",
        !/Nothing auto-fixable was found/.test(l4) && /changed nothing/.test(l4), l4);
      rec("⭐⭐ …and still hands over the refusal", /2 states/.test(l4) && /left alone/.test(l4), l4);
      rec("…and points at the rows that explain the rest", /below/.test(l4), l4);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== auto-fix says what it refused: ${checks} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exitCode = fails.length ? 1 : 0;
})();
