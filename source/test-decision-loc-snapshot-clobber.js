// #decision-loc-clobbered-by-snapshot — A SAVE REPORTED SUCCESS AND SILENTLY ROLLED THE NAME BACK.
//
// upsertDecisionLocalization reads custom_decisions_l_english.yml into `locTxt` ONCE, at the top. When the
// title key already lives in that same file, `upsert(titleKey, …)` takes the direct-write branch and writes
// the new name straight to disk. A later `upsert(descKey, "")` finds no existing entry, appends its line to
// the STALE snapshot, and the final `writeUtf8BomFile(locPath, locTxt)` puts that snapshot back over the
// file — reverting the title the user just typed. The response still carries {ok:true} and a locPath, and
// the next list refresh shows the old name again.
//
// The trigger is ordinary, not exotic. `upsert(descKey, "")` runs whenever isNewDecision is true and the mod
// has no `_desc` for the key, and isNewDecision is `!findDecisionHomeFile(...)` — true for a RENAME (the new
// id has no home file yet), for a MOVE to another category, and for a create whose title line already
// exists. Nova itself creates the vulnerable title-without-`_desc` line on any ordinary edit of a decision
// that had no localisation, so this is reachable from a pure-Nova workflow with no hand-authored .yml.
//
// It bites hardest on the 64 vanilla and 42 Millennium Dawn decisions that declare an explicit
// `name = SOME_KEY`, because the game reads the displayed name from that key.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locsnap-"));
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

const MOD = path.join(ROOT, "locsnapmod");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocSnap"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "c.txt"),
  "nova_snap_cat = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n", "utf8");
const DEC = path.join(MOD, "common", "decisions", "nova_snap.txt");
fs.writeFileSync(DEC, `nova_snap_cat = {
\tnova_snap_dec = {
\t\ticon = GFX_decision_generic_decision
\t\tcost = 10
\t\tfire_only_once = no
\t\tcomplete_effect = {
\t\t\tadd_political_power = 1
\t\t}
\t}
}
`, "utf8");
// The vulnerable shape: the title key already lives in the FALLBACK file, and there is no `_desc` for it.
const LOC = path.join(MOD, "localisation", "english", "custom_decisions_l_english.yml");
fs.writeFileSync(LOC, "﻿l_english:\n nova_snap_dec:0 \"Original Title\"\n", "utf8");

const titleOf = (key) => {
  const dir = path.join(MOD, "localisation", "english");
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!fs.statSync(p).isFile()) continue;
    const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"([^"]*)"`, "m")
      .exec(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
    if (m) return m[1];
  }
  return null;
};

const PORT = 43023;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[control] the fixture really is the vulnerable shape");
    rec("the title key already lives in the fallback file", titleOf("nova_snap_dec") === "Original Title",
      titleOf("nova_snap_dec"));
    rec("…and it has no _desc, which is what triggers the second upsert",
      titleOf("nova_snap_dec_desc") === null, titleOf("nova_snap_dec_desc"));

    console.log("\n[the bug] renaming the decision must persist the new name");
    // A rename: isNewDecision is true because the NEW id has no home file yet.
    let r = await save({
      categoryId: "nova_snap_cat", id: "nova_renamed_dec", fileName: "nova_snap.txt",
      previousId: "nova_snap_dec", previousCategoryId: "nova_snap_cat",
      name: "Brand New Title",
      icon: "GFX_decision_generic_decision", cost: "10", fireOnce: "no",
      effect: "add_political_power = 1",
    });
    rec("the rename reported success", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the new name is actually on disk", titleOf("nova_renamed_dec") === "Brand New Title",
      titleOf("nova_renamed_dec"));

    console.log("\n[the case that actually reproduces it] a NEW decision whose title key already exists");
    // The exact condition: the title key resolves to custom_decisions_l_english.yml, `<key>_desc` is absent,
    // and isNewDecision is true. Then upsert(title) writes DIRECTLY to that file while upsert(desc, "")
    // appends to the snapshot taken before it — and the snapshot wins.
    // My first attempt at this test used a rename and a move and passed with the fix reverted: a rename gives
    // the new id a title key that does not exist yet, so the title also takes the append branch and there is
    // nothing to clobber. Worth stating, because the control refusing to fire is what found that.
    fs.writeFileSync(LOC, "﻿l_english:\n nova_fresh_dec:0 \"Old Title\"\n", "utf8");
    r = await save({
      categoryId: "nova_snap_cat", id: "nova_fresh_dec", fileName: "nova_snap.txt",
      name: "New Title",
      icon: "GFX_decision_generic_decision", cost: "10", fireOnce: "no",
      effect: "add_political_power = 1",
    });
    rec("the create reported success", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the name the user typed is what is on disk",
      titleOf("nova_fresh_dec") === "New Title", titleOf("nova_fresh_dec"));
    rec("…and the empty _desc placeholder was still added",
      titleOf("nova_fresh_dec_desc") === "", titleOf("nova_fresh_dec_desc"));

    console.log("\n[the sharper case] a decision whose displayed name comes from its own `name = KEY`");
    // 64 vanilla and 42 MD decisions do this; the game reads the name from THAT key, not from `<id>`.
    // The key is read off the decision's OWN `name = KEY` line on disk, so the fixture has to carry it.
    fs.writeFileSync(DEC, `nova_snap_cat = {
\tnova_keyed_dec = {
\t\tname = NOVA_SHARED_TITLE
\t\ticon = GFX_decision_generic_decision
\t\tcost = 10
\t\tfire_only_once = no
\t\tcomplete_effect = {
\t\t\tadd_political_power = 1
\t\t}
\t}
}
`, "utf8");
    fs.writeFileSync(LOC, "﻿l_english:\n NOVA_SHARED_TITLE:0 \"Shared Original\"\n", "utf8");
    r = await save({
      categoryId: "nova_snap_cat", id: "nova_keyed_dec", fileName: "nova_snap.txt",
      previousId: "nova_keyed_dec", previousCategoryId: "nova_other_cat", // a MOVE: isNewDecision is true
      name: "Shared Updated",
      icon: "GFX_decision_generic_decision", cost: "10", fireOnce: "no",
      effect: "add_political_power = 1",
    });
    rec("the keyed save reported success", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the declared key carries the new name",
      titleOf("NOVA_SHARED_TITLE") === "Shared Updated", titleOf("NOVA_SHARED_TITLE"));

    console.log("\n[the file is still valid for the game]");
    const raw = fs.readFileSync(LOC, "utf8");
    rec("the loc file still starts with a BOM", raw.charCodeAt(0) === 0xFEFF, raw.charCodeAt(0));
    rec("…and still has its l_english header", /^﻿?l_english:/.test(raw), raw.slice(0, 40));
    rec("…and defines each key exactly once",
      (raw.match(/^[ \t]*NOVA_SHARED_TITLE:/gm) || []).length <= 1, raw.slice(0, 300));

    console.log(`\n=== decision loc snapshot clobber: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
