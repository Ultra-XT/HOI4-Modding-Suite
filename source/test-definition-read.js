// readDefinitionFromRoot reads map/definition.csv into the province table the whole Map editor stands
// on (owners, colours, terrain, the duplicate-colour/crash checks). It was untested; its parser
// parseDefinitionCsv had only incidental coverage. This locks both end-to-end: header/junk rows skipped,
// short rows dropped, RGB clamped to 0–255, type/terrain lowercased, coastal parsed as a boolean, and a
// missing file → [] (no throw).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readDefinitionFromRoot, parseDefinitionCsv } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + JSON.stringify(e) : ""); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-def-"));
fs.mkdirSync(path.join(root, "map"), { recursive: true });
const csv = [
  "province;red;green;blue;type;coastal;terrain;continent", // header row (non-numeric id → skipped)
  "0;0;0;0;land;false;unknown;0",
  "1;128;64;200;land;true;Plains;1",   // coastal=true; terrain mixed-case → lowercased
  "2;0;0;255;sea;false;ocean;0",
  "3;300;10;10;lake;false;lakes;0",    // red overflow → clamped to 255
  "",                                   // blank line skipped
  "bad;row",                            // < 4 fields → skipped
  "4;1;2",                              // < 4 fields → skipped
].join("\n");
fs.writeFileSync(path.join(root, "map", "definition.csv"), csv, "utf8");

const defs = readDefinitionFromRoot(root);
const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
check("only the 4 valid province rows parsed (header + short rows skipped)", defs.length === 4, defs.map((d) => d.id));
check("ids are 0,1,2,3", JSON.stringify(defs.map((d) => d.id)) === "[0,1,2,3]", defs.map((d) => d.id));
check("province 1 rgb parsed", byId[1] && byId[1].r === 128 && byId[1].g === 64 && byId[1].b === 200, byId[1]);
check("province 1 type=land, coastal=true", byId[1] && byId[1].type === "land" && byId[1].coastal === true, byId[1]);
check("terrain is lowercased (Plains→plains)", byId[1] && byId[1].terrain === "plains", byId[1] && byId[1].terrain);
check("continent parsed as number", byId[1] && byId[1].continent === 1, byId[1] && byId[1].continent);
check("province 2 type=sea, coastal=false", byId[2] && byId[2].type === "sea" && byId[2].coastal === false, byId[2]);
check("province 3 red overflow clamped to 255", byId[3] && byId[3].r === 255, byId[3] && byId[3].r);

// Direct parser edge cases.
check("parseDefinitionCsv: empty input → []", JSON.stringify(parseDefinitionCsv("")) === "[]");
check("parseDefinitionCsv: a header-only file → []", parseDefinitionCsv("province;red;green;blue;type;coastal;terrain;continent").length === 0);
check("parseDefinitionCsv: negative RGB is dropped/clamped (no negatives leak)", (() => { const d = parseDefinitionCsv("9;-5;10;10;land;false;x;0"); return d.length === 1 && d[0].r >= 0; })(), parseDefinitionCsv("9;-5;10;10;land;false;x;0"));

// Missing file / dir → [] without throwing.
const empty = fs.mkdtempSync(path.join(os.tmpdir(), "nova-def-empty-"));
let threw = false, res = [];
try { res = readDefinitionFromRoot(empty); } catch (_) { threw = true; }
check("missing definition.csv → no throw", !threw);
check("missing definition.csv → []", Array.isArray(res) && res.length === 0, res);

try { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true }); } catch (_) {}
console.log(`\nDEFINITION-READ TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
