// #insert-adds-a-blank-line / #rename-eats-a-newline — the two halves of one whitespace-accounting bug in
// the ideas file splices. They are tested together because fixing either one alone MOVES the damage instead
// of removing it, and the old code passed a growth check precisely because the two errors cancelled.
//
//  upsert inserted a block right after a `{` whose tail already starts with a newline, and appended a
//    trailing "\n" regardless — so every insert left a blank line behind.
//  delete matched `(^|\n)\s*<id>\s*=\s*{`, started the span AT the captured newline, and also consumed the
//    one after the block — one newline more than the block occupies. Deleting the only spirit in a category
//    produced `country = {\t}`, the container's own closing brace glued onto its opening line.
//
// Across a full create→delete cycle the two cancelled, so a no-growth check saw nothing wrong. This test
// pins BOTH the per-operation shape and the no-growth invariant, so neither can be traded for the other.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-splice-"));
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

const MOD = path.join(ROOT, "splicemod");
const IDEAS_REL = "nua_spirits.txt";
const IDEA_LOC = "localisation/english/nua_spirits_l_english.yml";
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpliceMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nua_spirits_l_english.yml"), "﻿l_english:\n", "utf8");

const IDEAS_ABS = path.join(MOD, "common", "ideas", IDEAS_REL);
const readIdeas = () => (fs.existsSync(IDEAS_ABS) ? fs.readFileSync(IDEAS_ABS, "utf8") : "");

const PORT = 42221;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const makeSpirit = (ideaId, name, mode = "create") => post("/api/ideas/upsert-definition", {
    modPath: MOD, ideaId, targetRelativeFile: IDEAS_REL, targetLocalizationPath: IDEA_LOC,
    name, desc: "d", picture: "GFX_idea_generic_army_bonus",
    selectedEffects: ["political_power_gain = 0.1"], mode, category: "country",
    traits: [], cost: "", removalCost: "", ledger: "",
  });
  const delSpirit = (ideaId) => post("/api/ideas/delete-definition", {
    modPath: MOD, ideaId, targetRelativeFile: IDEAS_REL, targetLocalizationPath: IDEA_LOC,
  });

  // A line is "glued" when a closing brace shares a line with anything other than trailing whitespace,
  // or when a `{` is immediately followed by a `}` on the same line with only tabs between.
  const gluedLines = (txt) => txt.split(/\r?\n/).filter((l) => /\{\s*\}/.test(l) || /\}\s*\S/.test(l));
  const balanced = (txt) => {
    const t = txt.replace(/#[^\n\r]*/g, "");
    return (t.match(/\{/g) || []).length === (t.match(/\}/g) || []).length;
  };

  try {
    console.log("\n[insert] adding a spirit does not leave a blank line");
    {
      const r = await makeSpirit("nua_first", "Nova First");
      rec("the upsert succeeded", r.body && r.body.ok !== false, r.body);
      const txt = readIdeas();
      rec("the file is brace-balanced", balanced(txt), txt);
      rec("no blank line was left inside the category", !/\n[ \t]*\n[ \t]*\}/.test(txt), JSON.stringify(txt));
      rec("no glued braces", gluedLines(txt).length === 0, gluedLines(txt));
    }

    console.log("\n[delete] removing the only spirit does not glue the container's braces");
    {
      const r = await delSpirit("nua_first");
      rec("the delete succeeded", r.body && r.body.ok === true, r.body);
      const txt = readIdeas();
      rec("the file is brace-balanced", balanced(txt), txt);
      // The exact reported symptom: `ideas = {\n\tcountry = {\t}\n}`.
      rec("no `country = {\\t}` glue", !/=\s*\{[ \t]*\}/.test(txt), JSON.stringify(txt));
      rec("no glued braces anywhere", gluedLines(txt).length === 0, gluedLines(txt));
    }

    console.log("\n[delete, middle block] the neighbours keep their own lines");
    {
      await makeSpirit("nua_a", "A");
      await makeSpirit("nua_b", "B");
      await makeSpirit("nua_c", "C");
      const before = readIdeas();
      rec("three spirits are present", ["nua_a", "nua_b", "nua_c"].every((x) => before.includes(x)), before);
      await delSpirit("nua_b");
      const txt = readIdeas();
      rec("the middle one is gone", !/\bnua_b\b/.test(txt), txt);
      rec("its neighbours survive", /\bnua_a\b/.test(txt) && /\bnua_c\b/.test(txt), txt);
      rec("no closing brace picked up a neighbour", gluedLines(txt).length === 0, gluedLines(txt));
      rec("the file is brace-balanced", balanced(txt), txt);
    }

    console.log("\n[no growth] repeated create/delete cycles do not accumulate lines");
    {
      // This is the invariant the old code preserved BY ACCIDENT — two opposite errors cancelling. It has to
      // still hold now that each half is individually correct, or the fix traded one defect for another.
      const settle = readIdeas();
      const baseLines = settle.split(/\r?\n/).length;
      for (let i = 0; i < 6; i++) {
        await makeSpirit("nua_cycle", "Cycle " + i);
        await delSpirit("nua_cycle");
      }
      const after = readIdeas();
      rec("line count did not grow across 6 cycles", after.split(/\r?\n/).length === baseLines,
        { baseLines, after: after.split(/\r?\n/).length });
      rec("…and byte-identical", after === settle, JSON.stringify(after.slice(0, 300)));
      rec("…still no glued braces", gluedLines(after).length === 0, gluedLines(after));
    }

    console.log("\n[no growth] repeated edits of an existing spirit are idempotent");
    {
      await makeSpirit("nua_stable", "Stable");
      const first = readIdeas();
      for (let i = 0; i < 4; i++) await makeSpirit("nua_stable", "Stable", "edit");
      const after = readIdeas();
      rec("4 re-saves left the file byte-identical", after === first,
        { firstLines: first.split(/\r?\n/).length, afterLines: after.split(/\r?\n/).length });
    }

    console.log(`\n=== idea splice whitespace: ${checks} checks, ${fails.length} failed ===`);
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
