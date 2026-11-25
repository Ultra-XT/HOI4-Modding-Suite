// #startup-toggle-grows-a-blank-line — toggling a startup item ON then OFF must leave the country history
// exactly as it was found. It did not: on a file containing a dated block, every spirit ON->OFF cycle left one
// extra blank line behind, so the file grew without bound as the user clicked owner chips on and off.
//
// insertNewIdeasBlock writes `add_ideas = {…}\n\n` — the block's own line terminator plus a blank line
// separating it from the date block below. The removal path stripped only the terminator. Countries with NO
// dated block never showed it, because the insert takes a different branch there; that is why this test pins
// the WITH-a-dated-block shape specifically.
//
// All four item types are exercised, because the toggle UI drives them through one endpoint and a regression
// in any of them looks identical to the user.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-startup-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "startupmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="StartupMod"\nsupported_version="1.18.*"\n', "utf8");

// The shape that drifts: a country history with a DATED block. Countries without one were already idempotent.
const HIST = path.join(MOD, "history", "countries", "NUA - Nova Union.txt");
const ORIGINAL = [
  "capital = 1",
  "",
  "oob = \"NUA_1936\"",
  "",
  "set_politics = {",
  "\truling_party = neutrality",
  "\telections_allowed = no",
  "}",
  "",
  "1939.1.1 = {",
  "\tset_politics = {",
  "\t\truling_party = fascism",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(HIST, ORIGINAL, "utf8");

const PORT = 42225;
const app = createApp();
const server = app.listen(PORT, async () => {
  const toggle = async (itemType, itemId, active) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/set-startup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: "NUA", itemId, itemType, active }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(HIST, "utf8");

  try {
    const ITEMS = [
      ["spirit", "nua_deep_morale"],
      ["decision", "nua_test_decision"],
      ["character", "nua_test_character"],
      ["event", "nua_ns.1"],
    ];

    for (const [itemType, itemId] of ITEMS) {
      console.log(`\n[${itemType}] five ON/OFF cycles leave the file byte-identical`);
      fs.writeFileSync(HIST, ORIGINAL, "utf8");
      const before = read();

      const on = await toggle(itemType, itemId, true);
      rec(`ON succeeded`, on.body && on.body.ok === true, on.body);
      const withItem = read();
      rec(`…and the item is actually in the file`, withItem.includes(itemId), withItem);
      rec(`…and the dated block survived`, /1939\.1\.1\s*=\s*\{/.test(withItem), withItem);

      const off = await toggle(itemType, itemId, false);
      rec(`OFF succeeded`, off.body && off.body.ok === true, off.body);
      rec(`…and the item is gone`, !read().includes(itemId), read());

      for (let i = 0; i < 4; i++) {
        await toggle(itemType, itemId, true);
        await toggle(itemType, itemId, false);
      }
      const after = read();
      rec(`5 cycles left the line count unchanged`,
        after.split(/\r?\n/).length === before.split(/\r?\n/).length,
        { before: before.split(/\r?\n/).length, after: after.split(/\r?\n/).length });
      rec(`…and no run of 3+ blank lines appeared`, !/\r?\n[ \t]*\r?\n[ \t]*\r?\n/.test(after),
        JSON.stringify(after.slice(-160)));
      rec(`…and the file is byte-identical to the original`, after === before,
        { beforeLen: before.length, afterLen: after.length, tail: JSON.stringify(after.slice(-120)) });
    }

    console.log("\n[hand-authored, no blank line] removal must not eat the next line");
    {
      // The remove now takes back a following blank line — it must only do that when one is really there,
      // or a block a modder wrote with no separator would swallow whatever follows it.
      const tight = [
        "capital = 1",
        "add_ideas = {",
        "\tnua_hand_written",
        "}",
        "1939.1.1 = {",
        "\tset_politics = { ruling_party = fascism }",
        "}",
        "",
      ].join("\n");
      fs.writeFileSync(HIST, tight, "utf8");
      const r = await toggle("spirit", "nua_hand_written", false);
      rec("the remove succeeded", r.body && r.body.ok === true, r.body);
      const after = read();
      rec("the spirit is gone", !after.includes("nua_hand_written"), after);
      rec("…and the empty add_ideas block went with it", !/add_ideas/.test(after), after);
      rec("…and the date block that followed it is INTACT", /1939\.1\.1\s*=\s*\{/.test(after), after);
      rec("…and so is the line above", /capital = 1/.test(after), after);
      rec("…and nothing got glued together", !/\}[ \t]*\S/.test(after), after);
    }

    console.log(`\n=== startup toggle idempotence: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
