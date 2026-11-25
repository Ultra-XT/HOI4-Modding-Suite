// ⛔⛔ #flag-import-lands-in-whatever-the-server-thinks-is-active — 15 .tga FILES AT THE DRIVE ROOT, ok:true.
//
// The Focus Tree effect wizard's "import a custom flag image" sent `modRoot: ""` DELIBERATELY, which makes
// the server fall back to its process-global getActiveRoot(). Two things go wrong with that, and the second
// one is worse than it looks.
//
// 1. That global stopped tracking the page's mod when the activeRoot middleware was removed for state
//    isolation. resolveLocalizationPath's own comment says so, in as many words: "that global no longer
//    tracks the page's mod, so an idea/spirit's name loc would land in the wrong mod (or get
//    cross-contaminated between concurrent tabs). Callers that know their mod now pass it through."
//    This caller knows its mod and never adopted it. Two tabs on two mods, and the flags land in the other
//    one's gfx/flags.
//
// 2. `activeRoot` is INITIALISED to ROOT, and ROOT is path.resolve(__dirname, "..", "..") — on a normal
//    install, the DRIVE ROOT. So on a server that has not been told the mod yet, the import wrote
//    main/medium/small .tga for five ideologies — fifteen files — into `<drive>:\gfx\flags\`, and answered
//    ok:true with the paths. assertPathNotInGameRoot does not catch it: the drive root is not inside the
//    game root.
//
// The sibling endpoint next door has had the guard all along:
//     /api/flags/upload-country-flag → if (!modRoot || modRoot === DEV_ROOT) throw "Select a mod before…"
// The dominant bug shape on this project, again: the fix exists next door and one caller never adopted it.
//
// ⚠️ This test never lets a write reach the real drive root — HOI4_MOD_ROOT is pointed at a scratch
// directory so ROOT resolves there, which is also why the guard checks ROOT and not only DEV_ROOT.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53702);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 340) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const SRC_TGA = path.join(GAME, "gfx", "flags", "ABK_communism.tga");
if (!fs.existsSync(SRC_TGA)) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flagimp-ad-")); roots.push(appdata);
  // Stands in for the drive root: a directory that is NOT a mod, which ROOT will resolve to.
  const notAMod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flagimp-root-")); roots.push(notAMod);
  // A real mod, to prove the guard refuses the fallback and nothing else.
  // resolveAllowedModDirectory only permits a mod under the workspace, the workshop or the game install —
  // a correct guard that this test has to satisfy rather than work around. HOI4_MODS_ROOT sets that
  // workspace, so the mod goes inside it.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flagimp-ws-")); roots.push(workspace);
  const mod = path.join(workspace, "FlaggedMod");
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Flagged"\n', "utf8");
  const srcTga = path.join(appdata, "probe.tga");
  fs.copyFileSync(SRC_TGA, srcTga);

  const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
      HOI4_MOD_ROOT: notAMod, HOI4_MODS_ROOT: workspace,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

  const tree = (dir, prefix = "") => {
    const out = [];
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
    for (const e of ents) {
      if (e.isDirectory()) out.push(...tree(path.join(dir, e.name), prefix + e.name + "/"));
      else out.push(prefix + e.name);
    }
    return out;
  };

  (async () => {
    try {
      let up = false;
      for (let i = 0; i < 160; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
      }
      if (!up) { ok(false, "server came up on " + PORT); return; }

      const importFlag = (modRoot, stem) => fetch(`http://127.0.0.1:${PORT}/api/flags/import-custom-image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stem, sourcePath: srcTga, modRoot }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

      console.log("\n-- ⛔ with no mod chosen, it writes nothing --");
      {
        const before = tree(notAMod);
        // EXACTLY what public/app.js used to send: the empty string, on purpose.
        const r = await importFlag("", "nova_guard_probe");
        ok(r.status === 400, "the import is refused", r);
        ok(/Select a mod/i.test(String(r.body && r.body.error)), "…saying to pick a mod", r.body);
        ok(/Nothing was written/i.test(String(r.body && r.body.error)),
          "…and saying nothing was written, which is the part the user needs", r.body);
        const after = tree(notAMod);
        ok(after.length === before.length, "…and the unchosen root is untouched", after);
        ok(!fs.existsSync(path.join(notAMod, "gfx")), "…no gfx/ tree was created in it");
      }

      console.log("\n-- ⭐ CONTROL: with a real mod it still does its job --");
      {
        const r = await importFlag(mod, "nova_real_flag");
        ok(r.status === 200 && r.body && r.body.ok === true, "the import succeeds", r);
        const files = tree(path.join(mod, "gfx", "flags"));
        // main + medium + small, for the four ideologies plus the bare stem.
        ok(files.length >= 12, `${files.length} .tga files were written`, files.slice(0, 6));
        ok(files.some((f) => f === "nova_real_flag.tga"), "…the main flag", files.slice(0, 6));
        ok(files.some((f) => f.startsWith("medium/")), "…the medium set");
        ok(files.some((f) => f.startsWith("small/")), "…and the small set");
        ok(files.some((f) => /_communism\.tga$/.test(f)), "…one per ideology", files.filter((f) => f.indexOf("/") === -1));
      }

      console.log("\n-- ⭐ the client sends the mod it is editing, not an empty string --");
      {
        // ⚠️ Comment-masked: the fix's own explanation quotes `modRoot: ""` to say what went wrong, and the
        // "no longer sends it" assertion matched that prose instead of the code. Strip comments before any
        // source check — the trap CLAUDE.md names, walked into by the test that documents it.
        const { maskJsComments } = require("./testlib-strip-comments.js");
        const APP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
        const at = APP.indexOf("/api/flags/import-custom-image");
        const win = at === -1 ? "" : APP.slice(at, at + 1800);
        ok(at !== -1, "the call site was found");
        ok(/modRoot: getActiveModPath\(\)/.test(win), "it passes the page's own mod", win.slice(0, 200));
        ok(!/modRoot: ""/.test(win), "…and no longer sends the empty string that caused this", win.slice(0, 200));
        ok(/function getActiveModPath\(\)/.test(APP), "…and that helper exists in this file");
      }

      console.log("\n-- ⭐ CONTROL: the sibling endpoint's guard is still there --");
      {
        // This fix was copied from it. If the sibling ever loses its guard, the reason this one exists is
        // no longer visible anywhere, and the next person will delete both.
        const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        ok(/modRoot === DEV_ROOT\) throw new Error\("Select a mod before uploading a flag\."\)/.test(SRV),
          "/api/flags/upload-country-flag still refuses the fallback", "the precedent this fix cites is gone");
        ok(/Select a mod before importing a flag/.test(SRV), "…and the importer now does too");
      }

      console.log("\n-- ⭐ CONTROL: no OTHER write endpoint takes the fallback unguarded --");
      {
        // Derived, so a new endpoint cannot repeat this. Comments are masked because a fix's own prose names
        // the guard the scan greps for.
        const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
        const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        // Braces are counted where string, template and regex contents are blanked (#a-counted-brace-inside-a-regex):
        // counted in comment-masked text, a `\{` in a regex never closed and fifteen guarded routes read as empty.
        const SRC = maskJsComments(RAW), CODE = maskJsLiterals(RAW);
        const offenders = [], bodiless = [];
        const re = /app\.(post|put|delete|patch)\(\s*"([^"]+)"/g;
        let m, routes = 0;
        while ((m = re.exec(SRC)) !== null) {
          routes++;
          const span = jsBodyAt(CODE, m.index + m[0].length);
          if (!span) { bodiless.push(m[2]); continue; }
          const body = SRC.slice(m.index, span[1] + 1);
          const writes = /safeModWrite|fs\.writeFileSync|fs\.mkdirSync|fs\.renameSync|fs\.copyFileSync|fs\.appendFileSync/.test(body);
          if (!writes) continue;
          if (!/getActiveRoot\(\)/.test(body)) continue;
          const guarded = /checkActiveRootNotGameRoot\(/.test(body)
            || /=== DEV_ROOT/.test(body) || /isUnchosenRoot\(/.test(body)
            // The two New-mod routes write under the mods folder, not the global root; this refuses a mods folder that
            // is a drive's top or Nova's own (#nova-wrote-into-the-drive-root). create-template reads the global root
            // only to drop a cache — a scan that could not read its body until #a-counted-brace-inside-a-regex.
            || /assertModsFolderIsReal\(/.test(body);
          // /api/mod/create is exempt by design: creation writes its own folder and descriptor, which is
          // exactly why checkActiveRootNotGameRoot's comment says mod creation does not come through it.
          if (!guarded && m[2] !== "/api/mod/create") offenders.push(m[1].toUpperCase() + " " + m[2]);
        }
        console.log("     write endpoints that fall back to getActiveRoot(): checked");
        ok(routes > 80 && bodiless.length === 0, `PRECONDITION: every one of the ${routes} write routes has a handler body the scan can read`, bodiless.slice(0, 10));
        ok(offenders.length === 0, "every one of them refuses an unchosen root", offenders);
        const SRVRAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        ok(/function isUnchosenRoot\(/.test(SRVRAW), "…and the guard is one named thing, not copied prose");
        ok((maskJsComments(SRVRAW).match(/isUnchosenRoot\(/g) || []).length >= 3,
          "…used by more than one caller, which is why it was named", (maskJsComments(SRVRAW).match(/isUnchosenRoot\(/g) || []).length);
      }
    } catch (e) {
      ok(false, "threw: " + e.message + "\n" + e.stack);
    } finally {
      try { srv.kill(); } catch (_) {}
      setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
      for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
      console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
      process.exitCode = fail ? 1 : 0;
      setTimeout(() => process.exit(fail ? 1 : 0), 1200);
    }
  })();
}
