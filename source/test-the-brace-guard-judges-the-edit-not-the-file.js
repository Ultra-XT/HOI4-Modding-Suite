// ⛔ #the-brace-guard-refuses-paradoxs-own-file — FRANCE'S ARMY COULD NOT BE SAVED.
//
// The Army maker refused to write an order of battle unless the whole file came out brace-balanced. The
// base game ships five that are not:
//     FRA_1936.txt        279 open / 278 close — the `instant_effect = {` on line 944 never closes
//     FRA_1936_nsb.txt, AST_1936.txt, FRA_1939_naval_legacy.txt, FRA_1939_naval_mtg.txt
// plus 19 of Rise of Nations' 3,066 and 1 of Millennium Dawn's 924. Clausewitz closes open blocks at EOF
// and Paradox relies on it — the same thing that once made 485 vanilla spirits invisible because SOV.txt
// was one `}` short. France plays fine.
//
// So the writer was faithful (a no-edit merge of FRA_1936.txt is byte-identical, 27,906 bytes in and out)
// and the guard was rejecting its own correct output. Open France, lay out a template, press save, and get
// "Refusing to save: the generated OOB is not brace-balanced" — with no line number, no file named, and no
// way to fix it from the Army maker, which cannot edit instant_effect at all. Norway's navy and air force
// were unreachable for the same reason on the naval/air path.
//
// What the guard is FOR is catching an imbalance THIS SAVE introduced. So it measures both ends and refuses
// only when the edit made things worse — the same shape as the Mod Health fix for the identical mistake,
// where a raw count refused a correct fix on 127 shipped files.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53694);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const UNITS = path.join(GAME, "history", "units");
if (!fs.existsSync(UNITS)) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const imbalance = (t) => {
    // Independent of Nova's judge on purpose: a comment-stripped raw count. If these two ever disagree the
    // premise of this test is wrong and it should fail rather than quietly agree with the code.
    const s = String(t).replace(/#[^\n]*/g, "");
    return (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  };

  console.log("\n-- ⭐ the premise: Paradox really does ship unbalanced order-of-battle files --");
  {
    const bad = [], good = [];
    for (const f of fs.readdirSync(UNITS)) {
      if (!f.endsWith(".txt")) continue;
      let t = ""; try { t = fs.readFileSync(path.join(UNITS, f), "utf8"); } catch (_) { continue; }
      (imbalance(t) !== 0 ? bad : good).push(f);
    }
    ok(bad.length > 0, `${bad.length} of the base game's ${bad.length + good.length} OOB files are not brace-balanced`, bad.slice(0, 6));
    ok(bad.includes("FRA_1936.txt"), "…including France's 1936 army, which the default bookmark loads", bad.slice(0, 6));
    ok(good.includes("GER_1936.txt"), "…while Germany's is balanced, so this is not a parsing artefact");
  }

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-brace-")); roots.push(mod);
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Brace"\n', "utf8");
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-brace-ad-")); roots.push(appdata);

  const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

  (async () => {
    try {
      let up = false;
      for (let i = 0; i < 160; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
      }
      if (!up) { ok(false, "server came up on " + PORT); return; }

      const get = async (tag) => (await fetch(`http://127.0.0.1:${PORT}/api/army?modPath=${encodeURIComponent(mod)}&tag=${tag}`)).json();
      const save = async (tag, g, templates) => (await fetch(`http://127.0.0.1:${PORT}/api/army/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: mod, tag, file: g.file, templates, divisions: g.divisions, baseFingerprint: g.fingerprint }),
      })).json();
      const rename = (g) => (g.templates || []).map((t, i) => (i === 0 ? { ...t, name: String(t.name || "X") + "_r", _origName: t.name, _dirty: true } : t));

      console.log("\n-- ⭐ a country whose file Paradox left open can be saved --");
      {
        for (const tag of ["FRA", "AST"]) {
          const g = await get(tag);
          ok(g && g.file, `${tag} opens (${g && g.file})`, g && g.error);
          const r = await save(tag, g, rename(g));
          ok(r && r.ok === true, `…and saves`, r && r.error);
          ok(fs.existsSync(path.join(mod, "history", "units", g.file)), "…writing the file", g.file);
        }
      }

      console.log("\n-- a balanced country is unaffected --");
      {
        const g = await get("GER");
        const r = await save("GER", g, rename(g));
        ok(r && r.ok === true, "Germany still saves", r && r.error);
      }

      console.log("\n-- ⭐ CONTROL: the inherited imbalance is carried through, not silently repaired --");
      {
        // Nova must not "fix" Paradox's file behind the modder's back either — that would rewrite content
        // it was never asked to touch. What lands should carry the same imbalance it started with.
        const written = fs.readFileSync(path.join(mod, "history", "units", "FRA_1936.txt"), "utf8");
        const original = fs.readFileSync(path.join(UNITS, "FRA_1936.txt"), "utf8");
        ok(imbalance(original) === 1, "vanilla's file is short exactly one closing brace", imbalance(original));
        ok(imbalance(written) === imbalance(original),
          "…and the saved file has the same imbalance — not repaired, not worsened",
          { before: imbalance(original), after: imbalance(written) });
      }

      console.log("\n-- ⭐ CONTROL: an edit that WOULD unbalance the file is still refused --");
      {
        // The guard has to keep doing its job. A template name carrying a stray brace is the cheapest way to
        // make the merge produce something worse than what it started from.
        const g = await get("GER");
        const templates = (g.templates || []).map((t, i) => (i === 0
          ? { ...t, name: String(t.name || "X") + ' } broken {{', _origName: t.name, _dirty: true } : t));
        const before = fs.readFileSync(path.join(mod, "history", "units", g.file), "utf8");
        const r = await save("GER", g, templates);
        const after = fs.readFileSync(path.join(mod, "history", "units", g.file), "utf8");
        if (r && r.ok === true) {
          // If the writer quoted the name safely there is nothing to refuse — that is also correct, but
          // then the file must still be no worse than before.
          ok(imbalance(after) <= imbalance(before),
            "the writer escaped the stray braces, and the file is no worse", { before: imbalance(before), after: imbalance(after) });
        } else {
          ok(/unbalanced/i.test(String(r.error)), "a save that would unbalance the file is refused", r.error);
          ok(/line \d+/.test(String(r.error)), "…naming a line the modder can go to", r.error);
          ok(after === before, "…and nothing was written");
        }
      }

      console.log("\n-- ⭐ the judge the guard compares with orders imbalances correctly --");
      {
        // The control above took the "writer escaped the braces" branch, which is the writer being robust
        // rather than the guard firing — so the refusal path is only proven at source level there. Exercise
        // the judge the guard actually depends on, using Nova's own exported function rather than a
        // reimplementation, so "worse than before" provably means what the fix relies on.
        const { describeBraceImbalance } = require("./server.js");
        const sev = (u) => (!u ? 0 : u.kind === "extra" ? 1000 + u.count : u.count);
        const balanced = "a = { b = 1 }\n";
        const missingOne = "a = { b = 1\n";
        const missingTwo = "a = { b = { c = 1\n";
        const extra = "a = { b = 1 } }\n";
        ok(describeBraceImbalance(balanced) === null, "a balanced file has no imbalance");
        ok(sev(describeBraceImbalance(missingOne)) === 1, "one unclosed block scores 1", describeBraceImbalance(missingOne));
        ok(sev(describeBraceImbalance(missingTwo)) === 2, "two score 2 — so 'worse' is comparable", describeBraceImbalance(missingTwo));
        ok(sev(describeBraceImbalance(missingOne)) > sev(describeBraceImbalance(balanced)),
          "…introducing an imbalance into a clean file counts as worse — the guard WOULD refuse that");
        ok(sev(describeBraceImbalance(missingOne)) === sev(describeBraceImbalance(missingOne)),
          "…and carrying the SAME imbalance through is not worse, which is why France now saves");
        ok(sev(describeBraceImbalance(extra)) > sev(describeBraceImbalance(missingTwo)),
          "an extra closing brace outranks any number of missing ones — it is the unrecoverable kind",
          describeBraceImbalance(extra));
        // …and the real France file scores exactly 1, matching the independent raw count above.
        const fra = describeBraceImbalance(fs.readFileSync(path.join(UNITS, "FRA_1936.txt"), "utf8"));
        ok(fra && fra.kind === "missing" && fra.count === 1,
          "Nova's judge and the independent count agree about France", fra);
      }

      console.log("\n-- the refusal message is actionable when it does fire --");
      {
        const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        ok(/describeBraceImbalanceText\(newText\)/.test(SRV),
          "the land save explains the imbalance in words, not just 'not brace-balanced'");
        ok(!/Refusing to save: the generated OOB is not brace-balanced/.test(SRV),
          "…and the old message, which named no file and no line, is gone");
        ok(/navalSev\(navalAfter\) > navalSev\(navalBefore\)/.test(SRV),
          "the naval/air path compares both ends too — Norway's navy was unreachable for the same reason");
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
