// ⛔ #an-event-call-is-named-as-written / #an-option-that-cannot-show-needs-no-name — TWO EVENT RULES, JUDGED BY WHAT THE FILE WRITES.
//
// The base game (1.20), copied into a sandbox and judged as a mod:
//   · broken_reference said poland.2101 calls NSB_news.201 "via country_event", and form_nordic_league EST_events.3 the same;
//     both files write `news_event = { id = … }`. extractRefs files all five event kinds under the one context
//     "country_event" (RULE 2 and test-a-reference-resolves-the-way-the-engine-resolves.js key on it), and the message named
//     the context. A modder told "country_event" searches for a line their file does not contain. The ref now carries the
//     keyword written (`call`), the row carries it as refCall beside the unchanged refContext, and the message and the AI fix's
//     prompt name it. #a-reference-is-named-by-the-call-it-writes — so do the other readers whose context is not the word
//     written: add_timed_idea and swap_ideas' add_idea (filed as add_ideas / swap_add_idea), and `focus = X` (focus_link /
//     focus_arg), named by the block it sits in — USA.txt's usa.3 was told it calls USA_pearl_harbor_gambit "via focus_arg"
//     for `focus_progress = { focus = USA_pearl_harbor_gambit … }`.
//   · event_option_no_name fired on BA_romania.24 (TTBE_Romania.txt), whose nameless option is
//     `option = { trigger = { always = no } … }`: never offered, beside two named options. An option whose own trigger is
//     exactly `always = no` needs no name; any other trigger is judged as before, and so is an event made of such options alone.
//
// Through the request the Mod Health page sends (GET /api/mod/index?fresh=1). When the game is installed, the base game's own
// Poland.txt, formable_nation_decisions.txt, TTBE_Romania.txt and USA.txt are copied byte for byte into a mod and judged with the game
// below; a heard SKIP otherwise.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-event-calls-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const { isHoi4GameFolder, topLevelBlocks } = require("./mod-index.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const haveGame = isHoi4GameFolder(G);
if (haveGame && !process.env.HOI4_ROOT) process.env.HOI4_ROOT = G;
const srv = require("./server.js");

const PORT = Number(process.env.NOVA_TEST_PORT) || 54737;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 260) : JSON.stringify(detail).slice(0, 260))));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };
const write = (root, rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// [the call as written, the missing event it names]. Both forms, three kinds.
const CALLS = [
  ["news_event = { id = prbmiss.1 }", "news_event", "prbmiss.1"],
  ["state_event = prbmiss.2", "state_event", "prbmiss.2"],
  ["country_event = { id = prbmiss.3 days = 1 }", "country_event", "prbmiss.3"],
  ["unit_leader_event = prbmiss.4", "unit_leader_event", "prbmiss.4"],
];
// #a-reference-is-named-by-the-call-it-writes — the other readers whose context is not the word written: [where, the text,
// the call it writes, type, the missing id]. They said "via add_ideas", "via swap_add_idea", "via focus_arg", "via focus_link".
const OTHER_CALLS = [
  ["option", "add_timed_idea = { idea = prbmiss_idea_1 days = 5 }", "add_timed_idea", "idea", "prbmiss_idea_1"],
  ["option", "swap_ideas = { remove_idea = prbmiss_gone add_idea = prbmiss_idea_2 }", "add_idea", "idea", "prbmiss_idea_2"],
  ["trigger", "focus_progress = { focus = prbmiss_focus_1 progress > 0 }", "focus_progress", "focus", "prbmiss_focus_1"],
  ["focus", "prerequisite = { focus = prbmiss_focus_2 }", "prerequisite", "focus", "prbmiss_focus_2"],
  ["focus", "mutually_exclusive = { focus = prbmiss_focus_3 }", "mutually_exclusive", "focus", "prbmiss_focus_3"],
];
const ev = (id, options) => `country_event = {\n\tid = ${id}\n\ttitle = ${id}.t\n\tdesc = ${id}.d\n\tis_triggered_only = yes\n${options}}\n`;
const opt = (body) => `\toption = {\n${body}\t}\n`;
const NEVER = "\t\ttrigger = {\n\t\t\talways = no\n\t\t}\n";
// [event id, options, event_option_no_name expected?]
const EVENTS = [
  ["prbopt.1", opt("\t\tname = prbopt.1.a\n") + opt(NEVER + "\t\tcountry_event = prbopt.2\n") + opt("\t\tname = prbopt.1.b\n"), false],
  ["prbopt.2", opt("\t\tname = prbopt.2.a\n") + opt("\t\ttrigger = { always = yes }\n"), true],
  ["prbopt.3", opt("\t\tname = prbopt.3.a\n") + opt("\t\ttrigger = {\n\t\t\talways = no\n\t\t\thas_war = yes\n\t\t}\n"), true],
  ["prbopt.4", opt(NEVER), true],
  ["prbopt.5", opt("\t\tname = prbopt.5.a\n") + opt("\t\tai_chance = { trigger = { always = no } factor = 1 }\n"), true],
];

let server;
(async () => {
  try {
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(PORT, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const scanOf = async (mod) => ((await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(mod))).json()).problems || []);

    const mod = fs.mkdtempSync(path.join(MODS, "events-"));
    write(mod, "descriptor.mod", 'name="event calls"\nsupported_version="1.20.*"\n');
    write(mod, "events/zz_probe.txt", "add_namespace = prbcall\nadd_namespace = prbopt\n"
      + ev("prbcall.1", opt("\t\tname = prbcall.1.a\n" + CALLS.map(([c]) => "\t\t" + c + "\n").join("")
        + OTHER_CALLS.filter((c) => c[0] === "option").map((c) => "\t\t" + c[1] + "\n").join("")))
      + ev("prbcall.2", "\ttrigger = {\n" + OTHER_CALLS.filter((c) => c[0] === "trigger").map((c) => "\t\tPRB = { " + c[1] + " }\n").join("") + "\t}\n"
        + opt("\t\tname = prbcall.2.a\n"))
      + EVENTS.map(([id, o]) => ev(id, o)).join(""));
    write(mod, "common/national_focus/zz_probe.txt", "focus_tree = {\n\tid = prbcall_tree\n\tcountry = { factor = 0 }\n"
      + OTHER_CALLS.filter((c) => c[0] === "focus").map((c, i) => `\tfocus = {\n\t\tid = PRB_call_focus_${i}\n\t\ticon = GFX_goal_generic_production\n\t\tx = ${i}\n\t\ty = 0\n\t\tcost = 1\n\t\t${c[1]}\n\t}\n`).join("")
      + "}\n");
    const problems = await scanOf(mod);

    console.log("\n-- broken_reference names the call the file makes --");
    const broken = problems.filter((p) => p.rule === "broken_reference" && p.refType === "event");
    for (const [written, kind, id] of CALLS) {
      const r = broken.find((p) => p.refId === id);
      rec(`${written}: reported, its message says "via ${kind}"`, !!r && new RegExp("via " + reEsc(kind) + "\\b").test(r.message) && !(kind !== "country_event" && /via country_event/.test(r.message)), r && r.message);
      rec(`...the row carries refCall ${kind}, and refContext stays the rule's context`, !!r && r.refCall === kind && r.refContext === "country_event", r && { refCall: r.refCall, refContext: r.refContext });
    }
    rec("nothing else is reported as a broken event call", broken.length === CALLS.length, broken.map((p) => p.refId));
    for (const [, written, call, type, id] of OTHER_CALLS) {
      const r = problems.find((p) => p.rule === "broken_reference" && p.refType === type && p.refId === id);
      rec(`${written}: reported, its message says "via ${call}" and the row carries refCall ${call}`,
        !!r && new RegExp("via " + reEsc(call) + "\\b").test(r.message) && r.refCall === call, r && { message: r.message, refCall: r.refCall });
    }
    {
      // The AI fix's prompt names the same call: refDetail interpolates refCall before refContext, still under the refContext guard.
      const code = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      const at = code.indexOf("const refDetail");
      const near = at === -1 ? "" : code.slice(at, at + 400);
      rec("the AI fix's prompt names the call as the row does", /problem\.refContext\s*\?\s*` via \$\{problem\.refCall \|\| problem\.refContext\}`/.test(near), near.slice(0, 220));
    }

    console.log("\n-- event_option_no_name skips only an option that can never show --");
    const named = problems.filter((p) => p.rule === "event_option_no_name");
    for (const [id, , want] of EVENTS) rec(`${id}: ${want ? "reported" : "not reported"}`, named.some((p) => p.entityId === id) === want, named.filter((p) => p.entityId === id).map((p) => p.message));
    rec("nothing else is reported", named.every((p) => EVENTS.some(([id]) => id === p.entityId)), named.map((p) => p.entityId));

    console.log("\n-- the base game's own files, copied into a mod, with the installed game below --");
    if (haveGame) {
      const vmod = fs.mkdtempSync(path.join(MODS, "vanilla-events-"));
      write(vmod, "descriptor.mod", 'name="ships vanilla events"\nsupported_version="1.20.*"\n');
      const COPIED = ["events/Poland.txt", "common/decisions/formable_nation_decisions.txt", "events/TTBE_Romania.txt", "events/USA.txt"];
      for (const rel of COPIED) { fs.mkdirSync(path.dirname(path.join(vmod, rel)), { recursive: true }); fs.copyFileSync(path.join(G, rel), path.join(vmod, rel)); }
      const vprob = await scanOf(vmod);
      const strip = (rel) => fs.readFileSync(path.join(vmod, rel), "utf8").replace(/#[^\r\n]*/g, "");
      // Every broken event call in the copied files: the call its row names is one the file writes before that id.
      const vcalls = vprob.filter((p) => p.rule === "broken_reference" && p.refType === "event" && COPIED.includes(p.file));
      if (!vcalls.length) skip("the copied files call no missing event any more, so the call names were not checked");
      else {
        const wrong = vcalls.filter((p) => !p.refCall || !new RegExp("\\b" + reEsc(p.refCall) + "\\s*=\\s*(\\{[^{}]*\\bid\\s*=\\s*)?" + reEsc(p.refId) + "\\b").test(strip(p.file))
          || !new RegExp("via " + reEsc(p.refCall) + "\\b").test(p.message));
        rec(`the base game's ${vcalls.length} broken event call(s) are each named by the keyword the file writes`, wrong.length === 0, wrong.map((p) => p.entityId + " " + p.refCall + " " + p.refId + " :: " + p.message.slice(0, 90)));
      }
      // #a-reference-is-named-by-the-call-it-writes — every other broken reference in them: the word after "via" is one the file
      // writes, as `<word> = <id>` or `<word> = { … <id>` (USA.txt's usa.3 was "via focus_arg" for `focus_progress = { focus = … }`).
      const vrefs = vprob.filter((p) => p.rule === "broken_reference" && p.refType !== "event" && COPIED.includes(p.file));
      if (!vrefs.length) skip("the copied files hold no other broken reference any more, so those call names were not checked");
      else {
        const via = (p) => (/ via ([A-Za-z_]+)/.exec(p.message) || [])[1] || "";
        const wrongRefs = vrefs.filter((p) => !via(p) || !new RegExp("\\b" + reEsc(via(p)) + "\\s*=\\s*(\\{[^{}]*?)?\\b" + reEsc(p.refId) + "\\b").test(strip(p.file)));
        rec(`the base game's ${vrefs.length} other broken reference(s) are each named by a keyword the file writes`, wrongRefs.length === 0, wrongRefs.map((p) => p.entityId + " via " + via(p) + " " + p.refId));
      }
      // The events in TTBE_Romania.txt whose every nameless option has exactly `trigger = { always = no }` beside a named one.
      const NEVER_RE = /^always=no$/i;
      const neverOnly = [], shownNameless = [];
      const txt = strip(COPIED[2]);
      const KINDS = ["country_event", "news_event", "state_event", "unit_leader_event", "operative_leader_event"];
      for (const m of txt.matchAll(new RegExp("\\b(" + KINDS.join("|") + ")\\s*=\\s*\\{", "g"))) {
        const body = [...topLevelBlocks(txt.slice(m.index))][0];
        if (!body || body.key !== m[1]) continue;
        const id = (/\bid\s*=\s*([A-Za-z0-9_.]+)/.exec(body.inner) || [])[1];
        if (!id || /\bhidden\s*=\s*yes/i.test(body.inner)) continue;
        const opts = [...topLevelBlocks(body.inner)].filter((b) => b.key === "option").map((o) => {
          const trig = [...topLevelBlocks(o.inner)].filter((b) => b.key === "trigger");
          return { named: /\bname\s*=\s*\S/.test(o.inner), never: trig.length === 1 && NEVER_RE.test(trig[0].inner.replace(/\s+/g, "")) };
        });
        if (!opts.length) continue;
        if (opts.some((o) => !o.never && !o.named)) shownNameless.push(id);
        else if (opts.some((o) => o.never && !o.named) && opts.some((o) => !o.never)) neverOnly.push(id);
      }
      const vnamed = vprob.filter((p) => p.rule === "event_option_no_name" && p.file === COPIED[2]).map((p) => p.entityId);
      if (!neverOnly.length) skip("TTBE_Romania.txt holds no nameless option behind trigger = { always = no } any more, so that check did not run");
      else rec(`TTBE_Romania.txt: ${neverOnly.join(", ")} (a nameless option that can never show) not reported`, !vnamed.some((id) => neverOnly.includes(id)), vnamed);
      if (!shownNameless.length) skip("TTBE_Romania.txt holds no visible nameless option any more, so the control did not run");
      else rec(`...while ${shownNameless.join(", ")} (a nameless option that can show) still is`, shownNameless.every((id) => vnamed.includes(id)), vnamed);
    } else {
      skip("the base-game files: no game at " + G + " (set HOI4_ROOT). They did NOT run; the fixture above holds every shape.");
    }
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) { /* older node */ } server.close(); }
    try { fs.rmSync(MODS, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
    if (fails.length) console.log("\nfailed:\n" + fails.map((f) => "  " + f.slice(0, 150)).join("\n"));
    console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
      + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
    process.exitCode = fails.length || checks < 15 ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 300).unref();
  }
})();
