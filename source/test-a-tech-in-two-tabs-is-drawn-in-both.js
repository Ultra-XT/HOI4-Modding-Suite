// #tech-in-two-tabs — HOI4 DRAWS A TECHNOLOGY IN EVERY `folder` BLOCK IT DECLARES. NOVA DREW IT IN ONE.
//
// Vanilla `radio` sits in electronics_folder at (-3,2) AND in support_folder at (11,9). `motorised_infantry`
// is in Infantry and Support. The other ten vanilla cases are DLC pairs — a tech placed in both
// bba_air_techs_folder and air_techs_folder, nsb_armour_folder and armour_folder, mtgnavalsupportfolder and
// naval_folder — where only one of the pair is ever shown, so the missing node is precisely what someone
// browsing without that DLC would go looking for.
//
// parseFolderFromBlock read bodies[0] and every tab filter in public/research.js compares the scalar
// `t.folder === f`, so the second tab had a hole where the game draws a node. A modder laying out that tab
// sees free space that is not free, and can place a new tech straight on top of an existing one.
//
// ✅ THE FILE WAS NEVER AT RISK, and that shaped the fix. removeFirstBraceKeyBlock strips only the FIRST
// folder block, so the rest ride through extraScript verbatim. This is a display defect — so the extra
// placements are published as a separate read-only list and the render builds throwaway copies, rather than
// being folded into the single folder/x/y the writer round-trips.
//
// ⛔ THE COPIES MUST NEVER REACH `allTechs`. The save path is
// `allTechs.filter((t) => t.isMod && idsToSave.has(t.id))` — a duplicate id there would send one technology
// twice with two different positions, into the writer that has already corrupted mods twice.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53532;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-twotabs-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

// An INDEPENDENT parse of the files, so the expected count is derived rather than typed in. Deliberately
// written differently from server.js's parser — if both were the same code, agreement would prove nothing.
function countMultiFolderTechs(dir) {
  const mask = (src) => {
    let out = "", inQ = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '"') { inQ = !inQ; out += c; continue; }
      if (c === "#" && !inQ) { while (i < src.length && src[i] !== "\n") { out += " "; i++; } out += "\n"; continue; }
      out += c;
    }
    return out;
  };
  const found = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return found; }
  for (const f of files) {
    const s = mask(fs.readFileSync(path.join(dir, f), "utf8"));
    const m = /(?:^|\n)\s*technologies\s*=\s*\{/.exec(s);
    if (!m) continue;
    let i = m.index + m[0].length, depth = 1;
    while (i < s.length && depth > 0) {
      const c = s[i];
      if (c === "}") { depth--; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      const idRe = /([A-Za-z0-9_.\-]+)\s*=\s*\{/y; idRe.lastIndex = i;
      const mm = idRe.exec(s);
      if (!mm) { i++; continue; }
      let j = idRe.lastIndex, d = 1;
      while (j < s.length && d > 0) { if (s[j] === "{") d++; else if (s[j] === "}") d--; j++; }
      const body = s.slice(idRe.lastIndex, j - 1);
      // count `folder = {` at the tech's TOP level only
      let n = 0, dd = 0;
      const re = /([A-Za-z0-9_]+)\s*=\s*\{/g;
      let k;
      while ((k = re.exec(body))) {
        if (dd === 0 && k[1] === "folder") n++;
        let p = re.lastIndex, depth2 = 1;
        while (p < body.length && depth2 > 0) { if (body[p] === "{") depth2++; else if (body[p] === "}") depth2--; p++; }
        re.lastIndex = p;
      }
      if (n > 1) found.set(mm[1], n);
      i = j;
    }
  }
  return found;
}

(async () => {
  let server;
  try {
    const RESEARCH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

    console.log("1. The parse reads every folder block, not just the first");
    rec("parseFolderFromBlock returns extraFolders", /extraFolders/.test(SERVER));
    rec("…built from bodies AFTER the first", /bodies\.slice\(1\)/.test(SERVER),
      "bodies[0] is the modelled placement; the rest are the extra ones");
    rec("…and an unnamed placement is dropped", /\.filter\(\(f\) => f\.folderName\)/.test(SERVER),
      "a folder block with no name addresses no tab and can be drawn nowhere");

    console.log("\n2. ⛔ The writer must NOT see them");
    // serializeTechnology round-trips the model's single folder into the FIRST folder block. If it ever read
    // extraFolders, the tech would be written into the second tab twice and the first not at all.
    const serAt = SERVER.indexOf("function serializeTechnology");
    const serEnd = serAt >= 0 ? SERVER.indexOf("\n  }", serAt) : -1;
    const ser = serAt >= 0 ? SERVER.slice(serAt, serEnd > 0 ? serEnd : serAt + 20000) : "";
    rec("serializeTechnology was found", ser.length > 500, ser.length + " chars");
    rec("…and never reads extraFolders", !/extraFolders/.test(ser),
      "display-only: the writer owns one folder block and extraScript carries the rest");
    rec("…and only the FIRST folder block is stripped from extraScript",
      /removeFirstBraceKeyBlock\(out, "folder"\)/.test(SERVER),
      "stripping all of them would delete the extra placements from the file");

    console.log("\n3. ⛔ The render copies must never enter allTechs");
    rec("the render builds a separate secondaryPlacements list", /const secondaryPlacements = \[\]/.test(RESEARCH));
    rec("…and concats them only into the draw list", /\.concat\(secondaryPlacements\)/.test(RESEARCH));
    // ⚠️ NOT a blanket ban on allTechs.push — research.js legitimately pushes a newly created tech, a clone
    // and a sub-tech child, and forbidding those would be forbidding the feature. The invariant is narrower
    // and exact: nothing carrying a secondary placement may reach allTechs. Checked two ways.
    const secLines = RESEARCH.split("\n").filter((l) => /secondaryPlacements/.test(l));
    rec("the secondaryPlacements list is referenced at all", secLines.length >= 2, secLines.length + " lines");
    rec("…and never on a line that mutates allTechs",
      secLines.every((l) => !/allTechs\s*(=[^=]|\.push\(|\.splice\(|\.unshift\()/.test(l)),
      secLines.filter((l) => /allTechs\s*(=[^=]|\.push\(|\.splice\()/.test(l)).map((l) => l.trim().slice(0, 80)));
    // The flag is minted in exactly one place, so there is one thing to audit rather than a scattered idea.
    const minted = (RESEARCH.match(/isSecondaryPlacement:\s*true/g) || []).length;
    rec("the flag is set in exactly one place", minted === 1, minted + " sites");
    rec("the save path still filters allTechs by isMod + dirty id",
      /allTechs\.filter\(\(t\) => t\.isMod && idsToSave\.has\(t\.id\)\)/.test(RESEARCH),
      "this is the line a duplicate id would corrupt — it must stay reading allTechs, which has no copies");
    rec("a secondary node is not draggable", /if \(tech\.isSecondaryPlacement\)/.test(RESEARCH));
    rec("…and says where it IS editable", /Its editable position lives under/.test(RESEARCH));

    console.log("\n4. Measured against the real install");
    if (!fs.existsSync(path.join(GAME, "common", "technologies"))) {
      rec("a vanilla install to measure against", false, "cannot verify the placements");
    } else {
      // ⭐ DERIVED: an independent parse decides how many there should be.
      const expected = countMultiFolderTechs(path.join(GAME, "common", "technologies"));
      rec("the corpus actually contains multi-folder techs", expected.size > 0,
        `${expected.size} techs, e.g. ${[...expected.keys()].slice(0, 3).join(", ")}`);

      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const body = await (await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(GAME)}`)).json();
      const techs = body.technologies || [];
      rec("the catalogue returned the base-game tree", techs.length > 100, techs.length + " techs");

      const served = techs.filter((t) => Array.isArray(t.extraFolders) && t.extraFolders.length);
      rec("every multi-folder tech is published with its extra placements", served.length === expected.size,
        `served ${served.length}, corpus has ${expected.size}`);
      const missing = [...expected.keys()].filter((id) => !served.some((t) => t.id === id));
      rec("…and they are the SAME techs", missing.length === 0, missing.slice(0, 6));

      // The specific case, with its real coordinates: getting the folder right but the position wrong would
      // draw the node in the correct tab in the wrong place, which is a different lie.
      const radio = techs.find((t) => t.id === "radio");
      const sup = radio && (radio.extraFolders || []).find((f) => f.folderName === "support_folder");
      rec("radio's second placement is support_folder", !!sup, radio && radio.extraFolders);
      rec("…at the position the file gives it", !!sup && sup.x === 11 && sup.y === 9,
        sup && `(${sup.x},${sup.y})`);
      rec("…while its FIRST placement is untouched", !!radio && radio.folder === "electronics_folder",
        radio && `${radio.folder} (${radio.x},${radio.y})`);

      console.log("\n5. The rule, composed — and the control");
      // The draw list the client builds, reproduced here over the real payload.
      const drawList = (folder) => techs
        .filter((t) => !t.isSubTech && t.folder === folder)
        .concat(techs.filter((t) => !t.isSubTech && (t.extraFolders || []).some((f) => f.folderName === folder)));
      const OLD = (folder) => techs.filter((t) => !t.isSubTech && t.folder === folder);

      const now = drawList("support_folder").map((t) => t.id);
      const before = OLD("support_folder").map((t) => t.id);
      rec("the Support tab now draws radio", now.includes("radio"));
      rec("…and motorised_infantry", now.includes("motorised_infantry"));
      // ⭐ CONTROL: the old rule must still lose them, or the fix is not load-bearing.
      rec("the OLD scalar rule missed both", !before.includes("radio") && !before.includes("motorised_infantry"),
        `${before.length} -> ${now.length} techs`);
      // …and must not have gained anything else, or the extra placements are being over-applied.
      const gained = now.filter((id) => !before.includes(id));
      rec("…and exactly those two were gained", gained.length === 2, gained);
      // No tech may be drawn TWICE in one tab — that would be a new lie in place of the old one.
      rec("no tab draws the same tech twice", new Set(now).size === now.length,
        now.length - new Set(now).size + " duplicates");

      console.log("\n6. The primary tab is unchanged");
      const elec = drawList("electronics_folder").map((t) => t.id);
      const elecOld = OLD("electronics_folder").map((t) => t.id);
      rec("Electronics still draws radio", elec.filter((id) => id === "radio").length === 1);
      rec("…and gained nothing", elec.length === elecOld.length, `${elecOld.length} -> ${elec.length}`);
    }

    console.log(`\n=== a tech in two tabs is drawn in both: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
