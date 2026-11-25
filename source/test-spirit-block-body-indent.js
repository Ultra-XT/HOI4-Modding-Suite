// #spirit-block-body-indent — a spirit's sections came back with their contents flush against the key.
//
// The editor holds each section's body dedented to column zero, which is what makes it readable in a
// textarea, and the save re-wraps it as `allowed = {\n<body>\n}`. The merge then padded every line by the
// same body indent, so the file ended up with:
//
//     allowed = {
//     original_tag = NUA
//     }
//
// Clausewitz does not care. Every human reading the file does, and the nested cases came out worse than
// merely flat: an `on_add` containing `if = { limit = { … } }` had the `if` sitting flush against the
// `on_add` while the `limit` inside it kept its own depth, so the block read inside-out.
//
// This is the third instance of one family. The tech serializer flattened ai_will_do and modifier bodies
// (fixed separately); characters, events and decisions were always right because they route through the
// shared reindent helper. Spirits went through their own merge path, which padded uniformly.
//
// The guard that matters is the negative one: a body that ALREADY carries its own nesting, and the verbatim
// passthrough used for blocks the form does not model, must be emitted exactly as they arrive. Both are
// asserted below, because a fix that indents unconditionally would corrupt them on every save.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-spirit-indent-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "spirit_indent_probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpiritIndent"\nsupported_version="1.19.*"\n');

const REL = "common/ideas/zz_indent.txt";
const abs = path.join(MOD, "common", "ideas", "zz_indent.txt");
const read = () => { try { return fs.readFileSync(abs, "utf8"); } catch (_) { return ""; } };
const balanced = (t) => { let d = 0; for (const c of String(t).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") d--; if (d < 0) return false; } return d === 0; };

const PORT = 39617, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 180));

  const save = (ideaId, effects) => post("/api/ideas/upsert-definition", {
    modPath: MOD, ideaId, targetRelativeFile: REL,
    targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    name: "Indent Probe", desc: "d", picture: "GFX_idea_generic_army_bonus",
    selectedEffects: effects, mode: "create", category: "country",
    traits: [], cost: "", removalCost: "", ledger: "",
  });

  try {
    // Bodies exactly as the editor sends them: dedented to column zero inside the wrapper.
    const r = await save("zz_indent_probe", [
      "allowed = {\noriginal_tag = NUA\n}",
      "modifier = {\nresearch_speed_factor = 0.05\nstability_factor = 0.03\n}",
      "on_add = {\ncustom_effect_tooltip = zz_tt\nif = {\n\tlimit = {\n\t\thas_war = yes\n\t}\n\tadd_stability = 0.02\n}\n}",
    ]);
    await breathe();
    ok("saving → 200", r.s === 200, r.b);

    const t = read();
    ok("the file is valid", balanced(t), t.slice(0, 200));
    ok("a flat section body is nested under its key", /\n\t{4}original_tag = NUA\b/.test(t), t);
    ok("…and so is a two-line one", /\n\t{4}research_speed_factor = 0\.05\b/.test(t) && /\n\t{4}stability_factor = 0\.03\b/.test(t), t);

    // The nested case is the one that read inside-out before: `if` must sit one level inside `on_add`,
    // and `limit` one level inside `if`, not the other way round.
    ok("a nested block's own depth is kept relative to its parent", /\n\t{4}if = \{/.test(t), t);
    ok("…its inner block goes deeper still", /\n\t{5}limit = \{/.test(t), t);
    ok("…and deeper again inside that", /\n\t{6}has_war = yes\b/.test(t), t);
    ok("…siblings of the inner block share its depth", /\n\t{5}add_stability = 0\.02\b/.test(t), t);

    // ── a body that ALREADY carries its nesting must not be pushed in again ───────────────────────
    await breathe();
    await save("zz_indent_pre", [
      "allowed = {\n\toriginal_tag = NUA\n}",
    ]);
    await breathe();
    const t2 = read();
    ok("an already-indented body is left alone", /\n\t{4}original_tag = NUA\b/.test(t2) && !/\n\t{5}original_tag = NUA\b/.test(t2), t2);

    // ── the verbatim passthrough is not a single wrapper, so it must pass through untouched ───────
    // This is how a block the form does not model (rule, targeted_modifier, on_remove …) survives a save.
    await breathe();
    await save("zz_indent_extra", [
      "modifier = {\npolitical_power_gain = 0.05\n}",
      "targeted_modifier = {\n\ttag = FRA\n\tattack_bonus = 0.1\n}\nrule = {\n\tcan_declare_war_on_neighbours = no\n}",
    ]);
    await breathe();
    const t3 = read();
    ok("multi-statement passthrough still lands in the file", /targeted_modifier = \{/.test(t3) && /rule = \{/.test(t3), t3.slice(0, 400));
    ok("…with its own nesting intact", /\n\t{4}tag = FRA\b/.test(t3) && /\n\t{4}can_declare_war_on_neighbours = no\b/.test(t3), t3.slice(0, 600));
    ok("…and the file is still valid", balanced(t3), t3.slice(0, 200));

    // ── saving twice must not drift ───────────────────────────────────────────────────────────────
    await breathe();
    const before = read();
    await save("zz_indent_probe", [
      "allowed = {\noriginal_tag = NUA\n}",
      "modifier = {\nresearch_speed_factor = 0.05\nstability_factor = 0.03\n}",
    ]);
    await breathe();
    ok("re-saving does not push the body in a second time",
      !/\n\t{5}original_tag = NUA\b/.test(read()), read().slice(0, 400));
    void before;

    console.log("\ntest-spirit-block-body-indent: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 11 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
