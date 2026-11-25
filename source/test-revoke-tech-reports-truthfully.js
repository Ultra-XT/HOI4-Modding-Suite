// #remove-tech-removes-nothing — REVOKE REPORTED A REMOVAL THAT HAD NOT HAPPENED.
//
// A country's starting technologies can be granted two ways in its history file: as a bare
// `set_technology = { … }` at the top level, which Nova owns and rewrites, or inside a hand-authored dated
// block — `2000.1.1 = { set_technology = { … } }` — which Millennium Dawn uses for 344 of its 345
// countries. Rewriting a dated block would delete the modder's own logic, so writeCountryTechnologies
// refuses to touch it and returns the list of technologies it therefore could not manage.
//
// /api/technologies/save-country-techs reads that list and turns it into a note the user sees.
// /api/technologies/set-country-tech — the Revoke button on the Research page — threw the return value away
// and answered ok:true regardless. So the user clicked Revoke, got a green "✓ Removed", watched the
// checkbox clear and the tech node lose its researched colour, and the country still started with the
// technology in game. Nothing anywhere said otherwise.
//
// ⭐ The two endpoints sit ninety lines apart and call the same writer. One reads its answer; the other did
// not — the house bug, again.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-revoke-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "revmod");
fs.mkdirSync(path.join(MOD, "common", "country_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RevMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "revmod.mod"), 'name="RevMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "country_tags", "zz_nova.txt"), 'RVK = "countries/Rvk.txt"\n');
fs.writeFileSync(path.join(MOD, "common", "countries", "Rvk.txt"), "graphical_culture = western_european_gfx\n");

// The shape Millennium Dawn ships: one tech Nova owns at the top level, one locked inside a DATED block.
const HIST = path.join(MOD, "history", "countries", "RVK - Rvk.txt");
fs.writeFileSync(HIST,
  "capital = 1\n\n" +
  "set_technology = {\n\tinfantry_weapons = 1\n}\n\n" +
  "2000.1.1 = {\n\tset_technology = {\n\t\tgw_artillery = 1\n\t}\n}\n");

const PORT = 53071;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    // ⭐ SEND WHAT THE CLIENT SENDS — public/research.js:7907 posts { tag, techId, active, modPath }.
    const toggle = (techId, active) => fetch(`http://127.0.0.1:${PORT}/api/technologies/set-country-tech`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "RVK", techId, active, modPath: MOD }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
    const histHas = (tech) => new RegExp(`\\b${tech}\\s*=\\s*1`).test(fs.readFileSync(HIST, "utf8"));

    console.log("\n[CONTROL] the fixture really has both shapes, or nothing below discriminates");
    {
      const t = fs.readFileSync(HIST, "utf8");
      rec("a top-level set_technology exists", /^set_technology\s*=\s*\{/m.test(t), t.slice(0, 120));
      rec("…and a DATED block holds another tech", /2000\.1\.1\s*=\s*\{[\s\S]*gw_artillery/.test(t), t.slice(-140));
    }

    console.log("\n[the manageable one] revoking a top-level tech really removes it");
    {
      const r = await toggle("infantry_weapons", false);
      rec("the call succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      rec("…and says nothing was left behind", !r.body.note, r.body.note);
      rec("…and the tech is gone from the file", !histHas("infantry_weapons"), fs.readFileSync(HIST, "utf8").slice(0, 200));
    }

    console.log("\n[⭐ the dated one] revoking cannot work, so it must NOT claim it did");
    {
      const before = fs.readFileSync(HIST, "utf8");
      const r = await toggle("gw_artillery", false);
      const after = fs.readFileSync(HIST, "utf8");
      console.log(`     note = ${JSON.stringify(String(r.body && r.body.note || "").slice(0, 130))}`);
      rec("the call still succeeds rather than erroring", r.status < 400 && r.body && !r.body.error, r.body);
      // THE BUG: ok:true with no note, while the tech stayed granted.
      rec("…but it reports that nothing changed", !!(r.body && r.body.note), r.body);
      rec("…naming the technology", /gw_artillery/.test(String((r.body && r.body.note) || "")), r.body && r.body.note);
      rec("…and explaining it is a dated or DLC-gated block",
        /dated or DLC-gated/i.test(String((r.body && r.body.note) || "")), r.body && r.body.note);
      rec("…and listing it as unmanaged", ((r.body && r.body.unmanagedTechs) || []).includes("gw_artillery"), r.body && r.body.unmanagedTechs);
      // …and the file is genuinely untouched, which is what makes the old success message a lie.
      rec("the dated block is left alone, as intended", /2000\.1\.1\s*=\s*\{[\s\S]*gw_artillery/.test(after), after.slice(-160));
      rec("…and the country still starts with the tech", histHas("gw_artillery"), after.slice(-160));
      rec("…and nothing else in the file moved", before.includes("2000.1.1") === after.includes("2000.1.1"), "the dated block changed shape");
    }

    console.log("\n[the client] must not paint a green tick over that note");
    {
      const rj = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));
      const at = rj.indexOf("set-country-tech");
      const near = at === -1 ? "" : rj.slice(at, at + 1400);
      rec("the Revoke handler is findable", at !== -1, "not found");
      rec("it checks the note before claiming success", /if \(d\.note\)/.test(near), near.slice(0, 300));
      // …and the success line must come AFTER that check, not before it.
      const noteAt = near.indexOf("d.note");
      const okAt = near.indexOf("✓ Removed");
      rec("…and the check comes first", noteAt !== -1 && okAt !== -1 && noteAt < okAt, { noteAt, okAt });
    }

    console.log("\n[CONTROL] granting a tech that is already in the dated block is honest too");
    {
      // The other direction: `active = true` for a tech the dated block already grants. Nova cannot add it
      // to a block it will not rewrite, and it is already granted anyway — so say so rather than tick.
      const r = await toggle("gw_artillery", true);
      console.log(`     note = ${JSON.stringify(String(r.body && r.body.note || "").slice(0, 120))}`);
      rec("it does not silently claim to have added it", !!(r.body && r.body.note), r.body);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== revoke tech reports truthfully: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
