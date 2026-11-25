// ⛔ #a-key-in-each-language-section-is-not-a-duplicate — A LOCALISATION COPY COLLIDES ONLY UNDER THE SAME LANGUAGE HEADER.
//
// The base game ships localisation/languages.yml with ten sections (l_english:, l_braz_por:, … l_korean:), and each section
// defines the same ten keys ONCE: the name of every language, written in that section's language. Mod Health's same-file
// duplicate rule counted lines per FILE, so every key read as "defined 10 times", byte-identical, and went to the
// deterministic tier: Fix all (and the card's Auto-fix) deleted 9 of the 10 copies of each key, which leaves nine of the ten
// sections empty. Measured 2026-11-21 on the 1.20 base game copied into a sandbox and judged as a mod: those 10 rows were the
// whole of the rule's output on vanilla. No installed Workshop item ships the file; a mod that copies the base game's
// localisation folder does.
//
// What this pins, through the requests the Mod Health page sends (GET /api/mod/index?fresh=1, then POST /api/modhealth/fix-batch
// with the scan's own allIdentical rows, and POST /api/modhealth/fix for one card):
//   · a byte copy of the INSTALLED languages.yml (a three-section stand-in of the same shape when the game is not here) is
//     reported for nothing, and is byte-identical after Fix all;
//   · a row the old per-file count would have produced, sent to either endpoint, is refused and changes nothing (the fixer
//     re-derives the copies itself, so it has to group the same way);
//   · controls: a key repeated under ONE header is still reported and fixed, inside that header only; a differing pair is
//     still reported as differing and left alone.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 54745;
const BASE = "http://127.0.0.1:" + PORT;
const INSTALLED = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "localisation", "languages.yml");

// The shape the base game ships, for a machine without the game: three sections, each naming the same three languages once.
const STAND_IN = "\uFEFFl_english:\n l_english: \"English\"\n l_french: \"Fran\u00e7ais\"\n l_german: \"Deutsch\"\n"
  + "l_french:\n l_english: \"English\"\n l_french: \"Fran\u00e7ais\"\n l_german: \"Deutsch\"\n"
  + "l_german:\n l_english: \"English\"\n l_french: \"Fran\u00e7ais\"\n l_german: \"Deutsch\"\n";

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};
const norm = (f) => String(f || "").replace(/\\/g, "/");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-langsections-"));
  const server = await new Promise((res, rej) => { const s = createApp().listen(PORT, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const post = async (ep, body) => (await fetch(BASE + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  try {
    fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="language sections"\nsupported_version="1.*"\n', "utf8");
    fs.mkdirSync(path.join(root, "localisation", "english"), { recursive: true });

    const haveGame = fs.existsSync(INSTALLED);
    if (!haveGame) console.log("  SKIP — the base game is not installed here: the stand-in below has its shape, not its bytes");
    const langsBytes = haveGame ? fs.readFileSync(INSTALLED) : Buffer.from(STAND_IN, "utf8");
    const langsPath = path.join(root, "localisation", "languages.yml");
    fs.writeFileSync(langsPath, langsBytes);

    // The file's own shape, read off it: its headers, and a key that more than one header defines.
    const sections = new Map();
    let cur = "";
    for (const line of langsBytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const h = /^(l_[a-z_]+):\s*$/.exec(line);
      if (h) { cur = h[1]; sections.set(cur, []); continue; }
      const k = /^\s+([A-Za-z0-9_.\-]+):\d*\s+"/.exec(line);
      if (k && cur) sections.get(cur).push(k[1]);
    }
    const everyHeaderOnce = [...sections.values()].every((keys) => new Set(keys).size === keys.length);
    const shared = [...sections.values()].reduce((a, keys) => a.filter((k) => keys.includes(k)), [...(sections.values().next().value || [])]);
    rec(`the languages file has ${sections.size} sections, each defining its keys once, and ${shared.length} key(s) every section defines`,
      sections.size >= 2 && everyHeaderOnce && shared.length >= 1, [...sections.keys()]);

    // Controls in an ordinary one-header file: an identical pair and a differing pair.
    const eng = path.join(root, "localisation", "english", "probe_l_english.yml");
    fs.writeFileSync(eng, "\uFEFFl_english:\r\n dup_same:0 \"Same\"\r\n dup_diff:0 \"One\"\r\n keep_me:0 \"Kept\"\r\n dup_same:0 \"Same\"\r\n dup_diff:0 \"Two\"\r\n", "utf8");
    // A two-section file where ONE section really repeats a key, and a key each section defines once.
    const two = path.join(root, "localisation", "two_sections.yml");
    fs.writeFileSync(two, "\uFEFFl_english:\r\n shared_key: \"English text\"\r\n twice_key: \"Again\"\r\n twice_key: \"Again\"\r\nl_french:\r\n shared_key: \"Texte\"\r\n twice_key: \"Encore\"\r\n", "utf8");

    // ── 1. the scan, as Mod Health asks for it ──
    const idx = await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(root))).json();
    rec("the scan answered", !idx.error && Array.isArray(idx.problems), idx.error);
    const dup = (idx.problems || []).filter((p) => p.rule === "loc_duplicate_key");
    const inFile = (rel) => dup.filter((p) => norm(p.file) === rel);
    const row = (rel, key) => inFile(rel).filter((p) => p.entityId === key);
    rec("no key of the languages file is reported as duplicated", inFile("localisation/languages.yml").length === 0,
      inFile("localisation/languages.yml").map((p) => p.entityId + " x" + p.copies));
    const same = row("localisation/english/probe_l_english.yml", "dup_same")[0];
    const diff = row("localisation/english/probe_l_english.yml", "dup_diff")[0];
    rec("control: an identical pair under one header is still reported, 2 copies, identical", !!same && same.copies === 2 && same.allIdentical === true, same);
    rec("control: a differing pair is still reported, as differing", !!diff && diff.copies === 2 && diff.allIdentical === false, diff);
    const twice = row("localisation/two_sections.yml", "twice_key");
    rec("a key repeated under ONE header of a two-section file is reported once, with that header's 2 copies, identical",
      twice.length === 1 && twice[0].copies === 2 && twice[0].allIdentical === true, twice);
    rec("…and a key each section defines once is not reported", row("localisation/two_sections.yml", "shared_key").length === 0,
      row("localisation/two_sections.yml", "shared_key"));

    // ── 2. Fix all, as the page sends it: the scan's own identical rows ──
    const before = fs.readFileSync(langsPath);
    const targets = dup.filter((p) => p.allIdentical);
    const fb = await post("/api/modhealth/fix-batch", { modPath: root, problems: targets });
    rec("Fix all ran", !!fb && fb.ok === true, fb && (fb.error || fb.results));
    rec("the languages file is byte-identical after Fix all", Buffer.compare(before, fs.readFileSync(langsPath)) === 0);
    const twoAfter = fs.readFileSync(two, "utf8");
    const englishPart = twoAfter.slice(0, twoAfter.indexOf("l_french:"));
    const frenchPart = twoAfter.slice(twoAfter.indexOf("l_french:"));
    rec("the two-section file lost only the repeated header's earlier copy: one twice_key under l_english, French's own kept",
      (englishPart.match(/twice_key:/g) || []).length === 1 && /twice_key: "Encore"/.test(frenchPart)
        && /shared_key: "English text"/.test(englishPart) && /shared_key: "Texte"/.test(frenchPart), twoAfter);
    const engAfter = fs.readFileSync(eng, "utf8");
    rec("control: the identical pair is down to one copy and the differing pair is untouched",
      (engAfter.match(/dup_same:/g) || []).length === 1 && /dup_diff:0 "One"/.test(engAfter) && /dup_diff:0 "Two"/.test(engAfter), engAfter);

    // ── 3. a row the per-file count produced, as a card built before this fix would send it ──
    const key = shared[0];
    const stale = { severity: "warning", rule: "loc_duplicate_key", entityType: "localisation", entityId: key,
      file: "localisation/languages.yml", copies: sections.size, allIdentical: true };
    const one = await post("/api/modhealth/fix", { modPath: root, problem: stale, apiKey: "" });
    rec(`the card's fix refuses "${key}", which no header repeats`, !!one && !!one.error && !one.ok, one);
    const batchStale = await post("/api/modhealth/fix-batch", { modPath: root, problems: [stale] });
    rec("…so does Fix all", !!batchStale && batchStale.fixed === 0 && batchStale.failed === 1, batchStale && (batchStale.error || batchStale.results));
    rec("…and the languages file is still byte-identical", Buffer.compare(before, fs.readFileSync(langsPath)) === 0);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    await new Promise((r) => server.close(() => r()));
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\ntest-a-key-in-each-language-section-is-not-a-duplicate: ${checks - fails.length}/${checks} checks passed`);
  process.exit(fails.length === 0 && checks >= 13 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
