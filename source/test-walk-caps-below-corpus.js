// #focus-file-walk-capped-at-200 + #flag-stem-cap-below-the-corpus — CAPS A SHIPPING MOD EXCEEDS.
//
// A bounded walk that stops silently reads to the user as "that is all there is". Two of Nova's were set
// below what an installed mod actually contains:
//
//   common/national_focus .txt files — cap was 200
//     The Road to 56 212 · Old World Blues 191 · Rise of Nations 122 · Millennium Dawn 103 · vanilla 81
//
//   unique gfx/flags stems (medium/ and small/ variants excluded) — cap was 4000
//     Millennium Dawn 4,393 · Rise of Nations 2,874 · vanilla 2,198 · The Road to 56 2,127 ·
//     Novum Vexillum 1,525 · Old World Blues 1,021
//
// The focus one is the worse of the two. listFocusTxtRelativePathsUnderMod has NINE callers and two of them
// are the duplicate-id guards — the tree-id check and the focus-id check. A guard that cannot see a file
// cannot find a collision in it, so on The Road to 56 Nova would write a clashing id into the twelve files
// past the cap and HOI4 would keep only one of the two trees. Its twin ten lines above,
// listIdeaTxtRelativePathsUnderMod, passes IDEA_VERIFY_TXT_FILE_CAP (12000) to the very same walker.
//
// The flag one is quieter but reads worse: /api/flags/gfx-stems reports modCount, and the picker prints it
// verbatim, so 4000 was shown as the total while 393 of Millennium Dawn's flags were simply unreachable.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const modByName = (re) => {
  try {
    for (const d of fs.readdirSync(WS)) {
      let nm = "";
      try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
      if (re.test(nm)) return path.join(WS, d);
    }
  } catch (_) {}
  return "";
};
const countFiles = (dir, re) => {
  const out = [];
  const walk = (d) => {
    let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of e) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f); else if (!re || re.test(x.name)) out.push(f); }
  };
  walk(dir);
  return out;
};

const PORT = 53145;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("\n[focus files] a mod with more than 200 must not lose the tail");
    {
      const R56 = modByName(/Road to 56/i);
      if (!R56) {
        console.log("     (The Road to 56 not installed — using the largest available mod instead)");
      }
      const target = R56 || modByName(/Old World Blues/i) || "";
      if (!target) {
        rec("a mod large enough to test the cap is installed", false, "none found — this check cannot run");
      } else {
        const onDisk = countFiles(path.join(target, "common", "national_focus"), /\.txt$/i).length;
        const j = await fetch(`http://127.0.0.1:${PORT}/api/focuses/target-files?modPath=${encodeURIComponent(target)}`)
          .then((r) => r.json()).catch((e) => ({ error: String(e) }));
        const files = (j && (j.files || j.items)) || (Array.isArray(j) ? j : []);
        console.log(`     ${path.basename(target)}: ${onDisk} on disk, ${files.length} returned`);
        // ⚠️ PRECONDITION: if the mod has fewer than 200 files the cap cannot bite and this proves nothing.
        rec("the fixture mod really exceeds the old 200 cap", onDisk > 200, onDisk);
        // THE BUG: exactly 200 came back, and the missing tail was invisible to the duplicate-id guards.
        rec("every focus file is returned", files.length === onDisk, { onDisk, returned: files.length });
      }
    }

    console.log("\n[the twin] the idea walker's cap is the one to match");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf("function listFocusTxtRelativePathsUnderMod(");
      const near = at === -1 ? "" : sv.slice(at, at + 1400);
      rec("the focus lister is findable", at !== -1, "not found");
      // Derived: it must pass the SAME constant its twin passes, not a number of its own.
      rec("…and it passes the shared cap, not a literal",
        /walkTxtFilesForIdeaVerify\(focusDir, files, IDEA_VERIFY_TXT_FILE_CAP\)/.test(near),
        "still passes a hardcoded cap");
      rec("…and the shared cap is comfortably above any real mod",
        /const IDEA_VERIFY_TXT_FILE_CAP = (\d+)/.test(sv) && Number(/const IDEA_VERIFY_TXT_FILE_CAP = (\d+)/.exec(sv)[1]) >= 1000,
        (/const IDEA_VERIFY_TXT_FILE_CAP = (\d+)/.exec(sv) || [])[1]);
    }

    console.log("\n[flag stems] Millennium Dawn has more than the old 4000 ceiling");
    {
      const MD = modByName(/Millennium Dawn: A Modern/);
      if (!MD) {
        console.log("     (Millennium Dawn not installed — corpus check skipped)");
        rec("the flag check is skipped only for want of the mod", true, "skipped");
      } else {
        // ⭐ SEND WHAT THE CLIENT SENDS — public/app.js:15914 posts { dir } to gfx-stems-scan.
        const t0 = Date.now();
        const j = await fetch(`http://127.0.0.1:${PORT}/api/flags/gfx-stems-scan`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dir: path.join(MD, "gfx", "flags") }),
        }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
        const stems = (j && j.stems) || [];
        const ms = Date.now() - t0;
        console.log(`     Millennium Dawn gfx/flags: ${stems.length} stems in ${ms}ms`);
        // THE BUG: exactly 4000, with the picker printing that as the total.
        rec("more than the old 4000 ceiling is returned", stems.length > 4000, stems.length);
        rec("…and it is not merely the new ceiling either", stems.length < 20000, stems.length);
        // …and raising a Set bound must not have made this slow. The file walk keeps its own cap.
        rec("…and the scan is still fast", ms < 5000, `${ms}ms`);
      }
    }

    console.log("\n[CONTROL] the caps still exist — this is not 'remove the limit'");
    {
      // An unbounded walk on a pathological tree is a hang. Both ceilings must still be finite.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const stems = /const GFX_FLAG_STEM_MAX_STEMS = (\d+)/.exec(sv);
      const files = /const GFX_FLAG_STEM_MAX_FILES = (\d+)/.exec(sv);
      const depth = /const GFX_FLAG_STEM_MAX_DEPTH = (\d+)/.exec(sv);
      rec("a stem ceiling is still declared", !!stems && Number(stems[1]) > 0, stems && stems[1]);
      rec("…a file ceiling too", !!files && Number(files[1]) > 0, files && files[1]);
      rec("…and a recursion depth limit", !!depth && Number(depth[1]) > 0, depth && depth[1]);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== walk caps below corpus: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
