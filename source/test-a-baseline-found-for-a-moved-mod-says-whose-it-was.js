// ⛔ #a-baseline-found-for-a-moved-mod-says-whose-it-was (B3-9, the page half) — 🛟 RESTORE NAMES THE FOLDER A BASELINE FOUND AGAIN
// WAS SAVED FOR.
//
// Group s's fix finds a mod's baseline again after the mod's folder moved: getMapBaselineInfo matches the descriptor's name (and
// remote_file_id when both have one) and answers savedFor (the folder it was saved for) and savedForExists. The page said nothing of
// it: the confirm read "Restore the map to your baseline?" as for the mod's own. Identity is the descriptor's NAME, so a new local mod
// given a deleted one's name is handed the deleted one's baseline (group s's review); naming the folder lets the modder see whose it
// was before a restore discards their edits. A baseline at its own path names no other folder.
//
// RUN, not grepped: the real saveMapBaseline / getMapBaselineInfo on a mod in a temp folder (the baseline store under this test's own
// NOVA_HOME_DIR), and their answers, untouched, into the page's own baselineRestoreConfirmText and baselineRestoreTitle. Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-whose-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const T = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const write = (dir, files) => { for (const [rel, body] of Object.entries(files)) { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); } return dir; };
const mod = (name, descriptor) => write(path.join(ROOT, "mods", name), { "descriptor.mod": descriptor, "map/definition.csv": "0;0;0;0;land;false;unknown;0\n", "history/states/1-A.txt": "state = { id = 1 }\n" });

try {
  const sb = T.runPage(["function baselineRestoreConfirmText(", "function baselineRestoreTitle("]).sb;
  const confirm = (info) => String(sb.baselineRestoreConfirmText(info));
  const title = (info) => String(sb.baselineRestoreTitle(info));

  console.log("1. A baseline at the path it was saved for (THE CONTROL): it names no other folder");
  const A = mod("whose_mod", 'name="Whose Mod"\nsupported_version="1.*"\n');
  const saved = md.saveMapBaseline({ modRoot: A });
  rec("💾 Save baseline saved it", saved && saved.ok === true && !!saved.baselinePath, saved);
  if (!saved.baselinePath || !path.resolve(saved.baselinePath).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase() + path.sep)) throw new Error("the baseline store is not this test's own: " + saved.baselinePath);
  const own = md.getMapBaselineInfo({ modRoot: A });
  rec("it is offered at its own path, with no savedFor", own.exists === true && own.savedFor === undefined, own);
  rec("⭐ the confirm names no other folder", !/saved for a mod of this name in another folder/.test(confirm(own)), confirm(own));
  rec("⭐ …nor does the 🛟 button's title", !/Saved for /.test(title(own)), title(own));

  console.log("\n2. ⛔ The mod's folder moved: the baseline found again names the folder it was saved for");
  const A2 = path.join(ROOT, "mods", "whose_mod_moved");
  fs.renameSync(A, A2);
  const moved = md.getMapBaselineInfo({ modRoot: A2 });
  rec("the baseline is found again at the new path (group s's answer)", moved.exists === true && !!moved.savedFor && moved.savedForExists === false, moved);
  const c = confirm(moved), t = title(moved);
  rec("⭐⭐⭐ the confirm names the folder it was saved for", c.includes(String(moved.savedFor)), c);
  rec("⭐⭐ …says that folder is not there any more, and how Nova found it", /which is not there any more: Nova found it again by your descriptor's name\./.test(c), c);
  rec("⭐⭐ …and asks the modder to restore it only if that folder was this mod", /Restore it only if that folder was this mod\./.test(c), c);
  rec("⭐⭐ the 🛟 button's title names it too", t.includes(`Saved for ${moved.savedFor}`), t);

  console.log("\n3. Another mod now in the folder it was saved for");
  write(A, { "descriptor.mod": 'name="Another Mod Here"\nsupported_version="1.*"\n' });
  const taken = md.getMapBaselineInfo({ modRoot: A2 });
  rec("the answer says the folder is there", taken.exists === true && taken.savedForExists === true, taken);
  rec("⭐⭐ …and the confirm says it holds another mod now", /which holds another mod now:/.test(confirm(taken)) && confirm(taken).includes(String(taken.savedFor)), confirm(taken));
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a baseline found for a moved mod says whose it was: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
else if (checks < 11) { console.log("   too few checks ran"); process.exitCode = 1; }
