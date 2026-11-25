// Ideas maker: a MULTI-block "Extra script" (several un-modeled sections in one textarea, e.g.
// on_remove {…} cancel {…} targeted_modifier {…}) must round-trip without duplication. The merge used to
// read only the FIRST top-level token of the string, so on edit it stripped just `on_remove` and left the
// rest — then re-inserted the whole string, duplicating cancel + targeted_modifier. This proves each
// section appears exactly once after create AND after a re-save (edit). Run: node test-idea-extra-script-multiblock.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };
const count = (s, re) => (s.match(re) || []).length;
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-idea-multi-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="IdeaMulti"\n');
const app = createApp();
const server = app.listen(0, async () => {
  const PORT = server.address().port;
  const call = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const f = path.join(mod, "common", "ideas", "custom_ideas.txt");
  // One textarea → one string holding THREE top-level blocks (each opening brace on its own line, as the
  // maker writes them and as a modder would paste them).
  const extra = [
    "on_remove = {",
    "\tadd_political_power = 50",
    "}",
    "cancel = {",
    "\thas_war = no",
    "}",
    "targeted_modifier = {",
    "\ttag = ENG",
    "\tattack_bonus_against = 0.1",
    "}",
  ].join("\n");
  const payload = (mode) => ({
    modPath: mod, ideaId: "test_multi", targetRelativeFile: "custom_ideas.txt",
    targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    name: "Test Multi", desc: "", picture: "militant_group_soldier", category: "country", mode,
    // Mirrors the real client: modeled modifier block + the multi-block extra script as ONE string.
    selectedEffects: ["modifier = {\n\tstability_factor = 0.05\n}", extra],
  });
  try {
    // ── create ──
    const r1 = await call("/api/ideas/upsert-definition", payload("create"));
    ok("create responds ok", r1.s === 200 && r1.b.ok !== false, r1.b);
    let txt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
    ok("block written + brace-balanced", /test_multi\s*=\s*\{/.test(txt) && balanced(txt));
    ok("on_remove once after create", count(txt, /\bon_remove\s*=\s*\{/g) === 1, count(txt, /\bon_remove\s*=\s*\{/g));
    ok("cancel once after create", count(txt, /\bcancel\s*=\s*\{/g) === 1, count(txt, /\bcancel\s*=\s*\{/g));
    ok("targeted_modifier once after create", count(txt, /\btargeted_modifier\s*=\s*\{/g) === 1);
    ok("modifier (modeled) once after create", count(txt, /\bmodifier\s*=\s*\{/g) === 1, count(txt, /\bmodifier\s*=\s*\{/g));

    // ── edit: re-send the SAME multi-block extra script. Without the fix, cancel + targeted_modifier
    //    would now appear TWICE (stripped only on_remove, re-added all three). ──
    const r2 = await call("/api/ideas/upsert-definition", payload("edit"));
    ok("edit responds ok", r2.s === 200 && r2.b.ok !== false, r2.b);
    txt = fs.readFileSync(f, "utf8");
    ok("brace-balanced after edit", balanced(txt), txt.slice(0, 400));
    ok("on_remove STILL once after edit (no dup)", count(txt, /\bon_remove\s*=\s*\{/g) === 1, count(txt, /\bon_remove\s*=\s*\{/g));
    ok("cancel STILL once after edit (no dup)", count(txt, /\bcancel\s*=\s*\{/g) === 1, count(txt, /\bcancel\s*=\s*\{/g));
    ok("targeted_modifier STILL once after edit (no dup)", count(txt, /\btargeted_modifier\s*=\s*\{/g) === 1, count(txt, /\btargeted_modifier\s*=\s*\{/g));
    ok("modifier STILL once after edit", count(txt, /\bmodifier\s*=\s*\{/g) === 1, count(txt, /\bmodifier\s*=\s*\{/g));
    ok("exactly one test_multi block after edit", count(txt, /\btest_multi\s*=\s*\{/g) === 1);
    console.log(`\ntest-idea-extra-script-multiblock: ${pass}/${total} checks passed`);
  } catch (e) { console.error("ERROR", e); }
  finally {
    process.exitCode = pass === total && total >= 13 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
