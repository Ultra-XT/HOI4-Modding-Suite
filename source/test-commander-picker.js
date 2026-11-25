// #commander-typed-from-memory — THE COMMANDER BOX ASKED YOU TO SPELL A GENERAL'S NAME FROM MEMORY.
//
// A division's commander is HOI4's native `officer = { name = "…" }`, so the field wants a display name — and
// the deploy card offered a bare text box with a placeholder. Reported after use: "It would be nicer to add a
// feature where we can browse the commanders of that country to choose from them with a picture."
//
// Every other id-shaped field on that card already had a Browse picker (the State ID box next to it got one
// in #deploy-state-id-blind-box). This one did not, even though the country's characters are already scanned
// and already carry portraits — and a general is exactly the sort of thing people recognise by face.
//
// Verified in the running app, Millennium Dawn, USA:
//
//     47 commanders · 47 portraits loaded · 0 clipped tiles
//     Mark Milley — field marshal — skill 4 · atk 6 · def 2 · plan 4 · log 1
//     search "abizaid" → 1 result → click → box reads "John P. Abizaid", picker closes
//
// Includes the BASE MOD's characters: an add-on on Millennium Dawn has almost no characters of its own, and
// the generals it wants to deploy belong to MD. The game loads them either way.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const HTML = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");
const JS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));

console.log("\n[the button exists and is wired]");
{
  rec("the Commander box has a Browse button", /id="deployOfficerBrowseBtn"/.test(HTML), "button missing");
  rec("…beside the Commander input", HTML.indexOf('id="deployOfficerBrowseBtn"') > HTML.indexOf('id="deployOfficer"'), "wrong place");
  rec("…and it opens the commander browser", /deployOfficerBrowseBtn[\s\S]{0,200}openCommanderBrowser\(\)/.test(JS), "not wired");
  rec("openCommanderBrowser exists", /function openCommanderBrowser\(/.test(JS), "not defined");
}

const FN = (() => {
  const at = JS.indexOf("async function openCommanderBrowser(");
  if (at === -1) return "";
  const open = JS.indexOf("{", at);
  let d = 0;
  for (let i = open; i < JS.length; i++) {
    if (JS[i] === "{") d++;
    else if (JS[i] === "}") { d--; if (d === 0) return JS.slice(at, i + 1); }
  }
  return "";
})();

console.log("\n[it offers this country's generals, with faces]");
{
  rec("the function body is found", FN.length > 800, FN.length);
  rec("it reads the character list", /\/api\/characters\/list/.test(FN), "no character fetch");
  // ⭐ A mod is an overlay: an add-on's generals come from its base mod.
  rec("…including the base mod's characters", /includeBaseMod=1/.test(FN), "base mod excluded");
  rec("…and names the mod it is asking about", /modPath=/.test(FN), "no modPath on the request");
  // Two things tie a character to a tag, and mods use both.
  rec("filters by the country's file", /\.TXT/.test(FN), "no file match");
  rec("…and by the token prefix", /tok\.startsWith/.test(FN), "no token match");
  rec("prefers generals", /roleGeneral/.test(FN), "role not considered");
  rec("portraits are resolved through the sprite endpoint", /\/api\/ideas\/sprite-url/.test(FN), "portraits not resolved");
  rec("…from the character's own portrait fields", /portraitArmyLarge/.test(FN), "portrait field not read");
}

console.log("\n[picking one fills the box the game reads]");
{
  rec("it writes into the Commander input", /\$\("deployOfficer"\)/.test(FN), "does not fill the box");
  // officer = { name = "…" } takes a display NAME, not a token — writing the token would produce a
  // commander the game cannot resolve.
  rec("…with the display name, not the token", /box\.value = r\.name/.test(FN), "writes the wrong field");
  rec("…and tells the user what was picked", /deployStatus|status\.textContent/.test(FN), "silent");
}

console.log("\n[empty and error states say something useful]");
{
  rec("an empty result explains itself", /No commanders found/.test(FN), "silent empty state");
  rec("…and points at where to make one", /Characters maker/.test(FN), "no next step offered");
  rec("no country selected is handled", /Pick a country first/.test(FN), "no guard");
}

console.log("\n[CONTROL] it reuses the page's own helpers rather than inventing new ones");
{
  // getModPath() does not exist in this file — modPath() does. A picker calling the wrong one throws at the
  // moment the user clicks Browse, which is exactly when nobody is watching a test suite.
  rec("uses the page's modPath() helper", /modPath\(\)/.test(FN), "wrong helper");
  rec("…and getModPath() appears nowhere in the page", !/getModPath/.test(JS), "a non-existent helper is referenced");
  rec("the tile grid is the shared picker grid", /modal-grid-techs/.test(FN), "not using the shared grid");
}

console.log(`\n=== commander picker: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
