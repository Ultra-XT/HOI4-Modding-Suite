// #shared-connection-strands-the-fingerprint
//
// LINKING A SHARED FOCUS GROUP MADE THE PAGE'S OWN SAVE IMPOSSIBLE.
//
// The focus editor uses optimistic concurrency: it fingerprints the file when it loads it, sends that with
// every save, and the server refuses a save whose baseline no longer matches what is on disk —
//
//     <file>.txt changed on disk after you opened it — something else edited it. Nothing was written, so
//     that change is still there. Reload the tree to pick it up, then make your edit again.
//
// That check is right and stays. The problem is that a few Nova endpoints write the very file the editor has
// open, so after one of them "something else" is Nova itself — and loadedFingerprint is assigned in exactly
// two places, loadFile and after a successful save.
//
// /api/focus/shared-connection is one of those endpoints: resolveFocusFileInMod on the loaded relPath, then
// safeModWrite. The client staged a header edit so the next save would re-apply the change rather than undo
// it, reloaded the shared layer — and never re-anchored. So: drag four focuses, rename one, then link a
// shared group, and those edits can never be saved. The only remedy the message offers, reloading, discards
// them.
//
// Its two siblings already get this right, which is what makes it a miss rather than a design gap:
//   /api/focus/tree-properties      the client awaits loadFile() afterwards, "resync in-memory source with
//                                   the new header so a later focus Save keeps it"
//   /api/focus/continuous-position  the client no longer calls it at all — the panel drag stages the
//                                   position and lets Save carry it, per #source-patch-invalidates-block-offsets
//
// The server now returns the fingerprint of what it wrote and the client adopts it, which is the same
// re-anchor a save does. Verified against the running server on a workshop mod, asking it to disable a group
// that was not linked so `updated === original` and nothing was written:
//
//     changedTheFile false · fileUntouched true
//     serverFingerprint  46851-c1572f78
//     clientFingerprint  46851-c1572f78   (the same bytes, through public/app.js's own function)
"use strict";
const fs = require("fs");
const path = require("path");

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
const APP = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
const SRV = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

console.log("\n[the server says what it wrote]");
{
  const at = SRV.indexOf('app.post("/api/focus/shared-connection"');
  let handler = "";
  if (at !== -1) {
    let i = SRV.indexOf("{", at), d = 0;
    for (; i < SRV.length; i++) { if (SRV[i] === "{") d++; else if (SRV[i] === "}") { d--; if (d === 0) { handler = SRV.slice(at, i + 1); break; } } }
  }
  rec("the endpoint was extracted", handler.length > 400, handler.length);
  rec("it still writes the loaded tree file", /safeModWrite\(abs, writtenTree, "shared-focus-connection"\);/.test(handler), "the premise changed — re-check this whole test");
  // #the-fingerprint-described-text-that-was-never-written — this used to assert the fingerprint was taken
  // from `updated`, the text passed IN. That was wrong, and the reason given for it — "same bytes" — was
  // the error: safeModWrite runs matchExistingLineEndings, so on a CRLF file the bytes on disk are NOT the
  // bytes handed over. The editor then re-anchored on a fingerprint of a file that never existed and its
  // next save was refused as a conflict. (Proven on the army OOB path, where it made the second save
  // impossible on the 79% of installed-mod files that are CRLF.)
  //
  // ⚠️ The OTHER half of the old assertion was right and is kept: NOT a re-read. Reading the file back
  // after writing races another writer, and the editor would re-anchor on someone else's bytes and clobber
  // them without ever seeing a conflict. So the conversion is done BEFORE the write and that exact text is
  // both handed to safeModWrite and fingerprinted.
  rec("…and returns the fingerprint of the bytes it actually wrote", /fingerprint: novaFileFingerprint\(writtenTree\),/.test(handler),
    "the client has nothing to re-anchor on");
  rec("…computed without a re-read, which would race another writer", !/novaFileFingerprint\(fs\.readFileSync/.test(handler), "a re-read can race another writer");
  rec("…and the line-ending conversion happens before the write, not after",
    /writtenTree = matchExistingLineEndings\(abs, updated\);[\s\S]{0,200}safeModWrite\(abs, writtenTree/.test(handler),
    "fingerprinting text that safeModWrite is still going to change puts the bug straight back");
  rec("…still saying whether anything changed", /changed: updated !== original,/.test(handler), "the caller loses that signal");
}

console.log("\n[the client adopts it]");
{
  const at = APP.indexOf("async function cfSaveSharedConnection(sharedId, enabled)");
  let fn = "";
  if (at !== -1) {
    let i = APP.indexOf("{", at), d = 0;
    for (; i < APP.length; i++) { if (APP[i] === "{") d++; else if (APP[i] === "}") { d--; if (d === 0) { fn = APP.slice(at, i + 1); break; } } }
  }
  rec("cfSaveSharedConnection was extracted", fn.length > 400, fn.length);
  rec("it re-anchors on the returned fingerprint", /if \(data\.fingerprint\) loadedFingerprint = data\.fingerprint;/.test(fn),
    "every later save is refused with 'changed on disk after you opened it'");
  const okAt = fn.indexOf("if (!r.ok || !data.ok)");
  const fpAt = fn.indexOf("loadedFingerprint = data.fingerprint");
  rec("…only after the request succeeded", okAt !== -1 && fpAt > okAt, { okAt, fpAt });
  rec("CONTROL: …and still stages the header edit so Save does not undo the change",
    /pendingTreeHeaderEdits\.set\("shared_focus:" \+ sharedId/.test(fn), "the next save would remove the line the server just wrote");
}

console.log("\n[⭐ every endpoint that writes the LOADED tree must re-anchor]");
{
  // Derived: find the server endpoints that resolve a path in the loaded tree and write it, then check what
  // the client does after calling each. A new one added without a re-anchor fails here.
  const writers = [];
  for (const m of SRV.matchAll(/app\.(post|put)\("(\/api\/focus\/[a-z-]+)"/g)) {
    const at = m.index;
    let i = SRV.indexOf("{", at), d = 0, end = at;
    for (; i < SRV.length; i++) { if (SRV[i] === "{") d++; else if (SRV[i] === "}") { d--; if (d === 0) { end = i; break; } } }
    const body = SRV.slice(at, end + 1);
    if (/resolveFocusFileInMod\(/.test(body) && /safeModWrite\(/.test(body)) writers.push(m[2]);
  }
  console.log("     endpoints that write the loaded tree: " + writers.join(", "));
  rec("the tree-writing endpoints were found", writers.length >= 2, writers);

  for (const ep of writers) {
    const calledAt = APP.indexOf(`"${ep}"`);
    if (calledAt === -1) {
      // Not called by the client at all — the safest possible answer, and true of continuous-position since
      // the panel drag was changed to stage instead of write.
      rec(`${ep}: not called by the client, so nothing can go stale`, true, "");
      continue;
    }
    // Within the calling function, the client must either re-load (which re-fingerprints) or adopt one.
    const window = APP.slice(calledAt, calledAt + 1600);
    const reanchors = /await loadFile\(\)/.test(window) || /loadedFingerprint = data\.fingerprint/.test(window);
    rec(`${ep}: the client re-anchors after calling it`, reanchors,
      `${ep} rewrites the open file and the editor keeps a stale fingerprint — its next save 409s`);
  }

  rec("CONTROL: loadedFingerprint is still what the save sends", /baseFingerprint: loadedFingerprint,/.test(APP), "the concurrency check is no longer armed");
  rec("CONTROL: …and the server still refuses a stale one", /changed on disk after you opened it/.test(SRV), "the guard this is all about was removed");
}

console.log(`\n=== tree writes re-anchor the fingerprint: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
