// DLC-FILTER invariants (#dlc-origx). NO BUG WAS FOUND HERE — this file exists to keep it that way,
// because the contract is subtle and one careless edit re-breaks it invisibly.
//
// Toggling a DLC re-runs applyDlcCollisionPacking, which RESTORES every tech to its authored x from the
// `_origX` snapshot. That is only safe while every path that legitimately changes x also updates
// _origX: otherwise the next DLC toggle silently reverts the user's move back to the pre-edit position.
// There are exactly two such paths — the drag commit and the sidebar X field — and both must keep
// setting it. Verified live on Millennium Dawn: drag a tech, toggle Arms Against Tyranny off and back
// on, and the dragged coordinates survive both directions with no extra mutations recorded.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// ---- the packer is a pure RESTORE, never a reflow ----
const i = src.indexOf("function applyDlcCollisionPacking(");
ok(i !== -1, "applyDlcCollisionPacking exists");
const open = src.indexOf("{", i);
let d = 0, end = open;
for (let j = open; j < src.length; j++) {
  if (src[j] === "{") d++;
  else if (src[j] === "}") { d--; if (!d) { end = j; break; } }
}
const body = src.slice(open + 1, end);
ok(/t\._origX === undefined\) t\._origX = t\.x; else t\.x = t\._origX;/.test(body),
  "the packer snapshots x once and thereafter restores it");
// strip comments first: the body documents the OLD shifting behaviour in prose, and matching that
// would fail on the explanation rather than on the code.
const code = body.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(!/\+\s*1|\+=\s*1/.test(code),
  "the packer never shifts a tech by a slot — the game does not reflow around hidden techs");

// ---- every path that changes x must refresh the baseline ----
ok(/tech\._origX = tech\.x;/.test(src), "the drag commit updates the _origX baseline");
ok(/DLC would reset tech\.x back to the pre-drag _origX/.test(src), "the drag's rationale is documented");
ok(/techAfterRename\._origX = techAfterRename\.x;/.test(src), "the sidebar X field updates the _origX baseline");
ok(/A typed-in X is the authored baseline for the DLC packer too/.test(src), "the sidebar's rationale is documented");
// count the x-assignment sites so a NEW one cannot be added without noticing this contract
const xWrites = (src.match(/\b(tech|techAfterRename)\.x = /g) || []).length;
const baselineWrites = (src.match(/\b(tech|techAfterRename)\._origX = /g) || []).length;
ok(baselineWrites >= 2, `both known x-writers refresh _origX (found ${baselineWrites})`);
ok(xWrites <= 6, `no unexpected new tech.x writer appeared (found ${xWrites}; if this fails, make sure the new one sets _origX)`);

// ---- _origX is client-only and must never reach a mod file ----
ok(!/_origX/.test(server), "_origX never appears server-side, so it cannot be written into a mod file");
// ...unlike previousId, which the server DOES consume (that is the rename mechanism)
ok(/tech\.previousId/.test(server), "SANITY: previousId is still consumed server-side for renames");

// ---- undo carries the baseline with the tech ----
ok(/t: allTechs/.test(src), "the undo snapshot captures whole tech objects, so _origX rides along");

console.log(`test-research-dlc: ${checks} checks passed`);
