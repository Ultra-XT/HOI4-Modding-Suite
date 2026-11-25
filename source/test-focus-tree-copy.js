// /api/mod/copy-generic-focus-tree is the "＋ New Tree" button. It used to copy the generic tree
// BYTE-FOR-BYTE, which meant the new file kept `id = generic_focus`, `default = yes` and all 56 vanilla
// focus ids. A mod file only shadows a vanilla one when it has the SAME BASENAME, so the original stayed
// loaded and the mod shipped two `generic_focus` trees plus 56 duplicate focus ids. Per the HOI4 wiki a
// tree-id overlap "will result in an error", and a duplicate focus id "leads to errors, such as broken
// prerequisite lines and effects or triggers...not working correctly" — i.e. the user's brand-new tree
// did nothing in game, no matter what they set in the owner dialog. This locks the renaming copy.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + String(e).slice(0, 200) : ""); } };
const braceBalanced = (s) => { let d = 0; for (const ch of s) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) return false; } } return d === 0; };

const PORT = 3521;
const req = (m, p, b) => new Promise((res, rej) => {
  const d = b ? JSON.stringify(b) : null;
  const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: m, headers: d ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } : {} }, (x) => {
    let s = ""; x.on("data", (c) => (s += c)); x.on("end", () => { try { res(JSON.parse(s)); } catch (e) { rej(new Error("Bad JSON: " + s.slice(0, 150))); } });
  });
  r.on("error", rej); if (d) r.write(d); r.end();
});

(async () => {
  const app = createApp();
  const srv = app.listen(PORT, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-treecopy-"));
  try {
    fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Temp Copy Mod"\n', "utf8");

    // Prefer a mod-local generic tree so the test doesn't depend on a HOI4 install being present.
    const nfDir = path.join(tmp, "common", "national_focus");
    fs.mkdirSync(nfDir, { recursive: true });
    const generic = `search_filter_prios = {
\tFOCUS_FILTER_POLITICAL = 1010
}

focus_tree = {
\tid = generic_focus
\tcountry = {
\t\tfactor = 1
\t}
\tdefault = yes
\tinitial_show_position = {
\t\tfocus = army_effort
\t}
\tshared_focus = SOME_EXTERNAL_shared

\tfocus = {
\t\tid = army_effort
\t\tx = 1
\t\ty = 0
\t\tcost = 10
\t}
\tfocus = {
\t\tid = army_effort_2
\t\tprerequisite = { focus = army_effort }
\t\trelative_position_id = army_effort
\t\tx = 0
\t\ty = 1
\t}
\tfocus = {
\t\tid = equipment_effort
\t\tmutually_exclusive = { focus = army_effort_2 }
\t\tprerequisite = { focus = army_effort }
\t\tx = 2
\t\ty = 1
\t}
}
`;
    fs.writeFileSync(path.join(nfDir, "generic.txt"), generic, "utf8");
    // Loc for the source ids, so the copy has something to carry over.
    const locDir = path.join(tmp, "localisation", "english");
    fs.mkdirSync(locDir, { recursive: true });
    fs.writeFileSync(path.join(locDir, "src_l_english.yml"),
      '﻿l_english:\n army_effort:0 "Army Effort"\n army_effort_desc:0 "Ground combat is key."\n army_effort_2:0 "Army Effort II"\n equipment_effort:0 "Equipment Effort"\n', "utf8");

    const out = await req("POST", "/api/mod/copy-generic-focus-tree", { modPath: tmp, fileName: "nikos_focus" });
    check("copy: succeeds", out && out.ok === true, JSON.stringify(out).slice(0, 160));
    const text = fs.readFileSync(out.focusTreePath, "utf8");

    // --- the identity is genuinely new ---
    check("copy: tree id is the new file's, not generic_focus", out.treeId === "nikos_focus" && /\bid\s*=\s*nikos_focus\b/.test(text), out.treeId);
    check("copy: NO generic_focus id survives", !/\bid\s*=\s*generic_focus\b/.test(text), text.slice(0, 160));
    check("copy: every focus id was renamed", out.renamedFocuses === 3, String(out.renamedFocuses));
    check("copy: no bare vanilla focus id survives", !/\bid\s*=\s*army_effort\b/.test(text) && !/\bid\s*=\s*equipment_effort\b/.test(text), text);
    check("copy: brace balanced", braceBalanced(text), "");

    // --- every KIND of reference follows the rename (they all name the focus by bare token) ---
    check("copy: prerequisite follows", /prerequisite = \{ focus = nikos_army_effort \}/.test(text), text);
    check("copy: relative_position_id follows", /relative_position_id = nikos_army_effort\b/.test(text), text);
    check("copy: mutually_exclusive follows", /mutually_exclusive = \{ focus = nikos_army_effort_2 \}/.test(text), text);
    check("copy: initial_show_position follows", /initial_show_position = \{\s*focus = nikos_army_effort\s*\}/.test(text), text);
    // `\b` must not let army_effort eat the army_effort_2 prefix, and neither may be renamed twice.
    check("copy: army_effort_2 renamed once, not nested", /\bid = nikos_army_effort_2\b/.test(text) && !/nikos_nikos/.test(text), text);

    // --- things that must NOT be renamed or copied ---
    check("copy: an external shared_focus target is untouched", /shared_focus = SOME_EXTERNAL_shared/.test(text), text);
    check("copy: the top-level search_filter_prios sibling is not duplicated", !/search_filter_prios/.test(text), text);

    // --- the copy must not become a SECOND default tree ("one total default…, no more, no less") ---
    check("copy: default = no", /default\s*=\s*no\b/.test(text) && !/default\s*=\s*yes/.test(text), text.slice(0, 200));
    check("copy: starts unassigned at factor 0", /country\s*=\s*\{\s*factor\s*=\s*0\s*\}/.test(text), text.slice(0, 200));

    // --- loc carried across, or every focus renders as a raw id ---
    check("copy: loc file written", out.locWritten > 0 && out.locFile, JSON.stringify({ w: out.locWritten, f: out.locFile }));
    const loc = fs.readFileSync(path.join(tmp, out.locFile), "utf8");
    check("copy: names carried to the new ids", /\bnikos_army_effort:0 "Army Effort"/.test(loc), loc);
    check("copy: descriptions carried (keyed <id>_desc)", /\bnikos_army_effort_desc:0 "Ground combat is key."/.test(loc), loc);
    check("copy: loc has a single BOM'd header + leading space", /^﻿l_english:\n /.test(loc), JSON.stringify(loc.slice(0, 20)));

    // --- and the new tree is then assignable through the owner dialog ---
    const rel = path.relative(tmp, out.focusTreePath).split(path.sep).join("/");
    const a = await req("POST", "/api/focus/tree-properties", { modPath: tmp, relPath: rel, treeId: out.treeId, tag: "GRE", weight: 100, isDefault: false });
    const after = fs.readFileSync(out.focusTreePath, "utf8");
    check("copy: the new tree can then be assigned to a country", a.changed === true && /tag = GRE/.test(after) && /add = 100/.test(after), JSON.stringify(a).slice(0, 140));
    check("copy: focuses survive that assignment", (after.match(/\n\tfocus = \{/g) || []).length === 3, "");

    // --- a second copy must not collide with the first ---
    const out2 = await req("POST", "/api/mod/copy-generic-focus-tree", { modPath: tmp, fileName: "petros_focus" });
    const text2 = fs.readFileSync(out2.focusTreePath, "utf8");
    check("copy: a 2nd tree gets its own id", out2.treeId === "petros_focus" && /\bid\s*=\s*petros_focus\b/.test(text2), out2.treeId);
    check("copy: the 2nd tree's focus ids don't collide with the 1st", /\bid = petros_army_effort\b/.test(text2) && !/nikos_/.test(text2), text2.slice(0, 200));

    // --- guard: never write the game root ---
    const vroot = String(require("./server.js").constants.resolveHoi4GameRoot() || "");
    if (vroot) {
      const blocked = await req("POST", "/api/mod/copy-generic-focus-tree", { modPath: vroot, fileName: "x_focus" });
      check("copy: refuses to write the vanilla game root", !!blocked.error, JSON.stringify(blocked).slice(0, 120));
    }
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    srv.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nFOCUS-TREE-COPY TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
