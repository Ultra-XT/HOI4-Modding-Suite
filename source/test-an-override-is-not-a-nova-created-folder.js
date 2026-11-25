// ⛔ #custom-folder-claims-a-base-tab — AN OVERRIDE IS NOT A CREATION, AND CONFUSING THE TWO INVERTS A
// SAFETY GUARD.
//
// Nova writes into common/technology_tags/zz_nova_custom_folders.txt for TWO different reasons:
//   1. creating a genuinely new research tab, and
//   2. OVERRIDING a base-game or base-mod folder to change its icon or its ledger — a real feature, because
//      a mod entry in technology_folders replaces the base definition, so the override copies the base block
//      and changes only what was asked for (#vanilla-folder-redefined, #folder-ledger-not-updated).
//
// getNovaCreatedTechFolders returned every key in that file, so case 2 looked exactly like case 1. That does
// not merely weaken the guard in syncCustomFolderGridboxes — it INVERTS it. The guard exists so a base tab is
// never relayouted, because doing so rewrites every base technology's folder.position and, in its own words,
// "silently wrecks that tab in-game"; it is the recorded root-cause fix for "saving ruined the electronics
// tree". Once the folder appeared in this list the guard reported the tab as Nova's and authorised precisely
// the rewrite it was written to prevent — and create-custom-folder calls that sync itself.
//
// Measured before the fix: POST create-custom-folder with `infantry_folder` returned 200 and
// getNovaCreatedTechFolders answered ["probe_scratch_folder","infantry_folder"].
//
// ⭐ FIXED AT THE READER, NOT THE ENDPOINT — and the first attempt got that wrong. Refusing the key at
// create-custom-folder broke the override feature outright; test-sprite-prefix-and-vanilla-folder.js and
// test-folder-ledger-nested-block.js both failed, and both were right. Fixing the reader also means the
// danger cannot flow through a list any caller can poison, and a mod whose file ALREADY carries such an entry
// is repaired on the next read instead of staying broken.
//
// ⛔ SCRATCH MODS IN TEMP ONLY. This endpoint writes into whatever mod root it is given.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53534;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-override-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const srv = require("./server.js");
const { createApp, getNovaCreatedTechFolders } = srv;
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-override-mod-"));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Override Probe"\nsupported_version="1.16.*"\n', "utf8");

// DERIVED: base-game folder keys read from the install, never typed into this test.
function baseFolderKeys() {
  const dir = path.join(GAME, "common", "technology_tags");
  const keys = new Set();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return keys; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    t = t.replace(/#[^\n]*/g, "");
    const m = /technology_folders\s*=\s*\{/.exec(t);
    if (!m) continue;
    const open = t.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let j = open; j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (!d) { close = j; break; } } }
    if (close === -1) continue;
    const body = t.slice(open + 1, close);
    const re = /([A-Za-z0-9_]+)\s*=\s*\{/g;
    let mm;
    while ((mm = re.exec(body))) {
      keys.add(mm[1]);
      let o2 = body.indexOf("{", mm.index), dd = 0, c2 = -1;
      for (let j = o2; j < body.length; j++) { if (body[j] === "{") dd++; else if (body[j] === "}") { dd--; if (!dd) { c2 = j; break; } } }
      if (c2 === -1) break;
      re.lastIndex = c2 + 1;
    }
  }
  return keys;
}

(async () => {
  let server;
  try {
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

    console.log("1. The reader excludes folders something else already defines");
    rec("getNovaCreatedTechFolders filters the raw file keys",
      /return keys\.filter\(\(k\) => !owned\.has\(k\)\)/.test(SERVER));
    rec("…against the base game AND dependencies",
      /\[modRoot, \.\.\.\(resolveModDependencyRoots\(modRoot\) \|\| \[\]\), resolveHoi4GameRoot\(\)\]/.test(SERVER),
      "a dependency's tab is exactly as fatal to relayout as vanilla's");
    rec("…and against the mod's OTHER technology_tags files",
      /zz_nova_custom_folders\.txt"\) continue;/.test(SERVER),
      "Nova writes only that one file, so a definition elsewhere in the mod is not Nova's either");
    // ⚠️ If the mod-root comparison ever failed, Nova's own register would count as prior ownership, the
    // list would come back EMPTY, and custom-tab layout would silently stop working everywhere.
    rec("the mod-root comparison is normalised", /const modKey = norm\(modRoot\)/.test(SERVER),
      "an unnormalised compare would empty the list and disable custom-tab layout");

    console.log("\n2. Runtime, against the real install");
    if (!fs.existsSync(path.join(GAME, "common", "technology_tags"))) {
      rec("a vanilla install to take folder keys from", false, "cannot run the probe");
    } else {
      const base = baseFolderKeys();
      rec("the base game defines folders to override", base.size > 5,
        `${base.size}, e.g. ${[...base].slice(0, 4).join(", ")}`);

      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const create = async (folderKey) => {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderKey, ledger: "army", modPath: MOD, name: "Probe" }),
        });
        return { status: r.status, body: await r.json() };
      };

      // ⭐ CONTROL: a genuinely new tab must still be created AND still be claimed, or the guard has simply
      // been turned off and custom tabs stop being laid out.
      const ok = await create("probe_scratch_folder");
      rec("a new tab is created", ok.status === 200 && ok.body.ok === true, ok.status);
      rec("…and IS claimed as Nova's", (getNovaCreatedTechFolders(MOD) || []).includes("probe_scratch_folder"),
        "without this, Nova would stop laying out the tabs it makes");

      // The override must still be ACCEPTED — it is how a base tab's icon and ledger are changed.
      const tryKeys = [...base].filter((k) => /^[a-z_][a-z0-9_]*$/.test(k)).slice(0, 4);
      rec("there are base keys to override", tryKeys.length >= 2, tryKeys);
      for (const k of tryKeys) {
        const r = await create(k);
        rec(`overriding "${k}" is still allowed`, r.status === 200 && r.body.ok === true,
          `${r.status} ${String(r.body.error || "").slice(0, 70)}`);
      }
      // …and the entry really is written, or the icon/ledger override would be a no-op.
      const raw = fs.readFileSync(path.join(MOD, "common", "technology_tags", "zz_nova_custom_folders.txt"), "utf8");
      rec("the override entry is written to the file", tryKeys.every((k) => new RegExp(`\\b${k}\\s*=\\s*\\{`).test(raw)),
        "the override is the whole point — it must land on disk");

      console.log("\n3. ⛔ …but none of them is claimed as Nova-created");
      const reg = getNovaCreatedTechFolders(MOD) || [];
      const claimed = tryKeys.filter((k) => reg.includes(k));
      rec("no base folder is reported as Nova's", claimed.length === 0, claimed);
      rec("…while the genuinely new tab still is", reg.includes("probe_scratch_folder"), reg);
      rec("…and it is the ONLY one", reg.length === 1, reg);

      console.log("\n4. What that decides, composed");
      // syncCustomFolderGridboxes bails unless getNovaCreatedTechFolders lists the folder. Run that decision
      // over the poisoned list the old reader produced and over the real one.
      const wouldRelayout = (registry, folder) => registry.includes(folder);
      const POISONED = ["probe_scratch_folder", ...tryKeys];
      rec("the old list would have PERMITTED relayouting a base tab",
        wouldRelayout(POISONED, tryKeys[0]) === true,
        "this is the state the file is still in on disk — the fix is in how it is READ");
      rec("…the real list refuses", wouldRelayout(reg, tryKeys[0]) === false);
      rec("…and still permits Nova's own tab", wouldRelayout(reg, "probe_scratch_folder") === true);
      // The repair applies to a file already written by an older build — that is why this is fixed at the
      // reader. The raw file above still contains the base keys, and the answer is still clean.
      rec("a file already carrying base keys is repaired on read",
        tryKeys.every((k) => new RegExp(`\\b${k}\\s*=\\s*\\{`).test(raw)) && claimed.length === 0,
        "on disk yes, in the answer no");
    }

    console.log(`\n=== an override is not a Nova-created folder: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    // Only the scratch fixtures this test made, both under the OS temp dir.
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
  }
})();
