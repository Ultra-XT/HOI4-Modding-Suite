// #tech-research-cost-reformatted + #tech-hidden-note-deleted — A NO-EDIT SAVE REWROTE A TECHNOLOGY'S
// NUMBER AND DELETED THE NOTE INSIDE ITS `allow` BLOCK.
//
// writeTechnologyToFile replaces a technology's block with serializeTechnology's output — a rebuild from the
// model, the shape that cost 16,487 comment lines in the order-of-battle writer. Real technology blocks carry
// 595 distinct keys across the corpus, so a rebuild has a lot of surface to drop something on.
//
// Round-tripping real files through /api/technologies/catalog and /api/technologies/save-batch — the two
// endpoints the Research maker actually uses — with every technology handed straight back:
//
//     vanilla/infantry.txt    3 leaf assignments changed, 10 comments deleted
//     vanilla/air_techs.txt   9 leaf assignments changed
//     Road to 56/infantry.txt 31 changed, 10 comments deleted
//
// TWO CAUSES.
//
// `research_cost = 2.0` came back as `research_cost = 2`. The parser does `Number(costMatch[1])`, and
// `Number("2.0")` is 2, so the author's text was gone before the writer saw it. This file ALREADY keeps the
// comment beside those values (#tech-scalar-trailing-comment) — it kept the note and rewrote the number the
// note was about. Vanilla writes the decimal form on 13 carrier variants in air_techs.txt among others.
//
// And `allow = { always = no #UPDATE CZE_anti_tank_development_tech_tt if changing }` lost its note. The
// maker models that whole block as one boolean, `isHidden`, and regenerates it, so a comment inside it had
// nowhere to live. Vanilla's infantry.txt carries ten, each naming the localisation key a modder must update
// if they change the tech — exactly the note an editor must not quietly delete.
//
// Both now use the mechanism that was already here: capture from the RAW block into scalarComments, re-emit
// with noteT. The cost's own text is remembered too, and used only while the value has not moved — a modder
// typing 2.5 still gets 2.5.
//
// The `soft_attack = 0.05` this header used to list as open turned out to be a second bug and not a
// residual of this one: the technology was reading a STRANGER'S block. See #raw-block-wrong-depth in
// test-technology-reads-its-own-block.js.
//
// ✅ NOW FIXED (2026-09-02) — kept here because the reasoning for deferring it is the interesting part.
//
// The deferral said: a `path = { }` block with no `leads_to_tech` is dropped whole, the model keys paths by
// the child they lead to so a path leading nowhere has no key to live under, and — the deciding argument —
// "they are dead weight in the file and deleting them changes no behaviour in game, which is why this is
// recorded rather than fixed".
//
// That argument was right about the game and wrong about the modder. Re-measured across the vanilla install
// and every installed workshop mod: 52 such blocks of 5,586, but only FOUR are genuinely empty, and NINE
// carry the author's commented-out edge inside the braces — the deliberate record of a branch they disabled:
//     #leads_to_tech = underway_replenishment_tech_1   #parked
//     # leads_to_tech = sp_centrifugal_jet_tech
// Deleting those is deleting something hand-written, on a save that changed nothing, in a tech the author
// may never have opened. "No behaviour changes in game" was never the whole test — Nova's rule is that it
// must not silently destroy what someone wrote by hand.
//
// Fixed in the `allow` shape: strip only the blocks serializeTechnology can re-create (those with a LIVE
// leads_to_tech) and let the rest round-trip through extraScript.
// Pinned by test-a-dead-path-block-keeps-its-note.js, including that the rescued block is written EXACTLY
// ONCE — moving a block into extraScript risks the serializer also re-creating it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
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

const VAN_INF = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/technologies/infantry.txt";

function maskComments(t) {
  let out = "", inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "#") { while (i < t.length && t[i] !== "\n") { out += " "; i++; } out += "\n"; continue; }
    out += c;
  }
  return out;
}
// Leaf assignments as a MULTISET — the measure that survives reformatting and indentation.
function leaves(text) {
  const out = [];
  for (const m of maskComments(text).matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*(=|<|>)\s*("(?:[^"\\]|\\.)*"|[^\s{}#]+)/g)) out.push(`${m[1]} ${m[2]} ${m[3]}`);
  return out;
}
const commentTexts = (t) => String(t).replace(/\r/g, "").split("\n")
  .map((l) => { const h = l.indexOf("#"); return h < 0 ? null : ((l.slice(0, h).match(/"/g) || []).length % 2 === 1 ? null : l.slice(h).trim().replace(/\s+/g, " ")); })
  .filter(Boolean);
function lossOf(was, now) {
  const left = now.slice();
  const lost = [];
  for (const x of was) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else lost.push(x); }
  return lost;
}

const FIXTURE = [
  "technologies = {",
  "",
  "\tprobe_tech = {",
  "",
  "\t\tresearch_cost = 2.0",
  "\t\tstart_year = 1936",
  "",
  "\t\tallow = {",
  "\t\t\talways = no #UPDATE PROBE_tech_tt if changing",
  "\t\t}",
  "",
  "\t\tpath = {",
  "\t\t\tleads_to_tech = probe_tech_2",
  "\t\t\tresearch_cost_coeff = 1",
  "\t\t}",
  "",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 0 y = 0 }",
  "\t\t}",
  "",
  "\t\tcategories = {",
  "\t\t\tinfantry_tech",
  "\t\t}",
  "\t}",
  "",
  "\tprobe_tech_2 = {",
  "\t\tresearch_cost = 1",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 2 y = 0 }",
  "\t\t}",
  "\t\tcategories = {",
  "\t\t\tinfantry_tech",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

(async () => {
  console.log("\n[ground truth] vanilla writes both shapes");
  {
    if (!fs.existsSync(VAN_INF)) rec("vanilla is not installed — the ground-truth check is skipped", true, "");
    else {
      const t = fs.readFileSync(VAN_INF, "utf8");
      const notes = (t.match(/always\s*=\s*no[ \t]*#/g) || []).length;
      const air = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/technologies/air_techs.txt";
      const decimals = fs.existsSync(air) ? (fs.readFileSync(air, "utf8").match(/research_cost\s*=\s*-?\d+\.\d+/g) || []).length : 0;
      console.log(`     infantry.txt: ${notes} notes on an \`always = no\`; air_techs.txt: ${decimals} decimal research_costs`);
      rec("⭐ vanilla annotates its hidden techs", notes >= 5, notes);
      rec("⭐ …and writes research_cost in decimal form", decimals >= 5, decimals);
    }
  }

  // A private port — never the one the developer's own Nova uses.
  const PORT = 53501, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  const roundTrip = async (original) => {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tech-keep-"));
    const dest = path.join(mod, "common", "technologies", "probe.txt");
    try {
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Tech Text"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, original, "utf8");
      const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
      const mine = (cat.technologies || []).filter((t) => t && t.isMod);
      const send = mine.map((t) => JSON.parse(JSON.stringify(t)));
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technologies: send, equipments: cat.equipments || {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
      }).then((r) => r.json());
      return { after: fs.readFileSync(dest, "utf8"), techs: mine, mod };
    } finally {
      try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    }
  };

  try {
    console.log("\n[fixture] a no-edit save keeps the author's text");
    {
      // ⭐ ASSERT THE FIXTURE HAS THE PROPERTIES.
      rec("the fixture writes a decimal cost", /research_cost = 2\.0/.test(FIXTURE), "");
      rec("…and a note inside its allow block", /always = no #UPDATE/.test(FIXTURE), "");
      const { after, techs } = await roundTrip(FIXTURE);
      rec("both technologies parsed as the mod's own", techs.length === 2, techs.map((t) => t.id));
      rec("⭐ the decimal cost is still decimal", /research_cost\s*=\s*2\.0\b/.test(after), after);
      rec("⭐ …and the note is still on the always line", /always\s*=\s*no[ \t]*#UPDATE PROBE_tech_tt if changing/.test(after), after);
      rec("…and the tech is still hidden", /allow\s*=\s*\{[\s\S]*?always\s*=\s*no/.test(after), after);
      rec("no comment was lost at all", lossOf(commentTexts(FIXTURE), commentTexts(after)).length === 0,
        lossOf(commentTexts(FIXTURE), commentTexts(after)));
    }

    console.log("\n[CONTROL] a value the user CHANGES is written normally");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tech-keep2-"));
      const dest = path.join(mod, "common", "technologies", "probe.txt");
      try {
        fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Tech Text 2"\n');
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, FIXTURE, "utf8");
        const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
        const mine = (cat.technologies || []).filter((t) => t && t.isMod).map((t) => JSON.parse(JSON.stringify(t)));
        const target = mine.find((t) => t.id === "probe_tech");
        rec("the tech was found to edit", !!target, mine.map((t) => t.id));
        if (target) target.researchCost = 2.5;
        await fetch(`${BASE}/api/technologies/save-batch`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ technologies: mine, equipments: cat.equipments || {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
        }).then((r) => r.json());
        const after = fs.readFileSync(dest, "utf8");
        rec("⭐ CONTROL: the new value is written, not the remembered text", /research_cost\s*=\s*2\.5\b/.test(after), after);
        rec("…and the old one is gone", !/research_cost\s*=\s*2\.0\b/.test(after), after);
      } finally {
        try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
      }
    }

    console.log("\n[RUN IT] a real vanilla technology file, saved unchanged");
    if (!fs.existsSync(VAN_INF)) {
      rec("vanilla is not installed — the corpus round trip is skipped", true, "");
    } else {
      const original = fs.readFileSync(VAN_INF, "utf8");
      const { after, techs } = await roundTrip(original);
      const cl = lossOf(commentTexts(original), commentTexts(after));
      const ll = lossOf(leaves(original), leaves(after));
      console.log(`     ${techs.length} technologies · comments lost ${cl.length} · leaf assignments lost ${ll.length}`);
      rec("the file really was read", techs.length > 50, techs.length);
      rec("RUN: ⭐ not one comment is lost", cl.length === 0, cl.slice(0, 5));
      rec("RUN: ⭐ not one leaf assignment is lost", ll.length === 0, ll.slice(0, 5));
      // ⭐ ASSERT THE CORPUS HAS THE SHAPE, or a clean run says nothing about it.
      rec("CONTROL: that file really does carry the notes this protects",
        (original.match(/always\s*=\s*no[ \t]*#/g) || []).length >= 5,
        (original.match(/always\s*=\s*no[ \t]*#/g) || []).length);
    }
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
  }

  console.log(`\n=== technology save keeps its text: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
