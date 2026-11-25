// #backup-reported-but-never-written and #readonly-flag-stripped-permanently
//
// Two ways a write path quietly misled the user:
//
// 1. The focus-tree owner dialog assigned backupPath, then wrote the backup inside a try with an empty catch.
//    When that write failed, backupPath still named a file that does not exist — and the tree was rewritten
//    anyway, so the response promised a fallback copy that was never there. This endpoint has form: a no-edit
//    Save through it once flattened eleven trees.
//
// 2. Deleting a spirit cleared the ideas file's read-only flag so the write could land, and never put it back.
//    A file the user (or Steam, which ships Workshop content read-only) had deliberately protected came out of
//    one delete writable for good, silently. Clearing it IS needed — safeModWrite renames over the target and
//    that fails on a read-only file — so the fix is to restore it, not to stop clearing it.
//
// Hermetic: fake mod under tmpdir. Permissions restored in a finally block.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-honesty-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "honestmod");
["common/ideas", "common/national_focus"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="HonestMod"\nsupported_version="1.18.*"\n', "utf8");

const IDEAS = path.join(MOD, "common", "ideas", "custom_ideas.txt");
fs.writeFileSync(IDEAS,
  "ideas = {\n\tcountry = {\n\t\tnova_del_me = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t\tnova_stay = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n", "utf8");

const TREE = path.join(MOD, "common", "national_focus", "nova_tree.txt");
fs.writeFileSync(TREE, [
  "focus_tree = {",
  "\tid = nova_tree",
  "\tcountry = {",
  "\t\tfactor = 0",
  "\t}",
  "\tfocus = {",
  "\t\tid = nova_focus_a",
  "\t\tx = 1",
  "\t\ty = 0",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const locked = [];
function unlockAll() {
  for (const p of locked) { try { fs.chmodSync(p, 0o666); } catch (_) {} }
  locked.length = 0;
}

const PORT = 42165;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const isReadOnly = (p) => !(fs.statSync(p).mode & 0o200);

  try {
    // ── The reported backup must actually exist ──────────────────────────────────────────────────
    console.log("\n[focus tree] a reported backupPath must name a real file");
    const owner = await post("/api/focus/tree-properties", {
      modPath: MOD, relPath: "common/national_focus/nova_tree.txt", treeId: "nova_tree", tag: "GER", weight: 5,
    });
    rec("the ownership change succeeded", owner.status === 200 && owner.body && owner.body.ok !== false,
      owner.body || owner.status);
    const bp = owner.body && owner.body.backupPath;
    if (bp) {
      rec("the reported backup file exists on disk", fs.existsSync(bp), bp);
      rec("…and holds the ORIGINAL content, not the new content",
        fs.readFileSync(bp, "utf8").includes("factor = 0"), fs.readFileSync(bp, "utf8").slice(0, 200));
    } else {
      rec("a backupPath was reported at all", false, owner.body);
    }
    rec("the tree really was changed", /GER/.test(fs.readFileSync(TREE, "utf8")),
      fs.readFileSync(TREE, "utf8").slice(0, 200));

    // ── The read-only flag must survive a delete ─────────────────────────────────────────────────
    console.log("\n[spirit delete] a protected file stays protected");
    fs.chmodSync(IDEAS, 0o444);
    locked.push(IDEAS);
    rec("the ideas file starts read-only", isReadOnly(IDEAS), fs.statSync(IDEAS).mode.toString(8));

    const del = await post("/api/ideas/delete-definition", {
      modPath: MOD, ideaId: "nova_del_me", targetRelativeFile: "custom_ideas.txt",
    });
    // The delete MUST succeed — clearing the read-only flag is what makes the write possible, and if it were
    // skipped this whole case would pass vacuously while proving nothing. (An earlier draft of this test used
    // the wrong parameter name, the delete 400'd, and the read-only assertion below passed because nothing had
    // been written at all.)
    rec("the delete succeeded despite the file being read-only",
      del.status === 200 && del.body && del.body.ok !== false, del.body || del.status);

    // …and the protection it had to clear to do that must have been put back.
    rec("the file is STILL read-only afterwards", isReadOnly(IDEAS), fs.statSync(IDEAS).mode.toString(8));

    const txt = fs.readFileSync(IDEAS, "utf8");
    rec("…the spirit was removed", !/nova_del_me\s*=\s*\{/.test(txt), txt);
    rec("…and its neighbour survived", /nova_stay\s*=\s*\{/.test(txt), txt);
    unlockAll();

    console.log(`\n=== backup + read-only honesty: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    unlockAll();
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
