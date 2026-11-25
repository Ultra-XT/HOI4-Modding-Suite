// #all-countries-date-never-written
//
// AN EVENT'S FIRE DATE DOES NOT LIVE IN THE EVENT FILE. IT LIVES IN THE on_startup GRANT.
//
// So saving the event is not enough: the grant has to be rewritten too. syncEventOwnersToGame did that only
// when "All countries" was being switched ON — `(isAll && !wasAll)`. For an event already granted to
// everyone, changing the fire date sent no request at all. The event file saved, the grant kept its old
// delay, and the user was told it had saved. The per-country branch does not cover it either: when isAll is
// set, that branch only ever REMOVES individual tags.
//
// Verified in the running Event Maker on Millennium Dawn (start 2000.1.1), with every write stubbed:
//
//     grant All countries, date 2001.1.1, Save   → events/save + set-startup-all, eventDays 366
//     already granted, change to 2005.6.1, Save  → events/save + set-startup-all, eventDays 1978   ← the fix
//     Save again with nothing changed            → events/save only, no grant rewrite
//
// The third line matters as much as the second: the rewrite is triggered by a CHANGED schedule, compared
// against what was on disk when the event loaded, so an ordinary save of an unchanged event still writes
// nothing extra. That is also why the loaded schedule is re-anchored after a successful write — otherwise a
// second save in the same session would compare against the original date and rewrite a correct grant.
//
// Same function had a second hole: syncDateHint returns { days, hours, valid } and nothing read `valid`.
// On a rejected date it returns { days: 0, hours: 0, valid: false }, so an out-of-range hour quietly
// scheduled the event for day one and the save reported success. Confirmed on the page: hour 25 gives
// "⚠ Hour must be 0–23 … there's no hour 25", and now writes no schedule at all and says so.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
const JS = stripJsComments(fs.readFileSync(path.join(PUB, "events.js"), "utf8"));

function fnText(code, name) {
  const at = code.search(new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\("));
  if (at === -1) return "";
  let p = code.indexOf("(", at), d = 0, sigEnd = -1;
  for (let k = p; k < code.length; k++) { if (code[k] === "(") d++; else if (code[k] === ")") { d--; if (d === 0) { sigEnd = k; break; } } }
  if (sigEnd === -1) return "";
  let i = code.indexOf("{", sigEnd); d = 0;
  let mode = null, quote = "";
  for (; i < code.length; i++) {
    const c = code[i], pr = code[i - 1];
    if (mode) {
      if (mode === "str" && c === quote && pr !== "\\") mode = null;
      else if (mode === "re" && c === "/" && pr !== "\\") mode = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { mode = "str"; quote = c; continue; }
    if (c === "/" && /[=(,:[!&|?{};]\s*$/.test(code.slice(Math.max(0, i - 12), i))) { mode = "re"; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
  }
  return "";
}

const SYNC = fnText(JS, "syncEventOwnersToGame");

console.log("\n[the schedule is remembered] so a change to it can be detected");
{
  rec("the loaded schedule is kept", /let loadedEventDays = 0;/.test(JS) && /let loadedEventHours = 0;/.test(JS), "nothing records what was on disk");
  rec("…set when the event's grant loads", /loadedEventDays = days; loadedEventHours = hours;/.test(JS), "the baseline is never filled in");
  rec("…and cleared with the rest of the bridge", /loadedEventDays = 0; loadedEventHours = 0;/.test(fnText(JS, "clearEventBridge")), "a stale schedule would survive into the next event");
}

console.log("\n[the grant is rewritten when the date changes]");
{
  rec("syncEventOwnersToGame is found", SYNC.length > 800, SYNC.length);
  rec("…it works out whether the schedule changed", /const scheduleChanged = eventDays !== loadedEventDays \|\| eventHours !== loadedEventHours;/.test(SYNC), SYNC.slice(0, 200));
  // ⭐ THE BUG: this used to be `(isAll && !wasAll)` alone.
  rec("…and writes the grant on a change, not only on switch-on", /isAll && \(!wasAll \|\| scheduleChanged\)/.test(SYNC), "an already-all event still cannot change its date");
  rec("…carrying the date with it", /set-startup-all"[\s\S]{0,160}eventDays, eventHours/.test(SYNC), "the grant is written without the schedule");
  // …and it must not write when nothing moved, or every save touches the mod for no reason.
  rec("…and re-anchors only after a successful write", /if \(allAdded\) \{ loadedEventDays = eventDays; loadedEventHours = eventHours; \}/.test(SYNC), "a failed write would look like it landed");
}

console.log("\n[an invalid date writes nothing and says so]");
{
  rec("the validity flag is read", /t\.valid === false/.test(SYNC), "syncDateHint reports `valid` and nothing reads it");
  rec("…and it refuses before any write", SYNC.indexOf("t.valid === false") < SYNC.indexOf("set-startup"), "it refuses after already writing");
  rec("…reporting it as a failure the caller prints", /failed: \[\{ who: "Fire date"/.test(SYNC), "the refusal would be silent");
  // The producer of that flag has to keep producing it.
  const hint = fnText(JS, "syncDateHint");
  rec("CONTROL: syncDateHint still reports validity", /valid: false/.test(hint) && /valid: true/.test(hint), "the flag stopped being produced");
  rec("CONTROL: …and still rejects an hour outside 0–23", /f\.hour < 0 \|\| f\.hour > 23/.test(hint), "the hour range check went");
}

console.log("\n[CONTROL] the rest of the owner sync is unchanged");
{
  rec("a refused write is still collected", /failed\.push\(\{ who, error/.test(SYNC), "refusals are swallowed again");
  rec("…and a non-2xx still counts as refused", /!r\.ok \|\| \(data && data\.error\)/.test(SYNC), "a 400 would read as success");
  rec("turning All countries OFF still un-grants it", /!isAll && wasAll/.test(SYNC), "the removal path went");
  rec("per-country owners are still written when not All", /eventOwners\.forEach\(\(tag\)/.test(SYNC), "individual owners stopped being written");
  rec("…and loadedOwners still records what actually landed", /loadedOwners = nowLoaded;/.test(SYNC), "the disk belief is no longer updated");
  rec("the caller still surfaces the failures", /ownerSync\.failed\.length/.test(JS), "failures are computed and never shown");
}

console.log(`\n=== event fire date reaches the grant: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
