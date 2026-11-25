// #upgrade-save-eats-comments — THE LAST MERGE IN THE FILE THAT CARRIED NO COMMENTS AT ALL.
//
// Found the same way as the leader-trait one: list every mergePreserved*Block helper and ask which
// handle comments. Five do. mergePreservedUpgradeBlock did not — not for the statements it preserves,
// and not for the ones the rebuild re-emits.
//
// Create an equipment upgrade in the Army maker, annotate the file as modders do, save that id again:
//
//     #why this upgrade exists
//     #balance: was 3
//     max_level = 5                <- every note gone, on a save that only changed max_level
//
// 106 annotated lines across the installed corpora's common/units/equipment/upgrades files.
//
// DELIBERATELY NOT CHANGED, and asserted below so a later reader does not "fix" it: this merge also drops
// un-modelled FLAT keys, and that is the documented #upgrade-preserve rule — every flat scalar in an
// upgrade is a managed stat, so one the edit removed must not come back. A past bug was exactly that.
// A comment is not a statement, so none of that reasoning reaches it; only the comments change here.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upgnote-"));
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

const PORT = 53683;
const BASE = "http://127.0.0.1:" + PORT;
const UPG_SUB = ["common", "units", "equipment", "upgrades"];
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

const commentTexts = (t) => (t.match(/#[^\r\n]*/g) || []).map((s) => s.trim()).filter(Boolean);
const balanced = (t) => {
  let d = 0, inC = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inC) { if (c === "\n") inC = false; continue; }
    if (c === "#") { inC = true; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
};

let seq = 0;
function mkMod() {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, ...UPG_SUB), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova upgrade notes"\n');
  return mod;
}
const saveUpgrade = (mod, maxLevel) => fetch(`${BASE}/api/equipment/upgrade`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    modPath: mod, id: "probe_upgrade", abbreviation: "pu", cost: "land",
    max_level: maxLevel, stats: { reliability: 0.05 },
  }),
}).then((r) => r.json());
function upgradeFile(mod) {
  const dir = path.join(mod, ...UPG_SUB);
  const f = fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".txt"));
  return f.length ? path.join(dir, f[0]) : "";
}

function countCorpusNotes() {
  let total = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, ...UPG_SUB);
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      try { total += commentTexts(fs.readFileSync(path.join(dir, n), "utf8")).length; } catch (_) {}
    }
  }
  return { total, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    console.log("\n-- an upgrade the modder annotated --");
    {
      const mod = mkMod();
      const created = await saveUpgrade(mod, 5);
      rec("the upgrade is created", created && created.ok, created);
      const fp = upgradeFile(mod);
      rec("the file exists where the endpoint said", !!fp, created);
      if (fp) {
        // A note above a key the rebuild RE-EMITS, a note above an un-modelled key, and a note above a
        // NESTED block — the merge preserves nested blocks, so that one has a statement to travel with.
        let text = fs.readFileSync(fp, "utf8");
        text = text
          .replace(/(\n[ \t]*probe_upgrade[ \t]*=[ \t]*\{)/,
            "$1\n\t\t#why this upgrade exists\n\t\tcustom_upgrade_flag = yes\n\t\t#about the level requirements\n\t\tlevel_requirements = {\n\t\t\tarmy_experience = 5\n\t\t}")
          .replace(/(\n[ \t]*max_level[ \t]*=[ \t]*)(\d+)/, "\n\t\t#balance: was 3\n\t\tmax_level = $2");
        fs.writeFileSync(fp, text, "utf8");
        const before = fs.readFileSync(fp, "utf8");
        rec("CONTROL: the fixture carries three notes", commentTexts(before).length === 3, commentTexts(before));
        rec("CONTROL: …one of them above a NESTED block the merge preserves",
          /#about the level requirements\r?\n[ \t]*level_requirements/.test(before), "");

        const again = await saveUpgrade(mod, 7);
        rec("the second save is accepted", again && again.ok, again);
        const after = fs.readFileSync(fp, "utf8");

        rec("CONTROL: ⭐ the file really changed — the writer is not idling",
          after !== before && /max_level\s*=\s*7\b/.test(after), { changed: after !== before });
        rec("RUN: ⭐ the note above a RE-EMITTED key survives", after.includes("#balance: was 3"), after);
        rec("RUN: ⭐ the note above a PRESERVED nested block survives",
          after.includes("#about the level requirements"), after);
        // ⭐ A CAPTION GOES WITH THE THING IT CAPTIONS. `#why this upgrade exists` labels
        // `custom_upgrade_flag`, a flat key #upgrade-preserve deliberately drops (see the control below).
        // Keeping the note would leave a label for a line that is no longer there, which is worse than
        // losing it — so the note goes with its statement. Asserted rather than left to chance, because
        // "preserve every comment" is the obvious over-correction here and it would be wrong.
        rec("CONTROL: ⭐ the note captioning a deliberately-dropped key goes with it",
          !after.includes("#why this upgrade exists"), after);
        rec("RUN: the other two notes survive — 3 in, 2 out, and the missing one is that caption",
          commentTexts(after).length === 2, { before: commentTexts(before).length, after: commentTexts(after).length });
        rec("the nested block itself is still preserved", /level_requirements\s*=\s*\{/.test(after), after);
        rec("the file is still brace-balanced", balanced(after), after);

        // ⭐ THE RULE THIS FIX DELIBERATELY LEAVES ALONE. #upgrade-preserve says a flat scalar is a managed
        // stat, so one the edit removed must NOT come back — a past bug was exactly that. Assert it still
        // holds, so carrying comments cannot be widened into carrying statements by a later change.
        rec("CONTROL: ⭐ an un-modelled FLAT key is still dropped, as #upgrade-preserve intends",
          !/custom_upgrade_flag/.test(after), after);
      }
    }

    console.log("\n-- control: an upgrade with no notes gains none --");
    {
      const mod = mkMod();
      await saveUpgrade(mod, 5);
      const fp = upgradeFile(mod);
      const before = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the plain upgrade has no comments", commentTexts(before).length === 0, commentTexts(before));
      await saveUpgrade(mod, 5);
      const after = fs.readFileSync(fp, "utf8");
      rec("CONTROL: ⭐ re-saving it unchanged leaves it alone", after === before, { before: before.length, after: after.length });
      rec("CONTROL: and it gained no comment", commentTexts(after).length === 0, commentTexts(after));
    }

    console.log("\n-- the corpora --");
    {
      const { total, corpora } = countCorpusNotes();
      console.log("     " + total + " comments in upgrades files across " + corpora + " corpora");
      rec("CONTROL: the corpora really annotate their upgrades", corpora === 0 || total >= 20, { total, corpora });
    }

    rec("the fixture was measured", checks >= 12, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== upgrade save keeps its notes: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
