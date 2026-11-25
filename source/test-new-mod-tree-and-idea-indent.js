// Two things a brand-new mod gets wrong the moment it is created.
//
// #new-mod-tree-owner — the focus tree both "create a mod" and "create a focus tree file" generate used to
// score `factor = 0  modifier = { add = 10  tag = GER }`, copied verbatim out of vanilla's german.txt — which
// scores its own German tree at exactly the same 10. Focus-tree selection takes the highest score, so a mod
// created and never touched shipped an EMPTY tree tied with Germany's real one, and which of the two the game
// picks on a tie is not something to leave a first-time modder to find out in game. A new tree now scores 0,
// which is never picked, until the "which country uses this tree" dialog assigns it.
//
// #generated-idea-indent — a spirit Nova composes from nothing is assembled by several helpers that each
// indent to their own taste, so a brand-new spirit came out with its body a tab shallower than its opening
// line, `allowed`/`modifier` a tab DEEPER than the keys above them, their contents flat rather than nested,
// and the closing brace at column 0. Clausewitz does not care; the modder opening the file does. Only blocks
// Nova authored are normalised — a spirit that already exists in the mod is merged into and keeps the
// author's own formatting, which is asserted here too.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-newmod-indent-test");
// MODS_ROOT is resolved ONCE at require time, and only to a directory that already EXISTS — so this has to be
// created before server.js is loaded. Setting the variable alone silently fell through to the real Hearts of
// Iron IV mod folder, and the test created its probe mod in there.
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// Indentation must match brace depth on every line.
const indentIsSane = (text) => {
  let depth = 0;
  for (const raw of String(text).replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const lead = raw.match(/^\t*/)[0].length;
    const want = line.startsWith("}") ? depth - 1 : depth;
    if (lead !== want) return { line: raw, lead, want };
    for (const ch of line.replace(/#.*$/, "")) { if (ch === "{") depth++; else if (ch === "}") depth--; }
  }
  return depth === 0 ? null : { why: "unbalanced", depth };
};

const PORT = 39557, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 160));

  try {
    // ── a brand-new mod's focus tree claims nobody ────────────────────────────────────────────────
    const rMod = await post("/api/mod/create", { modName: "Tree Owner Probe" });
    await breathe();
    ok("creating a mod → 200", rMod.s === 200, rMod.b);
    const MOD = path.join(ROOT, "tree_owner_probe");
    const treePath = path.join(MOD, "common", "national_focus", "tree_owner_probe_focus_tree.txt");
    ok("…and it wrote a focus tree", fs.existsSync(treePath), fs.existsSync(MOD) ? fs.readdirSync(MOD) : "no mod dir");
    const tree = fs.readFileSync(treePath, "utf8");
    ok("the new tree does NOT claim Germany", !/tag\s*=\s*GER/.test(tree), tree);
    ok("…nor any other country", !/\btag\s*=/.test(tree), tree);
    ok("…and it scores 0, so the game never picks it", /country\s*=\s*\{\s*factor\s*=\s*0\s*\}/.test(tree.replace(/\s+/g, " ")), tree);
    ok("…the file is still a valid focus_tree", /focus_tree\s*=\s*\{/.test(tree) && indentIsSane(tree) === null, indentIsSane(tree));

    // the same template is used when adding a focus-tree FILE to an existing mod
    await breathe();
    const rFile = await post("/api/mod/add-focus-tree", { modPath: MOD, fileName: "second_tree" });
    await breathe();
    ok("adding a focus-tree file → 200", rFile.s === 200, rFile.b);
    const t2 = fs.readFileSync(path.join(MOD, "common", "national_focus", "second_tree.txt"), "utf8");
    ok("a new focus-tree FILE also claims nobody", !/tag\s*=\s*GER/.test(t2), t2);
    ok("…and also scores 0", /country\s*=\s*\{\s*factor\s*=\s*0\s*\}/.test(t2.replace(/\s+/g, " ")), t2);

    // ── a generated spirit is indented by its braces ──────────────────────────────────────────────
    const spiritFile = path.join(MOD, "common", "ideas", "probe_spirits.txt");
    const mk = (id, name, pic, mods) => post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId: id, targetRelativeFile: "common/ideas/probe_spirits.txt",
      mode: "create", category: "country", picture: pic, name, desc: name + " description.",
      removalCost: "-1", allowed: "original_tag = ZZZ",
      selectedEffects: [mods],
      targetLocalizationPath: "localisation/english/probe_ideas_l_english.yml",
    });
    await breathe();
    const r1 = await mk("probe_first", "First Spirit", "GFX_idea_generic_communism_drift_bonus", "modifier = {\n\tpolitical_power_gain = 0.1\n}");
    await breathe();
    ok("creating a spirit → 200", r1.s === 200, r1.b);
    ok("…the spirit file exists", fs.existsSync(spiritFile));
    let txt = fs.readFileSync(spiritFile, "utf8");
    ok("…and every line is indented to its brace depth", indentIsSane(txt) === null, { bad: indentIsSane(txt), txt });
    ok("…the closing brace is not at column 0 inside the container", !/^\}\s*$/m.test(txt.split("\n").slice(1, -2).join("\n")), txt);

    // a SECOND spirit into the same file must not disturb the first, and must land at the same depth
    await breathe();
    const r2 = await mk("probe_second", "Second Spirit", "GFX_idea_generic_democratic_drift_bonus", "modifier = {\n\tstability_factor = 0.05\n}");
    await breathe();
    ok("creating a second spirit → 200", r2.s === 200, r2.b);
    txt = fs.readFileSync(spiritFile, "utf8");
    ok("…the file is still indented by brace depth", indentIsSane(txt) === null, { bad: indentIsSane(txt), txt });
    ok("…both spirits are present", /probe_first\s*=\s*\{/.test(txt) && /probe_second\s*=\s*\{/.test(txt), txt);
    ok("…both kept their picture", (txt.match(/picture\s*=/g) || []).length === 2, txt);

    // ── the mod's OWN formatting is not normalised ────────────────────────────────────────────────
    // A spirit that already exists is merged into, so a deliberately odd layout must survive untouched.
    const ODD = [
      "ideas = {",
      "\tcountry = {",
      "\t\thand_written_spirit = {",
      "\t\t\t\tpicture = generic_communism_drift_bonus",   // deliberately over-indented by the author
      "\t\t\tmodifier = {",
      "\t\t\t\t\tpolitical_power_gain = 0.2",
      "\t\t\t}",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n");
    const oddFile = path.join(MOD, "common", "ideas", "hand_written.txt");
    fs.writeFileSync(oddFile, ODD, "utf8");
    await breathe();
    const r3 = await post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId: "hand_written_spirit", targetRelativeFile: "common/ideas/hand_written.txt",
      mode: "edit", category: "country", picture: "GFX_idea_generic_communism_drift_bonus",
      name: "Hand Written", desc: "Kept as written.",
      selectedEffects: ["modifier = {\n\tpolitical_power_gain = 0.2\n}"],
      targetLocalizationPath: "localisation/english/probe_ideas_l_english.yml",
    });
    await breathe();
    ok("editing an existing spirit → 200", r3.s === 200, r3.b);
    const oddNow = fs.readFileSync(oddFile, "utf8");
    ok("…the author's own indentation was NOT normalised", /\n\t\t\t\tpicture = generic_communism_drift_bonus/.test(oddNow), oddNow);

    // ── #spirit-section-indent — a TIDY spirit must survive an unchanged edit byte for byte ────────
    // The sections the editor rebuilds (allowed / modifier / available …) used to be written at a hardcoded
    // two tabs. A tidy mod writes a spirit's body at three (ideas → country → the spirit), so every edit
    // dedented those sections by a level and left their closing brace out of line with its opener. Nothing
    // broke — Clausewitz ignores whitespace — but editing ten spirits in someone else's mod reformatted ten
    // blocks underneath them.
    const TIDY = [
      "ideas = {",
      "\tcountry = {",
      "\t\ttidy_spirit = {",
      "\t\t\tpicture = generic_communism_drift_bonus",
      "\t\t\tremoval_cost = -1",
      "\t\t\tallowed = {",
      "\t\t\t\toriginal_tag = ZZZ",
      "\t\t\t}",
      "\t\t\tmodifier = {",
      "\t\t\t\tpolitical_power_gain = 0.1",
      "\t\t\t}",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n");
    const tidyFile = path.join(MOD, "common", "ideas", "tidy.txt");
    fs.writeFileSync(tidyFile, TIDY, "utf8");
    await breathe();
    const r4 = await post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId: "tidy_spirit", targetRelativeFile: "common/ideas/tidy.txt",
      mode: "edit", category: "country", picture: "GFX_idea_generic_communism_drift_bonus",
      name: "Tidy Spirit", desc: "Unchanged.", removalCost: "-1",
      selectedEffects: ["allowed = {\n\toriginal_tag = ZZZ\n}", "modifier = {\n\tpolitical_power_gain = 0.1\n}"],
      targetLocalizationPath: "localisation/english/probe_ideas_l_english.yml",
    });
    await breathe();
    ok("editing a tidy spirit → 200", r4.s === 200, r4.b);
    const tidyNow = fs.readFileSync(tidyFile, "utf8");
    ok("…an unchanged edit leaves it BYTE-IDENTICAL", tidyNow === TIDY, { now: tidyNow });
    ok("…so the sections keep the block's own indentation", /\n\t\t\tallowed = \{\n\t\t\t\toriginal_tag/.test(tidyNow), tidyNow);
    ok("…and every line still matches its brace depth", indentIsSane(tidyNow) === null, indentIsSane(tidyNow));

    console.log("\ntest-new-mod-tree-and-idea-indent: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
