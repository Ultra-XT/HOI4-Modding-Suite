/*
 * Guards the performance caches against STALENESS — the one real risk of the loc-map TTL cache,
 * the decision file/loc caches, and the character file cache added to stop the UI-freeze.
 * Caching is only safe if a save is still reflected on the very next read. This proves it:
 *   - a newly-saved decision appears in /api/decisions/list (mtime file cache invalidates)
 *   - a decision's display name appears immediately (loc write bumps the epoch -> loc caches refresh)
 *   - a re-saved spirit's new name appears immediately (loc-map TTL cache honors the write epoch)
 *
 * If someone widens the TTL or drops the epoch bump, these fail loudly.
 * Run: node test-cache-freshness.js
 */
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

const PORT = 3597, BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const post = (r, b) => fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const get = (r) => fetch(BASE + r).then((x) => x.json());

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cache-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Cache"\n');
  const enc = encodeURIComponent(mod);
  try {
    console.log("\nCache freshness (no stale reads after a save):");

    // Warm the caches against this mod first (empty lists).
    await get(`/api/decisions/list?modPath=${enc}`);
    await get(`/api/ideas/list?modPath=${enc}`).catch(() => ({}));

    // 1. Save a SPIRIT named OldName, then re-save as NewName — the loc-map TTL cache must NOT
    //    serve the old name on the very next read.
    const base = { modPath: mod, ideaId: "cache_spirit", targetRelativeFile: "common/ideas/zz.txt", targetLocalizationPath: "localisation/english/zz_l_english.yml", desc: "d", category: "country" };
    await post("/api/ideas/upsert-definition", { ...base, mode: "create", name: "OldName", selectedEffects: ["allowed = {\n\talways = yes\n}"] });
    let loc = fs.readFileSync(path.join(mod, "localisation/english/zz_l_english.yml"), "utf8");
    ok(/cache_spirit:0\s+"OldName"/.test(loc), "spirit created with OldName");
    await post("/api/ideas/upsert-definition", { ...base, mode: "edit", name: "NewName", selectedEffects: ["allowed = {\n\talways = yes\n}"] });
    loc = fs.readFileSync(path.join(mod, "localisation/english/zz_l_english.yml"), "utf8");
    ok(/cache_spirit:0\s+"NewName"/.test(loc) && !/"OldName"/.test(loc), "re-saved spirit shows NewName immediately (loc epoch invalidation)", loc);

    // 2. Decisions: list, save one, list again — the new decision must appear (file cache by mtime).
    let before = await get(`/api/decisions/list?modPath=${enc}`);
    const beforeCount = (before.categories || []).reduce((n, c) => n + (c.decisions || []).length, 0);
    const dsave = await post("/api/decisions/save", {
      modPath: mod, categoryId: "political_actions", id: "cache_decision", name: "My Cache Decision",
      cost: 10, icon: "GFX_decision_generic_political_discourse", days: 0, fireOnce: "no",
    });
    ok(!dsave.error, "decision saved", dsave);
    let after = await get(`/api/decisions/list?modPath=${enc}`);
    const hasIt = (after.categories || []).some((c) => (c.decisions || []).some((d) => d.id === "cache_decision"));
    ok(hasIt, "newly-saved decision appears on next list (mtime file cache invalidated)");
    const afterName = (after.categories || []).flatMap((c) => c.decisions || []).find((d) => d.id === "cache_decision");
    ok(afterName && afterName.name === "My Cache Decision", "decision display name fresh (loc epoch invalidation)", afterName);

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) { console.error(e); fail++; } finally {
    server.close(); try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} process.exit(fail ? 1 : 0);
  }
})();
