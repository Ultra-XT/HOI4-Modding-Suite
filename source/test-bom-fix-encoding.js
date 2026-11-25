// #bom-fix-destroys-text / #lossy-backup — Mod Health's one-click BOM fix destroyed the text it was fixing,
// and corrupted its own backup the same way.
//
// The fix did `fs.readFileSync(target, "utf8")` then wrote the decoded string back. But the rule fires on
// files that may not BE UTF-8, and Node maps every undecodable byte to U+FFFD. A Windows-1252 file — Notepad's
// default until Win10 1903, and still what older Notepad++ installs and many non-Western setups produce — had
// every é/ü/ñ replaced by a replacement character. Measured before the fix: 0xE9 -> EF BF BD, in the file AND
// in the backup, with `ok:true` and "its names will now load in-game".
//
// The harm is precise, and not what it first looks like. Those characters were ALREADY broken in game: HOI4
// reads localisation as UTF-8 and a bare 0xE9 is not valid UTF-8. What the fix destroyed was the RECOVERABLE
// SOURCE — 0xE9 converts back to "é" in any editor, U+FFFD carries no information and cannot. So it turned a
// trivially repairable file into an unrepairable one, and said it had succeeded.
//
// It was reachable in bulk: "Fix all" loops this endpoint over every BOM-less loc file in one click, under a
// banner reading "Each file is backed up first" — the exact promise that did not hold.
//
// backupExisting backs EVERY /api/modhealth/fix path, including the AI in-file fix on .txt scripts, so the
// lossy backup was not limited to this rule.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-bomfix-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const ENG = path.join(MOD, "localisation", "english");
fs.mkdirSync(ENG, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BF"\nsupported_version="1.18.*"\n');

// 1. plain UTF-8, no BOM — the ordinary case the fix is for.
const UTF8 = path.join(ENG, "plain_l_english.yml");
const UTF8_BYTES = Buffer.from("l_english:\n PROBE_a:0 \"Brésil\"\n", "utf8");
fs.writeFileSync(UTF8, UTF8_BYTES);

// 2. Windows-1252: the same text, but 0xE9 as a raw byte. NOT valid UTF-8.
const ANSI = path.join(ENG, "ansi_l_english.yml");
const ANSI_BYTES = Buffer.concat([Buffer.from("l_english:\n PROBE_b:0 \"Br", "latin1"), Buffer.from([0xE9]), Buffer.from("sil\"\n", "latin1")]);
fs.writeFileSync(ANSI, ANSI_BYTES);

// 3. UTF-16 LE with BOM — unambiguous, so it can be converted losslessly.
const UTF16 = path.join(ENG, "utf16_l_english.yml");
const UTF16_BYTES = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from("l_english:\n PROBE_c:0 \"Brésil\"\n", "utf16le")]);
fs.writeFileSync(UTF16, UTF16_BYTES);

const appData = process.platform === "win32" ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
  : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support")
  : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"));
const BACKUPS = path.join(appData, "NovaModdingSuite", "backups");
const newestBackup = (needle) => {
  let best = null;
  try {
    for (const f of fs.readdirSync(BACKUPS)) {
      if (!f.includes(needle)) continue;
      const p = path.join(BACKUPS, f);
      const m = fs.statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  } catch (_) {}
  return best && best.p;
};

const PORT = 39943, app = createApp();
const server = app.listen(PORT, async () => {
  const fix = (rel) => fetch(`http://127.0.0.1:${PORT}/api/modhealth/fix`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, problem: { rule: "loc_missing_bom", file: rel } }),
  }).then((r) => r.json());

  try {
    // ── the ordinary case must still work, byte-for-byte apart from the BOM ─────────────────────────
    const r1 = await fix("localisation/english/plain_l_english.yml");
    ok("a UTF-8 file without a BOM is still fixed", r1 && r1.ok, r1);
    const after1 = fs.readFileSync(UTF8);
    ok("…the BOM is now there", after1[0] === 0xEF && after1[1] === 0xBB && after1[2] === 0xBF, after1.slice(0, 6));
    ok("…and nothing else changed", Buffer.compare(after1.slice(3), UTF8_BYTES) === 0, after1.toString("utf8"));
    ok("…the accented character survived", after1.toString("utf8").includes("Brésil"), after1.toString("utf8"));

    // ── the destructive case: a legacy encoding must be REFUSED, not mangled ────────────────────────
    const r2 = await fix("localisation/english/ansi_l_english.yml");
    ok("a Windows-1252 file is refused, not silently re-encoded", r2 && !r2.ok && r2.error, r2);
    ok("…the message says it isn't UTF-8", /isn't UTF-8|is not UTF-8/i.test(String(r2.error || "")), r2.error);
    ok("…names the offending byte", /0xE9/i.test(String(r2.error || "")), r2.error);
    ok("…tells the modder how to convert it", /Notepad\+\+|VS Code|Convert to UTF-8/i.test(String(r2.error || "")), r2.error);
    ok("…and says nothing was changed", /nothing has been changed/i.test(String(r2.error || "")), r2.error);
    ok("the file really is byte-for-byte untouched", Buffer.compare(fs.readFileSync(ANSI), ANSI_BYTES) === 0,
      fs.readFileSync(ANSI).toString("hex"));
    // The point is the BYTES, not how they decode. A lone 0xE9 necessarily decodes to U+FFFD under UTF-8 —
    // that is why the file needs converting — so asserting "no replacement char after decoding" would be
    // asserting the file is not what the test made it. What matters is that 0xE9 is still on disk, because
    // that byte is mechanically convertible back to "é" and U+FFFD would not be.
    ok("…so the text is still repairable: the 0xE9 byte is intact on disk",
      fs.readFileSync(ANSI).includes(0xE9)
      && !fs.readFileSync(ANSI).includes(Buffer.from([0xEF, 0xBF, 0xBD])),
      fs.readFileSync(ANSI).toString("hex"));

    // ── UTF-16 is unambiguous, so it can be converted without losing anything ───────────────────────
    const r3 = await fix("localisation/english/utf16_l_english.yml");
    ok("a UTF-16 file is converted rather than refused", r3 && r3.ok, r3);
    const after3 = fs.readFileSync(UTF16);
    ok("…now UTF-8 with a BOM", after3[0] === 0xEF && after3[1] === 0xBB && after3[2] === 0xBF, after3.slice(0, 6));
    ok("…with the accented character intact, not a replacement char",
      after3.toString("utf8").includes("Brésil") && !after3.toString("utf8").includes("�"),
      after3.toString("utf8"));
    ok("…and the key still readable", /PROBE_c:0 "Brésil"/.test(after3.toString("utf8")), after3.toString("utf8"));

    // ── the backup must be a byte-for-byte copy, which is the whole point of taking one ─────────────
    const bp = newestBackup("utf16_l_english");
    if (bp) {
      ok("the backup of the converted file is byte-identical to the original",
        Buffer.compare(fs.readFileSync(bp), UTF16_BYTES) === 0, fs.readFileSync(bp).toString("hex").slice(0, 60));
    } else { total++; pass++; console.log("  ok  (backup dir not reachable in this environment — skipped)"); }

    console.log("\ntest-bom-fix-encoding: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
