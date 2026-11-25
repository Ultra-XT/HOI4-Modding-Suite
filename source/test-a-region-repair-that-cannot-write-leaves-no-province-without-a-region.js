// A strategic-region repair that cannot write one file must never leave a province in NO region.
// #a-region-repair-adds-before-it-removes
//
// repairRegionOverlaps ("Fix region overlaps" in Mod Health, and the last region pass of Auto-fix all) aligns a
// state that is split across strategic regions by moving its stray provinces into the region most of the state is
// in. It applied EVERY removal for the whole map first and only then every addition. moveProvinceToRegion, thirty
// lines above it, documents why that order is backwards (#a-refused-region-move-is-not-atomic): if the add cannot
// be written, the province has already been taken out of its old region and put into none — "a province in ZERO
// strategic regions, which is the same crash class as one in two". moveProvince orders its state edits the same
// way, add before remove, for the same reason.
//
// Measured on this fixture (state 1 = {10, 11, 20}; region 5 = {10, 11}; region 6 = {20, 21}; most of the state
// is in region 5) with region 5's file unwritable: region 6 was rewritten to { 21 }, the add then threw, and
// province 20 belonged to no region. province_no_region and province_not_in_region fired, state_split stopped
// firing, and the error text said "Nothing was changed". Nothing repairs that shape afterwards: this same function
// skips any province with no region. Zero of the 95,434 provinces on the six shipping maps are in no region.
//
// The same batch had a second way to empty a province's regions: a province two states list, whose states sit in
// different regions, was taken out of each state's region by the other state's alignment (section 5). Such a
// province has no single answer — it is in two states, which is the problem to fix first — so it is now left exactly
// where it is, and never added to a second region either (section 6). On the six shipping maps no province is in two
// states and no state is split, so this path never runs there.
//
// The write failure is injected through safe-write.js's own assertWritable hook — the place server.js registers
// its refusals — so it is a per-file refusal thrown from inside safeModWrite, the same shape as an antivirus or
// sync lock that outlasts the rename retry. A read-only attribute would only reproduce this on Windows.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const safeWrite = require("./safe-write.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const NOGAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-nogame-"));
tmps.push(NOGAME);

function writeWorld(root) {
  mk(path.join(root, "descriptor.mod"), 'name="RRO"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="history/states"\n');
  mk(path.join(root, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "10;10;10;10;land;false;plains;1",
    "11;11;11;11;land;false;plains;1",
    "20;20;20;20;land;false;plains;1",
    "21;21;21;21;land;false;plains;1",
  ].join("\r\n") + "\r\n");
  const rg = (id, name, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "${name}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
  mk(path.join(root, "map", "strategicregions", "5-A.txt"), rg(5, "A", "10 11"));
  mk(path.join(root, "map", "strategicregions", "6-B.txt"), rg(6, "B", "20 21"));
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
  mk(path.join(root, "history", "states", "1-S.txt"), st(1, "10 11 20"));
  mk(path.join(root, "history", "states", "2-S.txt"), st(2, "21"));
}

const regionsHolding = (root, pid) => {
  const dir = path.join(root, "map", "strategicregions");
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = parseInt((/\bid\s*=\s*(\d+)/.exec(t) || [])[1], 10);
    const body = (/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "";
    if ((body.match(/\d+/g) || []).map(Number).includes(pid)) out.push(id);
  }
  return out.sort((a, b) => a - b);
};
const report = (root, rule) => {
  md.clearMapLayerCache();
  return md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [], cacheStableLayers: true }))
    .filter((p) => p.rule === rule);
};
// Refuse ONE file, exactly where server.js would: inside safeModWrite, before anything reaches the disk.
const lock = (file) => safeWrite.configure({
  assertWritable: (p) => {
    if (path.resolve(p) === path.resolve(file)) {
      const e = new Error(`EPERM: operation not permitted, rename over '${file}'`);
      e.code = "EPERM";
      throw e;
    }
  },
});
const unlock = () => safeWrite.configure({ assertWritable: () => {} });
const repair = (mod) => {
  let r = null, threw = null;
  try { r = md.repairRegionOverlaps({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }); } catch (e) { threw = e; }
  return { r, threw };
};

try {
  console.log("1. The control: with every file writable, the split state is aligned");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-ok-")); tmps.push(mod);
    writeWorld(mod);
    rec("the fixture starts with state 1 split across regions 5 and 6", report(mod, "state_split_strategic_regions").length === 1,
      report(mod, "state_split_strategic_regions").map((p) => p.regions));
    const { r, threw } = repair(mod);
    rec("the repair aligns it", !threw && !!r && r.ok === true && r.statesAligned === 1, threw ? threw.message : r);
    rec("province 20 is in region 5, and only region 5", regionsHolding(mod, 20).join(",") === "5", regionsHolding(mod, 20));
    rec("…and the split is gone", report(mod, "state_split_strategic_regions").length === 0, report(mod, "state_split_strategic_regions").length);
  }

  console.log("\n2. ⛔⛔ The TARGET region cannot be written");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-target-")); tmps.push(mod);
    writeWorld(mod);
    const file6 = path.join(mod, "map", "strategicregions", "6-B.txt");
    const before6 = fs.readFileSync(file6, "utf8");
    lock(path.join(mod, "map", "strategicregions", "5-A.txt"));
    let res;
    try { res = repair(mod); } finally { unlock(); }
    const { r, threw } = res;
    rec("⭐⭐⭐ province 20 is still in a strategic region — not taken out of 6 and put into none",
      regionsHolding(mod, 20).length > 0, regionsHolding(mod, 20));
    rec("⭐⭐⭐ …so the validator finds no province without a region",
      report(mod, "province_no_region").length === 0 && report(mod, "province_not_in_region").length === 0,
      report(mod, "province_no_region").concat(report(mod, "province_not_in_region")).map((p) => p.rule + ":" + p.provinces));
    rec("⭐⭐ region 6's file is byte-identical — nothing is removed for a province whose add was refused",
      fs.readFileSync(file6, "utf8") === before6, fs.readFileSync(file6, "utf8"));
    rec("⭐⭐ the repair does not throw — it reports which region it could not write",
      !threw && !!r && (r.errors || []).some((e) => e && e.region === 5), threw ? "threw: " + threw.message : r);
    rec("⚠️ …and does not claim the state was aligned", !threw && !!r && r.statesAligned === 0, r && r.statesAligned);
    rec("…the split is still there to be reported, rather than turned into something worse",
      report(mod, "state_split_strategic_regions").length === 1, report(mod, "state_split_strategic_regions").length);
    const again = repair(mod);
    rec("⭐ once the file can be written, the same repair finishes the job",
      !again.threw && !!again.r && again.r.statesAligned === 1 && regionsHolding(mod, 20).join(",") === "5",
      { again: again.threw ? again.threw.message : again.r, regions: regionsHolding(mod, 20) });
  }

  console.log("\n3. ⚠️ A SOURCE region cannot be written");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-source-")); tmps.push(mod);
    writeWorld(mod);
    lock(path.join(mod, "map", "strategicregions", "6-B.txt"));
    let res;
    try { res = repair(mod); } finally { unlock(); }
    const { r, threw } = res;
    rec("⭐⭐ province 20 is in region 5 AND still in 6 — the lesser evil, never in none",
      regionsHolding(mod, 20).join(",") === "5,6", regionsHolding(mod, 20));
    rec("…the refusal is reported, not swallowed", !threw && !!r && (r.errors || []).some((e) => e && e.region === 6), threw ? "threw: " + threw.message : r);
    rec("⚠️ …and the state is not counted as aligned", !threw && !!r && r.statesAligned === 0, r && r.statesAligned);
    const again = repair(mod);
    rec("⭐ once the file can be written, the same repair finishes the job",
      !again.threw && !!again.r && regionsHolding(mod, 20).join(",") === "5",
      { again: again.threw ? again.threw.message : again.r, regions: regionsHolding(mod, 20) });
  }

  console.log("\n4. The Auto-fix all path — POST /api/map/auto-fix { modPath }");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-autofix-")); tmps.push(mod);
    writeWorld(mod);
    lock(path.join(mod, "map", "strategicregions", "5-A.txt"));
    let r = null, threw = null;
    try { r = md.autoFixMap({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }); } catch (e) { threw = e; } finally { unlock(); }
    rec("Auto-fix ran", !threw && !!r && r.ok === true, threw ? threw.message : r && r.error);
    rec("⭐⭐⭐ province 20 is still in a region after Auto-fix all", regionsHolding(mod, 20).length > 0, regionsHolding(mod, 20));
    const ro = (r && r.fixes && r.fixes.regionOverlaps) || {};
    rec("⭐ …and Auto-fix's result carries the refusal for the page to show", (ro.errors || []).length > 0 || !!ro.error, ro);
  }

  console.log("\n5. ⛔ A province two states list, already in both their regions, is never left in none");
  {
    // State 1 = {10 11 20} is mostly in region 5; state 2 = {21 20} is wholly in region 6; province 20 is listed
    // in BOTH regions. Each state's alignment wants 20 out of the other's region — applied together, that took it
    // out of both. Keeping it where either state wants it leaves the double listing for the modder instead.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-twostates-")); tmps.push(mod);
    writeWorld(mod);
    const rg = (id, name, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "${name}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
    const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
    mk(path.join(mod, "map", "strategicregions", "5-A.txt"), rg(5, "A", "10 11 20"));
    mk(path.join(mod, "history", "states", "2-S.txt"), st(2, "21 20"));
    rec("the fixture: province 20 is listed in regions 5 and 6", regionsHolding(mod, 20).join(",") === "5,6", regionsHolding(mod, 20));
    const { r, threw } = repair(mod);
    rec("the repair ran", !threw && !!r && r.ok === true, threw ? threw.message : r);
    rec("⭐⭐⭐ province 20 is still in a strategic region", regionsHolding(mod, 20).length > 0, regionsHolding(mod, 20));
    rec("⭐⭐ …so no province is reported without one", report(mod, "province_no_region").length === 0, report(mod, "province_no_region").map((p) => p.provinces));
  }

  console.log("\n6. ⚠️⚠️ A province two states list, in only ONE of their regions, is not added to the other");
  {
    // State 1 = {10 11 20} is mostly in region 5; state 2 = {21 20} is wholly in region 6, and 20 is listed in region
    // 6 only. Each state's alignment wants 20 in its own region: adding it to region 5 as well would put one province
    // in two regions, and moving it would split state 2 instead. It is in two states, which is the problem to fix
    // first, so it is left exactly where it is.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rro-contested-")); tmps.push(mod);
    writeWorld(mod);
    const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
    mk(path.join(mod, "history", "states", "2-S.txt"), st(2, "21 20"));
    const file5 = path.join(mod, "map", "strategicregions", "5-A.txt"), file6 = path.join(mod, "map", "strategicregions", "6-B.txt");
    const before5 = fs.readFileSync(file5, "utf8"), before6 = fs.readFileSync(file6, "utf8");
    rec("the fixture: province 20 is listed in region 6 only, and two states list it",
      regionsHolding(mod, 20).join(",") === "6" && report(mod, "province_in_two_states").length === 1,
      { regions: regionsHolding(mod, 20), inTwoStates: report(mod, "province_in_two_states").length });
    const { r, threw } = repair(mod);
    rec("the repair ran", !threw && !!r && r.ok === true, threw ? threw.message : r);
    rec("⭐⭐⭐ province 20 is NOT added to region 5 — no province is put into two regions", regionsHolding(mod, 20).join(",") === "6", regionsHolding(mod, 20));
    rec("⭐⭐ …nor moved: both region files are byte-identical",
      fs.readFileSync(file5, "utf8") === before5 && fs.readFileSync(file6, "utf8") === before6, regionsHolding(mod, 20));
    rec("⚠️ …and state 1, which it still splits, is not reported as aligned", !threw && !!r && r.statesAligned === 0, r && r.statesAligned);
    rec("…while no province is left without a region", report(mod, "province_no_region").length === 0, report(mod, "province_no_region").map((p) => p.provinces));
  }

  console.log("\n7. ⭐ The Auto-fix summaries say what the repair could not write — map.js regionRepairNote, run");
  {
    const vm = require("vm");
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
    const MASKED = maskJsComments(MAP);
    const s = MASKED.indexOf("\n  function regionRepairNote(");
    const e = s < 0 ? -1 : MASKED.indexOf("\n  }", s + 1);
    const fnSrc = s < 0 || e < 0 ? "" : MAP.slice(s + 1, e + 4);
    rec("regionRepairNote was lifted", fnSrc.length > 100, fnSrc.length);
    const sb = {};
    vm.createContext(sb);
    if (fnSrc) vm.runInContext(fnSrc, sb);
    const f = sb.regionRepairNote;
    if (typeof f === "function") {
      const refused = f({ ok: true, statesAligned: 0, errors: [{ region: 5, error: "EPERM: operation not permitted" }] });
      rec("⭐⭐ a refused region file is said, with its reason", /could not be written/.test(refused.tail) && /EPERM/.test(refused.tail), refused);
      rec("…and is not listed as a fix", refused.parts.length === 0, refused.parts);
      const failed = f({ error: "boom" });
      rec("…nor is a repair that failed outright, which is said too", /boom/.test(failed.tail) && failed.parts.length === 0, failed);
      const done = f({ ok: true, statesAligned: 2, orphansPlaced: 1, errors: [] });
      rec("⭐ what it did is listed: the states it aligned AND the provinces it placed",
        done.parts.length === 2 && /aligned 2/.test(done.parts[0]) && /\b1 province\b/.test(done.parts[1]) && done.tail === "", done);
      const nothing = f(undefined);
      rec("…and a missing result is handled, not thrown on", nothing.parts.length === 0 && nothing.tail === "", nothing);
    }
    // Call sites only — `= regionRepairNote(ro)` — not the declaration, which has the same parenthesised shape.
    const uses = (MASKED.match(/=\s*regionRepairNote\(ro\)/g) || []).length;
    rec("⭐ both Auto-fix summaries (the Map Errors modal and 🔧 Fix all) read it", uses === 2, uses);
  }

  console.log("\n8. ⭐ …and so does Mod Health's “Fix region overlaps” note — its template, run");
  {
    const CC = fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8");
    const at = CC.indexOf('$("mhFixRegions")');
    const open = 'insertAdjacentHTML("beforeend",';
    const s = at < 0 ? -1 : CC.indexOf(open, at);
    // ⚠️ THE END IS COUNTED, NOT GUESSED. This was `CC.indexOf("</div>`);", s)` — the note's own closing tag followed
    // immediately by the call's `);`. #a-recovery-copy-nobody-is-told-about appended the shared "where the copies went"
    // sentence after that tag, so the fixed tail matched nothing and this section reported the note as missing. Walk the
    // call's parentheses to its own close instead, which holds whatever the argument list is built from.
    let e = -1;
    if (s >= 0) {
      let depth = 0;
      for (let i = s + open.indexOf("("); i < CC.length; i++) {
        const c = CC[i];
        if (c === "(") depth++;
        else if (c === ")") { depth--; if (depth === 0) { e = i; break; } }
      }
    }
    const expr = s < 0 || e < 0 ? "" : CC.slice(s + open.length, e);
    rec("the note the button writes was found", expr.length > 100, expr.length);
    let render = null;
    try { render = new Function("res", "esc", "snapshotHtml", "return (" + expr + ");"); } catch (err) { rec("…and it parses", false, err.message); }
    if (render) {
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      // The backup sentence is its own tested thing (test-a-mod-health-map-fix-says-where-the-copies-went.js); here it
      // is stood in for, so this section measures the repair note and nothing else.
      const snapshotHtml = () => "";
      const html = render({ ok: true, statesAligned: 0, provincesMoved: 0, errors: [{ region: 5, error: "EPERM <locked>" }] }, esc, snapshotHtml);
      rec("⭐⭐ a refused write is said, and its text escaped", /could not be written/.test(html) && /EPERM &lt;locked&gt;/.test(html), html.slice(0, 300));
      const clean = render({ ok: true, statesAligned: 1, provincesMoved: 1, orphansPlaced: 2, errors: [] }, esc, snapshotHtml);
      rec("…placed provinces are counted, and no refusal is claimed", /Put 2 province/.test(clean) && !/could not be written/.test(clean), clean.slice(0, 300));
    }
  }

  console.log(`\n=== a region repair that cannot write leaves no province without a region: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  unlock();
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
