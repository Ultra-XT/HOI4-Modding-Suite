// #catalog-race-refills-stale — a spirit saved while the catalog is loading must still appear in the picker.
//
// The in-memory catalog was served on its TTL alone, unlike the disk copy which is validated against a file
// fingerprint. That made a save invisible for the rest of the TTL window — but the worse case is the race: a
// catalog request already in flight when the save lands goes on to STORE the items it computed from the
// pre-write files, and it stores them AFTER the save cleared the cache. The invalidation is undone by a
// request that started before it, so the new spirit stays missing from the picker for the whole session.
//
// An epoch counter fixes both: the request captures it before scanning, and skips the store if a write bumped
// it in the meantime.
//
// Verified non-vacuous: with the epoch guard removed this fails 8 rounds out of 8, and passes 8 out of 8 with
// it. Getting there took two corrections worth remembering, because both made the test pass while proving
// nothing:
//   1. Firing the save and the catalog together puts the write at ~0% of the build, so the scan just reads the
//      new file. The losing window is MID-build — after the files are read, before the result is stored.
//   2. Timing the build from an already-warm cache measures a fingerprint-validated disk-cache hit (~20 ms),
//      not a real scan. The build has to start from a CLEARED cache to be slow enough to race, which is
//      exactly what happens in the app: a save clears it, and the sidebar reload that follows is not awaited.
//
// Both directions: an uncontended request must still populate the cache, or the fix would just disable caching
// and trade a correctness bug for a performance one.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-catrace-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "racemod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RaceMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tnova_seed = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n", "utf8");

// The catalog scan must be SLOW enough that a save can land while it is still running — that overlap is the
// entire bug. With a two-file mod the scan finishes first and the race never happens, which made an earlier
// version of this test pass even with the fix removed. The fingerprint pass stats every idea file in awaited
// batches, so a few hundred files give real yield points to land a write in.
const FILLER = 600;
for (let i = 0; i < FILLER; i++) {
  fs.writeFileSync(
    path.join(MOD, "common", "ideas", `nova_filler_${i}.txt`),
    `ideas = {\n\tcountry = {\n\t\tnova_filler_${i} = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n`,
    "utf8"
  );
}

const PORT = 42169;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const catalogIds = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${q}&modPath=${q}`);
    const b = await r.json().catch(() => null);
    return ((b && b.items) || []).map((i) => i && i.ideaId).filter(Boolean);
  };
  const saveSpirit = async (id) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, ideaId: id, targetRelativeFile: "custom_ideas.txt",
        mode: "create", category: "country", name: id,
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── CONTROL: caching must still work at all ─────────────────────────────────────────────────
    console.log("\n[control] the catalog still caches when nothing is racing it");
    const first = await catalogIds();
    rec("the catalog loads", first.length > 0, first);
    rec("…and contains the seeded spirit", first.includes("nova_seed"), first);
    const second = await catalogIds();
    rec("a second request returns the same set", second.length === first.length, { first: first.length, second: second.length });

    // ── THE RACE ─────────────────────────────────────────────────────────────────────────────────
    // A lost invalidation is a timing bug, so one attempt proves nothing; each round races a fresh id.
    console.log("\n[race] a save landing PART WAY through the catalog build");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // This mirrors what public/ideas.js actually does, which is what makes the window reachable: a save clears
    // the cache, the sidebar reload it triggers is fired WITHOUT await, and a second save lands while that
    // reload is still building. Starting from a cleared cache matters — otherwise the "build" is just a
    // fingerprint-validated disk-cache hit that finishes in about 20 ms and nothing can race it.
    const t0 = Date.now();
    await saveSpirit("nova_timing_probe");   // clears the cache, forcing a genuine rebuild next
    const tSave = Date.now();
    await catalogIds();
    const buildMs = Math.max(Date.now() - tSave, 10);
    console.log(`  (save ${tSave - t0} ms, full rebuild ≈ ${buildMs} ms; landing each save mid-rebuild)`);

    const ROUNDS = 8;
    const missing = [];
    for (let i = 0; i < ROUNDS; i++) {
      const id = `nova_race_${i}`;
      await saveSpirit(`nova_primer_${i}`);        // clears the cache
      const inFlight = catalogIds();                // …so this is a full rebuild
      await sleep(Math.max(Math.round(buildMs * 0.5), 5)); // land the write inside it
      const save = await saveSpirit(id);
      await inFlight;
      if (!(save.body && save.body.ok !== false)) {
        rec(`round ${i}: the save succeeded`, false, save.body || save.status);
        break;
      }
      const after = await catalogIds();
      if (!after.includes(id)) missing.push(id);
    }
    rec(`every spirit saved during a catalog request is offered (${ROUNDS} rounds)`, missing.length === 0,
      { missing, note: "these were saved successfully but never appeared in the picker" });

    // The seeded spirit must still be there too — the fix must not have emptied anything.
    const finalIds = await catalogIds();
    rec("the original spirit is still listed", finalIds.includes("nova_seed"), finalIds.slice(0, 8));
    rec("…and the catalog grew by every raced spirit", finalIds.length >= first.length + ROUNDS,
      { before: first.length, after: finalIds.length, atLeast: first.length + ROUNDS });

    console.log(`\n=== catalog race refill: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
