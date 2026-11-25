// The HOI4-user-folder guard must hold for EVERY spelling of that folder, not just the canonical one.
// #a-second-spelling-walks-past-the-guard
//
// The owner's install carries the scars of the original bug: `history/states/1082-Loas.txt` and a malformed
// `localisation/english/state_names_l_english.yml`, written by Nova straight into
// Documents\Paradox Interactive\Hearts of Iron IV\. HOI4 loads that folder on top of EVERY mod, so those two
// files broke every mod the owner made — and they were still doing it in the launch that produced this test,
// costing 21 of the 52 lines in error.log, including the state-id conflict that stole the island's provinces.
//
// assertModWritablePath was written to close that class, and for the canonical spelling it does. But it
// compared paths through toCanonicalFsPath, whose realpath call THROWS for a path that does not exist — and
// the file a write is about to create never exists yet. The root canonicalised, the target did not, and any
// alias of the same directory compared unequal:
//
//     canonical long path          -> refused
//     the volume's 8.3 short name  -> WROTE history/states/1082-Loas.txt into the user folder
//     a junction to that folder    -> WROTE it too
//
// path.resolve normalises separators and `..`; it does not expand 8.3 names, junctions or symlinks.
//
// The fix canonicalises what EXISTS and re-attaches the missing tail, so a not-yet-created file resolves
// through its nearest real ancestor. That is one change in toCanonicalFsPath and it covers every caller
// (isPathUnderRoot, assertNotHoi4UserDataDir, assertPathNotInGameRoot).
//
// ⚠️ Nothing here touches the real user folder. HOI4_USER_DIR points at a temp fixture, and the fixture
// carries a logs/ subfolder because resolveHoi4UserDir PREFERS a candidate that has one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spelling-"));
const USER = path.join(TMP, "Paradox Interactive", "Hearts of Iron IV");
fs.mkdirSync(path.join(USER, "logs"), { recursive: true });
fs.mkdirSync(path.join(USER, "mod"), { recursive: true });
process.env.HOI4_USER_DIR = USER;
process.env.NOVA_APP_DATA_DIR = path.join(TMP, "appdata");

require("./server.js");                      // registers safeWrite.configure({ assertWritable })
const safeWrite = require("./safe-write.js");

const cleanup = [];
const attempt = (root) => {
  const target = path.join(root, "history", "states", "1082-Loas.txt");
  try { fs.mkdirSync(path.dirname(target), { recursive: true }); } catch (_) { /* the real endpoints do this */ }
  let msg = "";
  try { safeWrite.safeModWrite(target, "state={ id=1082 }\n", "spelling-test"); }
  catch (e) { msg = String(e.message || ""); }
  const real = path.join(USER, "history", "states", "1082-Loas.txt");
  const landed = fs.existsSync(real);
  if (landed) { try { fs.unlinkSync(real); } catch (_) {} }
  return { refusedByGuard: /Refusing to write into your Hearts of Iron IV user folder/.test(msg), landed, msg };
};

// ── every spelling of the same folder ────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ writing the debris filename into the user folder, three ways ===");
{
  const c = attempt(USER);
  ok(c.refusedByGuard && !c.landed, "the canonical long path is refused", c);

  let short = "";
  try { short = execSync(`for %I in ("${USER}") do @echo %~sI`, { shell: "cmd.exe" }).toString().trim(); } catch (_) {}
  if (short && short.toLowerCase() !== USER.toLowerCase() && fs.existsSync(short)) {
    const s = attempt(short);
    ok(s.refusedByGuard && !s.landed,
      "⭐⭐⭐ …and so is the volume's 8.3 SHORT NAME for it — which used to write the file", s);
  } else {
    console.log("  ..   (8.3 short names unavailable on this volume — that spelling cannot be tested here)");
  }

  const ALIAS = path.join(TMP, "alias");
  let aliasOk = false;
  try { execSync(`mklink /J "${ALIAS}" "${USER}"`, { shell: "cmd.exe", stdio: "ignore" }); aliasOk = true; cleanup.push(ALIAS); } catch (_) {}
  if (aliasOk) {
    const j = attempt(ALIAS);
    ok(j.refusedByGuard && !j.landed,
      "⭐⭐⭐ …and so is a JUNCTION pointing at the same directory — which used to write it too", j);
  } else {
    console.log("  ..   (could not create a junction here — that spelling cannot be tested)");
  }
}

// ── ⚠️ THE POSITIVE CONTROL: a real mod folder must still be writable ────────────────────────────────
console.log("\n=== ⚠️ the guard still lets a real mod through ===");
{
  const modFile = path.join(USER, "mod", "my_mod", "history", "states", "1-Test.txt");
  fs.mkdirSync(path.dirname(modFile), { recursive: true });
  let err = "";
  try { safeWrite.safeModWrite(modFile, "state={ id=1 }\n", "spelling-test"); } catch (e) { err = e.message; }
  ok(!err && fs.existsSync(modFile),
    "⭐⭐ a mod under the user folder's mod\\ subfolder is written normally — the guard is not a blanket refusal", err || true);

  // …and through an alias of that same mod path, which must ALSO still work.
  let short = "";
  try { short = execSync(`for %I in ("${USER}") do @echo %~sI`, { shell: "cmd.exe" }).toString().trim(); } catch (_) {}
  if (short && short.toLowerCase() !== USER.toLowerCase() && fs.existsSync(short)) {
    const aliased = path.join(short, "mod", "my_mod", "history", "states", "2-Test.txt");
    let e2 = "";
    try { safeWrite.safeModWrite(aliased, "state={ id=2 }\n", "spelling-test"); } catch (e) { e2 = e.message; }
    ok(!e2 && fs.existsSync(path.join(USER, "mod", "my_mod", "history", "states", "2-Test.txt")),
      "⭐⭐ …and so is the SAME mod named through the short path — canonicalising did not over-block", e2 || true);
  }
}

// ── the mechanism, pinned directly ───────────────────────────────────────────────────────────────────
console.log("\n=== the canonicaliser resolves a path that does not exist yet ===");
{
  // This is what the whole class turned on: a file about to be created has no realpath of its own.
  const missing = path.join(USER, "no", "such", "dir", "file.txt");
  let short = "";
  try { short = execSync(`for %I in ("${USER}") do @echo %~sI`, { shell: "cmd.exe" }).toString().trim(); } catch (_) {}
  if (short && short.toLowerCase() !== USER.toLowerCase() && fs.existsSync(short)) {
    const missingAliased = path.join(short, "no", "such", "dir", "file.txt");
    // Both spellings of a non-existent file must canonicalise to the same string.
    const { execSync: _e } = require("child_process"); void _e;
    const server = require("./server.js");
    const canon = server && typeof server.toCanonicalFsPath === "function" ? server.toCanonicalFsPath : null;
    if (canon) {
      ok(canon(missing).toLowerCase() === canon(missingAliased).toLowerCase(),
        "⭐⭐⭐ two spellings of the same not-yet-existing file canonicalise identically",
        { a: canon(missing), b: canon(missingAliased) });
    } else {
      console.log("  ..   (toCanonicalFsPath is not exported — covered by the behavioural checks above)");
    }
  } else {
    console.log("  ..   (no alias available on this volume)");
  }
}

for (const a of cleanup) { try { execSync(`rmdir "${a}"`, { shell: "cmd.exe", stdio: "ignore" }); } catch (_) {} }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== a second spelling cannot walk past the guard: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
