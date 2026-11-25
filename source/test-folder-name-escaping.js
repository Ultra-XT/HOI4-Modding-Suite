// #folder-name-unescaped — a research tab whose display name ended in a backslash swallowed the next tab's
// localisation key.
//
// upsertCustomFolderNameLoc built its line with `String(display).replace(/"/g, "'")` — the ONE loc writer in
// server.js that did not route its value through escapeLocalizationValue. Every other `:0 "..."` construction
// (upsertLocalizationLines, decisions, events, characters, equipment, MIO, tech, focus, modhealth) uses it.
//
// escapeLocalizationValue doubles backslashes FIRST and only then escapes quotes, which is precisely what
// stops a trailing `\` from escaping the closing quote. Without it, a tab named `Ops \` produced
// `gamma_folder:0 "Ops \"` — a value that never terminates — and parseLocalizationFile's own isUnescapedQuote
// walk then correctly treats that quote as non-terminating and consumes the following line into the value. The
// tab defined after it simply disappeared.
//
// The `"` → `'` substitution was lossy in its own right: a tab called `He said "hi"` was silently renamed to
// `He said 'hi'`. Escaping keeps what the user typed.
//
// The match regex had to change with it: `"[^"]*"` cannot match a properly escaped value containing \", so
// once escaping was correct the writer stopped finding its own line and appended a SECOND definition of the
// same key on every save.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const BS = String.fromCharCode(92);
const ROOT = path.join(os.tmpdir(), "nova-folderesc-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(MOD, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="F"\nsupported_version="1.18.*"\n');
const LOC = path.join(MOD, "localisation", "english", "nova_custom_folders_l_english.yml");

const PORT = 39997, app = createApp();
const server = app.listen(PORT, async () => {
  const mk = (folderKey, name) => fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, folderKey, name }),
  }).then((r) => r.json());
  try {
    ok("a plain tab is created", (await mk("alpha_folder", "Alpha Tech")).ok);
    ok("a tab whose name ENDS IN A BACKSLASH is created", (await mk("gamma_folder", "Ops " + BS)).ok);
    ok("a tab whose name contains real quotes is created", (await mk("delta_folder", 'He said "hi"')).ok);

    const txt = fs.readFileSync(LOC, "utf8");
    // The key that used to be swallowed:
    ok("THE FOLLOWING KEY SURVIVED", /^[ \t]*delta_folder\s*:/m.test(txt), txt);
    const keys = (txt.match(/^[ \t]*([A-Za-z0-9_]+)\s*:/gm) || []).map((s) => s.trim().replace(/:$/, ""));
    ok("…all three keys are present", keys.length === 3, keys);

    ok("the trailing backslash is doubled, so the value terminates", txt.includes('"Ops ' + BS + BS + '"'), txt);
    ok("…and the value is not left unterminated", !new RegExp('"Ops ' + BS + '"\\s*$', "m").test(txt), txt);
    ok("real quotes are escaped rather than replaced with apostrophes", txt.includes(BS + '"hi' + BS + '"'), txt);
    ok("…so the user's name is not silently rewritten", !txt.includes("He said 'hi'"), txt);

    // Round-trip: the parser must read back exactly what was typed.
    const parse = (t) => {
      const out = {};
      t.split(/\r?\n/).forEach((line) => {
        const m = /^[ \t]*([A-Za-z0-9_]+)\s*:\d*\s*"(.*)"[ \t]*$/.exec(line);
        if (m) out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, BS);
      });
      return out;
    };
    const got = parse(txt);
    ok("the backslash name round-trips", got.gamma_folder === "Ops " + BS, got.gamma_folder);
    ok("the quoted name round-trips", got.delta_folder === 'He said "hi"', got.delta_folder);
    ok("the plain name is unaffected", got.alpha_folder === "Alpha Tech", got.alpha_folder);

    // Re-saving must update in place, not append a duplicate.
    await mk("gamma_folder", "Ops " + BS);
    const txt2 = fs.readFileSync(LOC, "utf8");
    ok("re-saving does not duplicate the key", (txt2.match(/^[ \t]*gamma_folder\s*:/gm) || []).length === 1, txt2);
    await mk("delta_folder", 'He said "bye"');
    const txt3 = fs.readFileSync(LOC, "utf8");
    ok("…nor for a value containing escaped quotes", (txt3.match(/^[ \t]*delta_folder\s*:/gm) || []).length === 1, txt3);
    ok("…and the edit actually landed", parse(txt3).delta_folder === 'He said "bye"', parse(txt3).delta_folder);

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const fn = src.slice(src.indexOf("function upsertCustomFolderNameLoc"), src.indexOf("function removeTechnologyFolderDef"));
    ok("the writer uses escapeLocalizationValue", /const esc = escapeLocalizationValue\(display\);/.test(fn), fn.slice(0, 600));
    ok("…and no longer swaps quotes for apostrophes", !/replace\(\/"\/g, "'"\)/.test(fn), fn.slice(0, 600));
    ok("the match regex is the greedy form", /".\*"/.test(fn.replace(/\\\\/g, "")) || /"\.\*"/.test(fn), fn.slice(0, 900));
    ok("…and no longer uses the negated class", !/"\[\^"\]\*"/.test(fn), fn.slice(0, 900));
    ok("it reads through the encoding guard too", /readLocalizationTextForWrite\(file\)/.test(fn), fn.slice(0, 600));
    ok("…and it explains why", /#folder-name-unescaped/.test(fn), "no marker comment");

    console.log("\ntest-folder-name-escaping: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 21 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
