// #tab-rename-never-localised — RENAMING A RESEARCH TAB NEVER REACHED THE GAME.
//
// The user asked me to make sure text written in the program actually shows up in game. Four of the five
// kinds the research tree writes already did — tech name (`<tech_id>`), tech description (`<tech_id>_desc`),
// section labels (the gui's own `text = "KEY"`), and year stamps (a literal, no key at all, confirmed by
// 0 hits for `^\s*1936:` across vanilla's english localisation). All UTF-8 with BOM, all-ASCII keys.
//
// The fifth did not. HOI4 reads a tab's name from the loc key `<folderKey>` — vanilla
// `infantry_folder: "Infantry"` against `infantry_folder = {` in common/technology_tags — and only
// /api/research/create-custom-folder writes that key. The edit dialog called it ONLY when a new icon was
// also picked, on the reasoning that a name change is "just local config". So a rename relabelled the tab
// in the editor and in editor_custom_tabs.json while the game kept the old name forever.
//
// The same gate stranded the LEDGER, which matters more than it sounds: server.js already carries a fix for
// exactly the "editor showed Air, the game showed Navy" symptom, and that fix was unreachable from here.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tabren-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "tabrenmod");
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TabRenMod"\nsupported_version="1.19.*"\n', "utf8");

// Every english .yml in the mod, as one blob — the key could legitimately land in any of them.
const locBlob = () => {
  const dir = path.join(MOD, "localisation", "english");
  let out = "";
  try {
    for (const f of fs.readdirSync(dir)) if (/\.yml$/i.test(f)) out += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
  } catch (_) {}
  return out;
};
const valueOf = (key) => {
  const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"([^"]*)"`, "m").exec(locBlob().replace(/^\ufeff/, ""));
  return m ? m[1] : null;
};
const folderDefs = () => {
  const dir = path.join(MOD, "common", "technology_tags");
  let out = "";
  try { for (const f of fs.readdirSync(dir)) out += fs.readFileSync(path.join(dir, f), "utf8") + "\n"; } catch (_) {}
  return out;
};

const PORT = 42519;
const app = createApp();
const server = app.listen(PORT, async () => {
  const createFolder = (body) => fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] HOI4 reads a tab's name from the loc key <folderKey>");
    // Anchored on vanilla rather than reasoned out: infantry_folder: "Infantry".
    const vanillaLoc = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
      "localisation", "english", "research_l_english.yml");
    let vtxt = "";
    try { vtxt = fs.readFileSync(vanillaLoc, "utf8"); } catch (_) {}
    rec("vanilla's research localisation was readable", vtxt.length > 1000, vtxt.length);
    rec("…and it names a folder by its folder key", /^[ \t]*infantry_folder:\d*[ \t]*"/m.test(vtxt),
      (/^.*infantry_folder.*$/m.exec(vtxt) || [""])[0]);

    console.log("\n[create] a new tab writes that key");
    let r = await createFolder({ folderKey: "nova_ren_folder", ledger: "army", name: "First Name", tabDdsPath: "" });
    rec("the create succeeded", r.s === 200 && r.b && r.b.error === undefined, r.b || r.s);
    rec("the tab's name is in localisation", valueOf("nova_ren_folder") === "First Name", valueOf("nova_ren_folder"));
    rec("…and the folder is defined with the ledger asked for",
      /nova_ren_folder\s*=\s*\{[\s\S]*?ledger\s*=\s*army/.test(folderDefs()), folderDefs().slice(0, 300));

    console.log("\n[the bug] a RENAME with no new icon must still reach the game");
    // This is the call the edit dialog now makes for a name-only change; before the fix it made none.
    r = await createFolder({ folderKey: "nova_ren_folder", ledger: "army", name: "Second Name", tabDdsPath: "" });
    rec("the rename succeeded", r.s === 200 && r.b && r.b.error === undefined, r.b || r.s);
    rec("the NEW name is what localisation says", valueOf("nova_ren_folder") === "Second Name", valueOf("nova_ren_folder"));
    rec("…and the old name is gone", !/First Name/.test(locBlob()), locBlob().slice(0, 400));
    rec("…with the key defined exactly once",
      (locBlob().match(/^[ \t]*nova_ren_folder:/gm) || []).length === 1,
      (locBlob().match(/^[ \t]*nova_ren_folder:/gm) || []).length);

    console.log("\n[the ledger travels with it]");
    r = await createFolder({ folderKey: "nova_ren_folder", ledger: "navy", name: "Second Name", tabDdsPath: "" });
    rec("the ledger change succeeded", r.s === 200 && r.b && r.b.error === undefined, r.b || r.s);
    rec("…and the mod file now says navy", /nova_ren_folder\s*=\s*\{[\s\S]*?ledger\s*=\s*navy/.test(folderDefs()), folderDefs().slice(0, 400));
    rec("…and not the old army", !/nova_ren_folder\s*=\s*\{[\s\S]*?ledger\s*=\s*army/.test(folderDefs()), folderDefs().slice(0, 400));

    console.log("\n[the file HOI4 will actually read]");
    // A localisation file without a BOM is ignored outright, and a non-ASCII KEY breaks the whole file —
    // 0 of vanilla's 129,087 english keys have one.
    const dir = path.join(MOD, "localisation", "english");
    const files = fs.readdirSync(dir).filter((f) => /\.yml$/i.test(f));
    rec("a localisation file was written", files.length > 0, files);
    rec("…starting with a UTF-8 BOM", files.every((f) => fs.readFileSync(path.join(dir, f), "utf8").charCodeAt(0) === 0xFEFF), files);
    rec("…and every key it defines is ASCII",
      !/^[ \t]*[^\s:]*[^\x00-\x7F][^\s:]*:/m.test(locBlob().replace(/^\ufeff/, "")), locBlob().slice(0, 300));

    console.log("\n[the half this file cannot drive] the CLIENT must actually make that call");
    // Everything above exercises the SERVER, which was already correct — the endpoint always wrote the key.
    // The defect was in public/research.js: the edit dialog only called it when a NEW ICON was picked, so a
    // name-only rename made no request at all. A server test can never catch that, so this is a source-level
    // assertion, and it is worth being explicit that it proves the gate's SHAPE, not the runtime behaviour.
    const client = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
    const gate = /if \(tabDdsPath \|\| nameChanged \|\| ledgerChanged\) \{/.test(client);
    rec("the edit dialog no longer gates the save on a new icon", gate,
      (/\n.*if \(tabDdsPath.*\{/.exec(client) || [""])[0]);
    rec("…and it computes whether the name changed", /const nameChanged = /.test(client), "nameChanged missing");
    rec("…and whether the ledger changed", /const ledgerChanged = /.test(client), "ledgerChanged missing");
    // Both sides of that comparison must use the SAME fallback as the dropdown is filled with. When they
    // disagreed (`|| "army"` filling it, `|| ""` comparing it) a tab with no stored ledger looked changed on
    // every open, so Save Changes always wrote — and on a mod with no gui of its own, that pointless save
    // also copied countrytechtreeview.gui in.
    // ⚠️ Compare the WHOLE fallback CHAIN, not one literal default.
    //
    // This captured a single `|| "army"` from each side, which broke the moment the chain legitimately grew
    // a term: #tab-edit-clobbers-ledger added `|| baseFolderLedger(...)` so a base-game folder shows its REAL
    // ledger instead of always reading "Army". Both regexes then matched nothing and the check reported
    // {fills:null, compares:null} — a detector too literal for a rule that was still being honoured.
    //
    // The invariant is unchanged and still worth pinning. The folder variable is spelled differently on each
    // side (editingTabFolder in the dialog, folder in the save handler) and is the same value, so it is
    // normalised out before comparing.
    // Only unwrap a paren that encloses the WHOLE expression. A blanket /^\(|\)$/ strip is asymmetric: it ate
    // the opening paren of `(ct && ct.ledger)` on the fill side while the compare side lost one of two, so two
    // identical chains compared unequal.
    const unwrap = (s) => {
      for (;;) {
        if (s[0] !== "(") return s;
        let d = 0, end = -1;
        for (let i = 0; i < s.length; i++) {
          if (s[i] === "(") d++;
          else if (s[i] === ")" && --d === 0) { end = i; break; }
        }
        if (end !== s.length - 1) return s;
        s = s.slice(1, -1);
      }
    };
    const chainOf = (re, src) => {
      const m = re.exec(src);
      return m ? unwrap(m[1].replace(/editingTabFolder|folder/g, "F").replace(/\s+/g, "")) : null;
    };
    const FILL_RE = /customTabLedgerSelect\.value = ([^;]+);/;
    const CMP_RE = /const ledgerChanged = newLedger !== ([^;]+);/;
    const agree = (src) => {
      const f = chainOf(FILL_RE, src), c = chainOf(CMP_RE, src);
      return { ok: !!f && !!c && f === c, f, c };
    };

    const live = agree(client);
    rec("the ledger dropdown's default and its change-check agree", live.ok, { fills: live.f, compares: live.c });

    // ⭐ CONTROL. A detector that was loosened must be shown to still bite, or the loosening IS the regression.
    // Both shapes below are real: the first is what shipped and caused #tab-rename-never-localised, the second
    // is the shape the *next* edit would most plausibly introduce — one side growing a term and the other not.
    const OLD_BUG = 'customTabLedgerSelect.value = (ct && ct.ledger) || "army";\n'
      + 'const ledgerChanged = newLedger !== ((ct && ct.ledger) || "");';
    const HALF_UPDATED = 'customTabLedgerSelect.value = (ct && ct.ledger) || baseFolderLedger(editingTabFolder) || "army";\n'
      + 'const ledgerChanged = newLedger !== ((ct && ct.ledger) || "army");';
    rec("…and the check still catches the mismatch that shipped", agree(OLD_BUG).ok === false, agree(OLD_BUG));
    rec("…and one that grew a term on only one side", agree(HALF_UPDATED).ok === false, agree(HALF_UPDATED));
    // A control that fires on everything measures nothing: the same detector must PASS a matched pair whose
    // chain is spelled differently from the live one, or it is just pinning today's bytes over again.
    const OTHER_SHAPE = 'customTabLedgerSelect.value = (ct && ct.ledger) || guess(editingTabFolder) || "navy";\n'
      + 'const ledgerChanged = newLedger !== ((ct && ct.ledger) || guess(folder) || "navy");';
    rec("…while still accepting an agreeing pair of another shape", agree(OTHER_SHAPE).ok === true, agree(OTHER_SHAPE));

    console.log(`\n=== research tab rename loc: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
