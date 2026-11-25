// #army-save-overwrites-an-outside-edit — A DIVISION ADDED BY HAND WHILE THE ARMY MAKER WAS OPEN WAS
// SILENTLY DELETED BY SAVE.
//
// /api/save carries the #stale-focus-save guard, and its comment explains why the other makers were thought
// not to need one:
//
//     "This endpoint writes the client's WHOLE file, unlike every other maker, which re-reads and merges."
//
// That is true of mergeOob, and it is not enough. A merge only protects what it KNOWS ABOUT: it preserves
// un-modelled fields inside a division it was told about, and it has no way to keep a division the client
// never mentioned — because "absent from the payload" is exactly how a DELETE is expressed. The merge cannot
// tell "the user deleted this" from "someone else added this".
//
// Reproduced against unit-data.js directly — load a file with two divisions, add a third in a text editor,
// edit one of the two in Nova, save:
//
//     on disk before save   1st, 2nd, 3rd (added by hand)
//     client sent           1st, 2nd
//     after save            1st, 2nd
//
// A hand-added division_template goes the same way. Nothing is destroyed — safeModWrite backs the file up
// first — but the modder is not told, and would have to know to go looking.
//
// Fixed the way the focus tree was: the load hands back a fingerprint of the exact text it read, the save
// compares it against the file as it is NOW, and refuses with 409 rather than merging into something it
// never saw. Enforced only when the client sends one, so anything that has not opted in behaves as before.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const unit = require("./unit-data.js");
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const DIV = (name, loc) =>
  `\tdivision = {\n\t\tname = "${name}"\n\t\tlocation = ${loc}\n\t\tdivision_template = "Line Infantry"\n\t}`;
const TPL = (name) => `division_template = {\n\tname = "${name}"\n\tregiments = { infantry = { x = 0 y = 0 } }\n}`;
const fileWith = (divs, tpls) => `${(tpls || [TPL("Line Infantry")]).join("\n")}\nunits = {\n${divs.join("\n")}\n}\n`;

(async () => {
  console.log("\n[the mechanism] a merge keeps what it was told about, and only that");
  {
    const atLoad = fileWith([DIV("1st", 100), DIV("2nd", 101)]);
    const onDiskNow = fileWith([DIV("1st", 100), DIV("2nd", 101), DIV("3rd (by hand)", 102)]);
    const loaded = unit.parseUnitsFile(atLoad);
    const client = loaded.units.divisions.map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] }));
    client[0]._dirty = true; client[0].officer = "Someone";
    // ⭐ ASSERT THE FIXTURE HAS THE PROPERTY.
    rec("the file on disk really has the extra division",
      unit.parseUnitsFile(onDiskNow).units.divisions.length === 3, unit.parseUnitsFile(onDiskNow).units.divisions.map((d) => d.name));
    const merged = unit.mergeOob(onDiskNow, { templates: loaded.templates, divisions: client });
    const names = unit.parseUnitsFile(merged).units.divisions.map((d) => d.name);
    rec("⭐ the merge DOES drop it — which is why the guard is needed", !names.includes("3rd (by hand)"), names);
    rec("…and it is not a merge bug: absent from the payload IS how a delete is expressed",
      names.length === 2 && names.includes("1st") && names.includes("2nd"), names);
    const tplNow = fileWith([DIV("1st", 100)], [TPL("Line Infantry"), TPL("Hand Added")]);
    const mergedTpl = unit.mergeOob(tplNow, { templates: loaded.templates, divisions: client.slice(0, 1) });
    rec("…and a hand-added template goes the same way",
      !(unit.parseUnitsFile(mergedTpl).templates || []).some((t) => t.name === "Hand Added"),
      (unit.parseUnitsFile(mergedTpl).templates || []).map((t) => t.name));
  }

  // ── the guard, over the real endpoints ──────────────────────────────────────────────────────────
  // A private port — never 47821, which is the user's own server.
  const PORT = 53455, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-army-stale-"));
  const oobPath = path.join(mod, "history", "units", "TST_nova.txt");
  try {
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Army Stale Test"\n');
    fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
    fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), 'capital = 1\noob = "TST_nova"\n');
    fs.mkdirSync(path.dirname(oobPath), { recursive: true });
    fs.writeFileSync(oobPath, fileWith([DIV("1st", 100), DIV("2nd", 101)]), "utf8");

    console.log("\n[the load hands back a fingerprint]");
    const load = await fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
    rec("the army loaded", load && load.ok === true && (load.divisions || []).length === 2, load && load.error);
    rec("⭐ …with a fingerprint of the file it read", typeof load.fingerprint === "string" && load.fingerprint.length > 0, load.fingerprint);

    const clientDivisions = (load.divisions || []).map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] }));
    const clientTemplates = (load.templates || []).map((t) => ({ name: t.name, regiments: t.regiments, support: t.support, _origName: t.name }));
    const post = (body) => fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ modPath: mod, tag: "TST", file: "TST_nova.txt", templates: clientTemplates, divisions: clientDivisions }, body)),
    });

    console.log("\n[someone edits the file, then the modder presses Save]");
    fs.writeFileSync(oobPath, fileWith([DIV("1st", 100), DIV("2nd", 101), DIV("3rd (by hand)", 102)]), "utf8");
    const before = fs.readFileSync(oobPath, "utf8");
    const stale = await post({ baseFingerprint: load.fingerprint });
    const staleBody = await stale.json();
    rec("⭐ the save is REFUSED", stale.status === 409 && staleBody.conflict === true, { status: stale.status, body: staleBody });
    rec("…and says what happened, in words", /changed on disk after you opened it/.test(String(staleBody.error || "")), staleBody.error);
    rec("…and names the file", /TST_nova\.txt/.test(String(staleBody.error || "")), staleBody.error);
    rec("⭐ …and NOTHING was written", fs.readFileSync(oobPath, "utf8") === before, "the file changed despite the refusal");
    rec("⭐ …so the hand-added division is still there",
      unit.parseUnitsFile(fs.readFileSync(oobPath, "utf8")).units.divisions.some((d) => d.name === "3rd (by hand)"),
      unit.parseUnitsFile(fs.readFileSync(oobPath, "utf8")).units.divisions.map((d) => d.name));

    console.log("\n[POSITIVE CONTROL] a guard that refuses everything is not a guard");
    // Reload, so the client is looking at the file as it now is — the recovery the message tells them to do.
    const reload = await fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
    rec("the reload sees all three divisions", (reload.divisions || []).length === 3, (reload.divisions || []).map((d) => d.name));
    rec("…and its fingerprint is a different one", reload.fingerprint && reload.fingerprint !== load.fingerprint, { was: load.fingerprint, now: reload.fingerprint });
    const good = await post({
      baseFingerprint: reload.fingerprint,
      divisions: (reload.divisions || []).map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] })),
    });
    const goodBody = await good.json();
    rec("⭐ a save with the CURRENT fingerprint goes through", good.status === 200 && goodBody.ok === true, { status: good.status, body: goodBody });
    rec("…and all three divisions survive it",
      unit.parseUnitsFile(fs.readFileSync(oobPath, "utf8")).units.divisions.length === 3,
      unit.parseUnitsFile(fs.readFileSync(oobPath, "utf8")).units.divisions.map((d) => d.name));

    console.log("\n[the save re-baselines] or the SECOND save refuses its own work");
    rec("⭐ the save returns the new fingerprint", typeof goodBody.fingerprint === "string" && goodBody.fingerprint.length > 0, goodBody.fingerprint);
    const second = await post({
      baseFingerprint: goodBody.fingerprint,
      divisions: (reload.divisions || []).map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] })),
    });
    rec("⭐ a second save using it is accepted", second.status === 200, second.status);
    // ⚠️ The pre-save fingerprint is ALSO still accepted here, and that is correct: a save that changes
    // nothing rewrites the file byte for byte — mergeOob round-trips faithfully — so the file never
    // changed and the old fingerprint still describes it. My first version of this check asserted the
    // opposite and was measuring nothing.
    rec("a no-edit save leaves the fingerprint alone, because it leaves the file alone",
      goodBody.fingerprint === reload.fingerprint, { was: reload.fingerprint, now: goodBody.fingerprint });

    // The real control: make a save that DOES change the file, then try to save against the fingerprint
    // from before it. That is what makes the re-baseline load-bearing.
    const withExtra = (reload.divisions || []).map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] }))
      .concat([{ name: "5th (added in Nova)", location: 105, template: "Line Infantry", forceVariants: [], _dirty: true }]);
    const changed = await post({ baseFingerprint: goodBody.fingerprint, divisions: withExtra });
    const changedBody = await changed.json();
    rec("a save that adds a division goes through", changed.status === 200 && changedBody.ok === true, { status: changed.status, body: changedBody });
    rec("…and the file really did change", changedBody.fingerprint !== goodBody.fingerprint, { was: goodBody.fingerprint, now: changedBody.fingerprint });
    const afterChangeStale = await post({ baseFingerprint: goodBody.fingerprint, divisions: withExtra });
    rec("⭐ CONTROL: saving against the fingerprint from BEFORE that change is refused", afterChangeStale.status === 409, afterChangeStale.status);
    const afterChangeFresh = await post({ baseFingerprint: changedBody.fingerprint, divisions: withExtra });
    rec("…and against the one the save returned, accepted", afterChangeFresh.status === 200, afterChangeFresh.status);

    console.log("\n[opt-in] a caller that sends no fingerprint behaves exactly as before");
    fs.writeFileSync(oobPath, fileWith([DIV("1st", 100), DIV("2nd", 101), DIV("4th (by hand)", 104)]), "utf8");
    const noFp = await post({});
    rec("a save with no baseFingerprint is not refused", noFp.status === 200, noFp.status);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
  }

  console.log("\n[the client opted in]");
  {
    // ⭐ DERIVED from the source: a guard the client never sends to is a guard that never fires.
    const A = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));
    rec("the model keeps the fingerprint it loaded with", /fingerprint: d\.fingerprint \|\| ""/.test(A), "army.js does not store it");
    rec("⭐ …and the save sends it", /baseFingerprint: S\.model\.fingerprint \|\| ""/.test(A), "army.js does not send it");
    rec("⭐ …and a successful save re-baselines it", /if \(d\.fingerprint\) S\.model\.fingerprint = d\.fingerprint;/.test(A),
      "without this the second save is refused against a stale fingerprint");
    // …and it must be re-baselined BEFORE the unsaved flag is cleared, so an interleaved failure cannot
    // leave the page thinking it is clean against a fingerprint it never updated.
    const at = A.indexOf("S.model.fingerprint = d.fingerprint");
    const clear = A.indexOf("setUnsaved(false)", at);
    rec("…before the page is marked clean", at > 0 && clear > at, { at, clear });
  }

  console.log(`\n=== army save refuses a stale file: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
