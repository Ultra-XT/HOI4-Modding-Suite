// #rename-writes-a-duplicate (focus editor) — renaming a focus wrote the new name into a file chosen
// alphabetically, not the file that already held the focus's name, so the rename appeared to revert.
//
// /api/localization/upsert strips and appends only inside the file the CLIENT hands it, and the client picks
// the first entry of /api/localization/status — alphabetical, except that the mod's own
// <folder-basename>_l_english.yml is bumped to the front. For a mod Nova created, that bumped file sorts last
// in the merge and renames work. For any pre-existing mod whose folder name is not a loc-file basename it
// does not: Millennium Dawn's folder is "2777392649", so files[0] is 0_energy_l_english.yml — an unrelated
// file, which then received the focus's name as a SECOND definition.
//
// The mod therefore ships the key twice. The wiki says the winner between two files "does not seem to have a
// consistent pattern", so in-game it is undefined; and Nova's own resolver (sorted merge, last-wins) shows the
// OLD name after the next fetch, so the modder watches their rename undo itself.
//
// Only focuses that ALREADY have a name elsewhere are affected — renaming a brand-new focus always worked.
// The same endpoint backs the continuous-focus name save, which had the identical problem.
//
// Nothing was destroyed, which is why this is wrong-output and not data loss: the original stanza is intact
// and the new text is on disk, just in a file that does not win.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-focusrename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const modIndex = require("./mod-index.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const ENG = path.join(MOD, "localisation", "english");
fs.mkdirSync(ENG, { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FR"\nsupported_version="1.18.*"\n');

// Millennium Dawn's shape: an unrelated file sorts FIRST (what the client auto-picks), while the focus's
// real name lives in a file that sorts later — so the later one wins the merge.
const FIRST = path.join(ENG, "0_energy_l_english.yml");
const OWNER = path.join(ENG, "MD_focus_GER_l_english.yml");
fs.writeFileSync(FIRST, "﻿l_english:\n SOME_UNRELATED_KEY:0 \"Energy\"\n", "utf8");
fs.writeFileSync(OWNER, "﻿l_english:\n probe_focus:0 \"Old Focus Name\"\n probe_focus_desc:0 \"Old description.\"\n", "utf8");

const countKey = (key) => {
  let n = 0;
  for (const f of fs.readdirSync(ENG)) {
    if (!/\.yml$/i.test(f)) continue;
    n += (fs.readFileSync(path.join(ENG, f), "utf8").match(new RegExp(`^\\s*${key}:\\d*\\s*"`, "gm")) || []).length;
  }
  return n;
};

const PORT = 39941, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    ok("precondition: the focus name is defined once, in the later-sorting file", countKey("probe_focus") === 1);
    ok("precondition: Nova resolves the old name", modIndex.scanLocalization(MOD).probe_focus === "Old Focus Name");

    // The client hands over files[0] — the unrelated, alphabetically-first file.
    const r = await post("/api/localization/upsert", {
      modPath: MOD, path: "localisation/english/0_energy_l_english.yml",
      entries: { probe_focus: { name: "New Focus Name", desc: "New description." } },
    });
    ok("the rename save succeeds", r.s === 200 && r.b && r.b.ok, r.b);

    ok("the name is still defined exactly ONCE (no duplicate added)", countKey("probe_focus") === 1,
      fs.readdirSync(ENG).map((f) => [f, fs.readFileSync(path.join(ENG, f), "utf8").slice(0, 120)]));
    ok("…and the description too", countKey("probe_focus_desc") === 1, fs.readdirSync(ENG));
    ok("the file that OWNED the name has the new one", /New Focus Name/.test(fs.readFileSync(OWNER, "utf8")),
      fs.readFileSync(OWNER, "utf8"));
    ok("…and the new description", /New description\./.test(fs.readFileSync(OWNER, "utf8")), fs.readFileSync(OWNER, "utf8"));
    ok("the unrelated auto-picked file did NOT receive the focus's name",
      !/probe_focus/.test(fs.readFileSync(FIRST, "utf8")), fs.readFileSync(FIRST, "utf8"));
    ok("…and still has its own key", /SOME_UNRELATED_KEY/.test(fs.readFileSync(FIRST, "utf8")), fs.readFileSync(FIRST, "utf8"));

    // The contract that matters: what gets resolved is the NEW name.
    ok("the name Nova (and the game) resolve is the new one",
      modIndex.scanLocalization(MOD).probe_focus === "New Focus Name", modIndex.scanLocalization(MOD).probe_focus);
    ok("the response says where the text actually went",
      Array.isArray(r.b.redirectedTo) && r.b.redirectedTo.some((f) => /MD_focus_GER/.test(f)), r.b);

    // ── a brand-new focus still lands in the caller's chosen file ───────────────────────────────────
    const r2 = await post("/api/localization/upsert", {
      modPath: MOD, path: "localisation/english/0_energy_l_english.yml",
      entries: { brand_new_focus: { name: "Brand New", desc: "Fresh." } },
    });
    ok("a focus with no existing name still saves", r2.s === 200 && r2.b && r2.b.ok, r2.b);
    ok("…into the file the caller chose", /brand_new_focus:0 "Brand New"/.test(fs.readFileSync(FIRST, "utf8")),
      fs.readFileSync(FIRST, "utf8"));
    ok("…exactly once", countKey("brand_new_focus") === 1, fs.readdirSync(ENG));

    // ── renaming twice must stay stable ─────────────────────────────────────────────────────────────
    await post("/api/localization/upsert", {
      modPath: MOD, path: "localisation/english/0_energy_l_english.yml",
      entries: { probe_focus: { name: "Third Name", desc: "Third description." } },
    });
    ok("a second rename still leaves one definition", countKey("probe_focus") === 1, fs.readdirSync(ENG));
    ok("…with the latest value", modIndex.scanLocalization(MOD).probe_focus === "Third Name",
      modIndex.scanLocalization(MOD).probe_focus);

    console.log("\ntest-focus-rename-in-place: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 16 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
