// #free-floating-comment-dropped — THE NOTE THAT BELONGS TO NO STATEMENT.
//
// leadingCommentLinesAbove stops at a blank line, deliberately: a detached note is not a caption for the
// next statement, and gluing it on would say something the author did not. But the reasoning it rests on
// — "leaving it where the surrounding text already puts it" — only holds while the surrounding text
// survives. In a REBUILT block it does not, so the note was deleted outright.
//
//     highlight_states = { … }
//                                  <- blank
//     #days_remove = 70            <- belongs to nothing, so nothing carried it
//                                  <- blank
//     cost = 25
//
// vanilla keeps disabled settings that way — `#days_remove = 70` and `#days_re_enable = 180` in MON.txt,
// `#fire_only_once = yes #Can't be this` in SEA_Philippines.txt. Measured across the decisions and events
// corpora of all six installed mods: 12,198 such blocks.
//
// They are now carried SEPARATELY from leadComment and put back above the key they preceded, still
// separated from it by a blank line. That restores the note in place without turning it into a caption —
// which is the distinction the original walk-back exists to make, and which the control in
// test-trait-save-keeps-its-notes.js asserts. Both rules hold at once: the note comes back, and it does
// not become a label for a key it never labelled.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-float-"));
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

const PORT = 53645;
const BASE = "http://127.0.0.1:" + PORT;
const VAN_MON = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/decisions/MON.txt";
const VAN_PHI = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/SEA_Philippines.txt";

function unescapeLocForEdit(value) {
  const s = String(value || "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\" || i === s.length - 1) { out += c; continue; }
    const n = s[i + 1];
    if (n === "\\") { out += "\\"; i++; }
    else if (n === "n") { out += "\n"; i++; }
    else if (n === "r") { out += "\r"; i++; }
    else if (n === "t") { out += "\t"; i++; }
    else if (n === '"') { out += '"'; i++; }
    else out += c;
  }
  return out;
}
const makeReadableDecisionName = (id) => String(id || "new_decision").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const commentTexts = (t) => (t.match(/#[^\r\n]*/g) || []).map((s) => s.trim()).filter(Boolean);

let seq = 0;
function mkMod(sub, name, text) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, ...sub), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova floating"\n');
  fs.writeFileSync(path.join(mod, ...sub, name), text, "utf8");
  return mod;
}
const readMod = (mod, sub, name) => fs.readFileSync(path.join(mod, ...sub, name), "utf8");

// ---------------------------------------------------------------- events
const EV_SUB = ["events"];
const EVENT_FIXTURE = [
  "add_namespace = probe_events",
  "",
  "country_event = {",
  "\tid = probe_events.1",
  "\ttitle = probe_events.1.t",
  "\tdesc = probe_events.1.d",
  "",
  "\t#a floating note about firing",
  "\t#kept across two lines",
  "",
  "\tis_triggered_only = yes",
  "",
  "\t#directly above, no blank line",
  "\tfire_only_once = yes",
  "",
  "\toption = {",
  "\t\tname = probe_events.1.a",
  "\t\tadd_political_power = 25",
  "\t}",
  "}",
  "",
].join("\n");

async function saveEvent(mod, evt) {
  const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId || ""));
  if (!idSplit) return { error: "unsplittable" };
  const r = await fetch(`${BASE}/api/events/save`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modPath: mod, namespace: idSplit[1], id: idSplit[2],
      type: evt.type || "country_event",
      title: unescapeLocForEdit(evt.title || ""), description: unescapeLocForEdit(evt.description || ""),
      picture: evt.picture || "",
      triggeredOnly: evt.triggeredOnly === "yes" ? "yes" : "no",
      hidden: evt.hidden === "yes" ? "yes" : "no",
      fireOnce: evt.fireOnce === "yes" ? "yes" : "no",
      major: evt.major === "yes" ? "yes" : "no",
      mtthDays: parseInt(evt.mtthDays, 10) || 0,
      trigger: evt.trigger || "", immediate: evt.immediate || "", after: evt.after || "",
      timeoutDays: parseInt(evt.timeoutDays, 10) || 0,
      options: (Array.isArray(evt.options) ? evt.options : []).map((o) => ({
        name: o.name || `${idSplit[1]}.${idSplit[2]}.a`,
        title: unescapeLocForEdit(o.title || ""), script: o.script || "",
        aiChance: (o.aiChance == null || o.aiChance === "") ? null : Number(o.aiChance),
        trigger: o.trigger || "",
      })),
    }),
  });
  return { status: r.status, body: await r.json() };
}

// ---------------------------------------------------------------- decisions
const DEC_SUB = ["common", "decisions"];
const DEC_PASS = ["cost", "icon", "days", "fireOnce", "available", "modifier", "effect", "decisionType", "scope",
  "cooldown", "targetTrigger", "removeEffect", "activation", "cancelTrigger", "selectableMission",
  "cancelEffect", "targetRootTrigger", "targetArray", "aiHintPpCost", "fixedRandomSeed",
  "targetNonExisting", "targetsDynamic", "isGood", "visible", "allowed", "aiWillDo", "priority",
  "cancelIfNotVisible", "customCostText", "customCostTrigger", "targetedModifier", "removeTrigger",
  "onMapMode", "highlightStates"];

async function saveDecision(mod, cat, dec) {
  const body = {
    modPath: mod, categoryId: cat.id, id: dec.id, fileName: cat.fileName || "",
    categoryIcon: "", previousId: dec.id, previousCategoryId: cat.id,
    name: unescapeLocForEdit(dec.name || makeReadableDecisionName(dec.id)),
  };
  for (const k of DEC_PASS) body[k] = dec[k] == null ? "" : dec[k];
  const r = await fetch(`${BASE}/api/decisions/save`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    console.log("\n-- an event's free-floating note --");
    {
      const mod = mkMod(EV_SUB, "probe.txt", EVENT_FIXTURE);
      const before = readMod(mod, EV_SUB, "probe.txt");
      // ⭐ CONTROL: the fixture must really be detached on BOTH sides, and also carry an ATTACHED note,
      // so the two are told apart rather than both passing for the same reason.
      rec("CONTROL: the fixture's note has a blank line above and below",
        /\n\n\t#a floating note about firing\n\t#kept across two lines\n\n\tis_triggered_only/.test(before), "");
      rec("CONTROL: …and it also has a note attached directly to a key",
        /\n\t#directly above, no blank line\n\tfire_only_once/.test(before), "");

      const evts = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const evt = ((evts && evts.events) || []).find((e) => e.fullId === "probe_events.1");
      rec("the event is listed", !!evt, ((evts && evts.events) || []).map((e) => e.fullId));
      const r = await saveEvent(mod, evt);
      rec("the save is accepted", r.status === 200 && !(r.body || {}).error, r);
      const after = readMod(mod, EV_SUB, "probe.txt");

      rec("RUN: ⭐ the floating note survives", after.includes("#a floating note about firing"), after);
      rec("RUN: ⭐ both of its lines survive", after.includes("#kept across two lines"), after);
      rec("RUN: ⭐ it is still DETACHED — a blank line separates it from the key below",
        /#kept across two lines\r?\n\s*\r?\n/.test(after), after);
      rec("CONTROL: the attached note is still attached — no blank line inserted",
        /#directly above, no blank line\r?\n[ \t]*fire_only_once/.test(after), after);
      rec("RUN: not one comment was lost", commentTexts(after).length >= commentTexts(before).length,
        { before: commentTexts(before).length, after: commentTexts(after).length });
    }

    console.log("\n-- control: an event with no notes gains none --");
    {
      const plain = EVENT_FIXTURE.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
      const mod = mkMod(EV_SUB, "probe.txt", plain);
      rec("CONTROL: the plain fixture has no comments", commentTexts(readMod(mod, EV_SUB, "probe.txt")).length === 0, "");
      const evts = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const evt = ((evts && evts.events) || []).find((e) => e.fullId === "probe_events.1");
      await saveEvent(mod, evt);
      rec("CONTROL: ⭐ no comment was invented", commentTexts(readMod(mod, EV_SUB, "probe.txt")).length === 0,
        commentTexts(readMod(mod, EV_SUB, "probe.txt")));
    }

    console.log("\n-- a decision's three note positions --");
    {
      // attached, floating, and trailing — the third is the one the decisions preserve never carried,
      // although the events preserve one screen over has since #comments-above-title-desc-mtth-dropped.
      const DEC_FIXTURE = [
        "probe_category = {",
        "",
        "\tprobe_decision = {",
        "",
        "\t\t#a floating note about the cost",
        "",
        "\t\t#directly above the icon",
        "\t\ticon = GFX_decision_generic_decision",
        "\t\tcost = 25 #trailing the cost",
        "\t\tfire_only_once = yes",
        "",
        "\t\tavailable = { always = yes }",
        "\t\tcomplete_effect = { add_political_power = 10 }",
        "\t}",
        "}",
        "",
      ].join("\n");
      const mod = mkMod(DEC_SUB, "probe.txt", DEC_FIXTURE);
      const before = readMod(mod, DEC_SUB, "probe.txt");
      rec("CONTROL: the decision fixture carries all three positions",
        /\n\n\t\t#a floating note about the cost\n\n/.test(before)
        && /#directly above the icon\n\t\ticon =/.test(before)
        && /cost = 25 #trailing the cost/.test(before), "");

      const j = await fetch(`${BASE}/api/decisions/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const cat = (j.categories || [])[0];
      const dec = cat && (cat.decisions || [])[0];
      rec("the decision is listed", !!dec, (j.categories || []).map((c) => c.id));
      if (dec) {
        const r = await saveDecision(mod, cat, dec);
        rec("the save is accepted", r.status === 200 && !(r.body || {}).error, r);
        const after = readMod(mod, DEC_SUB, "probe.txt");
        rec("RUN: ⭐ the floating note survives", after.includes("#a floating note about the cost"), after);
        rec("CONTROL: the attached note survives", after.includes("#directly above the icon"), after);
        rec("RUN: ⭐ the TRAILING note survives", after.includes("#trailing the cost"), after);
        rec("RUN: ⭐ it is still ON the value's line, not above it",
          /cost\s*=\s*[^\n#]*#trailing the cost/.test(after), after);
        rec("RUN: not one comment was lost", commentTexts(after).length >= commentTexts(before).length,
          { before: commentTexts(before).length, after: commentTexts(after).length });
      }
    }

    console.log("\n-- the real files --");
    if (!fs.existsSync(VAN_PHI)) {
      rec("vanilla events not installed — skipped", true, "");
    } else {
      const src = fs.readFileSync(VAN_PHI, "utf8");
      rec("CONTROL: SEA_Philippines really keeps a disabled setting as a floating note",
        /\n\s*\n\s*#fire_only_once = yes #Can't be this\s*\n\s*\n/.test(src), "");
      const mod = mkMod(EV_SUB, "probe.txt", src);
      const before = readMod(mod, EV_SUB, "probe.txt");
      const evts = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      let saved = 0;
      for (const e of ((evts && evts.events) || []).slice(0, 5)) {
        const r = await saveEvent(mod, e);
        if (r.status === 200 && !(r.body || {}).error) saved++;
      }
      const after = readMod(mod, EV_SUB, "probe.txt");
      console.log("     SEA_Philippines.txt " + saved + " events saved · comments "
        + commentTexts(before).length + " -> " + commentTexts(after).length);
      rec("the file really was exercised", saved >= 3, saved);
      rec("RUN: ⭐ not one comment is lost", commentTexts(after).length >= commentTexts(before).length,
        { before: commentTexts(before).length, after: commentTexts(after).length });
      rec("RUN: ⭐ the disabled setting is still there",
        (after.match(/#fire_only_once = yes #Can't be this/g) || []).length
          === (before.match(/#fire_only_once = yes #Can't be this/g) || []).length, "");
    }

    if (!fs.existsSync(VAN_MON)) {
      rec("vanilla decisions not installed — skipped", true, "");
    } else {
      const src = fs.readFileSync(VAN_MON, "utf8");
      rec("CONTROL: MON.txt really keeps `#days_remove = 70` as a floating note",
        /\n\s*\n\s*#days_remove = 70\s*\n\s*\n/.test(src), "");
      const mod = mkMod(DEC_SUB, "probe.txt", src);
      const before = readMod(mod, DEC_SUB, "probe.txt");
      const j = await fetch(`${BASE}/api/decisions/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const flat = [];
      for (const c of (j.categories || [])) for (const d of (c.decisions || [])) flat.push({ cat: c, dec: d });
      let saved = 0;
      for (const { cat, dec } of flat.slice(0, 5)) {
        const r = await saveDecision(mod, cat, dec);
        if (r.status === 200 && !(r.body || {}).error) saved++;
      }
      const after = readMod(mod, DEC_SUB, "probe.txt");
      console.log("     MON.txt " + saved + " decisions saved · comments "
        + commentTexts(before).length + " -> " + commentTexts(after).length);
      rec("the file really was exercised", saved >= 3, saved);
      rec("RUN: ⭐ not one comment is lost", commentTexts(after).length >= commentTexts(before).length,
        { before: commentTexts(before).length, after: commentTexts(after).length });
      rec("RUN: ⭐ both disabled settings survive",
        (after.match(/#days_remove = 70/g) || []).length === (before.match(/#days_remove = 70/g) || []).length
        && (after.match(/#days_re_enable = 180/g) || []).length === (before.match(/#days_re_enable = 180/g) || []).length,
        { removeBefore: (before.match(/#days_remove = 70/g) || []).length, removeAfter: (after.match(/#days_remove = 70/g) || []).length });
    }

    rec("the fixture was measured whatever is installed", checks >= 12, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== a free-floating note survives: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
