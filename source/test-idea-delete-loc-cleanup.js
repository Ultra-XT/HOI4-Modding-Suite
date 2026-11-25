// Regression: deleting a national spirit / idea must strip its localization (title + _desc) from the loc file
// it actually lives in — NOT just a hard-coded default. The delete defaulted the loc path to
// focus_editor_imported_ideas_l_english.yml, but the save writes loc to a file named after the idea's target
// (custom_ideas.txt → custom_ideas_l_english.yml), so a deleted spirit ORPHANED its loc keys. Found by deep UI
// testing (the spirit's title/desc stayed in custom_ideas_l_english.yml after delete). Run: node test-idea-delete-loc-cleanup.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3497, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-idealoc-"));
  mk(path.join(mod, "descriptor.mod"), 'name="IdeaLoc"\n');
  // an idea in custom_ideas.txt + its loc in custom_ideas_l_english.yml (the file the save uses)
  mk(path.join(mod, "common", "ideas", "custom_ideas.txt"),
    "ideas = {\n\tcountry = {\n\t\tzztest_idea = {\n\t\t\tpicture = generic\n\t\t\tmodifier = { political_power_factor = 0.1 }\n\t\t}\n\t\tkeep_me_idea = {\n\t\t\tpicture = generic\n\t\t}\n\t}\n}\n");
  const locFile = path.join(mod, "localisation", "english", "custom_ideas_l_english.yml");
  mk(locFile, "﻿l_english:\n zztest_idea:0 \"Test Spirit\"\n zztest_idea_desc:0 \"Test spirit description.\"\n keep_me_idea:0 \"Keep Me\"\n");
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
  try {
    // delete WITHOUT passing a loc path — the bug was the default loc path missed the real file
    const r = await post("/api/ideas/delete-definition", { modPath: mod, ideaId: "zztest_idea", targetRelativeFile: "custom_ideas.txt" });
    ok(r.ok, "delete-definition ok", r);
    const ideaTxt = fs.readFileSync(path.join(mod, "common", "ideas", "custom_ideas.txt"), "utf8");
    ok(!/zztest_idea\s*=\s*\{/.test(ideaTxt), "the idea block is removed");
    ok(/keep_me_idea\s*=\s*\{/.test(ideaTxt), "the sibling idea is preserved");
    const locTxt = fs.readFileSync(locFile, "utf8");
    ok(!/zztest_idea:0/.test(locTxt), "the title loc line is removed (no orphan)");
    ok(!/zztest_idea_desc:0/.test(locTxt), "the _desc loc line is removed (no orphan)");
    ok(/keep_me_idea:0/.test(locTxt), "the sibling's loc is preserved (no over-deletion)");
  } catch (e) { ok(false, "threw: " + e.message); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n  ${pass} passed, ${fail} failed`);
    // Reliable teardown on Windows: set exitCode + closeAllConnections + close (NEVER process.exit, which
    // aborts mid-close with UV_HANDLE_CLOSING and scores a passing test as FAILED).
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
