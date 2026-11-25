// #event-key-case-variant — VANILLA WRITES `Picture`, AND NOVA BOTH FAILED TO SEE IT AND DUPLICATED IT.
//
// Paradox's own BBA_Ethiopia.txt and BBA_Switzerland.txt write the key capitalised, and so do Road to 56 and
// Rise of Nations — 22 events across the installed corpus, plus `Trigger` (8) and `Hidden` (6). HOI4 reads
// them; three shipped DLC files would otherwise have no event picture at all.
//
// Nova read event keys case-SENSITIVELY, and MANAGED_EVENT_KEYS is a plain Set, so `Picture` was:
//
//   • invisible to the parser — the Event Maker showed no picture for a vanilla event that has one, and
//   • not recognised as managed — so the preserve pass carried the line forward…
//   • …while the maker emitted its own `picture = …` beside it as soon as the user picked one.
//
// Measured on a fixture through the real endpoints: opening such an event showed an empty picture, and
// choosing one wrote BOTH `picture = <new>` and `Picture = <old>` into the same block.
//
// Three changes, and they only work together — recognising the key as managed WITHOUT also reading it would
// drop the preserved line and write nothing in its place, turning a display gap into data loss:
//
//   1. the parser reads these keys case-insensitively, so the value reaches the editor;
//   2. the managed-key test is case-insensitive, so the line is never carried forward AND re-emitted;
//   3. the writer re-emits the key in THE SPELLING THE FILE USED, so an untouched event is not rewritten
//      into Nova's preferred casing. The value goes back as it came in; so does the key.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const ROOTS = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
  ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
  ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
];

const evtFile = (extra) => [
  "add_namespace = probe",
  "",
  "country_event = {",
  "\tid = probe.1",
  "\ttitle = probe.1.t",
  "\tdesc = probe.1.d",
  ...extra,
  "\tis_triggered_only = yes",
  "\tfire_for_sender = no",
  "\tminor_flavor = yes",
  "",
  "\toption = {",
  "\t\tname = probe.1.a",
  "\t}",
  "}",
  "",
].join("\n");

(async () => {
  console.log("\n[ground truth] Paradox ships the capitalised key");
  {
    let files = 0, events = 0;
    const where = [];
    for (const [label, root] of ROOTS) {
      const dir = path.join(root, "events");
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".txt")) continue;
        let t; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        const n = (t.match(/(^|\n)[ \t]*Picture\s*=/g) || []).length;
        if (n) { files++; events += n; if (where.length < 5) where.push(`${label}/${f} (${n})`); }
      }
    }
    console.log(`     ${events} capitalised Picture keys across ${files} files: ${where.join(", ")}`);
    // Skips cleanly on a machine with no HOI4 — the fixtures below still measure the behaviour.
    if (files === 0) rec("no corpus installed — the ground-truth check is skipped", true, "");
    else {
      rec("⭐ real shipped content uses the capitalised key", events >= 10, { events, files, where });
      rec("…including vanilla's own", where.some((w) => w.startsWith("vanilla/")), where);
    }
  }

  const PORT = 53471, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evt-case-"));
  const evPath = path.join(mod, "events", "probe.txt");
  try {
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Event Case Test"\n');
    fs.mkdirSync(path.dirname(evPath), { recursive: true });

    const load = async () => {
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      return (list.events || []).find((e) => e.fullId === "probe.1");
    };
    // SEND WHAT THE CLIENT SENDS — the payload shape from public/events.js.
    const save = (evt, over) => fetch(`${BASE}/api/events/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({
        modPath: mod, namespace: "probe", id: "1", type: "country_event",
        title: (evt && evt.title) || "", description: (evt && evt.description) || "",
        picture: (evt && evt.picture) || "", triggeredOnly: "yes", hidden: "no", fireOnce: "no",
        major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
        options: ((evt && evt.options) || []).map((o) => ({ name: o.name || "", title: o.title || "", script: o.script || "" })),
      }, over || {})),
    }).then((r) => r.json());

    console.log("\n[the capitalised key is read]");
    fs.writeFileSync(evPath, evtFile(["\tPicture = GFX_report_event_generic_sign_treaty1"]), "utf8");
    const capEvt = await load();
    rec("the event parsed", !!capEvt, capEvt);
    rec("⭐ the picture reaches the editor", capEvt && capEvt.picture === "GFX_report_event_generic_sign_treaty1", capEvt && capEvt.picture);

    console.log("\n[a save that changes nothing changes nothing]");
    const before = fs.readFileSync(evPath, "utf8");
    await save(capEvt);
    const afterNoop = fs.readFileSync(evPath, "utf8");
    rec("⭐ exactly one picture key", (afterNoop.match(/\bpicture\s*=/gi) || []).length === 1, afterNoop);
    rec("⭐ …spelled the way the author wrote it", /\bPicture\s*=\s*GFX_report_event_generic_sign_treaty1/.test(afterNoop), afterNoop);
    rec("…and no lowercase one beside it", !/(^|\n)\s*picture\s*=/.test(afterNoop), afterNoop);
    rec("…and the un-modelled keys are still there", /fire_for_sender/.test(afterNoop) && /minor_flavor/.test(afterNoop), afterNoop);
    rec("CONTROL: the fixture really did start with the capitalised key", /\bPicture\s*=/.test(before), before);

    console.log("\n[changing the picture writes ONE key, with the new value]");
    await save(capEvt, { picture: "GFX_report_event_generic_read_write" });
    const afterEdit = fs.readFileSync(evPath, "utf8");
    rec("⭐ still exactly one picture key", (afterEdit.match(/\bpicture\s*=/gi) || []).length === 1, afterEdit);
    rec("…carrying the new value", /\bPicture\s*=\s*GFX_report_event_generic_read_write/.test(afterEdit), afterEdit);
    rec("…still in the author's spelling", !/(^|\n)\s*picture\s*=/.test(afterEdit), afterEdit);

    console.log("\n[CONTROL] the ordinary lowercase form is untouched by all this");
    fs.writeFileSync(evPath, evtFile(["\tpicture = GFX_report_event_generic_sign_treaty1"]), "utf8");
    const lowEvt = await load();
    rec("a lowercase event parses its picture", lowEvt && lowEvt.picture === "GFX_report_event_generic_sign_treaty1", lowEvt && lowEvt.picture);
    await save(lowEvt, { picture: "GFX_report_event_generic_read_write" });
    const afterLow = fs.readFileSync(evPath, "utf8");
    rec("…and a change writes one lowercase key", (afterLow.match(/\bpicture\s*=/gi) || []).length === 1, afterLow);
    rec("…still lowercase, not borrowed from anywhere", /(^|\n)\s*picture\s*=\s*GFX_report_event_generic_read_write/.test(afterLow), afterLow);

    console.log("\n[the same for Hidden and Trigger, which the corpus also varies]");
    fs.writeFileSync(evPath, evtFile(["\tHidden = yes"]), "utf8");
    const hidEvt = await load();
    rec("⭐ a capitalised Hidden is read", hidEvt && hidEvt.hidden === "yes", hidEvt && hidEvt.hidden);
    await save(hidEvt, { hidden: "yes" });
    const afterHid = fs.readFileSync(evPath, "utf8");
    rec("…and written once, in the author's spelling", (afterHid.match(/\bhidden\s*=/gi) || []).length === 1 && /\bHidden\s*=\s*yes/.test(afterHid), afterHid);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
  }

  console.log(`\n=== event key keeps its case: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
