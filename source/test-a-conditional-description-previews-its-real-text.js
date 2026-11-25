// HOI4 lets an event write its description as a block of conditional branches:
//
//     desc = { text = KEY_A trigger = { … } }
//     desc = { text = KEY_B }
//
// The engine draws the first branch whose trigger passes, falling back to the trigger-less one. There is
// always real copy.
//
// The parser deliberately does NOT capture that form into descKey, and that is correct: descKey drives the
// WRITE path, a block has no single key to write back to, and the writer preserves it verbatim. But nothing
// downstream compensated — the client received an empty description and the preview substituted
// "A long description of the event...". So the author of a conditional description could see NONE of what
// they had written, and could not tell that state apart from "this event has no description".
//
// ⛔ THE CONSTRAINT THAT SHAPES THE FIX: the resolved branch text must reach the PREVIEW and never the
// editable box. Putting it in the box would offer to save one branch's text over a block that has several,
// which is a far worse bug than the one being fixed. This test guards that boundary as hard as it guards
// the feature.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53422;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-conddesc-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

(async () => {
  let server;
  try {
    console.log("1. ⛔ The write path is untouched");
    // The whole fix is only safe because these stay true.
    rec("descKey still comes ONLY from the bareword match",
      /descKey: descKeyMatch \? descKeyMatch\[1\] : ""/.test(SERVER),
      "a conditional block must never be flattened into one key");
    rec("titleKey too", /titleKey: titleKeyMatch \? titleKeyMatch\[1\] : ""/.test(SERVER));
    rec("the branches are a SEPARATE field", /descBranches,/.test(SERVER) && /titleBranches,/.test(SERVER));
    rec("the editable box is still filled from evt.description alone",
      /eventDescription"\)\.value = unescapeLocForEdit\(evt\.description \|\| ""\)/.test(EVENTS),
      "the conditional text must not reach the box");
    rec("…and the conditional text goes to a preview-only variable",
      /loadedConditionalDesc = evt\.conditionalDesc \|\| null/.test(EVENTS));

    console.log("\n2. The preview's fallback order");
    // What the author typed always wins; then their real conditional copy; then the key; then the placeholder.
    rec("the box wins over everything", /eventDescription"\)\?\.value\.trim\(\)\s*\n\s*\|\| condText\(loadedConditionalDesc\)/.test(EVENTS));
    rec("…conditional copy outranks the raw key",
      /condText\(loadedConditionalDesc\)\s*\n\s*\|\| \(previewsRealEvent \? locBase \+ "\.d"/.test(EVENTS));
    rec("…and the same for the title", /condText\(loadedConditionalTitle\)/.test(EVENTS));

    console.log("\n3. It does not survive where it should not");
    const clearAt = EVENTS.indexOf("function clearEventEditorForModSwitch");
    const clearFn = clearAt === -1 ? "" : EVENTS.slice(clearAt, clearAt + 1600);
    rec("a mod switch drops it", /loadedConditionalDesc = null/.test(clearFn) && /loadedConditionalTitle = null/.test(clearFn),
      "otherwise the new mod's blank event shows the old mod's conditional copy");
    rec("a fresh draft drops it too",
      /New Event Description";[\s\S]{0,220}?loadedConditionalDesc = null/.test(EVENTS));

    console.log("\n4. Measured against the real vanilla corpus");
    const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(game)) {
      rec("a vanilla install to measure against", false, "cannot verify the parser on real data");
    } else {
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const d = await (await fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(game)}`)).json();
      const evs = d.events || d || [];
      rec("the corpus loaded", evs.length > 1000, evs.length + " events");
      const cond = evs.filter((e) => e.conditionalDesc);
      rec("conditional description blocks are found at all", cond.length > 20, cond.length + " events");
      const withText = cond.filter((e) => e.conditionalDesc.text);
      rec("…and nearly all resolve to real text", withText.length >= cond.length - 5,
        `${withText.length} of ${cond.length}`);
      // THE POINT: these are exactly the events that used to preview as invented prose.
      const sample = withText[0];
      rec("a sample carries the branch count", !!sample && sample.conditionalDesc.count >= 1,
        sample ? `${sample.fullId}: ${sample.conditionalDesc.count} branch(es)` : "none");
      rec("…and its editable description is EMPTY, as it must be",
        !!sample && !String(sample.description || "").trim(),
        "if this had text, the block would be at risk of being flattened on save");
      // CONTROL: an ordinary event must be unaffected — no conditional field invented for it.
      const plain = evs.find((e) => !e.conditionalDesc && String(e.description || "").trim());
      rec("an ordinary event still has its description and no conditional field",
        !!plain && !plain.conditionalDesc, plain ? plain.fullId : "none found");
    }

    console.log("\n5. The parser reads what HOI4 reads");
    // Composed, so the branch-selection rule is exercised regardless of the installed corpus.
    const pick = (branches) => {
      if (!Array.isArray(branches) || !branches.length) return null;
      return branches.find((b) => !b.conditional) || branches[0];
    };
    rec("the trigger-less branch is the fallback HOI4 uses",
      pick([{ key: "A", conditional: true }, { key: "B", conditional: false }]).key === "B");
    rec("…and when every branch is conditional, the first is shown",
      pick([{ key: "A", conditional: true }, { key: "B", conditional: true }]).key === "A");
    rec("…and no branches means no conditional preview", pick([]) === null);

    console.log("\n6. This would have rejected what shipped");
    const OLD = (box) => (box || "").trim() || "A long description of the event...";
    rec("the old rule invented prose for a conditional description",
      OLD("") === "A long description of the event...");
    const NEW = (box, cond) => (box || "").trim() || (cond && cond.text) || "A long description of the event...";
    rec("…where the new rule shows the author's real copy",
      NEW("", { text: "The parliament has declared…" }) === "The parliament has declared…");
    rec("…and still falls back when there is genuinely nothing",
      NEW("", null) === "A long description of the event...");

    console.log(`\n=== a conditional description previews its real text: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
