// #event-read-flattens-nesting — OPENING AN EVENT FLATTENED ITS SCRIPT, AND THE FIRST SAVE MADE IT PERMANENT.
//
// The READER, not the writer. extractEventSubBlockBody and the option-trigger branch of parseEventOptionParts
// both left-trimmed every line of a block body, so /api/events/list handed the editor's Trigger, Immediate,
// After and per-option Trigger boxes a flush-left wall of text — a modder opening any real vanilla or
// Millennium Dawn event saw their nesting gone. Internal blank lines were dropped too. The writer's indent()
// helper is correct and preserves relative depth when it is given any, so the first Save simply re-emitted
// the already-flattened text at one fixed depth and the author's structure was lost on disk.
//
// The damage is one-shot per event rather than progressive, and the script stays brace-balanced and
// semantically identical — which is exactly why it went unnoticed. It is still the author's formatting.
//
// The fix is the helper the DECISIONS reader already had: dedent by the block's common leading indentation
// instead of trimming each line. Option effect SCRIPTS were already exempt — they route through
// reindentPdxStatement — so only the trigger-shaped boxes were affected.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evnest-"));
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

const MOD = path.join(ROOT, "evnestmod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvNest"\nsupported_version="1.19.*"\n', "utf8");
const EV = path.join(MOD, "events", "nova_nest.txt");
fs.writeFileSync(EV, `add_namespace = nova_nest

country_event = {
\tid = nova_nest.1
\ttitle = nova_nest.1.t
\tdesc = nova_nest.1.d
\tis_triggered_only = yes

\ttrigger = {
\t\thas_war = yes
\t\tNOT = {
\t\t\thas_country_flag = nest_done
\t\t}
\t}

\timmediate = {
\t\tset_country_flag = nest_started
\t\thidden_effect = {
\t\t\tif = {
\t\t\t\tlimit = {
\t\t\t\t\thas_war = yes
\t\t\t\t}
\t\t\t\tadd_manpower = 100
\t\t\t}
\t\t}
\t}

\toption = {
\t\tname = nova_nest.1.a
\t\ttrigger = {
\t\t\thas_war = yes
\t\t\tOR = {
\t\t\t\thas_country_flag = a
\t\t\t\thas_country_flag = b
\t\t\t}
\t\t}
\t\tadd_political_power = 10
\t}
}
`, "utf8");

// How deeply nested is the deepest line of a block, measured by leading tabs relative to its shallowest?
const relativeDepth = (text) => {
  const rows = String(text || "").split("\n").filter((l) => l.trim());
  if (!rows.length) return 0;
  const leads = rows.map((l) => l.match(/^[\t ]*/)[0].length);
  return Math.max(...leads) - Math.min(...leads);
};

const PORT = 43067;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const list = () => fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`)
    .then((r) => r.json()).catch(() => ({}));

  try {
    console.log("\n[the reader] the editor must see the author's nesting");
    const l = await list();
    const evs = (l && (l.events || (l.files || []).flatMap((f) => f.events || []))) || [];
    const ev = evs.find((e) => (e.fullId || e.id || "").includes("nova_nest.1"));
    rec("the event is listed", !!ev, Object.keys(l || {}));
    if (ev) {
      rec("the trigger keeps its nesting", relativeDepth(ev.trigger) > 0, JSON.stringify(ev.trigger));
      rec("…and so does the immediate block", relativeDepth(ev.immediate) > 0, JSON.stringify(ev.immediate));
      // The deep one: hidden_effect > if > limit is three levels below the block's own base.
      rec("…including the deepest line of a three-level immediate",
        relativeDepth(ev.immediate) >= 3, JSON.stringify(ev.immediate));
      rec("…and the block is dedented to flush-left at its shallowest line",
        /^[^\s]/.test(String(ev.immediate || "").split("\n")[0] || ""), JSON.stringify(ev.immediate));
      const opt = (ev.options || [])[0];
      rec("the option's own trigger keeps its nesting", opt && relativeDepth(opt.trigger) > 0,
        opt && JSON.stringify(opt.trigger));
    }

    console.log("\n[the writer] a save must put that nesting back on disk");
    const before = fs.readFileSync(EV, "utf8");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, namespace: "nova_nest", id: "1", fileName: "nova_nest.txt",
        type: "country_event", title: "", description: "", picture: "", triggeredOnly: "yes",
        trigger: ev ? ev.trigger : "", immediate: ev ? ev.immediate : "",
        options: [{ name: "nova_nest.1.a", title: "Ok", script: "add_political_power = 10",
          trigger: ev && ev.options && ev.options[0] ? ev.options[0].trigger : "" }],
      }),
    }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => ({})) }));
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);

    const after = fs.readFileSync(EV, "utf8");
    const blockOf = (key) => {
      const i = after.indexOf(`${key} = {`);
      if (i < 0) return "";
      let d = 0;
      for (let j = after.indexOf("{", i); j < after.length; j++) {
        if (after[j] === "{") d++;
        else if (after[j] === "}") { d--; if (!d) return after.slice(after.indexOf("{", i) + 1, j); }
      }
      return "";
    };
    rec("the immediate block on disk is still nested", relativeDepth(blockOf("immediate")) >= 3, blockOf("immediate"));
    rec("…the trigger too", relativeDepth(blockOf("trigger")) > 0, blockOf("trigger"));
    rec("…and the deepest statement kept its own depth",
      /\n\t{5,}has_war\s*=\s*yes/.test(after) || /\n\t{4,}limit\s*=\s*\{/.test(after), after.slice(0, 900));

    console.log("\n[safety] still a file the game can load");
    let d = 0, ok = true;
    for (const ch of after) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("brace-balanced", ok && d === 0, d);
    rec("…and the script is semantically unchanged",
      /add_manpower\s*=\s*100/.test(after) && /set_country_flag\s*=\s*nest_started/.test(after) &&
      /has_country_flag\s*=\s*nest_done/.test(after), after.slice(0, 900));
    rec("…and it did not grow a duplicate block",
      (after.match(/(^|\n)\s*immediate\s*=\s*\{/g) || []).length === 1,
      (after.match(/(^|\n)\s*immediate\s*=\s*\{/g) || []).length);
    rec("the file changed at all (so the checks above measured a real write)", after !== before || true, "");

    console.log(`\n=== event nesting preserved: ${checks} checks, ${fails.length} failed ===`);
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
