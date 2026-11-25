// #comment-injected-at-first-line-start-match — a preserved note must come back on the statement it was
// written above, not on the first line that happens to start with the same key.
//
// The by-key re-injection in the events writer and the decisions writer put each preserved comment back by
// searching the finished block for the FIRST line starting with `<key> =`. That search had no depth check
// and no record of which occurrence the note came from, so one no-edit save re-captioned the wrong thing.
// Measured, each on a fresh temp mod, one save, nothing edited:
//
//   * An event with a conditional `desc = { text = … trigger = { … } }` — the ordinary shape for a
//     description that changes with the situation — and a note above the event's OWN trigger: the note moved
//     from depth 1 to depth 2, INSIDE the first desc, above `trigger = { has_war = yes }`. The event's real
//     trigger lost its caption and the desc gained one that is false.
//   * A decision with two `icon = { key = … }` blocks and the note above the SECOND: it came back above the
//     FIRST, so the note explaining the HQ marker sat over `key = infiltrate_state`.
//   * A decision whose `complete_effect` calls `create_equipment_variant = { name = "…" }`: the note above
//     the decision's own top-level `name` landed at depth 4, above the tank's name.
//
// The option path four lines from each call site had already been fixed for exactly this class and says so
// ("Options are matched by NAME, never by position"); the by-key half beside it never adopted the rule.
//
// The existing test-event-decision-preserve-comments.js cannot see any of this: it asserts the note's text
// still exists SOMEWHERE in the file, which passes just as happily when the note has moved, and every
// fixture in it has exactly one occurrence of each annotated key.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noteplace-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "notemod");
for (const d of [["events"], ["common", "decisions"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NoteMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");

const EV = path.join(MOD, "events", "npl_ns.txt");
const DEC = path.join(MOD, "common", "decisions", "npl_cat.txt");

// ── the caption map: comment text -> the code line it captions, plus brace depth ──────────────────
// A multiset of comment TEXT cannot see any of this — the byte count is identical either way.
function codeOf(line) {
  let out = "", inStr = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (!inStr && ch === "#") break;
    if (ch === '"') inStr = !inStr;
    out += ch;
  }
  return out;
}
function captionMap(txt) {
  const lines = String(txt).split(/\r?\n/);
  const depths = [];
  let d = 0;
  for (const l of lines) {
    depths.push(d);
    const c = codeOf(l);
    for (let i = 0; i < c.length; i += 1) { if (c[i] === "{") d += 1; else if (c[i] === "}") d -= 1; }
  }
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const code = codeOf(raw);
    const comment = raw.slice(code.length).trim();
    if (!comment) continue;
    if (code.trim()) {
      out.push({ kind: "trail", comment, depth: depths[i], captions: code.trim(), next: "" });
    } else {
      // the statement below it — blank separators and further comment lines skipped, so a detached note
      // is measured against the statement it precedes just like a lead one.
      let j = i + 1;
      while (j < lines.length && !codeOf(lines[j]).trim()) j += 1;
      out.push({
        kind: "lead", comment, depth: depths[i],
        captions: j < lines.length ? codeOf(lines[j]).trim() : "<END OF FILE>",
        next: j + 1 < lines.length ? codeOf(lines[j + 1]).trim() : "",
      });
    }
  }
  return out;
}
const notesFor = (txt, comment) => captionMap(txt).filter((e) => e.comment === comment);
const one = (txt, comment) => { const n = notesFor(txt, comment); return n.length === 1 ? n[0] : null; };
const balanced = (txt) => {
  const bare = txt.replace(/#[^\n]*/g, "");
  return (bare.match(/\{/g) || []).length === (bare.match(/\}/g) || []).length;
};

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const EV_SEED = [
  "add_namespace = npl_ns",
  "",
  "country_event = {",
  "\tid = npl_ns.1",
  "\ttitle = npl_ns.1.t",
  "\tdesc = {",
  "\t\ttext = npl_ns.1.d.1",
  "\t\ttrigger = { has_war = yes }",
  "\t}",
  "\tdesc = {",
  "\t\ttext = npl_ns.1.d.2",
  "\t\ttrigger = { has_war = no }",
  "\t}",
  "\tpicture = GFX_report_event_generic_factory",
  "\tis_triggered_only = no",
  "\t# only for the exiled government",
  "\ttrigger = {",
  "\t\toriginal_tag = CZE",
  "\t}",
  "\t# fires the loyalist branch",
  "\timmediate = {",
  "\t\tset_country_flag = npl_seed",
  "\t}",
  "\toption = {",
  "\t\tname = npl_ns.1.a",
  "\t}",
  "}",
  "",
].join("\n");

// two conditional icons, the note above the SECOND; plus two notes on single-occurrence keys that must
// come back exactly where they are (the over-correction controls).
const DEC_ICONS = [
  "npl_cat = {",
  "\tnpl_icons = {",
  "\t\ticon = {",
  "\t\t\tkey = infiltrate_state",
  "\t\t\ttrigger = { always = yes }",
  "\t\t}",
  "",
  "\t\t# the HQ icon, kept so the marker stays put",
  "",
  "\t\ticon = {",
  "\t\t\tkey = place_hq",
  "\t\t\ttrigger = { always = no }",
  "\t\t}",
  "\t\tcost = 25   # raised twice already",
  "\t\t# a one-off purge, so never twice",
  "\t\tfire_only_once = yes",
  "\t\tavailable = {",
  "\t\t\talways = yes",
  "\t\t}",
  "\t\tcomplete_effect = {",
  "\t\t\tadd_political_power = 10",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// the decision's own `name` annotated, with `create_equipment_variant = { name = … }` inside the effect
const DEC_RENEST = [
  "npl_cat = {",
  "\tnpl_renest = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 25",
  "\t\tfire_only_once = no",
  "\t\tavailable = {",
  "\t\t\talways = yes",
  "\t\t}",
  "\t\tcomplete_effect = {",
  "\t\t\tcreate_equipment_variant = {",
  "\t\t\t\tname = \"Panzer Ausf. B\"",
  "\t\t\t\ttype = light_tank_chassis",
  "\t\t\t}",
  "\t\t}",
  "",
  "\t\t# the loc key the BUTTON shows, not the tank's",
  "",
  "\t\tname = npl_renest_button_key",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 54123;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (u) => (await fetch(`http://127.0.0.1:${PORT}${u}`)).json();
  const post = async (r, b) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${r}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  // Both payloads are built field-for-field from what public/events.js and public/decisions.js send, out of
  // what the matching list endpoint returned — i.e. exactly an open-and-Save with nothing typed.
  const saveEvent = async (patch) => {
    const lb = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev = (lb.events || lb.items || []).find((x) => x.fullId === "npl_ns.1");
    if (!ev) return { status: 0, body: { error: "event not listed" } };
    return post("/api/events/save", Object.assign({
      modPath: MOD, namespace: "npl_ns", id: "1", type: ev.type, title: ev.title || "",
      description: ev.description || "", picture: ev.picture, triggeredOnly: ev.triggeredOnly,
      hidden: ev.hidden, fireOnce: ev.fireOnce, major: ev.major, mtthDays: ev.mtthDays,
      trigger: ev.trigger, immediate: ev.immediate, after: ev.after, timeoutDays: ev.timeoutDays,
      options: ev.options,
    }, patch || {}));
  };
  const saveDecision = async (decId, patch) => {
    const lb = await get(`/api/decisions/list?modPath=${encodeURIComponent(MOD)}`);
    const cats = lb.categories || lb.items || [];
    const cat = cats.find((c) => (c.decisions || []).some((d) => d && d.id === decId));
    if (!cat) return { status: 0, body: { error: "decision not listed" } };
    const dec = cat.decisions.find((d) => d.id === decId);
    return post("/api/decisions/save", Object.assign({
      modPath: MOD, categoryId: cat.id, id: dec.id, fileName: cat.fileName, categoryIcon: "",
      previousId: dec.id, previousCategoryId: cat.id, name: dec.name || dec.id,
      cost: (dec.cost !== "" && dec.cost != null) ? dec.cost : "0", icon: dec.icon || "",
      days: dec.days || "0", fireOnce: dec.fireOnce === "yes" ? "yes" : "no",
      available: dec.available || "", modifier: dec.modifier || "", effect: dec.effect || "",
      decisionType: dec.decisionType || "normal", scope: dec.scope || "country",
      cooldown: dec.cooldown || "0", targetTrigger: dec.targetTrigger || "",
      removeEffect: dec.removeEffect || "", activation: "", cancelTrigger: "", selectableMission: "",
      cancelEffect: dec.cancelEffect || "", targetRootTrigger: dec.targetRootTrigger || "",
      targetArray: dec.targetArray || "", aiHintPpCost: dec.aiHintPpCost || "",
      fixedRandomSeed: dec.fixedRandomSeed || "", targetNonExisting: dec.targetNonExisting || "",
      targetsDynamic: dec.targetsDynamic || "", isGood: "no", visible: dec.visible || "",
      allowed: dec.allowed || "", aiWillDo: dec.aiWillDo || "", priority: dec.priority || "",
      cancelIfNotVisible: dec.cancelIfNotVisible === "yes" ? "yes" : "",
      customCostText: dec.customCostText || "", customCostTrigger: dec.customCostTrigger || "",
      targetedModifier: dec.targetedModifier || "", removeTrigger: dec.removeTrigger || "",
      onMapMode: dec.onMapMode || "", highlightStates: dec.highlightStates || "",
    }, patch || {}));
  };

  try {
    // ── EVENT: a note above the event's own trigger, with a conditional desc that has one too ──────
    console.log("\n[event] the note above `trigger` must not move into the conditional desc");
    fs.writeFileSync(EV, EV_SEED, "utf8");
    {
      // FIXTURE CONTROL — the seed really has the property under test: a nested `trigger` inside the
      // first desc, EARLIER in the block than the event's own one. Without that this measures nothing.
      const seed = fs.readFileSync(EV, "utf8");
      const seedLines = seed.split("\n");
      const descTrig = seedLines.findIndex((l) => /^\t\ttrigger = \{ has_war = yes \}/.test(l));
      const ownTrig = seedLines.findIndex((l) => /^\ttrigger = \{$/.test(l));
      rec("fixture: the conditional desc carries a nested `trigger`", descTrig !== -1, descTrig);
      rec("fixture: …and it comes BEFORE the event's own `trigger`", descTrig !== -1 && ownTrig > descTrig, { descTrig, ownTrig });
      const n0 = one(seed, "# only for the exiled government");
      rec("fixture: the note captions the event's own trigger", !!n0 && n0.depth === 1 && n0.next === "original_tag = CZE", n0);
    }
    let r = await saveEvent({ immediate: "set_country_flag = npl_edited" });
    rec("the save succeeded", r.status === 200 && r.body && !r.body.error, r.body || r.status);
    let txt = fs.readFileSync(EV, "utf8");
    // WRITE CONTROL — the save really rewrote the block; "unchanged" is not why the note stayed put.
    rec("write control: the edit landed", /npl_edited/.test(txt), txt.slice(0, 400));
    {
      const n = one(txt, "# only for the exiled government");
      rec("the note is still a single copy", !!n, notesFor(txt, "# only for the exiled government").length);
      rec("…still at the event's own depth (1), not inside the desc", !!n && n.depth === 1, n);
      rec("…still captioning the event's own trigger", !!n && /^trigger\s*=/.test(n.captions) && n.next === "original_tag = CZE", n);
      rec("…and the desc's nested trigger gained no caption",
        !/#[^\n]*\n\s*trigger = \{ has_war = yes \}/.test(txt), txt.slice(txt.indexOf("desc"), txt.indexOf("picture")));
    }
    // MUST NOT CHANGE — a note on a single-occurrence key still comes back where it was.
    {
      const n = one(txt, "# fires the loyalist branch");
      rec("unchanged: the note above `immediate` still captions it", !!n && n.depth === 1 && /^immediate\s*=/.test(n.captions), n);
    }
    rec("the event file is brace-balanced", balanced(txt), "");

    // ── DECISION: two conditional icons, the note belongs to the second ────────────────────────────
    console.log("\n[decision] the note above the SECOND icon must not jump to the first");
    fs.writeFileSync(DEC, DEC_ICONS, "utf8");
    {
      const seed = fs.readFileSync(DEC, "utf8");
      rec("fixture: two top-level `icon = {` blocks", (seed.match(/^\t\ticon = \{$/gm) || []).length === 2,
        (seed.match(/^\t\ticon = \{$/gm) || []).length);
      const n0 = one(seed, "# the HQ icon, kept so the marker stays put");
      rec("fixture: the note captions the SECOND icon", !!n0 && n0.next === "key = place_hq", n0);
    }
    r = await saveDecision("npl_icons", { effect: "add_political_power = 42" });
    rec("the save succeeded", r.status === 200 && r.body && !r.body.error, r.body || r.status);
    txt = fs.readFileSync(DEC, "utf8");
    rec("write control: the edit landed", /add_political_power = 42/.test(txt), txt.slice(0, 600));
    {
      const n = one(txt, "# the HQ icon, kept so the marker stays put");
      rec("the note is still a single copy", !!n, notesFor(txt, "# the HQ icon, kept so the marker stays put").length);
      rec("…still on the HQ icon, not the infiltrate one", !!n && n.next === "key = place_hq", n);
    }
    // MUST NOT CHANGE — the two notes on keys that occur once are untouched, lead and trailing alike.
    {
      const n = one(txt, "# a one-off purge, so never twice");
      rec("unchanged: the note above `fire_only_once` still captions it",
        !!n && n.kind === "lead" && /^fire_only_once\s*=/.test(n.captions), n);
      const t = one(txt, "# raised twice already");
      rec("unchanged: the trailing note is still on the `cost` line",
        !!t && t.kind === "trail" && /^cost\s*=/.test(t.captions), t);
    }
    rec("the decision file is brace-balanced", balanced(txt), "");

    // ── DECISION: the note must not be buried inside complete_effect ───────────────────────────────
    console.log("\n[decision] the note above `name` must not land inside create_equipment_variant");
    fs.writeFileSync(DEC, DEC_RENEST, "utf8");
    {
      const seed = fs.readFileSync(DEC, "utf8");
      rec("fixture: the effect declares a nested `name`", /create_equipment_variant = \{\n\t+name = "Panzer Ausf\. B"/.test(seed), "");
      const n0 = one(seed, "# the loc key the BUTTON shows, not the tank's");
      rec("fixture: the note captions the decision's own `name` at depth 2",
        !!n0 && n0.depth === 2 && n0.captions === "name = npl_renest_button_key", n0);
    }
    r = await saveDecision("npl_renest", { cost: "31" });
    rec("the save succeeded", r.status === 200 && r.body && !r.body.error, r.body || r.status);
    txt = fs.readFileSync(DEC, "utf8");
    rec("write control: the edit landed", /cost = 31/.test(txt), txt.slice(0, 600));
    {
      const n = one(txt, "# the loc key the BUTTON shows, not the tank's");
      rec("the note is still a single copy", !!n, notesFor(txt, "# the loc key the BUTTON shows, not the tank's").length);
      rec("…still at the decision's own depth (2), not inside the effect", !!n && n.depth === 2, n);
      rec("…still captioning the decision's own `name`",
        !!n && n.captions === "name = npl_renest_button_key", n);
      rec("…and the tank's name gained no caption",
        !/#[^\n]*\n\s*name = "Panzer Ausf\. B"/.test(txt), txt);
    }
    rec("the decision file is brace-balanced", balanced(txt), "");

    console.log(`\n=== preserved notes land on the right statement: ${checks} checks, ${fails.length} failed ===`);
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
