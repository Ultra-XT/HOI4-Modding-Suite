// Two ordinary save failures, and what the modder was told about them.
//
// #phantom-mod-folder — saving into a mod folder that is no longer there SUCCEEDED. Every write path builds
// its directories with mkdir -p, so the save recreated the skeleton at the old path, wrote the content into
// it, and returned ok. The result has no descriptor.mod, so HOI4 will never load it — and Nova lists it as a
// mod anyway, so the modder sees their mod, opens it, finds their work apparently intact, and the game shows
// nothing. The way in is ordinary: rename the folder, move it, let a sync client relocate it, or just have it
// selected from a previous session.
//
// #readonly-file-raw-error — writes are atomic (content to `<file>.tmp-<pid>-<ts>`, then renamed over the
// target), so when the target is read-only or held open it is the RENAME that fails, and the modder saw
// "EPERM: operation not permitted, rename 'C:\…\zz.txt.tmp-36268-1785531789847' -> …": an internal temp path,
// an errno, and nothing about the cause. All three causes are everyday ones — Steam Workshop content is
// frequently read-only, HOI4 holds files while running, and antivirus or a sync client can lock a file for a
// moment. This machine's antivirus has already interrupted Nova's writes once during this project.
//
// Both now refuse, change nothing, and say what happened. The tests check the FILE as well as the message,
// because "it explained itself" is only worth anything if it also did not write.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-savefail-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };
const RAW = /\b(EPERM|EACCES|EBUSY|ENOENT|errno|syscall)\b/i;

const MOD = path.join(ROOT, "probe");
["common/national_focus", "common/ideas", "localisation/english"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SaveFail"\nsupported_version="1.18.*"\n');

const TREE_FILE = path.join(MOD, "common", "national_focus", "tree.txt");
const TREE = "focus_tree = {\n\tid = sf_tree\n\tcountry = { factor = 0 }\n\tfocus = {\n\t\tid = sf_focus\n\t\ticon = GFX_focus_generic_treaty\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t\tcompletion_reward = { add_political_power = 10 }\n\t}\n}\n";
fs.writeFileSync(TREE_FILE, TREE, "utf8");

const IDEAS_REL = "common/ideas/zz.txt";
const IDEAS_ABS = path.join(MOD, "common", "ideas", "zz.txt");
const IDEAS = "ideas = {\n\tcountry = {\n\t\tzz_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.03 }\n\t\t}\n\t}\n}\n";
fs.writeFileSync(IDEAS_ABS, IDEAS, "utf8");

const GHOST = path.join(ROOT, "gone_away");

const PORT = 39683, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = (ms = 1300) => new Promise((r) => setTimeout(r, ms));
  const saveSpirit = (modPath) => post("/api/ideas/upsert-definition", {
    modPath, ideaId: "zz_spirit", targetRelativeFile: IDEAS_REL,
    targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    name: "Z", desc: "d", picture: "GFX_idea_generic_army_bonus",
    selectedEffects: ["modifier = {\nstability_factor = 0.05\n}"],
    mode: "edit", category: "country", traits: [], cost: "", removalCost: "", ledger: "",
  });

  try {
    // ── the mod folder is gone ────────────────────────────────────────────────────────────────────
    ok("the ghost folder does not exist to begin with", !fs.existsSync(GHOST));
    const ghostChar = await post("/api/characters/save", {
      modPath: GHOST, token: "zz_char", name: "Z", file: "ZZ.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    const gm = String((ghostChar.b && ghostChar.b.error) || "");
    ok("saving a character into a missing mod is refused", ghostChar.s === 400, ghostChar.b);
    ok("…and no folder is invented for it", !fs.existsSync(GHOST), "folder was created");
    ok("…the message says the mod folder is gone", /no longer there/i.test(gm), gm);
    ok("…that nothing was written", /Nothing was written/i.test(gm), gm);
    ok("…and what to do about it", /pick the mod again/i.test(gm), gm);

    const ghostSpirit = await saveSpirit(GHOST);
    ok("a spirit save into a missing mod is refused too", ghostSpirit.s === 400, ghostSpirit.b);
    ok("…and still no folder is invented", !fs.existsSync(GHOST), "folder was created");

    // ── the target file is read-only ──────────────────────────────────────────────────────────────
    // Both write paths are covered: the focus tree writes through /api/save, everything else through
    // safeModWrite, and each had its own copy of the atomic rename.
    fs.chmodSync(IDEAS_ABS, 0o444);
    const roSpirit = await saveSpirit(MOD);
    const rm = String((roSpirit.b && roSpirit.b.error) || "");
    ok("a spirit save to a read-only file is refused", roSpirit.s === 400, roSpirit.b);
    ok("…the message is not a raw system error", !RAW.test(rm), rm);
    ok("…it names the file", /zz\.txt/.test(rm), rm);
    ok("…it gives the likely cause", /read-only or in use/i.test(rm), rm);
    ok("…it says nothing was changed", /Nothing was changed/i.test(rm), rm);
    ok("…and suggests closing the game", /Hearts of Iron IV/i.test(rm), rm);
    ok("…the file really is unchanged", fs.readFileSync(IDEAS_ABS, "utf8") === IDEAS, "file changed");
    fs.chmodSync(IDEAS_ABS, 0o666);

    fs.chmodSync(TREE_FILE, 0o444);
    await breathe();
    const roTree = await post("/api/save", { path: TREE_FILE, content: TREE.replace("= 10", "= 25") });
    const tm = String((roTree.b && roTree.b.error) || "");
    ok("a focus-tree save to a read-only file is refused", roTree.s === 400, roTree.b);
    ok("…and is not a raw system error either", !RAW.test(tm), tm);
    ok("…naming that file", /tree\.txt/.test(tm), tm);
    ok("…the tree file is unchanged", fs.readFileSync(TREE_FILE, "utf8") === TREE, "file changed");
    fs.chmodSync(TREE_FILE, 0o666);

    // A failed write must not leave its temp file sitting beside the modder's own files.
    const litter = fs.readdirSync(path.join(MOD, "common", "national_focus")).filter((f) => f.includes(".tmp-"))
      .concat(fs.readdirSync(path.join(MOD, "common", "ideas")).filter((f) => f.includes(".tmp-")));
    ok("no .tmp- litter is left behind by the failures", litter.length === 0, litter);

    // ── and a healthy save still works, so none of the above passes for the wrong reason ───────────
    await breathe();
    const good = await post("/api/save", { path: TREE_FILE, content: TREE.replace("= 10", "= 30") });
    ok("a normal focus-tree save still succeeds", good.s === 200, good.b);
    ok("…and the edit landed", /= 30/.test(fs.readFileSync(TREE_FILE, "utf8")));
    const goodSpirit = await saveSpirit(MOD);
    ok("a normal spirit save still succeeds", goodSpirit.s === 200, goodSpirit.b);

    console.log("\ntest-save-failure-messages: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.chmodSync(IDEAS_ABS, 0o666); fs.chmodSync(TREE_FILE, 0o666); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
