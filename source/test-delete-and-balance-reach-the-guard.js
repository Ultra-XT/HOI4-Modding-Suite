// #delete-leaves-the-page-dirty-over-a-deleted-event  +  #balance-button-is-invisible-to-the-guard
//
// TWO CONTROLS THAT CHANGED THE PAGE WITHOUT THE PAGE'S GUARD EVER HEARING ABOUT IT.
//
// 1. EVENT MAKER — DELETE EVENT
//
//    The delete handler blanked #eventTitle and #eventDescription — both inside evUnsaved's watched root —
//    and never reset the baseline, so the page read dirty the instant the delete succeeded. It also left
//    #eventNamespace and #eventId still naming the event that had just been deleted.
//
//    Bad twice over. Clicking any other event asked whether to discard changes to an event that no longer
//    exists. And on quit: main.js asks __focusEditorHasUnsavedChanges(), gets true, offers Save as the
//    DEFAULT button, and novaWatchUnsaved's onSave clicks #saveEventBtn — with the namespace and id still
//    filled in, so the Save the dialog offers RE-CREATES the deleted event, blank.
//
//    decisions.js has the same handler and gets it right — it nulls its baseline AND clears the identity
//    field. events.js is the sibling that adopted neither half.
//
//    Measured in the running maker with the endpoints stubbed. After the fix: delete fires, the identity and
//    title clear, __focusEditorHasUnsavedChanges() is FALSE — so main.js closes without a dialog and nothing
//    is re-created.
//
// 2. COUNTRY SETUP — "BALANCE TO 100%"
//
//    This page's entire dirty check is one delegated pair of capturing listeners on #csPanel, for "input"
//    and "change" — deliberately delegated so the runtime-built ideology boxes are covered without wiring
//    each one. The Balance button assigned el.value directly, which fires neither event, and never called
//    csMarkDirty(). So csDirty stayed false and the country-switch guard, the mod-switch guard and the
//    suite-nav/quit guard all reported the page clean; the rebalanced numbers were then overwritten by the
//    next load with no prompt. Save Details reads the boxes live, so pressing Save worked — the defect was
//    purely that every guard was blind to this one control.
//
//    Measured on ADU (5/5/5/85). Before the fix, rebalancing changed nothing the guard could see. After:
//    setting the boxes with NO events leaves the page clean (which is what proves the guard is event-based),
//    and clicking Balance → 25/25/25/25 makes leaving ask. Balancing an ALREADY balanced country still does
//    not ask, because the fix announces only boxes that actually changed.
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
const PUB = path.join(__dirname, "public");
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
const EV = read("events.js"), DEC = read("decisions.js"), CS = read("country-setup.js"), OVERLAY = read("loading-overlay.js");

console.log("\n[Delete Event leaves nothing behind for the quit dialog to save]");
{
  // The success branch of the delete handler.
  const delAt = EV.indexOf('fetch("/api/events/delete-definition"');
  const okAt = EV.indexOf("if (data.error) throw new Error(data.error);", delAt === -1 ? 0 : delAt);
  const listAt = EV.indexOf("loadEventsList();", okAt === -1 ? 0 : okAt);
  rec("the delete request was found", delAt !== -1, "/api/events/delete-definition");
  rec("…and its error check", okAt !== -1 && okAt > delAt, { delAt, okAt });
  const branch = okAt === -1 ? "" : EV.slice(okAt, listAt === -1 ? okAt + 2000 : listAt);
  rec("the success branch was extracted", branch.length > 200, branch.length);

  rec("it clears the namespace", /document\.getElementById\("eventNamespace"\)\.value = "";/.test(branch),
    "the quit dialog's Save would re-create the deleted event");
  rec("…and the id", /document\.getElementById\("eventId"\)\.value = "";/.test(branch), "same");
  rec("…and re-baselines the watcher", /if \(evUnsaved\) evUnsaved\.markClean\(\);/.test(branch),
    "the page is left claiming unsaved changes over an event that no longer exists");
  // ⭐ EXACTLY ONE, in the whole delete handler. Checking only the success branch passed with a SECOND
  // re-baseline added before the request — which would mark the page clean even when the delete FAILED,
  // losing the warning about work that is still unsaved. "In the success branch" is not "only there".
  const handlerStart = EV.lastIndexOf('deleteEventBtn.addEventListener("click"', delAt === -1 ? EV.length : delAt);
  const handlerEnd = EV.indexOf('deleteEventBtn.textContent = "Delete Event";', delAt === -1 ? 0 : delAt);
  const whole = handlerStart === -1 || handlerEnd === -1 ? "" : EV.slice(handlerStart, handlerEnd);
  const marks = (whole.match(/evUnsaved\.markClean\(\)/g) || []).length;
  rec("…exactly once in the delete handler", whole.length > 400 && marks === 1, { handlerLen: whole.length, marks });
  rec("…still clearing the title and description it always cleared", /"eventTitle"\)\.value = "";/.test(branch) && /"eventDescription"\)\.value = "";/.test(branch),
    "the form still shows the deleted event");

  // ⭐ THE SIBLING IS THE SPEC. decisions.js already did both halves; this is what "adopt it" means.
  // Scoped to Decisions' OWN delete handler: `decCleanSnapshot = null;` appears five times in that file —
  // including its declaration — so a whole-file regex passes with the one that matters deleted.
  const dDelAt = DEC.indexOf('fetch("/api/decisions/delete-definition"');
  const dBranch = dDelAt === -1 ? "" : DEC.slice(dDelAt, dDelAt + 2500);
  rec("CONTROL: the Decisions maker still does both halves",
    /decCleanSnapshot = null;/.test(dBranch) && /document\.getElementById\("decisionId"\)\.value = "";/.test(dBranch),
    "the page this was modelled on regressed");

  // ⭐ DERIVED, because this shipped in three makers before the pattern was noticed. Any maker that watches
  // an editor AND can delete the item that editor holds must do BOTH halves: clear the identity so a later
  // Save cannot write the item back, and re-baseline so the page is not left dirty over something that no
  // longer exists.
  {
    const PUBDIR = path.join(__dirname, "public");
    const makers = [];
    for (const f of fs.readdirSync(PUBDIR).filter((x) => x.endsWith(".js")).sort()) {
      const src = read(f);
      const watches = /novaWatchUnsaved\(\{/.test(src) || /decEditorSnapshot/.test(src);
      const deletes = /\/api\/[a-z-]+\/delete(-definition)?"/.test(src);
      if (watches && deletes) makers.push(f);
    }
    console.log("     makers that watch an editor AND can delete its item: " + makers.join(", "));
    rec("the makers with a delete were found", makers.length >= 3, makers);
    const halves = (f) => {
      const src = read(f);
      const at = src.search(/fetch\("\/api\/[a-z-]+\/delete(-definition)?"/);
      if (at === -1) return { ok: false, why: "no delete request found" };
      let branch = src.slice(at, at + 2600);
      // Follow one level of delegation. characters.js does both halves by calling newChar(), and a check
      // that only read the literal branch reported it as missing both — a false positive on a correct page.
      // (Chasing it was still worth it: it exposed that newChar()'s own guard would ask about discarding a
      // character that had just been deleted, which is now fixed by clearing the watcher first.)
      for (const call of new Set([...branch.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\(\);/g)].map((m) => m[1]))) {
        const fnAt = src.indexOf(`function ${call}(`);
        if (fnAt !== -1) branch += "\n" + src.slice(fnAt, fnAt + 2600);
      }
      const clearsIdentity = /Id"\)\.value = "";/.test(branch) || /loadedIdentity = null;/.test(branch)
        || /"chToken"/.test(branch);
      const rebaselines = /markClean\(\)/.test(branch) || /decCleanSnapshot = null;/.test(branch);
      return { ok: clearsIdentity && rebaselines, clearsIdentity, rebaselines };
    };
    const bad = makers.map((f) => [f, halves(f)]).filter(([, r]) => !r.ok);
    rec("…and every one clears the identity AND re-baselines after a delete", bad.length === 0,
      { bad, note: "either half missing leaves the quit dialog able to re-create what was deleted" });

    // ⭐ AND THE ORDER, where the delete DELEGATES. characters.js clears the form by calling newChar(), and
    // newChar() opens with its own "you have unsaved changes — start a new one anyway?" guard. Delete an
    // edited character and that guard fires: the user is asked about discarding a character that no longer
    // exists, and cancelling leaves the form still showing it with its token filled in for a later Save to
    // write back. The watcher has to be cleared BEFORE the guarded call, not just somewhere inside it.
    const badOrder = [];
    for (const f of makers) {
      const src = read(f);
      const at = src.search(/fetch\("\/api\/[a-z-]+\/delete(-definition)?"/);
      if (at === -1) continue;
      const branch = src.slice(at, at + 2600);
      for (const call of new Set([...branch.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\(\);/g)].map((m) => m[1]))) {
        const fnAt = src.indexOf(`function ${call}(`);
        if (fnAt === -1) continue;
        const body = src.slice(fnAt, fnAt + 700);
        if (!/isDirty\(\)\)\s*\{/.test(body)) continue;      // the callee has no discard guard — nothing to trip
        const callAt = branch.indexOf(`${call}();`);
        const cleanAt = branch.search(/markClean\(\)|decCleanSnapshot = null;/);
        if (cleanAt === -1 || cleanAt > callAt) badOrder.push(`${f}: ${call}() is guarded but nothing clears the watcher first`);
      }
    }
    rec("…and a delete that delegates to a guarded function clears the watcher first", badOrder.length === 0, badOrder);
  }

  // The chain that made it dangerous, so a change to it is noticed here too.
  rec("CONTROL: the watcher still publishes an exit saver that clicks Save", /onSave: function \(\) \{ var b = document\.getElementById\(opts\.saveButtonId\); if \(b\) b\.click\(\); \}/.test(OVERLAY),
    "the quit-dialog Save path changed — re-check what a dirty page does on exit");
  rec("CONTROL: …and the Event maker still names its Save button to it", /saveButtonId: "saveEventBtn"/.test(EV), "same");
}

console.log("\n[Balance to 100% announces itself]");
{
  const at = CS.indexOf("balanceBtn.addEventListener");
  let handler = "";
  if (at !== -1) {
    let i = CS.indexOf("{", CS.indexOf("=>", at)), d = 0;
    for (; i < CS.length; i++) { if (CS[i] === "{") d++; else if (CS[i] === "}") { d--; if (d === 0) { handler = CS.slice(at, i + 1); break; } } }
  }
  rec("the Balance handler was extracted", handler.length > 300, handler.length);
  rec("it dispatches input", /el\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\);/.test(handler),
    "the delegated listener that IS this page's dirty check never fires");
  rec("…and change", /el\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\);/.test(handler), "same");
  // …but only for boxes that actually moved, or balancing an already-balanced country claims unsaved work.
  rec("…only when the box actually changes", /if \(el\.value === next\) return;/.test(handler),
    "clicking Balance on an already-balanced country would mark the page dirty");
  const assignAt = handler.indexOf("el.value = next;");
  const dispatchAt = handler.indexOf("dispatchEvent");
  rec("…after the value is written", assignAt !== -1 && dispatchAt > assignAt, { assignAt, dispatchAt });

  rec("CONTROL: the delegated dirty listeners are still what this page relies on",
    /panel\.addEventListener\("input", csMarkDirty, true\);/.test(CS) && /panel\.addEventListener\("change", csMarkDirty, true\);/.test(CS),
    "the dirty check changed shape — re-check every programmatic fill on this page");
  rec("CONTROL: …and all three guards still ask csDirty",
    /novaGuardSuiteNav\(\(\) => csDirty/.test(CS) && /if \(!csDirty\) \{ applyModSwitch\(\); return; \}/.test(CS) && /function csConfirmDiscard/.test(CS),
    "a guard was removed");
  rec("CONTROL: Save Details still reads the boxes live", /popularityInputs\(\)/.test(CS), "the payload no longer comes from the form");
}

console.log("\n[⭐ the same shape, anywhere else on this page]");
{
  // Any OTHER click handler in country-setup.js that writes into an input has the same problem. Load paths
  // legitimately assign without dispatching — they are establishing the baseline, not changing it — so this
  // looks only at click handlers.
  const handlers = [...CS.matchAll(/addEventListener\("click",[\s\S]{0,60}?\{/g)].map((m) => m.index);
  const offenders = [];
  for (const start of handlers) {
    let i = CS.indexOf("{", start + 20), d = 0, end = start;
    for (; i < CS.length; i++) { if (CS[i] === "{") d++; else if (CS[i] === "}") { d--; if (d === 0) { end = i; break; } } }
    const body = CS.slice(start, end + 1);
    if (body.length > 6000) continue; // a whole init block, not a single action
    // An assignment to .value on something that is not a local scratch variable.
    if (/\b(el|inp|input|inputs\[\w+\])\.value = /.test(body) && !/dispatchEvent/.test(body)) {
      offenders.push(CS.slice(start, start + 90).replace(/\s+/g, " "));
    }
  }
  console.log("     click handlers writing .value without announcing it: " + (offenders.length || "none"));
  offenders.forEach((o) => console.log("       " + o));
  rec("no click handler writes into an input without announcing it", offenders.length === 0, offenders);
}

console.log(`\n=== delete and balance reach the guard: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
