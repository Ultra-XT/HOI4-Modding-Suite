// A national spirit's whole lifecycle must leave the file exactly as it found it (#spirit-lifecycle).
//
// Create a spirit into an existing ideas file, rename its display name, then delete it — the file must
// come back BYTE-IDENTICAL and the spirits that were already in it must never be disturbed. Verified
// against Millennium Dawn's real Abkhazian.txt during the audit; pinned here on a fixture of the same
// shape so it runs anywhere.
//
// This also guards the localisation side: a rename must update the key where it already lives rather
// than appending a second definition, and a delete must take the key away with the block.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const FIXTURES = path.join(os.tmpdir(), "nova-fixtures");
fs.mkdirSync(FIXTURES, { recursive: true });
process.env.HOI4_MODS_ROOT = FIXTURES;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(FIXTURES, "spirit-life-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="SpiritLifecycle"\nsupported_version="1.19.*"\n');
const idir = path.join(mod, "common", "ideas");
fs.mkdirSync(idir, { recursive: true });

const REL = "probe_ideas.txt";
const FILE = path.join(idir, REL);
const ORIGINAL = [
  "ideas = {",
  "\tcountry = {",
  "\t\tprobe_existing_one = {",
  "\t\t\tremoval_cost = -1",
  "\t\t\tpicture = bitcoin",
  "\t\t\tmodifier = {",
  "\t\t\t\twar_support_factor = 0.05",
  "\t\t\t}",
  "\t\t}",
  "\t\tprobe_existing_two = {",
  "\t\t\tpicture = oil_profits",
  "\t\t\tmodifier = {",
  "\t\t\t\tpolitical_power_gain = 0.1",
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
  "﻿l_english:\n probe_existing_one:0 \"Existing One\"\n probe_existing_two:0 \"Existing Two\"\n", "utf8");

const ID = "nova_probe_spirit";
const read = () => fs.readFileSync(FILE, "utf8");
const spiritCount = () => (read().match(/\n\t\t[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/g) || []).length;
const balanced = () => { const s = read().replace(/#.*$/gm, ""); return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length; };
const locLines = (id) => {
  const out = [];
  for (const f of fs.readdirSync(locDir)) {
    for (const line of fs.readFileSync(path.join(locDir, f), "utf8").split("\n")) {
      if (new RegExp("^\\s*" + id + ":").test(line)) out.push(f + "|" + line.trim());
    }
  }
  return out;
};
const neighboursIntact = () => read().includes("probe_existing_one = {") && read().includes("probe_existing_two = {");

const PORT = 39584, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    ok("the fixture starts with two spirits", spiritCount() === 2, spiritCount());

    // ── CREATE ────────────────────────────────────────────────────────────────────────────────────
    const c = await post("/api/ideas/upsert-definition", {
      modPath: mod, ideaId: ID, targetRelativeFile: REL,
      name: "Nova Probe Spirit", desc: "Made by the test.", picture: "generic_intel_bonus",
      targetLocalizationPath: "", selectedEffects: [{ effectId: "stability_factor", values: { value: 0.05 } }],
      mode: "create", category: "country", cost: "", removalCost: "-1", ledger: "", traits: "",
    });
    ok("create → 200", c.s === 200, c.b);
    ok("the spirit is in the file", read().includes(ID + " = {"));
    ok("the file now has three spirits", spiritCount() === 3, spiritCount());
    ok("its modifier was written", /stability_factor\s*=\s*0\.05/.test(read()));
    ok("its picture was written", /picture\s*=\s*generic_intel_bonus/.test(read()));
    ok("it got exactly one localisation entry", locLines(ID).length === 1, locLines(ID));
    ok("the existing spirits are untouched", neighboursIntact());
    ok("the file is brace-balanced", balanced());

    // ── RENAME the display name ───────────────────────────────────────────────────────────────────
    const ep = await get("/api/ideas/edit-payload?ideaId=" + ID
      + "&definitionFile=" + encodeURIComponent("common/ideas/" + REL) + "&modPath=" + encodeURIComponent(mod));
    ok("the new spirit reads back", ep.ok === true, ep.error);
    ok("its picture reads back", ep.pictureToken === "generic_intel_bonus", ep.pictureToken);
    const r2 = await post("/api/ideas/upsert-definition", {
      modPath: mod, ideaId: ID, targetRelativeFile: REL,
      name: "Renamed Probe Spirit", desc: ep.localizedDesc, picture: ep.pictureToken,
      targetLocalizationPath: ep.localizationFile, selectedEffects: ep.selectedEffects,
      mode: "edit", category: ep.category, cost: ep.cost, removalCost: ep.removalCost,
      ledger: ep.ledger, traits: ep.traits,
    });
    ok("rename → 200", r2.s === 200, r2.b);
    ok("still exactly one localisation entry, updated in place", locLines(ID).length === 1, locLines(ID));
    ok("the new name is the one stored", locLines(ID)[0].includes("Renamed Probe Spirit"), locLines(ID));
    ok("the spirit count did not change", spiritCount() === 3, spiritCount());

    // ── DELETE ────────────────────────────────────────────────────────────────────────────────────
    const del = await post("/api/ideas/delete-definition", {
      modPath: mod, ideaId: ID, targetRelativeFile: REL, targetLocalizationPath: "",
    });
    ok("delete → 200", del.s === 200, del.b);
    ok("the spirit is gone from the file", !read().includes(ID + " = {"), read());
    ok("its localisation is gone", locLines(ID).length === 0, locLines(ID));
    ok("the existing spirits survived the whole cycle", neighboursIntact());
    ok("the file is still brace-balanced", balanced());

    // the point of the whole test
    ok("the file is BYTE-IDENTICAL to before the cycle", read() === ORIGINAL, {
      before: ORIGINAL.length, after: read().length, text: read(),
    });
    ok("the other spirits' localisation is untouched",
      locLines("probe_existing_one").length === 1 && locLines("probe_existing_two").length === 1,
      { one: locLines("probe_existing_one"), two: locLines("probe_existing_two") });

    console.log("\ntest-spirit-lifecycle: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
