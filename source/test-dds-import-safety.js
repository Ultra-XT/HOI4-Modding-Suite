// /api/gfx/import-dds is the focus editor's "Import DDS…" button. Three defects, all silent:
//
//  * It overwrote existing art with no backup, while its sibling /api/upload-gfx backs up exactly this class
//    of file before replacing it. A re-import or a mis-picked file destroyed the previous icon permanently.
//  * It cleared the sprite map but NOT the per-icon resolution cache, which memoises per `${modRoot}|${key}`
//    including the isFallback entry cached before the import — so the icon you just imported kept drawing as
//    the unknown placeholder for the rest of the session. /api/ideas/import and /api/upload-gfx both clear it.
//  * focusId was truncated with a bare .slice(0, 64), so two focuses whose ids share a 64-char prefix mapped
//    onto ONE file and ONE sprite key and the second import silently overwrote the first focus's art.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ddsimp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const server_mod = require("./server.js");
const { createApp, setActiveRoot } = server_mod;

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "ddsmod");
fs.mkdirSync(path.join(MOD, "gfx", "interface", "goals"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DdsMod"\nsupported_version="1.18.*"\n', "utf8");
setActiveRoot(MOD);

// Two distinct .dds sources. Content need only differ; the header is enough to be a plausible DDS.
const SRCDIR = path.join(ROOT, "sources");
fs.mkdirSync(SRCDIR, { recursive: true });
const ddsBuf = (tag) => {
  const b = Buffer.alloc(256, 0);
  b.write("DDS ", 0, "latin1");
  b.writeUInt32LE(124, 4);
  b.write(tag, 128, "latin1"); // the marker we assert on
  return b;
};
const SRC_A = path.join(SRCDIR, "art_a.dds");
const SRC_B = path.join(SRCDIR, "art_b.dds");
fs.writeFileSync(SRC_A, ddsBuf("AAAA"));
fs.writeFileSync(SRC_B, ddsBuf("BBBB"));

const GOALS = path.join(MOD, "gfx", "interface", "goals");
const markerOf = (file) => fs.readFileSync(file).slice(128, 132).toString("latin1");

const PORT = 42425;
const app = createApp();
const server = app.listen(PORT, async () => {
  const importDds = async (focusId, sourcePath) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/gfx/import-dds`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ focusId, sourcePath }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[overwrite] re-importing over existing art must back the old file up first");
    let r = await importDds("nova_test_focus", SRC_A);
    rec("the first import succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and reports it did not overwrite anything", r.body && r.body.overwrote === false, r.body);
    const target = path.join(GOALS, "nova_test_focus.dds");
    rec("the art landed", fs.existsSync(target) && markerOf(target) === "AAAA", fs.existsSync(target) && markerOf(target));

    r = await importDds("nova_test_focus", SRC_B);
    rec("the second import succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and reports that it overwrote", r.body && r.body.overwrote === true, r.body);
    rec("…and names a backup file", !!(r.body && r.body.backupPath), r.body);
    rec("the new art is in place", markerOf(target) === "BBBB", markerOf(target));

    const { constants } = server_mod;
    const backupDir = constants && constants.BACKUP_DIR;
    rec("the backup directory is known to the test", !!backupDir, backupDir);
    if (backupDir && r.body && r.body.backupPath) {
      const bfull = path.join(backupDir, r.body.backupPath);
      rec("the backup file exists on disk", fs.existsSync(bfull), bfull);
      rec("…and holds the PREVIOUS art, byte for byte",
        fs.existsSync(bfull) && markerOf(bfull) === "AAAA", fs.existsSync(bfull) && markerOf(bfull));
    }

    console.log("\n[long ids] two focuses sharing a 64-char prefix must not collide");
    const prefix = "a_very_long_generated_focus_identifier_that_keeps_going_and_going";
    const idOne = prefix + "_ONE";
    const idTwo = prefix + "_TWO";
    rec("(fixture) the two ids really do share a 64-char prefix",
      idOne.slice(0, 64) === idTwo.slice(0, 64) && idOne !== idTwo, { a: idOne.slice(0, 64), b: idTwo.slice(0, 64) });

    const r1 = await importDds(idOne, SRC_A);
    const r2 = await importDds(idTwo, SRC_B);
    rec("both long-id imports succeeded", r1.status === 200 && r2.status === 200, { r1: r1.body, r2: r2.body });
    rec("they were given DIFFERENT sprite keys", r1.body.iconKey !== r2.body.iconKey,
      { one: r1.body.iconKey, two: r2.body.iconKey });
    rec("…and DIFFERENT files", r1.body.copiedTo !== r2.body.copiedTo,
      { one: r1.body.copiedTo, two: r2.body.copiedTo });
    rec("the first focus's art was NOT overwritten by the second",
      fs.existsSync(r1.body.copiedTo) && markerOf(r1.body.copiedTo) === "AAAA",
      fs.existsSync(r1.body.copiedTo) && markerOf(r1.body.copiedTo));
    rec("the second focus has its own art", markerOf(r2.body.copiedTo) === "BBBB", markerOf(r2.body.copiedTo));
    rec("the truncation is reported rather than silent", r1.body.truncatedName === true, r1.body);

    console.log("\n[control] a short id is still written under its own plain name");
    // Guards against a fix that hashes everything and renames art the mod already references.
    rec("a short id keeps its exact sprite key", r.body.iconKey === "GFX_nova_test_focus", r.body.iconKey);
    rec("…and its exact filename", path.basename(target) === "nova_test_focus.dds", path.basename(target));
    rec("…and is not flagged as truncated", r.body.truncatedName === false, r.body);

    console.log("\n[re-import stability] importing the same id twice reuses the same key");
    const again = await importDds(idOne, SRC_A);
    rec("the sprite key is stable across imports", again.body.iconKey === r1.body.iconKey,
      { first: r1.body.iconKey, again: again.body.iconKey });

    console.log(`\n=== dds import safety: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
