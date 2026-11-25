// #decision-rename-orphans-grant — renaming a decision must carry every `activate_decision` Nova wrote for it.
//
// Nova writes those references itself: the "➕ Add to country" wiring in history/countries, the same wiring in
// its own all-countries on_actions file, and focus rewards / event options that activate a decision. A rename
// rewrote the decision's own block and its localisation and stopped there, so every reference went on naming
// the OLD id. HOI4 does not log an unknown id in activate_decision — the decision simply never becomes
// available, so the modder sees a feature that quietly does nothing.
//
// Mod Health could not catch it either: extractRefs had no activate_decision pattern at all, so a mod full of
// dead references reported clean. Both halves are covered here — the rename following through, AND the
// validator noticing when something else leaves one dangling.
//
// Both directions, because rewriting too eagerly is its own bug:
//   renamed          -> every reference follows
//   commented-out    -> left alone (a commented reward is not a live one)
//   unrelated id     -> untouched (a decision id is an ordinary word; a blind replace would be far worse)
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decref-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const MOD = path.join(ROOT, "decrefmod");
["common/decisions", "common/decisions/categories", "history/countries", "common/national_focus", "common/on_actions"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DecRefMod"\nsupported_version="1.18.*"\n', "utf8");

const HIST = path.join(MOD, "history", "countries", "NUA - Nova.txt");
const FOCUS = path.join(MOD, "common", "national_focus", "nova_focus.txt");
const ONACT = path.join(MOD, "common", "on_actions", "zz_nova_all_countries.txt");

const PORT = 42147;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── Create the decision through the real endpoint ────────────────────────────────────────────
    const made = await post("/api/decisions/save", {
      modPath: MOD, id: "nova_old_decision", name: "Nova Old Decision",
      categoryId: "nova_decisions", cost: 25, days: 30,
    });
    rec("the decision was created", made.status === 200 && made.body && made.body.success !== false,
      made.body || made.status);

    // Reference it the way Nova's own wiring does, plus the two traps a blind replace would fall into.
    fs.writeFileSync(HIST, [
      "NUA = {",
      "\tactivate_decision = nova_old_decision",
      "\t# activate_decision = nova_old_decision   <- commented out, must NOT be rewritten",
      "\tset_research_slots = 3",
      "}",
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(FOCUS, [
      "focus_tree = {",
      "\tid = nova_tree",
      "\tfocus = {",
      "\t\tid = nova_focus_a",
      "\t\tcompletion_reward = {",
      "\t\t\tactivate_decision = nova_old_decision",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(ONACT, [
      "on_actions = {",
      "\ton_startup = {",
      "\t\teffect = {",
      "\t\t\tevery_country = {",
      "\t\t\t\tactivate_decision = nova_old_decision",
      "\t\t\t\tactivate_decision = nova_untouched_decision",
      "\t\t\t}",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");

    // ── RENAME ───────────────────────────────────────────────────────────────────────────────────
    console.log("\n[rename] every activate_decision follows the new id");
    const renamed = await post("/api/decisions/save", {
      modPath: MOD, id: "nova_new_decision", name: "Nova New Decision",
      categoryId: "nova_decisions", cost: 25, days: 30,
      previousId: "nova_old_decision", previousCategoryId: "nova_decisions",
    });
    rec("the rename succeeded", renamed.status === 200 && renamed.body && renamed.body.success !== false,
      renamed.body || renamed.status);

    const hist = fs.readFileSync(HIST, "utf8");
    const focus = fs.readFileSync(FOCUS, "utf8");
    const onact = fs.readFileSync(ONACT, "utf8");

    rec("history now activates the new id", /activate_decision\s*=\s*nova_new_decision/.test(hist), hist);
    rec("…and no live line still names the old id",
      !hist.split("\n").some((l) => !l.trim().startsWith("#") && l.includes("nova_old_decision")), hist);
    rec("the focus reward follows", /activate_decision\s*=\s*nova_new_decision/.test(focus), focus);
    rec("the all-countries on_actions file follows", /activate_decision\s*=\s*nova_new_decision/.test(onact), onact);

    console.log("\n[both directions] what must NOT be rewritten");
    rec("the commented-out reference is left alone", /#\s*activate_decision\s*=\s*nova_old_decision/.test(hist), hist);
    rec("an unrelated decision id is untouched", /activate_decision\s*=\s*nova_untouched_decision/.test(onact), onact);
    rec("history kept its other statements", /set_research_slots\s*=\s*3/.test(hist), hist);

    // ── MOD HEALTH: the validator must now SEE a dangling activate_decision ──────────────────────
    console.log("\n[mod health] a dangling activate_decision is reported");
    // Point one reference at an id nothing defines, then ask for a FRESH index (a cached payload would
    // otherwise mask exactly what is being tested).
    fs.writeFileSync(HIST, "NUA = {\n\tactivate_decision = nova_ghost_decision\n}\n", "utf8");
    const health = await fetch(`http://127.0.0.1:${PORT}/api/mod/index?fresh=1&modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json()).catch(() => null);
    const problems = (health && (health.problems || health.issues)) || [];
    const hit = problems.find((p) => p && String(p.refId || "") === "nova_ghost_decision");
    rec("the mod index loads", !!health, health);
    rec("the dangling reference is reported", !!hit,
      problems.slice(0, 4).map((p) => p && (p.rule + ":" + (p.refId || p.entityId))));
    rec("…as an error, via activate_decision", !!hit && hit.severity === "error" && hit.refContext === "activate_decision",
      hit);

    // And the opposite: a reference to a decision that DOES exist must not be reported.
    fs.writeFileSync(HIST, "NUA = {\n\tactivate_decision = nova_new_decision\n}\n", "utf8");
    const health2 = await fetch(`http://127.0.0.1:${PORT}/api/mod/index?fresh=1&modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json()).catch(() => null);
    const problems2 = (health2 && (health2.problems || health2.issues)) || [];
    rec("a VALID activate_decision is not flagged",
      !problems2.some((p) => p && p.refContext === "activate_decision"),
      problems2.filter((p) => p && p.refContext === "activate_decision"));

    console.log(`\n=== decision rename + activate_decision refs: ${checks} checks, ${fails.length} failed ===`);
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
