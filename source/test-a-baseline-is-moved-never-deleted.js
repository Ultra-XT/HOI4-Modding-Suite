// ⛔ #a-baseline-is-moved-never-deleted — 💾 Save baseline keeps the baseline it replaces. NOTHING under map_baselines is removed.
//
// THE DEFECT (tool campaign B6-4, a blocker under CLAUDE.md's fourth rule). saveMapBaseline built the new copy beside the old one,
// swapped them with two renames, and then ran fs.rmSync on the previous baseline "because it is the copy the user asked to replace —
// not their only copy of anything". It was their only copy of the map they knew loaded. MEASURED with the page's own click
// (POST /api/map/save-baseline {modPath}): a baseline saved on a good map, France then emptied by hand (validate: two problems Save
// stops for), the same click again → 200, and map_baselines held ONE folder, the second save's, with France empty. Two more rmSync
// calls removed the leftovers of a save that did not finish — one of them, `.nova-previous`, is the ONLY copy of the previous
// baseline when the app died between the two renames — and the error path removed the staging copy and that leftover again.
//
// THE FIX. Every one of those is a rename into a dated folder BESIDE the baseline, in the same parent — nothing is copied and
// nothing is deleted: <baseline>.replaced-<time> for a baseline that was in place, <baseline>.unfinished-<time> for a staging copy.
// A leftover `.nova-previous` with no baseline in place IS the baseline, so it goes back to its own name. The answer says where
// the replaced baseline went (previousMovedTo), so the page can tell the modder.
//
// The back-out control: put any one of the rmSync calls back and this file fails (sections 1-4 by behaviour, 5 by source).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// NOVA_HOME_DIR before the require: the baseline store lives under it (#tests-wrote-into-the-real-dot-nova).
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-kept-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const tmps = [HOME];
const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };

function mkMod(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-kept-" + tag + "-")); tmps.push(root);
  const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n");
  w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" provinces = { 1 } history = { owner = GER } }\n');
  w("history/countries/GER - Germany.txt", "capital = 1\n");
  return { root, w };
}
/** Every file under `dir`, as relative path → sha1 of its bytes. */
function hashTree(dir, base = dir, out = new Map()) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hashTree(p, base, out);
    else out.set(path.relative(base, p), crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"));
  }
  return out;
}
/** Every file's bytes under the store's parent, as a multiset of sha1s (a rename keeps the bytes, a removal does not). */
function storeHashes(parent) {
  const out = [];
  for (const [, h] of hashTree(parent)) out.push(h);
  return out.sort();
}
const containsAll = (after, before) => { const m = new Map(); for (const h of after) m.set(h, (m.get(h) || 0) + 1); return before.every((h) => { const n = m.get(h) || 0; if (!n) return false; m.set(h, n - 1); return true; }); };
const savedAtOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "_baseline.json"), "utf8")).savedAt; } catch (_) { return null; } };
const wait = (ms) => { const t = Date.now() + ms; while (Date.now() < t) { /* the stamp is per millisecond */ } };

try {
  // ═══ 1. A SECOND SAVE KEEPS THE FIRST ═══════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 1. the baseline a save replaces is kept beside it, with its own content and time ===");
  {
    const { root, w } = mkMod("twice");
    const s1 = md.saveMapBaseline({ modRoot: root });
    ok(s1.ok === true && !!s1.savedAt, "THE CONTROL: the first save made a baseline", s1);
    const dest = s1.baselinePath, parent = path.dirname(dest);
    ok(inside(dest, HOME), "…inside this test's own home folder", { dest, HOME });
    const firstTree = hashTree(dest);
    const before = storeHashes(parent);
    // the map changes, as it does between two clicks of 💾 Save baseline
    w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" provinces = { } history = { owner = GER } }\n');
    wait(5);
    const s2 = md.saveMapBaseline({ modRoot: root });
    ok(s2.ok === true && s2.savedAt !== s1.savedAt, "THE CONTROL: the second save made a new baseline", { s1: s1.savedAt, s2: s2.savedAt });
    ok(savedAtOf(dest) === s2.savedAt && /provinces = \{ \}/.test(fs.readFileSync(path.join(dest, "history", "states", "1-Real.txt"), "utf8")),
      "THE CONTROL: the baseline in place is the second one", savedAtOf(dest));
    const kept = fs.readdirSync(parent).filter((n) => n !== path.basename(dest) && n.startsWith(path.basename(dest)));
    const firstKept = kept.map((n) => path.join(parent, n)).find((d) => savedAtOf(d) === s1.savedAt);
    ok(!!firstKept, "⭐⭐⭐ the FIRST baseline still exists beside it (B6-4: it was fs.rmSync'd)", { kept });
    ok(!!firstKept && /\.replaced-\d{4}-\d\d-\d\dT/.test(firstKept), "…in a dated folder named for what happened to it", firstKept);
    ok(!!firstKept && [...firstTree].every(([rel, h]) => hashTree(firstKept).get(rel) === h) && hashTree(firstKept).size === firstTree.size,
      "⭐⭐ …byte for byte as it was saved, every file of it", firstKept && { was: firstTree.size, now: hashTree(firstKept).size });
    ok(s2.previousMovedTo === firstKept, "⭐ …and the answer says where it is (previousMovedTo)", { previousMovedTo: s2.previousMovedTo, firstKept });
    ok(containsAll(storeHashes(parent), before), "⭐⭐ nothing that was under map_baselines before the save is gone after it", { before: before.length });
    const info = md.getMapBaselineInfo({ modRoot: root });
    ok(info.exists && info.savedAt === s2.savedAt && info.baselinePath === dest, "the baseline Nova reports is the new one, at its own name", info);
  }

  // ═══ 2. THE LEFTOVERS OF A SAVE THAT DID NOT FINISH ═════════════════════════════════════════════════════════════════════
  console.log("\n=== 2. a leftover .nova-previous with no baseline in place IS the baseline: it goes back, it is not removed ===");
  {
    const { root } = mkMod("crash");
    const s1 = md.saveMapBaseline({ modRoot: root });
    const dest = s1.baselinePath;
    // the app died between the two renames of the OLD code: the baseline renamed to .nova-previous, the new one never moved in
    fs.renameSync(dest, dest + ".nova-previous");
    ok(!md.getMapBaselineInfo({ modRoot: root }).exists, "THE CONTROL: with only the leftover, Nova sees no baseline");
    const before = storeHashes(path.dirname(dest));
    const s2 = md.saveMapBaseline({ modRoot: root });
    ok(s2.ok === true, "the next save succeeds", s2);
    const parent = path.dirname(dest);
    const firstKept = fs.readdirSync(parent).map((n) => path.join(parent, n)).find((d) => savedAtOf(d) === s1.savedAt);
    ok(!!firstKept, "⭐⭐⭐ the leftover — the only copy of that baseline — survives the save", fs.readdirSync(parent));
    ok(!fs.existsSync(dest + ".nova-previous"), "…and no folder is left under the scratch name");
    ok(containsAll(storeHashes(parent), before), "⭐⭐ nothing under map_baselines was removed");
  }
  console.log("\n=== 2b. a leftover .nova-previous beside a baseline, and a leftover .nova-saving, are set aside, not removed ===");
  {
    const { root } = mkMod("leftovers");
    const s1 = md.saveMapBaseline({ modRoot: root });
    const dest = s1.baselinePath, parent = path.dirname(dest);
    for (const sfx of [".nova-previous", ".nova-saving"]) {
      fs.mkdirSync(path.join(dest + sfx, "history"), { recursive: true });
      fs.writeFileSync(path.join(dest + sfx, "history", "marker" + sfx + ".txt"), "leftover " + sfx + "\n");
    }
    const before = storeHashes(parent);
    const s2 = md.saveMapBaseline({ modRoot: root });
    ok(s2.ok === true, "the save succeeds over both leftovers", s2);
    ok(!fs.existsSync(dest + ".nova-previous") && !fs.existsSync(dest + ".nova-saving"), "no folder is left under either scratch name");
    ok(containsAll(storeHashes(parent), before), "⭐⭐⭐ every byte the leftovers held is still under map_baselines", { before: before.length, after: storeHashes(parent).length });
    const names = fs.readdirSync(parent).filter((n) => n.startsWith(path.basename(dest) + "."));
    ok(names.some((n) => /\.unfinished-/.test(n)) && names.filter((n) => /\.replaced-/.test(n)).length >= 2,
      "…each in a dated folder that says what it was", names);
    ok(Array.isArray(s2.setAside) && s2.setAside.length === 2, "…and the answer lists the two leftovers it set aside", s2.setAside);
  }

  // ═══ 3. A SAVE THAT FAILS ═══════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 3. a save that fails keeps the baseline in place and sets its staging copy aside ===");
  {
    const { root } = mkMod("fails");
    const s1 = md.saveMapBaseline({ modRoot: root });
    const dest = s1.baselinePath, parent = path.dirname(dest);
    const before = storeHashes(parent);
    const realCp = fs.cpSync;
    let bad;
    let calls = 0;
    try {
      // the second directory's copy fails, so the staging copy already holds the first: a partial copy to dispose of
      fs.cpSync = function () { if (++calls === 2) throw new Error("simulated disk full"); return realCp.apply(this, arguments); };
      bad = md.saveMapBaseline({ modRoot: root });
    } finally { fs.cpSync = realCp; }
    ok(calls >= 2 && bad && bad.ok === false && /simulated/.test(bad.error || ""), "THE CONTROL: the failure was simulated", { calls, bad });
    ok(savedAtOf(dest) === s1.savedAt, "⭐⭐ the baseline in place is still the first one", savedAtOf(dest));
    ok(containsAll(storeHashes(parent), before), "⭐⭐ nothing that was under map_baselines is gone");
    ok(!fs.existsSync(dest + ".nova-saving"), "…and the staging copy is not left under the scratch name");
    const unfinished = fs.readdirSync(parent).filter((n) => n.startsWith(path.basename(dest) + ".") && /\.unfinished-/.test(n));
    ok(unfinished.length === 1 && bad.unfinishedMovedTo === path.join(parent, unfinished[0]),
      "⭐ the partial copy is SET ASIDE as unfinished — not removed — and the answer says where", { unfinished, bad });
    const again = md.saveMapBaseline({ modRoot: root });
    ok(again.ok === true && savedAtOf(dest) === again.savedAt, "a save still succeeds afterwards", again);
  }

  // ═══ 4. THE SWAP ITSELF FAILS ═══════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 4. when the new copy cannot be moved in, the previous baseline goes back to its own name ===");
  {
    const { root } = mkMod("swap");
    const s1 = md.saveMapBaseline({ modRoot: root });
    const dest = s1.baselinePath, parent = path.dirname(dest);
    const before = storeHashes(parent);
    const realRename = fs.renameSync;
    let bad, refused = 0;
    try {
      fs.renameSync = function (from, to) {
        if (String(from).endsWith(".nova-saving") && path.resolve(String(to)) === path.resolve(dest)) { refused++; throw new Error("simulated EPERM on the swap"); }
        return realRename.apply(this, arguments);
      };
      bad = md.saveMapBaseline({ modRoot: root });
    } finally { fs.renameSync = realRename; }
    ok(refused === 1 && bad && bad.ok === false, "THE CONTROL: the swap was refused", { refused, bad });
    ok(savedAtOf(dest) === s1.savedAt, "⭐⭐⭐ the previous baseline is back at its own name", { dest, names: fs.readdirSync(parent) });
    ok(containsAll(storeHashes(parent), before), "⭐⭐ nothing under map_baselines was removed");
  }

  // ═══ 5. 🔎 DERIVED: NO REMOVAL ANYWHERE IN THE SAVE ════════════════════════════════════════════════════════════════════
  console.log("\n=== 5. saveMapBaseline's own code removes nothing ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const code = maskJsComments(src), lit = maskJsLiterals(src);
    const at = code.indexOf("function saveMapBaseline(");
    ok(at > 0, "saveMapBaseline is in the source", at);
    const span = at > 0 ? jsBodyAt(lit, at) : null;
    const body = span ? code.slice(span[0], span[1] + 1) : "";
    ok(body.length > 2000, "…and its body was found (or the checks below prove nothing)", body.length);
    const removers = body.match(/\b(?:rmSync|rmdirSync|unlinkSync|rimraf|rm|unlink|rmdir)\s*\(/g) || [];
    ok(body.length > 2000 && removers.length === 0, "⭐⭐⭐ no rmSync / rmdirSync / unlinkSync in saveMapBaseline", removers);
    ok(/renameSync\(\s*from\s*,\s*to\s*\)/.test(body) && /"replaced"/.test(src.slice(span[0], span[1])) && /"unfinished"/.test(src.slice(span[0], span[1])),
      "⭐ …the previous baseline and the staging copy are each renamed aside", body.length);
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally {
  // this test's own temp folders only — every one of them made by mkdtemp above
  for (const d of tmps) { if (inside(d, os.tmpdir())) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }
}
console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); }
process.exitCode = fails.length ? 1 : 0;
