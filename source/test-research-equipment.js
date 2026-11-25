// EQUIPMENT invariants (#equip-follows-tech). NO BUG WAS FOUND IN THIS SLICE — these checks record why
// the equipment side is safe, so the reasoning survives the next edit.
//
// The concern was that equipment and its tech could drift apart: an equipment left behind when its tech
// is deleted, or an orphaned entry in the client's allEquips map reaching the mod. Both are closed, but
// by two DIFFERENT mechanisms, and each is easy to break without noticing:
//
//   1. a deletion carries the equipment id and file alongside the tech, so the server removes both;
//   2. the server writes equipment ONLY through a saved tech's enableEquipments — so an orphan in the
//      client map (which a duplicate-then-undo does leave behind) can never be persisted, because
//      nothing reaches it. That is what makes the in-memory orphan harmless rather than a mod defect.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const client = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// ---- 1. A DELETION CARRIES THE EQUIPMENT ----
ok(/equipId: eqId \|\| null,/.test(client), "a queued deletion carries the equipment id");
ok(/equipFile: eqId && allEquips\[eqId\] \? allEquips\[eqId\]\.fileName : null,/.test(client),
  "...and the file it lives in, so the server can find it");
ok(/\[\{techId, techFile, equipId, equipFile\}\] — applied on next save/.test(client),
  "the queue's shape is documented as carrying both");
// and the queue rides in the undo snapshot, so an undo restores the equipment's fate with the tech's
ok(/pd: pendingDeletions, du: deletedUndoStack,/.test(client), "the deletion queue is in the undo snapshot");
ok(/e: allEquips,/.test(client), "allEquips itself is in the undo snapshot");

// ---- 2. ONLY EQUIPMENT REACHABLE FROM A SAVED TECH IS WRITTEN ----
// This is what neutralises an orphaned client-side entry: the server never iterates equipMap to decide
// what to persist, it looks each saved tech's equipment up BY the tech.
ok(/const eqIds = Array\.isArray\(tech\.enableEquipments\) \? tech\.enableEquipments : \[\];/.test(server),
  "the server resolves equipment FROM the tech being saved");
ok(/const equipment = eqIds\.map\(\(id\) => equipMap\[id\]\)\.filter\(Boolean\);/.test(server),
  "...looking each one up in the submitted map rather than trusting the map's contents");
// ALL of them, not just the first: vanilla's airframe techs enable eight equipments apiece, and an
// edit to any but the first used to report success and write nothing. #write-every-enabled-equipment
ok(!/tech\.enableEquipments\[0\]/.test(server),
  "every equipment the tech enables is written, not only the first");
// Matched up to `mergedTechs` and no further: what this pins is that the equipment reaches disk only as an
// argument of its own tech's save, not that the call takes exactly four arguments. It grew a fifth
// (`newIds`, so the gridbox warning can tell which techs this save is about to place — #gridbox-warning-
// before-the-fix) and the old exact-match failed on a change that does not touch what it cares about.
ok(/persistTechnologySave\(activeRoot, tech, equipment, mergedTechs[,)]/.test(server),
  "equipment is persisted only as part of its tech's save");

// ---- 3. EVERY CLIENT EQUIPMENT MUTATION SIGNALS THE HISTORY ----
// allEquips is snapshotted, but a mutation still has to ANNOUNCE itself or no snapshot is taken.
const sites = [...client.matchAll(/allEquips\[[^\]]+\] = \{/g)].map((m) => m.index);
ok(sites.length >= 2, `found the equipment-creating sites (${sites.length})`);
for (const idx of sites) {
  // look ahead a bounded distance for a history signal in the same operation
  const after = client.slice(idx, idx + 2500);
  ok(/markTechDirty\(|markDirty\(/.test(after),
    `the equipment creation at offset ${idx} reaches a history signal`);
}

// ---- 4. THE DUPLICATE PATH GIVES THE COPY ITS OWN EQUIPMENT ----
// Sharing one equipment between two techs would make editing the copy's stats silently change the
// original's — the comment says so, and the clone must keep doing it.
ok(/const newEq = `\$\{newId\}_equipment`;/.test(client), "a duplicated tech gets its own equipment id");
ok(/allEquips\[newEq\] = JSON\.parse\(JSON\.stringify\(allEquips\[oldEq\]\)\)/.test(client),
  "the copy is a deep clone, not a shared reference");
ok(/clone\.enableEquipments = \[newEq\];/.test(client), "the copy points at its own equipment");

console.log(`test-research-equipment: ${checks} checks passed`);
