// #legacy-encoded-loc-clobbered, third occurrence. `readLocalizationTextForWrite` was written for the maker
// save paths; the three /api/localization/* endpoints still read with a bare "utf8" and handed the result
// straight back to writeUtf8BomFile. Node maps every undecodable byte to U+FFFD on the read, so adding ONE
// key to — or repairing the header of — a Windows-1252 file replaced every accented character in EVERY key of
// that file with "�". Permanently, with no backup, in keys the user never touched.
//
// Legacy-encoded loc files are not hypothetical: vanilla ships 8 of them, and any modder who edits loc in
// Notepad on a non-UTF-8 default codepage produces one.
//
// The rule this pins: a loc endpoint that REWRITES a file must refuse a file it cannot decode, and must leave
// it byte-identical when it refuses.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locenc-"));
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

const MOD = path.join(ROOT, "encmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EncMod"\nsupported_version="1.18.*"\n', "utf8");

// A genuine Windows-1252 file: é = 0xE9, ü = 0xFC, ç = 0xE7. These are NOT valid UTF-8 sequences on their own,
// which is exactly what makes the round-trip destructive.
const LEGACY_LINES = [
  "l_english:",
  ' enc_fr:0 "R\xE9former l\'arm\xE9e"',
  ' enc_de:0 "M\xFCnchner Abkommen"',
  ' enc_fr_desc:0 "Une r\xE9forme n\xE9cessaire pour la Fran\xE7e"',
];
const legacyBuf = Buffer.from(LEGACY_LINES.join("\n") + "\n", "latin1");

// Same content, but with no l_english: header — this is what forces validate/create to REWRITE.
const legacyNoHeaderBuf = Buffer.from(LEGACY_LINES.slice(1).join("\n") + "\n", "latin1");

const PORT = 42419;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const FILE = "enc_l_english.yml";
  const ABS = path.join(MOD, "localisation", "english", FILE);
  const REL = "localisation/english/" + FILE;
  const seed = (buf) => fs.writeFileSync(ABS, buf);
  const raw = () => fs.readFileSync(ABS);
  // Count U+FFFD as it would exist ON DISK (EF BF BD), not as Node's decoder invents it. Reading a legacy
  // file with "utf8" produces replacement chars in the STRING while the file itself is untouched \u2014 measuring
  // that way tests the test's own reader, not the product.
  const mojibakeBytes = () => {
    const b = raw();
    let n = 0;
    for (let i = 0; i + 2 < b.length; i++) if (b[i] === 0xEF && b[i + 1] === 0xBF && b[i + 2] === 0xBD) n++;
    return n;
  };

  try {
    console.log("\n[upsert] adding a key to a legacy-encoded file must refuse, not mojibake it");
    seed(legacyBuf);
    let before = raw();
    let r = await post("/api/localization/upsert", {
      modPath: MOD, path: REL, entries: { enc_new: { name: "Brand New", desc: "Added" } },
    });
    rec("the upsert was REFUSED", r.status === 400 && r.body && /UTF-8/i.test(String(r.body.error || "")), r.body || r.status);
    rec("…with a message naming the file and how to fix it",
      !!(r.body && /enc_l_english\.yml/.test(String(r.body.error)) && /re-save it as UTF-8/i.test(String(r.body.error))),
      r.body && r.body.error);
    rec("the file is byte-identical after the refusal", raw().equals(before), { before: before.length, after: raw().length });
    rec("no U+FFFD bytes were written to disk", mojibakeBytes() === 0, mojibakeBytes());

    console.log("\n[validate] header repair on a legacy-encoded file must refuse too");
    seed(legacyNoHeaderBuf);
    before = raw();
    r = await post("/api/localization/validate", { modPath: MOD, path: REL });
    rec("validate was REFUSED", r.status === 400 && r.body && /UTF-8/i.test(String(r.body.error || "")), r.body || r.status);
    rec("the file is byte-identical after the refusal", raw().equals(before), { before: before.length, after: raw().length });
    rec("the accented bytes are still the original single bytes",
      raw().includes(0xE9) && raw().includes(0xFC) && raw().includes(0xE7), [...raw().slice(0, 24)]);

    console.log("\n[create] header repair through create must refuse as well");
    seed(legacyNoHeaderBuf);
    before = raw();
    r = await post("/api/localization/create", { modPath: MOD, path: REL });
    rec("create was REFUSED", r.status === 400 && r.body && /UTF-8/i.test(String(r.body.error || "")), r.body || r.status);
    rec("the file is byte-identical after the refusal", raw().equals(before), { before: before.length, after: raw().length });

    console.log("\n[control] a real UTF-8 file with the same accents still works");
    // Without this the test would pass just as well if the endpoints refused everything.
    const utf8Buf = Buffer.from("\uFEFF" + LEGACY_LINES.join("\n") + "\n", "utf8");
    seed(utf8Buf);
    r = await post("/api/localization/upsert", {
      modPath: MOD, path: REL, entries: { enc_new: { name: "Brand New", desc: "Added" } },
    });
    rec("the upsert SUCCEEDED on a UTF-8 file", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const after = fs.readFileSync(ABS, "utf8");
    rec("the new key landed", /enc_new:0\s+"Brand New"/.test(after), after.slice(0, 200));
    rec("the accented values survived intact",
      after.includes("Réformer l'armée") && after.includes("Münchner Abkommen") && after.includes("França".replace("ç", "ç")) === after.includes("França"),
      { fr: /R.former/.exec(after) && RegExp.lastMatch, de: /M.nchner/.exec(after) && RegExp.lastMatch });
    rec("no replacement characters anywhere", (after.match(/\uFFFD/g) || []).length === 0, (after.match(/\uFFFD/g) || []).length);

    console.log("\n[control] validate still repairs a UTF-8 file missing its header");
    seed(Buffer.from(LEGACY_LINES.slice(1).join("\n") + "\n", "utf8"));
    r = await post("/api/localization/validate", { modPath: MOD, path: REL });
    rec("validate SUCCEEDED on a UTF-8 file", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and the header was actually added", /^\uFEFF?l_english:/m.test(fs.readFileSync(ABS, "utf8")),
      fs.readFileSync(ABS, "utf8").slice(0, 60));

    console.log("\n[guard] validate must refuse a vanilla-rooted path like create does");
    r = await post("/api/localization/validate", { path: "C:/Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV/localisation/english/x_l_english.yml" });
    rec("a game-root path is rejected", r.status === 400, r.body || r.status);

    console.log(`\n=== loc encoding guard: ${checks} checks, ${fails.length} failed ===`);
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
