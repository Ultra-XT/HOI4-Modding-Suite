// #quoted-literal-title-desc-unquoted — A NO-EDIT SAVE TURNED A QUOTED TITLE INTO SCRIPT HOI4 CANNOT PARSE.
//
// `title = "…"` was read by stripping the quotes and treating the result as a localisation KEY, and the
// writer emitted that key BARE. A Clausewitz bareword cannot contain a space, so
//     title = "You shouldn't see this. REE DONT TRIGGER"     (Millennium Dawn, Influence.txt)
// came back as
//     title = You shouldn't see this. REE DONT TRIGGER
// and the file stopped loading. `desc = ""` is the same failure with nothing at all left after the `=`.
// Measured at event level: 2 quoted titles + 8 quoted descs in vanilla, 18 + 10 in Millennium Dawn.
//
// Vanilla's own usage is the SAFE half — `desc = "POLITICS_ANARCHIST_COMMUNE_DESC"` is a quoted loc key with
// no spaces, which survived unquoting. That is exactly what made the bug hard to see: the corpus that would
// have shown it is the one nobody round-trips.
//
// #quoted-option-name-replaced-with-unlocalised-key — the same idea one level down. An option's `name` is
// either a loc key or a quoted literal that IS the button text. The bareword-only reader did not match the
// literal, so the option came back nameless, the normaliser handed it the positional `<id>.a`, and the
// player saw a raw key on the button. Vanilla's TestEvents.txt ships `name = "Cry Havoc!"`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qlit-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

const MOD = path.join(ROOT, "qlit");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="QLit"\nsupported_version="1.19.*"\n', "utf8");

const NS = "qlitns";
const EVF = path.join(MOD, "events", `${NS}.txt`);
const SRC = [
  `add_namespace = ${NS}`,
  "",
  "country_event = {",                       // 1: a literal WITH SPACES — the corrupting case
  `\tid = ${NS}.1`,
  '\ttitle = "A Literal Title"',
  '\tdesc = "A literal description with spaces."',
  "\tpicture = GFX_report_event_001",
  "\tis_triggered_only = yes",
  '\toption = { name = "Do it!" add_political_power = 10 }',
  "}",
  "",
  "country_event = {",                       // 2: a QUOTED LOC KEY — vanilla's own shape, must also survive
  `\tid = ${NS}.2`,
  '\ttitle = "POLITICS_JAVIER_I_TITLE"',
  '\tdesc = "POLITICS_JAVIER_I_DESC"',
  "\tpicture = GFX_report_event_001",
  "\tis_triggered_only = yes",
  `\toption = { name = ${NS}.2.a add_political_power = 10 }`,
  "}",
  "",
  "country_event = {",                       // 3: an EMPTY quoted desc — MD ships three of these
  `\tid = ${NS}.3`,
  `\ttitle = ${NS}.3.t`,
  '\tdesc = ""',
  "\tpicture = GFX_report_event_001",
  "\tis_triggered_only = yes",
  `\toption = { name = ${NS}.3.a add_political_power = 10 }`,
  "}",
  "",
].join("\n");
fs.writeFileSync(EVF, SRC, "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "q_l_english.yml"),
  `\uFEFFl_english:\n ${NS}.3.t:0 "Three"\n ${NS}.2.a:0 "OK"\n ${NS}.3.a:0 "OK"\n`, "utf8");

// A bareword cannot hold whitespace, and a value cannot be empty. This is the check that matters.
const unparseableLines = (text) => {
  const out = [];
  for (const m of String(text).matchAll(/(^|\n)[ \t]*(title|desc|name)[ \t]*=[ \t]*([^\n{}]*)/g)) {
    const v = m[3].trim();
    if (v.startsWith('"')) continue;              // quoted — fine whatever is inside
    if (!v || /\s/.test(v)) out.push(`${m[2]} = ${JSON.stringify(v)}`);
  }
  return out;
};

const PORT = 43377;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] both forms ship in real content");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    let safeKeys = 0, unsafeLiterals = 0, litOptNames = 0;
    for (const root of [V, MD]) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "events")).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        const t = fs.readFileSync(path.join(root, "events", f), "utf8");
        for (const m of t.matchAll(/(country_event|news_event|state_event|unit_leader_event|operative_leader_event)\s*=\s*\{[\s\S]{0,400}?\n\s*(title|desc)\s*=\s*"([^"]*)"/g)) {
          if (/^[\p{L}\p{N}_.:-]+$/u.test(m[3])) safeKeys++; else unsafeLiterals++;
        }
        for (const _m of t.matchAll(/option\s*=\s*\{[^{}]{0,200}?\bname\s*=\s*"([^"]*)"/g)) litOptNames++;
      }
    }
    rec("real events use the QUOTED-LOC-KEY form", safeKeys > 5, { safeKeys, unsafeLiterals, litOptNames });
    rec("…and the QUOTED-LITERAL form, which is the one that corrupts", unsafeLiterals > 5,
      { safeKeys, unsafeLiterals });
    rec("…and a quoted option name exists too", litOptNames >= 1, litOptNames);

    console.log("\n[the fixture] starts out parseable");
    rec("nothing unparseable to begin with", unparseableLines(SRC).length === 0, unparseableLines(SRC));

    console.log("\n[the bug] a no-edit save must not write script the game cannot read");
    const r = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    rec("all three events read back", r.s === 200 && (r.b.events || []).length === 3, (r.b.events || []).map((e) => e.fullId));
    for (const ev of r.b.events || []) {
      const s = await post("/api/events/save", {
        modPath: MOD, namespace: NS, id: String(ev.fullId).split(".").pop(), type: ev.type,
        title: ev.title, description: ev.description, picture: ev.picture,
        triggeredOnly: ev.triggeredOnly,
        options: (ev.options || []).map((o) => ({
          name: o.name, title: o.title || "", script: o.script || "",
          aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
        })),
      });
      rec(`the save of ${ev.fullId} succeeded`, s.s === 200 && !s.b.error, s.b || s.s);
    }
    const after = fs.readFileSync(EVF, "utf8");
    rec("NOTHING in the file is unparseable", unparseableLines(after).length === 0, {
      bad: unparseableLines(after), after,
    });

    console.log("\n[fidelity] each form comes back exactly as written");
    rec("a spaced literal title keeps its quotes", /title = "A Literal Title"/.test(after), after);
    rec("…and so does the spaced literal desc", /desc = "A literal description with spaces\."/.test(after), after);
    rec("a QUOTED LOC KEY also keeps its quotes", /title = "POLITICS_JAVIER_I_TITLE"/.test(after), after);
    rec("an EMPTY quoted desc survives as an empty quoted desc", /desc = ""/.test(after), after);
    rec("the quoted option name is not replaced by a positional key", /name = "Do it!"/.test(after), after);
    rec("…and no localisation entry was invented for it",
      !/"Do it!"\s*:/.test(fs.readdirSync(path.join(MOD, "localisation", "english"))
        .map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n")),
      "a loc key was written for the literal");
    rec("…and the ordinary keyed options are untouched",
      new RegExp(`name = ${NS}\\.2\\.a`).test(after) && new RegExp(`name = ${NS}\\.3\\.a`).test(after), after);

    console.log("\n[control] the whole file is still brace-balanced and byte-stable");
    rec("brace-balanced", (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length, after);
    // A second pass must not drift — a preserved-verbatim path that re-wraps on each save would double the quotes.
    const r2 = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    for (const ev of r2.b.events || []) {
      await post("/api/events/save", {
        modPath: MOD, namespace: NS, id: String(ev.fullId).split(".").pop(), type: ev.type,
        title: ev.title, description: ev.description, picture: ev.picture,
        triggeredOnly: ev.triggeredOnly,
        options: (ev.options || []).map((o) => ({
          name: o.name, title: o.title || "", script: o.script || "",
          aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
        })),
      });
    }
    const after2 = fs.readFileSync(EVF, "utf8");
    rec("a second round trip changes nothing", after2 === after, { a: after.length, b: after2.length });
    rec("…and no quote was doubled", !/""[A-Za-z]/.test(after2) && !/[A-Za-z]""/.test(after2), after2);

    console.log(`\n=== event quoted literals: ${checks} checks, ${fails.length} failed ===`);
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
