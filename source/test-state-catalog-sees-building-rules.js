// #state-catalog-cache-blind-to-building-rules — THE SLOT NUMBERS WERE CACHED AGAINST THE WRONG FILES.
//
// The state catalogue is cached to DISK, fingerprinted over history/states. But every entry's `slots`
// (base, sharedAdded, cap, used, sharedMax) and `perTypeMax` are computed from buildingMeta, which is read
// from common/buildings, common/state_category and common/defines — none of which the fingerprint covered.
//
// Raise a state category's local_building_slots, change a building's level_cap or shares_slots, or edit
// MAX_SHARED_SLOTS, and every state's numbers stayed wrong FOR EVER: history/states had not moved, so the
// entry remained a valid cache hit against a matching fingerprint, restarts included. The same permanent
// shape as #country-name-stale-forever — not stale for five minutes, stale until some unrelated state file
// happens to change.
//
// ⚠️ AND IT GOT SHARPER THE DAY IT WAS FOUND. MAX_SHARED_SLOTS was scanned with a .txt-only walker while
// common/defines holds only .lua, so it sat at 25 for every mod until that was fixed
// (#defines-scanned-for-txt-but-they-are-lua). Every statecatalog_*.json written before that fix carries the
// old 25 and, absent a schema bump, would have gone on serving it — the fix armed the staleness.
//
// The fingerprint now hashes the buildingMeta VALUE rather than listing its source files, which cannot miss
// an input, and the in-memory key carries it too.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statecat-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
// Two mods with IDENTICAL history/states and DIFFERENT building rules. That is the whole probe: the
// fingerprint used to see only the half that is identical, so the second mod was served the first's answer.
const STATES = "state = {\n\tid = 900\n\tname = \"STATE_900\"\n\tmanpower = 100\n\tstate_category = nova_probe_category\n" +
  "\thistory = {\n\t\towner = GER\n\t\tvictory_points = { 1 1 }\n\t}\n\tprovinces = { 1 }\n}\n";
const mk = (name, slots, sharedMax) => {
  const M = path.join(ROOT, name);
  fs.mkdirSync(path.join(M, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(M, "common", "state_category"), { recursive: true });
  fs.mkdirSync(path.join(M, "common", "defines"), { recursive: true });
  // replace_path="history/states": 900-Nova.txt is this mod's whole state list. Without it the installed game's 900-Benue.txt loads
  // beside it and, sorting first, is the state 900 HOI4 keeps and the one the catalogue lists (#the-state-the-game-keeps), with the
  // game's category rather than nova_probe_category. This test is about the building rules the catalogue is cached against.
  fs.writeFileSync(path.join(M, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\n`);
  fs.writeFileSync(path.join(ROOT, name + ".mod"), `name="${name}"\npath="${toPosix(M)}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(M, "history", "states", "900-Nova.txt"), STATES);
  fs.writeFileSync(path.join(M, "common", "state_category", "zz_nova.txt"),
    `nova_probe_category = {\n\tlocal_building_slots = ${slots}\n\tcolor = { 100 100 100 }\n}\n`);
  fs.writeFileSync(path.join(M, "common", "defines", "zz_nova_defines.lua"),
    `NDefines = {\n\tNBuildings = {\n\t\tMAX_SHARED_SLOTS = ${sharedMax},\n\t},\n}\n`);
  return M;
};
const LOW = mk("statecatlow", 4, 11);
const HIGH = mk("statecathigh", 9, 33);

const PORT = 53081;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const slotsOf = async (root) => {
      const j = await fetch(`http://127.0.0.1:${PORT}/api/buildings/state-catalog?modPath=${encodeURIComponent(root)}`)
        .then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const items = (j && (j.items || j.states)) || (Array.isArray(j) ? j : []);
      const it = items.find((x) => x && String(x.stateId) === "900");
      return it ? it.slots : null;
    };

    console.log("\n[CONTROL] the two mods really do share their history/states");
    {
      const a = fs.readFileSync(path.join(LOW, "history", "states", "900-Nova.txt"), "utf8");
      const b = fs.readFileSync(path.join(HIGH, "history", "states", "900-Nova.txt"), "utf8");
      rec("the state files are byte-identical", a === b, "the fixture differs where it should not");
      // …and differ where the probe needs them to.
      const ca = fs.readFileSync(path.join(LOW, "common", "state_category", "zz_nova.txt"), "utf8");
      const cb = fs.readFileSync(path.join(HIGH, "common", "state_category", "zz_nova.txt"), "utf8");
      rec("…and their state_category slots differ", ca !== cb, "the fixture is identical where it should differ");
    }

    console.log("\n[the defect] identical states, different rules — the answers must differ");
    {
      const low = await slotsOf(LOW);
      const high = await slotsOf(HIGH);
      console.log(`     low  : ${JSON.stringify(low)}`);
      console.log(`     high : ${JSON.stringify(high)}`);
      rec("both mods report the state", !!low && !!high, { low, high });
      rec("the fixture's own category slots are used", Number(low.base) === 4, low);
      // THE BUG: the second mod was served the first's cached entry, because the fingerprint covered only
      // history/states and those are identical.
      rec("…and the other mod gets ITS number, not the first's", Number(high.base) === 9, high);
      rec("the shared-slot ceiling follows too", Number(low.sharedMax) === 11 && Number(high.sharedMax) === 33,
        { low: low.sharedMax, high: high.sharedMax });
    }

    console.log("\n[⭐ the permanent half] editing the rules must show without touching a state file");
    {
      // This is what made it more than a five-minute annoyance: history/states never changes, so the disk
      // entry stayed a VALID hit for ever, across restarts.
      const before = await slotsOf(LOW);
      fs.writeFileSync(path.join(LOW, "common", "state_category", "zz_nova.txt"),
        "nova_probe_category = {\n\tlocal_building_slots = 7\n\tcolor = { 100 100 100 }\n}\n");
      const after = await slotsOf(LOW);
      console.log(`     base ${before && before.base} -> ${after && after.base} after editing ONLY the category`);
      rec("the edit is visible immediately", Number(after.base) === 7, after);
      rec("…and the state file was not touched to make it so",
        fs.readFileSync(path.join(LOW, "history", "states", "900-Nova.txt"), "utf8") === STATES, "the fixture rewrote the state file");
    }

    console.log("\n[the stamp] a cache written before the defines fix must not survive");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf("ICON_CACHE_DIR, `statecatalog_");
      const before = at === -1 ? "" : sv.slice(0, at);
      const stamps = [...before.matchAll(/fingerprintParts\.unshift\("schema:v(\d+)[\w-]*"\)/g)];
      const m = stamps.length ? stamps[stamps.length - 1] : null;
      rec("the state catalogue carries a schema stamp", !!m, "no stamp");
      // v2 was the last one written while MAX_SHARED_SLOTS was pinned at 25 for every mod.
      rec("…bumped past v2, under which every cache holds the old shared-slot ceiling", m && Number(m[1]) >= 3, m && m[1]);
      // …looked for in the catalogue's own function, its comments masked. The last 2,000 characters before the cache path lost it
      // once the function grew a comment above its memory check (#a-same-tick-write-keeps-its-stamp): the meta hash had not moved.
      const fnAt = before.lastIndexOf("function collectStateCatalogByRoots(");
      rec("…and the building rules are in the fingerprint at all",
        fnAt !== -1 && /buildingmeta:/.test(maskJsComments(before.slice(fnAt))), "the meta hash is gone");
    }

    console.log("\n[CONTROL] the cache still exists — this is not 'stop caching'");
    {
      // Losing the cache would also make every check above pass, and would be a far worse answer: this walks
      // every root's history/states, 1,081 files on vanilla.
      // ⚠️ NOT A TIMING ASSERTION. `second <= max(first, 12)` was tried first and failed inside the full
      // suite — 17.9ms then 39.8ms — because a dozen other test processes were competing for the CPU, not
      // because caching had broken. A wall-clock comparison between two adjacent reads measures the machine's
      // load as much as the code, so it fails for reasons that have nothing to do with the fix. Assert the
      // cache STRUCTURALLY, plus a bound so loose that only a catastrophic regression trips it.
      const t0 = process.hrtime.bigint();
      await slotsOf(HIGH);
      const first = Number(process.hrtime.bigint() - t0) / 1e6;
      const t1 = process.hrtime.bigint();
      const again = await slotsOf(HIGH);
      const second = Number(process.hrtime.bigint() - t1) / 1e6;
      console.log(`     back-to-back reads: ${first.toFixed(1)}ms then ${second.toFixed(1)}ms`);
      rec("a repeat read gives the same answer", JSON.stringify(again) === JSON.stringify(await slotsOf(HIGH)), again);
      rec("…and neither read is catastrophically slow", second < 5000, { first, second });
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("…because the catalogue is still cached, not re-walked every time",
        /stateCatalogCache\.set\(memKey/.test(sv) && /stateCatalogCache\.get\(memKey\)/.test(sv),
        "the in-memory cache is gone — every request now walks every root's history/states");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== state catalog sees building rules: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
