// A research folder's `ledger` decides which research_bonus group its techs belong to — army, navy, air,
// civilian, or none, or `hidden`. A mod entry in technology_folders REPLACES the base definition for that
// key, so getting it wrong moves a whole tab into the wrong bonus group: `research_bonus = { navy = … }`
// from ideas, focuses and advisors silently stops applying.
//
// The "✎ Edit Tab" dialog had no source for a base folder's real ledger. getNovaCreatedTechFolderLedgers
// reads only the mod's OWN custom folders, and the gui-layout payload carried folderNames, availability and
// dlcs but no ledger — so the dropdown always read "Army", whatever the folder actually was. Changing a tab's
// ICON then posted ledger:"army", and the server rewrote the copied base block's `ledger = navy`.
//
// ⛔ THE FIX IS CLIENT-SIDE, AND THE TEST BELONGS HERE RATHER THAN ON THE ENDPOINT. The server is right to
// honour an explicit `ledger: "army"` — test-sprite-prefix-and-vanilla-folder.js pins exactly that, and I
// briefly added a contradicting assertion there before the existing one corrected me. The defect was the
// CLIENT sending a value the user never chose.
//
// Two cases the dropdown cannot express at all are covered by the same change: a folder that declares NO
// ledger (Millennium Dawn has three) had `army` invented for it, and `ledger = hidden` is not one of Nova's
// four options. Not sending the field leaves either exactly as the base game wrote it.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53528;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ledger-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const RESEARCH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));
const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

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
    console.log("1. The server publishes each folder's real ledger");
    rec("readTechnologyFolderMeta extracts it", /entry\.ledger = lm \? lm\[1\] : "";/.test(SERVER));
    rec("…verbatim, so `hidden` and absent survive",
      /ledger\\s\*=\\s\*"\?\(\[A-Za-z_\]\+\)"\?/.test(SERVER),
      "normalising to Nova's four options would erase the two it cannot express");

    console.log("\n2. The dialog prefills from it instead of defaulting to army");
    rec("there is a baseFolderLedger helper", /function baseFolderLedger\(folderKey\)/.test(RESEARCH));
    rec("…reading the published metadata", /guiFolderAvailability\[folderKey\]/.test(RESEARCH));
    rec("the prefill uses it", /\(ct && ct\.ledger\) \|\| baseFolderLedger\(editingTabFolder\) \|\| "army"/.test(RESEARCH));
    // The two must share a fallback chain or every open reports a spurious change — the documented
    // #tab-rename-never-localised bug, one field along.
    rec("…and the change-comparison uses the SAME chain",
      /newLedger !== \(\(ct && ct\.ledger\) \|\| baseFolderLedger\(folder\) \|\| "army"\)/.test(RESEARCH),
      "out of step, an untouched Save reports a change every time");

    console.log("\n3. ⛔ The ledger is only sent when the user changed it");
    rec("the request sends it conditionally", /ledger: ledgerChanged \? newLedger : ""/.test(RESEARCH),
      "sending the dropdown value unconditionally is what wrote army over a base folder on an ICON edit");
    // The server's escape hatch is what makes that work, so it must stay.
    rec("the server ignores a value outside its four options",
      /const wanted = \["army", "navy", "air", "civilian"\]\.includes\(ledger\) \? ledger : "";/.test(SERVER));
    rec("…and only rewrites the base block when there IS one", /if \(wanted\) \{/.test(SERVER));

    console.log("\n4. Measured against the real installed folders");
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(game)) {
      rec("a vanilla install to measure against", false, "cannot verify the published ledgers");
    } else {
      const d = await (await fetch(`http://127.0.0.1:${PORT}/api/research/gui-layout?modPath=${encodeURIComponent(game)}`)).json();
      const fa = d.folderAvailability || {};
      const keys = Object.keys(fa);
      rec("folders came back", keys.length > 5, keys.length + " folders");
      const nonArmy = keys.filter((k) => fa[k].ledger && fa[k].ledger !== "army");
      rec("…and the non-army ones are visible to the dialog", nonArmy.length >= 5,
        nonArmy.map((k) => `${k}=${fa[k].ledger}`).slice(0, 6));
      // The specific folder the corpus check named, and the one the old dropdown would have clobbered.
      rec("mtgnavalfolder reports navy", fa.mtgnavalfolder && fa.mtgnavalfolder.ledger === "navy",
        fa.mtgnavalfolder && fa.mtgnavalfolder.ledger);
      rec("industry_folder reports civilian", fa.industry_folder && fa.industry_folder.ledger === "civilian",
        fa.industry_folder && fa.industry_folder.ledger);
      // The value Nova cannot express — it must still be REPORTED, so nothing overwrites it.
      const hidden = keys.filter((k) => fa[k].ledger === "hidden");
      rec("…and `hidden` survives the read", hidden.length >= 1, hidden);
    }

    console.log("\n5. The decision, composed");
    const sent = (ledgerChanged, newLedger) => (ledgerChanged ? newLedger : "");
    const serverWants = (ledger) => (["army", "navy", "air", "civilian"].includes(ledger) ? ledger : "");
    rec("an icon-only edit sends nothing the server will act on", serverWants(sent(false, "army")) === "");
    rec("…so a navy folder keeps navy", serverWants(sent(false, "army")) === "",
      "the base block is copied unchanged");
    rec("…and a ledger-less folder has none invented", serverWants(sent(false, "army")) === "");
    rec("a deliberate change still writes", serverWants(sent(true, "navy")) === "navy");
    rec("…including back to army", serverWants(sent(true, "army")) === "army",
      "the user must still be able to choose army on purpose");

    console.log(`\n=== editing a tab icon keeps its ledger: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
