// 🌍 Generate a world's step 1 writes all of its three files, or none. #a-world-step-one-is-all-or-nothing (review-safety)
//
// Step 1 copies the province map in, then splices replace_path="history/states" into descriptor.mod, then into the launcher's .mod.
// When the last cannot be written (read-only, or held by another program past the retry ladder), the first two are already done:
// measured (review-safety probe-partial-step1.js) the mod was left with a 34 MB province map of its own and descriptor.mod hiding the
// states below, while the launcher's .mod — the entry the game is started from — still loads them: Nova and the game then disagree
// about which states exist (#nova-writes-two-descriptors-and-named-one: "following it leaves the two disagreeing"). The answer's
// error was safeModWrite's own sentence for the one file, "…Nothing was changed…", above a stop note listing what had been written.
// Every file step 1 writes is known before it writes, so it can ask first.
//
// Pinned: a read-only launcher .mod refuses step 1 BEFORE anything is written (no province map copied, descriptor.mod byte-identical),
// and the refusal names that file. THE CONTROL: the same mod with the .mod writable gets all three. And a .mod another program takes
// between that check and the write (fs.renameSync made to fail for it): descriptor.mod, already spliced, is put back byte-identical,
// and the answer says what the step left instead of safeModWrite's "Nothing was changed" for the one file.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-step1-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const md = require("./map-data.js");
const sha = (p) => { try { return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } catch (_) { return "(none)"; } };
const make = (name) => {
  const dir = path.join(DIRS.mods, name);
  fs.mkdirSync(dir, { recursive: true });
  const desc = `version="1"\nname="${name}"\nsupported_version="1.*"\n`;
  fs.writeFileSync(path.join(dir, "descriptor.mod"), desc);
  const entry = path.join(DIRS.mods, name + ".mod");
  fs.writeFileSync(entry, desc + `path="${dir.replace(/\\/g, "/")}"\n`);
  return { dir, entry };
};
try {
  const c = make("control_world");
  const rc = md.prepareModForNewWorld({ modRoot: c.dir, gameRoot: DIRS.game, dependencyRoots: [], modsRoot: DIRS.mods });
  rec("THE CONTROL: a writable mod gets its province map and both descriptors", rc.ok === true && rc.bitmapCopied === true && (rc.descriptorsWritten || []).length === 2, rc.error || rc.descriptorsWritten);

  const m = make("locked_world");
  fs.chmodSync(m.entry, 0o444);
  const before = { desc: sha(path.join(m.dir, "descriptor.mod")), entry: sha(m.entry) };
  const r = md.prepareModForNewWorld({ modRoot: m.dir, gameRoot: DIRS.game, dependencyRoots: [], modsRoot: DIRS.mods });
  rec("THE CONTROL: step 1 does not succeed on a read-only launcher .mod", r.ok === false, r);
  rec("⭐⭐⭐ no province map was copied in", !fs.existsSync(path.join(m.dir, "map", "provinces.bmp")) && r.bitmapCopied !== true);
  rec("⭐⭐⭐ descriptor.mod is byte-identical (the states below still load for Nova as they do for the game)", sha(path.join(m.dir, "descriptor.mod")) === before.desc && !md.readReplacePaths(m.dir).has("history/states"));
  rec("…and the launcher's .mod too", sha(m.entry) === before.entry);
  rec("⭐⭐ the refusal names the file it could not write", /locked_world\.mod/.test(String(r.error || "")), r.error);
  fs.chmodSync(m.entry, 0o644);

  // a file another program takes BETWEEN the check and the write (the launcher open on it, an antivirus scan): the check cannot see
  // it, so the write fails part-way — after the province map and descriptor.mod. descriptor.mod is put back; the answer says what
  // was left, not safeModWrite's "Nothing was changed" for the one file
  const k = make("held_world");
  const kDesc = path.join(k.dir, "descriptor.mod");
  const beforeK = { desc: sha(kDesc), entry: sha(k.entry) };
  const realRename = fs.renameSync;
  const isEntry = (to) => path.resolve(String(to)).toLowerCase() === path.resolve(k.entry).toLowerCase();
  let heldTries = 0;
  fs.renameSync = function heldRename(from, to) {
    if (isEntry(to)) { heldTries++; const e = new Error("EPERM: operation not permitted, rename"); e.code = "EPERM"; throw e; }
    return realRename.apply(this, arguments);
  };
  let rk;
  try { rk = md.prepareModForNewWorld({ modRoot: k.dir, gameRoot: DIRS.game, dependencyRoots: [], modsRoot: DIRS.mods }); }
  finally { fs.renameSync = realRename; }
  rec("THE CONTROL: the held launcher .mod passes the check and fails at its write", rk.ok === false && !rk.refused && heldTries > 0, { ok: rk.ok, refused: rk.refused, heldTries, error: rk.error });
  rec("⭐⭐⭐ …and descriptor.mod, spliced before it, is put back byte-identical", sha(kDesc) === beforeK.desc && !md.readReplacePaths(k.dir).has("history/states") && (rk.descriptorsWritten || []).length === 0);
  rec("…the launcher's .mod is untouched", sha(k.entry) === beforeK.entry);
  rec("⭐⭐ the answer does not say \"Nothing was changed\" over a province map it copied in, and says what it left",
    rk.bitmapCopied === true && !/Nothing was (changed|written)/.test(String(rk.error || "")) && /provinces\.bmp was copied in/.test(String(rk.error || "")) && /put back/.test(String(rk.error || "")), rk.error);

  // and when descriptor.mod is taken too, after its splice and before its put-back (#a-write-that-failed-reported-nothing): it keeps
  // the line, so the answer must name it, and say why it could not be taken out rather than drop the put-back's own error
  const h = make("held_twice_world");
  const hDesc = path.join(h.dir, "descriptor.mod");
  const isAt = (to, p) => path.resolve(String(to)).toLowerCase() === path.resolve(p).toLowerCase();
  let descRenames = 0;
  fs.renameSync = function heldTwice(from, to) {
    if (isAt(to, h.entry)) { const e = new Error("EPERM: operation not permitted, rename"); e.code = "EPERM"; throw e; }
    if (isAt(to, hDesc) && ++descRenames > 1) { const e = new Error("EBUSY: resource busy or locked, rename"); e.code = "EBUSY"; throw e; }
    return realRename.apply(this, arguments);
  };
  let rh;
  try { rh = md.prepareModForNewWorld({ modRoot: h.dir, gameRoot: DIRS.game, dependencyRoots: [], modsRoot: DIRS.mods }); }
  finally { fs.renameSync = realRename; }
  const hErr = String((rh && rh.error) || "");
  rec("THE CONTROL: descriptor.mod was spliced, then held for its put-back", rh.ok === false && descRenames > 1 && md.readReplacePaths(h.dir).has("history/states"), { ok: rh.ok, descRenames, error: hErr });
  rec("⭐⭐ the answer names descriptor.mod as still carrying the line", /descriptor\.mod still has the line replace_path="history\/states", which could not be taken out again/.test(hErr), hErr);
  rec("⭐⭐ …and gives the put-back's own reason, not nothing", /could not be taken out again \(Couldn't write descriptor\.mod/.test(hErr) && (rh.putBackFailed || []).length === 1 && path.resolve(rh.putBackFailed[0].file) === path.resolve(hDesc), { error: hErr, putBackFailed: rh.putBackFailed });
} catch (e) {
  rec("the test ran to the end", false, e && e.stack);
}
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
