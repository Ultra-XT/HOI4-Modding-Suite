// A research tab Nova created (registered in common/technology_tags/zz_nova_custom_folders.txt by
// create-custom-folder) must RELOAD as its own custom tab — even before "Save Changes" writes
// editor_custom_tabs.json. Before the fix, /api/technologies/catalog built customTabs only from
// editor_custom_tabs.json, so a freshly-created tab vanished on reload while its folder def/gui/sprite lived
// on in the mod (an orphaned half-save). Run: node test-research-created-tab-persists.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ctab-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="CTab"\n');
// Simulate create-custom-folder's registration: the folder in zz_nova_custom_folders.txt + its display-name loc.
fs.mkdirSync(path.join(mod, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(mod, "common", "technology_tags", "zz_nova_custom_folders.txt"),
  "technology_folders = {\n\tdrones_folder = {\n\t\tavailable = { always = yes }\n\t\tdoctrine = no\n\t}\n}\n");
fs.mkdirSync(path.join(mod, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(mod, "localisation", "english", "ctab_l_english.yml"),
  "﻿l_english:\n drones_folder:0 \"Drones\"\n");

const server = http.createServer(createApp());
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  http.get({ host: "127.0.0.1", port, path: `/api/technologies/catalog?modPath=${encodeURIComponent(mod)}` }, (r) => {
    let o = ""; r.on("data", c => o += c); r.on("end", () => {
      try {
        const j = JSON.parse(o);
        const tabs = j.customTabs || [];
        ok("catalog responded", r.statusCode === 200);
        const drones = tabs.find((t) => t && t.folder === "drones_folder");
        ok("created folder surfaces as a custom tab on reload", !!drones, tabs);
        ok("tab display name resolved from loc ('Drones')", drones && drones.name === "Drones", drones && drones.name);
        ok("tab has a stable key", !!(drones && drones.key));
      } catch (e) { fail++; console.log("  FAIL parse →", e.message, o.slice(0, 200)); }
      finally {
        server.close();
        try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
        console.log(`\nRESEARCH-CREATED-TAB-PERSISTS: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
      }
    });
  });
});
