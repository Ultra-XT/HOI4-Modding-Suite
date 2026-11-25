// Saving a national spirit must not glue its blocks onto neighbouring lines (#spirit-modifier-newlines).
//
// findModifierSectionRange took the newline BEFORE `modifier = {` and the one AFTER its closing brace
// into the range it replaces, while buildModifierSectionString returns "\tmodifier = { … \t}" with no
// newlines of its own. So a re-save produced
//
//     picture = segregation2	modifier = {
//     …
//     	}		}
//
// That still parses — Clausewitz ignores whitespace — which is why it went unnoticed. The damage was to
// the READER: /^\s*picture\s*=\s*"?([...])"?\s*$/m is anchored to end-of-line, so with `modifier = {`
// trailing on the same line the picture no longer matched. Re-opening the spirit showed an EMPTY
// picture, and the next save wrote it away. Millennium Dawn hit this on 35 of the first 60 spirits.
//
// Pinned here: the picture survives a round-trip, the block keeps one statement per line, saving twice
// is idempotent, and the spirit's neighbours in the file are untouched.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const FIXTURES = path.join(os.tmpdir(), "nova-fixtures");
fs.mkdirSync(FIXTURES, { recursive: true });
process.env.HOI4_MODS_ROOT = FIXTURES;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(FIXTURES, "spirit-nl-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="SpiritNewlines"\nsupported_version="1.19.*"\n');
const idir = path.join(mod, "common", "ideas");
fs.mkdirSync(idir, { recursive: true });

// Shaped exactly like Millennium Dawn's Abkhazian.txt entries.
const FILE = path.join(idir, "probe_ideas.txt");
const ORIGINAL = [
  "ideas = {",
  "\tcountry = {",
  "\t\tprobe_energy_idea = {",
  "\t\t\tallowed = {",
  "\t\t\t\toriginal_tag = ABK",
  "\t\t\t}",
  "",
  "\t\t\tremoval_cost = -1",
  "\t\t\tpicture = segregation2",
  "\t\t\tmodifier = {",
  "\t\t\t\tindustrial_capacity_factory = -0.1",
  "\t\t\t\tstability_factor = -0.1",
  "\t\t\t}",
  "\t\t}",
  "\t\tprobe_neighbour_idea = {",
  "\t\t\tpicture = bitcoin",
  "\t\t\tmodifier = {",
  "\t\t\t\twar_support_factor = 0.05",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(FILE, ORIGINAL, "utf8");
const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
fs.writeFileSync(path.join(locDir, "probe_l_english.yml"),
  "﻿l_english:\n probe_energy_idea:0 \"Energy Problems\"\n probe_energy_idea_desc:0 \"Lights out.\"\n"
  + " probe_neighbour_idea:0 \"Neighbour\"\n", "utf8");

const read = () => fs.readFileSync(FILE, "utf8");
const blockOf = (id) => {
  const s = read();
  const at = s.indexOf(id + " = {");
  if (at === -1) return "";
  let d = 0, i = s.indexOf("{", at), st = i;
  for (; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) break; } }
  return s.slice(st + 1, i);
};
const balanced = () => { const s = read().replace(/#.*$/gm, ""); return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length; };

const ID = "probe_energy_idea";
const PORT = 39583, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const payload = () => get("/api/ideas/edit-payload?ideaId=" + ID
    + "&definitionFile=" + encodeURIComponent("common/ideas/probe_ideas.txt")
    + "&modPath=" + encodeURIComponent(mod));
  const saveUnchanged = async () => {
    const ep = await payload();
    if (!ep.ok) return { s: 0, err: ep.error };
    return post("/api/ideas/upsert-definition", {
      modPath: mod, ideaId: ID, targetRelativeFile: "probe_ideas.txt",
      name: ep.localizedName, desc: ep.localizedDesc, picture: ep.pictureToken,
      targetLocalizationPath: ep.localizationFile, selectedEffects: ep.selectedEffects,
      mode: "edit", category: ep.category, cost: ep.cost, removalCost: ep.removalCost,
      ledger: ep.ledger, traits: ep.traits,
    });
  };
  try {
    const ep0 = await payload();
    ok("the spirit is readable", ep0.ok === true, ep0.error);
    ok("its picture is read", ep0.pictureToken === "segregation2", ep0.pictureToken);
    ok("its modifiers are read", (ep0.selectedEffects || []).length === 2, ep0.selectedEffects);

    const r1 = await saveUnchanged();
    ok("save → 200", r1.s === 200, r1.b);

    const blk = blockOf(ID);
    ok("picture is still on its own line", /\n[ \t]*picture[ \t]*=[ \t]*segregation2[ \t]*\r?\n/.test("\n" + blk + "\n"), blk);
    ok("modifier opens on its own line", /\n[ \t]*modifier[ \t]*=[ \t]*\{/.test("\n" + blk), blk);
    ok("no line carries two statements", !/=\s*\S+[ \t]+\w+[ \t]*=/.test(blk.replace(/=\s*\{/g, "= {")), blk);
    ok("the block is still brace-balanced", balanced());

    // THE BUG: re-reading after a save used to lose the picture
    const ep1 = await payload();
    ok("re-reading keeps the picture (the fix)", ep1.pictureToken === "segregation2", ep1.pictureToken);
    ok("re-reading keeps the modifiers", (ep1.selectedEffects || []).length === 2, ep1.selectedEffects);
    ok("re-reading keeps removal_cost", ep1.removalCost === "-1", ep1.removalCost);

    // idempotence: a second and third identical save must not keep changing the file
    // Small pause between the repeat saves. Rewriting one file three times back-to-back is exactly the
    // shape behavioural antivirus watches for (Kaspersky's System Watcher terminated this test's node
    // process, and quarantined the file, on the machine this was written on). The assertion is that
    // repeated saves do not drift — it does not need to be fast.
    const breathe = () => new Promise((r) => setTimeout(r, 250));
    const after1 = read();
    await breathe();
    await saveUnchanged();
    const after2 = read();
    await breathe();
    await saveUnchanged();
    const after3 = read();
    ok("a second identical save changes nothing", after2 === after1, { len1: after1.length, len2: after2.length });
    ok("a third identical save changes nothing", after3 === after2);

    // the neighbour in the same file must be untouched
    const nb = blockOf("probe_neighbour_idea");
    ok("the neighbouring spirit still has its picture", /picture[ \t]*=[ \t]*bitcoin/.test(nb), nb);
    ok("the neighbouring spirit still has its modifier", /war_support_factor[ \t]*=[ \t]*0\.05/.test(nb), nb);
    ok("the allowed block survived", /original_tag[ \t]*=[ \t]*ABK/.test(blockOf(ID)), blockOf(ID));

    console.log("\ntest-spirit-modifier-newlines: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
