// #provisional-id-lost-when-a-save-stops-halfway
//
// A SAVE THAT STOPPED HALFWAY LEFT THE REMAINING EDITS POINTING AT A STATE ID THAT NEVER EXISTED.
//
// A brand-new state gets a negative provisional id until the server assigns a real one. Every write queued
// against it — set-state, set-owner, move-province, merge, supply area, capital — carries that provisional
// id, and the flush translates them through an `idMap` built as each create comes back.
//
// That idMap is declared INSIDE flushMapSaves, and the queued bodies were never corrected: the flush copied
// each body, remapped the copy, and posted that. So when a save stopped halfway — which it is designed to
// do, and which it says in as many words:
//
//     "Save stopped at step 3: … Your remaining changes are kept — fix and Save again."
//
// — the create had already landed and been shifted off the queue, while the writes still queued behind it
// held ids only that flush's idMap could translate. The next flush started with an empty idMap, sent
// stateId: -1 to the server, and the edit could never be saved. The same hole swallowed the crash-recovery
// backup, which persists pendingWrites to localStorage and knows nothing about any mapping.
//
// The mapping is now written into the QUEUE, so it survives a stopped save, a reload, and an undo snapshot.
//
// ⭐ And the field list is one constant used by both the flush and the rewrite. It used to be five lines
// typed out in the flush and absent from everywhere else — and one of those five, "fromStateId", is not a
// body field at all. It only ever appears in a write's META (move-province). The line remapping it in the
// body had never done anything, which is what a hand-written list looks like from the inside.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));

console.log("\n[one owner for the id-carrying fields]");
{
  rec("there is a single list of them", /const STATE_ID_FIELDS = \[/.test(SRC), "the names are hand-written per call site again");
  const m = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(SRC);
  const declared = m ? m[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean) : [];
  rec("…and it is not empty", declared.length >= 5, declared);

  // ⭐ DERIVED FROM THE CALL SITES, never retyped here. A sixth id-carrying field added to any queueWrite
  // body has to appear in the list, or the flush silently stops translating it.
  const bodies = SRC.match(/queueWrite\([^;]*/g) || [];
  const used = new Set();
  for (const b of bodies) for (const k of (b.match(/\b[A-Za-z]*[Ss]tateId\b/g) || [])) used.add(k);
  used.delete("provisionalId");
  rec("…and it covers every *StateId a queueWrite call actually passes",
    [...used].every((k) => declared.includes(k)), { used: [...used], declared });
  rec("…and the flush drives off it rather than a hand-written run of ifs",
    /for \(const f of STATE_ID_FIELDS\) if \(f in body\) body\[f\] = remap\(body\[f\]\);/.test(SRC),
    "the two lists can drift apart again");
  rec("…so those five hand-written lines are gone", !/if \("toStateId" in body\) body\.toStateId = remap/.test(SRC), "the old block is still there");
}

console.log("\n[the mapping outlives the flush]");
{
  // ⚠️ 2026-09-10: this pinned the exact two-argument call as well. remapQueuedStateId now also takes the create's
  // response, because a rename queued before the first Save names the state by its placeholder key, and has to be
  // pointed at the key the create wrote. #a-new-state-has-no-name. The intent here is unchanged, so match the call.
  rec("a create rewrites the writes still queued", /remapQueuedStateId\(w\.meta\.provisionalId, res\.id\b/.test(SRC), "a stopped save orphans them again");
  // ⚠️ 2026-09-08: this pinned the exact two-argument call. remapLocalStateId now takes the create's whole
  // response as a third argument, because the id was not the only thing the server decided — it also picked
  // the name, the manpower and the category, and the page kept its placeholders for all three.
  // #a-new-state-keeps-its-placeholder-name. The intent here is unchanged (the local model is remapped, so
  // the canvas cannot keep the dead id), so match the call rather than its exact arity.
  rec("…as well as the local model", /remapLocalStateId\(w\.meta\.provisionalId, res\.id\b/.test(SRC), "the canvas would keep the dead id");
  rec("…and it is given what the create actually wrote", /remapLocalStateId\(w\.meta\.provisionalId, res\.id, res\);/.test(SRC),
    "only the id is read back, so a new state keeps its placeholder name and manpower 0");
  rec("…and the meta id move-province carries", /if \(w\.meta && w\.meta\.fromStateId === provId\) w\.meta\.fromStateId = realId;/.test(SRC),
    "discarding a new state would put provinces back into a state that no longer exists");
  rec("…but NOT meta.provisionalId, which identifies the create itself", !/w\.meta\.provisionalId = realId/.test(SRC), "the discard filter would stop matching");
  rec("CONTROL: the save still stops and keeps the rest on a failure", /Your remaining changes are kept — fix and Save again/.test(SRC), "it no longer resumes at all");
  rec("CONTROL: …and still takes a write off only once it landed (the write it sent: #a-save-walks-the-queue)", /pendingWrites\.indexOf\(w\); if \(at !== -1\) pendingWrites\.splice\(at, 1\); \}[\s\S]{0,200}?done\+\+;/.test(SRC), "a failed write would be dropped");
}

console.log("\n[RUN IT] a create, then a save that stops, then a save that works");
{
  const fnAt = SRC.indexOf("function remapQueuedStateId(provId, realId");
  let fnSrc = "";
  if (fnAt !== -1) {
    let i = SRC.indexOf("{", fnAt), d = 0;
    for (; i < SRC.length; i++) { if (SRC[i] === "{") d++; else if (SRC[i] === "}") { d--; if (d === 0) { fnSrc = SRC.slice(fnAt, i + 1); break; } } }
  }
  const listSrc = (/const STATE_ID_FIELDS = \[[^\]]*\];/.exec(SRC) || [""])[0];
  rec("the rewrite and its list were extracted", fnSrc.length > 120 && listSrc.length > 40, { fn: fnSrc.length, list: listSrc.length });

  // The queue as it stands after: ✨ New country places a state (provisional -1), the panel edits it,
  // a province is moved out of it, its owner's capital is set to it, and it is merged with a real state.
  const queue = [
    { url: "/api/map/set-state", body: { stateId: -1, fields: { manpower: "1000" } }, meta: {} },
    { url: "/api/map/move-province", body: { provinceId: 42, toStateId: 7 }, meta: { fromStateId: -1 } },
    { url: "/api/map/set-capital", body: { tag: "ATL", stateId: -1 }, meta: {} },
    { url: "/api/map/merge-state", body: { sourceStateId: -1, targetStateId: 9 }, meta: { merge: true } },
    { url: "/api/map/set-owner", body: { stateId: -2, owner: "GER" }, meta: {} }, // a DIFFERENT new state
  ];
  const ctx = { pendingWrites: queue };
  vm.createContext(ctx);
  vm.runInContext(listSrc + "\n" + fnSrc + "\nremapQueuedStateId(-1, 815);", ctx);

  rec("RUN: the set-state now names the real id", queue[0].body.stateId === 815, queue[0].body);
  rec("RUN: the move-province's meta does too", queue[1].meta.fromStateId === 815, queue[1].meta);
  rec("RUN: the capital does too", queue[2].body.stateId === 815, queue[2].body);
  rec("RUN: both sides of the merge are considered", queue[3].body.sourceStateId === 815 && queue[3].body.targetStateId === 9, queue[3].body);
  // ⭐ The one that must NOT move: a second new state has its own provisional id.
  rec("RUN: a different provisional state is left alone", queue[4].body.stateId === -2, queue[4].body);
  rec("RUN: …and a real id it happens to sit beside is untouched", queue[1].body.toStateId === 7, queue[1].body);

  // Second create resolves later in the same session.
  vm.runInContext("remapQueuedStateId(-2, 816);", ctx);
  rec("RUN: the second create maps its own writes", queue[4].body.stateId === 816, queue[4].body);
  rec("RUN: …without disturbing the first", queue[0].body.stateId === 815, queue[0].body);

  // A write with no body at all must not throw the flush over.
  ctx.pendingWrites = [{ url: "/api/map/blank-to-sea" }, null, { url: "/x", body: null, meta: null }];
  let threw = null;
  try { vm.runInContext("remapQueuedStateId(-1, 5);", ctx); } catch (e) { threw = e.message; }
  rec("RUN: a bodyless or empty write does not break it", threw === null, threw);
}

console.log(`\n=== provisional id survives a stopped save: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
