// Moving content to a DIFFERENT FILE must MOVE it, not leave a second copy behind.
//
// #character-move — saving a character with a new target file wrote it into the new file and left the old
// block exactly where it was, so the mod defined the same token twice. Worse than the rename case: two blocks
// claim one id, and which one the game keeps is load-order dependent.
//
// #spirit-move — the same box on the spirits page could not move anything at all. The editor sends mode
// "edit" for any spirit that lives in the active mod, and edit refuses when the spirit is not in the SELECTED
// file — precisely what a move creates — so it failed with "spirit not found in the selected idea file or
// source root". Forcing a create by hand duplicated it instead. A declared move now writes as a create into
// the new file and removes the old block once that has succeeded.
//
// DECISIONS already moved correctly (previousCategoryId), and are pinned here so all three live together.
//
// The localisation is deliberately NOT touched by a move in either case: the id is unchanged, so its key is
// still live, and stripping it would blank the name of the thing that just moved.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-move-files-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
for (const d of [["common", "characters"], ["common", "ideas"], ["common", "decisions"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MoveProbe"\nsupported_version="1.19.*"\n');

const cDir = path.join(MOD, "common", "characters");
const iDir = path.join(MOD, "common", "ideas");
const dDir = path.join(MOD, "common", "decisions");
const filesIn = (d) => { try { return fs.readdirSync(d).filter((f) => f.endsWith(".txt")); } catch (_) { return []; } };
const whereIs = (dir, id) => filesIn(dir).filter((f) => new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`).test(fs.readFileSync(path.join(dir, f), "utf8")));
const locAll = () => { try { return fs.readdirSync(path.join(MOD, "localisation", "english")).map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n"); } catch (_) { return ""; } };

const PORT = 39525, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 180));

  try {
    // ── CHARACTER ─────────────────────────────────────────────────────────────────────────────────
    const ch = (file, extra) => post("/api/characters/save", Object.assign({
      modPath: MOD, token: "mv_char", name: "Mover", file,
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    }, extra || {}));
    // a neighbour in the source file, so we can prove the move doesn't take anything else with it
    await ch("A_chars.txt"); await breathe();
    await post("/api/characters/save", {
      modPath: MOD, token: "mv_stayer", name: "Stayer", file: "A_chars.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await breathe();
    ok("the character starts in A_chars.txt", whereIs(cDir, "mv_char").join() === "A_chars.txt", whereIs(cDir, "mv_char"));

    const rc = await ch("B_chars.txt", { previousFile: "A_chars.txt" });
    await breathe();
    ok("moving it → 200", rc.s === 200, rc.b);
    ok("…it is now in B_chars.txt ONLY", whereIs(cDir, "mv_char").join() === "B_chars.txt", whereIs(cDir, "mv_char"));
    ok("…the neighbour stayed put", whereIs(cDir, "mv_stayer").join() === "A_chars.txt", whereIs(cDir, "mv_stayer"));
    ok("…and it kept its name (the loc key is unchanged by a move)", /mv_char:\d*\s*"Mover"/.test(locAll()), locAll());

    // ── SPIRIT ────────────────────────────────────────────────────────────────────────────────────
    const sp = (rel, extra) => post("/api/ideas/upsert-definition", Object.assign({
      modPath: MOD, ideaId: "mv_spirit", targetRelativeFile: rel,
      mode: "create", category: "country", picture: "GFX_idea_generic_communism_drift_bonus",
      name: "Mover Spirit", desc: "Description.", removalCost: "-1",
      selectedEffects: ["modifier = {\n\tpolitical_power_gain = 0.1\n}"],
      targetLocalizationPath: "localisation/english/probe_l_english.yml",
    }, extra || {}));
    await sp("common/ideas/A_spirits.txt"); await breathe();
    ok("the spirit starts in A_spirits.txt", whereIs(iDir, "mv_spirit").join() === "A_spirits.txt", whereIs(iDir, "mv_spirit"));

    // mode "edit" is what the editor really sends for a spirit that lives in the active mod
    const rs = await sp("common/ideas/B_spirits.txt", { mode: "edit", previousRelativeFile: "common/ideas/A_spirits.txt" });
    await breathe();
    ok("moving it → 200 (edit mode, as the editor sends)", rs.s === 200 && !rs.b.error, rs.b);
    ok("…it is now in B_spirits.txt ONLY", whereIs(iDir, "mv_spirit").join() === "B_spirits.txt", whereIs(iDir, "mv_spirit"));
    ok("…and it kept its name", /mv_spirit:\d*\s*"Mover Spirit"/.test(locAll()), locAll());

    // ── DECISION (already worked; pinned) ─────────────────────────────────────────────────────────
    const dec = (cat, extra) => post("/api/decisions/save", Object.assign({
      modPath: MOD, categoryId: cat, id: "mv_dec", name: "Mover Decision",
      cost: 10, icon: "GFX_decision_generic_decision", days: 0, fireOnce: "no",
      available: "always = yes", modifier: "", effect: "add_political_power = 1",
      decisionType: "decision", scope: "national", cooldown: "", targetTrigger: "", removeEffect: "",
    }, extra || {}));
    await dec("cat_one"); await breathe();
    ok("the decision starts in cat_one", whereIs(dDir, "mv_dec").join() === "cat_one.txt", whereIs(dDir, "mv_dec"));
    const rd = await dec("cat_two", { previousId: "mv_dec", previousCategoryId: "cat_one" });
    await breathe();
    ok("moving it → 200", rd.s === 200, rd.b);
    ok("…it is now in cat_two ONLY", whereIs(dDir, "mv_dec").join() === "cat_two.txt", whereIs(dDir, "mv_dec"));

    // ── a save with NO move must not remove anything ──────────────────────────────────────────────
    await breathe();
    const again = await ch("B_chars.txt", { previousFile: "B_chars.txt" });
    await breathe();
    ok("re-saving into the same file → 200", again.s === 200, again.b);
    ok("…the character is still there exactly once", whereIs(cDir, "mv_char").join() === "B_chars.txt", whereIs(cDir, "mv_char"));

    console.log("\ntest-move-between-files: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
