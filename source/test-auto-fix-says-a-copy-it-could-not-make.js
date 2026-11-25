// ⛔ #an-auto-fix-hid-the-copies-it-could-not-make — AN AUTO-FIX WHOSE EVERY COPY FAILED USED TO SAY NOTHING AT ALL.
//
// autoFixMap reported its backup scope only `if (snap && snap.files)`: a click whose copies ALL failed (files 0, failed > 0) answered
// no backupSnapshot, which reads exactly like a click that wrote nothing — the Map Errors line said nothing about the copies, and
// 🌍 Generate a world, which stops rather than go on writing without copies (world-run.js copyFailuresOf), read 0 failures and went
// on to Redraw. Now the scope is reported when it copied anything OR failed to, backupSnapshotNote (map-rule-labels.js, the module
// both pages load) says the copies are missing, and the world stops after step 4.
//
// Fixture: a two-layer world with work for Auto-fix (two states with no category), and NOVA_HOME_DIR pointed at a FILE, so the
// scope's folder under it cannot be made and every copy fails (the trick test-a-backup-must-not-ship-with-the-mod.js uses).
// THE CONTROL: the same click with NOVA_HOME_DIR a folder takes its copies, and the world goes on.
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("auto-fix-copy-it-could-not-make");
const { createApp } = require("./server.js");
const L = require("./public/map-rule-labels.js");
const W = require("./world-run.js");
const WP = require("./testlib-world-page.js");
let modN = 0;
const makeMod = () => world.mod("Copy could not " + (++modN), {
  "history/states/2-B.txt": lib.st(2, "2 5", { category: "" }),
  "history/states/3-C.txt": lib.st(3, "3", { category: "" }),
});
const answer = (body, status = 200) => ({ status, json: async () => JSON.parse(JSON.stringify(body)) });

(async () => {
  let srv;
  const HOME = process.env.NOVA_HOME_DIR;
  const notADir = path.join(path.dirname(HOME), "home-is-a-file");
  try {
    srv = await lib.startServer(createApp);
    fs.writeFileSync(notADir, "not a folder\n");
    /** One Auto-fix click on a fresh mod, with NOVA_HOME_DIR as given (read per call by map-data's _novaHomeDir). */
    const click = async (home) => {
      const mod = makeMod();
      process.env.NOVA_HOME_DIR = home;
      try { return { mod, r: await srv.autoFix(mod) }; } finally { process.env.NOVA_HOME_DIR = HOME; }
    };
    /** runWorldSequence with every step but Auto-fix answered canned, and Auto-fix answered by `autoFixAnswer` (a real one). */
    const worldWith = async (autoFixAnswer) => {
      const sent = [];
      const fetchImpl = async (url, init) => {
        const u = String(url);
        sent.push(u.split("?")[0]);
        if (u === "/api/map/prepare-world") return answer({ ok: true, bitmapCopied: true, descriptorsWritten: [], backups: { dir: "", files: 0, failed: 0 } });
        if (u === "/api/map/blank-to-sea") return answer({ ok: true, changed: true });
        if (u.startsWith("/api/map/model")) return answer({ ok: true, provinces: [{ type: "sea" }, { type: "sea" }] });
        if (u === "/api/map/generate-land") return answer({ ok: true, flippedProvinces: 1, createdStates: 1, backups: { dir: "", files: 0, failed: 0 } });
        if (u === "/api/map/auto-fix") return answer(autoFixAnswer);
        if (u === "/api/map/rebuild-regions") return answer({ ok: true, summary: { nothingToWrite: true } });
        if (u.startsWith("/api/map/validate")) return answer({ ok: true, problems: [] });
        return answer({ ok: false, error: "unexpected " + u }, 404);
      };
      let thrown = null;
      try { await W.runWorldSequence({ base: "", modPath: "M", choices: { landShare: 35, seed: 1 }, fetchImpl }); } catch (e) { thrown = e; }
      return { sent, thrown };
    };

    console.log("1. every copy fails: the click says so, and the world stops after it");
    const { r } = await click(notADir);
    const fx = (r.body && r.body.fixes) || {};
    const snap = fx.backupSnapshot;
    rec("THE CONTROL: the click ran and really wrote (a category on both states)", r.status === 200 && r.body.ok === true && ((fx.categories || {}).count || 0) === 2, { status: r.status, categories: fx.categories });
    rec("⭐⭐ the answer carries backupSnapshot, with files 0 and failed ≥ 1", !!snap && Number(snap.files) === 0 && Number(snap.failed) >= 1, snap || null);
    const note = L.backupSnapshotNote(fx);
    const n = snap ? Number(snap.failed) : 0;
    rec("⭐ backupSnapshotNote says the copies are missing, in its own words", note === ` ⚠ Nova could not copy the ${n} file${n === 1 ? "" : "s"} it changed before changing ${n === 1 ? "it" : "them"}, so ${n === 1 ? "it has" : "they have"} no copy outside your mod.`, note);
    const page = WP.worldPage({ fetch: async () => { throw new Error("no fetch"); }, timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} } });
    rec("…and the world's Auto-fix line carries it (the popup's own summary)", page.sb.worldStepNote("autofix", r.body).endsWith(note) && note.length > 0, page.sb.worldStepNote("autofix", r.body).slice(-300));
    rec("⭐ copyFailuresOf(\"autofix\") counts them", W.copyFailuresOf("autofix", r.body) === n && n > 0, W.copyFailuresOf("autofix", r.body));
    const stopped = await worldWith(r.body);
    rec("⭐⭐ …so the world stops at step 4, with the copy-failure message", !!stopped.thrown && stopped.thrown.step === "autofix" && stopped.thrown.message === W.COPY_FAILED(n), stopped.thrown && { step: stopped.thrown.step, message: stopped.thrown.message });
    rec("⭐⭐ …and sends nothing after it (no Redraw, no check)", stopped.sent[stopped.sent.length - 1] === "/api/map/auto-fix" && !stopped.sent.includes("/api/map/rebuild-regions"), stopped.sent);

    console.log("\nTHE CONTROL: NOVA_HOME_DIR a folder — the copies are taken and the world goes on");
    const ok = await click(HOME);
    const s2 = ok.r.body && ok.r.body.fixes && ok.r.body.fixes.backupSnapshot;
    rec("THE CONTROL: files ≥ 1, failed 0", !!s2 && Number(s2.files) >= 1 && Number(s2.failed || 0) === 0, s2 || null);
    rec("THE CONTROL: …the note names the folder, not a missing copy", /A copy of/.test(L.backupSnapshotNote(ok.r.body.fixes)) && !/could not copy/.test(L.backupSnapshotNote(ok.r.body.fixes)), L.backupSnapshotNote(ok.r.body.fixes));
    const goes = await worldWith(ok.r.body);
    rec("THE CONTROL: …and the world goes on past step 4 to its end", !goes.thrown && goes.sent.includes("/api/map/rebuild-regions") && goes.sent[goes.sent.length - 1] === "/api/map/validate", { thrown: goes.thrown && goes.thrown.message, sent: goes.sent });
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  } finally {
    process.env.NOVA_HOME_DIR = HOME;
    try { if (srv) srv.close(); } catch (_) {}
    try { world.cleanup && world.cleanup(); } catch (_) {}
  }
  console.log(`\n=== an Auto-fix says a copy it could not make: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
