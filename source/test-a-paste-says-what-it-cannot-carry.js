// ⛔ #a-paste-says-what-it-cannot-carry (tool campaign B2-29) — ⧉ COPY ATTRS AND 📋 PASTE ATTRS SAY WHAT THE PASTE LEAVES.
//
// ⧉ Copy attrs on state 122 said "5 building types" and copied its coal; 📋 Paste attrs on 1006 then set only the state panel's fields
// (pasteStateAttrs: #miBuildings [data-bld], #miResources [data-res]), so radar_station and coal were dropped without a word, and both
// buttons' titles promised the whole development profile. The copy line now counts what Paste carries, both lines name what it leaves
// (the state pasted onto keeps its own), and the titles say the panel's buildings and resources.
//
// RUN, not grepped: the page's own copyStateAttrs, notPastedWords and pasteStateAttrs (lifted from public/map.js), with the panel's fields
// read out of map.html. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 600) : "")); } };
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...HTML.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...HTML.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
const CODE = ["function copyStateAttrs()", "function notPastedWords(", "function pasteStateAttrs()"].map((o) => T.lift(o)).join("\n");

// a source state with two panel buildings, one the panel has no field for, a panel resource and one with no field
const NOFIELD_B = ["radar_station", "fuel_silo", "rocket_site"].find((k) => !BLD.includes(k));
const NOFIELD_R = ["coal", "rubber_plantation", "chromium"].find((k) => !RES.includes(k));
ok(BLD.length >= 2 && RES.length >= 1 && !!NOFIELD_B && !!NOFIELD_R, "THE CONTROL: the panel's building and resource fields are read from map.html, and some kinds have none", { BLD, RES, NOFIELD_B, NOFIELD_R });
const SRC = { id: 122, category: "city", manpower: 500, buildings: { [BLD[0]]: 4, [BLD[1]]: 2, [NOFIELD_B]: 1 }, resources: { [RES[0]]: 9, [NOFIELD_R]: 29 } };
const DST = { id: 1006, category: "town", manpower: 100, buildings: {}, resources: {} };

let line = "";
const statuses = [];
const inputs = { miCategoryInp: { value: "" }, miManpowerInp: { value: "" } };
const bld = BLD.map((b) => ({ dataset: { bld: b }, value: "0" })), res = RES.map((r) => ({ dataset: { res: r }, value: "0" }));
const sb = {
  console, Object, Number, String, Array, Set,
  selected: { stateId: SRC.id }, stateById: new Map([[SRC.id, SRC], [DST.id, DST]]), pendingWrites: [],
  setStatus: (t) => { line = String(t); statuses.push(line); }, $: (id) => inputs[id] || { value: "" },
  document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []) },
  populateCategorySelect: (el, v) => { el.value = v; },
};
sb.saveState = () => { sb.pendingWrites.push({ url: "/api/map/set-state" }); };
sb.stageStateWrite = { said: "" };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(CODE + "\nglobalThis.__copy = copyStateAttrs; globalThis.__paste = pasteStateAttrs;", sb);

console.log("\n-- ⧉ Copy attrs --");
sb.__copy();
const name = (k) => k.replace(/_/g, " ");
ok(/^⧉ Copied attrs from state 122 \(category “city”, 2 building types, population 500\)\./.test(line), "⭐⭐ the copy line counts the building kinds Paste carries (2), not every kind the state holds (3)", line);
ok(line.includes(`so ${name(NOFIELD_B)}, ${name(NOFIELD_R)} are not pasted: the state you paste onto keeps its own.`), "⭐⭐⭐ …and names the building and the resource the panel has no field for", line);

console.log("\n-- 📋 Paste attrs --");
sb.selected = { stateId: DST.id };
sb.__paste();
ok(/^📋 Pasted dev profile onto state 1006 — click 💾 Save to write it to your mod\./.test(line), "THE CONTROL: the paste is staged, and says so first", line);
ok(line.includes(`${name(NOFIELD_B)}, ${name(NOFIELD_R)} are not pasted`), "⭐⭐⭐ the paste line names what it left", line);
ok(String(bld.find((b) => b.dataset.bld === BLD[0]).value) === "4" && String(res.find((r) => r.dataset.res === RES[0]).value) === "9", "THE CONTROL: the panel's own fields took the copied values", { b: bld.map((b) => [b.dataset.bld, b.value]), r: res.map((r) => [r.dataset.res, r.value]) });

console.log("\n-- a state whose kinds all have a field says nothing more --");
{
  sb.selected = { stateId: 7 }; sb.stateById.set(7, { id: 7, category: "town", manpower: 10, buildings: { [BLD[0]]: 1 }, resources: { [RES[0]]: 2 } });
  sb.__copy();
  ok(!/not pasted/.test(line) && /1 building type,/.test(line), "THE CONTROL: no extra words when Paste carries every kind", line);
}

console.log("\n-- the buttons' titles --");
const title = (id) => ((new RegExp(`id="${id}"[^>]*title="([^"]*)"`).exec(HTML) || [])[1] || "");
ok(/the buildings and resources this panel has a field for/.test(title("miCopyAttrsBtn")) && /nor a building or resource with no field here/.test(title("miCopyAttrsBtn")), "⭐ ⧉'s title says it copies the panel's buildings and resources", title("miCopyAttrsBtn"));
ok(/this panel's buildings and resources/.test(title("miPasteAttrsBtn")) && /stays as this state has it/.test(title("miPasteAttrsBtn")), "⭐ 📋's title says the rest stays as the state has it", title("miPasteAttrsBtn"));

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
