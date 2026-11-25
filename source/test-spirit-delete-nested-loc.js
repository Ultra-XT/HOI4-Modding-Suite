// #spirit-delete-misses-nested-loc — deleting a national spirit left its localisation behind whenever the key
// lived in a SUBFOLDER of localisation/english.
//
// deleteIdeaDefinitionFromIdeasFile scanned exactly one directory with a flat readdirSync, so
// localisation/english/spirits/*.yml was skipped — and so was localisation/english/replace/*.yml, which is the
// folder HOI4 gives PRIORITY, making a leftover there the one most certain to be seen in game.
//
// Nova's own reader walks recursively (collectEnglishFilesRecursively), which is why the key still resolved
// after the delete, and the two sibling cleaners — removeEventLocalizationLines and
// removeExactKeyLocalizationLines — both recurse already. This was the odd one out.
//
// The walk now starts at localisation/ rather than localisation/english, so other languages are covered too:
// on a DELETE the spirit is gone in every language, so its key should be too. The .yml filter is kept as-is
// rather than narrowed to *_l_english.yml, because the original flat scan accepted any .yml and narrowing it
// would trade one miss for another.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-locsub-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/ideas", "localisation/english", "localisation/english/spirits", "localisation/english/replace", "localisation/french"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="L"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tsub_spirit = { removal_cost = -1 }\n\t\trep_spirit = { removal_cost = -1 }\n\t\tkeep_spirit = { removal_cost = -1 }\n\t}\n}\n", "utf8");

const NESTED = path.join(MOD, "localisation", "english", "spirits", "s_l_english.yml");
const REPLACE = path.join(MOD, "localisation", "english", "replace", "r_l_english.yml");
const FLAT = path.join(MOD, "localisation", "english", "flat_l_english.yml");
const FRENCH = path.join(MOD, "localisation", "french", "s_l_french.yml");
fs.writeFileSync(NESTED, '﻿l_english:\n sub_spirit:0 "Sub"\n sub_spirit_desc:0 "d"\n keep_spirit:0 "Keep"\n', "utf8");
fs.writeFileSync(REPLACE, '﻿l_english:\n rep_spirit:0 "Rep"\n rep_spirit_desc:0 "d"\n', "utf8");
fs.writeFileSync(FLAT, '﻿l_english:\n keep_spirit_desc:0 "kd"\n', "utf8");
fs.writeFileSync(FRENCH, '﻿l_french:\n sub_spirit:0 "Sous"\n keep_spirit:0 "Garder"\n', "utf8");

const PORT = 40019, app = createApp();
const server = app.listen(PORT, async () => {
  const del = (ideaId) => fetch(`http://127.0.0.1:${PORT}/api/ideas/delete-definition`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, ideaId, targetRelativeFile: "custom_ideas.txt" }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const read = (p) => fs.readFileSync(p, "utf8");
  try {
    // Assert the operation succeeded before asserting anything about its effects.
    const a = await del("sub_spirit");
    ok("deleting the nested-loc spirit succeeds", a.status === 200 && a.body && a.body.ok, a);
    const b = await del("rep_spirit");
    ok("deleting the replace/-loc spirit succeeds", b.status === 200 && b.body && b.body.ok, b);

    // ── the bug ──────────────────────────────────────────────────────────────────────────────────
    ok("A KEY IN A SUBFOLDER IS CLEANED", !/^\s*sub_spirit:/m.test(read(NESTED)), read(NESTED));
    ok("…including its _desc", !/^\s*sub_spirit_desc:/m.test(read(NESTED)), read(NESTED));
    ok("A KEY IN replace/ IS CLEANED (HOI4 gives that folder priority)", !/^\s*rep_spirit:/m.test(read(REPLACE)), read(REPLACE));
    ok("…including its _desc", !/^\s*rep_spirit_desc:/m.test(read(REPLACE)), read(REPLACE));

    // ── what must survive ────────────────────────────────────────────────────────────────────────
    ok("an unrelated key in the same nested file survives", /^\s*keep_spirit:/m.test(read(NESTED)), read(NESTED));
    ok("…and in the flat file", /^\s*keep_spirit_desc:/m.test(read(FLAT)), read(FLAT));
    ok("the surviving spirit is still defined", /keep_spirit\s*=\s*\{/.test(read(path.join(MOD, "common", "ideas", "custom_ideas.txt"))), "definition lost");
    ok("…while the deleted ones are gone from the ideas file", !/sub_spirit\s*=\s*\{/.test(read(path.join(MOD, "common", "ideas", "custom_ideas.txt"))), "definition survived");

    // ── other languages ──────────────────────────────────────────────────────────────────────────
    ok("the deleted spirit's key is cleaned in other languages too", !/^\s*sub_spirit:/m.test(read(FRENCH)), read(FRENCH));
    ok("…while an unrelated key there survives", /^\s*keep_spirit:/m.test(read(FRENCH)), read(FRENCH));

    // ── every loc file must remain valid ─────────────────────────────────────────────────────────
    for (const [label, p] of [["nested", NESTED], ["replace", REPLACE], ["flat", FLAT], ["french", FRENCH]]) {
      const t = read(p);
      ok(`the ${label} file still has its header`, /^﻿?l_[a-z]+:/m.test(t), t.slice(0, 60));
    }

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const fnStart = src.indexOf("function deleteIdeaDefinitionFromIdeasFile");
    const fnEnd = src.indexOf("\nfunction ", fnStart + 10); // slice to the REAL end, never a char count
    const fn = src.slice(fnStart, fnEnd === -1 ? src.length : fnEnd);
    ok("the delete walks recursively now", /if \(e\.isDirectory\(\)\) walk\(p\);/.test(fn), fn.slice(-900));
    ok("…from localisation/, not just localisation/english", /const locRoot = path\.join\(activeRoot, "localisation"\);/.test(fn), fn.slice(-900));
    ok("…and still accepts any .yml", /endsWith\("\.yml"\)/.test(fn), fn.slice(-900));
    ok("…and it explains why", /#spirit-delete-misses-nested-loc/.test(fn), "no marker comment");

    console.log("\ntest-spirit-delete-nested-loc: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 19 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
