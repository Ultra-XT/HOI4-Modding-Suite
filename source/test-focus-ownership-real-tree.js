// Focus trees are the surface behind the first user bug report this project ever received: the owner dialog
// "did nothing", and behind it a no-edit Save flattened 11 trees and dropped 417 has_dlc gates.
//
// test-focus-ownership.js covers setFocusTreeOwnership against small fixtures. What it cannot show is that
// editing ownership on a REAL tree — 15,000 lines, 374 focuses, 21 DLC gates, 396 prerequisites — moves
// nothing but the two lines it is supposed to. That is precisely the failure the original report was about,
// and a fixture-sized tree would not have exposed it.
//
// Drives the actual endpoint, not the helper, so the resolver and the route are in the path too.
//
// Needs Millennium Dawn installed; skips cleanly without it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusreal-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
let skipped = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const srcDir = path.join(MD, "common", "national_focus");
const MOD = path.join(ROOT, "focusmod");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FocusMod"\nsupported_version="1.18.*"\n', "utf8");

const count = (t, re) => (t.match(re) || []).length;
const trimNonEmpty = (t) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
function multisetGone(a, b) {
  const m = new Map();
  for (const l of b) m.set(l, (m.get(l) || 0) + 1);
  const gone = [];
  for (const l of a) { const n = m.get(l) || 0; if (n > 0) m.set(l, n - 1); else gone.push(l); }
  return gone;
}

const PORT = 42403;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    if (!fs.existsSync(srcDir)) {
      skipped++;
      console.log("  skip  (Millennium Dawn not installed on this machine)");
    } else {
      // The biggest real tree that still parses quickly — chosen by DLC-gate count, since those are what the
      // original bug destroyed.
      const picks = fs.readdirSync(srcDir)
        .filter((f) => f.endsWith(".txt"))
        .map((f) => {
          let t = ""; try { t = fs.readFileSync(path.join(srcDir, f), "utf8"); } catch (_) { return null; }
          return { f, size: t.length, dlc: count(t, /has_dlc/g), focuses: count(t, /(^|\n)\s*focus\s*=\s*\{/g) };
        })
        .filter((x) => x && x.focuses > 20 && x.dlc > 0 && x.size < 400000)
        .sort((a, b) => b.dlc - a.dlc);

      if (!picks.length) {
        skipped++;
        console.log("  skip  (no suitable Millennium Dawn tree)");
      } else {
        const chosen = picks[0];
        const REL = "common/national_focus/" + chosen.f;
        const ABS = path.join(MOD, "common", "national_focus", chosen.f);
        fs.copyFileSync(path.join(srcDir, chosen.f), ABS);
        console.log(`\n[${chosen.f}] ${chosen.size}B, ${chosen.focuses} focuses, ${chosen.dlc} has_dlc gates`);

        const before = fs.readFileSync(ABS, "utf8");
        const props = await (await fetch(
          `http://127.0.0.1:${PORT}/api/focus/tree-properties?modPath=${encodeURIComponent(MOD)}&relPath=${encodeURIComponent(REL)}`
        )).json();
        rec("the tree's ownership was read", props && props.ok === true && (props.trees || []).length > 0, props);
        const tree0 = (props.trees || [])[0] || {};
        const origWeight = tree0.weight;

        // The owner dialog's own action. It always sends weight — prefilled from the tree — so send it too.
        const r = await fetch(`http://127.0.0.1:${PORT}/api/focus/tree-properties`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ modPath: MOD, relPath: REL, treeId: tree0.treeId, tag: "NUA", weight: origWeight }),
        });
        const rb = await r.json().catch(() => null);
        rec("the ownership save succeeded", r.status === 200 && rb && !rb.error, rb || r.status);

        const after = fs.readFileSync(ABS, "utf8");
        rec("the new owner is on disk", /original_tag\s*=\s*NUA/.test(after), after.slice(0, 400));

        // Nothing else may move. These are the things the original report's Save destroyed.
        const INVARIANTS = [
          ["focus blocks", /(^|\n)\s*focus\s*=\s*\{/g],
          ["has_dlc gates", /has_dlc/g],
          ["prerequisite blocks", /prerequisite\s*=\s*\{/g],
          ["mutually_exclusive", /mutually_exclusive\s*=\s*\{/g],
          ["available blocks", /(^|\n)\s*available\s*=\s*\{/g],
          ["bypass blocks", /(^|\n)\s*bypass\s*=\s*\{/g],
          ["completion_reward", /completion_reward\s*=\s*\{/g],
          ["ai_will_do", /ai_will_do\s*=\s*\{/g],
          ["shared_focus refs", /(^|\n)\s*shared_focus\s*=/g],
          ["comment lines", /(^|\n)\s*#/g],
        ];
        for (const [label, re] of INVARIANTS) {
          const b = count(before, re), a = count(after, re);
          rec(`${label} unchanged (${b})`, b === a, { before: b, after: a });
        }

        // And the sharpest form: the ONLY content lines that changed are the ownership ones.
        const gone = multisetGone(trimNonEmpty(before), trimNonEmpty(after));
        const gained = multisetGone(trimNonEmpty(after), trimNonEmpty(before));
        const ownershipOnly = (arr) => arr.every((l) => /^(original_tag|add|tag|factor)\s*=/.test(l));
        rec("only ownership lines changed", gone.length <= 3 && ownershipOnly(gone), gone.slice(0, 8));
        rec("…and only ownership lines appeared", gained.length <= 3 && ownershipOnly(gained), gained.slice(0, 8));
        rec("the weight the dialog sent back was preserved",
          origWeight == null || new RegExp(`add\\s*=\\s*${origWeight}\\b`).test(after),
          { origWeight, sample: (after.match(/add\s*=\s*\d+/g) || []).slice(0, 3) });
        rec("the file is still brace-balanced",
          count(after.replace(/#[^\n]*/g, ""), /\{/g) === count(after.replace(/#[^\n]*/g, ""), /\}/g),
          { open: count(after.replace(/#[^\n]*/g, ""), /\{/g), close: count(after.replace(/#[^\n]*/g, ""), /\}/g) });
      }
    }

    console.log(`\n=== focus ownership on a real tree: ${checks} checks, ${fails.length} failed, ${skipped} skipped ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
