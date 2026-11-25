// #event-option-comments-destroyed — OPENING AN EVENT AND SAVING IT WIPED EVERY COMMENT INSIDE ITS OPTIONS.
//
// splitTopLevelPdxStatements skips comments while it scans — they are not statements — so rebuilding an
// option's effect script from the captured statements alone dropped them, and the writer re-emitted the
// option without them. The annotations a modder writes next to their effects were gone after a save that
// changed nothing else, with no warning.
//
// Two shapes, and real content decides which matters. Counted over the shipping events directories:
//   * a comment on its own line ABOVE an effect:  5,223 in vanilla, 4,867 in Millennium Dawn
//   * a comment TRAILING an effect on the same line: 402 in vanilla, 924 in Millennium Dawn
//   * a comment trailing an inline `trigger = { … }` / `ai_chance = { … }`: 1 in vanilla, 0 in MD
// The first two are fixed. The third is not: those are MODELLED fields that the editor owns and regenerates
// into their own form boxes, and one occurrence across two corpora does not justify threading a comment
// through a field the user edits as structured data.
//
// `leadComment` already existed on the splitter for exactly this class (#preserve-comments-by-key) and is
// additive — every caller keeps its behaviour until it opts in. This is the option reader opting in, plus a
// matching `trailComment` for the same-line case.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evcom-"));
process.env.HOI4_MODS_ROOT = ROOT;
const S = require("./server.js");
const { createApp, splitTopLevelPdxStatements } = S;

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

const MOD = path.join(ROOT, "evcom");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvCom"\nsupported_version="1.19.*"\n', "utf8");

const NS = "evcomns";
const SRC = [
  `add_namespace = ${NS}`,
  "",
  "# The big decision event",
  "country_event = {",
  `\tid = ${NS}.1`,
  `\ttitle = ${NS}.1.t`,
  `\tdesc = ${NS}.1.d`,
  "\tpicture = GFX_report_event_001",
  "",
  "\tis_triggered_only = yes",
  "",
  "\toption = {",
  `\t\tname = ${NS}.1.a`,
  "\t\t# give them the political capital they asked for",
  "\t\tadd_political_power = 100",
  "\t\t# ...and a stability hit for the trouble",
  "\t\t# (two lines, because a modder writes paragraphs)",
  "\t\tadd_stability = -0.05",
  "\t\tadd_manpower = 500   # a trailing note on an effect line",
  "\t}",
  "\toption = {",
  `\t\tname = ${NS}.1.b`,
  "\t\t# a comment above a NESTED block must survive too",
  "\t\thidden_effect = {",
  "\t\t\tadd_war_support = 0.05",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
const EVF = path.join(MOD, "events", `${NS}.txt`);
fs.writeFileSync(EVF, SRC, "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "evcom_l_english.yml"),
  `\uFEFFl_english:\n ${NS}.1.t:0 "T"\n ${NS}.1.d:0 "D"\n ${NS}.1.a:0 "Yes"\n ${NS}.1.b:0 "No"\n`, "utf8");

const PORT = 43363;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] which comment shapes real events actually use");
    const counts = { lead: 0, trail: 0, inlineModelled: 0, options: 0 };
    for (const root of ["D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
      "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"]) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "events")).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        const t = fs.readFileSync(path.join(root, "events", f), "utf8");
        counts.options += (t.match(/(^|\n)\s*option\s*=\s*\{/g) || []).length;
        counts.lead += (t.match(/\n[ \t]*#[^\n]*\n[ \t]*(add_|set_|country_event|hidden_effect|random_list|if =)/g) || []).length;
        counts.trail += (t.match(/\n[ \t]*(add_|set_)[A-Za-z_]+[^\n#]*#[^\n]*/g) || []).length;
        counts.inlineModelled += (t.match(/\n[ \t]*(trigger|ai_chance)\s*=\s*\{[^\n{}]*\}[ \t]*#[^\n]*/g) || []).length;
      }
    }
    // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn and the fresh copy carries about a third of the
    // trailing comments the old one did (924 -> 297 by this count), which took the two corpora under the typed
    // "> 1000" while nothing in Nova had changed. The decision this ground truth backs is RELATIVE: the two shapes
    // that are fixed are common, and the one that is not is two orders of magnitude rarer. That is what is now
    // asserted, against whatever is installed, and the counts are printed rather than typed into the labels.
    console.log(`     ${counts.options} options: ${counts.lead} comments above an effect, ${counts.trail} trailing one, ${counts.inlineModelled} trailing an inline trigger/ai_chance`);
    rec("the events corpora were readable", counts.options > 20000, counts);
    rec("a comment ABOVE an effect is the dominant shape", counts.lead > counts.trail && counts.lead > counts.inlineModelled, counts);
    rec("…a TRAILING one is common too — at least a hundred times the unfixed inline shape",
      counts.trail >= 100 * Math.max(1, counts.inlineModelled), counts);
    rec("…and one trailing an inline trigger/ai_chance is vanishingly rare — hence not fixed",
      counts.inlineModelled <= 5, counts);

    console.log("\n[the splitter] both comment fields exist and are ADDITIVE");
    const st = splitTopLevelPdxStatements("# above\nadd_political_power = 100   # beside\nadd_stability = -0.05\n");
    rec("the leading comment is captured", st[0] && Array.isArray(st[0].leadComment) && /above/.test(st[0].leadComment.join("")), st[0]);
    rec("…and the trailing one", st[0] && /beside/.test(String(st[0].trailComment || "")), st[0]);
    rec("…while `text` is unchanged, so callers that have not opted in behave exactly as before",
      st[0] && st[0].text === "add_political_power = 100", st[0] && st[0].text);
    rec("a trailing comment is NOT re-counted as the next statement's leading one",
      st[1] && !st[1].leadComment, st[1]);

    console.log("\n[the bug] a no-edit save must keep every comment in an option body");
    let r = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    rec("the event read back", r.s === 200 && (r.b.events || []).length === 1, r.b);
    const ev = (r.b.events || [])[0];
    rec("…and its option script carries the comments the file has",
      ev && /# give them the political capital/.test(ev.options[0].script)
      && /# a trailing note on an effect line/.test(ev.options[0].script), ev && ev.options);

    const save = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "1", type: ev.type,
      title: ev.title, description: ev.description, picture: ev.picture,
      triggeredOnly: ev.triggeredOnly,
      options: ev.options.map((o) => ({
        name: o.name, title: o.title || "", script: o.script || "",
        aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
      })),
    });
    rec("the save succeeded", save.s === 200 && !save.b.error, save.b || save.s);

    const after = fs.readFileSync(EVF, "utf8");
    for (const c of [
      "# give them the political capital they asked for",
      "# ...and a stability hit for the trouble",
      "# (two lines, because a modder writes paragraphs)",
      "# a trailing note on an effect line",
      "# a comment above a NESTED block must survive too",
      "# The big decision event",
    ]) {
      rec(`the comment survived: ${c.slice(0, 46)}`, after.includes(c), after);
    }
    rec("…and the effects themselves are all still there",
      /add_political_power = 100/.test(after) && /add_stability = -0\.05/.test(after)
      && /add_manpower = 500/.test(after) && /add_war_support = 0\.05/.test(after), after);
    rec("…with the nested block still nested",
      /hidden_effect = \{[\s\S]*?add_war_support[\s\S]*?\}/.test(after), after);
    rec("…and the file is brace-balanced",
      (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length, after);

    console.log("\n[control] a second save is stable — comments must not multiply");
    const r2 = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev2 = (r2.b.events || [])[0];
    await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "1", type: ev2.type,
      title: ev2.title, description: ev2.description, picture: ev2.picture,
      triggeredOnly: ev2.triggeredOnly,
      options: ev2.options.map((o) => ({
        name: o.name, title: o.title || "", script: o.script || "",
        aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
      })),
    });
    const after2 = fs.readFileSync(EVF, "utf8");
    rec("the second save changed nothing", after2 === after, {
      lenA: after.length, lenB: after2.length,
    });
    rec("…and no comment was duplicated",
      (after2.match(/# give them the political capital/g) || []).length === 1,
      (after2.match(/# give them the political capital/g) || []).length);

    console.log("\n[the event's OWN keys] #event-body-comments-above-managed-keys");
    // The keyComments mechanism already existed and worked — but `mean_time_to_happen`, `desc` and `title`
    // each `continue` out of the statement loop for their own reasons (rich-mtth detection, conditional-desc
    // collection, author-declared loc keys) and so never reached the capture. The annotations above exactly
    // the lines a modder is most likely to annotate were dropped on every save, while every other key's
    // survived. The fix is to capture BEFORE branching; the re-injection end already handled any key.
    const NS2 = "evcomns2";
    const EVF2 = path.join(MOD, "events", `${NS2}.txt`);
    fs.writeFileSync(EVF2, [
      `add_namespace = ${NS2}`,
      "",
      "country_event = {",
      `\tid = ${NS2}.1`,
      "\t# shown in the news feed, keep the wording short",
      `\ttitle = ${NS2}.1.t`,
      "\t# the long version, written by Anna",
      `\tdesc = ${NS2}.1.d`,
      "\tpicture = GFX_report_event_001",
      "\tis_triggered_only = no",
      "\t# fires roughly a year in, tuned 2024-03",
      "\tmean_time_to_happen = {",
      "\t\tdays = 365",
      "\t}",
      "\t# only for countries that actually have a crisis",
      "\ttrigger = {",
      "\t\thas_war = yes",
      "\t}",
      `\toption = { name = ${NS2}.1.a add_political_power = 10 }`,
      "}",
      "",
    ].join("\n"), "utf8");
    const r3 = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev3 = (r3.b.events || []).find((e) => e.fullId === `${NS2}.1`);
    rec("the second event read back", !!ev3, (r3.b.events || []).map((e) => e.fullId));
    const s3 = await post("/api/events/save", {
      modPath: MOD, namespace: NS2, id: "1", type: ev3.type,
      title: ev3.title, description: ev3.description, picture: ev3.picture,
      triggeredOnly: ev3.triggeredOnly, trigger: ev3.trigger, mtthDays: ev3.mtthDays,
      options: ev3.options.map((o) => ({
        name: o.name, title: o.title || "", script: o.script || "",
        aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
      })),
    });
    rec("the save succeeded", s3.s === 200 && !s3.b.error, s3.b || s3.s);
    const body = fs.readFileSync(EVF2, "utf8");
    for (const c of [
      "# shown in the news feed, keep the wording short",
      "# the long version, written by Anna",
      "# fires roughly a year in, tuned 2024-03",
      "# only for countries that actually have a crisis",
    ]) {
      rec(`event-body comment survived: ${c.slice(0, 44)}`, body.includes(c), body);
    }
    rec("…and each still sits above the key it explains",
      /# shown in the news feed[^\n]*\n\s*title\s*=/.test(body)
      && /# the long version[^\n]*\n\s*desc\s*=/.test(body)
      && /# fires roughly a year in[^\n]*\n\s*mean_time_to_happen\s*=/.test(body), body);
    rec("…and none was duplicated",
      (body.match(/# the long version/g) || []).length === 1, body);

    console.log("\n[conditional branches] #comments-above-title-desc-mtth-dropped");
    // Two shapes the key-level injection could not carry, both from vanilla's own events:
    //   * a TRAILING comment on the key's own line — CapitulationEvents.txt writes `title = <id>.t #Good news`
    //     and the above-the-line injection had nowhere to put it;
    //   * the comment above the SECOND branch of a conditional desc — keyComments keeps only the FIRST
    //     occurrence per key, and AAT_Sweden.txt labels its branches "# The Socialists won" /
    //     "# The Conservatives won" precisely so a reader can tell which desc goes with which outcome.
    // Preserved statements carry their own comments now, and the key-level injection stands down for those
    // keys so nothing is written twice.
    const NS3 = "evcomns3";
    const EVF3 = path.join(MOD, "events", `${NS3}.txt`);
    fs.writeFileSync(EVF3, [
      `add_namespace = ${NS3}`,
      "",
      "country_event = {",
      `\tid = ${NS3}.1`,
      `\ttitle = ${NS3}.1.t #Good news`,
      "\t# The Socialists won",
      `\tdesc = { text = ${NS3}.1.d_left trigger = { has_government = communism } }`,
      "\t# The Conservatives won",
      `\tdesc = { text = ${NS3}.1.d_right }`,
      "\tpicture = GFX_report_event_001",
      "\tis_triggered_only = yes",
      `\toption = { name = ${NS3}.1.a }`,
      "}",
      "",
    ].join("\n"), "utf8");
    const r4 = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev4 = (r4.b.events || []).find((e) => e.fullId === `${NS3}.1`);
    rec("the conditional-desc event read back", !!ev4, (r4.b.events || []).map((e) => e.fullId));
    const s4 = await post("/api/events/save", {
      modPath: MOD, namespace: NS3, id: "1", type: ev4.type,
      title: ev4.title, description: ev4.description, picture: ev4.picture, triggeredOnly: ev4.triggeredOnly,
      options: (ev4.options || []).map((o) => ({
        name: o.name, title: o.title || "", script: o.script || "",
        aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
      })),
    });
    rec("the save succeeded", s4.s === 200 && !s4.b.error, s4.b || s4.s);
    const cond = fs.readFileSync(EVF3, "utf8");
    rec("the TRAILING comment on the title line survived", /#Good news/.test(cond), cond);
    rec("…the first branch's label survived", /# The Socialists won/.test(cond), cond);
    rec("…and the SECOND branch's label too", /# The Conservatives won/.test(cond), cond);
    rec("…each still above its own branch",
      /# The Socialists won[\s\S]{0,40}?d_left/.test(cond) && /# The Conservatives won[\s\S]{0,40}?d_right/.test(cond), cond);
    rec("…and NOTHING was duplicated",
      (cond.match(/# The Socialists won/g) || []).length === 1
      && (cond.match(/#Good news/g) || []).length === 1, cond);
    rec("…and both desc branches are still there",
      /d_left/.test(cond) && /d_right/.test(cond), cond);

    console.log(`\n=== event option comments: ${checks} checks, ${fails.length} failed ===`);
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
