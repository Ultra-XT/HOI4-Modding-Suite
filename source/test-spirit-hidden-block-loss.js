// #spirit-save-deletes-hidden-blocks — SAVING A COUNTRY NATIONAL SPIRIT DELETED BLOCKS IT NEVER SHOWED.
//
// Found by driving the user's own nova_ui_audit mod through the National Spirit maker, and confirmed with a
// wider blast radius than first reported: it is not a round-trip quirk. ANY save of a country spirit
// destroyed its `research_bonus` and `available` blocks — a rename, a picture change, one modifier edit —
// and the National Spirit maker's list is filtered to `cat === "country"`, so EVERY spirit the user can open
// in that mode was affected. A single no-edit pass over the mod's 110 ideas destroyed 10 research_bonus and
// 8 available blocks. Both are ordinary vanilla content: the shipping game has 49 research_bonus and 246
// available blocks inside `country = { }`.
//
// The modder could not see it happen. Those two boxes are display:none for country, so the block vanished
// from disk while the editor looked identical before and after, and the response said {ok:true}.
//
// The mechanism was a comment that had stopped being true. The server clears the eight FORM_OWNED sections
// when the payload does not name one, justified by "public/ideas.js loads every one of them out of the block
// into a visible box on open" — so an absent section means the user emptied it. For a country spirit two of
// the eight are never visible, never sent, and were read as cleared. The client now names the boxes it
// actually drew, and only those may be cleared by omission.
//
// The asymmetry matters and is why this is per-kind rather than one flag: `available` is hidden for country
// only, `research_bonus` for country AND advisor.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spblk-"));
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

const MOD = path.join(ROOT, "spblkmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpBlk"\nsupported_version="1.19.*"\n', "utf8");
const IDEAS = path.join(MOD, "common", "ideas", "nova_spirits.txt");
fs.writeFileSync(IDEAS, `ideas = {
\tcountry = {
\t\tnova_rich_spirit = {
\t\t\tpicture = generic_research_bonus
\t\t\tallowed = {
\t\t\t\talways = yes
\t\t\t}
\t\t\tavailable = {
\t\t\t\thas_war = no
\t\t\t}
\t\t\tresearch_bonus = {
\t\t\t\tindustry = 0.10
\t\t\t}
\t\t\tmodifier = {
\t\t\t\tstability_factor = 0.05
\t\t\t}
\t\t}
\t}
}
`, "utf8");

const PORT = 42987;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const read = () => fs.readFileSync(IDEAS, "utf8");

  // The payload a COUNTRY spirit's form produces: `available` and `research_bonus` are hidden for this kind,
  // so they are absent — and `formSections` says so.
  const countryFormSections = ["allowed", "modifier", "equipment_bonus", "visible", "on_add", "allowed_civil_war"];
  const basePayload = {
    ideaId: "nova_rich_spirit",
    targetRelativeFile: "common/ideas/nova_spirits.txt",
    targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    name: "Rich Spirit", desc: "", picture: "generic_research_bonus",
    selectedEffects: ["modifier = {\n\t\t\t\tstability_factor = 0.05\n\t\t\t}", "allowed = {\n\t\t\t\talways = yes\n\t\t\t}"],
    mode: "edit", category: "country",
  };

  try {
    console.log("\n[ground truth] these are ordinary blocks in shipping content");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/ideas";
    let rb = 0, av = 0;
    try {
      for (const f of fs.readdirSync(V)) {
        if (!/\.txt$/i.test(f)) continue;
        const t = fs.readFileSync(path.join(V, f), "utf8");
        rb += (t.match(/(^|\n)\s*research_bonus\s*=\s*\{/g) || []).length;
        av += (t.match(/(^|\n)\s*available\s*=\s*\{/g) || []).length;
      }
    } catch (_) {}
    rec("vanilla's ideas use research_bonus and available", rb > 20 && av > 100, { research_bonus: rb, available: av });

    console.log("\n[the bug] a save must not delete a box the form never showed");
    let r = await save(Object.assign({}, basePayload, { formSections: countryFormSections }));
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("research_bonus survived", /research_bonus\s*=\s*\{[\s\S]*?industry\s*=\s*0\.10/.test(read()), read().slice(0, 600));
    rec("…and available survived", /available\s*=\s*\{[\s\S]*?has_war\s*=\s*no/.test(read()), read().slice(0, 600));
    rec("…while the modifier the form DID own is still there",
      /modifier\s*=\s*\{[\s\S]*?stability_factor\s*=\s*0\.05/.test(read()), read().slice(0, 600));

    console.log("\n[still clears what it DOES own] this must not become 'never delete anything'");
    // The original fix this replaced (#cleared-box-does-not-clear) exists because emptying a visible box
    // used to leave the old block on disk. That must keep working for the boxes country DOES show.
    r = await save(Object.assign({}, basePayload, {
      formSections: countryFormSections,
      selectedEffects: ["modifier = {\n\t\t\t\tstability_factor = 0.05\n\t\t\t}"], // `allowed` box emptied
    }));
    rec("the clearing save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…an emptied VISIBLE box really is cleared", !/(^|\n)\s*allowed\s*=\s*\{/.test(read()), read().slice(0, 600));
    rec("…and the hidden blocks are STILL untouched",
      /research_bonus\s*=\s*\{/.test(read()) && /available\s*=\s*\{/.test(read()), read().slice(0, 600));

    console.log("\n[a designer DOES show research_bonus, so it may still clear it]");
    // The asymmetry: research_bonus is hidden for country and advisor but shown for designer.
    const designerSections = ["allowed", "modifier", "equipment_bonus", "visible", "on_add", "available", "research_bonus"];
    r = await save(Object.assign({}, basePayload, {
      formSections: designerSections,
      selectedEffects: ["modifier = {\n\t\t\t\tstability_factor = 0.05\n\t\t\t}"],
    }));
    rec("the designer-shaped save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and now research_bonus IS cleared, because that form shows it",
      !/(^|\n)\s*research_bonus\s*=\s*\{/.test(read()), read().slice(0, 600));

    console.log("\n[safety]");
    let d = 0, ok = true;
    for (const ch of read()) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("the ideas file is brace-balanced", ok && d === 0, d);

    console.log("\n[the client] the editor must declare what it drew");
    const ij = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
    rec("the payload carries formSections", /formSections:\s*\[/.test(ij), "not sent");
    rec("…omitting available for country", /kind === "country" \? \[\] : \["available"\]/.test(ij), "available gate missing");
    rec("…and research_bonus only for designer", /kind === "designer" \? \["research_bonus"\] : \[\]/.test(ij), "research_bonus gate missing");

    console.log(`\n=== spirit hidden-block loss: ${checks} checks, ${fails.length} failed ===`);
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
