// #event-option-comment-with-nothing-to-lead — THE NOTES AN OPTION LOSES BECAUSE THEY LEAD NOTHING.
//
// #preserve-comments-by-key gave splitTopLevelPdxStatements a `leadComment`, and #event-option-comments-
// destroyed made the option reader use it: a comment is carried along with the statement written BELOW it.
// That leaves two positions with no statement to attach to, and a round trip deleted both.
//
//   (a) the note on the option's own opening line   `option = { #Hold Snap Election`
//   (b) the note written LAST in the body, with nothing after it — typically a disabled effect the
//       author is keeping:  `#add_war_support = 0.02`
//
// (b) is the worse of the two. Old World Blues' AcePilots.txt has an option whose entire body is a `name`
// and that one commented-out line; it came back from /api/events/list with an EMPTY effects box, so the
// editor showed nothing, the modder had nothing to preserve, and the save wrote nothing.
//
// Both are fixed by the same change, because after the reader slices `option = {` off the front, (a) IS a
// leading comment — of the `name` statement, which the loop skips. The notes above skipped keys (name,
// ai_chance, trigger) are now kept, and so is the block at the very end of the body.
//
// MEASURED across all six installed corpora, 1,304 event files:
//     14,548 notes trail an `option = {` line
//     14,041 whole-line notes sit inside an option body
// vanilla alone accounts for 3,489 and 2,255 of those.
//
// HONEST ABOUT PLACEMENT: a note that was on the `option = {` line comes back one line lower, under
// `name`, because that is where the writer emits the effects. The text is the author's and it still
// captions the same option; it is not in the same column it was typed in. A round trip that keeps the
// words and moves them a line is a different thing from one that deletes them, and this file asserts the
// words.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evnote-"));
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

const PORT = 53613;
const BASE = "http://127.0.0.1:" + PORT;
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const VAN_DEN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/AAT_Denmark.txt";
const OWB_ACE = W + "2265420196/events/AcePilots.txt";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

// Every comment position an option can carry, in one event.
const FIXTURE = [
  "add_namespace = probe_events",
  "",
  "country_event = {",
  "\tid = probe_events.1",
  "\ttitle = probe_events.1.t",
  "\tdesc = probe_events.1.d",
  "",
  "\tis_triggered_only = yes",
  "",
  "\toption = { #on the option's own line",
  "\t\t#above the name",
  "\t\tname = probe_events.1.a #trailing the name",
  "\t\t#above an effect",
  "\t\tadd_political_power = 25",
  "\t\t#written last, with nothing after it",
  "\t}",
  "",
  "\toption = {",
  "\t\tname = probe_events.1.b",
  "\t\tadd_stability = 0.05",
  "\t}",
  "}",
  "",
].join("\n");

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

let seq = 0;
function mkMod(text, name) {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "events"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova event notes"\n');
  fs.writeFileSync(path.join(mod, "events", name || "probe.txt"), text, "utf8");
  return mod;
}
const fileOf = (mod, name) => fs.readFileSync(path.join(mod, "events", name || "probe.txt"), "utf8");
const commentTexts = (t) => (t.match(/#[^\r\n]*/g) || []).map((s) => s.trim()).filter(Boolean);

async function listOf(mod) {
  const r = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`);
  const j = await r.json();
  return (j && j.events) || [];
}
// One save, with the body public/events.js builds from the list entry.
async function saveEvent(mod, evt) {
  const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId || ""));
  if (!idSplit) return { error: "unsplittable id" };
  const r = await fetch(`${BASE}/api/events/save`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modPath: mod, namespace: idSplit[1], id: idSplit[2],
      type: evt.type || "country_event",
      title: unescapeLocForEdit(evt.title || ""),
      description: unescapeLocForEdit(evt.description || ""),
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
        title: unescapeLocForEdit(o.title || ""),
        script: o.script || "",
        aiChance: (o.aiChance == null || o.aiChance === "") ? null : Number(o.aiChance),
        trigger: o.trigger || "",
      })),
    }),
  });
  return { status: r.status, body: await r.json() };
}

function censusPositions() {
  const trailingOn = (line) => {
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inStr = !inStr; continue; }
      if (!inStr && c === "#") return line.slice(0, i).trim() ? line.slice(0, i).trim() : null;
    }
    return null;
  };
  let onOption = 0, files = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, "events");
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      let raw;
      try { raw = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
      files++;
      for (const line of raw.split(/\r?\n/)) {
        const code = trailingOn(line);
        if (code && /^option\s*=\s*\{/.test(code)) onOption++;
      }
    }
  }
  return { onOption, files, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    console.log("\n-- every comment position an option can carry --");
    {
      const mod = mkMod(FIXTURE);
      const before = fileOf(mod);
      // ⭐ CONTROL: the fixture must really carry all four positions.
      rec("CONTROL: the fixture has a note on the `option = {` line", /option = \{ #on the option's own line/.test(before), "");
      rec("CONTROL: …one above a skipped key (name)", /#above the name\r?\n\s*name =/.test(before), "");
      rec("CONTROL: …one TRAILING a skipped key", /name = probe_events\.1\.a #trailing the name/.test(before), "");
      rec("CONTROL: …one above an ordinary effect", /#above an effect\r?\n\s*add_political_power/.test(before), "");
      rec("CONTROL: …and one written last, leading nothing",
        /#written last, with nothing after it\r?\n\s*\}/.test(before), "");

      const evts = await listOf(mod);
      const evt = evts.find((e) => e.fullId === "probe_events.1");
      rec("the event is listed", !!evt, evts.map((e) => e.fullId));
      // ⭐ The reader must SHOW them — an editor that cannot see a note cannot preserve it.
      const scriptA = (evt && (evt.options || [])[0] && evt.options[0].script) || "";
      rec("READ: ⭐ the note that leads nothing reaches the effects box",
        scriptA.includes("#written last, with nothing after it"), scriptA);
      // …but NOT the one on the `option = {` line, and that is the fix rather than a regression.
      //
      // This asserted the opposite, on the reasoning that "an editor that cannot see a note cannot preserve
      // it". True of a note with nothing to lead, which nothing else carries. Not true of this one: it is
      // read back off disk by extractPreservedEventBody and put back on the option's own line, the way every
      // other thing the option model has no field for is carried. Routing it through the effects box was
      // what MOVED it — out of the label position and down below the trigger, where it captioned the first
      // effect. 14,548 option labels across the corpora are written that way, 3,489 of them in vanilla.
      // #option-trailing-comment-dropped
      rec("READ: ⭐ the label on the `option = {` line does NOT go into the effects box",
        !scriptA.includes("#on the option's own line"), scriptA);
      // …and the one ABOVE the name goes the same way, which is the third placement and the last to be
      // handled. It used to reach the effects box, and the writer emits `name` BEFORE the script — so it
      // came back one line lower, captioning the first effect. Vanilla labels germany.65's two options
      // `# To war!` and `# We must back down!` exactly there. 607 across the install and every installed
      // mod, 11 in vanilla. The SAVE assertion below is the one that matters: it has to land above `name`.
      rec("READ: ⭐ nor does the one ABOVE the name — it belongs above the name line",
        !scriptA.includes("#above the name"), scriptA);
      // …and the one TRAILING the name goes the same way as the option's own label, for the same reason and
      // by the same mechanism: it is a note about the NAME, so it belongs on the name line, and the writer
      // restores it there from disk. 5,093 across the corpora, 875 vanilla. #option-trailing-comment-dropped
      rec("READ: ⭐ nor does the one TRAILING the name — it belongs on the name line",
        !scriptA.includes("#trailing the name"), scriptA);
      rec("READ: the already-covered one above an effect is still there", scriptA.includes("#above an effect"), scriptA);

      const r = await saveEvent(mod, evt);
      rec("the save is accepted", r.status === 200 && !(r.body || {}).error, r);
      const after = fileOf(mod);
      const b = commentTexts(before), a = commentTexts(after);
      console.log("     comments " + b.length + " -> " + a.length);
      for (const note of ["#on the option's own line", "#above the name", "#trailing the name", "#above an effect", "#written last, with nothing after it"]) {
        rec("SAVE: ⭐ " + JSON.stringify(note) + " survives", after.includes(note), after);
      }
      rec("SAVE: not one comment was lost", a.length >= b.length, { before: b.length, after: a.length });
      // ⭐ …and the label goes back ON THE OPTION'S OWN LINE. Surviving is not enough — a note re-attached
      // to the wrong statement passes every count and still tells the reader something false.
      rec("SAVE: ⭐ …and the option's label is back on the option's own line",
        /option[ \t]*=[ \t]*\{[ \t]*#on the option's own line/.test(after), after);
      rec("SAVE: ⭐ …and the name's note is back on the name line",
        /name[ \t]*=[ \t]*probe_events\.1\.a[ \t]+#trailing the name/.test(after), after);
      rec("SAVE: ⭐ …and the note ABOVE the name is back above it, not below",
        /#above the name[ \t]*\r?\n[ \t]*name[ \t]*=[ \t]*probe_events\.1\.a/.test(after), after);
      rec("SAVE: the option's effect is intact", /add_political_power = 25/.test(after), after);
      rec("SAVE: the second option is untouched", /add_stability = 0\.05/.test(after), after);
    }

    console.log("\n-- control: an option with no notes gains none --");
    {
      // Strip BOTH kinds — whole-line comments and the trailing ones — or the "plain" fixture is not plain
      // and the no-comment control tests nothing.
      const plain = FIXTURE.split("\n")
        .filter((l) => !l.trim().startsWith("#"))
        .map((l) => l.replace(/\s+#.*$/, ""))
        .join("\n");
      const mod = mkMod(plain);
      const before = fileOf(mod);
      rec("CONTROL: the plain fixture really has no comments", commentTexts(before).length === 0, commentTexts(before));
      const evts = await listOf(mod);
      const evt = evts.find((e) => e.fullId === "probe_events.1");
      const r = await saveEvent(mod, evt);
      const after = fileOf(mod);
      rec("the save is accepted", r.status === 200 && !(r.body || {}).error, r);
      rec("CONTROL: ⭐ no comment was invented", commentTexts(after).length === 0, commentTexts(after));
    }

    console.log("\n-- the corpora this came from --");
    const c = censusPositions();
    console.log("     " + c.onOption + " notes trail an `option = {` line across " + c.files + " event files in " + c.corpora + " corpora");
    rec("CONTROL: the corpora really carry this in quantity", c.corpora === 0 || c.onOption >= 500, c);

    if (!fs.existsSync(OWB_ACE)) {
      rec("Old World Blues is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(OWB_ACE, "utf8");
      rec("CONTROL: that file really keeps a disabled effect as its option's only body line",
        /#add_war_support = 0\.02/.test(src), "");
      const mod = mkMod(src);
      const evts = await listOf(mod);
      const hit = evts.find((e) => (e.options || []).some((o) => /add_war_support/.test(String(o.script || ""))));
      rec("RUN: ⭐ the disabled effect reaches the effects box", !!hit, (evts[0] && evts[0].options) || []);
      const before = fileOf(mod);
      for (const e of evts) await saveEvent(mod, e);
      const after = fileOf(mod);
      const b = commentTexts(before), a = commentTexts(after);
      console.log("     AcePilots.txt comments " + b.length + " -> " + a.length);
      rec("RUN: ⭐ every comment in the real file survives a full re-save", a.length >= b.length, { before: b.length, after: a.length });
    }

    if (!fs.existsSync(VAN_DEN)) {
      rec("vanilla is not installed — that corpus check is skipped", true, "");
    } else {
      const src = fs.readFileSync(VAN_DEN, "utf8");
      rec("CONTROL: vanilla really captions its options on the `option = {` line",
        (src.match(/option = \{[ \t]*#/g) || []).length >= 5, (src.match(/option = \{[ \t]*#/g) || []).length);
      const mod = mkMod(src);
      const before = fileOf(mod);
      const evts = await listOf(mod);
      let saved = 0;
      for (const e of evts.slice(0, 4)) { const r = await saveEvent(mod, e); if (r.status === 200 && !(r.body || {}).error) saved++; }
      const after = fileOf(mod);
      const b = commentTexts(before), a = commentTexts(after);
      console.log("     AAT_Denmark.txt " + saved + " events saved · comments " + b.length + " -> " + a.length);
      rec("the file really was exercised", saved >= 3, saved);
      rec("RUN: ⭐ not one comment is lost", a.length >= b.length, { before: b.length, after: a.length });
      rec("RUN: the option captions are still in the file", after.includes("#Hold Snap Election") && after.includes("#Socialdemokratiet"), "");
    }

    rec("the fixture was measured whatever is installed", checks >= 18, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== event option keeps a note with nothing to lead: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
