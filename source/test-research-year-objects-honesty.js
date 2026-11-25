// #year-objects-are-editor-only — the "📅 Years ▾" menu edits a model Save never writes to the mod.
//
// Research has TWO year models. The RULER above the canvas (yearColsCustom / getYearCols) is the one Save
// writes: saveYearOverrides/saveYearColsCustom set `yearsDirty`, and Save's hook is
// `if (yearsDirty) await applyYearsToGame({silent:true})`, whose body comes from resolveYearMarkersForApply
// → getYearCols(). The in-place year OBJECTS drawn by renderGuiYears are a second model
// (guiYearPosOverrides / guiYearValOverrides / guiYearHidden / guiYearCustomStamps) that persists only to
// Nova's localStorage — resolveYearMarkersForApply never reads any of those maps.
//
// All three buttons in the menu drive the second model. They call markDirty (deliberately — the undo history
// needs them, #research-undo), so the Save button lights up and Save then reports "saved successfully" while
// the mod's countrytechtreeview.gui is untouched. The panel's own hint read "Edits are saved with your mod
// session", and Add Year's tooltip read "Add a new year to this tab" — both of which a reader takes to mean
// the mod. Wiring the stamp maps into the writer is real work (a stable marker-id scheme, the authored
// maxWidth/font round-trip through the server's /1.25 unit conversion) whose result is only checkable
// in-game, so the honest fix is that the panel states what it does.
//
// This test is deliberately two-sided: it asserts the DISCLAIMER and the CODE agree. If someone later wires
// the stamp maps into resolveYearMarkersForApply, the disclaimer becomes false and this fails — which is the
// point. Update the panel text in the same change.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const js = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "public", "research.html"), "utf8");

// ── the three buttons drive the stamp model ───────────────────────────────────────────────────────
ok("Add Year calls addGuiYearStamp", /addYearBtn.*addEventListener\("click", \(\) => addGuiYearStamp\(\)\)/s.test(js), "rewired");
ok("Delete Year calls toggleDeleteYearMode", /deleteYearBtn.*addEventListener\("click", \(\) => toggleDeleteYearMode\(\)\)/s.test(js), "rewired");
ok("Reset calls resetGuiYearEdits", /resetYearsBtn.*addEventListener\("click", \(\) => resetGuiYearEdits\(\)\)/s.test(js), "rewired");
ok("addGuiYearStamp writes to guiYearCustomStamps", /function addGuiYearStamp[\s\S]*?guiYearCustomStamps\[folder\]/.test(js), "no longer the stamp model");

// ── whether that model can reach the mod ──────────────────────────────────────────────────────────
const resolveSrc = js.slice(js.indexOf("function resolveYearMarkersForApply"), js.indexOf("async function applyYearsToGame"));
ok("resolveYearMarkersForApply exists", resolveSrc.length > 200, resolveSrc.length);
const STAMP_MAPS = ["guiYearPosOverrides", "guiYearValOverrides", "guiYearHidden", "guiYearCustomStamps"];
const wired = STAMP_MAPS.filter((m) => resolveSrc.includes(m));
ok("…and it builds the POST body from the ruler (getYearCols)", /getYearCols\(\)/.test(resolveSrc), resolveSrc.slice(0, 300));

// yearsDirty — what actually makes Save write years
const dirtySetters = (js.match(/yearsDirty = true/g) || []).length;
ok("yearsDirty is still what gates the year write", /if \(yearsDirty\)/.test(js) && dirtySetters > 0, { dirtySetters });
const stampSavers = js.slice(js.indexOf("function saveGuiYearPos"), js.indexOf("function addGuiYearStamp"));
const stampSetsDirty = /yearsDirty = true/.test(stampSavers);
ok("the four saveGuiYear* helpers persist to localStorage only", /localStorage\.setItem\(`research_gui_year_/.test(stampSavers), stampSavers.slice(0, 200));

// ── the two sides must agree ──────────────────────────────────────────────────────────────────────
const panel = html.slice(html.indexOf('id="addYearBtn"'), html.indexOf('id="addYearBtn"') + 2600);
const saysEditorOnly = /editor-side layout edits/i.test(panel) && /doesn't write them into the mod/i.test(panel);
const stampModelReachesMod = wired.length > 0 || stampSetsDirty;

ok("the stamp model is still unwired from the writer", !stampModelReachesMod, { wiredMaps: wired, stampSetsDirty });
ok("…and the panel says so", saysEditorOnly, panel.slice(panel.indexOf("font-size: 10px"), panel.indexOf("font-size: 10px") + 400));
ok("THE DISCLAIMER MATCHES THE CODE (wire the model up ⇒ update this text)",
  stampModelReachesMod !== saysEditorOnly, { stampModelReachesMod, saysEditorOnly });

// ── the specific claims that misled ───────────────────────────────────────────────────────────────
// Check the RENDERED markup, not the source: the marker comment deliberately quotes the old wording.
const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, "");
ok('the hint no longer says "saved with your mod session"', !/Edits are saved with your mod session/.test(htmlNoComments), "old claim still rendered");
ok("…though the comment still records what it used to say", /Edits are saved with your mod session/.test(html), "provenance lost");
ok("Add Year's tooltip no longer implies it adds a year to the mod",
  !/title="Add a new year to this tab\./.test(html), "old tooltip still present");
ok("…and says editor-side instead", /Editor-side only: Save does not write it into the mod/.test(panel), panel.slice(0, 400));
ok("Delete Year says the mod's .gui is not changed", /the mod's \.gui is not changed/.test(panel), panel.slice(0, 900));
ok("the panel points at the control that DOES write", /year ruler above the canvas/.test(panel), panel);
ok("the marker comment is in both files", /#year-objects-are-editor-only/.test(js) && /#year-objects-are-editor-only/.test(html), "marker missing");

// ── the stale comment that claimed Save covered these ─────────────────────────────────────────────
const wiringNote = js.slice(js.indexOf('The old "Apply years to game"'), js.indexOf('The old "Apply years to game"') + 700);
ok("the toolbar comment now qualifies which model Save writes", /RULER model only/.test(wiringNote), wiringNote);

// ── the editor-side behaviour that must NOT regress ───────────────────────────────────────────────
ok("stamp edits still take an undo label (they are real editor edits)", /markDirty\(label\)/.test(stampSavers), stampSavers.slice(0, 300));
ok("Reset still clears all four maps", /guiYearPosOverrides = \{\}; guiYearValOverrides = \{\}; guiYearHidden = \{\}; guiYearCustomStamps = \{\};/.test(js), "reset narrowed");
// At least, not exactly — an exact pin turns every future bump of this file into a false failure.
// Match the NUMBER, not the word. This pinned `equipinherit(\d+)`, which is the exact-pin failure the
// comment above warns about one line earlier: the version label is renamed whenever the reason for the
// bump changes (it is now `overlaybase72`), and that renaming failed a test about year objects. The
// number is the part that carries the meaning — it must be past the point this behaviour landed.
ok("research.js cache version was bumped",
  (() => { const m = /research\.js\?v=[a-z]+(\d+)/i.exec(html); return !!m && Number(m[1]) >= 69; })(), "stale cache version");

console.log("\ntest-research-year-objects-honesty: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 20 ? 0 : 1;
