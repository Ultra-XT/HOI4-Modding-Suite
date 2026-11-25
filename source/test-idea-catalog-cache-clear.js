// #idea-write-without-cache-clear — creating a company with the "also works without AAT" idea twin wrote
// common/ideas/nova_companies.txt but never cleared the ideas catalog, so the new idea was invisible to every
// spirit/idea picker in the app.
//
// /api/ideas/catalog is served from an in-memory Map with a 24-HOUR TTL and — unlike the disk cache it fronts,
// which IS fingerprint-validated — no fingerprint check at all. So every endpoint that writes common/ideas has
// to call clearIdeasCatalogCache() by hand. /api/ideas/import does, /api/ideas/delete-definition does,
// /api/ideas/upsert-definition does. The /api/mio handler's idea-twin branch calls
// upsertIdeaDefinitionInIdeasFile() and did not, and the helper didn't either — safeModWrite invalidates the
// mod-index cache, not the ideas catalog.
//
// The clear now lives in the HELPER rather than at the call site, so a future writer cannot repeat the
// omission. Clearing a cache only ever costs a rebuild, so doing it unconditionally after a write that has
// already succeeded is safe.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-ideacache-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="C"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "common", "ideas", "existing.txt"),
  "ideas = {\n\tcountry = {\n\t\tprobe_existing_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.05 }\n\t\t}\n\t}\n}\n", "utf8");

const PORT = 40009, app = createApp();
const server = app.listen(PORT, async () => {
  const catalog = () => fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`)
    .then((r) => r.json()).then((j) => (j.items || []).map((i) => i.ideaId || i.id).filter(Boolean));
  try {
    // 1. warm the cache — this is what every picker in the app reads
    const before = await catalog();
    ok("the catalog is warm and lists the existing spirit", before.includes("probe_existing_spirit"), before.slice(0, 8));
    ok("…and does not yet know the company idea", !before.includes("probe_tank_co"), before.slice(0, 8));

    // 2. create a company WITH the idea twin
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mio`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, id: "probe_tank_co", name: "Probe Tank Co", desc: "Builds tanks.",
        allowedTag: "GER", icon: "", fileName: "nova_mio.txt",
        equipmentType: ["medium_tank_chassis"], researchCategories: [], include: [],
        initial: { equipmentBonus: {}, productionBonus: {} }, traits: [],
        companyType: "tank_manufacturer", writeIdeaFallback: true, // must be a DESIGNER_IDEA_CATEGORIES value or the branch is skipped
      }),
    }).then((x) => x.json());
    ok("the company saves", r && r.ok, r);
    ok("…and reports the idea fallback was written", r.ideaFallback && r.ideaFallback.ok, r.ideaFallback);

    // 3. the bytes really are on disk
    const ideasDir = path.join(MOD, "common", "ideas");
    const ideaFiles = fs.readdirSync(ideasDir);
    const ideaTxt = ideaFiles.map((f) => fs.readFileSync(path.join(ideasDir, f), "utf8")).join("\n");
    ok("the idea twin is on disk", /probe_tank_co\s*=\s*\{/.test(ideaTxt), ideaFiles);

    // 4. THE BUG: the catalog every picker reads must now see it
    const after = await catalog();
    ok("THE PICKERS CAN SEE THE NEW IDEA", after.includes("probe_tank_co"), after.slice(0, 10));
    ok("…and the pre-existing spirit is still there", after.includes("probe_existing_spirit"), after.slice(0, 10));
    ok("…so the catalog grew by exactly one", after.length === before.length + 1, { before: before.length, after: after.length });

    // 5. a plain spirit write must still invalidate too (the path that already worked)
    const u = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, ideaId: "probe_new_spirit", targetRelativeFile: "existing.txt", mode: "create", category: "country", modifiers: { stability_factor: 0.1 } }),
    }).then((x) => x.json());
    ok("a plain spirit upsert succeeds", u && u.ok, u);
    const after2 = await catalog();
    ok("…and is visible immediately as well", after2.includes("probe_new_spirit"), after2.slice(0, 10));

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    // Slice to the helper's REAL end, not a guessed character count — it spans ~13k chars, and a short
    // window silently excluded the very line under test.
    const hStart = src.indexOf("function upsertIdeaDefinitionInIdeasFile");
    const hEnd = src.indexOf("\nfunction ", hStart + 10);
    const helper = src.slice(hStart, hEnd === -1 ? src.length : hEnd);
    ok("the helper itself clears the ideas catalog", /clearIdeasCatalogCache\(\);/.test(helper), "helper does not clear");
    ok("…right after the write that succeeded", helper.indexOf('safeModWrite(abs, finalRebuilt, "spirit-save")') < helper.indexOf("clearIdeasCatalogCache()"), "clear runs before the write");
    ok("…and it explains why", /#idea-write-without-cache-clear/.test(helper), "no marker comment");

    console.log("\ntest-idea-catalog-cache-clear: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 13 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
