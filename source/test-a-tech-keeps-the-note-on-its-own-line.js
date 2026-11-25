// ⛔ #tech-header-comment-dropped — THE NOTE ON A TECHNOLOGY'S OWN OPENING LINE WAS DELETED BY A NO-EDIT SAVE.
//
// serializeTechnology rebuilds that line as `\t<id> = {`, so a comment sitting on it went. leadComments
// covers the note ABOVE a key and scalarComments the note BESIDE a value; this third position was covered by
// neither. Measured across the vanilla install and every installed workshop mod: 211 of 6,496 technology
// blocks carry one — vanilla 55, Road to 56 69, Rise of Nations 66, Novum Vexillum 13, Millennium Dawn 5,
// Old World Blues 3. They are the notes that make an armour file readable:
//
//     basic_light_tank    = { #Panzer I
//     advanced_light_tank = { #Leopard
//     super_heavy_tank    = { #Maus
//
// ⚠️ AND EXACTLY ONE READER MAY CLAIM IT. Two others already saw that line: techLeadCommentsAndBody treats
// it as the caption for the block's FIRST key, and buildExtraScriptFromTechBlock keeps un-modelled text
// verbatim. Emitting it on the header line as well printed every note TWICE — on Rise of Nations' armor.txt
// "#Panzer I" went 5 -> 10 and "#Panther" 2 -> 4 — and blanking only ONE of the two readers still left it
// doubled. A preservation fix that does not ask what already claims the text becomes a duplication bug.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53542;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hdrcomment-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

const FIXTURE = [
  "technologies = {",
  "",
  "\tprobe_named = { #Panzer I",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t\tcategories = { infantry_tech }",
  "\t}",
  "",
  "\tprobe_plain = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }",
  "\t\tcategories = { infantry_tech }",
  "\t}",
  "}",
  "",
].join("\n");

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const roundTrip = async (text) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hdrcomment-mod-"));
      made.push(mod);
      const dest = path.join(mod, "common", "technologies", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Header Comment"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
      const mine = (cat.technologies || []).filter((t) => t && t.isMod);
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technologies: mine.map((t) => JSON.parse(JSON.stringify(t))), equipments: cat.equipments || {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
      }).then((r) => r.json());
      return { after: fs.readFileSync(dest, "utf8"), techs: mine };
    };

    console.log("1. The fixture has the property, and a control without it");
    rec("one technology carries a header note", /probe_named = \{ #Panzer I/.test(FIXTURE));
    rec("…and one carries none", /probe_plain = \{\n/.test(FIXTURE));

    console.log("\n2. A no-edit save keeps it, ONCE, on the same line");
    {
      const { after, techs } = await roundTrip(FIXTURE);
      rec("both technologies parsed", techs.length === 2, techs.map((t) => t.id));
      rec("⭐ the note is still on the opening line", /probe_named\s*=\s*\{ #Panzer I/.test(after), after.slice(0, 200));
      rec("⭐ …and appears exactly once", (after.match(/#Panzer I/g) || []).length === 1,
        (after.match(/#Panzer I/g) || []).length + " occurrences");
      rec("…and the technology without one gained nothing", /probe_plain\s*=\s*\{\s*\n/.test(after), after);
      rec("no stray '#' was invented anywhere", (after.match(/#/g) || []).length === 1, after);
    }

    console.log("\n3. ⭐ The reader that must NOT also claim it");
    const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    rec("the lead-comment reader gets the line blanked",
      /techLeadCommentsAndBody\(\s*\n\s*\(headerComment && rawBlkForComments\)/.test(SERVER));
    rec("…and so does extraScript",
      /buildExtraScriptFromTechBlock\(\s*\n\s*\(headerComment && rawBlkForComments\)/.test(SERVER),
      "blanking only one of the two still left every note doubled");
    rec("the writer emits it from the model", /let out = `\\t\$\{tech\.id\} = \{\$\{headerNote\}/.test(SERVER));

    console.log("\n4. Only a line that is ONLY a comment is taken");
    {
      // A one-line technology puts the note after CODE; moving it beside the brace would attach it to a
      // statement it was never about, so it must stay where it is (extraScript's business, not the header's).
      const inline = FIXTURE.replace("\tprobe_named = { #Panzer I", "\tprobe_named = { #Panzer I").replace(
        "\tprobe_plain = {", "\tprobe_plain = { research_cost = 1 } #tail note\n\tprobe_plain_2 = {");
      rec("the guard is on the trimmed first line starting with #", /first\.startsWith\("#"\) \? first : ""/.test(SERVER),
        "code before the note means the note is not the header's");
    }

    console.log("\n5. Measured against the real corpora");
    const roots = [["vanilla", GAME]];
    try {
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "common", "technologies"))) roots.push([d, p]);
      }
    } catch (_) {}
    // Find a real file that HAS header comments — derived, not named.
    let picked = null;
    for (const [name, root] of roots) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "common", "technologies")).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
      for (const f of files) {
        const t = fs.readFileSync(path.join(root, "common", "technologies", f), "utf8");
        const n = (t.match(/^\t[A-Za-z0-9_@.\-]+\s*=\s*\{[ \t]*#/gm) || []).length;
        if (n >= 5) { picked = { name, file: f, full: path.join(root, "common", "technologies", f), n }; break; }
      }
      if (picked) break;
    }
    if (!picked) {
      rec("a real file with header comments to round-trip", false, "cannot measure against the corpus");
    } else {
      rec(`${picked.name}/${picked.file} carries header comments`, picked.n >= 5, picked.n + " of them");
      const original = fs.readFileSync(picked.full, "utf8");
      const { after } = await roundTrip(original);
      const notesOf = (t) => (t.match(/^\t[A-Za-z0-9_@.\-]+\s*=\s*\{[ \t]*(#[^\n]*)$/gm) || []).map((s) => s.trim());
      const before = notesOf(original), now = notesOf(after);
      rec("every header note survives the round trip", now.length === before.length,
        `${before.length} before, ${now.length} after`);
      // ⭐ AND NOT DUPLICATED — the regression this fix nearly shipped.
      for (const note of [...new Set(before.map((l) => (/#.*$/.exec(l) || [""])[0]))].slice(0, 6)) {
        const b = (original.split(note).length - 1), a = (after.split(note).length - 1);
        rec(`"${note.slice(0, 24)}" appears the same number of times`, a === b, `${b} -> ${a}`);
      }
    }

    console.log(`\n=== a tech keeps the note on its own line: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
