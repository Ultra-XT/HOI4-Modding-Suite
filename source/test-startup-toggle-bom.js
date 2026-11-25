// #country-history-bom + #no-country-write-without-edit, in /api/history/set-startup.
//
// 333 of vanilla's 355 country history files and 304 of Millennium Dawn's 386 begin with a UTF-8 BOM, and
// String.prototype.trim() removes U+FEFF. Two of this handler's four writers end in .trim():
// setEffectInHistoryText (decision, character) and setCountryEventInHistory (event). So toggling any of those
// silently stripped the file's BOM — and the event writer also collapses every run of 3+ newlines across the
// WHOLE file and force-appends a trailing newline, so a toggle reformatted parts of the file nobody touched.
// setIdeaInHistoryText (spirit) slices instead of trimming, which is why that one branch was already
// byte-perfect; it doubles as the reference implementation and as a regression guard here.
//
// Also: STARTUP_ITEM_TYPES is shared with the endpoints that grant a starting TECHNOLOGY, but this handler
// has no branch for one. "technology" therefore passed the guard, fell through the if/else chain with no
// else, and the handler answered ok having written nothing — after ensureCountryHistoryFileInMod had already
// materialised a full vanilla-copy override for that country. That is the exact damage the
// #startup-item-unvalidated comment says was fixed; the shared set admitted one type too many.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stbom-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "stmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="StMod"\nsupported_version="1.18.*"\n', "utf8");

const TAG = "NVL";
const HIST = path.join(MOD, "history", "countries", `${TAG} - Valland.txt`);

// Written as BYTES: a BOM, a 3-newline run, and NO trailing newline — all three are things the writers
// damaged, and all three occur in the real corpora.
const SEED = Buffer.concat([
  Buffer.from([0xEF, 0xBB, 0xBF]),
  Buffer.from("capital = 1\n\n\n\n# art notes\nset_research_slots = 3", "utf8"),
]);

const PORT = 42437;
const app = createApp();
const server = app.listen(PORT, async () => {
  const toggle = async (itemType, itemId, active, extra = {}) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/set-startup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: TAG, itemType, itemId, active, ...extra }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const raw = () => fs.readFileSync(HIST);
  const hasBom = () => { const b = raw(); return b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF; };
  const seed = () => fs.writeFileSync(HIST, SEED);

  try {
    console.log("\n[fixture control] the seed really does have a BOM");
    seed();
    rec("the fixture starts with a UTF-8 BOM", hasBom(), [...raw().slice(0, 3)]);

    for (const [itemType, itemId] of [["decision", "nva_test_dec"], ["character", "nva_test_char"], ["event", "nva_test.1"]]) {
      console.log(`\n[${itemType}] the toggle must not eat the BOM, and must round-trip`);
      seed();
      const before = raw();

      // POSITIVE CONTROL FIRST: without proving the write actually happened, the byte-equality assert below
      // would pass just as well if the endpoint did nothing at all.
      let r = await toggle(itemType, itemId, true);
      rec(`${itemType}: the add succeeded`, r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec(`${itemType}: something was actually written`, !raw().equals(before), "file unchanged — the test would be vacuous");
      rec(`${itemType}: the item is present in the file`,
        new RegExp(itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(raw().toString("utf8")), raw().toString("utf8"));

      rec(`${itemType}: the BOM SURVIVED the write`, hasBom(), [...raw().slice(0, 3)]);

      r = await toggle(itemType, itemId, false);
      rec(`${itemType}: the remove succeeded`, r.status === 200, r.body || r.status);
      rec(`${itemType}: add-then-remove is BYTE-IDENTICAL to the original`, raw().equals(before),
        { before: before.toString("utf8"), after: raw().toString("utf8") });
    }

    console.log("\n[spirit] the branch that was already correct must stay correct");
    seed();
    {
      const before = raw();
      await toggle("spirit", "nva_test_spirit", true);
      rec("spirit: something was written", !raw().equals(before), "file unchanged");
      rec("spirit: the BOM survived", hasBom(), [...raw().slice(0, 3)]);
      await toggle("spirit", "nva_test_spirit", false);
      rec("spirit: add-then-remove is byte-identical", raw().equals(before),
        { before: before.toString("utf8"), after: raw().toString("utf8") });
    }

    console.log("\n[no-op] a toggle that changes nothing must not rewrite the file");
    seed();
    {
      const before = raw();
      const r = await toggle("decision", "nva_never_added", false);
      rec("the no-op succeeded", r.status === 200, r.body || r.status);
      rec("…and reported that nothing changed", r.body && r.body.unchanged === true, r.body);
      rec("the file is byte-identical", raw().equals(before), raw().toString("utf8"));
      rec("the 3-newline run was NOT collapsed", /\n\n\n\n/.test(raw().toString("utf8")), raw().toString("utf8"));
      rec("no trailing newline was forced on", !/\n$/.test(raw().toString("utf8")), JSON.stringify(raw().toString("utf8").slice(-12)));
    }

    console.log("\n[technology] a type this endpoint cannot write must be REFUSED, not silently no-op'd");
    // The damage is not the no-op — it is that ensureCountryHistoryFileInMod forks a vanilla country file
    // into the mod before the fall-through, and that override then wins forever.
    {
      const OTHER = "NVQ";
      const otherPath = path.join(MOD, "history", "countries", `${OTHER} - Other.txt`);
      try { fs.unlinkSync(otherPath); } catch (_) {}
      const r = await toggle("technology", "infantry_weapons", true, {});
      rec("the request was refused", r.status === 400, r.body || r.status);
      rec("…with a message naming the right endpoint",
        !!(r.body && /set-country-tech/.test(String(r.body.error || ""))), r.body && r.body.error);
    }

    console.log("\n[control] the four supported types are still accepted");
    // Guards against a fix that simply refuses everything.
    seed();
    for (const [itemType, itemId] of [["spirit", "nva_s"], ["decision", "nva_d"], ["event", "nva_e.2"], ["character", "nva_c"]]) {
      const r = await toggle(itemType, itemId, true);
      rec(`${itemType} is still accepted`, r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    }

    console.log(`\n=== startup toggle BOM: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
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
