// #event-namespace-undeclared — AN EVENT SAVED INTO A FILE THAT DOES NOT DECLARE ITS NAMESPACE.
//
// HOI4 refuses to create an event whose namespace was never declared with `add_namespace`. Nova wrote that
// line only on the branch where the target file did NOT already exist, so any save landing in a pre-existing
// file that declares a different namespace produced an event the game never registers.
//
// Two reachable paths, and the first LOSES THE EVENT ENTIRELY:
//   (a) a rename that CHANGES the namespace. The home file is resolved from the previous id, so the block is
//       rewritten into the OLD namespace's file — and the rename cleanup then deletes the original. The event
//       the user just renamed exists nowhere.
//   (b) a brand-new event whose `<namespace>.txt` already exists declaring something else.
//
// Nova's own Mod Health rule `event_namespace_undeclared` flags both results at severity error, so the writer
// and the validator were contradicting each other.
//
// GROUND TRUTH: `add_namespace` is GLOBAL across mod + dependencies + vanilla, and case-insensitive — not
// per-file. So one declaration anywhere the game loads is enough; it does not have to sit in the file that
// uses it. That is why declaring it in the target file is a correct minimal fix rather than a workaround.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evns-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

const MOD = path.join(ROOT, "evnsmod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvNs"\nsupported_version="1.19.*"\n', "utf8");
const STORY = path.join(MOD, "events", "nua_story.txt");
fs.writeFileSync(STORY, `add_namespace = nua_story

country_event = {
\tid = nua_story.1
\ttitle = nua_story.1.t
\tdesc = nua_story.1.d
\tis_triggered_only = yes

\toption = {
\t\tname = nua_story.1.a
\t\tadd_political_power = 10
\t}
}
`, "utf8");

// Every add_namespace the mod declares, anywhere — the game reads them globally.
const declaredNamespaces = () => {
  const dir = path.join(MOD, "events");
  const out = new Set();
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!fs.statSync(p).isFile()) continue;
    for (const m of fs.readFileSync(p, "utf8").matchAll(/(^|\n)\s*add_namespace\s*=\s*([A-Za-z0-9_]+)/g)) {
      out.add(m[2].toLowerCase());
    }
  }
  return out;
};
// Every namespace actually USED by an event id.
const usedNamespaces = () => {
  const dir = path.join(MOD, "events");
  const out = new Set();
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!fs.statSync(p).isFile()) continue;
    for (const m of fs.readFileSync(p, "utf8").matchAll(/(^|\n)\s*id\s*=\s*([A-Za-z0-9_]+)\.\d+/g)) {
      out.add(m[2].toLowerCase());
    }
  }
  return out;
};

const PORT = 43011;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[control] the starting mod is consistent");
    rec("nua_story is declared", declaredNamespaces().has("nua_story"), [...declaredNamespaces()]);
    rec("…and every namespace in use is declared",
      [...usedNamespaces()].every((n) => declaredNamespaces().has(n)),
      { used: [...usedNamespaces()], declared: [...declaredNamespaces()] });

    console.log("\n[the bug] renaming an event into a NEW namespace");
    let r = await save({
      namespace: "nua_moved", id: "1", fileName: "nua_story.txt",
      type: "country_event", title: "", description: "", picture: "",
      triggeredOnly: "yes",
      options: [{ name: "nua_story.1.a", title: "Fine", script: "add_political_power = 10" }],
      previousEventId: "nua_story.1",
    });
    rec("the rename succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the event now uses nua_moved", usedNamespaces().has("nua_moved"), [...usedNamespaces()]);
    // The whole point: an event whose namespace is not declared is never created by the game.
    rec("…and nua_moved IS declared somewhere the game loads",
      declaredNamespaces().has("nua_moved"), [...declaredNamespaces()]);
    rec("…so no namespace is used without a declaration",
      [...usedNamespaces()].every((n) => declaredNamespaces().has(n)),
      { used: [...usedNamespaces()], declared: [...declaredNamespaces()] });
    rec("…and the original namespace's declaration is still intact",
      declaredNamespaces().has("nua_story"), [...declaredNamespaces()]);

    console.log("\n[the other path] a NEW event whose target file declares something else");
    r = await save({
      namespace: "nua_third", id: "7", fileName: "nua_story.txt",
      type: "country_event", title: "", description: "", picture: "",
      triggeredOnly: "yes",
      options: [{ name: "nua_third.7.a", title: "Ok", script: "add_political_power = 1" }],
    });
    rec("the new event saved", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and its namespace is declared too", declaredNamespaces().has("nua_third"), [...declaredNamespaces()]);
    rec("…with still nothing undeclared",
      [...usedNamespaces()].every((n) => declaredNamespaces().has(n)),
      { used: [...usedNamespaces()], declared: [...declaredNamespaces()] });

    console.log("\n[idempotent] saving again must not stack duplicate declarations");
    r = await save({
      namespace: "nua_third", id: "7", fileName: "nua_story.txt",
      type: "country_event", title: "", description: "", picture: "",
      triggeredOnly: "yes",
      options: [{ name: "nua_third.7.a", title: "Ok", script: "add_political_power = 1" }],
    });
    rec("the repeat save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    // Count across the WHOLE events dir, not one file: the save may legitimately land in
    // `<namespace>.txt`, and what matters is that repeated saves never stack a second declaration anywhere.
    const allEventText = fs.readdirSync(path.join(MOD, "events"))
      .map((f) => path.join(MOD, "events", f))
      .filter((p) => fs.statSync(p).isFile())
      .map((p) => fs.readFileSync(p, "utf8")).join("\n");
    const txt = allEventText;
    rec("…and nua_third is declared exactly once across the mod",
      (allEventText.match(/add_namespace\s*=\s*nua_third\b/g) || []).length === 1,
      (allEventText.match(/add_namespace\s*=\s*nua_third\b/g) || []).length);
    rec("…and so is nua_moved",
      (allEventText.match(/add_namespace\s*=\s*nua_moved\b/g) || []).length === 1,
      (allEventText.match(/add_namespace\s*=\s*nua_moved\b/g) || []).length);

    console.log("\n[safety]");
    let d = 0, ok = true;
    for (const ch of txt) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("the events file is brace-balanced", ok && d === 0, d);
    rec("…and every declaration is at the top level", /^add_namespace/m.test(txt), txt.slice(0, 200));

    console.log(`\n=== event namespace declared: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
