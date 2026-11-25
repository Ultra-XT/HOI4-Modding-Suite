// ⛔ #map-writers-had-no-owner — safeModWrite MOVED FILES, AND FIVE TESTS WERE PINNED TO WHERE IT LIVED.
//
// safeModWrite, renameOverWithRetry, matchExistingLineEndings and the backup bookkeeping moved out of
// server.js into safe-write.js, so map-data.js could require the SAME writer instead of keeping ~50 raw
// writes of its own. Five test files broke on that move — every one of them by reading server.js and
// grepping for the function's text. Not one was testing the behaviour; they were testing an address.
//
// So this file tests the CONTRACT, on disk, through the module's public entry point. It is the control for
// the whole extraction: if safe-write.js ever stops backing up, stops being atomic, mangles a Buffer or
// ignores the guard server.js hands it, the source-scanning tests elsewhere would still pass.
//
// ⚠️ Binary matters here specifically. provinces.bmp is one of the writes being converted, and a comment in
// server.js claims safeModWrite "is utf8-only, so it would mangle binary". Measured below: it does not.
// matchExistingLineEndings returns non-strings untouched and fs.writeFileSync ignores an encoding argument
// for a Buffer. That claim is why a second, unbacked write path for binaries looked necessary.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const sw = require("./safe-write.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 240) : "")); }
};

// ⛔ This test WRITES BACKUPS. run-tests.js hands every run a private APPDATA / XDG_CONFIG_HOME precisely so
// a suite can never file its fixtures' backups beside the user's real ones — 797 cache entries and 400 junk
// backups in the user's own NovaModdingSuite is the accident that bought that sandbox. If the sandbox is not
// in effect, refuse rather than pollute it.
const REAL = path.join(os.homedir() || "", "AppData", "Roaming", "NovaModdingSuite");
if (path.resolve(sw.NOVA_APP_DATA_DIR).toLowerCase() === path.resolve(REAL).toLowerCase()) {
  console.log("  ..   skipped: not running under a private app-data dir, and this test writes backups");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-extracted-writer-"));
  try {
    console.log("\n-- a text write: backed up, atomic, and line endings kept --");
    {
      const f = path.join(tmp, "states.txt");
      fs.writeFileSync(f, "state = {\r\n\tid = 1\r\n}\r\n", "utf8");
      const bp = sw.safeModWrite(f, "state = {\n\tid = 2\n}\n", "extracted-writer-probe");
      const after = fs.readFileSync(f, "utf8");
      ok(after.includes("id = 2"), "the new content landed", after.slice(0, 40));
      ok(after.indexOf("\r\n") !== -1, "CRLF is preserved on a CRLF file");
      ok((after.match(/[^\r]\n/g) || []).length === 0,
        "…with no lone-LF pocket, which is where the next anchored edit would silently match nothing");
      ok(!!bp && fs.existsSync(bp), "a backup exists", bp);
      ok(fs.readFileSync(bp, "utf8").includes("id = 1"), "…holding the ORIGINAL content, not the new one");
      ok(fs.readdirSync(tmp).filter((n) => n.includes(".tmp-")).length === 0,
        "no .tmp- litter is left beside the modder's own files", fs.readdirSync(tmp));
    }

    console.log("\n-- a Buffer survives, which is what provinces.bmp needs --");
    {
      // 0x0d 0x0a inside the bytes is deliberate: a CRLF-matching pass that treated this as text would
      // rewrite image data. This is the exact case the map converter depends on.
      const b = path.join(tmp, "provinces.bmp");
      const orig = Buffer.from([0x42, 0x4d, 0x00, 0xff, 0x0d, 0x0a, 0xfe]);
      const next = Buffer.from([0x42, 0x4d, 0x01, 0xee, 0x0d, 0x0a, 0xff]);
      fs.writeFileSync(b, orig);
      const bp = sw.safeModWrite(b, next, "extracted-writer-bmp");
      ok(Buffer.compare(fs.readFileSync(b), next) === 0,
        "the Buffer is written byte-for-byte, CRLF bytes and all", fs.readFileSync(b).toString("hex"));
      ok(!!bp && Buffer.compare(fs.readFileSync(bp), orig) === 0, "…and its backup is byte-exact");
    }

    console.log("\n-- the guard server.js hands over actually refuses --");
    {
      // safe-write.js defaults assertWritable to a no-op, because only server.js knows where HOI4 is
      // installed and whether the user ticked "allow editing vanilla files". A default that silently
      // permits is only safe if the real one is genuinely wired and genuinely bites. Prove it bites.
      const g = path.join(tmp, "Hearts of Iron IV", "x.txt");
      fs.mkdirSync(path.dirname(g), { recursive: true });
      fs.writeFileSync(g, "before", "utf8");
      sw.configure({ assertWritable: (p) => { if (String(p).includes("Hearts of Iron IV")) throw new Error("refused"); } });
      let threw = false;
      try { sw.safeModWrite(g, "after", "extracted-writer-guard"); } catch (_) { threw = true; }
      ok(threw, "a registered guard refuses the write");
      ok(fs.readFileSync(g, "utf8") === "before", "…and the file on disk is untouched");
      ok(fs.readdirSync(path.dirname(g)).filter((n) => n.includes(".tmp-")).length === 0,
        "…leaving no temp file behind either", fs.readdirSync(path.dirname(g)));
      sw.configure({ assertWritable: () => {} });
    }

    console.log("\n-- a bulk map fix cannot evict the user's other backups --");
    {
      // #map-fix-floods-the-backup-window — every installed map mod carries 1,143-1,524 state files, and a
      // map operation is bulk by nature: renumbering one state rewrites every file that references it. Under
      // a single 200-file cap, one auto-fix click would push out every backup the user had of their maker
      // work. Mod Health has already been bitten by precisely this (3,114 backups against the cap). So map
      // backups get their own window, the same way temp-fixture backups already do.
      const cap = 5;                                   // small, so the flood is cheap to stage
      const dir = sw.BACKUP_DIR;
      fs.mkdirSync(dir, { recursive: true });
      for (const n of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, n)); } catch (_) {} }

      // One precious maker backup, then a flood of map ones.
      const mk = (reason, i) => {
        const p = path.join(dir, `2026-09-05T00-00-${String(i).padStart(2, "0")}-000Z__${reason}__D____mod__f${i}.txt`);
        fs.writeFileSync(p, "x", "utf8");
        return p;
      };
      const precious = mk("spirit-save", 1);
      for (let i = 10; i < 40; i++) mk("map-renumberStateId", i);
      sw.pruneBackups(cap);

      const left = fs.readdirSync(dir);
      ok(fs.existsSync(precious), "the maker's own backup survives a 30-file map flood",
        { left: left.length, sample: left.slice(0, 3) });
      const mapLeft = left.filter((n) => n.split("__")[1].startsWith("map-")).length;
      ok(mapLeft === cap, `…and the map pool is capped on its own (${mapLeft}, expected ${cap})`, left);
      const otherLeft = left.filter((n) => !n.split("__")[1].startsWith("map-")).length;
      ok(otherLeft === 1, "…while the non-map pool keeps its own window", otherLeft);
      for (const n of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, n)); } catch (_) {} }
    }

    console.log("\n-- server.js really does register both halves --");
    {
      // The two hooks are the only things safe-write.js cannot do for itself. Asserted here as SOURCE
      // because requiring server.js starts a listener; test-mod-writes-have-one-owner.js checks the same
      // pair, and two cheap checks of a wire that silently disables a guard is the right number.
      const srv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      // ⚠️ Derive the registered name; pinning `assertPathNotInGameRoot` literally broke the day the guard
      // grew a second refusal behind a wrapper — a strengthening that read as a regression in three tests at
      // once. What matters is that something real is wired up and that it reaches the vanilla refusal.
      // #nova-wrote-into-the-hoi4-user-folder
      const wired = (srv.match(/assertWritable:\s*([A-Za-z0-9_$]+)\s*,/) || [])[1] || "";
      ok(!!wired && wired !== "undefined",
        "assertWritable is the real vanilla-directory guard", "configure() never registered it");
      ok(!!wired && new RegExp("function\\s+" + wired + "\\b[\\s\\S]{0,800}?assertPathNotInGameRoot").test(srv),
        "…and it still reaches the vanilla-directory refusal", `the registered guard (${wired}) does not`);
      ok(/afterWrite:\s*invalidateModIndexCache,/.test(srv),
        "afterWrite really invalidates the mod index", "Home would serve counts from before the write");
    }

    console.log("\n-- …and configure() actually RUNS, which the source check cannot tell you --");
    {
      // ⭐ A SOURCE ASSERTION IS NOT A RUNTIME ONE. `assertWritable: assertPathNotInGameRoot` can sit in the
      // file, spelled perfectly, inside a configure() call that is never reached — dead code under a branch,
      // or below an early return. The check above would pass and every map write would skip the vanilla
      // refusal. So load server.js for real (it exports createApp and does not listen on require), then ask
      // the module it configured whether the door is shut.
      require("./server.js");                     // runs safeWrite.configure(...) at module scope
      const live = require("./safe-write.js");    // same module instance, now configured
      // assertPathNotInGameRoot only fires for a resolvable install. If HOI4 is not installed here there is
      // nothing to refuse, and saying so beats a green tick that means nothing.
      const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      if (!fs.existsSync(path.join(V, "hoi4.exe"))) {
        console.log("  ..   skipped: the game is not installed at the expected path, so there is nothing to refuse");
      } else {
        const target = path.join(V, "common", "nova_should_never_write_here.txt");
        let threw = false, msg = "";
        try { live.safeModWrite(target, "no", "extracted-writer-live-guard"); }
        catch (e) { threw = true; msg = String(e && e.message); }
        ok(threw, "a live server refuses a write into the vanilla install", msg.slice(0, 120));
        ok(/vanilla Hearts of Iron IV directory/i.test(msg),
          "…with the guard's own explanation, so it is that guard and not an unrelated error", msg.slice(0, 160));
        ok(!fs.existsSync(target), "…and nothing was created in the game folder", target);
        // ⚠️ CLEAN UP AFTER A FAILURE. The only way to prove a refusal is to attempt the write, so when the
        // guard is off — a regression, or someone backing it out to check this test bites — the file really
        // does land in the user's game install. Leaving it there means a test that reports the problem and
        // also causes it. Take the litter back out, including any temp file a partial write left.
        for (const p of [target, ...fs.readdirSync(path.dirname(target))
          .filter((n) => n.startsWith("nova_should_never_write_here.txt.tmp-"))
          .map((n) => path.join(path.dirname(target), n))]) {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* read-only install: nothing to undo */ }
        }
      }
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
