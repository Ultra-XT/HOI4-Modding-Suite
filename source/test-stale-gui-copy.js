// #stale-gui-copy — A COPY OF A VANILLA FILE IS A SNAPSHOT, AND HOI4 REPLACES RATHER THAN MERGES.
//
// Nova copies the base game's interface/countrytechtreeview.gui into a mod the first time it has to write a
// gridbox, and never re-syncs it. Because a same-named file REPLACES the base one wholesale, that snapshot
// silently REMOVES whatever the base file gained afterwards. The 1.19.2 patch added four elements
// (leader_bonuses_header/_grid, support_category_multipliers_header/_grid) and every one of the 7 mods on
// this machine carrying a copy is missing exactly those four — they simply predate the patch.
//
// DETECT AND TELL, rather than re-sync. Re-syncing elements Nova did not author is measurably unsafe:
// Millennium Dawn deliberately removes 160 vanilla elements from its own copy, and restoring those would
// break its research screen. Only the author can tell a deliberate removal from a stale snapshot.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stalegui-"));
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

const BASE_GUI = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "interface", "countrytechtreeview.gui");

function makeMod(name, guiText) {
  const mod = path.join(ROOT, name);
  fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  if (guiText != null) fs.writeFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), guiText, "utf8");
  return mod;
}

const PORT = 42499;
const app = createApp();
const server = app.listen(PORT, async () => {
  const layout = async (mod) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/research/gui-layout?modPath=${encodeURIComponent(mod)}`);
    return r.json();
  };

  try {
    let baseText = "";
    try { baseText = fs.readFileSync(BASE_GUI, "utf8"); } catch (_) {}
    // Without the install this test measures nothing — say so rather than passing vacuously.
    rec("the base game's tech-tree gui was readable", baseText.length > 1000, baseText.length);

    console.log("\n[control] an IDENTICAL copy is not stale");
    // FIRST. A check that flags a byte-identical copy would flag every mod, always.
    const same = makeMod("gui_same", baseText);
    let d = await layout(same);
    rec("a byte-identical copy reports nothing stale", d.staleGuiCount === 0, d.staleGuiElements);

    console.log("\n[control] a mod with NO copy is not stale either");
    // It inherits the live base file, so there is nothing to go out of date.
    const none = makeMod("gui_none", null);
    d = await layout(none);
    rec("a mod without its own copy reports nothing stale", d.staleGuiCount === 0, d.staleGuiElements);

    console.log("\n[the bug] a copy missing an element the base file has");
    // Simulate the patch: delete two named elements from the mod's snapshot.
    const victims = [];
    let trimmed = baseText;
    for (const m of baseText.matchAll(/\bname\s*=\s*"([^"\r\n]+)"/g)) {
      if (victims.length < 2 && !victims.includes(m[1])) victims.push(m[1]);
    }
    for (const v of victims) trimmed = trimmed.split(`name = "${v}"`).join(`name = "${v}_nova_probe_renamed"`);
    const stale = makeMod("gui_stale", trimmed);
    d = await layout(stale);
    rec("the missing elements are reported", d.staleGuiCount >= victims.length, { count: d.staleGuiCount, victims });
    rec("…and named", victims.every((v) => (d.staleGuiElements || []).includes(v)), { got: d.staleGuiElements, victims });

    console.log("\n[it reports, it does not repair]");
    // The mod owns this file. A deliberate removal (MD removes 160) must survive untouched.
    const after = fs.readFileSync(path.join(stale, "interface", "countrytechtreeview.gui"), "utf8");
    rec("the mod's file was not rewritten", after === trimmed, "the gui was modified by a read");
    rec("…and the deliberately-removed names are still absent",
      victims.every((v) => !new RegExp(`name\\s*=\\s*"${v}"`).test(after)), after.slice(0, 200));

    console.log("\n[a mod that removes a lot is reported, not fixed]");
    // MD's shape: many deliberate removals. Nova must still only report.
    const gutted = makeMod("gui_gutted", baseText.split('name = "').slice(0, 12).join('name = "'));
    d = await layout(gutted);
    rec("a heavily-trimmed copy reports many stale names", d.staleGuiCount > 5, d.staleGuiCount);
    rec("…and the list is capped so a response cannot balloon", (d.staleGuiElements || []).length <= 40, (d.staleGuiElements || []).length);

    console.log(`\n=== stale gui copy: ${checks} checks, ${fails.length} failed ===`);
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
