// #event-rename-drops-preserved — RENAMING AN EVENT THREW AWAY EVERYTHING AN ORDINARY SAVE KEEPS.
//
// The same-id save is byte-perfect — that is what made this look safe. The RENAME path destroyed the lot:
// conditional desc blocks (so the renamed event had NO description in game at all), the author's own
// declared loc key pointer, a scripted `picture = [GetHitlerHandshakeEventPicture]` reverted to
// GFX_report_event_001, the mtth modifier, the ai_chance modifier, unmodelled keys like show_sound, and
// every comment. All of it reported as {"ok":true,"renamedFrom":"…"}.
//
// One cause, three call sites: during a rename `eventFullId` is the id being renamed TO, which is not on
// disk yet, so every preserve lookup keyed on it returned empty. The file lookup a few lines above already
// falls back to prevEventId for exactly this reason.
//
// And the OPTION-keyed lookups needed more than that: options are re-prefixed to the new id BEFORE the
// lookups run, so onDiskAiChance and preserved.optionComments — both keyed by the names as they were on
// disk — still missed. The handler now keeps an old→new map and remaps them.
//
// The verifier sharpened one point: for factor-form `ai_chance = { factor = 5 modifier = {…} }` the block is
// DELETED outright on rename, not flattened, because the model's aiChance is null for that shape and the
// on-disk fallback missed. That re-opened #event-ai-chance-flattened (vanilla's romania.1 "Refuse") through
// the rename path.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evren-"));
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

const MOD = path.join(ROOT, "evrenmod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvRen"\nsupported_version="1.19.*"\n', "utf8");
const EV = path.join(MOD, "events", "nova_pres.txt");
const ORIGINAL = `add_namespace = nova_pres

country_event = {
\tid = nova_pres.5
\ttitle = NUA_PRES_AUTHOR_TITLE
\tdesc = {
\t\ttext = nova_pres.5.d.war
\t\ttrigger = { has_war = yes }
\t}
\tdesc = {
\t\ttext = nova_pres.5.d.peace
\t\ttrigger = { has_war = no }
\t}
\tpicture = [GetHitlerHandshakeEventPicture]
\tshow_sound = event_sound_test
\tis_triggered_only = yes

\tmean_time_to_happen = {
\t\tdays = 60
\t\tmodifier = {
\t\t\tfactor = 0.5
\t\t\thas_war = yes
\t\t}
\t}

\t# The generous choice
\toption = {
\t\tname = nova_pres.5.a
\t\tadd_political_power = 100
\t\tai_chance = {
\t\t\tfactor = 5
\t\t\tmodifier = {
\t\t\t\tfactor = 2
\t\t\t\thas_war = no
\t\t\t}
\t\t}
\t}

\t# The stingy choice
\toption = {
\t\tname = nova_pres.5.b
\t\tadd_political_power = 10
\t}
}
`;
fs.writeFileSync(EV, ORIGINAL, "utf8");

const PORT = 42999;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const read = () => fs.readFileSync(EV, "utf8");

  const payload = (id, prev) => ({
    namespace: "nova_pres", id,
    fileName: "nova_pres.txt",
    type: "country_event",
    title: "", description: "", picture: "",
    triggeredOnly: "yes",
    options: [
      { name: `nova_pres.${prev ? "5" : id}.a`, title: "Generous", script: "add_political_power = 100" },
      { name: `nova_pres.${prev ? "5" : id}.b`, title: "Stingy", script: "add_political_power = 10" },
    ],
    ...(prev ? { previousEventId: prev } : {}),
  });

  try {
    console.log("\n[control] a SAME-ID save preserves everything — this is the bar the rename must meet");
    let r = await save(payload("5"));
    rec("the same-id save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    let t = read();
    rec("…conditional desc blocks survive", (t.match(/desc\s*=\s*\{/g) || []).length >= 2, t.slice(0, 500));
    rec("…the author's declared title key survives", /title\s*=\s*NUA_PRES_AUTHOR_TITLE/.test(t), t.slice(0, 400));
    rec("…the scripted picture survives", /picture\s*=\s*\[GetHitlerHandshakeEventPicture\]/.test(t), t.slice(0, 400));
    rec("…the mtth modifier survives", /mean_time_to_happen\s*=\s*\{[\s\S]*?modifier\s*=\s*\{/.test(t), t.slice(0, 700));
    rec("…the factor-form ai_chance survives", /ai_chance\s*=\s*\{[\s\S]*?factor\s*=\s*5/.test(t), t.slice(0, 900));
    rec("…show_sound survives", /show_sound\s*=\s*event_sound_test/.test(t), t.slice(0, 400));
    rec("…and the option comments survive", /# The generous choice/.test(t) && /# The stingy choice/.test(t), t.slice(0, 900));

    console.log("\n[the bug] a RENAME must preserve exactly the same things");
    r = await save(payload("6", "nova_pres.5"));
    rec("the rename succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    t = read();
    rec("the event is now nova_pres.6", /id\s*=\s*nova_pres\.6/.test(t), t.slice(0, 300));
    rec("…and the old id is gone", !/id\s*=\s*nova_pres\.5\b/.test(t), t.slice(0, 300));
    rec("…conditional desc blocks survived the rename", (t.match(/desc\s*=\s*\{/g) || []).length >= 2, t.slice(0, 700));
    rec("…the author's declared title key survived", /title\s*=\s*NUA_PRES_AUTHOR_TITLE/.test(t), t.slice(0, 500));
    rec("…the scripted picture survived", /picture\s*=\s*\[GetHitlerHandshakeEventPicture\]/.test(t), t.slice(0, 500));
    rec("…and was NOT replaced by the default sprite", !/picture\s*=\s*GFX_report_event_001/.test(t), t.slice(0, 500));
    rec("…the mtth modifier survived", /mean_time_to_happen\s*=\s*\{[\s\S]*?modifier\s*=\s*\{/.test(t), t.slice(0, 800));
    rec("…show_sound survived", /show_sound\s*=\s*event_sound_test/.test(t), t.slice(0, 500));

    console.log("\n[the option-keyed half] re-prefixed names must still find their on-disk data");
    rec("the factor-form ai_chance survived the rename", /ai_chance\s*=\s*\{[\s\S]*?factor\s*=\s*5/.test(t), t.slice(0, 1200));
    rec("…including its nested modifier", /ai_chance\s*=\s*\{[\s\S]*?modifier\s*=\s*\{[\s\S]*?has_war\s*=\s*no/.test(t), t.slice(0, 1200));
    rec("…the generous option comment followed", /# The generous choice/.test(t), t.slice(0,1400));
    rec("…the stingy option comment followed", /# The stingy choice/.test(t), t.slice(0,1400));

    console.log("\n[safety]");
    let d = 0, ok = true;
    for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("the events file is brace-balanced", ok && d === 0, d);
    rec("…and defines the event exactly once", (t.match(/id\s*=\s*nova_pres\.6\b/g) || []).length === 1,
      (t.match(/id\s*=\s*nova_pres\.6\b/g) || []).length);

    console.log(`\n=== event rename preserves: ${checks} checks, ${fails.length} failed ===`);
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
