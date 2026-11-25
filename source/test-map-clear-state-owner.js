// #owner-none-never-cleared — THE STATE PANEL OFFERS "— none —" AND NOTHING EVER WROTE THE REMOVAL.
//
// setStateFieldsInBlock skipped `owner` whenever the value was empty, because for every caller "" has always
// meant "leave this field alone". So there was no way at all to un-own a state: the API answered
// {ok:true, changed:false} and the panel — which clears its own copy optimistically — showed the state as
// unowned until a reload put the owner back.
//
// The fix does NOT re-read "" as a removal. That would let any future caller which merely omits a value
// strip a state's owner, and this codebase has been bitten by exactly that class of accident before. The
// panel states the intent instead, with clearOwner, and "" keeps meaning nothing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-clrown-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

const MOD = path.join(ROOT, "clrownmod");
["map", "history/states"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'name="ClrOwnMod"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n', "utf8");
fs.writeFileSync(path.join(MOD, "map", "definition.csv"),
  "1;10;0;0;land;true;plains;1\n2;20;0;0;land;false;plains;1\n", "utf8");
fs.writeFileSync(path.join(MOD, "map", "adjacencies.csv"),
  "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;;-1;-1;-1;-1;-1;;\n", "utf8");

const SFILE = path.join(MOD, "history", "states", "1-Probe.txt");
const writeState = (body) => fs.writeFileSync(SFILE, body, "utf8");
const stateText = () => { try { return fs.readFileSync(SFILE, "utf8"); } catch (_) { return ""; } };
const ownerOf = () => (/(^|[^A-Za-z0-9_])owner\s*=\s*([A-Za-z0-9_]+)/.exec(stateText()) || [])[2] || "";

writeState("state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tprovinces = { 1 2 }\n" +
  "\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n\t}\n}\n");

const PORT = 42517;
const app = createApp();
const server = app.listen(PORT, async () => {
  const setState = (fields) => fetch(`http://127.0.0.1:${PORT}/api/map/set-state`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, stateId: 1, fields }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[control] setting a real owner still works");
    // FIRST, so a guard that simply refuses every owner write cannot pass this file.
    rec("the state starts owned by AAA", ownerOf() === "AAA", stateText());
    let r = await setState({ owner: "BBB" });
    rec("setting an owner succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and landed on disk", ownerOf() === "BBB", stateText());

    console.log("\n[control] an omitted owner still means 'leave it alone'");
    // This is the meaning the fix deliberately preserves — clearing had to be signalled, not inferred.
    r = await setState({ manpower: "2500" });
    rec("a save that omits owner succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and did NOT strip the owner", ownerOf() === "BBB", stateText());
    r = await setState({ owner: "" });
    rec("an EMPTY owner with no intent flag also leaves it alone", ownerOf() === "BBB", stateText());

    console.log("\n[the bug] '— none —' must actually remove the owner");
    r = await setState({ owner: "", clearOwner: true });
    rec("the clear was accepted", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and reported as a change, not a silent no-op", r.b && r.b.changed !== false, r.b);
    rec("the owner line is GONE from disk", ownerOf() === "", stateText());
    rec("…and the file is still brace-balanced",
      (stateText().match(/\{/g) || []).length === (stateText().match(/\}/g) || []).length,
      { open: (stateText().match(/\{/g) || []).length, close: (stateText().match(/\}/g) || []).length });
    // Cores are edited separately by the panel; clearing an owner must not touch them.
    rec("…and add_core_of was left alone", /add_core_of\s*=\s*AAA/.test(stateText()), stateText());
    rec("…and the rest of the state survived", /manpower\s*=\s*2500/.test(stateText()) && /provinces\s*=\s*\{\s*1\s+2\s*\}/.test(stateText()), stateText());

    console.log("\n[a compact one-line state block must not lose its braces]");
    // The removal consumes the whole LINE. A `[^\n]*` form would eat the closing braces of a block written
    // on one line, which is why the regex is anchored the way it is.
    writeState("state = { id = 1 name = \"STATE_1\" manpower = 100 provinces = { 1 2 } history = { owner = CCC } }\n");
    r = await setState({ owner: "", clearOwner: true });
    rec("the compact block was accepted", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…its owner is gone", ownerOf() === "", stateText());
    rec("…and it is still brace-balanced",
      (stateText().match(/\{/g) || []).length === (stateText().match(/\}/g) || []).length, stateText());
    rec("…and still parses as a state with its id", /id\s*=\s*1/.test(stateText()), stateText());

    console.log(`\n=== map clear state owner: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
