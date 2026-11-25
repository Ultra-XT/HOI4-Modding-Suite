/*
 * Regression test for the national-spirit EDIT data-loss bug.
 *
 * Before the fix, editing an existing spirit routed through a structured-payload-only path
 * (mergeEditModeModifierIntoIdeaBlock) that couldn't parse the editor's plain-string sections.
 * Result: changes to available/allowed were silently dropped, and — worse — the existing
 * `modifier` block was DELETED entirely (the sanitizer parsed nothing, so the modifier was
 * removed). The modifier is the whole point of a national spirit, so this was catastrophic.
 *
 * The fix routes plain-string payloads through mergePlainStringEffectsIntoIdeaBlock for both
 * create AND edit. This test locks in: edits persist, the modifier survives + updates, nested
 * conditions round-trip, and sections the editor doesn't send are preserved.
 *
 * Run: node test-spirit-edit.js
 */
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

const PORT = 3593, BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spirit-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="X"\n');
  const rel = "common/ideas/zz_test.txt";
  const file = path.join(mod, rel);
  const post = (b) => fetch(BASE + "/api/ideas/upsert-definition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  const read = () => fs.readFileSync(file, "utf8");
  // A localisation file that opens with a COMMENT before the l_english: header (valid; real mods ship these).
  // The ideas maker's save must add the spirit's keys WITHOUT prepending a SECOND header (the pass-29 fix).
  const locFile = path.join(mod, "localisation/english/x_l_english.yml");
  fs.mkdirSync(path.dirname(locFile), { recursive: true });
  fs.writeFileSync(locFile, "﻿# Author(s): Someone\nl_english:\n existing_other_spirit:0 \"Keep me\"\n", "utf8");
  const readLoc = () => fs.readFileSync(locFile, "utf8");
  const base = { modPath: mod, ideaId: "test_spirit", targetRelativeFile: rel, targetLocalizationPath: "localisation/english/x_l_english.yml", name: "Test", desc: "d", category: "country" };
  try {
    console.log("\nNational spirit edit (modifier + condition persistence):");

    // 1. CREATE with allowed + modifier.
    await post({ ...base, mode: "create", selectedEffects: ["allowed = {\n\talways = yes\n}", "modifier = {\n\tpolitical_power_gain = 0.1\n}"] });
    let t = read();
    ok(/modifier\s*=\s*\{[^}]*political_power_gain\s*=\s*0\.1/.test(t), "create: modifier 0.1 written", t);

    // 2. EDIT modifier 0.1 -> 0.2: must UPDATE, not delete.  (the core bug)
    await post({ ...base, mode: "edit", selectedEffects: ["allowed = {\n\talways = yes\n}", "modifier = {\n\tpolitical_power_gain = 0.2\n}"] });
    t = read();
    ok(/political_power_gain\s*=\s*0\.2/.test(t), "edit: modifier UPDATED to 0.2", t);
    ok(/modifier\s*=\s*\{/.test(t), "edit: modifier block still present (NOT deleted)", t);
    ok(!/0\.1/.test(t), "edit: old modifier value replaced");

    // 3. EDIT a condition (allowed -> add a real trigger). Must persist.
    await post({ ...base, mode: "edit", selectedEffects: ["allowed = {\n\toriginal_tag = GER\n}", "modifier = {\n\tpolitical_power_gain = 0.2\n}"] });
    t = read();
    ok(/allowed\s*=\s*\{[^}]*original_tag\s*=\s*GER/.test(t), "edit: allowed condition updated", t);

    // 4. EDIT with a NESTED condition (OR block) — nesting must round-trip.
    await post({ ...base, mode: "edit", selectedEffects: ["allowed = {\n\tOR = {\n\t\ttag = GER\n\t\ttag = ITA\n\t}\n}", "modifier = {\n\tpolitical_power_gain = 0.2\n}"] });
    t = read();
    ok(/OR\s*=\s*\{[\s\S]*tag\s*=\s*GER[\s\S]*tag\s*=\s*ITA[\s\S]*\}/.test(t), "edit: nested OR condition preserved", t);
    const depthOk = (() => { let d = 0, max = 0; for (const c of t) { if (c === "{") { d++; max = Math.max(max, d); } else if (c === "}") d--; } return d === 0; })();
    ok(depthOk, "edit: braces balanced after nested edit");

    // 5. A section the editor does NOT send must be preserved (simulate a hand-added key).
    let raw = read().replace(/test_spirit = \{/, 'test_spirit = {\n\t\t\tcancel_if_invalid = no');
    fs.writeFileSync(file, raw, "utf8");
    await post({ ...base, mode: "edit", selectedEffects: ["allowed = {\n\talways = yes\n}", "modifier = {\n\tpolitical_power_gain = 0.3\n}"] });
    t = read();
    ok(/cancel_if_invalid\s*=\s*no/.test(t), "edit: unsent section (cancel_if_invalid) preserved", t);
    ok(/political_power_gain\s*=\s*0\.3/.test(t), "edit: modifier still updates alongside preserved section");

    // 6. visible / on_add now work via the same path (the deepening ask).
    await post({ ...base, mode: "edit", selectedEffects: ["allowed = {\n\talways = yes\n}", "modifier = {\n\tpolitical_power_gain = 0.3\n}", "on_add = {\n\tadd_political_power = 50\n}"] });
    t = read();
    ok(/on_add\s*=\s*\{[^}]*add_political_power\s*=\s*50/.test(t), "edit: on_add section written", t);

    // 7. LOCALISATION round-trip through the real ideas maker (end-to-end proof of the loc-header fix):
    //    the comment-prefixed loc file must keep EXACTLY ONE l_english: header (no double-header), its
    //    leading comment + pre-existing key survive, and the spirit's own name key gets written.
    const loc = readLoc();
    ok((loc.match(/^\s*l_english\s*:/gim) || []).length === 1, "loc: exactly ONE l_english: header (no double-header on comment-prefixed file)", loc.slice(0, 90));
    ok(/#\s*Author\(s\):\s*Someone/.test(loc), "loc: leading author comment preserved", loc.slice(0, 90));
    ok(/existing_other_spirit:\d*\s+"Keep me"/.test(loc), "loc: pre-existing key preserved", loc.slice(0, 160));
    ok(/\btest_spirit:\d*\s+"Test"/.test(loc), "loc: the spirit's name key written", loc.slice(0, 300));

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) { console.error(e); fail++; } finally {
    // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
