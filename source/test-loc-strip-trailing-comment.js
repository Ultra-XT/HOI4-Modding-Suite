// #loc-strip-eats-the-next-entry — DELETING ONE FOCUS DESTROYED A DIFFERENT FOCUS'S NAME.
//
// When a focus is deleted, the editor cleans up its localisation through /api/focus/strip-localization.
// removeLocalizationStanzasForFocusId decided whether an entry was single-line by asking whether the LINE
// ENDED with a quote — /"\s*$/.test(line). A trailing comment defeats that:
//
//     FOCUS_A:0 "Alpha Focus" # author note
//
// so the entry was taken for the OPENING of a multi-line value, and the scan ran forward to the next line
// that did end with a quote — the NEXT focus's entry — deleting everything in between, that line included.
// The deleted focus's neighbour lost its name, silently, in a file the modder never asked Nova to touch.
//
// Trailing comments are ordinary authoring: 128 such lines across 120 of vanilla's English localisation
// files, and 526 across 120 of Millennium Dawn's.
//
// What actually decides it is whether the value's CLOSING quote is on this line. Anything after that quote
// is a comment, not part of the value.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locstrip-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "locmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "locmod.mod"), 'name="LocMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
const YML = path.join(MOD, "localisation", "english", "focus_l_english.yml");

const PORT = 53285;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    // public/app.js posts { modPath, focusIds } when a deleted focus's loc is cleaned up.
    const strip = (ids) => fetch(`http://127.0.0.1:${PORT}/api/focus/strip-localization`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, focusIds: ids }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    const write = (body) => fs.writeFileSync(YML, "\ufeffl_english:\n" + body, "utf8");
    const read = () => fs.readFileSync(YML, "utf8");
    const has = (k) => read().includes(k);

    console.log("\n[CONTROL] a clean entry removes only itself");
    {
      write(' FOCUS_A:0 "Alpha Focus"\n FOCUS_B:0 "Bravo Focus"\n FOCUS_B_desc:0 "Bravo description"\n FOCUS_C:0 "Charlie"\n');
      const r = await strip(["FOCUS_A"]);
      rec("the strip succeeds", r.status < 400, r.body);
      // ⚠️ If the target survives, the endpoint did nothing and every check below is vacuous.
      rec("the target entry is gone", !has("FOCUS_A:0"), read());
      rec("…and its neighbours survive", has("FOCUS_B:0") && has("FOCUS_B_desc:0") && has("FOCUS_C:0"), read());
    }

    console.log("\n[THE BUG] the same entry with a trailing #comment");
    {
      write(' FOCUS_A:0 "Alpha Focus" # author note\n FOCUS_B:0 "Bravo Focus"\n FOCUS_B_desc:0 "Bravo description"\n FOCUS_C:0 "Charlie"\n');
      const r = await strip(["FOCUS_A"]);
      rec("the strip succeeds", r.status < 400, r.body);
      rec("the target entry is gone", !has("FOCUS_A:0"), read());
      // Before the fix FOCUS_B's name was taken as the terminator of a multi-line value and deleted.
      rec("…and the NEXT focus keeps its name", has("FOCUS_B:0"), read());
      rec("…and so does everything after it", has("FOCUS_B_desc:0") && has("FOCUS_C:0"), read());
    }

    console.log("\n[the comment may contain a quote too]");
    {
      write(' FOCUS_A:0 "Alpha Focus" # see "the design doc"\n FOCUS_B:0 "Bravo Focus"\n');
      await strip(["FOCUS_A"]);
      rec("a quoted comment does not confuse it either", has("FOCUS_B:0") && !has("FOCUS_A:0"), read());
    }

    console.log("\n[⭐ a GENUINE multi-line value must still be removed whole]");
    {
      // The forward scan exists for real multi-line values. Narrowing the single-line test must not have
      // broken it — otherwise the fix trades one silent corruption for another.
      write(' FOCUS_A:0 "Alpha line one\n and line two\n and the end"\n FOCUS_B:0 "Bravo Focus"\n');
      await strip(["FOCUS_A"]);
      const after = read();
      rec("every line of the multi-line value is gone",
        !after.includes("Alpha line one") && !after.includes("and line two") && !after.includes("and the end"), after);
      rec("…and the entry after it is untouched", after.includes("FOCUS_B:0"), after);
    }

    console.log("\n[an escaped quote is not a closing quote]");
    {
      write(' FOCUS_A:0 "He said \\"hello\\" loudly"\n FOCUS_B:0 "Bravo Focus"\n');
      await strip(["FOCUS_A"]);
      rec("an escaped quote inside the value does not truncate the scan", has("FOCUS_B:0") && !has("FOCUS_A:0"), read());
    }

    console.log("\n[the corpus] trailing comments are ordinary, not exotic");
    {
      const DIRS = [
        ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/localisation/english"],
        ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/localisation/english"],
      ];
      const TRAILING = /^\s*[\p{L}\p{N}_.:-]+:\d*\s*".*"\s*#/u;
      let anyFound = false;
      for (const [label, dir] of DIRS) {
        let files = [];
        try { files = fs.readdirSync(dir).filter((f) => /_l_english\.yml$/i.test(f)).slice(0, 120); } catch (_) { continue; }
        let hits = 0;
        for (const f of files) {
          let t = "";
          try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
          for (const line of t.split(/\r?\n/)) if (TRAILING.test(line)) hits++;
        }
        console.log(`     ${label}: ${hits} lines with a trailing comment across ${files.length} files`);
        if (hits > 0) anyFound = true;
      }
      if (!anyFound) {
        console.log("     SKIPPED — no installed corpus to measure");
        rec("the corpus check is skipped only because the games are absent", true, "skipped");
      } else {
        rec("real localisation files carry trailing comments", anyFound, "none found");
      }
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== loc strip trailing comment: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
