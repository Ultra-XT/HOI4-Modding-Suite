// #legacy-encoded-loc-clobbered — saving a decision against a legacy-encoded localisation file replaced every
// accented character in it with U+FFFD, permanently, in keys the user never touched.
//
// Every loc writer read its target with `fs.readFileSync(file, "utf8")` and handed the string to
// writeUtf8BomFile. Node maps each undecodable byte to U+FFFD on the read, and the write re-encodes U+FFFD as
// EF BF BD. So a Windows-1252 / ISO-8859-1 file — still common in older mods — lost "Réformer l'armée",
// "Münchner Abkommen" and "Ação Integralista" the moment somebody renamed one unrelated decision. No backup,
// nothing in the UI, and the damage lands in keys the save had no business touching.
//
// Nova already knew this hazard: the loc_missing_bom auto-fix does exactly this round-trip test and REFUSES to
// write a file it cannot decode. That guard existed in one place; every ordinary Save bypassed it.
//
// FINDING THE REAL WRITER MATTERED. Patching the obvious `ensureOrRepairLocalizationHeader(readFileSync(...))`
// sites did NOT fix it, and neither did the in-place branch of setLocalizationKeyInPlace — the byte check kept
// failing. A stack trace on the actual writeFileSync showed the live path is upsertDecisionLocalization's own
// `upsert()`, which rewrites whichever file already defines the key (findModLocalizationEntry). That is the
// branch a real mod takes, because its keys already exist somewhere.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-legacyloc-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mkMod = (name, locBuf, locName) => {
  const MOD = path.join(ROOT, name);
  fs.mkdirSync(path.join(MOD, "common", "decisions"), { recursive: true });
  fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(MOD, "descriptor.mod"), `name="${name}"\nsupported_version="1.18.*"\n`);
  fs.writeFileSync(path.join(MOD, "common", "decisions", "probe_cat.txt"),
    "probe_cat = {\n\tmy_decision = {\n\t\tcost = 10\n\t\tdays_remove = 5\n\t}\n}\n", "utf8");
  fs.writeFileSync(path.join(MOD, "localisation", "english", locName), locBuf);
  return MOD;
};

const LEGACY_TEXT = 'l_english:\n my_decision:0 "Réformer l\'armée"\n other_key:0 "Münchner Abkommen"\n third_key:0 "Ação Integralista"\n';
const LEGACY = mkMod("legacy", Buffer.from(LEGACY_TEXT, "latin1"), "legacy_l_english.yml");
const UTF8   = mkMod("utf8mod", Buffer.from("﻿" + LEGACY_TEXT, "utf8"), "good_l_english.yml");

const legacyLoc = path.join(LEGACY, "localisation", "english", "legacy_l_english.yml");
const utf8Loc = path.join(UTF8, "localisation", "english", "good_l_english.yml");
const legacyBefore = fs.readFileSync(legacyLoc);
const legacyScript = path.join(LEGACY, "common", "decisions", "probe_cat.txt");
const legacyScriptBefore = fs.readFileSync(legacyScript);

ok("the fixture really is NOT valid UTF-8", !Buffer.from(legacyBefore.toString("utf8"), "utf8").equals(legacyBefore));
ok("…while the control fixture IS", (() => { const b = fs.readFileSync(utf8Loc); return Buffer.from(b.toString("utf8"), "utf8").equals(b); })());

const PORT = 39995, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (modPath, name) => fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath, categoryId: "probe_cat", id: "my_decision", name, description: "", cost: 10, daysRemove: 5 }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  try {
    // ── the legacy file must be refused, not rewritten ───────────────────────────────────────────
    const r = await save(LEGACY, "Reform the army");
    ok("saving against a legacy-encoded loc file is REFUSED", r.status >= 400 && r.body && r.body.error, r);
    ok("…the message names the file", /legacy_l_english\.yml/.test(r.body.error || ""), r.body.error);
    ok("…says it isn't UTF-8", /isn't saved as UTF-8/.test(r.body.error || ""), r.body.error);
    ok("…warns about keys the user didn't touch", /keys you didn't touch/.test(r.body.error || ""), r.body.error);
    ok("…and says exactly how to fix it", /re-save it as UTF-8/.test(r.body.error || ""), r.body.error);

    const legacyAfter = fs.readFileSync(legacyLoc);
    ok("THE LOCALISATION FILE IS BYTE-IDENTICAL", legacyAfter.equals(legacyBefore), {
      before: legacyBefore.toString("latin1").slice(0, 90), after: legacyAfter.toString("latin1").slice(0, 90),
    });
    ok("…every accented value is intact", legacyAfter.toString("latin1").includes("Münchner Abkommen"), legacyAfter.toString("latin1").slice(0, 120));
    ok("…and no replacement character was introduced", !legacyAfter.includes(Buffer.from([0xef, 0xbf, 0xbd])), "U+FFFD written");
    ok("…no stray BOM was prepended either", legacyAfter[0] !== 0xef || legacyAfter[1] !== 0xbb, legacyAfter.slice(0, 3));

    // A refused save must not leave the script half-written.
    ok("the decision script file is untouched too", fs.readFileSync(legacyScript).equals(legacyScriptBefore), "script half-written");

    // ── a normal UTF-8 mod must still save ───────────────────────────────────────────────────────
    const r2 = await save(UTF8, "Reform the army");
    ok("a UTF-8 mod still saves normally", r2.status === 200 && r2.body && (r2.body.ok || r2.body.success), r2);
    const utf8After = fs.readFileSync(utf8Loc).toString("utf8");
    ok("…the renamed value landed", /my_decision:\d*\s*"Reform the army"/.test(utf8After), utf8After.slice(0, 200));
    ok("…and its OWN accented neighbours survived", utf8After.includes("Münchner Abkommen") && utf8After.includes("Ação Integralista"), utf8After.slice(0, 240));

    // ── the guard itself ─────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a guarded localisation reader", /function readLocalizationTextForWrite\(absPath\)/.test(src), "helper missing");
    ok("…it compares the re-encoded bytes to the originals", /Buffer\.from\(text, "utf8"\)\.equals\(buf\)/.test(src), "no round-trip check");
    ok("…and explains why", /#legacy-encoded-loc-clobbered/.test(src), "no marker comment");
    ok("the decision upsert's in-place branch uses it",
      /const txt = readLocalizationTextForWrite\(existing\.file\);/.test(src), "decision upsert still reads utf8");
    ok("setLocalizationKeyInPlace's in-place branch uses it too",
      /let txt = readLocalizationTextForWrite\(f\);/.test(src), "in-place branch still reads utf8");
    ok("no localisation read-for-write still uses the raw utf8 form",
      !/ensureOrRepairLocalizationHeader\(fs\.readFileSync\(/.test(src), "a raw read survives");
    const uses = (src.match(/readLocalizationTextForWrite\(/g) || []).length;
    ok("…and the guard is used at every one of those sites", uses >= 13, uses);

    console.log("\ntest-legacy-encoded-loc: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
