// ⛔ #fix-all-floods-the-backup-pool — THE SAFETY NET WAS WHAT DESTROYED THE SAFETY NET.
//
// Mod Health's "Fix all" posted /api/modhealth/fix once per problem. Every one of those took its own backup
// and rewrote the whole file — and most problems in a mod resolve to the SAME localisation .yml:
//
//     mod                fixes   files they actually write   backups taken
//     Rise of Nations     3114                          84            3114
//     The Road to 56      1441                          10            1441
//     Old World Blues      770                          22             770
//     Millennium Dawn      759                          15             759
//
// MAX_BACKUP_FILES is 200 for the real-mod pool, and the two-pool split only protects real backups from
// TEMP-mod floods, not from each other. So one click on any of those mods evicted every genuine backup the
// user had — The Road to 56 seven times over, Rise of Nations fifteen — under a banner promising "Each file
// is backed up first."
//
// Measured at ~74ms per fix, so it was also nearly four minutes of continuous file rewriting on Rise of
// Nations: the same shape as the two test files this machine's antivirus quarantined for re-saving one file
// in a tight loop.
//
// ⚠️ MY FIRST PROBE MEASURED IT IN THE WRONG POOL. A scratch mod under os.tmpdir() produces EPHEMERAL
// backups, and that pool was already at its own 200 cap, so 12 fixes showed as "+1 backup" and looked like
// a refutation. isEphemeralBackupName keys on the tmpdir path, so a real mod lands in the other pool.
// Checking WHICH POOL was the difference between a finding and a false negative.
//
// The property this pins is the one that matters and does not depend on pool bookkeeping: one read, one
// backup and one WRITE per file, however many problems that file carries.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 53701;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 190) : JSON.stringify(detail).slice(0, 190))));
  if (!ok) fails.push(label);
};

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fixallbatch-"));
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="fix all batch"\n', "utf8");
    fs.mkdirSync(path.join(root, "common", "national_focus"), { recursive: true });
    fs.mkdirSync(path.join(root, "localisation", "english"), { recursive: true });

    // 20 focuses with no localisation: 20 problems, all writing to ONE .yml.
    let tree = "focus_tree = {\n\tid = t\n\tcountry = { factor = 1 }\n";
    for (let i = 1; i <= 20; i++) tree += `\tfocus = { id = ba_focus_${i}  icon = GFX_a x = ${i} y = 1 cost = 1 }\n`;
    tree += "}\n";
    fs.writeFileSync(path.join(root, "common", "national_focus", "f.txt"), tree, "utf8");

    // …plus a second .yml carrying a duplicate pair and an unterminated quote, on CRLF.
    const yml = path.join(root, "localisation", "english", "base_l_english.yml");
    fs.writeFileSync(yml, "﻿l_english:\r\n"
      + ' dupe_key:0 "Same"\r\n'
      + ' keep_me:0 "Untouched"\r\n'
      + ' dupe_key:0 "Same"\r\n'
      + ' never_closes:0 "no closing quote\r\n', "utf8");

    const idx = await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(root))).json();
    const DET = new Set(["missing_localization", "tooltip_key_no_localization", "loc_missing_bom", "loc_value_malformed"]);
    const targets = (idx.problems || []).filter((p) => p.file && (DET.has(p.rule) || (p.rule === "loc_duplicate_key" && p.allIdentical)));
    rec("the scan produced a batch worth batching", targets.length >= 22, targets.length + " targets");

    const mtimeBefore = fs.statSync(yml).mtimeMs;
    const t0 = Date.now();
    const r = await fetch(BASE + "/api/modhealth/fix-batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problems: targets }),
    });
    const j = await r.json();
    const ms = Date.now() - t0;

    console.log("\n-- one write per FILE, not one per problem --");
    rec("the batch reports ok", !!(j && j.ok), j && (j.error || j.summary));
    rec("every target was fixed", j.fixed === targets.length, { fixed: j.fixed, failed: j.failed, of: targets.length });
    rec("...across a handful of FILES, not " + targets.length + " writes", j.filesWritten <= 2, j.filesWritten);
    rec("...and it is fast, because it is not " + targets.length + " round trips", ms < 4000, ms + "ms");

    console.log("\n-- and every repair actually landed --");
    const text = fs.readFileSync(yml, "utf8");
    rec("the file was written at all", fs.statSync(yml).mtimeMs !== mtimeBefore);
    rec("all 20 missing names are present", Array.from({ length: 20 }, (_, i) => `ba_focus_${i + 1}`).every((k) => new RegExp("^\\s*" + k + ":", "m").test(text)), text.slice(-90));
    rec("the identical duplicate collapsed to one", (text.match(/^\s*dupe_key:/gm) || []).length === 1, (text.match(/^\s*dupe_key:/gm) || []).length);
    rec("the untouched key survived", /keep_me:0 "Untouched"/.test(text));
    rec("the unterminated quote was closed", /never_closes:0 "no closing quote"/.test(text), text.split(/\r?\n/).find((l) => /never_closes/.test(l)));
    rec("the BOM survived", text.charCodeAt(0) === 0xFEFF);
    rec("the file kept its CRLF endings", !/[^\r]\n/.test(text.replace(/^﻿/, "")), JSON.stringify(text.slice(0, 30)));

    console.log("\n-- a rescan agrees the problems are gone --");
    const idx2 = await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(root))).json();
    const left = (idx2.problems || []).filter((p) => DET.has(p.rule) || p.rule === "loc_duplicate_key");
    rec("no deterministic problems remain", left.length === 0, left.map((p) => p.rule + ":" + p.entityId));

    console.log("\n-- the guards still hold --");
    const bad = await (await fetch(BASE + "/api/modhealth/fix-batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problems: [{ rule: "loc_missing_bom", file: "../../escape.yml" }] }),
    })).json();
    rec("a path outside the mod is refused", !!(bad.results || []).find((x) => x.error), bad);
    const noMod = await (await fetch(BASE + "/api/modhealth/fix-batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problems: targets }),
    })).json();
    rec("no mod path is refused", !!noMod.error, noMod);
    const notDet = await (await fetch(BASE + "/api/modhealth/fix-batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: root, problems: [{ rule: "broken_reference", file: "x.yml", entityId: "z" }] }),
    })).json();
    rec("a non-deterministic rule is refused, not guessed at",
      !!(notDet.results || []).find((x) => /not a deterministic fix/i.test(x.error || "")), notDet);

    console.log("\n-- a whole mod's worth of problems fits in one request --");
    // Sending everything at once is the point of the batch, and Rise of Nations offers 3,114 fixes: a
    // ~1.2MB body. express.json() defaults to 100KB, which would fail on exactly the mods that needed this
    // most. The app installs a global express.json({limit:"10mb"}) first so the route's own parser is a
    // no-op — verified rather than reasoned, and pinned here so lowering that limit cannot quietly break
    // "Fix all" on a big mod. Every problem names a rule the batch declines, so nothing is written.
    const many = Array.from({ length: 3200 }, (_, i) => ({
      rule: "broken_reference", entityId: "pad_" + i, entityType: "focus",
      file: "common/national_focus/a_reasonably_long_file_name_" + i + ".txt",
      message: "a message about the length a real problem carries, so the body size is realistic " + i,
    }));
    const bigBody = JSON.stringify({ modPath: root, problems: many });
    const big = await fetch(BASE + "/api/modhealth/fix-batch", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: bigBody,
    });
    const bigJson = await big.json().catch(() => null);
    rec("a " + Math.round(bigBody.length / 1024) + "KB batch is accepted, not rejected as too large",
      big.status === 200 && !!bigJson, big.status);
    rec("...and every one of them is accounted for", bigJson && bigJson.results && bigJson.results.length === many.length, bigJson && bigJson.results && bigJson.results.length);
    rec("...while nothing was written for them", bigJson && bigJson.filesWritten === 0, bigJson && bigJson.filesWritten);
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    server.closeAllConnections && server.closeAllConnections();
    server.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }

  console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
  process.exitCode = fails.length ? 1 : 0;
})();
