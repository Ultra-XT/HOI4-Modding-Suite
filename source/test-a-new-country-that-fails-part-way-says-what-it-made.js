// ⛔ #a-new-country-that-fails-part-way-says-what-it-made (tool campaign B2-26).
//
// ✨ New country with one claimed state whose file cannot be written (read-only, or held open by another program): writeStateOwner
// THREW, the throw left createCountry's owner loop, and the route answered 400 "… Nothing was changed …" after the tag, the country
// file, its history, colors.txt and every state before that one had been written — while the name, the name pool and the flags the
// route writes afterwards never were, and the retry the message asked for was refused ("Country tag … already exists").
// createCountry now catches per state, as restoreCountry does: it answers ok with `failedStates: [{ id, error }]` and a `warning`
// that names them, so the route finishes the country.
// Run: node test-a-new-country-that-fails-part-way-says-what-it-made.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const state = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} add_core_of = ${owner} }\n}\n`;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newcountry-partway-"));
const ro = path.join(mod, "history", "states", "3-S3.txt");
try {
  console.log("=== 1. one claimed state cannot be written: the country is still made, and the answer names the state ===");
  mk(path.join(mod, "descriptor.mod"), 'name="NC"\nreplace_path="history/states"\n');
  mk(path.join(mod, "history", "states", "1-S1.txt"), state(1, "AAA", "1"));
  mk(path.join(mod, "history", "states", "2-S2.txt"), state(2, "AAA", "2"));
  mk(ro, state(3, "AAA", "3"));
  mk(path.join(mod, "history", "countries", "AAA - Aland.txt"), "capital = 1\n");
  fs.chmodSync(ro, 0o444);
  let threw = null, r = null;
  try { r = md.createCountry({ modRoot: mod, tag: "ZQD", name: "Probeland", rgb: [85, 34, 170], stateIds: [2, 3], capitalStateId: 2 }); }
  catch (e) { threw = e; }
  ok("createCountry does not throw when one state cannot be written", !threw, threw && threw.message);
  ok("it answers ok", r && r.ok === true, r);
  ok("failedStates names state 3 with the write's reason", r && Array.isArray(r.failedStates) && r.failedStates.length === 1 && r.failedStates[0].id === 3 && /read-only|in use|write/i.test(r.failedStates[0].error), r && r.failedStates);
  // (review) the write error says "Nothing was changed." of that one file; the create changed the tag, the country file, its history and
  // state 2, so no part of the answer may pass that sentence on (B2-26's own fix direction)
  ok("…and no failedStates entry says \"Nothing was changed\"", r && r.failedStates.every((f) => !/Nothing was changed/i.test(f.error)), r && r.failedStates);
  ok("the state it could write is the new country's", r && r.owned === 1 && /owner\s*=\s*ZQD/.test(fs.readFileSync(path.join(mod, "history", "states", "2-S2.txt"), "utf8")));
  ok("the state it could not write is untouched", /owner\s*=\s*AAA/.test(fs.readFileSync(ro, "utf8")));
  ok("the warning says the country was made and names the state and the next step",
    r && typeof r.warning === "string" && /ZQD was made/.test(r.warning) && /state 3/.test(r.warning) && /Paint/.test(r.warning) && !/Nothing was changed/.test(r.warning), r && r.warning);
  // (review) 🖌 Paint owner sets the owner only — /api/map/set-owner calls writeStateOwner without alsoCore — while the create cores every
  // state it takes, so the next step names the core too, or following it leaves the state owned and uncored
  ok("…and the next step gives the core as well, as the create does", r && /add ZQD to its Cores in the state panel/.test(r.warning), r && r.warning);
  ok("the tag, the country file and its history were written (the route goes on to name it)",
    fs.readdirSync(path.join(mod, "common", "country_tags")).length > 0 && fs.existsSync(path.join(mod, "history", "countries", "ZQD - Probeland.txt")));

  console.log("=== 1b. the capital is the state it could not take: the warning says so ===");
  fs.chmodSync(ro, 0o666);
  mk(path.join(mod, "history", "states", "4-S4.txt"), state(4, "AAA", "4"));
  mk(path.join(mod, "history", "states", "5-S5.txt"), state(5, "AAA", "5"));
  const ro5 = path.join(mod, "history", "states", "5-S5.txt");
  fs.chmodSync(ro5, 0o444);
  let r2 = null;
  try { r2 = md.createCountry({ modRoot: mod, tag: "ZQE", name: "Probeland E", rgb: [10, 34, 170], stateIds: [4, 5], capitalStateId: 5 }); } finally { fs.chmodSync(ro5, 0o666); }
  ok("ok, with the capital in failedStates and named as the capital in the warning", r2 && r2.ok && r2.failedStates.some((f) => f.id === 5) && /its capital, state 5/.test(r2.warning), r2 && r2.warning);

  console.log("=== 1c. (review) the colours file cannot be written: the create is still finished, and says so ===");
  // step 4 wrote colors.txt with no catch, after the tag, the country file and its history: a read-only colors.txt (a copy of a Workshop
  // mod keeps the attribute) threw "… Nothing was changed …" over a half-made country, and its state was never given
  const colors = path.join(mod, "common", "countries", "colors.txt");
  ok("the creates above wrote the mod's colors.txt", fs.existsSync(colors));
  fs.chmodSync(colors, 0o444);
  mk(path.join(mod, "history", "states", "6-S6.txt"), state(6, "AAA", "6"));
  let r4 = null, threw4 = null;
  try { r4 = md.createCountry({ modRoot: mod, tag: "ZQG", name: "Probeland G", rgb: [12, 34, 56], stateIds: [6], capitalStateId: 6 }); }
  catch (e) { threw4 = e; }
  finally { fs.chmodSync(colors, 0o666); }
  ok("createCountry does not throw when colors.txt cannot be written", !threw4, threw4 && threw4.message);
  ok("it answers ok, gives the state, and names what it could not write", r4 && r4.ok === true && r4.owned === 1 && typeof r4.colorError === "string"
    && /owner\s*=\s*ZQG/.test(fs.readFileSync(path.join(mod, "history", "states", "6-S6.txt"), "utf8")), r4);
  ok("the warning names colors.txt and the 🎨 Colour step, and claims nothing unchanged", r4 && /ZQG was made/.test(r4.warning)
    && /colors\.txt/.test(r4.warning) && /🎨 Colour/.test(r4.warning) && !/Nothing was changed/i.test(r4.warning + r4.colorError), r4 && r4.warning);

  console.log("=== 2. a create with nothing failing says nothing extra ===");
  const r3 = md.createCountry({ modRoot: mod, tag: "ZQF", name: "Probeland F", rgb: [10, 34, 17], stateIds: [1], capitalStateId: 1 });
  ok("no failedStates, no warning", r3 && r3.ok && Array.isArray(r3.failedStates) && r3.failedStates.length === 0 && !("warning" in r3), r3);

  console.log("=== 3. the owner loop catches per state (source, comments masked) ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const masked = maskJsComments(src);
  const at = masked.indexOf("function createCountry(");
  ok("createCountry found once", at > 0 && masked.indexOf("function createCountry(", at + 1) === -1);
  const span = jsBodyAt(masked, at);
  const body = masked.slice(span[0], span[1] + 1);
  ok("its writeStateOwner call sits in a try whose catch records the state in failedStates",
    /try\s*\{\s*r\s*=\s*writeStateOwner\(/.test(body) && /catch\s*\(e\)\s*\{\s*failedStates\.push\(\{\s*id:\s*sid/.test(body));
  console.log(`\ntest-a-new-country-that-fails-part-way-says-what-it-made: ${pass} checks passed`);
} finally {
  try { fs.chmodSync(ro, 0o666); } catch (_) { /* gone */ }
  try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) { /* a temp fixture of this test's own */ }
}
