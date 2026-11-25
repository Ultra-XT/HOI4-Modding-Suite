// #preview-invents-option-text — AN EVENT OPTION WITH NO BUTTON TEXT SHIPS A RAW KEY, AND NOVA HID IT.
//
// `option = { name = <key> }` puts whatever <key> localises to on the button. HOI4 prints the key itself
// when nothing defines it, so leaving "Button text" blank ships an event whose choice reads
// "novaexp.1.a". Two things conspired to keep that quiet:
//
//   · the writer refuses to localise an empty box — CORRECT, and load-bearing: inventing text there is how
//     a no-touch Save used to degrade 328 MD / 633 vanilla events whose .t key simply does not exist. But
//     it refused SILENTLY;
//   · public/events.js's live preview substituted a friendly "Option Text" for a blank box, so the one
//     surface whose whole job is to show the player's view was the surface hiding the defect. Nova looked
//     finished and the built mod had raw keys on its buttons.
//
// Measured while driving eight event variants through /api/events/save on an add-on over Millennium Dawn:
// every option name was written into the .txt and NONE of them got a loc key, with nothing said.
//
// The fix is a note on save plus an honest preview. The note is the interesting half, because it must not
// cry wolf — see the three controls below, of which the dependency one is the real test: reusing a key the
// base game or a base mod already defines is ordinary modding, and warning about it would be noise.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-opttext-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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

const toPosix = (p) => p.split(path.sep).join("/");
// A base mod that DEFINES one option key, so the add-on can legitimately reuse it.
const BASE = path.join(ROOT, "optbase");
fs.mkdirSync(path.join(BASE, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="OptBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "optbase.mod"), 'name="OptBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "localisation", "english", "zz_optbase_l_english.yml"),
  "﻿l_english:\n inherited_option_key:0 \"Carry on\"\n", "utf8");

const MOD = path.join(ROOT, "optmod");
fs.mkdirSync(MOD, { recursive: true });
const dep = 'dependencies={\n\t"OptBase"\n}\n';
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OptMod"\n' + dep + 'supported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "optmod.mod"), 'name="OptMod"\npath="' + toPosix(MOD) + '"\n' + dep + 'supported_version="1.19.*"\n');

const PORT = 52995;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
      .catch((e) => ({ status: 0, body: { error: String(e) } }));

    // ⭐ SEND WHAT THE CLIENT SENDS — public/events.js:2003. "yes"/"no" STRINGS, options as objects with
    // { name, title, script, aiChance, trigger }. A boolean here writes `no` and measures nothing.
    const base = {
      modPath: MOD, picture: "", triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no",
      mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
      title: "T", description: "D",
    };
    const OPT = (name, title) => ({ name, title: title || "", script: "", aiChance: null, trigger: "" });
    const save = (id, options) => post("/api/events/save",
      { ...base, namespace: "optns", id: String(id), type: "country_event", options });
    const warnOf = (r) => String((r.body && r.body.refWarning) || "");

    console.log("\n[the defect] a blank Button text must be reported, not swallowed");
    {
      const r = await save(1, [OPT("optns.1.a"), OPT("optns.1.b")]);
      rec("the save itself still succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      const w = warnOf(r);
      console.log(`     note: ${JSON.stringify(w.slice(0, 190))}`);
      rec("…and says so", /button will read the key itself/i.test(w), w || "(silent)");
      rec("…naming the keys that will show raw", /optns\.1\.a/.test(w) && /optns\.1\.b/.test(w), w);
      rec("…and counting them", /2 options have/.test(w), w);
    }

    console.log("\n[CONTROL 1] an option WITH text says nothing");
    {
      const r = await save(2, [OPT("optns.2.a", "We stand firm")]);
      const w = warnOf(r);
      rec("no note when the author filled the box", !/button will read the key/i.test(w), w);
      // …and prove the fixture is real: the text must have reached the .yml, or this control is vacuous.
      const loc = fs.readFileSync(path.join(MOD, "localisation", "english",
        fs.readdirSync(path.join(MOD, "localisation", "english"))[0]), "utf8");
      rec("…because the text really was written", /We stand firm/.test(loc), loc.slice(0, 200));
    }

    console.log("\n[CONTROL 2] a QUOTED literal name is the button text, not a key");
    {
      const r = await save(3, [OPT('"Yes, at once"')]);
      const w = warnOf(r);
      rec("no note for a quoted literal", !/button will read the key/i.test(w), w);
    }

    console.log("\n[⭐ CONTROL 3] a key the BASE MOD already defines is ordinary reuse");
    {
      // The one that matters. Reusing a key defined by a dependency or the base game is normal modding, and
      // a note here would be pure noise — exactly the cry-wolf failure mode. getLocalizationMap merges the
      // layers, so the check has to consult it rather than look only at this mod's own .yml files.
      const r = await save(4, [OPT("inherited_option_key")]);
      const w = warnOf(r);
      console.log(`     note: ${JSON.stringify(w.slice(0, 120)) || '""'}`);
      rec("no note for a key the base mod localises", !/button will read the key/i.test(w), w);
      // …and assert the fixture actually has that property, or CONTROL 3 proves nothing.
      const j = await fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`)
        .then((x) => x.json()).catch(() => ({}));
      const ev = ((j.events) || []).find((e) => e.fullId === "optns.4");
      const optTitle = ev && (ev.options || [])[0] && (ev.options || [])[0].title;
      rec("…and that key really does resolve, from the layer below", String(optTitle || "") === "Carry on",
        { optTitle, note: "if this is empty the base mod's loc never resolved and CONTROL 3 is vacuous" });
    }

    console.log("\n[the preview] must show what the GAME shows, not a friendly invention");
    {
      const ejs = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
      rec("the preview no longer invents text for a blank box",
        !/\.opt-title"\)\?\.value\.trim\(\) \|\| "Option Text"/.test(ejs),
        'still falls straight back to "Option Text"');
      rec("…it falls back to the option NAME, which is what HOI4 prints",
        /opt-name[\s\S]{0,400}opt-title[\s\S]{0,200}optNameRaw/.test(ejs), "no name-based fallback found");
    }

    console.log("\n[CONTROL] the note rides the channel the surface already drains");
    {
      // refWarning is drained by public/loading-overlay.js's notesIn, so this note reaches a dialog rather
      // than a status line that the page's own next message overwrites. A NEW field name would have to be
      // claimed globally, and generic names collide — see #army-save-notes-invisible.
      const lo = fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8");
      rec("refWarning is still a drained channel", /typeof body\.refWarning === "string"/.test(lo),
        "the surface stopped draining refWarning — this note now goes nowhere");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== event option has no text: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
