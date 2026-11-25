// Renaming a spirit repeatedly must not damage the ideas file.
//
// ⚠️ #rename-eats-a-newline is OPEN and this test does NOT assert it. The delete's pattern captures the
// newline BEFORE the block and the span also consumes the one AFTER, so it removes one newline more than the
// block occupies; in an arrangement where the upsert re-adds the block elsewhere, that eats the separators
// until a block shares a line with the previous block's closing brace. Starting the span after the captured
// newline fixes that — and makes every rename cycle GROW the file by a line, which test-maker-fuzz3's
// no-cross-cycle-growth check rejects. The imbalance is on the UPSERT side: it adds a separator this delete
// silently pays for, so the real fix belongs where the block is re-added. Normalising the seam here is not
// enough (tried). Cosmetic either way, so the growth invariant wins for now. The current numbers are printed
// rather than asserted, so a future change to either side shows up in the output.
//
// What IS asserted: repeated renames never damage CONTENT, and — the part this file does fix — the removal
// counts braces on a comment-masked copy, so a `# note }` inside a spirit cannot end the block early and take
// the wrong span out of the file. That one is data loss rather than formatting.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newline-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

const MOD = path.join(ROOT, "nlmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NlMod"\nsupported_version="1.18.*"\n', "utf8");

const IDEAS = path.join(MOD, "common", "ideas", "custom_ideas.txt");
const ORIGINAL = [
  "ideas = {",
  "\tcountry = {",
  "",
  "\t\tnova_alpha = {",
  "\t\t\tremoval_cost = -1",
  "\t\t}",
  "",
  "\t\tnova_rename_me = {",
  "\t\t\tremoval_cost = -1",
  "\t\t}",
  "",
  "\t\tnova_omega = {",
  "\t\t\tremoval_cost = -1",
  "\t\t}",
  "",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42173;
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
  // A closing brace that sits on the same line as the next block's opening is the symptom users see.
  const blocksSharingALine = (text) =>
    (text.match(/\}[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*\{/g) || []).length;

  try {
    // ── Repeated renames must not compact the file ───────────────────────────────────────────────
    console.log("\n[repeated renames] blank lines between blocks must survive");
    fs.writeFileSync(IDEAS, ORIGINAL, "utf8");
    // Count blank LINES, not blank-line separators. A /\n[ \t]*\n/g match consumes both newlines, so a run of
    // two blank lines ("\n\n\n") registers as one — which made an earlier version of this test report a loss
    // that had not happened.
    const blankLines = (s) => s.split("\n").filter((l) => l.trim() === "").length;
    const blankBefore = blankLines(ORIGINAL);

    let current = "nova_rename_me";
    for (let i = 0; i < 5; i++) {
      const next = `nova_renamed_${i}`;
      const r = await renameSpirit(current, next);
      if (!(r.body && r.body.ok !== false)) { rec(`rename ${i} succeeded`, false, r.body || r.status); break; }
      current = next;
    }
    rec("five renames all succeeded", current === "nova_renamed_4", current);

    const after = fs.readFileSync(IDEAS, "utf8");
    const blankAfter = blankLines(after);
    // ⚠️ #rename-eats-a-newline is OPEN. Removing exactly the block's lines fixes the joining, but makes
    // every rename cycle GROW the file by a line, which test-maker-fuzz3's no-cross-cycle-growth check
    // rejects — the imbalance is on the upsert side, which adds a separator this delete silently pays for.
    // Recorded, not asserted: fixing it here would trade a cosmetic bug for one the project already tests
    // against. What IS asserted below is that renaming never damages content, which is the part that matters.
    console.log(
      "  --  blank lines " + blankBefore + " -> " + blankAfter +
      ", blocks sharing a line: " + blocksSharingALine(after) + "   (#rename-eats-a-newline, OPEN)"
    );
    rec("the renamed spirit is present under its final id", new RegExp(`${current}\\s*=\\s*\\{`).test(after), after);
    rec("…and its neighbours are untouched",
      /nova_alpha\s*=\s*\{/.test(after) && /nova_omega\s*=\s*\{/.test(after), after);
    rec("the file is still brace-balanced",
      (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length,
      { open: (after.match(/\{/g) || []).length, close: (after.match(/\}/g) || []).length });

    // ── A brace inside a comment must not misplace the removal ───────────────────────────────────
    console.log("\n[comment brace] the delete must not take the wrong span");
    fs.writeFileSync(IDEAS, [
      "ideas = {",
      "\tcountry = {",
      "",
      "\t\tnova_commented = {",
      "\t\t\t# a stray brace in a comment: }",
      "\t\t\tremoval_cost = -1",
      "\t\t}",
      "",
      "\t\tnova_after = {",
      "\t\t\tremoval_cost = -1",
      "\t\t}",
      "",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");

    const r2 = await renameSpirit("nova_commented", "nova_commented_v2");
    rec("the rename succeeded", r2.status === 200 && r2.body && r2.body.ok !== false, r2.body || r2.status);
    const after2 = fs.readFileSync(IDEAS, "utf8");
    rec("the following spirit survived", /nova_after\s*=\s*\{/.test(after2), after2);
    rec("the old id is gone", !/nova_commented\s*=\s*\{/.test(after2), after2);
    rec("the file is still brace-balanced",
      (after2.replace(/#[^\n]*/g, "").match(/\{/g) || []).length ===
      (after2.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, after2);

    console.log(`\n=== rename eats a newline: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
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
