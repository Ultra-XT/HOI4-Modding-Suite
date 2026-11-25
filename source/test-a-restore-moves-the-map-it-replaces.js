// ⛔ #a-restore-moves-the-map-it-replaces — 🛟 Restore baseline MOVES every folder it replaces out of the mod. It deletes none of them.
//
// THE DEFECT (tool campaign B6-6, a blocker under CLAUDE.md's first and fourth rules). restoreMapBaseline copied the baseline beside
// each live folder, swapped the two with renames, and then ran fs.rmSync on the live folder it had replaced, "the copy the user asked
// to discard by restoring — not their only copy of anything". It was. MEASURED with the page's own clicks (save-baseline {modPath},
// a line typed into a state file and a file of the modder's own added to map/, then restore-baseline {modPath}): the restore answered
// 200, and the line and the file existed NOWHERE afterwards — not in the mod, not beside it, not in any store of Nova's, the backup pool
// included. Two more rmSync calls removed the leftovers of a restore that did not finish, before each folder's copy; when the app died
// between the two renames, one of those leftovers (`<dir>.nova-previous`, with no `<dir>` beside it) IS the mod's map.
//
// THE FIX. The folder a restore replaces goes where a folder the baseline does not hold already went (_moveOutOfMod): Nova's per-mod
// baseline_restores store outside the mod, one dated folder per restore, and the answer names each one (replacedMovedTo [{dir, to,
// files}]) so the page can say where. On the mod's own drive the move is one rename; across drives it is a copy, counted, and only
// then the original removed. One that cannot be moved stays in the mod, whole, under its scratch name, and the answer says so
// (replacedLeftInMod). The leftovers are dealt with first, the same way, before anything is written: a `.nova-previous` with no live
// folder goes back to its own name, and one that cannot be moved stops the restore before it changes the map.
//
// The back-out control: put the fs.rmSync of the replaced folder back (or either leftover rmSync) and sections 1-3 fail by behaviour,
// section 7 by source.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// NOVA_HOME_DIR before the require: the baseline and the store a restore moves into both live under it (#tests-wrote-into-the-real-dot-nova).
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-restore-moves-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 500) : "")); }
};
const tmps = [HOME];
const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
const NOT_GAME = path.join(os.tmpdir(), "nova-restore-moves-not-the-game");
const STORE = path.join(HOME, ".nova", "baseline_restores");

function mkMod(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-restore-moves-" + tag + "-")); tmps.push(root);
  const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n");
  w("map/strategicregions/1-A.txt", 'strategic_region = { id = 1 name = "A" provinces = { 1 } }\n');
  w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" provinces = { 1 } history = { owner = GER } }\n');
  w("history/countries/GER - Germany.txt", "capital = 1\n");
  w("history/units/GER_1936.txt", "division_template = { name = \"Infantry\" }\n");
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
const sameTree = (a, b) => a.size === b.size && [...a].every(([rel, h]) => b.get(rel) === h);
const hashes = (...dirs) => dirs.flatMap((d) => [...hashTree(d).values()]).sort();
const containsAll = (after, before) => { const m = new Map(); for (const h of after) m.set(h, (m.get(h) || 0) + 1); return before.every((h) => { const n = m.get(h) || 0; if (!n) return false; m.set(h, n - 1); return true; }); };
const DIRS = ["map", path.join("history", "states"), path.join("history", "countries"), path.join("history", "units")];
const scratchLeft = (root) => DIRS.flatMap((d) => [".nova-restoring", ".nova-previous"].map((s) => path.join(root, d + s))).filter((p) => fs.existsSync(p));
const wait = (ms) => { const t = Date.now() + ms; while (Date.now() < t) { /* the stamp is per millisecond */ } };
/** fs.renameSync / fs.cpSync replaced for one call, put back after it. */
function withFs(patch, fn) {
  const real = { renameSync: fs.renameSync, cpSync: fs.cpSync };
  try { patch(real); return fn(); } finally { fs.renameSync = real.renameSync; fs.cpSync = real.cpSync; }
}

try {
  // ═══ 1. A HAND EDIT MADE AFTER THE BASELINE IS KEPT ═════════════════════════════════════════════════════════════════════
  console.log("\n=== 1. the folders a restore replaces are moved out of the mod into Nova's store, byte for byte, and the answer says where ===");
  {
    const { root, w } = mkMod("edit");
    const sv = md.saveMapBaseline({ modRoot: root });
    ok(sv.ok === true, "THE CONTROL: a baseline was saved", sv);
    const baselineTrees = new Map(DIRS.map((d) => [d, hashTree(path.join(sv.baselinePath, d))]));
    // what the modder did after it: a line typed into a state file, a file of their own in map/, a changed definition
    const marker = "B6HANDEDIT" + crypto.randomBytes(4).toString("hex");
    w("history/states/1-Real.txt", `state = { id = 1 name = "STATE_1" provinces = { 1 } history = { owner = GER } } # ${marker}\n`);
    w(`map/my_notes_${marker}.txt`, `${marker}: my notes about this map\n`);
    w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;1\n");
    const before = new Map(DIRS.map((d) => [d, hashTree(path.join(root, d))]));
    const beforeAll = hashes(path.join(root, "map"), path.join(root, "history"));

    const rs = md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME });
    ok(rs.ok === true && DIRS.every((d) => rs.restored.includes(d)), "THE CONTROL: the restore answered ok and restored all four folders", rs);
    ok(DIRS.every((d) => sameTree(hashTree(path.join(root, d)), baselineTrees.get(d))), "THE CONTROL: the mod's folders are exactly the baseline's (mirror, not merge)");
    ok(!fs.existsSync(path.join(root, "map", `my_notes_${marker}.txt`)), "THE CONTROL: the file added after the baseline is gone from the mod");

    const moved = Array.isArray(rs.replacedMovedTo) ? rs.replacedMovedTo : [];
    ok(moved.length === DIRS.length && DIRS.every((d) => moved.some((m) => m.dir === d)), "⭐ the answer names every folder the restore replaced (replacedMovedTo)", rs.replacedMovedTo);
    for (const d of DIRS) {
      const m = moved.find((x) => x.dir === d);
      ok(!!m && inside(m.to, STORE) && !inside(m.to, root), `…${d.replace(/\\/g, "/")} went OUTSIDE the mod, into Nova's baseline_restores store`, m);
      ok(!!m && sameTree(hashTree(m.to), before.get(d)), `⭐⭐⭐ …and every file it held is there byte for byte (B6-6: it was fs.rmSync'd)`, m && { to: m.to, was: before.get(d).size, now: hashTree(m.to).size });
      ok(!!m && m.files === before.get(d).size, `…the answer counts its ${before.get(d).size} file(s)`, m);
    }
    ok(new Set(moved.map((m) => path.relative(STORE, m.to).split(path.sep).slice(0, 2).join("/"))).size === 1,
      "…all of them under ONE dated folder for this restore", moved.map((m) => m.to));
    const typed = moved.find((m) => m.dir === path.join("history", "states"));
    ok(!!typed && fs.readFileSync(path.join(typed.to, "1-Real.txt"), "utf8").includes(marker), "⭐⭐ the line the modder typed is in the store");
    const ownMap = moved.find((m) => m.dir === "map");
    ok(!!ownMap && fs.existsSync(path.join(ownMap.to, `my_notes_${marker}.txt`)), "⭐⭐ …and so is the file of their own they put in map/");
    ok(containsAll(hashes(path.join(root, "map"), path.join(root, "history"), STORE), beforeAll), "⭐⭐⭐ every byte the mod's folders held before the restore is still on disk");
    ok(scratchLeft(root).length === 0, "no .nova-restoring / .nova-previous folder is left in the mod", scratchLeft(root));
    ok(!rs.replacedLeftInMod, "…and nothing was left in the mod for want of a move", rs.replacedLeftInMod);

    // ═══ 2. A SECOND RESTORE KEEPS THE FIRST'S ════════════════════════════════════════════════════════════════════════════
    console.log("\n=== 2. a second restore keeps what the first moved, and moves what it replaces beside it ===");
    const firstStore = hashes(STORE);
    w("history/states/1-Real.txt", `state = { id = 1 name = "STATE_1" provinces = { 1 } history = { owner = GER } } # second ${marker}\n`);
    wait(5);
    const rs2 = md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME });
    ok(rs2.ok === true, "THE CONTROL: the second restore answered ok", rs2);
    ok(containsAll(hashes(STORE), firstStore), "⭐⭐ nothing the first restore moved into the store is gone");
    const second = (rs2.replacedMovedTo || []).find((m) => m.dir === path.join("history", "states"));
    ok(!!second && fs.readFileSync(path.join(second.to, "1-Real.txt"), "utf8").includes("# second " + marker) && !moved.some((m) => m.to === second.to),
      "⭐ …and the second edit is in a folder of its own", { second, first: moved.map((m) => m.to) });
  }

  // ═══ 3. THE LEFTOVERS OF A RESTORE THAT DID NOT FINISH ══════════════════════════════════════════════════════════════════
  console.log("\n=== 3. a leftover .nova-previous with no live folder IS the mod's map: it goes back, and nothing is removed ===");
  {
    const { root } = mkMod("died");
    const sv = md.saveMapBaseline({ modRoot: root });
    ok(sv.ok === true, "THE CONTROL: a baseline was saved", sv);
    // an earlier restore died between its two renames: the live states renamed aside, the staged copy never moved in
    const states = path.join(root, "history", "states");
    fs.writeFileSync(path.join(states, "2-Mine.txt"), 'state = { id = 2 name = "MINE" provinces = { } }\n');
    const liveStates = hashTree(states);
    fs.renameSync(states, states + ".nova-previous");
    fs.mkdirSync(states + ".nova-restoring", { recursive: true });
    fs.writeFileSync(path.join(states + ".nova-restoring", "1-Real.txt"), "half a copy\n");
    // …and another left a replaced map beside the live one
    fs.mkdirSync(path.join(root, "map.nova-previous"), { recursive: true });
    fs.writeFileSync(path.join(root, "map.nova-previous", "old_map_note.txt"), "a map an earlier restore replaced\n");
    const beforeAll = hashes(root);
    const rs = md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME });
    ok(rs.ok === true, "THE CONTROL: the restore answered ok", rs);
    ok(containsAll(hashes(root, STORE), beforeAll), "⭐⭐⭐ every byte the mod held before the restore — the leftovers' among them — is still on disk");
    const statesMoved = (rs.replacedMovedTo || []).find((m) => m.dir === path.join("history", "states"));
    ok(!!statesMoved && sameTree(hashTree(statesMoved.to), liveStates), "⭐⭐ the states the dead restore had renamed aside came back as the mod's, and were then moved out as the folder this restore replaced", statesMoved);
    const left = rs.leftoversMovedTo || [];
    ok(left.some((l) => l.was === path.join("history", "states") + ".nova-restoring" && inside(l.to, STORE) && /unfinished-restore/.test(l.to)),
      "⭐ the half-made copy is moved into the store as an unfinished restore, and the answer says where (leftoversMovedTo)", left);
    ok(left.some((l) => l.was === "map.nova-previous" && inside(l.to, STORE) && /replaced-by-an-earlier-restore/.test(l.to) && fs.existsSync(path.join(l.to, "old_map_note.txt"))),
      "⭐ the map an earlier restore replaced is moved into the store under its own name", left);
    ok(scratchLeft(root).length === 0, "no scratch folder is left in the mod", scratchLeft(root));
  }
  console.log("\n=== 3b. a leftover that cannot be moved stops the restore before it changes the map ===");
  {
    const { root } = mkMod("stuck");
    const sv = md.saveMapBaseline({ modRoot: root });
    ok(sv.ok === true, "THE CONTROL: a baseline was saved", sv);
    fs.writeFileSync(path.join(root, "history", "states", "1-Real.txt"), "an edit after the baseline\n");
    const stuck = path.join(root, "history", "states.nova-restoring");
    fs.mkdirSync(stuck, { recursive: true });
    fs.writeFileSync(path.join(stuck, "x.txt"), "held open\n");
    const before = hashTree(root);
    let refused = 0;
    const rs = withFs((real) => {
      fs.renameSync = function (from, to) {
        if (path.resolve(String(from)) === path.resolve(stuck)) { refused++; const e = new Error("EPERM: operation not permitted (simulated)"); e.code = "EPERM"; throw e; }
        return real.renameSync.apply(this, arguments);
      };
    }, () => md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME }));
    ok(refused >= 1 && rs.ok === false && rs.refused === "leftover", "THE CONTROL: the move was refused, and so was the restore", { refused, rs });
    ok(/states\.nova-restoring/.test(rs.error || "") && /Nothing was deleted/.test(rs.error || ""), "…in words that name the folder and say nothing was deleted", rs.error);
    ok(sameTree(hashTree(root), before), "⭐⭐ the mod is byte for byte as it was: the edit, the leftover, everything");
  }

  // ═══ 4. A REPLACED FOLDER THAT CANNOT BE MOVED ══════════════════════════════════════════════════════════════════════════
  console.log("\n=== 4. a replaced folder that cannot be moved stays in the mod, whole, and the answer says so ===");
  {
    const { root, w } = mkMod("held");
    const sv = md.saveMapBaseline({ modRoot: root });
    ok(sv.ok === true, "THE CONTROL: a baseline was saved", sv);
    w("history/states/1-Real.txt", "an edit the modder keeps\n");
    const live = hashTree(path.join(root, "history", "states"));
    const aside = path.join(root, "history", "states.nova-previous");
    let refused = 0;
    const rs = withFs((real) => {
      fs.renameSync = function (from, to) {
        if (path.resolve(String(from)) === path.resolve(aside) && inside(path.resolve(String(to)), STORE)) { refused++; const e = new Error("EBUSY: resource busy or locked (simulated)"); e.code = "EBUSY"; throw e; }
        return real.renameSync.apply(this, arguments);
      };
    }, () => md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME }));
    ok(refused === 1 && rs.ok === true, "THE CONTROL: the move was refused once, and the map was still restored", { refused, rs });
    ok(sameTree(hashTree(aside), live), "⭐⭐⭐ the folder it replaced is still in the mod, whole, under its scratch name", { at: aside });
    ok(Array.isArray(rs.replacedLeftInMod) && rs.replacedLeftInMod.some((l) => l.dir === path.join("history", "states") && path.resolve(l.at) === path.resolve(aside) && /EBUSY/.test(l.error)),
      "⭐ …and the answer says where it was left, and why (replacedLeftInMod)", rs.replacedLeftInMod);
    ok(!(rs.replacedMovedTo || []).some((m) => m.dir === path.join("history", "states")), "…and does not claim it was moved", rs.replacedMovedTo);
    wait(5);
    const again = md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME });
    const carried = (again.leftoversMovedTo || []).find((l) => l.was === path.join("history", "states") + ".nova-previous");
    ok(again.ok === true && !!carried && sameTree(hashTree(carried.to), live) && !fs.existsSync(aside),
      "⭐ the next restore moves it into the store, whole", { carried, again });
  }

  // ═══ 5. ACROSS DRIVES ═══════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 5. across drives the move is a copy, counted, then the removal — and a short copy removes nothing ===");
  {
    const { root, w } = mkMod("exdev");
    md.saveMapBaseline({ modRoot: root });
    w("history/states/1-Real.txt", "an edit on another drive\n");
    w("history/states/7-Seven.txt", "another file\n");
    const live = hashTree(path.join(root, "history", "states"));
    let exdev = 0;
    const exdevRename = (real) => {
      fs.renameSync = function (from, to) {
        if (inside(path.resolve(String(to)), STORE)) { exdev++; const e = new Error("EXDEV: cross-device link not permitted (simulated)"); e.code = "EXDEV"; throw e; }
        return real.renameSync.apply(this, arguments);
      };
    };
    const rs = withFs(exdevRename, () => md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME }));
    const m = (rs.replacedMovedTo || []).find((x) => x.dir === path.join("history", "states"));
    ok(exdev >= 1 && rs.ok === true, "THE CONTROL: every rename into the store was refused as across drives", { exdev, rs });
    ok(!!m && sameTree(hashTree(m.to), live) && m.files === live.size, "⭐⭐ the replaced folder was copied into the store, every file of it, and counted", m);
    ok(scratchLeft(root).length === 0, "…and only then taken out of the mod", scratchLeft(root));

    w("history/states/1-Real.txt", "an edit whose copy comes back short\n");
    const live2 = hashTree(path.join(root, "history", "states"));
    const aside = path.join(root, "history", "states.nova-previous");
    wait(5);
    const rs2 = withFs((real) => {
      exdevRename(real);
      fs.cpSync = function (from, to) {
        const r = real.cpSync.apply(this, arguments);
        if (inside(path.resolve(String(to)), STORE)) { const f = [...hashTree(String(to)).keys()][0]; if (f) fs.unlinkSync(path.join(String(to), f)); }   // one file of this test's own copy
        return r;
      };
    }, () => md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME }));
    ok(rs2.ok === true && Array.isArray(rs2.replacedLeftInMod) && rs2.replacedLeftInMod.some((l) => /copied \d+ of \d+ files/.test(l.error)),
      "THE CONTROL: the copy came back short, and the answer says so", rs2);
    ok(sameTree(hashTree(aside), live2), "⭐⭐⭐ the original is left in the mod, whole — a short copy is not a move", { at: aside });
  }

  // ═══ 6. A FOLDER THE BASELINE DOES NOT HOLD ════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 6. a folder the baseline does not hold goes under the same dated folder as the ones it replaces ===");
  {
    const { root, w } = mkMod("units-later");
    fs.renameSync(path.join(root, "history", "units"), path.join(root, "history", "units-away"));
    const sv = md.saveMapBaseline({ modRoot: root });
    ok(sv.ok === true && !sv.dirs.includes(path.join("history", "units")), "THE CONTROL: the baseline holds no history/units", sv.dirs);
    fs.renameSync(path.join(root, "history", "units-away"), path.join(root, "history", "units"));
    w("history/states/1-Real.txt", "edited\n");
    const rs = md.restoreMapBaseline({ modRoot: root, gameRoot: NOT_GAME });
    const units = (rs.movedAside || []).find((m) => m.dir === path.join("history", "units"));
    const states = (rs.replacedMovedTo || []).find((m) => m.dir === path.join("history", "states"));
    const day = (p) => path.relative(STORE, p).split(path.sep).slice(0, 2).join("/");
    ok(rs.ok === true && !!units && !!states && day(units.to) === day(states.to), "⭐ the units the baseline did not hold sit beside the states it replaced, one folder per restore", { units, states });
    ok(!(rs.replacedMovedTo || []).some((m) => m.dir === path.join("history", "units")), "…and stay in movedAside, whose sentence says \"was not in that baseline\"", rs.replacedMovedTo);
  }

  // ═══ 7. 🔎 DERIVED: NO REMOVAL IN THE RESTORE; THE MOVE REMOVES ONLY AFTER A COUNTED COPY ═══════════════════════════════
  console.log("\n=== 7. restoreMapBaseline removes nothing, and _moveOutOfMod removes only after it counted a whole copy ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const code = maskJsComments(src), lit = maskJsLiterals(src);
    const bodyOf = (name) => {
      const at = code.indexOf(`function ${name}(`);
      const span = at > 0 ? jsBodyAt(lit, at) : null;
      return span ? code.slice(span[0], span[1] + 1) : "";
    };
    const restore = bodyOf("restoreMapBaseline"), move = bodyOf("_moveOutOfMod");
    ok(restore.length > 3000 && move.length > 300, "both functions' bodies were found (or the checks below prove nothing)", { restore: restore.length, move: move.length });
    const removers = (s) => s.match(/\b(?:rmSync|rmdirSync|unlinkSync|rimraf|rm|unlink|rmdir)\s*\(/g) || [];
    ok(restore.length > 3000 && removers(restore).length === 0, "⭐⭐⭐ no rmSync / rmdirSync / unlinkSync anywhere in restoreMapBaseline", removers(restore));
    const rm = move.indexOf("rmSync("), count = move.indexOf("got < want"), cp = move.indexOf("cpSync("), rn = move.indexOf("renameSync(live");
    ok(removers(move).length === 1 && rm > count && count > cp && cp > 0, "⭐⭐ _moveOutOfMod's one removal comes after its copy and its count", { removers: removers(move), rm, count, cp });
    ok(rn > 0 && rn < cp && /\.code\s*!==\s*"EXDEV"\s*\)\s*return\b/.test(move), "⭐ …which it makes only across drives: on the mod's drive the move is one rename, and any other refusal moves nothing", { rn, cp });
    ok((restore.match(/_moveOutOfMod\(/g) || []).length === 3, "the restore moves through _moveOutOfMod at its three places: the leftovers, a folder the baseline lacks, the folder it replaced", (restore.match(/_moveOutOfMod\(/g) || []).length);
    ok(/replacedMovedTo/.test(restore.slice(restore.lastIndexOf("ok: true"))), "…and its answer names where they went (replacedMovedTo)");
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally {
  // this test's own temp folders only — every one of them made by mkdtemp above
  for (const d of tmps) { if (inside(d, os.tmpdir())) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }
}
console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); }
process.exitCode = fails.length ? 1 : 0;
