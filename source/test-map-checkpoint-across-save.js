// #checkpoint-predates-the-save
//
// SAVING CLEARS THE MAP'S UNDO STACK ON PURPOSE. CHECKPOINTS WALKED STRAIGHT PAST THAT RULE.
//
// The reason the undo stack is cleared is written beside the line that clears it: its snapshots predate the
// write, so an Undo would restore a model OLDER than the disk it no longer matches, and the next Save would
// put that stale state back over work just committed. That is correct, and the History panel shows it
// honestly — Undo greys out the moment you save.
//
// A checkpoint holds exactly such a snapshot, pendingWrites and all, and checkpoints were not cleared. The
// comment beside the clearing even offers them as the way to go further back. So the one route the code
// recommends for getting past a save is the one route that does the thing the clearing exists to prevent:
// the editor shows the older map, the mod on disk keeps the newer one, and a Save afterwards writes the old
// state back over the new.
//
// Nothing here can be made automatically safe. Reverting the FILES would need inverse writes that were
// never recorded — the staged model only ever knows how to move forward. So the fix is not to silently
// repair it but to stop it being invisible: a checkpoint records the save-generation it was taken at, the
// History panel marks it "· pre-save", and restoring one across that boundary states exactly what will and
// will not happen before it does anything.
//
// A checkpoint restored WITHIN a session is untouched by all this: it is a pure in-memory jump, and it must
// stay silent, or the warning becomes noise and gets clicked through.
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

const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
function blankComments(src) {
  let out = "", i = 0, state = "code", quote = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "str"; quote = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "str") {
      if (c === "\\") { out += c + (d || ""); i += 2; continue; }
      if (c === quote) state = "code";
      out += c; i++; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; out += c; } else out += " "; i++; continue; }
    if (state === "block") { if (c === "*" && d === "/") { state = "code"; out += "  "; i += 2; continue; } out += c === "\n" ? c : " "; i++; continue; }
  }
  return out;
}
const C = blankComments(SRC);
const fn = (name) => {
  const at = C.indexOf(`function ${name}(`);
  if (at === -1) return "";
  const open = C.indexOf("{", at);
  let d = 0;
  for (let i = open; i < C.length; i++) { if (C[i] === "{") d++; else if (C[i] === "}") { d--; if (d === 0) return C.slice(at, i + 1); } }
  return "";
};

console.log("\n[the boundary is recorded] a checkpoint knows which side of a save it is on");
{
  rec("there is a save counter", /let saveGeneration = 0;/.test(C), "nothing distinguishes a pre-save checkpoint");
  rec("…stamped onto every checkpoint", /checkpoints\.push\(\{ name, snapshot: snapshotMap\(\), generation: saveGeneration \}\)/.test(C), "checkpoints are unstamped");
  // ⭐ It must be bumped by the SAVE, at the same place the undo stack is cleared, or the two rules drift
  // apart the first time someone edits one of them.
  //
  // ⚠️ 2026-09-08: this used to look for the three statements INLINE at the end of flushMapSaves. They now
  // live in `markSaveBoundary`, because inline was the bug — every early return sat above them, so a save
  // that stopped part-way kept an undo stack whose snapshots restore `pendingWrites`, and one Ctrl+Z re-armed
  // writes that had already landed. #a-stopped-save-keeps-a-stale-undo-stack
  //
  // The co-location this test exists to protect is STRONGER now, not weaker: one function holds all three,
  // so anchor on that function rather than on where it happens to be called from.
  const boundary = fn("markSaveBoundary");
  rec("there is ONE owner for the save boundary", boundary !== "", "markSaveBoundary went away — re-check the whole premise");
  rec("the save still clears the undo stack", /undoStack = \[\]; redoStack = \[\];/.test(boundary), boundary.slice(0, 200));
  rec("…and sets the history label", /historyLabels = \[/.test(boundary), boundary.slice(0, 200));
  rec("…and bumps the counter in the same breath", /saveGeneration\+\+/.test(boundary), boundary.slice(0, 200));
  rec("…and repaints the list so the marks appear at once", /renderCheckpoints\(\)/.test(boundary), boundary.slice(0, 200));
  // …and nobody clears the stack behind its back.
  rec("…and flushMapSaves goes through it rather than clearing inline",
    /markSaveBoundary\(/.test(fn("flushMapSaves")) && !/undoStack = \[\]/.test(fn("flushMapSaves")),
    "flushMapSaves still clears the undo stack itself — two owners will drift");
  // A reload is a clean slate for both.
  rec("loading a map resets the counter", /checkpointSeq = 0; saveGeneration = 0;/.test(C), "a stale counter would mark fresh checkpoints as pre-save");
  rec("…and drops the checkpoints themselves", /checkpoints = \[\]; checkpointSeq = 0; saveGeneration = 0;/.test(C), "checkpoints would survive into another map");
}

console.log("\n[RUN IT] restoring, on each side of the boundary");
{
  const RESTORE = fn("restoreCheckpoint");
  rec("restoreCheckpoint is found", RESTORE.length > 200, RESTORE.length);

  // ⚠️ 2026-11-18 (B6-9, #a-checkpoint-makes-a-state-once): the question now says what the next Save does, which depends on what the
  // checkpoint QUEUES — one that queues an edit "writes this older map back over them"; one that queues nothing has nothing to write
  // (the judge's V2, below). So the snapshot queues one write by default, as a checkpoint taken mid-edit does.
  function run({ cpGeneration, now, dialog, answer, snapshot = { tag: "SNAP", pendingWrites: [{ url: "/api/map/set-owner", body: { stateId: 3, owner: "GER" }, meta: {} }] } }) {
    const ctx = {
      restored: 0, pushed: [], statuses: [], asked: null,
      checkpoints: [{ name: "before the big paint", snapshot, generation: cpGeneration }],
      saveGeneration: now,
      pushUndo(label) { ctx.pushed.push(label); },
      applyMapSnapshot(s) { ctx.restored++; ctx.restoredSnapshot = s; },
      setStatus(s) { ctx.statuses.push(s); },
      window: {},
    };
    if (dialog === "modal") {
      // ⚠ This used to stub window.showNovaConfirmModal — a name that does not exist on the Map page and
      // never did. It is a plain declaration inside research.js's IIFE, never assigned to window, and
      // map.html does not load research.js. So this branch was CERTIFYING a code path that could not run:
      // in the real page the probe was always false and the plain-confirm branch always won. The Map's
      // modal is window.novaConfirm, from ai-field-assist.js, which map.html does load.
      // #restore-baseline-never-asks found the same dead probe guarding a destructive restore with no
      // fallback at all.
      ctx.window.novaConfirm = (msg, onYes, opts) => { ctx.asked = { msg, opts, via: "modal" }; if (answer) onYes(); };
      ctx.window.confirm = () => { throw new Error("fell back to window.confirm even though a modal was available"); };
    } else {
      ctx.window.confirm = (msg) => { ctx.asked = { msg, via: "confirm" }; return answer; };
    }
    vm.createContext(ctx);
    vm.runInContext(RESTORE + "\nrestoreCheckpoint(0);", ctx);
    return ctx;
  }

  console.log("\n  within the session — must be silent");
  {
    const r = run({ cpGeneration: 0, now: 0, dialog: "modal", answer: false });
    rec("a same-session checkpoint restores with no question", r.asked === null && r.restored === 1, { asked: r.asked, restored: r.restored });
    rec("…and the restore is itself undoable", r.pushed.length === 1 && /Restore: before the big paint/.test(r.pushed[0]), r.pushed);
    rec("…and it says what happened", r.statuses.some((s) => /Restored checkpoint/.test(s)), r.statuses);
  }

  console.log("\n  across a save — must ask, and must not act unless told to");
  {
    const no = run({ cpGeneration: 0, now: 1, dialog: "modal", answer: false });
    rec("a pre-save checkpoint asks first", no.asked !== null, "it restored silently across a save");
    rec("…and cancelling restores NOTHING", no.restored === 0 && no.pushed.length === 0, { restored: no.restored, pushed: no.pushed });
    rec("…the question names the checkpoint", no.asked && no.asked.msg.includes("before the big paint"), no.asked && no.asked.msg);
    // The whole point is that the message is specific about the two halves.
    rec("…says the FILES are not reverted", no.asked && /stay exactly as they are|does not undo them/i.test(no.asked.msg), no.asked && no.asked.msg);
    rec("…and that saving afterwards overwrites them", no.asked && /writes this older map back over them/i.test(no.asked.msg), no.asked && no.asked.msg);
    rec("…and it is presented as dangerous", no.asked && no.asked.opts && no.asked.opts.danger === true, no.asked && no.asked.opts);
    // V2: a checkpoint that queues nothing puts no write back, so "Saving afterwards writes this older map back" was false for it (B6-9)
    const v2 = run({ cpGeneration: 0, now: 1, dialog: "modal", answer: false, snapshot: { tag: "SNAP", pendingWrites: [] } });
    rec("…and one that queues nothing says a Save has nothing of it to write, not that it writes the map back",
      !!v2.asked && /nothing of it to write/.test(v2.asked.msg) && !/writes this older map back/.test(v2.asked.msg), v2.asked && v2.asked.msg);

    const yes = run({ cpGeneration: 0, now: 1, dialog: "modal", answer: true });
    rec("agreeing does restore it", yes.restored === 1, yes.restored);
    rec("…and the restore is still undoable", yes.pushed.length === 1, yes.pushed);
  }

  console.log("\n  the fallback, when the modal helper is not on the page");
  {
    // The same trap as the shared unsaved-work watcher: this branch is the one place a wrong `else` acts
    // without asking, and it is invisible to any check that always supplies the dialog.
    const no = run({ cpGeneration: 0, now: 2, dialog: "confirm", answer: false });
    rec("it falls back to window.confirm", no.asked && no.asked.via === "confirm", no.asked);
    rec("…and NO still restores nothing", no.restored === 0, no.restored);
    const yes = run({ cpGeneration: 0, now: 2, dialog: "confirm", answer: true });
    rec("…and YES restores", yes.restored === 1, yes.restored);
  }

  console.log("\n  a checkpoint from before this fix has no stamp at all");
  {
    // Defensive: an unstamped checkpoint must not be treated as pre-save on every restore.
    const r = run({ cpGeneration: undefined, now: 3, dialog: "modal", answer: false });
    rec("an unstamped checkpoint is treated as current, not as pre-save", r.asked === null && r.restored === 1, { asked: r.asked, restored: r.restored });
  }
}

console.log("\n[the panel] a pre-save checkpoint is marked before you click it");
{
  const RENDER = fn("renderCheckpoints");
  rec("renderCheckpoints is found", RENDER.length > 100, RENDER.length);
  rec("…it marks pre-save rows", /pre-save/.test(RENDER), "the warning would be the first hint");
  rec("…comparing the stamp against the current generation", /c\.generation != null && c\.generation !== saveGeneration/.test(RENDER), "the mark is not derived from the boundary");
  rec("…and explains it on hover", /title="\$\{\(c\.generation/.test(RENDER), "no tooltip");
}

console.log("\n[CONTROL] the rest of the history model is unchanged");
{
  rec("checkpoints are still snapshots of the live model", /snapshot: snapshotMap\(\)/.test(C), "checkpoints changed shape");
  rec("restoring still copies on read, leaving the stored one pristine", /applyMapSnapshot\(cp\.snapshot\)/.test(C), "a restore could now corrupt the checkpoint");
  rec("the undo limit still applies", /undoStack\.length > UNDO_LIMIT/.test(C), "the cap went");
  rec("…and the save still clears redo too", /undoStack = \[\]; redoStack = \[\];/.test(C), "redo would survive a save");
}

console.log(`\n=== map checkpoint across save: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
