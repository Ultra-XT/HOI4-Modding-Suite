// #backup-decoded-and-re-encoded + #loc-stripper-skips-the-decode-guard
//
// Reading a file as "utf8" and writing it back as "utf8" is a DECODE/RE-ENCODE ROUND TRIP: any byte the
// decoder cannot make sense of comes back as U+FFFD (EF BF BD), permanently. Demonstrated on one byte:
//
//   IRE_<0xC9>amon   ->  49 52 45 5f c9 61 6d 6f 6e
//   after the trip   ->  49 52 45 5f ef bf bd 61 6d 6f 6e
//
// safeModWrite took its pre-save backup that way, so for a file saved from a non-UTF-8 editor the recovery
// copy was written already damaged — and 54 call sites describe that path as "backup-then-atomic
// (recoverable)". backupExisting has always used copyFileSync and is byte-exact.
//
// stripLocalizationKeysAcrossMod did the same on a path that WRITES: it sweeps every english .yml under the
// mod looking for a deleted key, and rewrote whatever it read with writeUtf8BomFile. Its two siblings,
// removeEventLocalizationLines and removeExactKeyLocalizationLines, both go through
// readLocalizationTextForStrip, which returns null for a file it cannot decode and records the skip.
//
// ⚠️ MEASURED EXPOSURE, because the finding as reported overstated it. Across vanilla and every installed
// workshop mod, 2 files of 38,000 under common/, history/ and localisation/ change under that round trip,
// both in Rise of Nations. Vanilla stores IRE_Éamon_de_valera as valid UTF-8, so the example usually given
// for this is not actually affected. The fixes are still worth having: a backup that corrupts is worse than
// no backup, a user's own hand-edited file is not in that survey, and copyFileSync is simpler than the
// round trip it replaces.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bytes-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

console.log("\n[the mechanism] a utf8 round trip is lossy for a byte it cannot decode");
{
  const raw = Buffer.from([0x49, 0x52, 0x45, 0x5f, 0xc9, 0x61, 0x6d, 0x6f, 0x6e]); // IRE_<C9>amon
  const rt = Buffer.from(raw.toString("utf8"), "utf8");
  console.log(`     ${raw.toString("hex")}  ->  ${rt.toString("hex")}`);
  rec("the round trip really does change the bytes", Buffer.compare(raw, rt) !== 0, "no change — this whole test is moot");
  rec("…and the damage is the U+FFFD replacement char", rt.includes(Buffer.from([0xef, 0xbf, 0xbd])), rt.toString("hex"));
}

console.log("\n[the backup] must be byte-exact, whatever the file's encoding");
{
  // #map-writers-had-no-owner — safeModWrite moved into safe-write.js so map-data.js could require the same
  // one. This check is about the WRITE PATH, not about which file holds it: reading only server.js would
  // leave `at === -1`, `near === ""`, and every assertion below passing vacuously against an empty string.
  const sv = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8");
  const at = sv.indexOf("function safeModWrite(");
  // the whole function, brace-matched — a fixed 1,600-character window stopped reaching the backup line when the function
  // grew an `opts` parameter and a longer backup condition (#a-failed-redraw-puts-back-bytes)
  let near = "";
  if (at !== -1) {
    const open = sv.indexOf("{", sv.indexOf(")", at));
    for (let i = open, d = 0; i < sv.length; i++) { if (sv[i] === "{") d++; else if (sv[i] === "}" && --d === 0) { near = sv.slice(at, i + 1); break; } }
  }
  rec("safeModWrite is findable", at !== -1, "not found");
  // THE BUG: writeFileSync(backupPath, readFileSync(absPath, "utf8"), "utf8")
  rec("it copies the bytes rather than decoding them", /fs\.copyFileSync\(absPath, backupPath\)/.test(near), near.slice(0, 300));
  rec("…and no utf8 round trip is left in it",
    !/writeFileSync\(backupPath, fs\.readFileSync\(absPath, "utf8"\), "utf8"\)/.test(near), "the round trip is still there");
  // …and the sibling it now matches. backupExisting stayed in server.js when safeModWrite moved out, so
  // this half is deliberately read from there — the point of the check is that the TWO agree, and pointing
  // both halves at one file is how it would start agreeing with itself.
  const srv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  rec("backupExisting still does the same", /fs\.copyFileSync\(absPath, bp\)/.test(srv), "the byte-exact sibling changed");
}

console.log("\n[⭐ end to end] a save must leave a byte-exact backup of a legacy-encoded file");
{
  const MOD = path.join(ROOT, "bytemod");
  fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ByteMod"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "bytemod.mod"), 'name="ByteMod"\npath="' + MOD.split(path.sep).join("/") + '"\nsupported_version="1.19.*"\n');
  // A file with a byte that is NOT valid UTF-8 — 0xC9 alone, as a Windows-1252 É would be.
  const target = path.join(MOD, "common", "ideas", "zz_legacy.txt");
  const original = Buffer.concat([
    Buffer.from("ideas = {\n\tcountry = {\n\t\tnova_legacy_idea = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\t# "),
    Buffer.from([0xc9]),
    Buffer.from("amon\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n\t}\n}\n"),
  ]);
  fs.writeFileSync(target, original);
  const beforeRaw = fs.readFileSync(target);
  rec("the fixture really is not valid UTF-8",
    Buffer.compare(beforeRaw, Buffer.from(beforeRaw.toString("utf8"), "utf8")) !== 0, "fixture is plain UTF-8 — nothing to prove");

  // Drive a real save through safeModWrite by appending to the same file via the spirit upsert.
  const PORT = 53151;
  const srvP = new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  srvP.then(async (srv) => {
    try {
      await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: MOD, ideaId: "nova_legacy_idea", targetRelativeFile: "common/ideas/zz_legacy.txt",
          targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml", desc: "",
          name: "Legacy", picture: "generic_morale_bonus", modifiers: [{ key: "political_power_gain", value: 0.2 }],
        }),
      }).then((r) => r.json()).catch(() => null);

      const backupDir = path.join(process.env.APPDATA, "NovaModdingSuite", "backups");
      let backups = [];
      try { backups = fs.readdirSync(backupDir).filter((f) => /zz_legacy/.test(f)); } catch (_) {}
      console.log(`     backups written: ${backups.length}`);
      if (!backups.length) {
        // The save may have gone elsewhere; the structural checks above still stand.
        // ⚠️ A SKIP READS AS A PASS. If no backup was written the save did not go through
        // safeModWrite and this block proves nothing, so say so as a FAILURE rather than a shrug.
        rec("a backup was actually written, so this block measures something", false,
          "no backup for zz_legacy — check the upsert payload before trusting the checks above");
      } else {
        const bak = fs.readFileSync(path.join(backupDir, backups[0]));
        const identical = Buffer.compare(bak, original) === 0;
        console.log(`     backup identical to the original? ${identical}`);
        // THE BUG: the backup came out with EF BF BD where the 0xC9 was.
        rec("the backup is byte-identical to what was there before the save", identical,
          `orig ${original.length}B vs backup ${bak.length}B`);
        rec("…and carries no replacement character", !bak.includes(Buffer.from([0xef, 0xbf, 0xbd])), "U+FFFD found in the backup");
      }
    } finally {
      srv.closeAllConnections(); srv.close();
      console.log("\n[the stripper] the loc sweep must use the decode guard its siblings use");
      {
        const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        const at = sv.indexOf("function stripLocalizationKeysAcrossMod(");
        const near = at === -1 ? "" : sv.slice(at, at + 2000);
        rec("the stripper is findable", at !== -1, "not found");
        rec("…and reads through readLocalizationTextForStrip", /readLocalizationTextForStrip\(lp\)/.test(near), near.slice(0, 300));
        rec("…and skips a file it cannot decode instead of rewriting it", /if \(txt == null\) continue;/.test(near), near.slice(0, 400));
        // the siblings that already did this
        rec("both siblings still use the guard",
          (sv.match(/readLocalizationTextForStrip\(/g) || []).length >= 3, (sv.match(/readLocalizationTextForStrip\(/g) || []).length);
      }
      console.log(`\n=== backup and strip keep bytes: ${checks} checks, ${fails.length} failed ===`);
      if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
      try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    }
  });
}
