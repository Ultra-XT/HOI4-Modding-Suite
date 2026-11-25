// #spirit-rename-misses-focus-rewards — renaming a national spirit re-pointed the country-history grants and
// left every focus that granted it naming an id the mod no longer defines.
//
// renameStartupIdeaGrants walked exactly two places: history/countries and the all-countries file.
// common/national_focus was never scanned. But focus rewards are the MAIN way a spirit is handed out —
// Millennium Dawn's common/national_focus holds 3808 bare `add_ideas = <id>` occurrences — and Nova WRITES
// them itself (app.js queues `add_ideas = ${ideaId}` as a focus completion_reward). So after a rename the
// focus completed and handed out nothing.
//
// The focus-tree page already counts these references for its own delete warning (countFocusReferencesForIdea)
// — the awareness existed, just not where the rename happens.
//
// The rewrite is deliberately narrow, because a spirit id is an ordinary word that can appear in many places:
//   - only inside an `add_ideas = …` value, bare or braced, any arity
//   - whole-word only, so `old_spirit_extended` is NOT touched by renaming `old_spirit`
//   - never inside a comment — a commented-out reward is not a live one
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-spiritfocus-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/ideas", "common/national_focus", "history/countries"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="S"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\told_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.05 }\n\t\t}\n\t}\n}\n", "utf8");
const FOCUS = path.join(MOD, "common", "national_focus", "probe_tree.txt");
fs.writeFileSync(FOCUS,
  "focus_tree = {\n\tid = probe_tree\n" +
  "\tfocus = {\n\t\tid = f_bare\n\t\tcompletion_reward = {\n\t\t\tadd_ideas = old_spirit\n\t\t}\n\t}\n" +
  "\tfocus = {\n\t\tid = f_braced\n\t\tcompletion_reward = {\n\t\t\tadd_ideas = { old_spirit }\n\t\t}\n\t}\n" +
  "\tfocus = {\n\t\tid = f_multi\n\t\tcompletion_reward = {\n\t\t\tadd_ideas = { other_spirit old_spirit third_spirit }\n\t\t}\n\t}\n" +
  "\tfocus = {\n\t\tid = f_lookalike\n\t\tcompletion_reward = {\n\t\t\tadd_ideas = old_spirit_extended\n\t\t}\n\t}\n" +
  "\tfocus = {\n\t\tid = f_commented\n\t\tcompletion_reward = {\n\t\t\t#add_ideas = old_spirit\n\t\t}\n\t}\n" +
  "}\n", "utf8");
const HIST = path.join(MOD, "history", "countries", "ABC - Testland.txt");
fs.writeFileSync(HIST, "capital = 1\n\nadd_ideas = {\n\told_spirit\n}\n", "utf8");

const PORT = 40013, app = createApp();
const server = app.listen(PORT, async () => {
  const rewardOf = (txt, id) => {
    const m = new RegExp("id = " + id + "[\\s\\S]*?(#?add_ideas[^\\n]*)").exec(txt);
    return m ? m[1].trim() : null;
  };
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, ideaId: "new_spirit", previousIdeaId: "old_spirit",
        targetRelativeFile: "custom_ideas.txt", mode: "create", category: "country",
        modifiers: { stability_factor: 0.05 },
      }),
    }).then((x) => x.json());
    ok("the rename succeeds", r && r.ok, r);

    const after = fs.readFileSync(FOCUS, "utf8");
    ok("the focus file was actually rewritten", after.includes("new_spirit"), after.slice(0, 200));

    // ── the bug ──────────────────────────────────────────────────────────────────────────────────
    ok("A BARE add_ideas reward follows the rename", rewardOf(after, "f_bare") === "add_ideas = new_spirit", rewardOf(after, "f_bare"));
    ok("…so does a single-entry braced one", rewardOf(after, "f_braced") === "add_ideas = { new_spirit }", rewardOf(after, "f_braced"));
    ok("…and one entry of a multi-entry reward", rewardOf(after, "f_multi") === "add_ideas = { other_spirit new_spirit third_spirit }", rewardOf(after, "f_multi"));
    ok("…leaving its siblings alone", /other_spirit/.test(after) && /third_spirit/.test(after), after.slice(0, 400));

    // ── the things it must NOT touch ─────────────────────────────────────────────────────────────
    ok("a LOOKALIKE id is not renamed", rewardOf(after, "f_lookalike") === "add_ideas = old_spirit_extended", rewardOf(after, "f_lookalike"));
    ok("…and a COMMENTED reward is left as it was", rewardOf(after, "f_commented") === "#add_ideas = old_spirit", rewardOf(after, "f_commented"));
    ok("no stray old_spirit remains as a live reward", !/(^|\n)[^\n#]*add_ideas\s*=\s*(\{[^{}]*\bold_spirit\b[^{}]*\}|old_spirit\b)/.test(after), after.slice(0, 500));

    let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; }
    ok("the focus file is brace-balanced", d === 0, d);

    // ── the path that already worked must keep working ──────────────────────────────────────────
    const hist = fs.readFileSync(HIST, "utf8");
    ok("the country history grant still follows the rename", /new_spirit/.test(hist) && !/\bold_spirit\b/.test(hist), hist);

    // ── the definition itself ───────────────────────────────────────────────────────────────────
    const ideas = fs.readFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"), "utf8");
    ok("the spirit definition is renamed", /new_spirit\s*=\s*\{/.test(ideas) && !/\bold_spirit\s*=\s*\{/.test(ideas), ideas);

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a focus-reward rename walk", /function renameIdeaRefsInFocusTrees\(modRoot, oldId, newId\)/.test(src), "missing");
    ok("…called from the spirit rename", /changed \+= renameIdeaRefsInFocusTrees\(modRoot, oldId, newId\);/.test(src), "not wired in");
    ok("…scoped to common/national_focus", /path\.join\(modRoot, "common", "national_focus"\)/.test(src), "wrong directory");
    ok("…and it explains why", /#spirit-rename-misses-focus-rewards/.test(src), "no marker comment");

    console.log("\ntest-spirit-rename-focus-rewards: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
