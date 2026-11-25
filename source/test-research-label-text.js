// Section-label RENAME endpoint (/api/research/set-label-text): a single click on an in-game section label
// edits "what it says" by writing the loc value for its key into the ACTIVE MOD. This locks the invariants:
//   - in-place edit swaps ONLY the quoted value and PRESERVES the mod's exact key prefix (MD omits the :0
//     version token — re-writing it would be needless re-save drift), leaving sibling keys untouched;
//   - an inherited key (not in the mod) is written to a zz_nova override file, not the dependency/vanilla;
//   - malformed keys are rejected; the game root is never written.
// Run: node test-research-label-text.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== RESEARCH set-label-text (section label rename) ===");
  const PORT = 3921, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-labeltext-"));
  const engDir = path.join(mod, "localisation", "english");
  fs.mkdirSync(engDir, { recursive: true });
  const existingFile = path.join(engDir, "MD_techs_l_english.yml");
  // MD-style: no :0 version token on these title keys, one leading space, plus a _DESC sibling.
  fs.writeFileSync(existingFile, "﻿l_english:\n AIR_TITLE_PLANE_NAVWEAP: \"NAVAL WEAPONS\"\n AIR_TITLE_PLANE_NAVWEAP_DESC: \"keep me\"\n OTHER: \"untouched\"\n");

  const set = async (key, value, modPath = mod) => {
    const r = await fetch(`${BASE}/api/research/set-label-text`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath, key, value }),
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    // 1. In-place edit preserves the exact ` KEY: ` prefix (no :0 drift) and only swaps the value.
    const a = await set("AIR_TITLE_PLANE_NAVWEAP", "ANTI-SHIP MISSILES");
    ok("in-place edit ok", a.body && a.body.ok === true && /MD_techs/.test(a.body.file), a.body);
    const after = fs.readFileSync(existingFile, "utf8");
    ok("value updated, prefix format preserved (no :0 added)",
      /^ AIR_TITLE_PLANE_NAVWEAP: "ANTI-SHIP MISSILES"$/m.test(after), after);
    ok("sibling _DESC untouched", /^ AIR_TITLE_PLANE_NAVWEAP_DESC: "keep me"$/m.test(after));
    ok("unrelated key untouched", /^ OTHER: "untouched"$/m.test(after));
    ok("no duplicate NAVWEAP line", (after.match(/^ AIR_TITLE_PLANE_NAVWEAP:/gm) || []).length === 1);

    // 2. Inherited key (not present in the mod) → written to the zz_nova override file, not the sibling.
    const b = await set("AIR_TITLE_PLANE_INHERITED", "MY OVERRIDE");
    ok("inherited key -> override file", b.body && b.body.ok === true && /zz_nova/.test(b.body.file), b.body);
    const overridePath = path.join(engDir, "zz_nova_research_labels_l_english.yml");
    ok("override file created with l_english header + key",
      fs.existsSync(overridePath) && /l_english:/.test(fs.readFileSync(overridePath, "utf8")) &&
      /AIR_TITLE_PLANE_INHERITED:0 "MY OVERRIDE"/.test(fs.readFileSync(overridePath, "utf8")));
    ok("override file is single-BOM", fs.readFileSync(overridePath)[0] === 0xEF &&
      fs.readFileSync(overridePath, "utf8").indexOf("﻿", 1) === -1);

    // 3. Editing the same inherited key again updates in place (no duplicate).
    await set("AIR_TITLE_PLANE_INHERITED", "SECOND VALUE");
    const ov2 = fs.readFileSync(overridePath, "utf8");
    ok("re-edit override: single line, new value",
      (ov2.match(/AIR_TITLE_PLANE_INHERITED:/g) || []).length === 1 && /SECOND VALUE/.test(ov2), ov2);

    // 4. Malformed key rejected.
    const c = await set("../evil", "x");
    ok("malformed key rejected (400)", c.status === 400 && c.body && !c.body.ok, c);

    // 5. Value with an embedded quote is escaped, not left raw.
    await set("AIR_TITLE_PLANE_NAVWEAP", 'SAY "HI"');
    const quoted = fs.readFileSync(existingFile, "utf8");
    ok("embedded quote escaped", /AIR_TITLE_PLANE_NAVWEAP: "SAY \\"HI\\""/.test(quoted), quoted);

    // 6. A key DUPLICATED across two of the mod's own english files is edited in BOTH (else the game could
    //    use the stale copy). HOI4 warns on dup keys but they happen; the endpoint must not leave one behind.
    const dupA = path.join(engDir, "dupA_l_english.yml");
    const dupB = path.join(engDir, "sub", "dupB_l_english.yml");
    fs.mkdirSync(path.dirname(dupB), { recursive: true });
    fs.writeFileSync(dupA, "﻿l_english:\n DUP_KEY:0 \"A old\"\n");
    fs.writeFileSync(dupB, "﻿l_english:\n DUP_KEY: \"B old\"\n");
    const dres = await set("DUP_KEY", "shared new");
    ok("dup key: both files reported written", dres.body && Array.isArray(dres.body.files) && dres.body.files.length === 2, dres.body);
    ok("dup key: file A updated", /DUP_KEY:0 "shared new"/.test(fs.readFileSync(dupA, "utf8")));
    ok("dup key: file B updated (prefix preserved, no :0)", /DUP_KEY: "shared new"/.test(fs.readFileSync(dupB, "utf8")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nRESEARCH-LABEL-TEXT: ${pass} passed, ${fail} failed`);
  // Graceful teardown (no forced process.exit — that trips a libuv close-handle assertion on Windows):
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
