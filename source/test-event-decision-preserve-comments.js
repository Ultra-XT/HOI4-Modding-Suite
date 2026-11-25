// #preserve-comments-by-key — the last two preserve-merges that dropped the modder's annotations.
//
// These two are different from the others in a way that decided the fix. Measured across Millennium Dawn and
// vanilla:
//
//   events    6789 comments inside event blocks. EVERY ONE sits above a key the maker re-synthesises —
//             4483 above an `option`, 1896 above `id`. Zero above a carried-through field.
//   decisions 539 comments, 458 above a re-synthesised key (fire_only_once, allowed, icon, ai_will_do,
//             priority), 81 above a carried-through one.
//
// So carrying comments on preserved statements — what the equipment and MIO fixes do — would have recovered
// none of the event ones and a seventh of the decision ones. They have to be re-injected into the GENERATED
// block, which is done as a pure post-process on the finished string: with no comments to restore, the
// output is byte-for-byte what the assembly produced.
//
// Options are matched by NAME, never position. The maker rebuilds options from the model, so a reordered or
// renamed option must not inherit the note that explained a different choice. That direction is tested.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdeccmt-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "cmtmod");
for (const d of [["events"], ["common", "decisions"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CmtMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");

const EV = path.join(MOD, "events", "nua_ns.txt");
const EV_SEED = [
  "add_namespace = nua_ns",
  "",
  "# the coup chain starts here",
  "country_event = {",
  "\tid = nua_ns.1",
  "\ttitle = nua_ns.1.t",
  "\tdesc = nua_ns.1.d",
  "\tpicture = GFX_report_event_generic_factory",
  "\tis_triggered_only = yes",
  "\t# fires the loyalist branch",
  "\timmediate = {",
  "\t\tset_country_flag = nua_seed",
  "\t}",
  "\t# back the generals",
  "\toption = {",
  "\t\tname = nua_ns.1.a",
  "\t}",
  "\t# stay loyal to the government",
  "\toption = {",
  "\t\tname = nua_ns.1.b",
  "\t}",
  "}",
  "",
].join("\n");

const DEC = path.join(MOD, "common", "decisions", "nua_cat.txt");
const DEC_SEED = [
  "nua_cat = {",
  "\tnua_decision = {",
  "\t\t# uses the old arsenal icon on purpose",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\t# only once — it represents a one-off purge",
  "\t\tfire_only_once = yes",
  "\t\tavailable = {",
  "\t\t\talways = yes",
  "\t\t}",
  "\t\tcomplete_effect = {",
  "\t\t\tadd_political_power = 10",
  "\t\t}",
  "\t\t# balance: raised twice already",
  "\t\tpriority = 250",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42353;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (u) => (await fetch(`http://127.0.0.1:${PORT}${u}`)).json();
  const post = async (r, b) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${r}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const lineAbove = (txt, needle) => {
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex((l) => l.includes(needle));
    return i > 0 ? lines[i - 1].trim() : "";
  };
  const countOf = (txt, lit) => (txt.match(new RegExp(lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

  const saveEvent = async (patch) => {
    const lb = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev = (lb.events || lb.items || []).find((x) => x.fullId === "nua_ns.1");
    if (!ev) return null;
    const [ns, id] = ev.fullId.split(".");
    return post("/api/events/save", Object.assign({
      modPath: MOD, namespace: ns, id, type: ev.type, title: ev.title || "", description: ev.description || "",
      picture: ev.picture, triggeredOnly: ev.triggeredOnly, hidden: ev.hidden, fireOnce: ev.fireOnce,
      major: ev.major, mtthDays: ev.mtthDays, trigger: ev.trigger, immediate: ev.immediate,
      after: ev.after, timeoutDays: ev.timeoutDays, options: ev.options,
    }, patch || {}));
  };

  try {
    console.log("\n[event] annotations on re-synthesised keys survive");
    fs.writeFileSync(EV, EV_SEED, "utf8");
    let r = await saveEvent({ immediate: "set_country_flag = nua_edited" });
    rec("the save succeeded", r && r.status === 200 && r.body && !r.body.error, r && r.body);
    let txt = fs.readFileSync(EV, "utf8");
    rec("the edit landed", /nua_edited/.test(txt), txt);
    rec("the comment above `immediate` survived", /# fires the loyalist branch/.test(txt), txt);
    rec("each option's own note survived",
      /# back the generals/.test(txt) && /# stay loyal to the government/.test(txt), txt);
    rec("…the first is above ITS option", lineAbove(txt, "nua_ns.1.a") !== "# stay loyal to the government", lineAbove(txt, "nua_ns.1.a"));
    rec("the file-level comment above the event is untouched", /# the coup chain starts here/.test(txt), txt);
    rec("the file is brace-balanced",
      (txt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (txt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, txt);

    console.log("\n[event, repeat] comments must not multiply");
    await saveEvent({ immediate: "set_country_flag = nua_edited" });
    await saveEvent({ immediate: "set_country_flag = nua_edited" });
    txt = fs.readFileSync(EV, "utf8");
    for (const c of ["# fires the loyalist branch", "# back the generals", "# stay loyal to the government"]) {
      rec(`"${c}" appears exactly once`, countOf(txt, c) === 1, countOf(txt, c));
    }

    console.log("\n[event, renamed option] a note must not follow a different choice");
    fs.writeFileSync(EV, EV_SEED, "utf8");
    {
      const lb = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
      const ev = (lb.events || lb.items || []).find((x) => x.fullId === "nua_ns.1");
      const opts = (ev.options || []).map((o) =>
        (o.name === "nua_ns.1.a" ? Object.assign({}, o, { name: "nua_ns.1.z" }) : o));
      r = await post("/api/events/save", {
        modPath: MOD, namespace: "nua_ns", id: "1", type: ev.type, title: ev.title || "", description: ev.description || "",
        picture: ev.picture, triggeredOnly: ev.triggeredOnly, hidden: ev.hidden, fireOnce: ev.fireOnce,
        major: ev.major, mtthDays: ev.mtthDays, trigger: ev.trigger, immediate: ev.immediate,
        after: ev.after, timeoutDays: ev.timeoutDays, options: opts,
      });
      rec("the rename saved", r.status === 200 && r.body && !r.body.error, r.body);
      txt = fs.readFileSync(EV, "utf8");
      rec("the renamed option did NOT inherit the old note",
        lineAbove(txt, "nua_ns.1.z") !== "# back the generals", lineAbove(txt, "nua_ns.1.z"));
      rec("the untouched option kept its own note",
        /# stay loyal to the government/.test(txt), txt);
    }

    console.log("\n[decision] annotations on re-synthesised keys survive");
    fs.writeFileSync(DEC, DEC_SEED, "utf8");
    r = await post("/api/decisions/save", {
      modPath: MOD, categoryId: "nua_cat", id: "nua_decision", fileName: "nua_cat.txt",
      name: "Nova Decision", cost: 0, icon: "GFX_decision_generic_decision", days: 30, fireOnce: "yes",
      available: "always = yes", modifier: "", effect: "add_political_power = 42",
      decisionType: "normal", scope: "country", cooldown: 0, targetTrigger: "",
      removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
      visible: "", allowed: "", aiWillDo: "", priority: 250, cancelIfNotVisible: "yes",
      customCostText: "", customCostTrigger: "",
    });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const dtxt = fs.readFileSync(DEC, "utf8");
    rec("the edit landed", /add_political_power = 42/.test(dtxt), dtxt);
    rec("the comment above `icon` survived", /# uses the old arsenal icon on purpose/.test(dtxt), dtxt);
    rec("the comment above `fire_only_once` survived", /# only once — it represents a one-off purge/.test(dtxt), dtxt);
    rec("the comment above `priority` survived", /# balance: raised twice already/.test(dtxt), dtxt);
    rec("the decision file is brace-balanced",
      (dtxt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (dtxt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, dtxt);

    console.log(`\n=== event + decision comment preservation: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
