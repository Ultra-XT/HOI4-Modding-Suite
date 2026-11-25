// #folder-ledger-spliced-into-a-nested-block — CHANGING A TAB'S LEDGER TWICE CORRUPTED ITS DLC GATE.
//
// upsertTechnologyFolderDef finds the folder's block with
//     new RegExp(`(\\b${key}\\s*=\\s*\\{)([\\s\\S]*?)(\\})`)
// — a NON-GREEDY body running to the FIRST closing brace. That is correct only while the block has no
// nested block in it, and this function's own insert path guarantees one will appear:
//
//   · overriding a base-game folder copies the BASE BODY verbatim, on purpose, so that changing a tab's
//     icon cannot silently drop `available = { has_dlc = "Man the Guns" }` (#vanilla-folder-redefined);
//   · so after the first save the mod's file contains a folder block WITH a nested `available` block;
//   · a second ledger change then matches only as far as the nested block's `}`, and writes `ledger = …`
//     INSIDE the DLC gate. The outer block's real ledger is left alone, so the edit appears to do nothing,
//     and `available` now reads `{ has_dlc = "Man the Guns" ledger = air }`.
//
// The braces still balance, so the existing bracesAreBalanced guard passes it. Nothing reports a problem.
//
// The fix is to find the block's true end by matching braces rather than by regex laziness.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ledger-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
// A base mod supplying a folder whose body contains a NESTED block, exactly as vanilla's mtgnavalfolder does.
const BASE = path.join(ROOT, "ledgerbase");
fs.mkdirSync(path.join(BASE, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="LedgerBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "ledgerbase.mod"), 'name="LedgerBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "common", "technology_tags", "00_technology.txt"),
  "technology_categories = {\n\tnova_cat\n}\n" +
  "technology_folders = {\n" +
  "\tnova_gated_folder = {\n\t\tavailable = {\n\t\t\thas_dlc = \"Man the Guns\"\n\t\t}\n\t\tledger = navy\n\t}\n" +
  "}\n");

const MOD = path.join(ROOT, "ledgermod");
fs.mkdirSync(MOD, { recursive: true });
const dep = 'dependencies={\n\t"LedgerBase"\n}\n';
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LedgerMod"\n' + dep + 'supported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "ledgermod.mod"), 'name="LedgerMod"\npath="' + toPosix(MOD) + '"\n' + dep + 'supported_version="1.19.*"\n');

const FILE = path.join(MOD, "common", "technology_tags", "zz_nova_custom_folders.txt");
const PORT = 53051;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    // ⭐ SEND WHAT THE CLIENT SENDS — /api/research/create-custom-folder takes
    // { folderKey, ledger, tabDdsPath, modPath, name }.
    const save = (ledger) => fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderKey: "nova_gated_folder", ledger, tabDdsPath: "", modPath: MOD, name: "Gated" }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    // What the folder's ledger is, read the way the game would: the OUTER block's own ledger, not one
    // hiding inside a nested block.
    const outerLedgerOf = (text) => {
      const at = text.indexOf("nova_gated_folder");
      if (at === -1) return null;
      const open = text.indexOf("{", at);
      let d = 0, close = -1;
      for (let i = open; i < text.length; i++) {
        if (text[i] === "{") d++;
        else if (text[i] === "}") { d--; if (!d) { close = i; break; } }
      }
      if (close === -1) return null;
      const body = text.slice(open + 1, close);
      // strip nested blocks, so `ledger` inside `available = { … }` does not count
      let depth = 0, top = "";
      for (const ch of body) {
        if (ch === "{") { depth++; continue; }
        if (ch === "}") { depth--; continue; }
        if (depth === 0) top += ch;
      }
      const m = /\bledger\s*=\s*([A-Za-z_]+)/.exec(top);
      return m ? m[1] : null;
    };
    const availableBodyOf = (text) => {
      const m = /available\s*=\s*\{([\s\S]*?)\}/.exec(text);
      return m ? m[1].replace(/\s+/g, " ").trim() : null;
    };

    console.log("\n[first save] overriding a gated base-mod folder keeps its DLC gate");
    {
      const r = await save("air");
      rec("the save succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      const t = fs.readFileSync(FILE, "utf8");
      console.log("     file after save 1:\n" + t.split("\n").map((l) => "       " + l).join("\n"));
      rec("the DLC gate was carried over, not dropped", /has_dlc\s*=\s*"Man the Guns"/.test(t), t);
      rec("…and the ledger is what was asked for", outerLedgerOf(t) === "air", outerLedgerOf(t));
    }

    console.log("\n[⭐ SECOND save] the edit that used to splice into the nested block");
    {
      const r = await save("civilian");
      rec("the second save succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      const t = fs.readFileSync(FILE, "utf8");
      console.log("     file after save 2:\n" + t.split("\n").map((l) => "       " + l).join("\n"));
      // THE BUG: `ledger = civilian` landed inside `available = { … }`, the outer ledger stayed "air",
      // and the braces still balanced so nothing complained.
      rec("the ledger really changed", outerLedgerOf(t) === "civilian", outerLedgerOf(t));
      rec("…and nothing was spliced into the DLC gate",
        !/ledger/.test(String(availableBodyOf(t) || "")), availableBodyOf(t));
      rec("…the gate still says only what it said", String(availableBodyOf(t) || "").includes("Man the Guns"), availableBodyOf(t));
      rec("…and the folder is defined exactly once", (t.match(/nova_gated_folder\s*=\s*\{/g) || []).length === 1,
        (t.match(/nova_gated_folder\s*=\s*\{/g) || []).length);
    }

    console.log("\n[a third save] back to where it started, so this is not a one-shot");
    {
      await save("navy");
      const t = fs.readFileSync(FILE, "utf8");
      rec("the third change lands too", outerLedgerOf(t) === "navy", outerLedgerOf(t));
      rec("…with the gate still intact", /has_dlc\s*=\s*"Man the Guns"/.test(t), t.slice(0, 200));
    }

    console.log("\n[CONTROL] a folder with NO nested block still works");
    {
      // The lazy regex was correct for this shape, which is why the defect only showed on gated folders.
      const flat = (ledger) => fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderKey: "nova_flat_folder", ledger, tabDdsPath: "", modPath: MOD, name: "Flat" }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
      await flat("army");
      await flat("air");
      const t = fs.readFileSync(FILE, "utf8");
      const at = t.indexOf("nova_flat_folder");
      const seg = at === -1 ? "" : t.slice(at, at + 120);
      console.log(`     flat folder: ${JSON.stringify(seg.replace(/\s+/g, " ").trim())}`);
      rec("a flat folder's ledger changes as before", /ledger\s*=\s*air/.test(seg), seg);
      rec("…and it too is defined once", (t.match(/nova_flat_folder\s*=\s*\{/g) || []).length === 1,
        (t.match(/nova_flat_folder\s*=\s*\{/g) || []).length);
    }

    console.log("\n[the file] must still lex");
    {
      const t = fs.readFileSync(FILE, "utf8").replace(/#[^\n]*/g, "");
      let d = 0, bad = false;
      for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) bad = true; } }
      rec("braces balance", !bad && d === 0, `depth ${d}`);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== folder ledger nested block: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
