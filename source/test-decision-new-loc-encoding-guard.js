// #half-applied-write — A GUARD THAT ONLY LOOKS AT FILES THAT ALREADY DEFINE THE KEY CHECKS NOTHING FOR A
// BRAND-NEW ENTITY.
//
// The decision save writes the SCRIPT first and the LOCALISATION second, so it pre-checks the localisation
// files up front (assertLocalizationFilesAreWritable). That pre-check walked the mod's .yml files and
// examined only those already defining `<id>` / `<id>_desc`. For a NEW decision the key exists nowhere, so
// the walk matched nothing, the pre-check passed vacuously, the script landed — and the DEFAULT target,
// localisation/english/custom_decisions_l_english.yml, only had its encoding read afterwards. A legacy
// (Windows-1252) file therefore failed the save with HTTP 400 *after* the decision was already on disk.
//
// The user's own mod carries the fossil: vrf51_dec sits in vrf51_cat with no name and no category
// definition, next to a legacy-encoded vrf51_legacy2_l_english.yml.
//
// The fix names the fallback target in the pre-check. This test pins the refusal AND — the half that keeps
// the guard from being over-strict — that a healthy mod still saves and gets all three pieces.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dechalf-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

function makeMod(name, locBytes) {
  const mod = path.join(ROOT, name);
  fs.mkdirSync(path.join(mod, "common", "decisions", "categories"), { recursive: true });
  fs.mkdirSync(path.join(mod, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  if (locBytes) fs.writeFileSync(path.join(mod, "localisation", "english", "custom_decisions_l_english.yml"), locBytes);
  return mod;
}

// A real legacy file: Windows-1252, no BOM. 0xE9 is "é" in cp1252 and an invalid lone byte in UTF-8, which
// is exactly what readLocalizationTextForWrite refuses to silently mangle.
const LEGACY = Buffer.concat([
  Buffer.from("l_english:\n", "latin1"),
  Buffer.from(" some_existing_key:0 \"R", "latin1"), Buffer.from([0xe9]), Buffer.from("forme\"\n", "latin1"),
]);
const HEALTHY = Buffer.from("﻿l_english:\n some_existing_key:0 \"Reform\"\n", "utf8");

const BAD = makeMod("legacy_mod", LEGACY);
const GOOD = makeMod("healthy_mod", HEALTHY);

const PORT = 42481;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = (modPath, over) => fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({
      modPath, fileName: "nova_probe.txt",
      cost: 10, icon: "GFX_decision_generic_decision", days: 0, fireOnce: "no",
      available: "always = yes", modifier: "", effect: "", decisionType: "decision", scope: "national",
      cooldown: "", targetTrigger: "", removeEffect: "",
    }, over || {})),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  // Nova picks the target file itself, so ask the tree rather than assuming a name.
  const decisionFile = (mod) => {
    const dir = path.join(mod, "common", "decisions");
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return ""; }
    return names.length ? path.join(dir, names[0]) : "";
  };
  const anyDecisionScript = (mod) => {
    const f = decisionFile(mod);
    return f ? fs.readFileSync(f, "utf8") : "";
  };
  const catDir = (mod) => path.join(mod, "common", "decisions", "categories");
  const listCats = (mod) => { try { return fs.readdirSync(catDir(mod)); } catch (_) { return []; } };
  const locText = (mod) => {
    const f = path.join(mod, "localisation", "english", "custom_decisions_l_english.yml");
    try { return fs.readFileSync(f).toString("latin1"); } catch (_) { return ""; }
  };

  try {
    console.log("\n[control] a healthy mod still saves — the guard must not refuse good input");
    // FIRST, so a guard that simply refuses everything cannot pass this file.
    let r = await save(GOOD, { id: "nova_probe_ok", name: "Probe OK", categoryId: "nova_probe_cat" });
    rec("the save succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("the decision script was written", !!decisionFile(GOOD), fs.readdirSync(path.join(GOOD, "common", "decisions")));
    rec("…and it defines the decision", /nova_probe_ok\s*=\s*\{/.test(fs.readFileSync(decisionFile(GOOD), "utf8")));
    rec("the category was defined", listCats(GOOD).length > 0, listCats(GOOD));
    rec("the localisation key was written", /nova_probe_ok:\d*\s*"Probe OK"/.test(locText(GOOD)), locText(GOOD));
    rec("the pre-existing key in that file survived", /some_existing_key/.test(locText(GOOD)), locText(GOOD));

    console.log("\n[the bug] a NEW decision whose fallback loc file is legacy-encoded");
    r = await save(BAD, { id: "nova_probe_bad", name: "Probe Bad", categoryId: "nova_probe_bad_cat" });
    rec("the save was refused", r.s >= 400 || (r.b && (r.b.ok === false || r.b.error)), { s: r.s, b: r.b });
    rec("…and the message names the file",
      /custom_decisions_l_english\.yml/i.test(String((r.b && r.b.error) || "")), r.b);

    console.log("\n[the point] the refusal must leave the mod EXACTLY as it was");
    // This is what failed before the fix: the script was already on disk when the loc write threw.
    rec("NO decision script was written", !decisionFile(BAD), anyDecisionScript(BAD).slice(0, 300));
    rec("NO category definition was written", listCats(BAD).length === 0, listCats(BAD));
    rec("NO localisation key was written", !/nova_probe_bad/.test(locText(BAD)), locText(BAD));
    rec("the legacy file was not rewritten or mangled",
      fs.readFileSync(path.join(BAD, "localisation", "english", "custom_decisions_l_english.yml")).equals(LEGACY));

    console.log("\n[still true for an EXISTING key] the original guard keeps working");
    // The pre-existing behaviour — a legacy file that already DEFINES the key — must still be caught.
    const BAD2 = makeMod("legacy_defines_key", Buffer.concat([
      Buffer.from("l_english:\n nova_probe_two:0 \"R", "latin1"), Buffer.from([0xe9]), Buffer.from("forme\"\n", "latin1"),
    ]));
    r = await save(BAD2, { id: "nova_probe_two", name: "Probe Two", categoryId: "nova_probe_two_cat" });
    rec("that save is refused too", r.s >= 400 || (r.b && (r.b.ok === false || r.b.error)), { s: r.s, b: r.b });
    rec("…and nothing was written", !decisionFile(BAD2) && listCats(BAD2).length === 0,
      { script: anyDecisionScript(BAD2).slice(0, 200), cats: listCats(BAD2) });

    console.log(`\n=== decision new-loc encoding guard: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
