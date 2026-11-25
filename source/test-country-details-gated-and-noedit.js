// Three defects in Save Details on the Country Setup page.
//
//  * setOrReplaceKey matched a key's FIRST appearance at ANY brace depth. When the only place a country
//    declares set_stability is inside a DLC gate —
//      if = { limit = { has_dlc = "By Blood Alone" } set_stability = 0.6 }
//    which is how France, Germany, Afghanistan, Hungary, Czechoslovakia, Sweden, Chile and Uruguay are
//    written — the typed value landed INSIDE the gate. It then applied only to players who own that DLC,
//    while the ungated default stayed as it was.
//  * A value that already means what we are about to write was still rewritten: `0.40` became `0.4`. That is
//    not an edit the user asked for, and because it made the text differ it defeated the "nothing changed"
//    guard, so the whole file went through the tidy-up that collapses blank lines elsewhere. Opening a
//    country and pressing Save with no edits reformatted the file.
//  * When a country declares set_politics or set_popularities more than once, the writer deliberately
//    declines to guess which one to edit (#ambiguous-country-block, four Millennium Dawn countries are shaped
//    that way). That decision was logged to the server console only, while the API answered a bare ok:true —
//    so from the editor a silently-skipped save looked exactly like a successful one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cdet-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "cdetmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CDetMod"\nsupported_version="1.18.*"\n', "utf8");

const fileFor = (tag, name) => path.join(MOD, "history", "countries", `${tag} - ${name}.txt`);

const PORT = 42431;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (tag, details) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/save-country-details`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag, details }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[DLC gate] a gated set_stability must not be the thing we edit");
    const GAT = fileFor("GAT", "Gateland");
    const gatedSeed = [
      "capital = 1",
      "",
      'if = {',
      '\tlimit = { has_dlc = "By Blood Alone" }',
      "\tset_stability = 0.6",
      "\tset_war_support = 0.3",
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(GAT, gatedSeed, "utf8");

    let r = await save("GAT", { stability: 0.9 });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    let t = fs.readFileSync(GAT, "utf8");
    rec("the DLC gate still holds its ORIGINAL value", /has_dlc[\s\S]*?set_stability\s*=\s*0\.6/.test(t), t);
    rec("…and the gate itself is intact", /has_dlc\s*=\s*"By Blood Alone"/.test(t), t);
    // The new value must exist OUTSIDE the gate. Check by stripping the if-block and looking at what is left.
    const outsideGate = t.replace(/if\s*=\s*\{[\s\S]*?\n\}/, "");
    rec("the value the user typed is written UNCONDITIONALLY", /set_stability\s*=\s*0\.9/.test(outsideGate), outsideGate);

    console.log("\n[no edit] a save that changes nothing must leave the file byte-identical");
    const NOP = fileFor("NOP", "Noopland");
    // 0.40 and 0.4 are the same number written differently — the renormalisation that defeated the guard.
    const nopSeed = [
      "﻿capital = 12",
      "",
      "set_stability = 0.40",
      "",
      "",
      "set_war_support = 0.60",
      "",
      "# a comment the tidy-up would not remove, but the blank lines above it would go",
      "set_research_slots = 3",
      "",
    ].join("\n");
    fs.writeFileSync(NOP, nopSeed, "utf8");
    const before = fs.readFileSync(NOP);

    r = await save("NOP", { stability: 0.4, warSupport: 0.6, researchSlots: 3 });
    rec("the no-edit save succeeded", r.status === 200, r.body || r.status);
    rec("the file is BYTE-IDENTICAL", fs.readFileSync(NOP).equals(before),
      { before: before.toString("utf8"), after: fs.readFileSync(NOP).toString("utf8") });
    rec("…and the response says nothing changed", r.body && r.body.unchanged === true, r.body);
    rec("the BOM survived", fs.readFileSync(NOP)[0] === 0xEF, [...fs.readFileSync(NOP).slice(0, 3)]);

    console.log("\n[control] a REAL edit still lands");
    // Without this the fix could be "never write anything", which passes every check above.
    r = await save("NOP", { stability: 0.75 });
    t = fs.readFileSync(NOP, "utf8");
    rec("a changed value is written", /set_stability\s*=\s*0\.75/.test(t), t);
    rec("…exactly once", (t.match(/set_stability\s*=/g) || []).length === 1, (t.match(/set_stability\s*=/g) || []).length);
    rec("…and the response does NOT claim it was unchanged", r.body && r.body.unchanged === false, r.body);
    rec("the unrelated keys were left alone", /set_war_support\s*=\s*0\.60/.test(t), t);

    console.log("\n[dated block] a key that exists ONLY in a dated block must not be duplicated by a no-edit save");
    // The depth guard alone caused this: the reader surfaces the dated block's value, the editor hands it
    // straight back, no top-level statement exists to edit, so a new one was inserted on EVERY save — which
    // for a dated block also moves a later value into the country's START state. Only a real change may
    // write an unconditional statement.
    const DAT = fileFor("DAT", "Datedland");
    const datSeed = [
      "capital = 7",
      "",
      "1949.1.1 = {",
      "\tset_stability = 0.25",
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(DAT, datSeed, "utf8");
    const datBefore = fs.readFileSync(DAT);

    r = await save("DAT", { stability: 0.25 }); // exactly what the reader would have shown
    rec("the no-edit save succeeded", r.status === 200, r.body || r.status);
    rec("the file is byte-identical — no top-level copy was inserted",
      fs.readFileSync(DAT).equals(datBefore), fs.readFileSync(DAT).toString("utf8"));
    rec("…and set_stability still appears exactly once",
      (fs.readFileSync(DAT, "utf8").match(/set_stability\s*=/g) || []).length === 1,
      fs.readFileSync(DAT, "utf8"));

    r = await save("DAT", { stability: 0.8 }); // a genuine change
    t = fs.readFileSync(DAT, "utf8");
    rec("a REAL change does write an unconditional statement", /set_stability\s*=\s*0\.8/.test(t), t);
    rec("…and leaves the dated block's own value alone",
      /1949\.1\.1\s*=\s*\{[\s\S]*?set_stability\s*=\s*0\.25/.test(t), t);

    console.log("\n[two tiers] a top-level block plus a DATED one is not ambiguous — edit the top-level one");
    // RETARGETED (#politics-not-saved-but-ui-says-saved). This fixture used to be the ambiguous case, because
    // the refusal counted occurrences at ANY indentation. It isn't: a country history file is an ordered
    // effect list, so a top-level block is the game-start state and an indented one inside `1949.1.1 = { … }`
    // is a later change. Measured across both corpora: 54 of vanilla's 364 country files declare set_politics
    // twice and 42 declare set_popularities twice, MD 4 and 4 — and NOT ONE of them, in either corpus, has two
    // TOP-LEVEL declarations. The refusal fired on 100 real countries and was correct in none of them, while
    // the UI said "Country details saved successfully!".
    const TWO = fileFor("TWO", "Twotierland");
    const twoSeed = [
      "capital = 5",
      "",
      "set_popularities = {",
      "\tcommunism = 60",
      "\tneutrality = 40",
      "}",
      "",
      "1949.1.1 = {",
      "\tset_popularities = {",
      "\t\tnationalist = 55",
      "\t\tneutrality = 45",
      "\t}",
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(TWO, twoSeed, "utf8");
    r = await save("TWO", { popularities: { communism: 10, neutrality: 90 } });
    rec("the save succeeded", r.status === 200, r.body || r.status);
    {
      const t2 = fs.readFileSync(TWO, "utf8");
      rec("the TOP-LEVEL block took the new values", /(^|\n)set_popularities\s*=\s*\{[^}]*communism\s*=\s*10/.test(t2), t2);
      rec("…and the DATED block is untouched",
        /1949\.1\.1\s*=\s*\{[\s\S]*?nationalist\s*=\s*55[\s\S]*?neutrality\s*=\s*45/.test(t2), t2);
      rec("…and nothing was refused", !(r.body && (r.body.notes || []).some((n) => /popularit/i.test(n))), r.body);
    }

    console.log("\n[ambiguous block] TWO TOP-LEVEL declarations really are ambiguous, and must be reported");
    const AMB = fileFor("AMB", "Ambiguland");
    const ambSeed = [
      "capital = 5",
      "",
      "set_popularities = {",
      "\tcommunism = 60",
      "\tneutrality = 40",
      "}",
      "",
      "set_popularities = {",
      "\tnationalist = 55",
      "\tneutrality = 45",
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(AMB, ambSeed, "utf8");
    const ambBefore = fs.readFileSync(AMB);

    r = await save("AMB", { popularities: { communism: 10, neutrality: 90 } });
    rec("the save succeeded", r.status === 200, r.body || r.status);
    rec("the popularities block was NOT rewritten", fs.readFileSync(AMB).equals(ambBefore),
      fs.readFileSync(AMB).toString("utf8"));
    rec("…and the response SAYS SO rather than reporting a bare ok",
      !!(r.body && Array.isArray(r.body.notes) && r.body.notes.some((n) => /popularit/i.test(n))),
      r.body);
    rec("the note tells the user what to do about it",
      !!(r.body && (r.body.notes || []).some((n) => /history file/i.test(n))), r.body && r.body.notes);

    console.log("\n[control] a singly-declared block still saves normally and reports no note");
    r = await save("NOP", { popularities: { communism: 10, neutrality: 90 } });
    t = fs.readFileSync(NOP, "utf8");
    rec("the popularities landed", /communism\s*=\s*10/.test(t) && /neutrality\s*=\s*90/.test(t), t);
    rec("…with no skip note", !!(r.body && Array.isArray(r.body.notes) && r.body.notes.length === 0), r.body);

    console.log(`\n=== country details gated/no-edit: ${checks} checks, ${fails.length} failed ===`);
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
