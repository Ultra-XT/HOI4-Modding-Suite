// /api/research/folder-texts — parses a folder's in-game SECTION labels (non-year instantTextBoxType) and
// resolves their loc keys to display text. Proves: year labels are excluded, section labels are returned with
// name/key/position, and loc keys resolve when a matching .yml entry exists. Read-only (no gui writes).
// Run: node test-research-folder-texts.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

const GUI = `guiTypes = {
	containerWindowType = {
		name = "test_folder"
		containerWindowType = {
			name = "techtree_stripes"
			instantTextBoxType = { name = "test_subtitle_weapons" position = { x = 85 y = 105 } text = "TEST_TITLE_WEAPONS" }
			instantTextBoxType = { name = "test_subtitle_drones" position = { x = 85 y = 245 } text = "TEST_TITLE_DRONES" }
			instantTextBoxType = { name = "year_1936" position = { x = 10 y = 5 } text = "1936" }
			instantTextBoxType = { name = "test_subtitle_weapons_dup" position = { x = 85 y = 105 } text = "TEST_TITLE_WEAPONS" }
		}
	}
}
`;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ftext-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="FText"\n');
fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
fs.writeFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), GUI);
fs.mkdirSync(path.join(mod, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(mod, "localisation", "english", "test_l_english.yml"),
  "﻿l_english:\n TEST_TITLE_WEAPONS:0 \"Small Arms\"\n TEST_TITLE_DRONES:0 \"Recon Drones\"\n");

const server = http.createServer(createApp());
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  http.get({ host: "127.0.0.1", port, path: `/api/research/folder-texts?modPath=${encodeURIComponent(mod)}&folder=test_folder` }, (r) => {
    let o = ""; r.on("data", c => o += c); r.on("end", () => {
      try {
        const j = JSON.parse(o);
        ok("responds ok", j.ok === true, j);
        const labels = j.labels || [];
        ok("returns exactly 2 section labels (year excluded, dup deduped)", labels.length === 2, labels.map(l => l.name));
        const weap = labels.find(l => l.name === "test_subtitle_weapons");
        ok("weapons label present w/ key + position", !!weap && weap.key === "TEST_TITLE_WEAPONS" && weap.x === 85 && weap.y === 105, weap);
        ok("weapons loc resolved to 'Small Arms'", weap && weap.display === "Small Arms", weap && weap.display);
        const drones = labels.find(l => l.name === "test_subtitle_drones");
        ok("drones loc resolved to 'Recon Drones'", drones && drones.display === "Recon Drones", drones && drones.display);
        ok("no year label leaked in", !labels.some(l => l.key === "1936"));
      } catch (e) { fail++; console.log("  FAIL parse →", e.message, o.slice(0, 200)); }
      finally {
        server.close();
        try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
        console.log(`\nRESEARCH-FOLDER-TEXTS: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
      }
    });
  });
});
