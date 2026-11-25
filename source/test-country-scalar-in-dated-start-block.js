// Save Details wrote a country scalar ABOVE the dated block that overrides it, and reported success.
//
// A country history file is an ordered effect list, and a `YYYY.M.D = { … }` block whose date is on or before
// the campaign start runs AFTER the unconditional body. Millennium Dawn keeps Germany's game-start state
// inside `2000.1.1 = { … }` — including `set_convoys = 150` — and MD's campaign starts on 2000.1.1, so that
// block runs. Typing 999 convoys in Country Setup inserted a NEW `set_convoys = 999` at the very top of the
// file, above that block. The block then ran last and Germany still started the game on 150, while the reader
// preferred the new top-level statement and showed 999 forever: the disagreement was permanent and
// self-confirming. The response was {ok:true, unchanged:false} with no note about the scalar at all.
//
// Measured across the six installed corpora: 20 (file,key) pairs in 13 country history files declare one of
// the four Country-Setup scalars ONLY inside a dated block that runs at that mod's campaign start — 8
// Millennium Dawn countries (set_convoys in 2000.1.1) and 5 Rise of Nations ones (1900.1.1, including Italy).
// Nova already knew the shape: the set_politics / set_popularities writer next door refuses it and says
// "A block added at the top would be overridden by that one, so nothing was written." The scalar writer
// never adopted that guard.
//
// The fix writes the value where the country actually declares it — inside the start block — and only there:
// a block dated AFTER the campaign start does not run at start, so a new unconditional statement really is
// the game-start value (13 further corpus pairs, e.g. vanilla's PRC in 1939.1.1), and a declaration nested
// deeper than the block itself (Rise of Nations' Morocco writes set_research_slots inside
// `create_dynamic_country = { … }`) belongs to another country and must be left alone.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-datedstart-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

// Two mods, differing only in the campaign start date their bookmark declares. That date is the whole
// question: the SAME `2000.1.1 = { … }` block runs at start in one and never runs in the other.
function mkmod(name, date) {
  const p = path.join(ROOT, name);
  fs.mkdirSync(path.join(p, "history", "countries"), { recursive: true });
  fs.mkdirSync(path.join(p, "common", "bookmarks"), { recursive: true });
  fs.writeFileSync(path.join(p, "descriptor.mod"), `name="${name}"\nsupported_version="1.18.*"\n`, "utf8");
  fs.writeFileSync(path.join(p, "common", "bookmarks", "00_bookmark.txt"),
    ['bookmarks = {', '\tbookmark = {', '\t\tname = "BM"', '\t\tdesc = "BM"',
      `\t\tdate = ${date}`, '\t\tdefault = yes', '\t}', '}', ''].join("\n"), "utf8");
  return p;
}
const MODERN = mkmod("modernmod", "2000.1.1.12"); // start 2000.1.1 — Millennium Dawn's shape
const CLASSIC = mkmod("classicmod", "1936.1.1.12"); // start 1936.1.1 — vanilla's

const fileFor = (mod, tag, name) => path.join(mod, "history", "countries", `${tag} - ${name}.txt`);
// How many times a key is declared at BRACE DEPTH 0 (a real top-level statement), comments ignored.
const topLevelCount = (txt, key) => {
  const scan = txt.replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
  const re = new RegExp(`(?:^|\\n)[ \\t]*${key}\\s*=`, "g");
  let m, n = 0;
  while ((m = re.exec(scan)) !== null) {
    let depth = 0;
    for (let i = 0; i < m.index; i += 1) { if (scan[i] === "{") depth += 1; else if (scan[i] === "}") depth -= 1; }
    if (depth === 0) n += 1;
    re.lastIndex = m.index + m[0].length;
  }
  return n;
};
const countAll = (txt, key) => (txt.replace(/#[^\n]*/g, "").match(new RegExp(key + "\\s*=", "g")) || []).length;

const PORT = 54153;
const app = createApp();
const server = app.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;
  const save = async (mod, tag, details) => {
    const r = await fetch(`${base}/api/history/save-country-details`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag, details }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = async (mod, tag) =>
    (await fetch(`${base}/api/history/country-details?tag=${tag}&modPath=${encodeURIComponent(mod)}`)).json();

  try {
    console.log("\n[control] the two fixtures really do have the campaign start dates this test turns on");
    for (const [mod, want] of [[MODERN, "2000.1.1"], [CLASSIC, "1936.1.1"]]) {
      const sd = await (await fetch(`${base}/api/mod/start-date?modPath=${encodeURIComponent(mod)}`)).json();
      rec(`${path.basename(mod)} starts ${want}`, `${sd.year}.${sd.month}.${sd.day}` === want, sd);
    }

    console.log("\n[the defect] a scalar declared only inside the START block must be written THERE");
    const GER = fileFor(MODERN, "GER", "Germany");
    const gerSeed = [
      "﻿capital = 45",
      "2000.1.1 = {",
      "\tset_cosmetic_tag = GER",
      "\tset_convoys = 150",
      "\tset_stability = 0.55",
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(GER, gerSeed, "utf8");
    // CONTROL ON THE FIXTURE: it must actually have the property under test, or the checks below measure air.
    rec("the fixture declares set_convoys ONLY inside the dated block",
      topLevelCount(gerSeed, "set_convoys") === 0 && countAll(gerSeed, "set_convoys") === 1, gerSeed);

    const before = await read(MODERN, "GER");
    rec("…and the editor shows the dated block's value, so that is what the user edits",
      before.details && before.details.convoys === 150, before.details);

    let r = await save(MODERN, "GER", { convoys: 999 });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    // CONTROL ON THE WRITE: the response must not claim there was nothing to do.
    rec("…and says the file changed", r.body && r.body.unchanged === false, r.body);
    let t = fs.readFileSync(GER, "utf8");
    rec("the value landed INSIDE the 2000.1.1 block",
      /2000\.1\.1\s*=\s*\{[\s\S]*?\n\tset_convoys = 999/.test(t), t);
    rec("…and set_convoys is still declared exactly once", countAll(t, "set_convoys") === 1, t);
    rec("…with NO unconditional copy above the block that the block would override",
      topLevelCount(t, "set_convoys") === 0, t);
    // MUST NOT CHANGE: everything else in the block, and the BOM.
    rec("the block's other statements are untouched",
      /set_cosmetic_tag = GER/.test(t) && /\n\tset_stability = 0\.55/.test(t), t);
    rec("the BOM survived", fs.readFileSync(GER)[0] === 0xEF, [...fs.readFileSync(GER).slice(0, 3)]);
    const after = await read(MODERN, "GER");
    rec("the editor reads 999 back — and so would the game", after.details && after.details.convoys === 999, after.details);

    console.log("\n[no edit] saving the value the block already has still leaves the file alone");
    const noopBefore = fs.readFileSync(GER);
    r = await save(MODERN, "GER", { convoys: 999 });
    rec("the file is BYTE-IDENTICAL", fs.readFileSync(GER).equals(noopBefore), fs.readFileSync(GER, "utf8"));
    rec("…and the response says nothing changed", r.body && r.body.unchanged === true, r.body);

    console.log("\n[must not change] a block dated AFTER the campaign start does not run at start");
    // The same file shape in a 1936 mod: 2000.1.1 never runs, so a new unconditional statement IS the
    // game-start value and the old behaviour is the correct one. If the fix ignored the date it would
    // write into a block the campaign never executes.
    const LAT = fileFor(CLASSIC, "LAT", "Laterland");
    const latSeed = ["capital = 7", "", "2000.1.1 = {", "\tset_stability = 0.25", "}", ""].join("\n");
    fs.writeFileSync(LAT, latSeed, "utf8");
    rec("the fixture declares set_stability only inside the (later) dated block",
      topLevelCount(latSeed, "set_stability") === 0, latSeed);
    r = await save(CLASSIC, "LAT", { stability: 0.8 });
    t = fs.readFileSync(LAT, "utf8");
    rec("a new UNCONDITIONAL statement is written", topLevelCount(t, "set_stability") === 1 && /(?:^|\n)set_stability = 0\.8/.test(t), t);
    rec("…and the dated block keeps its own value", /2000\.1\.1\s*=\s*\{[\s\S]*?set_stability = 0\.25/.test(t), t);

    console.log("\n[must not change] a DLC gate is still overridden by a new unconditional statement");
    const GAT = fileFor(MODERN, "GAT", "Gateland");
    const gatSeed = [
      "capital = 1", "", "if = {", '\tlimit = { has_dlc = "By Blood Alone" }',
      "\tset_stability = 0.6", "}", "", "2000.1.1 = {", "\tset_cosmetic_tag = GAT", "}", "",
    ].join("\n");
    fs.writeFileSync(GAT, gatSeed, "utf8");
    r = await save(MODERN, "GAT", { stability: 0.9 });
    t = fs.readFileSync(GAT, "utf8");
    rec("the gate still holds its original value", /has_dlc[\s\S]*?set_stability = 0\.6/.test(t), t);
    rec("…and the typed value is written unconditionally", topLevelCount(t, "set_stability") === 1 && /set_stability = 0\.9/.test(t), t);

    console.log("\n[must not change] a declaration nested deeper than the block belongs to someone else");
    // Rise of Nations' Morocco: set_research_slots lives inside `create_dynamic_country = { … }`, which sets
    // up a DIFFERENT country. Editing it would change that country and never touch this one.
    const DYN = fileFor(MODERN, "DYN", "Dynland");
    const dynSeed = [
      "capital = 2", "", "2000.1.1 = {", "\tcreate_dynamic_country = {",
      "\t\toriginal_tag = DYN", "\t\tset_research_slots = 3", "\t\treserve_dynamic_country = yes",
      "\t}", "}", "",
    ].join("\n");
    fs.writeFileSync(DYN, dynSeed, "utf8");
    r = await save(MODERN, "DYN", { researchSlots: 9 });
    t = fs.readFileSync(DYN, "utf8");
    rec("the dynamic country's own value is untouched", /create_dynamic_country[\s\S]*?set_research_slots = 3/.test(t), t);
    rec("…and the typed value is written unconditionally instead",
      topLevelCount(t, "set_research_slots") === 1 && /(?:^|\n)set_research_slots = 9/.test(t), t);

    console.log("\n[ambiguous] two blocks that BOTH run at start must be reported, not guessed at");
    const AMB = fileFor(MODERN, "AMB", "Ambiguland");
    const ambSeed = [
      "capital = 3", "", "1990.1.1 = {", "\tset_convoys = 10", "}", "",
      "2000.1.1 = {", "\tset_convoys = 20", "}", "",
    ].join("\n");
    fs.writeFileSync(AMB, ambSeed, "utf8");
    const ambBefore = fs.readFileSync(AMB);
    r = await save(MODERN, "AMB", { convoys: 55 });
    rec("the save still succeeds", r.status === 200, r.body || r.status);
    rec("the file was NOT rewritten", fs.readFileSync(AMB).equals(ambBefore), fs.readFileSync(AMB, "utf8"));
    rec("…and the response SAYS SO rather than reporting a bare ok",
      !!(r.body && Array.isArray(r.body.notes) && r.body.notes.some((n) => /Convoys was NOT saved/i.test(n))), r.body);
    rec("…and tells the user where to fix it",
      !!(r.body && (r.body.notes || []).some((n) => /history file/i.test(n))), r.body && r.body.notes);

    console.log("\n[must not change] a country WITH a top-level statement is still edited in place");
    const TOP = fileFor(MODERN, "TOP", "Toplevelland");
    const topSeed = ["capital = 4", "", "set_convoys = 25", "", "2000.1.1 = {", "\tset_cosmetic_tag = TOP", "}", ""].join("\n");
    fs.writeFileSync(TOP, topSeed, "utf8");
    r = await save(MODERN, "TOP", { convoys: 777 });
    t = fs.readFileSync(TOP, "utf8");
    rec("the top-level statement took the new value",
      topLevelCount(t, "set_convoys") === 1 && /(?:^|\n)set_convoys = 777/.test(t), t);
    rec("…exactly once, with nothing added to the dated block", countAll(t, "set_convoys") === 1, t);

    console.log(`\n=== country scalar in dated start block: ${checks} checks, ${fails.length} failed ===`);
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