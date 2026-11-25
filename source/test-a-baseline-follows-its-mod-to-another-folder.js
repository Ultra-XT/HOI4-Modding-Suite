// A map baseline saved for a mod is found again when the mod's folder moves: 🛟 Restore is still offered. A copy beside it is not handed it.
// ⛔ #a-baseline-follows-its-mod (B3-9)
//
// THE DEFECT (campaign B3-9, driven twice). 💾 Save baseline says "You can always 🛟 Restore to it", and the baseline is stored outside
// the mod under ~/.nova/map_baselines/<folder>_<sha1 of the PATH> (map-data.js _novaModScopedDir). At the mod's new path — moved, renamed,
// or copied to another folder — GET /api/map/baseline-info answered { exists: false }, Map Errors offered no Restore, and the copy (117 MB
// on G3) sat under the old key. The key must not change (the warning at _novaModScopedDir: every baseline on disk would vanish).
//
// Now getMapBaselineInfo, when the path has none, finds one saved for another folder whose descriptor.mod — the copy the baseline keeps
// of it — gives the same name (and the same remote_file_id when both have one), newest first, and says which folder it was saved for
// (`savedFor`) and whether that folder is still there (`savedForExists`). 🛟 Restore restores from it; nothing is moved; 💾 Save baseline
// at the new path still writes the new path's own store.
//
// ONLY FOR A MOD THAT LEFT ITS FOLDER. While the folder a baseline was saved for still holds the mod — a copy made beside it, or two mods
// given one name — the baseline is that folder's: handing it to the other would let 🛟 Restore put one folder's map over another's. The
// first version of this fix did, and test-a-baseline-is-the-copy-known-to-load.js caught it (its two mods are both named "known").
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-follows-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const write = (dir, files) => { for (const [rel, body] of Object.entries(files)) { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); } return dir; };
const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const STATE = "history/states/1-A.txt";
const mod = (name, descriptor, state) => write(path.join(ROOT, "mods", name), { "descriptor.mod": descriptor, "map/definition.csv": "0;0;0;0;land;false;unknown;0\n", [STATE]: state });

try {
  console.log("1. A baseline saved for a mod, at the path it was saved for (THE CONTROL)");
  const A = mod("my_mod", 'name="Same Mod"\nremote_file_id="111"\nsupported_version="1.*"\n', "state = { id = 1 } # as saved\n");
  const saved = md.saveMapBaseline({ modRoot: A });
  rec("💾 Save baseline saved it", saved && saved.ok === true && !!saved.baselinePath, saved);
  // the store is this test's own (NOVA_HOME_DIR above), never a real ~/.nova: stop before anything else is written
  if (!saved.baselinePath || !path.resolve(saved.baselinePath).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase() + path.sep)) throw new Error("the baseline store is not this test's own: " + saved.baselinePath);
  const atA = md.getMapBaselineInfo({ modRoot: A });
  rec("⚠️ it is offered at the path it was saved for, as its own (no savedFor)", atA.exists === true && same(atA.baselinePath, saved.baselinePath) && atA.savedFor === undefined, atA);

  console.log("\n2. ⛔ The same mod copied to another folder, while the original stays: the original's baseline stays the original's");
  const B = path.join(ROOT, "mods", "my_mod_copy");
  fs.cpSync(A, B, { recursive: true });
  const atB = md.getMapBaselineInfo({ modRoot: B });
  rec("⭐⭐⭐ the copy beside its original is NOT handed the original's baseline (its folder still holds the mod)", atB.exists === false, atB);
  const twin = mod("twin_of_my_mod", 'name="Same Mod"\nremote_file_id="111"\n', "state = { id = 1 } # another map\n");
  rec("⭐⭐⭐ …nor another folder that only shares the mod's name and upload id", md.getMapBaselineInfo({ modRoot: twin }).exists === false, md.getMapBaselineInfo({ modRoot: twin }));

  console.log("\n3. Another mod is never handed it");
  const C = mod("other_mod", 'name="Other Mod"\n', "state = { id = 1 }\n");
  rec("⭐⭐⭐ a mod of another name gets none", md.getMapBaselineInfo({ modRoot: C }).exists === false, md.getMapBaselineInfo({ modRoot: C }));
  const D = mod("same_name_other_upload", 'name="Same Mod"\nremote_file_id="222"\n', "state = { id = 1 }\n");
  rec("⭐⭐ …nor one of the same name uploaded as another Workshop item (another remote_file_id)", md.getMapBaselineInfo({ modRoot: D }).exists === false, md.getMapBaselineInfo({ modRoot: D }));
  const E = mod("no_descriptor", "", "state = { id = 1 }\n");
  fs.unlinkSync(path.join(E, "descriptor.mod"));
  rec("⭐ …nor a folder with no descriptor.mod", md.getMapBaselineInfo({ modRoot: E }).exists === false);

  console.log("\n4. ⛔ The mod's folder MOVED (renamed): the path it was saved for is gone");
  const A2 = path.join(ROOT, "mods", "my_mod_moved");
  fs.renameSync(A, A2);
  const atA2 = md.getMapBaselineInfo({ modRoot: A2 });
  rec("⭐⭐⭐ the baseline is found again at the new path", atA2.exists === true && same(atA2.baselinePath, saved.baselinePath) && same(atA2.savedFor, A), atA2);
  rec("⭐⭐ …and the answer says the folder it was saved for is gone", atA2.savedForExists === false && atA2.foundBy === "descriptor name", atA2);

  console.log("\n4b. ⛔ Another mod now in the folder the baseline was saved for: the mod still left it");
  write(A, { "descriptor.mod": 'name="A New Mod Here"\nsupported_version="1.*"\n' });
  const atA2b = md.getMapBaselineInfo({ modRoot: A2 });
  rec("⭐⭐⭐ the baseline is still found at the moved mod's new path", atA2b.exists === true && same(atA2b.baselinePath, saved.baselinePath) && same(atA2b.savedFor, A), atA2b);
  rec("⭐⭐ …and the answer says the folder is there (with another mod in it)", atA2b.savedForExists === true, atA2b);

  console.log("\n5. ⛔ 🛟 Restore at the new path restores from it, and leaves it whole");
  fs.writeFileSync(path.join(A2, ...STATE.split("/")), "state = { id = 1 } # edited since\n");
  const copyOfState = path.join(saved.baselinePath, ...STATE.split("/"));
  const copyBefore = fs.readFileSync(copyOfState, "utf8"), metaBefore = fs.readFileSync(path.join(saved.baselinePath, "_baseline.json"), "utf8");
  const r = md.restoreMapBaseline({ modRoot: A2, gameRoot: null });
  rec("the restore ran", r && r.ok === true, r);
  rec("⭐⭐⭐ the moved mod's state is the baseline's again", fs.readFileSync(path.join(A2, ...STATE.split("/")), "utf8") === "state = { id = 1 } # as saved\n");
  rec("⭐⭐⭐ …and the baseline is still there, as it was (a restore copies from it)",
    fs.readFileSync(path.join(saved.baselinePath, "_baseline.json"), "utf8") === metaBefore && fs.readFileSync(copyOfState, "utf8") === copyBefore);

  console.log("\n6. 💾 Save baseline at the new path writes the new path's own store, never the one it found");
  const savedA2 = md.saveMapBaseline({ modRoot: A2 });
  rec("it saved", savedA2 && savedA2.ok === true, savedA2);
  rec("⭐⭐⭐ into another folder than the baseline saved for the old path", !!savedA2.baselinePath && !same(savedA2.baselinePath, saved.baselinePath), { savedA2: savedA2.baselinePath, old: saved.baselinePath });
  const nowA2 = md.getMapBaselineInfo({ modRoot: A2 });
  rec("⭐⭐ …which is now the one offered there, as its own", nowA2.exists === true && same(nowA2.baselinePath, savedA2.baselinePath) && nowA2.savedFor === undefined, nowA2);
  rec("⭐⭐ …and the old path's baseline is untouched", fs.readFileSync(path.join(saved.baselinePath, "_baseline.json"), "utf8") === metaBefore && fs.readFileSync(copyOfState, "utf8") === copyBefore);
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a baseline follows its mod to another folder: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
else if (checks < 16) { console.log("   too few checks ran"); process.exitCode = 1; }
