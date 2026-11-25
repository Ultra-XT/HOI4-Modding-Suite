// Regression (bug-hunt #19 — client-JS adversarial workflow): the tech/equipment leading-digit id guard
// (test #41) never propagated to the other makers. PDX bareword keys must match [A-Za-z_][A-Za-z0-9_]* —
// HOI4 lexes a leading digit as a NUMBER, so a key like `2024_budget = {` fails to parse and corrupts the
// whole file. The decision id/category, event NAMESPACE (the id after the dot is separately required to be
// numeric — see test-event-id-guard.js), character token, and idea id all accepted a leading digit; the
// character server regex additionally allowed dots. Fixes:
//   - client cleanScriptId (decisions/ideas) + splitAiEventId (events namespace) auto-prefix "_" on a
//     leading digit so an AI-suggested / typed id stays valid;
//   - client save validators tightened to /^[A-Za-z_][A-Za-z0-9_]*$/;
//   - server guards tightened: /api/decisions/save (category + id), /api/events/save (namespace),
//     /api/characters/save (token, also forbids dots), /api/ideas/upsert-definition (ideaId).
// Run: node test-leading-digit-id-guard.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 200)) : ""); } };

// ── extract a self-contained client fn (brace-matched) from a maker file ──
function extractFn(file, name) {
  const src = fs.readFileSync(path.join(__dirname, "public", file), "utf8").split(/\r?\n/);
  const start = src.findIndex((l) => l.includes("function " + name));
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    for (const c of src[i]) { if (c === "{") depth++; else if (c === "}") depth--; }
    if (i > start && depth === 0) { end = i; break; }
  }
  return src.slice(start, end + 1).join("\n");
}

// (1) client cleanScriptId auto-repairs a leading digit (decisions + ideas)
for (const file of ["decisions.js", "ideas.js"]) {
  const body = extractFn(file, "cleanScriptId");
  ok(`${file} ships cleanScriptId`, !!body);
  if (!body) continue;
  // eslint-disable-next-line no-eval
  const cleanScriptId = eval("(" + body + ")");
  ok(`${file} cleanScriptId prefixes _ on leading digit`, cleanScriptId("2024_budget", "fb") === "_2024_budget", cleanScriptId("2024_budget", "fb"));
  ok(`${file} cleanScriptId leaves a valid id untouched`, cleanScriptId("my_spirit", "fb") === "my_spirit", cleanScriptId("my_spirit", "fb"));
  ok(`${file} cleanScriptId still lowercases + underscores`, cleanScriptId("My Cool Thing", "fb") === "my_cool_thing", cleanScriptId("My Cool Thing", "fb"));
  ok(`${file} cleanScriptId digit-only id gets a _ prefix`, /^_/.test(cleanScriptId("2024", "fb")), cleanScriptId("2024", "fb"));
}

// (2) client splitAiEventId repairs the NAMESPACE but keeps the id numeric
{
  const cs = extractFn("events.js", "cleanScriptId");
  // The namespace is cleaned by its OWN helper now — cleanScriptId lowercases, and lowercasing a namespace
  // renames the event (#event-namespace-lowercased). splitAiEventId depends on both, so both are extracted.
  const cn = extractFn("events.js", "cleanEventNamespace");
  const ss = extractFn("events.js", "splitAiEventId");
  ok("events.js ships splitAiEventId + cleanScriptId + cleanEventNamespace", !!cs && !!ss && !!cn);
  // eslint-disable-next-line no-eval
  const splitAiEventId = eval("(function(){ " + cs + "\n" + cn + "\n" + ss + "\n return splitAiEventId; })()");
  const r1 = splitAiEventId("2024_events", "5");
  ok("event namespace with leading digit repaired to _2024_events", r1.namespace === "_2024_events", r1.namespace);
  ok("event numeric id left numeric (NOT prefixed)", r1.id === "5", r1.id);
  // a dotted rawId is split into namespace + trailing id; the derived namespace still gets digit-repaired
  const r2 = splitAiEventId("custom_events", "2024_events.7");
  ok("dotted id splits: namespace repaired, id numeric", r2.namespace === "_2024_events" && r2.id === "7", JSON.stringify(r2));
  const r3 = splitAiEventId("custom_events", "9");
  ok("valid namespace untouched", r3.namespace === "custom_events" && r3.id === "9", JSON.stringify(r3));
}

// ── (3) server rejects leading-digit / dotted keys; accepts valid ones ──
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ld-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="LD"\n');
const app = S.createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
  r.on("error", rej); r.write(data); r.end();
});

server.listen(0, "127.0.0.1", async () => {
  try {
    // decisions
    const dBad = await post("/api/decisions/save", { modPath: mod, categoryId: "2024_decisions", id: "my_dec", name: "X" });
    ok("decisions: leading-digit CATEGORY rejected", dBad.status >= 400 && /letter or underscore/i.test(dBad.body), dBad.status + " " + dBad.body);
    const dBad2 = await post("/api/decisions/save", { modPath: mod, categoryId: "cat_x", id: "3_dec", name: "X" });
    ok("decisions: leading-digit ID rejected", dBad2.status >= 400, dBad2.status + " " + dBad2.body);
    const dOk = await post("/api/decisions/save", { modPath: mod, categoryId: "cat_x", id: "my_dec", name: "X", cost: 0, scope: "national" });
    ok("decisions: valid ids accepted", dOk.status < 400, dOk.status + " " + dOk.body);

    // events (namespace)
    const eBad = await post("/api/events/save", { modPath: mod, namespace: "2024_events", id: "7", type: "country_event", title: "T", description: "D", picture: "GFX_report_event_001", triggeredOnly: "yes", options: [] });
    ok("events: leading-digit NAMESPACE rejected", eBad.status >= 400 && /letter or underscore/i.test(eBad.body), eBad.status + " " + eBad.body);
    const eOk = await post("/api/events/save", { modPath: mod, namespace: "custom_ev", id: "7", type: "country_event", title: "T", description: "D", picture: "GFX_report_event_001", triggeredOnly: "yes", options: [] });
    ok("events: valid namespace accepted", eOk.status < 400, eOk.status + " " + eOk.body);

    // characters (token: leading digit)
    const cBad = await post("/api/characters/save", { modPath: mod, token: "3_char", name: "Bob", roleGeneral: true, generalType: "corps_commander" });
    ok("characters: leading-digit token rejected", cBad.status >= 400 && /letter or underscore/i.test(cBad.body), cBad.status + " " + cBad.body);
    // RETARGETED (#dotted-vanilla-token-listed-but-unsaveable): a DOT is legal and vanilla ships two such
    // tokens (AST_florence_v._mckenzie, AST_eric_l._lloyd), so refusing it locked those two characters out of
    // the editor entirely. A leading digit is still refused — HOI4 lexes that as a number.
    const cDot = await post("/api/characters/save", { modPath: mod, token: "my.char", name: "Bob", roleGeneral: true, generalType: "corps_commander" });
    ok("characters: dotted token ACCEPTED (vanilla ships them)", cDot.status < 400, cDot.status + " " + cDot.body);
    const cDotDigit = await post("/api/characters/save", { modPath: mod, token: "3.char", name: "Bob", roleGeneral: true, generalType: "corps_commander" });
    ok("characters: a dot does not excuse a leading digit", cDotDigit.status >= 400, cDotDigit.status + " " + cDotDigit.body);
    const cOk = await post("/api/characters/save", { modPath: mod, token: "my_char", name: "Bob", roleGeneral: true, generalType: "corps_commander" });
    ok("characters: valid token accepted", cOk.status < 400, cOk.status + " " + cOk.body);

    // ideas (upsert-definition)
    const iBad = await post("/api/ideas/upsert-definition", { modPath: mod, ideaId: "2024_spirit", targetRelativeFile: "custom_ideas.txt", targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml", name: "S", desc: "", picture: "militant_group_soldier", category: "country", mode: "create", selectedEffects: [] });
    ok("ideas: leading-digit ID rejected", iBad.status >= 400 && /letter or underscore/i.test(iBad.body), iBad.status + " " + iBad.body);
    const iOk = await post("/api/ideas/upsert-definition", { modPath: mod, ideaId: "my_spirit", targetRelativeFile: "custom_ideas.txt", targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml", name: "S", desc: "", picture: "militant_group_soldier", category: "country", mode: "create", selectedEffects: [] });
    ok("ideas: valid ID accepted", iOk.status < 400, iOk.status + " " + iOk.body);
  } catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nLEADING-DIGIT-ID-GUARD: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
