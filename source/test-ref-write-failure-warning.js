// #ref-write-failure-silent — a reference file that could not be rewritten during a rename must be reported.
//
// After renaming an entity, Nova walks the mod rewriting every reference it wrote for the old id. Each of
// those writes was wrapped in a bare catch, so a file that could not be written was skipped in silence: the
// entity was renamed, that file kept naming the old id, and the grant it carried silently never happens in
// game. The save reported success.
//
// These walkers run AFTER the rename itself is written, and that rename is correct — failing the request would
// report an error for an operation that did succeed. So the rename completes and the response carries a
// warning naming the files that still point at the old id.
//
// Both directions: a rename where every reference file is writable must report NO warning, or the warning
// becomes noise nobody reads.
//
// Hermetic: fake mod under tmpdir. Permissions restored in a finally block.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-refwarn-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}

const MOD = path.join(ROOT, "refmod");
["common/ideas", "common/national_focus", "history/countries"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RefMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tnova_ref_old = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n", "utf8");

const FOCUS = path.join(MOD, "common", "national_focus", "nova_focus.txt");
const FOCUS_SRC = [
  "focus_tree = {",
  "\tid = nova_tree",
  "\tfocus = {",
  "\t\tid = nova_focus_a",
  "\t\tcompletion_reward = {",
  "\t\t\tadd_ideas = nova_ref_old",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const locked = [];
function lock(p) { fs.chmodSync(p, 0o444); locked.push(p); }
function unlockAll() {
  for (const p of locked) { try { fs.chmodSync(p, 0o666); } catch (_) {} }
  locked.length = 0;
}

const PORT = 42161;
const app = createApp();
const server = app.listen(PORT, async () => {
  const renameSpirit = async (from, to) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, ideaId: to, previousIdeaId: from,
        targetRelativeFile: "custom_ideas.txt", mode: "create", category: "country", name: to,
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── CONTROL FIRST: everything writable, so there must be NO warning ──────────────────────────
    console.log("\n[control] a rename where every reference file is writable");
    fs.writeFileSync(FOCUS, FOCUS_SRC, "utf8");
    const ok = await renameSpirit("nova_ref_old", "nova_ref_new");
    rec("the rename succeeded", ok.status === 200 && ok.body && ok.body.ok !== false, ok.body || ok.status);
    rec("the focus reward was updated", /add_ideas\s*=\s*nova_ref_new/.test(fs.readFileSync(FOCUS, "utf8")),
      fs.readFileSync(FOCUS, "utf8"));
    rec("…and NO warning was reported", !(ok.body && ok.body.refWarning), ok.body && ok.body.refWarning);

    // ── LOCKED: the reference file cannot be rewritten ───────────────────────────────────────────
    console.log("\n[locked] the focus file holding the reference is read-only");
    fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
      "ideas = {\n\tcountry = {\n\t\tnova_ref_two = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n", "utf8");
    fs.writeFileSync(FOCUS, FOCUS_SRC.replace("nova_ref_old", "nova_ref_two"), "utf8");
    lock(FOCUS);

    const blocked = await renameSpirit("nova_ref_two", "nova_ref_three");
    rec("the rename itself still succeeded", blocked.status === 200 && blocked.body && blocked.body.ok !== false,
      blocked.body || blocked.status);
    const warn = String((blocked.body && blocked.body.refWarning) || "");
    rec("a warning WAS reported", !!warn, blocked.body);
    rec("…it names the file that could not be updated", /nova_focus\.txt/.test(warn), warn);
    rec("…and explains the consequence", /will not happen in game|old id/i.test(warn), warn);

    // The warning must be TRUE: the file really does still name the old id.
    rec("the claim is true — the file still names the old id",
      /add_ideas\s*=\s*nova_ref_two/.test(fs.readFileSync(FOCUS, "utf8")), fs.readFileSync(FOCUS, "utf8"));

    // And the rename it claims succeeded really did.
    const ideasTxt = fs.readFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"), "utf8");
    rec("…and the rename it claims succeeded really did", /nova_ref_three\s*=\s*\{/.test(ideasTxt), ideasTxt);
    unlockAll();

    // ── The warning must not leak into the NEXT request ──────────────────────────────────────────
    console.log("\n[no leakage] a later clean rename must not inherit the old warning");
    fs.writeFileSync(FOCUS, FOCUS_SRC.replace("nova_ref_old", "nova_ref_three"), "utf8");
    const after = await renameSpirit("nova_ref_three", "nova_ref_four");
    rec("the later rename succeeded", after.status === 200 && after.body && after.body.ok !== false,
      after.body || after.status);
    rec("…and carries no stale warning", !(after.body && after.body.refWarning), after.body && after.body.refWarning);

    console.log(`\n=== reference write failure warning: ${checks} checks, ${fails.length} failed ===`);
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
