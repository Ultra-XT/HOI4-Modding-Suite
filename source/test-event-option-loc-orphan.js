// #event-option-loc-orphan — REMOVING AN EVENT OPTION LEFT ITS TEXT BEHIND FOR THE NEXT ONE TO INHERIT.
//
// Option localisation keys follow a POSITION convention: `<id>.a`, `<id>.b`, `<id>.c`. Delete the middle
// option of three and `<id>.b "No"` stays in the .yml with nothing pointing at it. That is only untidy until
// the next option is added — and then it is a wrong button:
//
//   * "+ Add Option" renders a row with an EMPTY name box (public/events.js), and the save handler sends
//     `${namespace}.${id}.a` as the fallback for a blank one.
//   * That collides with the existing first option, so the server's normaliser reassigns it the first free
//     letter — `.b`, the one just vacated.
//   * upsertLoc only writes a key when the option has a title, so an option whose text has not been typed
//     yet writes nothing…
//   * …and the button renders the DELETED option's text. Nothing in game or in error.log says why.
//
// The DELETE path has always swept a whole event's keys (removeEventLocalizationLines); the SAVE path never
// swept its own. Now it does, keeping anything the block it just wrote still mentions — which covers
// conditional block-form title/desc keys and preserved un-modelled lines — plus anything any OTHER file in
// the mod points at.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-optloc-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

const MOD = path.join(ROOT, "optloc");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OptLoc"\nsupported_version="1.19.*"\n', "utf8");

const NS = "optns";
const EV = NS + ".1";
const PORT = 43299;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (options, extra) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({
      modPath: MOD, namespace: NS, id: "1", type: "country_event",
      title: "The Question", description: "Choose.", picture: "GFX_report_event_001",
      triggeredOnly: "yes", options,
    }, extra || {})),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  const locText = () => {
    const dir = path.join(MOD, "localisation", "english");
    let out = "";
    for (const f of fs.readdirSync(dir)) out += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
    return out;
  };
  const locOf = (key) => {
    const m = new RegExp(`^\\s*${key.replace(/\./g, "\\.")}:\\d*\\s*"([^"]*)"`, "m").exec(locText());
    return m ? m[1] : null;
  };

  try {
    console.log("\n[setup] three options, keys assigned by position");
    let r = await save([
      { name: `${EV}.a`, title: "Yes", script: "add_political_power = 10" },
      { name: `${EV}.b`, title: "No", script: "add_political_power = -10" },
      { name: `${EV}.c`, title: "Maybe", script: "" },
    ]);
    rec("the event saved", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and all three option texts are localised",
      locOf(`${EV}.a`) === "Yes" && locOf(`${EV}.b`) === "No" && locOf(`${EV}.c`) === "Maybe",
      { a: locOf(`${EV}.a`), b: locOf(`${EV}.b`), c: locOf(`${EV}.c`) });

    console.log("\n[the bug] removing the middle option must take its text with it");
    r = await save([
      { name: `${EV}.a`, title: "Yes", script: "add_political_power = 10" },
      { name: `${EV}.c`, title: "Maybe", script: "" },
    ]);
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the removed option's key is gone", locOf(`${EV}.b`) === null, locText());
    rec("…while the two that remain are untouched",
      locOf(`${EV}.a`) === "Yes" && locOf(`${EV}.c`) === "Maybe", { a: locOf(`${EV}.a`), c: locOf(`${EV}.c`) });
    rec("…and so are the event's own title and description",
      locOf(`${EV}.t`) === "The Question" && locOf(`${EV}.d`) === "Choose.",
      { t: locOf(`${EV}.t`), d: locOf(`${EV}.d`) });

    console.log("\n[the consequence] a new option must not inherit the dead one's text");
    // Exactly what the UI produces: "+ Add Option" gives an empty name box and an empty title box, and the
    // client sends the `<id>.a` fallback for the blank name. The normaliser reassigns the first free letter.
    r = await save([
      { name: `${EV}.a`, title: "Yes", script: "add_political_power = 10" },
      { name: `${EV}.c`, title: "Maybe", script: "" },
      { name: `${EV}.a`, title: "", script: "" },
    ]);
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    const evText = fs.readFileSync(path.join(MOD, "events", `${NS}.txt`), "utf8");
    const names = [...evText.matchAll(/name\s*=\s*([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
    rec("the new option really did land on the vacated letter", names.includes(`${EV}.b`), names);
    rec("…and it shows NO text rather than the deleted option's", locOf(`${EV}.b`) === null, {
      b: locOf(`${EV}.b`), names, loc: locText(),
    });

    console.log("\n[safety] a key another file still points at is NOT swept");
    // An author can aim a second event's option at the first event's key. That is a live reference, and the
    // sweep must see it — the guard scans every script directory, not just this event's own file.
    fs.writeFileSync(path.join(MOD, "events", "other.txt"),
      `add_namespace = other\ncountry_event = {\n\tid = other.9\n\ttitle = other.9.t\n\tdesc = other.9.d\n\toption = { name = ${EV}.z }\n}\n`, "utf8");
    // Give the shared key a value, then save the first event without any option named .z.
    r = await save([
      { name: `${EV}.a`, title: "Yes", script: "" },
      { name: `${EV}.z`, title: "Shared", script: "" },
    ]);
    rec("the shared key was written", locOf(`${EV}.z`) === "Shared", locText());
    r = await save([{ name: `${EV}.a`, title: "Yes", script: "" }]);
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the key the OTHER event uses survived", locOf(`${EV}.z`) === "Shared", locText());

    console.log("\n[safety] an author's own conditional desc keys are not swept either");
    // Block-form desc names several keys, all inside this event's own file — which the cross-file scan
    // deliberately excludes. They are kept because the block just written still mentions them.
    const withCond = fs.readFileSync(path.join(MOD, "events", `${NS}.txt`), "utf8")
      .replace(new RegExp(`\\tdesc = ${EV.replace(".", "\\.")}\\.d`), `\tdesc = { text = ${EV}.d_war trigger = { has_war = yes } }\n\tdesc = { text = ${EV}.d_peace }`);
    fs.writeFileSync(path.join(MOD, "events", `${NS}.txt`), withCond, "utf8");
    const ymls = fs.readdirSync(path.join(MOD, "localisation", "english"));
    const target = path.join(MOD, "localisation", "english", ymls[0]);
    fs.writeFileSync(target, fs.readFileSync(target, "utf8").replace(/\n$/, "") +
      `\n ${EV}.d_war:0 "At war."\n ${EV}.d_peace:0 "At peace."\n`, "utf8");
    rec("the conditional keys are on disk to begin with",
      locOf(`${EV}.d_war`) === "At war." && locOf(`${EV}.d_peace`) === "At peace.",
      { w: locOf(`${EV}.d_war`), p: locOf(`${EV}.d_peace`) });
    r = await save([{ name: `${EV}.a`, title: "Yes", script: "" }]);
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and both conditional desc keys survived",
      locOf(`${EV}.d_war`) === "At war." && locOf(`${EV}.d_peace`) === "At peace.",
      { w: locOf(`${EV}.d_war`), p: locOf(`${EV}.d_peace`), loc: locText() });

    console.log(`\n=== event option loc orphan: ${checks} checks, ${fails.length} failed ===`);
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
