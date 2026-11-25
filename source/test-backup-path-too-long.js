// #backup-path-too-long — the one save failure a modder cannot possibly diagnose.
//
// /api/save backs up what it is about to replace, and a backup filename embeds the SOURCE's whole path
// (that is what makes a backup traceable, and what lets temp-mod backups sit on their own quota). A deep
// mod folder therefore produces one very long filename. Windows caps a path at 260 unless LongPathsEnabled
// is set, which most machines do not have.
//
// Refusing the save is correct: writing without first backing up what you replace is worse. What was wrong
// is what the modder saw — a raw
//
//     ENAMETOOLONG: name too long, open 'C:\Users\…\AppData\Roaming\NovaModdingSuite\backups\2026…'
//
// naming a folder they have never heard of, saying nothing about the actual cause, which is that their mod
// lives too deep. They cannot save, and have no way to work out why.
//
// This is not theoretical. On the machine this was found on, a mod under
// OneDrive\Documents\Paradox Interactive\Hearts of Iron IV\mod\ already reaches 245 of the 260 characters —
// about one long file name of headroom. It did not fail there only because that machine has
// LongPathsEnabled=1, so the failure has to be simulated to be tested at all.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-baklen-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BakLen"\nsupported_version="1.18.*"\n');
const FILE = path.join(MOD, "common", "national_focus", "tree.txt");
const TREE = "focus_tree = {\n\tid = bl_tree\n\tcountry = { factor = 0 }\n\tfocus = {\n\t\tid = bl_focus\n\t\ticon = GFX_focus_generic_treaty\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t\tcompletion_reward = { add_political_power = 10 }\n\t}\n}\n";

// Fail only writes into the backups folder — exactly what a default Windows machine does when the name
// goes over 260, without needing a 260-character path to exist in the test.
const realWrite = fs.writeFileSync;
let failBackups = false;
fs.writeFileSync = function (p, ...rest) {
  if (failBackups && /[\\/]backups[\\/]/.test(String(p))) {
    const e = new Error("ENAMETOOLONG: name too long, open '" + String(p).slice(0, 50) + "'");
    e.code = "ENAMETOOLONG";
    throw e;
  }
  return realWrite.call(this, p, ...rest);
};

const PORT = 39671, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (content) => fetch("http://127.0.0.1:" + PORT + "/api/save", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: FILE, content }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 1300)); // the endpoint rate-limits

  try {
    // ── a normal save still works, so the checks below are not passing for the wrong reason ───────
    realWrite.call(fs, FILE, TREE, "utf8");
    await breathe();
    const good = await save(TREE.replace("= 10", "= 15"));
    ok("a normal save succeeds", good.s === 200, good.b);
    ok("…and its backup is reported", !!(good.b && good.b.backupPath), good.b);

    // ── now the backup cannot be written ──────────────────────────────────────────────────────────
    failBackups = true;
    const before = fs.readFileSync(FILE, "utf8");
    await breathe();
    const bad = await save(TREE.replace("= 10", "= 99"));
    const msg = String((bad.b && bad.b.error) || "");

    ok("the save is refused rather than done without a backup", bad.s === 400, bad.b);
    ok("…the file on disk is untouched, byte for byte", fs.readFileSync(FILE, "utf8") === before, "file changed");
    ok("…the message no longer leaks a raw ENAMETOOLONG", !/ENAMETOOLONG/.test(msg), msg);
    ok("…it says nothing was written", /Nothing was written/i.test(msg), msg);
    ok("…it names the real cause: the name is too long", /too long|characters and Windows allows 260/i.test(msg), msg);
    ok("…and tells the modder what to actually do about it", /shorter|shorten|long paths/i.test(msg), msg);
    ok("…without citing a length that contradicts itself",
      !/would be \d+ characters and Windows allows 260/.test(msg) || (Number((msg.match(/would be (\d+) characters/) || [])[1]) > 259),
      msg);

    // ── a backup failure that is NOT a length problem must not be disguised as one ─────────────────
    // Mislabelling an unrelated write failure would send someone renaming folders for no reason.
    fs.writeFileSync = function (p, ...rest) {
      if (/[\\/]backups[\\/]/.test(String(p))) { const e = new Error("EACCES: permission denied"); e.code = "EACCES"; throw e; }
      return realWrite.call(this, p, ...rest);
    };
    await breathe();
    const denied = await save(TREE.replace("= 10", "= 77"));
    const dmsg = String((denied.b && denied.b.error) || "");
    ok("a permission failure is still refused", denied.s === 400, denied.b);
    ok("…and is NOT described as a path-length problem", !/Windows allows 260/.test(dmsg), dmsg);
    ok("…the original error survives instead", /EACCES|permission/i.test(dmsg), dmsg);

    console.log("\ntest-backup-path-too-long: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    fs.writeFileSync = realWrite;
    process.exitCode = pass === total && total >= 11 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
