// #loc-file-clobbered — "New focus tree from generic" deleted the modder's localisation.
//
// The endpoint carries the generic tree's focus names over to the new tree, and it named the file it wrote
// them into after the tree's own file name — which the modder types. It then wrote that file with a plain
// fs.writeFileSync, truncating whatever was already there.
//
// The collision is not exotic, it is the naming convention: vanilla's own focus trees are germany.txt,
// italy.txt, usa.txt, so a modder making a tree for Germany calls it germany.txt — and the country's
// localisation very often already lives in germany_l_english.yml. Naming the tree the obvious thing is what
// destroys the file. Nothing was backed up either (the raw write skipped safeModWrite), so it was gone.
//
// Measured before the fix: a germany_l_english.yml holding 4 of the modder's keys came back holding 2
// carried-over ones, with 0 of the originals left and no backup anywhere on disk.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-locclobber-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/national_focus", "localisation/english"].forEach((d) => fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LC"\nsupported_version="1.18.*"\n');

// A generic tree to copy, so the test does not depend on the game being installed.
fs.writeFileSync(path.join(MOD, "common", "national_focus", "generic.txt"),
  "focus_tree = {\n\tid = generic\n\tdefault = yes\n\tcountry = { factor = 1 }\n" +
  "\tfocus = {\n\t\tid = generic_one\n\t\ticon = GFX_focus_generic_treaty\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n}\n", "utf8");
// …with names, or there is nothing to carry over and the write never fires. (The first version of this
// probe missed the bug entirely for exactly that reason.)
fs.writeFileSync(path.join(MOD, "localisation", "english", "generic_focus_l_english.yml"),
  "﻿l_english:\n generic_one:0 \"Generic Focus One\"\n generic_one_desc:0 \"It does a thing.\"\n", "utf8");

// The modder's own work, sitting in the file the new tree is about to be named after.
const MINE_KEYS = ["GER_my_country", "GER_my_event", "GER_my_idea", "GER_my_focus"];
const MINE = "﻿l_english:\n GER_my_country:0 \"My Germany\"\n GER_my_event:0 \"A Careful Plan\"\n" +
  " GER_my_idea:0 \"Industrial Reform\"\n GER_my_focus:0 \"Rebuild The Fleet\"\n";
const MINE_ABS = path.join(MOD, "localisation", "english", "germany_l_english.yml");
fs.writeFileSync(MINE_ABS, MINE, "utf8");

const keysIn = (txt) => (txt.match(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"/gm) || []).map((s) => s.trim().split(":")[0]);

const PORT = 39689, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    const r = await post("/api/mod/copy-generic-focus-tree", { modPath: MOD, fileName: "germany" });
    ok("the new tree is created", r.s === 200 && r.b && r.b.ok, r.b);

    const after = fs.readFileSync(MINE_ABS, "utf8");
    const keys = keysIn(after);

    // The whole point: the modder's localisation is still there.
    MINE_KEYS.forEach((k) => ok(`the modder's ${k} survived`, after.includes(k + ":"), keys));
    ok("…with its value intact, not just its key", /GER_my_event:0 "A Careful Plan"/.test(after), after.slice(0, 200));

    // And the carried-over names actually landed, so this is not passing by simply not writing.
    ok("the copied tree's names were carried over", keys.some((k) => /^germany_/.test(k)), keys);

    // A key must appear once: HOI4 keeps only the LAST duplicate, so appending blindly leaves dead lines.
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    ok("no key is duplicated", dupes.length === 0, dupes);

    // Still a valid loc file — BOM first, header present exactly once.
    ok("the file still starts with the BOM", after.charCodeAt(0) === 0xfeff, after.charCodeAt(0));
    ok("…and has exactly one l_english: header", (after.match(/^﻿?l_english:/gm) || []).length === 1, after.slice(0, 60));

    // The raw write took no backup. safeModWrite does.
    const appData = process.platform === "win32" ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
      : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support")
      : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"));
    const NOVA_BACKUPS = path.join(appData, "NovaModdingSuite", "backups");
    let backed = false;
    try {
      backed = fs.readdirSync(NOVA_BACKUPS).some((f) => /germany_l_english/i.test(f) && /copy-generic-focus-tree/.test(f));
    } catch (_) {}
    ok("the file was backed up before it changed", backed, NOVA_BACKUPS);

    // Doing it again must replace those keys, not stack a second copy of each.
    await post("/api/mod/copy-generic-focus-tree", { modPath: MOD, fileName: "germany2" });
    const second = await post("/api/mod/copy-generic-focus-tree", { modPath: MOD, fileName: "germany3" });
    ok("a repeat run still succeeds", second.s === 200, second.b);
    const later = keysIn(fs.readFileSync(MINE_ABS, "utf8"));
    ok("…and the modder's keys are STILL all there", MINE_KEYS.every((k) => later.includes(k)), later);
    ok("…still with no duplicates", later.filter((k, i) => later.indexOf(k) !== i).length === 0, later);

    console.log("\ntest-loc-file-not-clobbered: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
