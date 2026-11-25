// ⛔ #a-blank-an-overlay-cannot-deliver-needs-an-actionable-instruction — TRUE ADVICE THE MODDER CANNOT ACT ON.
//
// Delete map on a mod created by Nova's own wizard is already HONEST. Driven by hand on 2026-09-16, through
// the real page on a real brand-new mod, all three messages say the right thing:
//
//   dialog      "⚠ This will not leave a blank canvas. The base game … still loads 1081 states and 363
//                country capitals underneath yours … add these lines to your descriptor.mod first:
//                replace_path="history/states" / replace_path="history/countries""
//   staged      "⚠ 1081 states come from the base game or a dependency and will come back …"
//   after Save  "The map is not blank: 1081 states and 363 country capitals come from the base game or a
//                dependency … Add replace_path="history/states" and replace_path="history/countries" …"
//
// So the honesty half was DONE, and the #delete-map-cannot-blank-an-overlay comments are the record of the
// fix, not of a live bug. What was still missing is the other half: the modder is told to edit a file, and
//
//   (1) Nova never says WHICH file — it knows the absolute path and does not print it. `rg replace_path`
//       over server.js and public/*.js finds no writer at all: nothing in Nova has ever written a
//       replace_path line, so "add these lines" is entirely the modder's job and never says so;
//   (2) nothing says what the SECOND line costs. It is offered to stop 363 `capital = N` statements
//       loading, and it unloads the whole folder those statements live in.
//
// ⭐⭐⭐ WHAT IT IS WORTH. The owner's headline workflow (new mod → Delete map → Generate land at the page's
// own 35%/seed 1 → Auto-fix → Auto-fix again → validate), run end to end against the real base game on
// 2026-09-16 through the same endpoints public/map.js sends:
//
//   wizard-fresh descriptor          48 problems, 46 errors   (1,081 base states still loaded underneath)
//   + the two replace_path lines      1 problem,   0 errors   (720 states, none from below, 4,655 land)
//
// Two lines in a text file are the entire difference between the owner's own workflow producing a world
// HOI4 refuses to load and one it does not. Naming the file is the cheapest thing Nova can do about it.
//
// ⚠️ WHAT THIS DELIBERATELY DOES NOT DO: write the line. A descriptor's replace_path changes what the WHOLE
// mod loads — replacing history/countries to drop 363 capitals also drops every country's politics,
// technology, characters and order of battle — so that is the owner's call, not a side effect of a map
// button. The dialog now says the cost and says who has to make the edit.
//
// Every string below is checked by RUNNING the real builder lifted out of public/map.js — a source-shape
// grep is not a control (#a-source-shape-assertion-is-not-a-back-out-control).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];

// ── Lift the real builder out of public/map.js ──────────────────────────────────────────────────────────
// ⚠️ Brace-matched, never anchored on a newline: public/map.js is LF in the main checkout and CRLF in a
// fresh worktree (core.autocrlf, no .gitattributes), and a bare-\n anchor matches nothing in the CRLF one
// AND REPORTS SUCCESS.
const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
function liftFunction(name) {
  const a = SRC.indexOf("function " + name + "(");
  if (a === -1) return "";
  let d = 0;
  for (let i = SRC.indexOf("{", a); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) return SRC.slice(a, i + 1); }
  }
  return "";
}
const fn = liftFunction("blankConfirmBody");
ok(!!fn, "blankConfirmBody was lifted out of public/map.js");
const build = fn
  ? new Function("model", "descriptorPath", fn + "\n return blankConfirmBody(descriptorPath);")
  : null;

// The two shapes that matter, built the way the page builds them: `inBaseLayer` marks a state that resolves
// from a lower layer, `capitalFromMod` marks a capital the mod's own file set.
const OVERLAY = { states: [{ id: 1, inBaseLayer: true }, { id: 2, inBaseLayer: true }], capitals: { AAA: 1, BBB: 2 }, capitalFromMod: {} };
const OWNS_ALL = { states: [{ id: 9, inBaseLayer: false }], capitals: { AAA: 9 }, capitalFromMod: { AAA: true } };
const OWNS_COUNTRIES = { states: [{ id: 1, inBaseLayer: true }], capitals: { AAA: 1 }, capitalFromMod: { AAA: true } };
const DPATH = "C:/Users/someone/Documents/Paradox Interactive/Hearts of Iron IV/mod/my_world/descriptor.mod";

console.log("\n=== ⭐ RUN: the dialog names the file the modder has to edit ===");
if (build) {
  const html = build(OVERLAY, DPATH);
  ok(html.indexOf(DPATH) !== -1, "⭐ the full path of descriptor.mod is in the dialog, not just the word", html.slice(-700));
  ok(/does not write it for you/i.test(html), "…and it says outright that Nova will not make the edit", html.slice(-700));
  ok(/text editor/i.test(html), "…and where to make it", html.slice(-700));
  // The instruction and the path must travel together: a path printed while the lines are not shown is
  // an address with nothing to put at it.
  ok(html.indexOf('replace_path="history/states"') < html.indexOf(DPATH),
    "…printed after the lines it is the destination for");
}

console.log("\n=== ⚠️ RUN: …and what the second line costs beyond the capitals ===");
if (build) {
  const html = build(OVERLAY, DPATH);
  ok(/whole<\/b> folder|<b>whole folder<\/b>/.test(html) || /whole<\/b>\s*folder/.test(html) || /stops that <b>whole folder<\/b>/.test(html),
    "the cost sentence says replace_path unloads the whole folder", html.slice(-700));
  ok(/politics/.test(html) && /technology/.test(html) && /order of battle/.test(html),
    "⭐ …and names what else is in those files — the 73,847 lines of vanilla history/countries that are not a capital",
    html.slice(-700));
  ok(/second line/i.test(html), "…and says which of the two lines it is about", html.slice(-700));
  // It is about history/countries ONLY. A mod that owns its country files is advised only history/states,
  // and must not be warned about a line it was never given.
  const onlyStates = build(OWNS_COUNTRIES, DPATH);
  ok(onlyStates.indexOf('replace_path="history/countries"') === -1,
    "⚠️ CONTROL: a mod whose own files set the capitals is not told to replace history/countries", onlyStates.slice(-600));
  ok(!/second line/i.test(onlyStates) && !/order of battle/.test(onlyStates),
    "⚠️ CONTROL: …so it does not get the cost sentence for a line it was never given", onlyStates.slice(-600));
  ok(onlyStates.indexOf(DPATH) !== -1 && /the line/.test(onlyStates) && !/the lines/.test(onlyStates),
    "…and the single-line case reads as one line, not two", onlyStates.slice(-600));
}

console.log("\n=== ⛔ CONTROL: a mod that OWNS its map is not made worse ===");
if (build) {
  const tc = build(OWNS_ALL, DPATH);
  ok(/blank ocean canvas/.test(tc) && !/will not leave a blank canvas/.test(tc),
    "a mod that replaces the base game's states is still promised a real blank", tc.slice(0, 400));
  ok(tc.indexOf(DPATH) === -1, "⛔ …and is told nothing about descriptor.mod, which it does not need to edit", tc);
  ok(!/replace_path/.test(tc) && !/order of battle/.test(tc),
    "⛔ …no descriptor advice and no cost warning at all", tc);
}

console.log("\n=== 🈯 no mod path: name no file rather than a wrong one ===");
if (build) {
  const html = build(OVERLAY, "");
  ok(/replace_path="history\/states"/.test(html), "the lines are still shown");
  ok(!/does not write it for you/.test(html) && !/text editor/i.test(html),
    "…but with nothing selected there is no file to name, so none is named", html.slice(-500));
  ok(html.indexOf("/descriptor.mod</code>") === -1,
    "⚠️ …and certainly not a bare \"/descriptor.mod\"", html.slice(-500));
  // The cost sentence does not depend on knowing the path.
  ok(/order of battle/.test(html), "…while the cost of the second line is still stated", html.slice(-500));
}

console.log("\n=== 🈯 a path is HTML, and a mod folder may carry & or < ===");
if (build) {
  const nasty = 'D:/mods/R&D <beta>/descriptor.mod';
  const html = build(OVERLAY, nasty);
  ok(html.indexOf("R&amp;D &lt;beta&gt;") !== -1, "the path is escaped before it goes into innerHTML", html.slice(-600));
  ok(html.indexOf("<beta>") === -1, "⛔ …so a folder name cannot inject markup into the dialog", html.slice(-600));
}

console.log("\n=== the page passes the real path in, and repeats it after the write ===");
{
  ok(/blankConfirmBody\(modPath\(\)/.test(SRC),
    "the Delete map click hands the builder the active mod's descriptor path");
  ok(/descriptor\.mod"\s*:\s*""/.test(SRC) || /descriptor\.mod" : ""/.test(SRC),
    "…and an unselected mod passes an empty string, not \"/descriptor.mod\"");
  // The post-save survivors warning is the copy still on screen when the files are actually gone.
  const i = SRC.indexOf("The map is not blank:");
  ok(i !== -1, "the post-save survivors warning is still built");
  const near = SRC.slice(i, i + 1400);
  ok(/does not write it for you/.test(near),
    "⭐ …and it, too, names descriptor.mod by path and says Nova will not edit it", near.slice(0, 700));
  ok(/modPath\(\)/.test(near), "…from the active mod, not a guess", near.slice(0, 700));
  // ⭐ #nova-writes-two-descriptors-and-named-one — AND IT NAMES EVERY DESCRIPTOR NOVA WROTE, not just the one
  // inside the folder. A local mod has two (/api/mod/create writes <modRoot>/descriptor.mod AND the launcher
  // entry <modsRoot>/<slug>.mod), and this line named the first only, so a modder who followed it left the two
  // disagreeing. The HOI4 launcher copies replace_path into its own entry verbatim — 74/74, 95/95, 30/30, 26/26
  // and 2/2 lines across the five shipping map mods' ugc_<id>.mod entries — so both are named. The list comes
  // from the SERVER (blankSurvivors resolves it off disk, so a workshop mod's absent sibling is never invented),
  // and modPath() stays the fallback, which is what the assertion above still pins.
  ok(/s\.descriptors/.test(near),
    "⭐ …and it names every descriptor the server found, not only the one inside the folder", near.slice(0, 900));
  ok(/both need the line/.test(near), "…saying plainly that a local mod's two descriptors BOTH need it", near.slice(0, 900));
}

console.log("\n=== ⛔ …and the dialog must not outgrow its own panel ===");
{
  // ⚠️ MY OWN CHANGE BROKE THIS FIRST. #mapBlankConfirm is `inset:0` on the MAP PANEL, not the page, and the
  // page does not scroll. Measured in the app's own window (1440x920, main.js) driving the real click:
  //
  //   4601d18          body 353px   card 543px   in a 620px panel — fits, confirm button reachable
  //   + the new copy   body 611px   card 801px   CLIPPED AT BOTH ENDS, "Delete the map" off-screen
  //   + this fix       body 430px   card 620px   body scrolls inside, starts at the top, button reachable
  //
  // and on a mod that owns its map (the short body) the card is 327px and does not scroll at all — the
  // constraint only bites when the copy genuinely exceeds the panel. Pinned here so the next paragraph of
  // truth someone adds cannot take the dialog's own controls out of reach.
  const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const styleOf = (frag) => {
    const m = /style="([^"]*)"/.exec(frag);
    const out = {};
    for (const bit of (m ? m[1] : "").split(";")) {
      const i = bit.indexOf(":");
      if (i > 0) out[bit.slice(0, i).trim().toLowerCase()] = bit.slice(i + 1).trim().toLowerCase();
    }
    return out;
  };
  const bodyAt = HTML.indexOf('id="mapBlankBody"');
  ok(bodyAt !== -1, "the dialog body is in public/map.html");
  const bodyStyle = styleOf(HTML.slice(HTML.lastIndexOf("<div", bodyAt), HTML.indexOf(">", bodyAt) + 1));
  ok(/auto|scroll/.test(bodyStyle["overflow-y"] || bodyStyle.overflow || ""),
    "⛔ the body scrolls rather than pushing the card past the panel", bodyStyle);
  ok(bodyStyle["min-height"] === "0",
    "…and can shrink inside the flex card, which it cannot do at the default min-height:auto", bodyStyle);
  // The card is the FIRST div inside the #mapBlankConfirm overlay — the flex child that has to stay inside
  // it. ⚠️ Walking back from the body instead lands on the title div, which is its sibling, not its parent.
  const overlayAt = HTML.indexOf('id="mapBlankConfirm"');
  ok(overlayAt !== -1 && overlayAt < bodyAt, "the overlay wraps it", { overlayAt, bodyAt });
  const cardAt = HTML.indexOf("<div", HTML.indexOf(">", overlayAt));
  const cardStyle = styleOf(HTML.slice(cardAt, HTML.indexOf(">", cardAt) + 1));
  ok((cardStyle["max-height"] || "") === "100%", "⛔ …because the card itself cannot outgrow the panel", cardStyle);
  ok((cardStyle.display || "") === "flex" && /column/.test(cardStyle["flex-direction"] || ""),
    "…a column, so the body is what gives way and the buttons are not", cardStyle);
  ok((cardStyle["box-sizing"] || "") === "border-box",
    "…with its 18px/20px padding counted INSIDE that 100%, or the limit is 100% + 36px", cardStyle);
}

console.log("\n=== ⛔ CONTROL, at the writer: a mod that owns its map still loses nothing ===");
{
  // Step 3 of the brief: Delete map on a mod that DOES own its map deletes its state files and keeps every
  // one of them recoverable. Counts derived from the fixture, never typed.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dmn-home-")); tmps.push(home);
  const prevHome = process.env.NOVA_HOME_DIR;
  process.env.NOVA_HOME_DIR = home;

  const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dmn-base-")); tmps.push(base);
  const N = 40;
  const ids = Array.from({ length: N }, (_, i) => i + 1);
  mk(path.join(base, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat(ids.map((i) => `${i};${(i * 7) % 255};${i};0;land;false;plains;1`)).join("\r\n") + "\r\n");

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dmn-mod-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="Owns"\nreplace_path="history/states"\nreplace_path="history/countries"\n');
  for (const i of ids) {
    mk(path.join(mod, "history", "states", i + ".txt"),
      `state = {\n\tid = ${i}\n\tname = "S${i}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${i} }\n\thistory = { owner = AAA }\n}\n`);
  }
  const supplyIds = [1, 2, 3];
  for (const i of supplyIds) {
    mk(path.join(mod, "map", "supplyareas", i + ".txt"),
      `supply_area = {\n\tid = ${i}\n\tname = "A${i}"\n\tvalue = 3\n\tstates = { ${i} }\n}\n`);
  }
  const ownStateFiles = fs.readdirSync(path.join(mod, "history", "states")).filter((f) => /\.txt$/i.test(f)).length;
  const ownSupplyFiles = fs.readdirSync(path.join(mod, "map", "supplyareas")).filter((f) => /\.txt$/i.test(f)).length;

  const r = md.blankMapToSea({ modRoot: mod, gameRoot: base, dependencyRoots: [] });
  ok(r.deletedStates === ownStateFiles, `every state file the mod owned was deleted (${ownStateFiles})`, r.deletedStates);
  ok(r.deletedSupply === ownSupplyFiles, `…and every supply-area file (${ownSupplyFiles})`, r.deletedSupply);
  ok(typeof r.snapshotPath === "string" && r.snapshotPath.length > 0, "…with a snapshot path reported", r.snapshotPath);
  const snapStates = (() => { try { return fs.readdirSync(path.join(r.snapshotPath, "history", "states")).length; } catch (_) { return -1; } })();
  const snapSupply = (() => { try { return fs.readdirSync(path.join(r.snapshotPath, "map", "supplyareas")).length; } catch (_) { return -1; } })();
  ok(snapStates === ownStateFiles, "⛔ EVERY deleted state file is recoverable from the snapshot", { snapStates, ownStateFiles });
  ok(snapSupply === ownSupplyFiles, "⛔ …and every deleted supply-area file", { snapSupply, ownSupplyFiles });
  ok(r.snapshotFailed === 0, "…with no copy failures", r.snapshotFailed);
  ok(!path.resolve(r.snapshotPath).startsWith(path.resolve(mod)),
    "…kept OUTSIDE the mod, so it never ships", { snapshot: r.snapshotPath, mod });
  ok(path.resolve(r.snapshotPath).startsWith(path.resolve(home)),
    "…under the Nova home dir the runner sandboxes, not the user's own", r.snapshotPath);
  ok(r.survivors.states === 0 && r.survivors.capitals === 0,
    "⛔ …and this mod really does get a blank map, so it is told nothing about descriptor.mod", r.survivors);

  if (prevHome === undefined) delete process.env.NOVA_HOME_DIR; else process.env.NOVA_HOME_DIR = prevHome;
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== delete map names the file you must edit: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
