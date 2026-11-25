// 🌍 #a-dead-step-keeps-its-copies-folder — A STEP THAT DIED MAY ALREADY HAVE COPIED WHAT IT OVERWROTE, AND THE STOP NOTE MUST SAY WHERE.
//
// A step that stops with no answer (the builder died or ran out of memory in it, or was killed) can say nothing of what it wrote, so
// the note says it "stopped part-way and may already have written some of its files". Each step copies a file of the modder's into a
// folder of its own BEFORE it overwrites it (its backup scope), so that folder exists on disk the moment the first overwrite happened.
// Measured (reviewer, a re-roll whose builder died at Generate land's tenth write): Generate land had overwritten provinces.bmp,
// definition.csv, three region files and three state files, all copied first into .nova/generate_land/<mod>/<stamp> — and the note's
// "Copies of what it overwrote or deleted:" listed only Delete map's folder. The line that points at the dead step's copies
// ("Copies of what <step> overwrote before it stopped, if it got that far, are in a folder of their own under …") was written only
// when NO earlier step had a folder to list, which is never the case after step 1 has copied a descriptor.
//
// The steps are world-run.js STEPS (derived); the stop note is the page's own worldFailureNote, lifted by testlib-world-page.js.
"use strict";
const W = require("./world-run.js");
const WP = require("./testlib-world-page.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const NO_TIMERS = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
const page = WP.worldPage({ fetch: async () => { throw new Error("nothing to fetch"); }, timers: NO_TIMERS });
const P = page.sb;
const HOME = "C:/fixture/home/.nova";
const dirOf = (kind) => `${HOME}/${kind}/world_probe_0123456789/2026-10-21T00-00-00-000Z`;
// each step's answer as it reads once the step has finished, naming the folder its copies went into
const ANSWERS = {
  prepare: { ok: true, plan: { bitmap: { bytes: 1048576 } }, bitmapCopied: true, descriptorsWritten: ["descriptor.mod", "world_probe.mod"], backups: { dir: dirOf("new_worlds"), files: 2, failed: 0, written: 3, created: 1 } },
  blank: { ok: true, changed: true, flippedProvinces: 280, deletedStates: 34, snapshotPath: dirOf("blanked_maps"), snapshotted: 34 },
  generate: { ok: true, changed: true, flippedProvinces: 105, createdStates: 34, asked: { pct: 35, sea: 298, seed: 1 }, backups: { dir: dirOf("generate_land"), files: 5, failed: 0, written: 60, created: 50 } },
  autofix: { ok: true, fixes: { backupSnapshot: { dir: dirOf("auto_fixes"), files: 3, failed: 0 } } },
  regions: { plan: { summary: {} }, wrote: true, write: { ok: true, summary: { regions: 5 }, backups: dirOf("region_rebuilds"), backupsCopied: 2 } },
  check: { validate: { problems: [] }, offered: ["division_starts_on_water"] },
};
/** A run whose builder died in `key` (no answer from it), every step before it done. */
function diedIn(key, { earlierCopies = true } = {}) {
  const at = W.STEPS.findIndex((s) => s.key === key);
  const steps = W.STEPS.map((s, i) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional,
    state: i < at ? "done" : i === at ? "failed" : "not-run", startedAt: i <= at ? 1 : null, endedAt: i <= at ? 2 : null, error: i === at ? "the world builder stopped unexpectedly (exit code 9)" : "" }));
  const answers = {};
  for (const s of W.STEPS.slice(0, at)) {
    answers[s.key] = JSON.parse(JSON.stringify(ANSWERS[s.key]));
    if (!earlierCopies) {
      const a = answers[s.key];
      if (a.backups && typeof a.backups === "object") a.backups = Object.assign(a.backups, { dir: "", files: 0 });
      if (a.snapshotPath) { a.snapshotPath = ""; a.snapshotted = 0; }
      if (a.fixes) delete a.fixes.backupSnapshot;
      if (a.write) a.write.backupsCopied = 0;
    }
  }
  return { id: "x", modName: "world_probe", state: "failed", failedStep: key, error: "the world builder stopped unexpectedly (exit code 9)", stepIndex: at, step: key,
    steps, answers, plan: { copiesUnder: HOME }, leftovers: [], startedAt: 0, endedAt: 1000 };
}
const partWay = (title) => `${title} stopped part-way and may already have written some of its files.`;

// every step that writes into the mod and can die with no answer (the check only reads)
const keys = W.STEPS.map((s) => s.key).filter((k) => k !== "prepare" && k !== "check");
rec("THE STEPS: derived from world-run.js STEPS (a step that writes, after step 1)", keys.length >= 4 && keys.includes("generate"), keys);
for (const key of keys) {
  const title = W.STEPS.find((s) => s.key === key).title;
  // the control: with no earlier folder, the note does say where the dead step's copies go
  const control = P.worldFailureNote(diedIn(key, { earlierCopies: false }));
  rec(`${key}: THE CONTROL — with no earlier folder to list, the note says where ${title}'s copies would be`, control.includes(`Copies of what ${title} overwrote`), control);
  const note = P.worldFailureNote(diedIn(key));
  rec(`${key}: the note knows the step died with no answer ("${partWay(title)}")`, note.includes(partWay(title)), note);
  rec(`${key}: …it lists the earlier steps' folders`, note.includes(dirOf("new_worlds")), note);
  rec(`${key}: ⭐ …AND says where ${title}'s own copies are, though earlier steps had folders to list`, note.split("\n").some((l) => /cop(y|ies)/i.test(l) && l.includes(title) && !l.startsWith("· ")), note);
  // …and when the main server found the folder the step made (copiesDirs, read off disk at the run's end), the note names IT
  const found = diedIn(key);
  const own = dirOf(W.STEPS.find((s) => s.key === key).key + "_own");
  found.steps.find((s) => s.key === key).copiesDirs = [own];
  const named = P.worldFailureNote(found);
  rec(`${key}: ⭐ …and names the very folder the step made, when the main server found it`, named.split("\n").some((l) => l === `Copies of what ${title} overwrote before it stopped: ${own}`), named);
  // the run Nova was closed on says where the copies are too: each finished step's folder, then the one the stopped step made
  const shut = Object.assign(diedIn(key), { state: "interrupted" });
  shut.steps.find((s) => s.key === key).state = "interrupted";
  shut.steps.find((s) => s.key === key).copiesDirs = [own];
  const shutNote = P.worldInterruptedNote(shut);
  rec(`${key}: ⭐ a run Nova was closed on names the folders, the stopped step's last`, shutNote.includes(dirOf("new_worlds")) && shutNote.includes(own) && shutNote.indexOf(dirOf("new_worlds")) < shutNote.indexOf(own), shutNote);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
