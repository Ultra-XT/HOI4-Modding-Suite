// #politics-not-saved-but-ui-says-saved — SETTING A COUNTRY'S IDEOLOGY DID NOTHING FOR 54 OF VANILLA'S 364
// COUNTRIES, AND THE UI SAID IT HAD WORKED.
//
// A country history file is an ordered effect list, and a `YYYY.M.D = { … }` block only runs from that date.
// So a TOP-LEVEL `set_politics` is the game-start state and an indented one inside a dated block is a later
// change — there is nothing ambiguous about which one Country Setup means. Nova counted occurrences at ANY
// indentation, so the two looked like a tie and the save refused.
//
// Measured across both corpora: 54 of vanilla's 364 country files declare set_politics twice and 42 declare
// set_popularities twice; Millennium Dawn 4 and 4. NOT ONE file in either corpus has two TOP-LEVEL
// declarations. The refusal fired on 100 real countries and was correct in none of them.
//
// And the explanation never reached the user: the server returned `notes` saying exactly what it had skipped,
// and the client read only `data.error` before announcing "Country details saved successfully!".
//
// THE REFUSAL IS NOT DELETED, it is narrowed to the two shapes that genuinely cannot be edited here:
//   • two or more TOP-LEVEL blocks — Nova will not guess;
//   • no top-level block but one or more DATED ones — Millennium Dawn's ordinary layout, where the start
//     state lives inside `2000.1.1 = { … }`. A block added at the top would be overridden by that one, so
//     writing it would look like a save and change nothing in game.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pol-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const MOD = path.join(ROOT, "pol");
const HIST = path.join(MOD, "history", "countries");
fs.mkdirSync(HIST, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Pol"\nsupported_version="1.19.*"\n', "utf8");

const write = (tag, name, lines) => {
  const p = path.join(HIST, `${tag} - ${name}.txt`);
  fs.writeFileSync(p, lines.join("\n"), "utf8");
  return p;
};
const read = (p) => fs.readFileSync(p, "utf8");

// (1) TWO TIERS — a top-level start state plus a later dated change. Editable; the top one is meant.
const TIER = write("TIE", "Tierland", [
  "capital = 5",
  "",
  "set_politics = {",
  "\truling_party = democratic",
  "\tlast_election = \"1936.1.1\"",
  "\telection_frequency = 48",
  "\telections_allowed = yes",
  "}",
  "",
  "1939.1.1 = {",
  "\tset_politics = {",
  "\t\truling_party = fascism",
  "\t\telections_allowed = no",
  "\t}",
  "}",
  "",
]);
// (2) TWO TOP-LEVEL — genuinely ambiguous.
const AMB = write("AMB", "Ambiguland", [
  "capital = 5",
  "",
  "set_politics = { ruling_party = democratic elections_allowed = yes }",
  "",
  "set_politics = { ruling_party = communism elections_allowed = no }",
  "",
]);
// (3) DATED ONLY — Millennium Dawn's layout. Nothing at the top to edit, and adding one would be overridden.
const DATED = write("DAT", "Datedland", [
  "2000.1.1 = {",
  "\tcapital = 12",
  "\tset_politics = {",
  "\t\truling_party = communism",
  "\t\telections_allowed = yes",
  "\t}",
  "}",
  "",
]);

const PORT = 43473;
const srv = createApp().listen(PORT, async () => {
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const save = (tag, details) => post("/api/history/save-country-details", { tag, modPath: MOD, details });

  try {
    console.log("\n[ground truth] the two-tier shape is common and the ambiguous one does not exist");
    const depthAt = (s, at) => {
      let d = 0, q = false;
      for (let i = 0; i < at; i++) {
        const c = s[i];
        if (c === '"') { q = !q; continue; }
        if (q) continue;
        if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
        if (c === "{") d++;
        else if (c === "}") d--;
      }
      return d;
    };
    const tally = {};
    for (const [name, root] of Object.entries({
      vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
      MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649",
    })) {
      const dir = path.join(root, "history", "countries");
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const key of ["set_politics", "set_popularities"]) {
        let anyDepth = 0, topTwo = 0;
        for (const f of files) {
          let t = "";
          try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
          const re = new RegExp(`(?:^|\\n)[ \\t]*${key}\\s*=\\s*\\{`, "gi");
          let m, all = 0, top = 0;
          while ((m = re.exec(t)) !== null) {
            all++;
            const at = m.index + (t[m.index] === "\n" ? 1 : 0);
            if (depthAt(t, at) === 0) top++;
            re.lastIndex = m.index + m[0].length;
          }
          if (all > 1) anyDepth++;
          if (top > 1) topTwo++;
        }
        tally[`${name}.${key}`] = { anyDepth, topTwo, files: files.length };
      }
    }
    rec("both corpora were readable", (tally["vanilla.set_politics"] || {}).files > 300, tally);
    rec("dozens of vanilla countries declare set_politics twice",
      (tally["vanilla.set_politics"] || {}).anyDepth >= 40, tally["vanilla.set_politics"]);
    rec("…and NOT ONE of them does so at the TOP LEVEL",
      (tally["vanilla.set_politics"] || {}).topTwo === 0
      && (tally["vanilla.set_popularities"] || {}).topTwo === 0
      && (tally["MD.set_politics"] || {}).topTwo === 0
      && (tally["MD.set_popularities"] || {}).topTwo === 0, tally);

    console.log("\n[the bug] a top-level block beside a dated one IS editable");
    let r = await save("TIE", { politics: { rulingParty: "communism", lastElection: "1936.1.1", electionFrequency: 48, electionsAllowed: "no" } });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    const tie = read(TIER);
    rec("the TOP-LEVEL ruling party changed",
      /(^|\n)set_politics\s*=\s*\{[\s\S]*?ruling_party\s*=\s*communism/.test(tie), tie);
    rec("…and the DATED block is untouched",
      /1939\.1\.1\s*=\s*\{[\s\S]*?ruling_party\s*=\s*fascism/.test(tie), tie);
    rec("…and nothing was reported as skipped",
      !(r.b.notes || []).some((n) => /politics/i.test(n)), r.b.notes);

    console.log("\n[control] two TOP-LEVEL blocks are still refused, and still say why");
    const ambBefore = read(AMB);
    r = await save("AMB", { politics: { rulingParty: "fascism", lastElection: "1936.1.1", electionFrequency: 48, electionsAllowed: "no" } });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the file is byte-identical", read(AMB) === ambBefore, read(AMB));
    rec("…and a note explains why", (r.b.notes || []).some((n) => /more than once at the top level/i.test(n)), r.b.notes);

    console.log("\n[control] a DATED-ONLY country is refused too — a top block would be overridden");
    const datBefore = read(DATED);
    r = await save("DAT", { politics: { rulingParty: "fascism", lastElection: "1936.1.1", electionFrequency: 48, electionsAllowed: "no" } });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("no block was inserted at the top", read(DATED) === datBefore, read(DATED));
    rec("…and the note says where the values actually live",
      (r.b.notes || []).some((n) => /inside a dated block/i.test(n)), r.b.notes);

    console.log("\n[control] a country with NOTHING set still gets a block created");
    const FRESH = write("FRS", "Freshland", ["capital = 7", ""]);
    r = await save("FRS", { politics: { rulingParty: "neutrality", lastElection: "1936.1.1", electionFrequency: 48, electionsAllowed: "yes" } });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("a top-level set_politics was created",
      /(^|\n)set_politics\s*=\s*\{[\s\S]*?ruling_party\s*=\s*neutrality/.test(read(FRESH)), read(FRESH));

    console.log("\n[the UI] the explanation has to reach the user");
    const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
    rec("the client reads data.notes", /Array\.isArray\(data\.notes\)/.test(CS), "notes never read");
    rec("…and shows them instead of a bare success",
      /notes\.length\)\s*\{[\s\S]{0,300}?nbAlert\(\s*\n?\s*notes\.join/.test(CS), "notes not shown");
    rec("…while a clean save still says it succeeded",
      /nbAlert\("Country details saved successfully!"\)/.test(CS), "success message removed");

    console.log(`\n=== country politics two tiers: ${checks} checks, ${fails.length} failed ===`);
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
