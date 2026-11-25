// Section-label FONT endpoint (/api/research/set-label-font): the font-size control writes the nearest stock
// HOI4 font into the label's instantTextBoxType in the mod's gui, so a resized section label changes in-game.
// Locks: edits EVERY instance of the named label (a subtitle is sometimes authored twice), leaves other
// labels untouched, adds a font attr when missing, rejects non-stock fonts, keeps braces balanced, and a
// no-op (same font) still succeeds.
// Run: node test-research-label-font.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const GUI = `guiTypes = {
\tcontainerWindowType = {
\t\tname = "countrytechtreeview"
\t\tcontainerWindowType = {
\t\t\tname = "test_folder"
\t\t\tcontainerWindowType = {
\t\t\t\tname = "stripes"
\t\t\t\tinstantTextBoxType = {
\t\t\t\t\tname = "test_subtitle_weapons"
\t\t\t\t\tposition = { x = 85 y = 105 }
\t\t\t\t\tfont = "hoi_33"
\t\t\t\t\ttext = "TEST_TITLE"
\t\t\t\t}
\t\t\t\tinstantTextBoxType = {
\t\t\t\t\tname = "test_subtitle_weapons"
\t\t\t\t\tposition = { x = 85 y = 105 }
\t\t\t\t\tfont = "hoi_33"
\t\t\t\t\ttext = "TEST_TITLE"
\t\t\t\t}
\t\t\t\tinstantTextBoxType = {
\t\t\t\t\tname = "no_font_label"
\t\t\t\t\tposition = { x = 300 y = 105 }
\t\t\t\t\ttext = "NOFONT"
\t\t\t\t}
\t\t\t\tinstantTextBoxType = {
\t\t\t\t\tname = "other_label"
\t\t\t\t\tfont = "hoi_33"
\t\t\t\t\ttext = "OTHER"
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}
`;

(async () => {
  console.log("=== RESEARCH set-label-font ===");
  const PORT = 3923, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lblfont-"));
  fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
  const guiPath = path.join(mod, "interface", "countrytechtreeview.gui");
  fs.writeFileSync(guiPath, GUI);

  const set = async (folder, name, font, modPath = mod) => {
    const r = await fetch(`${BASE}/api/research/set-label-font`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath, folder, name, font }),
    });
    return { status: r.status, body: await r.json() };
  };
  const gui = () => fs.readFileSync(guiPath, "utf8");
  const balanced = (s) => s.split("{").length === s.split("}").length;

  try {
    // 1. change the label font — BOTH instances update, others don't.
    const a = await set("test_folder", "test_subtitle_weapons", "hoi_36header");
    ok("set-label-font ok", a.body && a.body.ok === true, a.body);
    ok("both instances updated to hoi_36header", (gui().match(/font = "hoi_36header"/g) || []).length === 2, gui().match(/font = "hoi_[0-9a-z_]+"/g));
    ok("no test_subtitle_weapons instance left on hoi_33", !/test_subtitle_weapons[\s\S]{0,80}font = "hoi_33"/.test(gui()));
    ok("other_label untouched (still hoi_33)", /other_label"[\s\S]{0,40}font = "hoi_33"/.test(gui()));
    ok("gui still brace-balanced", balanced(gui()));

    // 2. a label with no font attr gets one added.
    const b = await set("test_folder", "no_font_label", "hoi_24header");
    ok("no_font_label: font added", b.body && b.body.ok === true && /no_font_label"[\s\S]{0,80}font = "hoi_24header"/.test(gui()), b.body);
    ok("gui still brace-balanced after add", balanced(gui()));

    // 3. reject a non-stock font.
    const c = await set("test_folder", "test_subtitle_weapons", "comic_sans");
    ok("non-stock font rejected (400)", c.status === 400 && c.body && !c.body.ok, c);

    // 4. missing label → error.
    const d = await set("test_folder", "does_not_exist", "hoi_18");
    ok("missing label rejected (400)", d.status === 400 && d.body && !d.body.ok, d);

    // 5. no-op: set the SAME font again → still ok, unchanged.
    const before = gui();
    const e = await set("test_folder", "other_label", "hoi_33");
    ok("no-op (same font) still ok + unchanged", e.body && e.body.ok === true && gui() === before, e.body);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nRESEARCH-LABEL-FONT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
