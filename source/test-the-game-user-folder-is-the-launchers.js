// ⛔ #two-documents-folders — THE GAME'S USER FOLDER IS THE ONE ITS LAUNCHER NAMES, AND NOVA STAYS OUT OF EVERY COPY.
//
// Measured on the owner's machine 2026-09-29. Documents had moved back from OneDrive to C:\Users\<you>\Documents (OneDrive's
// folder backup turned off), which copied the whole Paradox Interactive\Hearts of Iron IV folder — logs/ included — so there
// were TWO user folders, both with logs/. HOI4's launcher-settings.json names the real one:
//   gameDataPath = "%USER_DOCUMENTS%/Paradox Interactive/Hearts of Iron IV"
// with %USER_DOCUMENTS% = Electron's app.getPath("documents") — read out of the launcher's own bundle, and hoi4.exe reads the
// same setting. Nova guessed instead: OneDrive first, the first one with logs/. So
//   1. "Collect diagnostics" read logs the game had stopped writing (the next playtest's error.log goes to the other one);
//   2. the guard that keeps Nova's files out of the game's user folder — anything left there loads on top of EVERY mod —
//      protected only the guess, and the folder the game actually loads was unguarded.
// Now: the launcher's folder (HOI4_USER_DIR still wins), and the guard covers every copy that exists.
//
// Each case is a child process with a decoy home, decoy Documents folders and a decoy game folder, so nothing here reads or
// writes the real ones. Nothing is written at all except the decoy fixture: the guard is asked, not tested by writing.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

const temps = [];
const decoy = fs.mkdtempSync(path.join(os.tmpdir(), "nova-userdir-")); temps.push(decoy);
const PI = ["Paradox Interactive", "Hearts of Iron IV"];
const plain = path.join(decoy, "Documents", ...PI);                // where Windows now says Documents is
const oneDrive = path.join(decoy, "OneDrive", "Documents", ...PI); // the copy left behind, also with logs/
for (const d of [plain, oneDrive]) fs.mkdirSync(path.join(d, "logs"), { recursive: true });
const game = path.join(decoy, "game");
fs.mkdirSync(game, { recursive: true });
fs.writeFileSync(path.join(game, "hoi4.exe"), "");                // resolveHoi4GameRoot recognises a game folder by this
const settings = path.join(game, "launcher-settings.json");
const writeSettings = (gameDataPath) => {
  if (gameDataPath === null) { try { fs.unlinkSync(settings); } catch (_) {} return; }
  fs.writeFileSync(settings, "\uFEFF" + JSON.stringify({ gameId: "hoi4", gameDataPath, version: "v1.19.3" }, null, 2));
};

const baseEnv = (() => {
  const e = { ...process.env, USERPROFILE: decoy, HOME: decoy, OneDrive: path.join(decoy, "OneDrive"), HOI4_ROOT: game,
    APPDATA: path.join(decoy, "ad"), NOVA_APP_DATA_DIR: path.join(decoy, "ad"), XDG_CONFIG_HOME: path.join(decoy, "ad"),
    NOVA_DOCUMENTS_DIR: path.join(decoy, "Documents") };
  for (const k of ["HOI4_USER_DIR", "HOI4_MODS_ROOT", "HOI4_MOD_ROOT", "OneDriveConsumer", "OneDriveCommercial"]) delete e[k];
  return e;
})();

// Ask a fresh server.js (these are decided per process) which folder is the game's, and whether each path may be written.
const ask = (label, envPatch, probes) => {
  const src = path.join(decoy, `probe-${label}.js`);
  fs.writeFileSync(src, [
    `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))});`,
    `const probes = ${JSON.stringify(probes || [])};`,
    `const refused = {};`,
    `for (const p of probes) { try { s.assertModWritablePath(p); refused[p] = ""; } catch (e) { refused[p] = String(e && e.message || e).slice(0, 120); } }`,
    `console.log("USERDIR " + JSON.stringify({ userDir: s.resolveHoi4UserDir(), launcher: s.launcherUserDir(), refused }));`,
  ].join("\n"));
  const env = { ...baseEnv, ...envPatch };
  for (const [k, v] of Object.entries(envPatch || {})) if (v === undefined) delete env[k];
  const r = spawnSync(process.execPath, [src], { cwd: __dirname, env, encoding: "utf8", timeout: 120000 });
  try { return JSON.parse((String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("USERDIR ")) || "USERDIR {}").slice(8)); }
  catch (_) { return { raw: String(r.stdout || "") + String(r.stderr || "") }; }
};

try {
  console.log("\n1. ⭐⭐⭐ The game's user folder is the one launcher-settings.json names, not the first guess with logs/");
  writeSettings("%USER_DOCUMENTS%/Paradox Interactive/Hearts of Iron IV");
  const a = ask("launcher", {});
  ok(same(a.userDir, plain), "⭐⭐⭐ with both Documents folders holding logs/, it is the one Windows reports (OneDrive was guessed first)", a);
  writeSettings("%nova_hoi4_elsewhere%/HOI4 data");
  fs.mkdirSync(path.join(decoy, "Elsewhere", "HOI4 data"), { recursive: true });
  const c = ask("othervar", { NOVA_HOI4_ELSEWHERE: path.join(decoy, "Elsewhere") });
  ok(same(c.userDir, path.join(decoy, "Elsewhere", "HOI4 data")), "⭐ any %NAME% in gameDataPath is read from the environment, whatever its case", c);
  writeSettings(null);
  const d = ask("nosettings", {});
  ok(same(d.userDir, plain), "⭐ with no launcher-settings.json, the launcher's own default: <Documents>\\Paradox Interactive\\Hearts of Iron IV", d);
  writeSettings("%USER_DOCUMENTS%/Paradox Interactive/Hearts of Iron IV");
  const e = ask("explicit", { HOI4_USER_DIR: oneDrive });
  ok(same(e.userDir, oneDrive), "⭐ an explicit HOI4_USER_DIR still names the folder (Nova's stand-in for the game's -userdir=)", e);
  const f = ask("noanswer", { NOVA_DOCUMENTS_DIR: "none" });
  ok(f.launcher === "" && same(f.userDir, oneDrive), "with no Documents answer at all, the old guess stands — nothing is invented", f);
  // Run without Electron (node server.js, the preview), Windows' registry is asked what Electron would have answered. The
  // expectation is read here, independently, and expanded with the child's (decoy) environment.
  const fromRegistry = (() => {
    if (process.platform !== "win32") return "";
    const q = spawnSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"], { encoding: "utf8", windowsHide: true });
    const m = /^\s*Personal\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(String(q.stdout || ""));
    if (!m) return "";
    const env = { ...baseEnv };
    let missing = false;
    const out = m[1].replace(/%([^%]+)%/g, (all, name) => {
      const k = Object.keys(env).find((x) => x.toUpperCase() === name.toUpperCase());
      if (k && env[k]) return env[k];
      missing = true;
      return all;
    });
    return missing ? "" : out;
  })();
  const f2 = ask("standalone", { NOVA_DOCUMENTS_DIR: undefined });
  ok(fromRegistry ? same(f2.launcher, path.join(fromRegistry, ...PI)) : f2.launcher === "",
    "⭐⭐ without Electron, the Documents folder is Windows' own answer (its registry), so node server.js agrees with the app", { f2, fromRegistry });
  if (fromRegistry && same(fromRegistry, path.join(decoy, "Documents"))) {
    ok(same(f2.userDir, plain), "⭐ …which on this machine is the folder the game loads, not the OneDrive copy", f2);
  }
  writeSettings("%USER_DOCUMENTS%");
  const g = ask("driveroot", { NOVA_DOCUMENTS_DIR: path.parse(decoy).root });
  ok(g.launcher === "", "a gameDataPath that comes out as the top of a drive is not taken for the game's folder", g);
  writeSettings("Paradox Interactive/Hearts of Iron IV");
  const r = ask("relative", {});
  ok(r.launcher === "", "…nor a relative one, which would otherwise be read from wherever Nova was started", r);
  writeSettings("%USER_DOCUMENTS%/Paradox Interactive/Hearts of Iron IV");

  console.log("\n2. ⭐⭐⭐ Nova's files stay out of EVERY copy of the game's user folder; each one's mod/ stays writable");
  const probes = (root) => [path.join(root, "history", "states", "1-x.txt"), path.join(root, "mod", "x", "common", "ideas", "x.txt")];
  const h = ask("guard", {}, [...probes(plain), ...probes(oneDrive)]);
  const [pH, pM, oH, oM] = [...probes(plain), ...probes(oneDrive)];
  ok(!!(h.refused || {})[pH] && !!(h.refused || {})[oH], "⭐⭐⭐ history/ in the folder the game loads AND in the copy is refused (only the guessed one was)", h.refused);
  ok((h.refused || {})[pM] === "" && (h.refused || {})[oM] === "", "…while a mod under either mod/ folder is still allowed", h.refused);
  const i = ask("guardstandalone", { NOVA_DOCUMENTS_DIR: "none" }, probes(plain));
  ok(!!(i.refused || {})[probes(plain)[0]], "⭐⭐ …and still guarded with no Documents answer at all, when the guess alone would have left the loaded one open", i.refused);
  const moved = path.join(decoy, "NotYetMade", "Documents");
  const notYet = path.join(moved, ...PI);
  const j = ask("guardnotyet", { NOVA_DOCUMENTS_DIR: moved }, [path.join(notYet, "history", "states", "1-x.txt")]);
  ok(!!(j.refused || {})[path.join(notYet, "history", "states", "1-x.txt")] && !fs.existsSync(notYet), "⭐ …and the launcher's folder is guarded before the game has made it", j);
  ok(same(j.launcher, notYet) && same(j.userDir, oneDrive), "⭐ …but until the game makes it, the logs are read where they still are, not from a folder that is not there", j);

  console.log("\n3. The diagnostics collector reads the folder the game writes");
  const SRV = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const diag = (SRV.match(/function collectHoi4Diagnostics\(\) \{[\s\S]{0,200}/) || [""])[0];
  ok(/const userDir = resolveHoi4UserDir\(\);/.test(diag), "collectHoi4Diagnostics asks resolveHoi4UserDir, which section 1 pins");
} catch (e) {
  ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e));
} finally {
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n=== the game's user folder is the launcher's: ${pass + fail} checks, ${fail} failed ===`);
  process.exitCode = fail === 0 && pass >= 10 ? 0 : 1;
}
