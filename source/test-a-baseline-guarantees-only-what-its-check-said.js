// ⛔ #a-baseline-guarantees-only-what-its-check-said / #a-restore-says-what-it-leaves — WHAT 🛟 Restore baseline PROMISES, AND WHAT IT
// SAYS IT PUTS BACK, ARE WHAT THE BASELINE ITSELF SAYS.
//
// B6-5 (tool campaign, CONFIRMED): the Restore confirm ended "It cannot be undone. It does guarantee the game loads." and the button's
// title said "— guarantees the game loads." for every baseline that held the armies and the descriptor's lines — whatever map it held.
// 💾 Save baseline is offered inside the hard gate itself, so a fresh add-on whose France had no provinces was saved as the baseline, the
// modder discarded their edits on the strength of the promise, and the restored map had the same two problems Save stops for
// (empty_capital_state, land_not_in_state). The promise may now be made only for a baseline whose stored verdict — getMapBaselineInfo's
// heldVerdict {fatal, rules}, written when it was saved (map-data.js) — found nothing Save stops for. A baseline with no verdict (every one
// saved before Nova checked them) is promised nothing, and one saved with such a problem names it.
//
// Review MF-2 of b6-g3: …and "known-good" is the promise's word too. With the promise withdrawn, the confirm, the 🛟 title and the line after
// a restore still called every baseline "your known-good baseline", so the same unchecked baseline was "a map baseline" on the line that saved
// it and "known-good" on the button that restores it. The word now goes where the promise goes (sections 4 and 5).
//
// B6-26 (CONFIRMED; the coordinator decided WORDS): the confirm said "This DISCARDS every map edit (… countries …)", and a ✨ New country
// made since kept 20 of its 22 files — its tag stayed declared, and a second New country of that tag was refused. The baseline is the
// mod's map/ and history/ folders (MAP_BASELINE_DIRS) and a few files, so the confirm now lists what it puts back and names what stays.
//
// Pure: the page's own functions, lifted out of public/map.js and run (testlib-map-page). The folders are read out of map-data.js.
"use strict";
const fs = require("fs");
const path = require("path");
const T = require("./testlib-map-page.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1400) : JSON.stringify(detail).slice(0, 1400)); }
}
const PROMISE = /It does guarantee the game loads\.|— guarantees the game loads\./;

let sb = null;
try { sb = T.runPage(["function baselineRestoreConfirmText(", "function baselineRestoreTitle("]).sb; } catch (e) { rec("the confirm and the title are lifted out of public/map.js", false, e.message); }
const confirm = (info) => (sb ? String(sb.baselineRestoreConfirmText(info)) : "");
const title = (info) => (sb ? String(sb.baselineRestoreTitle(info)) : "");
const labels = require("./public/map-rule-labels.js");

// every baseline saved today holds the armies, the descriptor's lines and the files (getMapBaselineInfo's held* fields)
const modern = { exists: true, savedAt: "2026-11-13T10:00:00Z", sizeMB: 3, heldUnits: true, heldDescriptors: true, heldFiles: true };
const withVerdict = (v) => Object.assign({}, modern, { heldVerdict: v });
const clean = withVerdict({ fatal: 0, rules: [] });
const fatal = withVerdict({ fatal: 2, rules: ["empty_capital_state", "land_not_in_state"] });
const older = { exists: true, savedAt: "2026-11-13T10:00:00Z", sizeMB: 3, heldUnits: false, heldDescriptors: false };

if (sb) {
  // ── 1. B6-5: the promise follows the stored verdict
  rec("the fixture's two rules are ones Save stops for (isFatalRule)", fatal.heldVerdict.rules.every((r) => labels.isFatalRule(r)));
  rec("⭐ a baseline checked when it was saved and found clean: the confirm promises the game loads", /It does guarantee the game loads\./.test(confirm(clean)), confirm(clean));
  rec("⭐ …and so does the button's title", / — guarantees the game loads\./.test(title(clean)), title(clean));
  rec("⭐⭐⭐ a baseline with NO verdict (every baseline saved before Nova checked them): the confirm promises nothing",
    !PROMISE.test(confirm(modern)) && /no promise that the game loads/.test(confirm(modern)) && /Map Errors opens afterwards/.test(confirm(modern)), confirm(modern));
  rec("⭐⭐⭐ …and nor does the title, which says to check Map Errors", !PROMISE.test(title(modern)) && /check Map Errors afterwards/.test(title(modern)), title(modern));
  const fc = confirm(fatal), ft = title(fatal);
  rec("⭐⭐⭐ a baseline whose map had problems Save stops for when it was saved: no promise, and it says how many",
    !PROMISE.test(fc) && /had 2 problems Save stops for when it was saved/.test(fc) && /no promise that the game loads/.test(fc), fc);
  rec("⭐⭐ …naming them in the words Map Errors uses (mapRuleLabel)", fatal.heldVerdict.rules.every((r) => fc.includes(labels.mapRuleLabel(r))), fc);
  rec("⭐⭐ …and the title says so too", !PROMISE.test(ft) && /2 problems Save stops for/.test(ft) && /check Map Errors afterwards/.test(ft), ft);
  const one = confirm(withVerdict({ fatal: 1, rules: ["empty_capital_state"] }));
  rec("…one problem is said in the singular", /had 1 problem Save stops for/.test(one) && /puts that problem back/.test(one), one);
  // the verdict alone is not enough: a baseline that does not hold the armies or the lines still leaves them as they are (R2)
  const cleanOld = Object.assign({}, older, { heldVerdict: { fatal: 0, rules: [] } });
  rec("⭐⭐ a clean verdict on a baseline that does not hold the armies and the lines promises nothing (R2 still holds)", !PROMISE.test(confirm(cleanOld)) && !PROMISE.test(title(cleanOld)), [confirm(cleanOld), title(cleanOld)]);
  // a verdict the page cannot read is none
  for (const [k, v] of Object.entries({ string: "ok", nullFatal: { fatal: null, rules: [] }, textFatal: { fatal: "0", rules: [] }, nan: { fatal: NaN, rules: [] }, array: [0] })) {
    rec(`⭐ a verdict the page cannot read (${k}) is no verdict: no promise`, !PROMISE.test(confirm(withVerdict(v))) && !PROMISE.test(title(withVerdict(v))), [confirm(withVerdict(v)), title(withVerdict(v))]);
  }
  rec("a baseline that does not exist promises nothing", !PROMISE.test(confirm({ exists: false })) && !PROMISE.test(confirm(null)), confirm(null));

  // ── 2. the promise lives in those two functions only
  const SRC = T.MASKED;
  const from = SRC.indexOf("function baselineRestoreConfirmText("), to = SRC.indexOf("function baselineNotJudgedNote(");
  const at = [...SRC.matchAll(/guarantees? the game loads/g)].map((m) => m.index);
  const isTitle = (i) => { const t = SRC.indexOf("function baselineRestoreTitle("); return t > 0 && i > t && i < SRC.indexOf("\n  }", t); };
  rec("⭐ no line of the page outside the confirm and the title promises the game loads",
    from > 0 && to > from && at.length > 0 && at.every((i) => (i > from && i < to) || isTitle(i)), at.filter((i) => !((i > from && i < to) || isTitle(i))).map((i) => SRC.slice(Math.max(0, i - 80), i + 30)));
  const gate = (() => { const i = SRC.indexOf("Your edits were saved, but they leave"); return i < 0 ? "" : SRC.slice(i, SRC.indexOf("</div>", i)); })();
  rec("⭐ the hard gate no longer calls the baseline \"your last working map\": it says Restore says first whether Nova checked it",
    !!gate && !/last working map/.test(gate) && /says first whether Nova checked that it loads/.test(gate), gate.slice(0, 600));

  // ── 3. B6-26: what Restore puts back, and what it leaves
  const md = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const dl = /const MAP_BASELINE_DIRS = \[([^\]]*)\]/.exec(md);
  const dirs = dl ? [...dl[1].matchAll(/"([^"]+)"|path\.join\(([^)]*)\)/g)].map((m) => m[1] || [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join("/")) : [];
  rec("MAP_BASELINE_DIRS is read out of map-data.js", dirs.length >= 4 && dirs.includes("map"), dirs);
  for (const info of [modern, clean, fatal]) {
    const c = confirm(info);
    rec(`⭐⭐ the confirm names every folder the baseline holds (${dirs.join(", ")})`, dirs.every((d) => c.includes(d === "map" ? "map/ folder" : d)), c);
  }
  for (const [k, info] of Object.entries({ modern, clean, fatal, older, none: { exists: false } })) {
    const c = confirm(info);
    rec(`⭐⭐⭐ (${k}) the confirm no longer says it discards the countries made since`, !/DISCARDS every map edit[^.]*countries/.test(c), c);
    rec(`⭐⭐⭐ (${k}) …it says a country made since keeps its tag, colour, flag, name list and name, and where they are`,
      /a country made since keeps its tag, colour, flag, name list and name \(common\/, gfx\/flags and localisation\)/.test(c), c);
    rec(`⭐ (${k}) …and that it still discards the map edits, and cannot be undone`, /This DISCARDS every map edit made to them since the baseline was saved/.test(c) && /It cannot be undone\./.test(c), c);
  }
  // the folders it says stay are not among the ones the baseline holds (else the words would be false the other way)
  rec("⭐ none of common/, gfx/flags or localisation/ is a baseline folder", !dirs.some((d) => /^(common|gfx|localisation)(\/|$)/.test(d)), dirs);
  rec("⭐ the title says the countries made since are left", /leaves the countries made since/.test(title(modern)) && /leaves the countries made since/.test(title(older)), [title(modern), title(older)]);

  // ── 4. review MF-2 of b6-g3: "known-good" is the promise's own word, so it goes where the promise goes. The confirm, the title and the line
  // after a restore called every baseline "your known-good baseline" — the ones promised nothing too: every baseline saved before Nova checked
  // them, one it could not check (notChecked, which stores no verdict), and one whose map had a problem Save stops for.
  const unreadable = { string: "ok", nullFatal: { fatal: null, rules: [] }, textFatal: { fatal: "0", rules: [] }, nan: { fatal: NaN, rules: [] }, array: [0] };
  const every = Object.assign({ modern, clean, fatal, older, cleanOld, oneFatal: withVerdict({ fatal: 1, rules: ["empty_capital_state"] }), none: { exists: false }, nul: null },
    Object.fromEntries(Object.entries(unreadable).map(([k, v]) => ["unreadable " + k, withVerdict(v)])));
  for (const [k, info] of Object.entries(every)) {
    const c = confirm(info), t = title(info);
    rec(`⭐⭐⭐ (${k}) the confirm calls the baseline known-good exactly when it promises the game loads`, /known-good/.test(c) === /It does guarantee the game loads\./.test(c), c.slice(0, 240));
    rec(`⭐⭐⭐ (${k}) …and so does the title`, /known-good/.test(t) === / — guarantees the game loads\./.test(t), t);
  }
  rec("⭐⭐ a baseline with no verdict is \"your baseline\" in both", /^Restore the map to your baseline\? It puts back, /.test(confirm(modern)) && /^Restore the map to your baseline saved /.test(title(modern)), [confirm(modern).slice(0, 80), title(modern)]);
  rec("⭐ …and a clean one \"your known-good baseline\"", /^Restore the map to your known-good baseline\? It puts back, /.test(confirm(clean)) && /^Restore the map to your known-good baseline saved /.test(title(clean)), [confirm(clean).slice(0, 80), title(clean)]);
  // the button's own title, until baseline-info answers: shown when 💾 Save baseline reveals the button in a popup that opened with none
  const btn = (() => { const i = SRC.indexOf('id="mapErrRestoreBaseline"'); return i < 0 ? "" : SRC.slice(i, SRC.indexOf(">", i)); })();
  rec("⭐⭐ the 🛟 button's own title, before Nova has asked what the baseline is, calls it no known-good baseline", /title="Restore the map to your saved baseline\./.test(btn) && !/known-good/.test(btn), btn);
}

// ── 5. …and the line after a restore, driven through the page's own click (openMapErrorsModal) with the baseline-info its confirm was built from
async function lineAfterRestore(info) {
  const st = { loads: [], confirmed: null, msg: "" };
  const { sb: page, overlays } = T.runPage(["function openMapErrorsModal(", "function baselineRestoreConfirmText(", "function baselineRestoreTitle("], {
    modPath: () => "C:/any", hasPendingMapEdits: () => false, pendingWrites: [],
    load: async (line) => { st.loads.push(String(line)); },
    fetch: async (url) => {
      const u = String(url).split("?")[0];
      if (u === "/api/map/validate") return { json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
      if (u === "/api/map/baseline-info") return { json: async () => info };
      if (u === "/api/map/restore-baseline") return { json: async () => ({ ok: true, restored: ["map", "history/states"], movedAside: [], notJudged: [] }) };
      return { json: async () => ({ ok: false, error: "not stubbed: " + u }) };
    },
    window: { NovaMapRuleLabels: labels, novaConfirm: (msg, yes) => { st.msg = String(msg); st.confirmed = yes(); } },
  });
  page.openMapErrorsModal({ ok: true, errors: 0, warnings: 0, problems: [] });
  const pop = overlays.filter((o) => /id="mapErrClose"/.test(o.innerHTML))[0];
  const b = pop.querySelector("#mapErrRestoreBaseline");
  await b.listeners.click[0]({ target: b });
  await st.confirmed;
  return { line: st.loads[0] || "", msg: st.msg };
}
(async () => {
  if (sb) {
    try {
      let promisedOnce = false;
      for (const [k, info] of Object.entries({ clean, modern, fatal, older, cleanOld: Object.assign({}, older, { heldVerdict: { fatal: 0, rules: [] } }) })) {
        const r = await lineAfterRestore(info);
        const promised = /It does guarantee the game loads\./.test(r.msg);
        if (promised) promisedOnce = true;
        rec(`⭐⭐⭐ (${k}) the line after the restore calls the baseline known-good exactly when the confirm the modder answered promised the game loads`,
          r.line.startsWith(promised ? "🛟 Restored the map to your known-good baseline." : "🛟 Restored the map to your baseline."), { line: r.line.slice(0, 200), promised });
      }
      rec("CONTROL: one of those confirms (the clean baseline's) did promise it", promisedOnce);
    } catch (e) { rec("the restore click runs", false, e && e.stack); }
  }
  console.log(`\n=== a baseline guarantees only what its check said: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
