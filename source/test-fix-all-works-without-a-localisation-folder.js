// ⛔ #fix-all-crashed-when-the-loc-folder-did-not-exist — "FIX ALL" DIED ON A MOD THAT HAD NO
// localisation/english/ DIRECTORY, WHILE THE PER-CARD BUTTON FIXED THE IDENTICAL PROBLEM.
//
// Found by a known-answer fault-injection experiment: a scratch mod was built with one unlocalised idea and
// no localisation folder at all. The batch endpoint answered
//
//   {"error":"ENOENT: no such file or directory, open '…/custom_nova_l_english.yml.tmp-7144-…'"}
//
// and the single-problem endpoint answered {"ok":true} and wrote the file.
//
// chooseLocalisationTarget falls back to localisation/english/custom_nova_l_english.yml, and safeModWrite
// opens "<target>.tmp-…" without creating the parent. The single-problem path has always called
// fs.mkdirSync(path.dirname(target), {recursive:true}) first — its branch is even commented "Shared with
// the batch endpoint so a key lands in the same file either way", so parity was the intent and one line
// never made it across. That is this codebase's most common bug shape: the fix already exists next door and
// one caller never adopted it.
//
// It is not an exotic case. Every mod that keeps its .yml files directly in localisation/ rather than in
// localisation/english/ has no such directory — and three of the installed corpus's mods do exactly that.
//
// The second half: the throw escaped to the request's outer catch, so a batch that had ALREADY written
// earlier files reported a flat failure. The user is told nothing happened and their mod has changed. A
// write failure is now reported against that one file's edits and the rest of the run still lands.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53688);

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const roots = [];
const mkMod = (extra) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nolocdir-"));
  roots.push(root);
  const W = (rel, body) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  };
  W("descriptor.mod", 'version="1.0"\nname="No Loc Folder"\nsupported_version="1.17.*"\n');
  W("common/country_tags/00_countries.txt", 'TOR = "countries/Torvia.txt"\n');
  W("common/ideas/zz_ideas.txt", `ideas = {
	country = {
		zz_unlocalised_spirit = {
			picture = generic_industrial_bonus
			modifier = { political_power_gain = 0.1 }
		}
	}
}
`);
  W("history/countries/TOR - Torvia.txt", "capital = 1\n\nadd_ideas = {\n\tzz_unlocalised_spirit\n}\n");
  if (extra) extra(root, W);
  return root;
};

const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nolocdir-appdata-"));
roots.push(appdata);
const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(PORT), APPDATA: appdata },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

const post = async (route, body) => (await fetch(`http://127.0.0.1:${PORT}${route}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})).json();
const scan = async (root) => (await fetch(`http://127.0.0.1:${PORT}/api/mod/index?fresh=1&modPath=${encodeURIComponent(root)}`)).json();

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 120; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    console.log("\n-- a mod whose localisation/english/ folder does not exist --");
    {
      const root = mkMod();
      ok(!fs.existsSync(path.join(root, "localisation")), "precondition: the mod has no localisation folder at all");
      const probs = ((await scan(root)).problems || []).filter((p) => p.rule === "missing_localization");
      ok(probs.length >= 1, "the unlocalised idea is reported", probs.length);

      const res = await post("/api/modhealth/fix-batch", { modPath: root, problems: probs });
      ok(!res.error, "Fix all does not fail outright", res.error);
      ok(res.fixed >= 1, "…it reports the repair", res);
      const target = path.join(root, "localisation", "english", "custom_nova_l_english.yml");
      ok(fs.existsSync(target), "…and the localisation file it chose was actually created");
      const txt = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      ok(/zz_unlocalised_spirit/.test(txt), "…with the key written into it", txt.slice(0, 120));
      ok(txt.charCodeAt(0) === 0xFEFF, "…and a BOM, as HOI4 needs");

      const after = ((await scan(root)).problems || []).filter((p) => p.rule === "missing_localization");
      ok(after.length < probs.length, "…and the problem is gone on a rescan", { before: probs.length, after: after.length });
    }

    console.log("\n-- the same mod, through the per-card button: unchanged behaviour --");
    {
      const root = mkMod();
      const probs = ((await scan(root)).problems || []).filter((p) => p.rule === "missing_localization");
      const res = await post("/api/modhealth/fix", { modPath: root, problem: probs[0] });
      ok(res.ok === true, "the single-problem endpoint still works", res);
      ok(fs.existsSync(path.join(root, "localisation", "english", "custom_nova_l_english.yml")), "…and still creates the file");
    }

    console.log("\n-- one unwritable file must not sink the whole run --");
    {
      // localisation/english is a FILE, so creating the directory under it fails. Everything else in the
      // batch must still be repaired, and the failure must be reported against that file rather than as a
      // flat "the batch failed" with earlier writes already on disk.
      // The other file must NOT be named *_l_english.yml, or chooseLocalisationTarget picks it and nothing
      // is blocked at all — which is what this test did on its first run, and is itself worth knowing:
      // the chooser prefers an existing flat localisation/*_l_english.yml over creating the english/ folder.
      const root = mkMod((r, W) => {
        W("localisation/zz_notloaded.yml", "l_english:\n zz_other_key:0 \"Something\"\n"); // no BOM → its own fixable problem
      });
      fs.mkdirSync(path.join(root, "localisation"), { recursive: true });
      fs.writeFileSync(path.join(root, "localisation", "english"), "not a directory", "utf8");

      const all = (await scan(root)).problems || [];
      const targets = all.filter((p) => p.file && (p.rule === "missing_localization" || p.rule === "loc_missing_bom"));
      ok(targets.length >= 2, "there is a fixable problem in a writable file AND one needing the blocked folder", targets.map((t) => t.rule));

      const res = await post("/api/modhealth/fix-batch", { modPath: root, problems: targets });
      ok(!res.error, "the batch reports a result rather than throwing", res.error);
      ok((res.failed || 0) >= 1, "…the unwritable file is reported as failed", res);
      ok((res.fixed || 0) >= 1, "…and the writable one was still repaired", res);
      const bom = fs.readFileSync(path.join(root, "localisation", "zz_notloaded.yml"), "utf8");
      ok(bom.charCodeAt(0) === 0xFEFF, "…really repaired, on disk");
      const failedRow = (res.results || []).find((r) => r.error);
      ok(failedRow && /could not write/i.test(String(failedRow.error)), "…with a message naming the file, not a bare stack", failedRow);
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
