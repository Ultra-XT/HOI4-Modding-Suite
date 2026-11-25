// #trait-labels-cached-without-their-source — RENAMING A TRAIT LEFT THE PICKER SHOWING THE OLD NAME.
//
// collectCharacterTraits memoises its whole answer under `activeRoot` with a flat 60-second TTL. Half of
// that answer is LOCALISATION: `labels` maps each trait token to the display name the picker shows. So the
// cache depended on the .yml files and knew nothing about them. Rename a trait through Nova — the shared
// /api/localization/upsert endpoint, which every maker's name box uses — and the trait picker went on
// showing the old name until the minute happened to run out.
//
// Nova already has the signal: `localizationWriteEpoch`, bumped by safeModWrite on any write whose path
// contains localisation/localization, and consulted by loadDecisionLocalizations, loadEventLocalizations and
// the loc-map cache. Putting it in the key makes a rename mint a new key instead of waiting out a timer.
//
// ⚠️ WHAT THIS DOES NOT FIX, said plainly: an edit made OUTSIDE Nova (a text editor) bumps no epoch, so it
// is still up to 60s stale. That is the pre-existing TTL behaviour and is deliberately left alone here —
// the trait upsert endpoint's own `_charTraitsCache.data = null` covers the other in-app path.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-traitloc-"));
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
const MOD = path.join(ROOT, "traitmod");
fs.mkdirSync(path.join(MOD, "common", "unit_leader"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TraitMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "traitmod.mod"), 'name="TraitMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "unit_leader", "zz_nova_probe_traits.txt"),
  "leader_traits = {\n" +
  "\tnova_probe_trait = {\n\t\ttype = land\n\t\tattack_skill = 1\n\t}\n" +
  "\tnova_unlabelled_trait = {\n\t\ttype = land\n\t\tdefense_skill = 1\n\t}\n" +
  "}\n");
// only the FIRST trait gets a name, so the control below has something genuinely unlabelled to point at
const LOCREL = "localisation/english/zz_nova_probe_l_english.yml";
fs.writeFileSync(path.join(MOD, LOCREL), "﻿l_english:\n nova_probe_trait:0 \"Old Trait Name\"\n", "utf8");

const PORT = 52971;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const M = encodeURIComponent(MOD);
    const traits = () => fetch(`http://127.0.0.1:${PORT}/api/characters/traits?modPath=${M}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const labelOf = (j, t) => String(((j && j.labels) || {})[t] || "");
    // ⚠️ TWO POOLS. `type = land` makes a common/unit_leader entry a UNIT trait, not a leader one — the
    // endpoint answers { leader: [token…], unit: [{name,type}…] } and `labels` covers both. Checking only
    // `leader` reported the fixture's own traits missing when they were sitting in `unit` all along.
    const inPool = (j, t) => (Array.isArray(j.leader) && j.leader.includes(t))
      || (Array.isArray(j.unit) && j.unit.some((u) => u && u.name === t));

    console.log("\n[cold] the picker shows the name the mod gives the trait");
    {
      const j = await traits();
      console.log(`     nova_probe_trait = ${JSON.stringify(labelOf(j, "nova_probe_trait"))}`);
      rec("the fixture's trait is in the pool at all", inPool(j, "nova_probe_trait"), { leader: (j.leader || []).length, unit: (j.unit || []).length });
      rec("…under its localised name", labelOf(j, "nova_probe_trait") === "Old Trait Name", labelOf(j, "nova_probe_trait"));
    }

    console.log("\n[CONTROL] the label really comes from localisation, not from the token");
    {
      // If this had a label, the check above would pass even with the loc file deleted, and the rename check
      // below would be measuring nothing.
      const j = await traits();
      rec("a trait with no loc key has no label", !labelOf(j, "nova_unlabelled_trait"), labelOf(j, "nova_unlabelled_trait"));
      rec("…but is still offered", inPool(j, "nova_unlabelled_trait"), { leader: (j.leader || []).length, unit: (j.unit || []).length });
    }

    console.log("\n[rename] through the shared endpoint every maker's name box uses");
    {
      // ⭐ SEND WHAT THE CLIENT SENDS — public/app.js:12619 posts { path, modPath, entries: { key: { name } } }.
      const r = await fetch(`http://127.0.0.1:${PORT}/api/localization/upsert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: LOCREL, modPath: MOD, entries: { nova_probe_trait: { name: "Renamed Trait" } } }),
      }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      rec("the rename is accepted", r && r.error === undefined && r.ok !== false, r);
      const onDisk = fs.readFileSync(path.join(MOD, LOCREL), "utf8");
      rec("…and reaches the file", /Renamed Trait/.test(onDisk), onDisk.slice(0, 160));

      const j = await traits();
      console.log(`     nova_probe_trait = ${JSON.stringify(labelOf(j, "nova_probe_trait"))}`);
      // THE BUG: this was "Old Trait Name" for up to a minute after the rename.
      rec("the picker shows the new name immediately", labelOf(j, "nova_probe_trait") === "Renamed Trait", labelOf(j, "nova_probe_trait"));
    }

    console.log("\n[again] the fix must not be a one-shot");
    {
      await fetch(`http://127.0.0.1:${PORT}/api/localization/upsert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: LOCREL, modPath: MOD, entries: { nova_probe_trait: { name: "Renamed Twice" } } }),
      }).then((x) => x.json()).catch(() => null);
      const j = await traits();
      rec("a second rename also shows", labelOf(j, "nova_probe_trait") === "Renamed Twice", labelOf(j, "nova_probe_trait"));
    }

    console.log("\n[the mechanism] the cache key has to depend on what the answer depends on");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf("function collectCharacterTraits");
      const body = at === -1 ? "" : sv.slice(at, at + 1200);
      rec("collectCharacterTraits is findable", at !== -1, "not found");
      rec("…and its cache key carries the localisation epoch", /cacheKey\s*=[^;]*localizationWriteEpoch/.test(body),
        "keyed on the root alone — a rename waits out the 60s TTL");
    }

    console.log("\n[CONTROL] the cache still exists — this is not 'delete the cache'");
    {
      // Losing the memo entirely would also make the rename visible, and would be a far worse fix: this pool
      // is built by walking every root's common/unit_leader. Two identical reads in a row must not re-walk.
      // ⚠️ THIS IS A SMOKE CHECK, NOT A CONTROL, AND IT USED TO CLAIM OTHERWISE.
      //
      // It failed once inside a full parallel suite at 5.8ms then 21.0ms, and passes every time run alone —
      // the memo was used and the process was simply descheduled mid-call. Looking into that turned up
      // something worth more than the flake: `traits()` is already called four times above (the assertions
      // this file exists for), so BOTH reads here are warm. A pair of warm reads cannot tell a present memo
      // from an absent one, so `second <= max(first, 8)` could never have detected the thing it named. Its
      // only reachable failure mode was machine load — which is exactly the failure we saw.
      //
      // THE REAL GUARD IS THE SOURCE CHECK ABOVE: "its cache key carries the localisation epoch". That is
      // what stops the memo outliving a rename, and it holds regardless of timing.
      //
      // What is left here is worth keeping as a smoke check — a warm read really should be quick, and a
      // catastrophic regression would show up — so it samples repeatedly and takes the best observation
      // rather than trusting one. It is labelled for what it is, so nobody reads a green here as proof of
      // memoisation.
      const warms = [];
      for (let i = 0; i < 5; i++) {
        const t = process.hrtime.bigint();
        await traits();
        warms.push(Number(process.hrtime.bigint() - t) / 1e6);
      }
      const best = Math.min(...warms);
      console.log(`     warm reads over 5 samples: best ${best.toFixed(1)}ms of [${warms.map((n) => n.toFixed(1)).join(", ")}]`);
      rec("a warm read is still quick (smoke check, not proof of the memo)", best <= 250,
        { warms: warms.map((n) => +n.toFixed(1)), note: "the memo itself is guarded by the cache-key check above" });
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== trait label loc rename: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
