// #spirit-import-double-escape — importing a national spirit re-escaped localisation that was already escaped.
//
// /api/ideas/import copies a spirit's loc from a source mod into the active one. It read the source with
// scanLocalizationForIdea, which captures the raw FILE line with `"(.*)"` and does NOT unescape it — unlike
// parseLocalizationFile, which has the inverse pass. The value was then run through escapeLocalizationValue a
// SECOND time, whose first step is `.replace(/\\/g, "\\\\")`.
//
// So every backslash in a value we were only copying got doubled: a description written `Line one\nLine two`
// was imported as `Line one\\nLine two` — the copy shows a literal "\n" in game instead of breaking the line —
// and `\"` became `\\\"`. The import reported success either way.
//
// Import moves a value from one loc file to another and both are already in escaped file form, so it must copy
// VERBATIM. Only the `ideaId` fallback is raw text, and it alone is escaped now.
//
// Corpus: Millennium Dawn has 382 `*_desc` loc lines and 14 name lines carrying a backslash escape; vanilla 36.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const BS = String.fromCharCode(92); // a literal backslash, with no ambiguity about what lands in the file
const ROOT = path.join(os.tmpdir(), "nova-importesc-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mk = (n) => {
  const m = path.join(ROOT, n);
  fs.mkdirSync(path.join(m, "common", "ideas"), { recursive: true });
  fs.mkdirSync(path.join(m, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'name="' + n + '"\nsupported_version="1.18.*"\n');
  return m;
};
const SRC = mk("src"), DST = mk("dst");
fs.writeFileSync(path.join(SRC, "common", "ideas", "s.txt"),
  "ideas = {\n\tcountry = {\n\t\tsrc_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.05 }\n\t\t}\n\t}\n\t\tcountry = {\n\t\tplain_spirit = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n", "utf8");

// Exactly the bytes a real HOI4 loc file holds: \n for a line break, \" for a quote.
const NAME_V = "The " + BS + '"Great' + BS + '" Plan';
const DESC_V = "Line one" + BS + "nLine two with a " + BS + '"quote' + BS + '".';
fs.writeFileSync(path.join(SRC, "localisation", "english", "s_l_english.yml"),
  "\ufeffl_english:\n src_spirit:0 \"" + NAME_V + "\"\n src_spirit_desc:0 \"" + DESC_V + "\"\n" +
  " plain_spirit:0 \"Plain Name\"\n plain_spirit_desc:0 \"Nothing special here.\"\n", "utf8");

const PORT = 39985, app = createApp();
const server = app.listen(PORT, async () => {
  const imp = (id) => fetch(`http://127.0.0.1:${PORT}/api/ideas/import`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: DST, sourceModRoot: SRC, ideaId: id }),
  }).then((r) => r.json());
  const readTarget = () => {
    const dir = path.join(DST, "localisation", "english");
    return fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  };
  // Read a value back out of the file the same way the game's parser would see the line.
  const valueOf = (txt, key) => {
    const m = new RegExp("^[ \\t]*" + key + ":\\d*[ \\t]*\"(.*)\"[ \\t]*$", "m").exec(txt);
    return m ? m[1] : null;
  };
  try {
    const r = await imp("src_spirit");
    ok("the import succeeds", r && r.ok, r);
    ok("…and reports it copied localisation", (r.imported || []).includes("localization"), r.imported);

    const txt = readTarget();
    ok("a target loc file was written", txt.length > 0, txt.slice(0, 120));

    // ── the whole point: a copy must be a copy ───────────────────────────────────────────────────
    const gotName = valueOf(txt, "src_spirit");
    const gotDesc = valueOf(txt, "src_spirit_desc");
    ok("the name line is present", gotName !== null, txt.slice(0, 300));
    ok("THE NAME IS COPIED VERBATIM", gotName === NAME_V, { got: gotName, want: NAME_V });
    ok("the desc line is present", gotDesc !== null, txt.slice(0, 300));
    ok("THE DESC IS COPIED VERBATIM", gotDesc === DESC_V, { got: gotDesc, want: DESC_V });

    // ── the specific damage the double-escape did ────────────────────────────────────────────────
    ok("no backslash was doubled", !gotDesc.includes(BS + BS), gotDesc);
    ok("the line break is still a line break, not a literal", gotDesc.includes(BS + "n") && !gotDesc.includes(BS + BS + "n"), gotDesc);
    ok("an escaped quote is still one escape deep", gotName.includes(BS + '"') && !gotName.includes(BS + BS + '"'), gotName);
    ok("…and the desc's escaped quote too", gotDesc.includes(BS + '"quote'), gotDesc);

    // ── plain text must be untouched by the change ───────────────────────────────────────────────
    const r2 = await imp("plain_spirit");
    ok("a spirit with no escapes imports", r2 && r2.ok, r2);
    const txt2 = readTarget();
    ok("…with its name intact", valueOf(txt2, "plain_spirit") === "Plain Name", valueOf(txt2, "plain_spirit"));
    ok("…and its description intact", valueOf(txt2, "plain_spirit_desc") === "Nothing special here.", valueOf(txt2, "plain_spirit_desc"));

    // ── re-importing must be stable (the old bug compounded on every import) ─────────────────────
    await imp("src_spirit");
    const txt3 = readTarget();
    ok("re-importing the same spirit is stable", valueOf(txt3, "src_spirit") === NAME_V, valueOf(txt3, "src_spirit"));
    ok("…and does not compound the escaping", valueOf(txt3, "src_spirit_desc") === DESC_V, valueOf(txt3, "src_spirit_desc"));
    ok("…nor duplicate the key", (txt3.match(/^[ \t]*src_spirit:\d*[ \t]*"/gm) || []).length === 1, (txt3.match(/^[ \t]*src_spirit:\d*[ \t]*"/gm) || []).length);

    // ── the source mod must not have been touched ───────────────────────────────────────────────
    const srcLoc = fs.readFileSync(path.join(SRC, "localisation", "english", "s_l_english.yml"), "utf8");
    ok("the SOURCE mod's loc file is unchanged", valueOf(srcLoc, "src_spirit") === NAME_V, valueOf(srcLoc, "src_spirit"));

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("the import no longer re-escapes the name", /const nameVal = locData\.name \|\| escapeLocalizationValue\(ideaId\);/.test(src), "still re-escaping");
    ok("…nor the description", /const descVal = locData\.desc \|\| "";/.test(src), "still re-escaping");
    ok("…and it explains why", /#spirit-import-double-escape/.test(src), "no marker comment");
    // The other two callers of scanLocalizationForIdea (edit-payload and its sibling) hand the value to the
    // client, which unescapes it itself (public/ideas.js unescapeLocForEdit). So the scan must keep returning
    // the RAW file capture — if that ever changes, those paths double-unescape and this needs revisiting.
    // Bound the slice at the function's real end (a `}` in column 0) rather than a fixed character count —
    // the fixed 2600 stopped covering the function when it grew to walk directories recursively.
    const scanStart = src.indexOf("function scanLocalizationForIdea");
    const scanEnd = src.indexOf("\n}", scanStart);
    const scanFn = src.slice(scanStart, scanEnd === -1 ? scanStart + 4000 : scanEnd);
    // Keyed to the INVARIANT (the capture is stored verbatim), not to one exact line of syntax: the previous
    // form `name: nameM ? String(nameM[1] || "") : ""` was a property in a returned object literal, and the
    // function now accumulates across files, so the same guarantee is expressed differently.
    ok("scanLocalizationForIdea still returns the raw file capture (the other callers rely on it)",
      /=\s*String\(nameM\[1\] \|\| ""\)/.test(scanFn) && /=\s*String\(descM\[1\] \|\| ""\)/.test(scanFn),
      scanFn.slice(-400));
    ok("…and still does no unescaping of its own", !/replace\(\s*\/\\\\\\\\\//.test(scanFn), "scan now unescapes — the import copy would be wrong again");

    console.log("\ntest-spirit-import-escaping: " + pass + "/" + total + " checks passed");
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
