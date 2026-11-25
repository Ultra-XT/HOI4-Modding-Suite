// Ideas maker extra-script passthrough: a raw block (e.g. targeted_modifier) pushed into selectedEffects is
// emitted VERBATIM inside the idea block, so copying a base-mod spirit with fields the form doesn't model
// (targeted_modifier, rule, on_remove, …) stays faithful. Run: node test-idea-extra-script.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-idea-extra-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="IdeaExtra"\n');
const PORT = 39564, app = createApp();
const server = app.listen(PORT, async () => {
  const call = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const extra = 'targeted_modifier = {\n\ttag = ENG\n\tattack_bonus_against = 0.1\n\tdefense_bonus_against = 0.1\n}';
    const r = await call("/api/ideas/upsert-definition", { modPath: mod, ideaId: "test_sinai", targetRelativeFile: "custom_ideas.txt", targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml", name: "Test Sinai", desc: "", picture: "militant_group_soldier", category: "country", mode: "create", selectedEffects: [extra] });
    ok("upsert responds ok", r.s === 200 && r.b.ok !== false, r.b);
    const f = path.join(mod, "common", "ideas", "custom_ideas.txt");
    const txt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
    ok("idea block written", /test_sinai\s*=\s*\{/.test(txt));
    ok("targeted_modifier emitted verbatim (tag + bonuses)", /targeted_modifier\s*=\s*\{[\s\S]*tag\s*=\s*ENG[\s\S]*attack_bonus_against\s*=\s*0\.1[\s\S]*defense_bonus_against\s*=\s*0\.1/.test(txt), txt.slice(0, 320));
    ok("picture preserved", /picture\s*=\s*militant_group_soldier/.test(txt));
    console.log(`\ntest-idea-extra-script: ${pass}/${total} checks passed`);
  } catch (e) { console.error("ERROR", e); }
  finally {
    // exitCode + closeAllConnections + close (no forced process.exit — avoids the Windows UV_HANDLE_CLOSING abort)
    process.exitCode = pass === total && total >= 4 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
