// #event-namespace-lowercased — saving an event whose namespace has a capital letter either did nothing or
// destroyed the original.
//
// The Save handler pushed the namespace through cleanScriptId(), which does .toLowerCase(). So an event
// loaded as USA_FOCUS.9 was saved as usa_focus.9 — a different event id — and the client also sent
// previousEventId: "USA_FOCUS.9", i.e. it told the server this was a RENAME. Two outcomes, both verified
// against copies of the real corpora:
//
//   1. SILENT NO-OP — when the event's file is not named after its namespace (MD's USA_FOCUS.9 lives in
//      "United States.txt"). findEventHomeFile looks for `id = usa_focus.9` case-sensitively, finds nothing,
//      and writes a brand-new events/usa_focus.txt. The typed title lands under usa_focus.9.t. The real
//      USA_FOCUS.9 is byte-identical to before, and nothing in the mod references the ghost. The modder can
//      edit that event forever and nothing changes in game.
//
//   2. ORIGINAL DESTROYED — when the file IS named after the namespace, which is the normal convention.
//      Windows' case-insensitive filesystem resolves events/serbia.txt onto the real Serbia.txt, so the ghost
//      is appended there; the rename-cleanup then strips the genuine Serbia.1 block out of that same file and
//      deletes its Serbia.1.t/.d/.a/.b localisation keys. The replacement is defined as serbia.1 under a
//      namespace the file never declares, so the engine cannot create it either. The event is simply gone.
//
// Population at risk (one event per save, not per click): 3175 of Millennium Dawn's 9340 events (34%) and
// 3489 of vanilla's 6577 (53%) sit under a capitalised namespace. Of MD's, 395 fall in the destructive class
// across 23 namespaces (Afghanistan, Denmark, Egypt, Germany, Japan, Serbia, Sweden, Turkey, …); of vanilla's,
// 496 across 12.
//
// HOI4's rule — and the server's own, at /api/events/save — is [A-Za-z_][A-Za-z0-9_]*: case preserved, no
// leading digit. So the defect was entirely client-side.
//
// This test evaluates the ACTUAL shipped functions out of public/events.js rather than a copy, so it fails if
// someone reintroduces the lowercasing.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// ── pull the real functions out of the shipped client and run them ────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  let d = 0, i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  return "";
};
const fnSrc = ["cleanScriptId", "cleanEventNamespace", "splitAiEventId"].map(grab).join("\n\n");
ok("the client still defines splitAiEventId and a namespace cleaner",
  /function splitAiEventId\(/.test(fnSrc) && /function cleanEventNamespace\(/.test(fnSrc), fnSrc.slice(0, 120));

// eslint-disable-next-line no-new-func
const { splitAiEventId, cleanEventNamespace } = new Function(`${fnSrc}\nreturn { splitAiEventId, cleanEventNamespace };`)();

// ── the bug itself ────────────────────────────────────────────────────────────────────────────────
const cases = [
  ["USA_FOCUS", "9", "USA_FOCUS"],
  ["BBA_italy_missiolinis", "9", "BBA_italy_missiolinis"],
  ["Serbia", "1", "Serbia"],
  ["Afghanistan", "3", "Afghanistan"],
  ["AAT_Sweden_BoP", "2", "AAT_Sweden_BoP"],
  ["MUN_czech", "5", "MUN_czech"],
];
cases.forEach(([ns, id, want]) => {
  const got = splitAiEventId(ns, id);
  ok(`${ns}.${id} keeps its namespace case`, got.namespace === want, got);
});

// A dotted id typed into the id box takes the same path.
ok("a dotted id keeps the namespace case too",
  splitAiEventId("ignored", "USA_FOCUS.9").namespace === "USA_FOCUS", splitAiEventId("ignored", "USA_FOCUS.9"));

// ── the rules the namespace must still obey ───────────────────────────────────────────────────────
ok("a lowercase namespace is unchanged", splitAiEventId("germany", "1").namespace === "germany");
ok("illegal characters are still replaced", cleanEventNamespace("My Events!", "x") === "My_Events",
  cleanEventNamespace("My Events!", "x"));
ok("a leading digit is still prefixed (it would lex as a number and break the file)",
  /^_/.test(cleanEventNamespace("1936_events", "x")), cleanEventNamespace("1936_events", "x"));
ok("an empty namespace still falls back", cleanEventNamespace("", "custom_events") === "custom_events");
ok("the id part is still normalised", splitAiEventId("GER", " 12 ").id === "12", splitAiEventId("GER", " 12 "));

// ── the source must not lowercase a namespace again ───────────────────────────────────────────────
const splitSrc = grab("splitAiEventId");
ok("splitAiEventId no longer routes the namespace through the lowercasing cleaner",
  !/cleanScriptId\(\s*namespace/.test(splitSrc) && !/ns\s*=\s*cleanScriptId\(/.test(splitSrc), splitSrc);

// ── and the server accepts what the client now produces ───────────────────────────────────────────
const ROOT = path.join(os.tmpdir(), "nova-nscase-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NS"\nsupported_version="1.18.*"\n');
// An event in a file named after its namespace — the destructive shape.
fs.writeFileSync(path.join(MOD, "events", "Serbia.txt"),
  'add_namespace = Serbia\n\ncountry_event = {\n\tid = Serbia.1\n\ttitle = Serbia.1.t\n\tdesc = Serbia.1.d\n\tis_triggered_only = yes\n\toption = { name = Serbia.1.a add_political_power = 10 }\n}\n', "utf8");

const PORT = 39951, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const before = fs.readFileSync(path.join(MOD, "events", "Serbia.txt"), "utf8");
    const norm = splitAiEventId("Serbia", "1");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, namespace: norm.namespace, id: norm.id, type: "country_event",
        title: "Edited Title", description: "d", picture: "GFX_report_event_generic_read_write",
        triggeredOnly: "yes", previousEventId: "Serbia.1",
        options: [{ name: "Serbia.1.a", title: "OK", script: "add_political_power = 10" }],
      }),
    }).then((x) => x.json());
    ok("the server accepts the capitalised namespace", r && r.ok !== false && !r.error, r);

    const files = fs.readdirSync(path.join(MOD, "events"));
    ok("no lowercase ghost file was created", !files.includes("serbia.txt") || files.length === 1, files);
    const after = fs.readFileSync(path.join(MOD, "events", "Serbia.txt"), "utf8");
    ok("the original event still exists", /\bid = Serbia\.1\b/.test(after), after);
    ok("…and was actually edited, not left untouched", before !== after, "file unchanged — save did nothing");
    ok("no lowercase twin was written into it", !/\bid = serbia\.1\b/.test(after), after);
    ok("the namespace declaration is intact", /add_namespace = Serbia\b/.test(after) && !/add_namespace = serbia\b/.test(after), after);

    console.log("\ntest-event-namespace-case: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
