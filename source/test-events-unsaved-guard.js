// #makers-lose-unsaved-work
//
// THE EVENT MAKER THREW AWAY A FINISHED EVENT WITHOUT ASKING.
//
// An event is the most expensive thing to lose in this app: a trigger, an immediate block, an after block,
// and an effect script per option. Clicking another event in the list overwrote all of it, and so did
// changing the mod. There was no dirty flag, no navigation guard and no confirmation anywhere on the page —
// the same for Spirits/Ideas and Characters.
//
// The pattern now has ONE OWNER, novaWatchUnsaved in loading-overlay.js, next to the nav guard that already
// lived there. It is the Decisions maker's design — snapshot the editor on load and COMPARE, rather than
// setting a flag on the first keystroke — because comparing means undoing an edit by hand makes the page
// quietly clean again, which a flag can never do. What it does not copy is Decisions' hand-written list of
// field ids; it asks the DOM (#decision-guard-list-goes-stale).
//
// Three things this had to get right, each found by watching the real page rather than by reading:
//
//   1. KEY BY POSITION, NOT BY ID. An event's OPTIONS are built at runtime as <div class="event-option">
//      holding .opt-name / .opt-title / .opt-script / .opt-trigger — no ids at all. An id-keyed snapshot
//      would have ignored the single most authored part of an event.
//
//   2. THE LOAD IS NOT OVER WHEN THE CLICK HANDLER RETURNS. loadEventBridge() fetches the event's schedule
//      and then writes the fire-date fields — and can lift a Nova-managed `date > Y.M.D` line out of the
//      trigger box. Measured: eventDateHour moved from "" to "0" about 200ms after the click, so every
//      freshly-opened event announced unsaved changes. Two causes, both fixed: the baseline is now retaken
//      when the bridge settles, and setDateFields' `h || 0` turned "" into 0 — so the branch whose own
//      comment reads "leave date blank" blanked three boxes and wrote a 0 into the fourth.
//
//   3. A LATE RE-BASELINE MUST NOT SWALLOW TYPING. The fetch is slow enough to type into, and a plain
//      markClean() there would adopt those keystrokes as the unedited state and let the next click discard
//      them — the very bug this exists to prevent, arriving through its own fix. markCleanUnlessTouched()
//      skips the re-baseline once anything in the editor has fired input or change.
//
// Verified in the running Event Maker on Millennium Dawn:
//     open an event                              → clean, hour box blank, no prompt
//     switch to another                          → no prompt
//     edit the trigger → click another event     → asks, and stays on the event you were editing
//     revert that edit by hand                   → clean again, switches with no prompt
//     edit an OPTION's effect script             → asks (the class-only, id-less case)
//     nav link with unsaved work                 → asks; cancel blocks it, agree lets it through
//     type WHILE the bridge is still loading     → the typing survives and the page stays dirty
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
// ⭐ The prose above and in the fixes names every symbol checked below, `markCleanUnlessTouched` included.
const OVERLAY = stripJsComments(fs.readFileSync(path.join(PUB, "loading-overlay.js"), "utf8").replace(/\r\n/g, "\n"));   // #a-lift-reads-lf
const EVENTS = stripJsComments(fs.readFileSync(path.join(PUB, "events.js"), "utf8"));

/** Brace-match a block starting at `at`. */
function block(src, at) {
  const open = src.indexOf("{", at);
  let d = 0;
  for (let i = open; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); } }
  return "";
}

// ── A fake DOM just rich enough to run the watcher against ──────────────────────────────────────────
function fakeDom(controls) {
  const listeners = { input: [], change: [] };
  const root = {
    __novaTouchWired: false,
    querySelectorAll: () => controls,
    addEventListener: (t, fn) => { (listeners[t] || (listeners[t] = [])).push(fn); },
  };
  return {
    root, listeners,
    fire: (t) => (listeners[t] || []).forEach((fn) => fn({})),
    document: { querySelector: () => root, getElementById: () => null },
  };
}
function loadWatcher(ctxExtras) {
  const at = OVERLAY.indexOf("(function () {\n  if (window.novaWatchUnsaved) return;");
  const src = at === -1 ? "" : block(OVERLAY, OVERLAY.indexOf("{", at)) ;
  return { at, src };
}

console.log("\n[the shared owner] novaWatchUnsaved exists and is not a copy in each page");
{
  rec("loading-overlay.js exposes it", /window\.novaWatchUnsaved = function/.test(OVERLAY), "no shared watcher");
  rec("…and it registers with the nav guard itself", /novaGuardSuiteNav\(api\.isDirty/.test(OVERLAY), "each page would have to remember to");
  rec("…passing a saver so Electron's quit dialog works", /onSave: function[\s\S]{0,120}saveButtonId/.test(OVERLAY), "quitting would dead-end on Save Failed");
  // No page may grow its own copy of the pattern.
  //
  // ⚠️ THE CHECK IS ON WHAT THE SELECTOR DOES, NOT ON THE SELECTOR.
  //
  // This used to fail any page containing `querySelectorAll("input, textarea, select")` at all, as a proxy
  // for "reimplements the snapshot". That was accurate until a page needed the same selector to CLEAR the
  // editor on a mod switch — a use that has nothing to do with dirty-tracking, and which is deliberately
  // derived rather than a hand-written field list precisely so it cannot rot.
  //
  // A reimplementation READS the controls into a value to compare later: it maps or joins or stringifies
  // them. A clear WRITES to them. So the discriminator is what happens to the result, and the shared-owner
  // guarantee is unchanged: a page that builds its own snapshot is still caught.
  const buildsOwnSnapshot = (src) => {
    if (/function\s+\w*EditorSnapshot/.test(src)) return true;
    // the selector feeding a value-builder within a short window = a snapshot being assembled
    return /querySelectorAll\("input, textarea, select"\)[\s\S]{0,200}?(\.map\(|\.join\(|JSON\.stringify\()/.test(src);
  };
  for (const f of ["events.js", "ideas.js", "characters.js"]) {
    const src = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
    if (!/novaWatchUnsaved/.test(src)) continue;
    rec(`${f} uses the shared watcher rather than its own snapshot`, !buildsOwnSnapshot(src), f + " reimplements it");
  }
  // CONTROL: the narrowed check must still catch a real reimplementation, or it has been softened into
  // uselessness. Both shapes the rule exists to forbid, composed here rather than trusted.
  rec("…and a page that DID build its own snapshot would still be caught",
    buildsOwnSnapshot(`const snap = () => [...root.querySelectorAll("input, textarea, select")].map(e => e.value).join("|");`),
    "the narrowing must not have disarmed the rule");
  rec("…including the named-function shape",
    buildsOwnSnapshot(`function eventEditorSnapshot() { return 1; }`));
  // …and the legitimate use must pass, or the narrowing did nothing.
  rec("…while clearing fields with the same selector is allowed",
    !buildsOwnSnapshot(`panel.querySelectorAll("input, textarea, select").forEach((el) => { el.value = ""; });`));
}

console.log("\n[RUN IT] the real watcher, against a stand-in editor");
{
  const at = OVERLAY.indexOf("window.novaWatchUnsaved = function (opts)");
  const fnSrc = at === -1 ? "" : block(OVERLAY, OVERLAY.indexOf("{", OVERLAY.indexOf("(opts)", at)));
  rec("the watcher factory was extracted", fnSrc.length > 400, fnSrc.length);

  function make(controls) {
    const dom = fakeDom(controls);
    const ctx = {
      confirmCalls: [], proceeded: 0,
      document: dom.document,
      window: {
        novaConfirm: (msg, onYes, opts2) => { ctx.confirmCalls.push({ msg, opts: opts2 }); if (ctx.agree) onYes(); },
        // novaGuardSuiteNav deliberately absent: the watcher must work without it.
      },
      agree: false, api: null,
    };
    vm.createContext(ctx);
    vm.runInContext(`api = (${fnSrc.startsWith("{") ? "function (opts) " + fnSrc : fnSrc})({ root: "#x", label: "the Event Maker", ignoreIds: ["aiEventPrompt"] });`, ctx);
    return { ctx, dom };
  }

  const mk = (over) => Object.assign({ id: "", className: "", tagName: "INPUT", type: "text", value: "", checked: false }, over);

  {
    const controls = [mk({ id: "eventTitle" }), mk({ className: "opt-script", tagName: "TEXTAREA", type: "textarea" })];
    const { ctx } = make(controls);
    rec("nothing loaded yet means nothing to lose", ctx.api.isDirty() === false, "a fresh page would prompt");
    ctx.api.markClean();
    rec("…and it is still clean right after the baseline", ctx.api.isDirty() === false, ctx.api.snapshot());

    controls[0].value = "Hello";
    rec("an id-bearing field is noticed", ctx.api.isDirty() === true, ctx.api.snapshot());
    controls[0].value = "";
    rec("…and putting it back by hand goes clean again", ctx.api.isDirty() === false, ctx.api.snapshot());

    // ⭐ THE ONE AN ID-KEYED SNAPSHOT WOULD MISS.
    controls[1].value = "add_political_power = 100";
    rec("a class-only option field is noticed too", ctx.api.isDirty() === true, ctx.api.snapshot());
    controls[1].value = "";
  }

  {
    const controls = [mk({ id: "eventHidden", type: "checkbox" })];
    const { ctx } = make(controls);
    ctx.api.markClean();
    controls[0].checked = true;
    rec("ticking a checkbox is noticed", ctx.api.isDirty() === true, "its .value never moves, so .value would miss it");
  }

  {
    const controls = [mk({ id: "aiEventPrompt", tagName: "TEXTAREA", type: "textarea" }), mk({ id: "eventTitle" })];
    const { ctx } = make(controls);
    ctx.api.markClean();
    controls[0].value = "write me an event about oil";
    rec("the AI prompt box is ignored on purpose", ctx.api.isDirty() === false, "typing a prompt would offer to discard it");
  }

  {
    const controls = [mk({ id: "eventTitle" })];
    const { ctx } = make(controls);
    ctx.api.markClean();
    // CLEAN → straight through, no question asked.
    let ran = 0;
    ctx.api.confirmDiscard("Switch event", () => ran++);
    rec("a clean editor is never interrupted", ran === 1 && ctx.confirmCalls.length === 0, { ran, asked: ctx.confirmCalls.length });

    // DIRTY + cancel → the work stays.
    controls[0].value = "edited";
    ran = 0;
    ctx.api.confirmDiscard("Switch event", () => ran++);
    rec("a dirty editor asks", ctx.confirmCalls.length === 1, ctx.confirmCalls);
    rec("…and cancelling keeps the work", ran === 0 && ctx.api.isDirty() === true, { ran, dirty: ctx.api.isDirty() });
    rec("…naming the editor in the question", /Event Maker/.test(ctx.confirmCalls[0].msg), ctx.confirmCalls[0]);
    rec("…and offering a way back", /Keep editing/i.test((ctx.confirmCalls[0].opts || {}).cancelLabel || ""), ctx.confirmCalls[0].opts);

    // DIRTY + agree → through, and clean afterwards so the next hop is silent.
    ctx.agree = true; ran = 0;
    ctx.api.confirmDiscard("Switch event", () => ran++);
    rec("agreeing goes through", ran === 1, ran);
    rec("…and clears the baseline", ctx.api.isDirty() === false, "the next click would ask again");
  }

  console.log("\n  the fallback path, when novaConfirm is not on the page");
  {
    // Found by the back-out control: breaking this branch changed nothing, because every other check here
    // supplies novaConfirm. It is the branch that runs if the shared dialog has not loaded, and the one
    // place a wrong `else` silently discards the user's work instead of keeping it.
    function makeBare(answer) {
      const dom = fakeDom([{ id: "eventTitle", className: "", tagName: "INPUT", type: "text", value: "", checked: false }]);
      const ctx = { document: dom.document, window: { confirm: () => answer }, api: null, proceeded: 0 };
      vm.createContext(ctx);
      vm.runInContext(`api = (${fnSrc.startsWith("{") ? "function (opts) " + fnSrc : fnSrc})({ root: "#x", label: "the Event Maker" });`, ctx);
      ctx.api.markClean();
      dom.root.querySelectorAll()[0].value = "edited";
      ctx.api.confirmDiscard("Switch event", () => ctx.proceeded++);
      return ctx;
    }
    const said_no = makeBare(false);
    rec("without novaConfirm it still asks, and NO keeps the work", said_no.proceeded === 0 && said_no.api.isDirty() === true, { proceeded: said_no.proceeded });
    const said_yes = makeBare(true);
    rec("…and YES goes through", said_yes.proceeded === 1 && said_yes.api.isDirty() === false, { proceeded: said_yes.proceeded });
  }

  console.log("\n  the late re-baseline must not swallow typing");
  {
    const controls = [mk({ id: "eventTrigger", tagName: "TEXTAREA", type: "textarea" })];
    const { ctx, dom } = make(controls);
    ctx.api.markClean();
    // Untouched: the async half of the load is allowed to re-baseline.
    controls[0].value = "written by the loader";
    ctx.api.markCleanUnlessTouched();
    rec("an untouched editor DOES re-baseline", ctx.api.isDirty() === false, "a loaded event would read as edited");

    // Touched: it must not.
    ctx.api.markClean();
    controls[0].value = "typed by the user";
    dom.fire("input");                  // what a real keystroke does
    ctx.api.markCleanUnlessTouched();
    rec("…but a touched one does NOT", ctx.api.isDirty() === true, "the user's typing was adopted as the baseline and would be lost");
    rec("…and the touch listener is on the capture phase", /addEventListener\("input", noteTouched, true\)/.test(OVERLAY), "a stopPropagation could hide a keystroke");
  }
}

console.log("\n[the Event Maker] wired to it, on every path that discards the editor");
{
  rec("the page creates a watcher", /novaWatchUnsaved\(\{/.test(EVENTS), "the Event Maker is unguarded again");
  rec("…scoped to the editor panel", /root: "\.event-editor-panel"/.test(EVENTS), "scope changed — a search box could raise a prompt");
  rec("…and told which button saves", /saveButtonId: "saveEventBtn"/.test(EVENTS), "Electron's quit dialog would dead-end");
  rec("clicking another event asks first", /evUnsaved\.confirmDiscard\("Switch event"/.test(EVENTS), "the list click is unguarded");
  rec("switching mod asks too", /evUnsaved\.confirmDiscard\("Switch mod"/.test(EVENTS), "the mod dropdown is unguarded");
  // Cancelling a mod switch must leave the dropdown naming the mod that is actually loaded.
  const mod = /selector\.addEventListener\("change"[\s\S]{0,900}?\n {6}\}\);/.exec(EVENTS);
  rec("…putting the dropdown back BEFORE it asks", mod && mod[0].indexOf("selector.value = previous") < mod[0].indexOf('confirmDiscard("Switch mod"'), mod && mod[0].slice(0, 200));
  rec("a loaded event becomes the baseline", /evUnsaved\.markClean\(\)/.test(EVENTS), "nothing would ever be clean");
  rec("…and again once the async half lands", /markCleanUnlessTouched\(\)/.test(EVENTS), "every opened event would look edited");
  rec("…via the bridge promise, not a timer", /Promise\.resolve\(bridgeLoad\)/.test(EVENTS), "a timeout would be a guess");
}

console.log("\n[the drift itself] 'leave date blank' has to leave it blank");
{
  const at = EVENTS.indexOf("function setDateFields(");
  const fnSrc = at === -1 ? "" : block(EVENTS, at);
  rec("setDateFields is found", fnSrc.length > 100, fnSrc.length);
  const run = (y, mo, d, h) => {
    const els = {};
    const ctx = { document: { getElementById: (id) => (els[id] = els[id] || { value: "__unset__" }) }, els };
    vm.createContext(ctx);
    vm.runInContext(fnSrc + `\nsetDateFields(${JSON.stringify(y)}, ${JSON.stringify(mo)}, ${JSON.stringify(d)}, ${JSON.stringify(h)});`, ctx);
    return Object.fromEntries(Object.entries(els).map(([k, v]) => [k, v.value]));
  };
  const blanked = run("", "", "", "");
  rec("blanking the row blanks the HOUR as well", blanked.eventDateHour === "", blanked);
  rec("…and the other three", blanked.eventDateYear === "" && blanked.eventDateMonth === "" && blanked.eventDateDay === "", blanked);
  // The 0 default is still right when there IS a date and no hour was supplied.
  const dated = run(1936, 1, 1, undefined);
  rec("a real date with no hour still defaults to 0", String(dated.eventDateHour) === "0", dated);
  const withHour = run(1936, 1, 1, 14);
  rec("…and a supplied hour is kept", String(withHour.eventDateHour) === "14", withHour);
}

console.log("\n[CONTROL] the surrounding machinery is untouched");
{
  rec("the shared nav guard still exists", /window\.novaGuardSuiteNav = function/.test(OVERLAY), "the nav guard vanished");
  rec("…and still gates its own beforeunload on Electron", /isElectron[\s\S]{0,600}addEventListener\("beforeunload"/.test(OVERLAY), "the Electron gate is gone");
  rec("events.js registers no beforeunload of its own", !/addEventListener\("beforeunload"/.test(EVENTS), "a raw beforeunload would kill the nav bar under Electron");
  rec("the event list still renders cards", /event-item-card/.test(EVENTS), "the list changed shape — re-check the click guard");
  rec("options are still class-only, which is why position keying matters", /class="opt-script"/.test(EVENTS), "options gained ids; the keying note is stale");
}

console.log(`\n=== events unsaved guard: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
