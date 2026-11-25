// #write-lock-gives-up-instantly — RIDE OUT A MOMENTARY LOCK; FAIL A PERMANENT ONE PROMPTLY.
//
// safeModWrite writes to a temp file and renames it over the target. On EPERM/EACCES/EBUSY it produced a
// good, honest error — and gave up on the first attempt. Its own comment already named the causes:
//
//   "All three causes are ordinary: Steam workshop content is frequently read-only, HOI4 holds files while
//    running, and antivirus or a sync client can lock a file FOR A MOMENT."
//
// Two of those are permanent and no retry helps. The third is momentary, and losing the author's save to it
// is avoidable. On Windows with real-time antivirus — most users — this is a live failure mode: it surfaced
// three times in this project's own suite, on three unrelated files (countrytechtreeview.gui, zzdollar.txt,
// and the startup-toggle file), each passing when run alone. Three "flaky tests" were one real bug.
//
// The two halves pull against each other, so both are pinned here:
//   * a transient lock must NOT lose the save;
//   * a genuinely read-only file must still fail, and fail FAST — a retry ladder that made the UI feel hung
//     would be a worse bug than the one being fixed.
//
// The lock is simulated by making fs.renameSync fail: server.js holds the same `fs` module object this test
// does, so patching the method is seen by the code under test. That is the only way to exercise it — a real
// antivirus lock cannot be summoned on demand.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lockretry-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const n = "LR" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="' + n + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}

// ── the simulated lock ───────────────────────────────────────────────────────
const realRename = fs.renameSync;
let lock = null; // { match, failures, code, seen }
fs.renameSync = function (from, to) {
  if (lock && String(to).toLowerCase().includes(lock.match)) {
    lock.seen++;
    if (lock.failures === Infinity || lock.seen <= lock.failures) {
      const e = new Error("simulated lock on " + path.basename(String(to)));
      e.code = lock.code || "EPERM";
      throw e;
    }
  }
  return realRename.apply(fs, arguments);
};
const withLock = (match, failures, code) => { lock = { match: match.toLowerCase(), failures, code, seen: 0 }; return lock; };
const clearLock = () => { const l = lock; lock = null; return l; };

let PORT = 50330;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      save: (b) => fetch("http://127.0.0.1:" + PORT + "/api/decisions/save", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const decision = (mod, id) => ({
  modPath: mod, categoryId: "lr_cat", id, name: "Lock Retry " + id, cost: "10", decisionType: "standard",
});

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[no lock] the ordinary path is untouched");
    {
      const mod = mkMod();
      const r = await api.save(decision(mod.dir, "lr_plain"));
      rec("the save succeeds", r.ok === true, r);
      rec("…and the file is on disk",
        fs.existsSync(path.join(mod.dir, "common", "decisions", "lr_cat.txt")), "not written");
    }

    console.log("\n[a momentary lock] the save is NOT lost");
    for (const code of ["EPERM", "EBUSY", "EACCES"]) {
      const mod = mkMod();
      const l = withLock("lr_cat.txt", 2, code); // two refusals, then it lets go
      const r = await api.save(decision(mod.dir, "lr_" + code.toLowerCase()));
      clearLock();
      rec(`${code}: the save rides it out`, r.ok === true, r);
      rec(`…${code}: and the rename really was refused first`, l.seen >= 3, { attempts: l.seen });
      rec(`…${code}: with the content on disk`,
        /lr_cat\s*=/.test(String(fs.existsSync(path.join(mod.dir, "common", "decisions", "lr_cat.txt"))
          ? fs.readFileSync(path.join(mod.dir, "common", "decisions", "lr_cat.txt"), "utf8") : "")), "not written");
    }

    console.log("\n[a lock that never lets go] still fails, and fails FAST");
    {
      const mod = mkMod();
      const l = withLock("lr_cat.txt", Infinity, "EPERM");
      const t0 = Date.now();
      const r = await api.save(decision(mod.dir, "lr_forever"));
      const ms = Date.now() - t0;
      clearLock();
      rec("the save is refused", r.ok !== true, r);
      rec("…with the message that names the real causes",
        /read-only or in use by another program/.test(String(r.error || "")), r.error);
      rec("…and it gave up rather than retrying forever", l.seen <= 6, { attempts: l.seen });
      rec("…promptly enough that the UI does not feel hung", ms < 3000, { ms });
      rec("…leaving no temp file behind",
        !fs.readdirSync(path.join(mod.dir, "common", "decisions")).some((f) => f.includes(".tmp-")),
        fs.readdirSync(path.join(mod.dir, "common", "decisions")));
    }

    console.log("\n[a different failure] is not retried or disguised");
    {
      const mod = mkMod();
      const l = withLock("lr_cat.txt", Infinity, "ENOSPC"); // out of disk — retrying is pointless
      const r = await api.save(decision(mod.dir, "lr_nospc"));
      clearLock();
      rec("the save is refused", r.ok !== true, r);
      rec("…on the FIRST attempt, with no retry ladder", l.seen === 1, { attempts: l.seen });
      rec("…and the real error is not replaced by the lock message",
        !/read-only or in use/.test(String(r.error || "")), r.error);
    }

    console.log("\n[the shape of the fix]");
    {
      // #map-writers-had-no-owner — renameOverWithRetry moved into safe-write.js with safeModWrite. Read
      // both: the ladder lives there now, and /api/save (which shares it) is still in server.js.
      const SRV = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the ladder is short and bounded", /const RENAME_RETRY_MS = \[15, 40, 90, 200\];/.test(SRV), "ladder changed");
      rec("…and only transient codes are retried",
        /const transient = err && \(err\.code === "EPERM" \|\| err\.code === "EACCES" \|\| err\.code === "EBUSY"\);/.test(SRV),
        "the transient test changed");
      rec("…and the wait parks the thread instead of spinning",
        /Atomics\.wait\(new Int32Array\(new SharedArrayBuffer\(4\)\), 0, 0, ms\)/.test(SRV), "spin loop is back");
    }

    api.stop(); api = null;
    console.log(`\n=== write lock retry: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    fs.renameSync = realRename;
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
