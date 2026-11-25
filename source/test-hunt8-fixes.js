// Regression (bug-hunt #8): three confirmed fixes.
//  (1) [HIGH] Character advisor `ledger` was emitted by serializeCharacter but NOT in _CHAR_MANAGED_ADVISOR,
//      so on edit mergePreservedCharacterBlock re-injected the OLD ledger → duplicate key → PDX last-wins
//      silently reverted the user's edit. `ledger` is now managed.
//  (2) [MED] upsertCustomFolderNameLoc wrote the folder display-name via raw fs.writeFileSync, which did NOT
//      bump the localization write-epoch, so getLocalizationMap's 30s TTL cache served a stale map and the
//      research tab showed the derived-from-key name for up to 30s. Now writes via writeUtf8BomFile (bumps
//      the epoch + adds the BOM).
//  (3) [HIGH] cfCanvasToPos clamped continuous_focus_position to >= 0, but cfPosToCanvas loads negatives
//      fine — so a panel authored off-canvas (negative x/y, e.g. free_states) had its offset rewritten to 0
//      on any drag-save. The clamp is removed; the two functions are now proper inverses.
// Run: node test-hunt8-fixes.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

try {
  // ── (1) CHARACTER LEDGER: edit army→navy must leave ONE ledger line (navy), not two ──
  {
    const newBlock =
      `\tbob = {\n\t\tname = "Bob"\n\t\tadvisor = {\n\t\t\tslot = army_chief\n\t\t\tidea_token = bob_tok\n\t\t\tledger = navy\n\t\t\ttraits = { }\n\t\t}\n\t}\n`;
    const oldInner =
      `\n\t\tname = "Bob"\n\t\tadvisor = {\n\t\t\tslot = army_chief\n\t\t\tidea_token = bob_tok\n\t\t\tledger = army\n\t\t\ttraits = { }\n\t\t}\n`;
    const merged = S.mergePreservedCharacterBlock(newBlock, oldInner, "bob_tok");
    const ledgerCount = (merged.match(/ledger\s*=/g) || []).length;
    ok("advisor ledger appears exactly once after edit (was duplicated)", ledgerCount === 1, { ledgerCount, merged });
    ok("the edited (new) ledger value wins", /ledger\s*=\s*navy/.test(merged) && !/ledger\s*=\s*army/.test(merged), merged);
  }

  // ── CONTROL: a genuinely un-modeled advisor field (ai_will_do) is STILL preserved on edit ──
  {
    const newBlock = `\tj = {\n\t\tname = "J"\n\t\tadvisor = {\n\t\t\tslot = political_advisor\n\t\t\tidea_token = j_tok\n\t\t\ttraits = { }\n\t\t}\n\t}\n`;
    const oldInner = `\n\t\tname = "J"\n\t\tadvisor = {\n\t\t\tslot = political_advisor\n\t\t\tidea_token = j_tok\n\t\t\ttraits = { }\n\t\t\tai_will_do = { factor = 7 }\n\t\t}\n`;
    const merged = S.mergePreservedCharacterBlock(newBlock, oldInner, "j_tok");
    ok("un-modeled ai_will_do still preserved (managed set didn't over-grow)", /ai_will_do\s*=\s*\{\s*factor\s*=\s*7/.test(merged), merged);
  }

  // ── (2) FOLDER-NAME LOC EPOCH: warm the cache, write a folder name, the NEXT read must be fresh ──
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locepoch-"));
    fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="LocEpoch"\n');
    fs.mkdirSync(path.join(root, "localisation", "english"), { recursive: true });
    const before = S.getLocalizationMap(root); // warm the TTL cache (epoch E, no folder name yet)
    ok("folder name absent before write", !(before.names && before.names.drones_folder), before.names && before.names.drones_folder);
    S.upsertCustomFolderNameLoc(root, "drones_folder", "Drone Warfare");
    const after = S.getLocalizationMap(root); // must recompute because the epoch bumped
    ok("folder name FRESH on next read (epoch bumped, no 30s stale window)", after.names && after.names.drones_folder === "Drone Warfare", after.names && after.names.drones_folder);
    const yml = fs.readFileSync(path.join(root, "localisation", "english", "nova_custom_folders_l_english.yml"), "utf8");
    ok("folder loc file has a UTF-8 BOM", yml.charCodeAt(0) === 0xFEFF);
    ok("folder loc file has exactly one BOM (writeUtf8BomFile normalized it)", (yml.match(/﻿/g) || []).length === 1, JSON.stringify(yml.slice(0, 20)));
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }

  // ── (3) CF CLAMP: run the ACTUAL shipped cfPosToCanvas + cfCanvasToPos (extracted from app.js) ──
  {
    const src = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
    const grab = (name) => {
      const start = src.indexOf(`function ${name}(`);
      if (start < 0) throw new Error("cannot find " + name);
      const open = src.indexOf("{", start);
      let d = 0, end = -1;
      for (let i = open; i < src.length; i++) { const c = src[i]; if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { end = i + 1; break; } } }
      return src.slice(start, end);
    };
    // build both fns in a scope with the module-level constants injected (same values for both → self-consistent)
    const make = new Function("viewScale", "BASE_OFFSET", "viewportShiftX", "viewportShiftY", "GRID_X", "GRID_Y", "CF_HOI4_PX_X", "CF_HOI4_PX_Y",
      `${grab("cfPosToCanvas")}\n${grab("cfCanvasToPos")}\nreturn { cfPosToCanvas, cfCanvasToPos };`);
    const { cfPosToCanvas, cfCanvasToPos } = make(1, 120, 0, 0, 96, 130, 96, 130);

    // a panel authored off-canvas at x=-100 must ROUND-TRIP, not clamp to 0
    const canvas = cfPosToCanvas({ x: -100, y: 50 });
    const back = cfCanvasToPos(canvas.left, canvas.top);
    ok("negative x round-trips (was clamped to 0)", back.x === -100, back);
    ok("positive y still round-trips", back.y === 50, back);
    // a negative y (free_states 'off the top') also survives
    const back2 = cfCanvasToPos(cfPosToCanvas({ x: 0, y: -60 }).left, cfPosToCanvas({ x: 0, y: -60 }).top);
    ok("negative y round-trips (was clamped to 0)", back2.y === -60, back2);
    // a normal positive position is unaffected
    const back3 = cfCanvasToPos(cfPosToCanvas({ x: 200, y: 130 }).left, cfPosToCanvas({ x: 200, y: 130 }).top);
    ok("positive position unaffected", back3.x === 200 && back3.y === 130, back3);
  }
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }

console.log(`\nHUNT8-FIXES: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
