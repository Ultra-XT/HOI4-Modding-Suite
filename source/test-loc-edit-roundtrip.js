// Regression (bug-hunt #16 — LIVE e2e findings, the first bugs only real-UI driving could see):
//  (1) [HIGH] Quoted titles DUPLICATED their tail on every save: the events upsertLoc match regex was lazy
//      + unanchored (`".*?"` no $), so on a value containing \" it matched only the line PREFIX and replace()
//      left the old tail appended. `E2E "Crisis"` grew another `"Crisis"…` copy per save, forever. Now greedy
//      + end-anchored.
//  (2) [med] Multi-line descriptions ESCALATED escaping on load→save: save escapes (\n → the two-char "\n")
//      but the editor loaded the RAW loc form and re-escaped it (\n → \\n → \\\\n …). events.js now applies
//      unescapeLocForEdit (the exact inverse of escapeLocalizationValue) when populating the form.
// Run: node test-loc-edit-roundtrip.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 200)) : ""); } };

// ── extract the ACTUAL shipped client fn from EVERY maker (each carries its own copy, per codebase style) ──
const extractUnescape = (file) => {
  const src = fs.readFileSync(path.join(__dirname, "public", file), "utf8").split(/\r?\n/);
  const start = src.findIndex((l) => l.includes("function unescapeLocForEdit"));
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    for (const c of src[i]) { if (c === "{") depth++; else if (c === "}") { depth--; } }
    if (i > start && depth === 0) { end = i; break; }
  }
  return eval("(" + src.slice(start, end + 1).join("\n") + ")");
};

// (2) inverse property per maker: unescape(escape(x)) === x for everything a user can type in the editor
const CORPUS = [
  'plain text',
  'He said "hold the line"',
  'Multi line\nsecond line\nthird',
  'back\\slash and quote " together',
  'tab\there',
  'mixed \\n literal-backslash-n typed by hand',
  '§YColored§! and [GetName] tokens',
  'edge "quote at end"',
  '"starts with quote',
  'trailing backslash \\',
];
let unescapeLocForEdit = null;
for (const file of ["events.js", "ideas.js", "decisions.js", "characters.js", "research.js"]) {
  const fn = extractUnescape(file);
  ok(`${file} ships unescapeLocForEdit`, typeof fn === "function");
  if (typeof fn !== "function") continue;
  const bad = CORPUS.filter((x) => fn(S.escapeLocalizationValue(x)) !== x);
  ok(`${file} inverse property holds on the whole corpus`, bad.length === 0, bad.map((b) => JSON.stringify(b)).join(" | "));
  if (!unescapeLocForEdit) unescapeLocForEdit = fn;
}

// (1) quoted-title double-save through the real endpoint: loc line must be byte-stable + value intact
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locrt-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="LocRT"\n');
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
    const title = 'E2E "Crisis" 50% [Test]';
    const payload = { modPath: mod, namespace: "rt", id: "1", type: "country_event", title, description: 'Line one\nLine "two"', picture: "GFX_report_event_001", triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "", options: [{ name: "rt.1.a", title: 'Say "yes"', script: "" }] };
    const loc = path.join(mod, "localisation/english/custom_events_l_english.yml");
    for (let i = 0; i < 4; i++) { const r = await post("/api/events/save", payload); ok(`save ${i + 1} ok`, r.status < 400, r.body); }
    const txt = fs.readFileSync(loc, "utf8");
    const tLines = txt.match(/^\s*rt\.1\.t:.*$/gm) || [];
    ok("title loc exactly ONE line after 4 saves", tLines.length === 1, tLines);
    ok("title value INTACT (no duplicated tail)", tLines[0] === ' rt.1.t:0 "E2E \\"Crisis\\" 50% [Test]"', tLines[0]);
    const oLines = txt.match(/^\s*rt\.1\.a:.*$/gm) || [];
    ok("option title intact", oLines.length === 1 && oLines[0] === ' rt.1.a:0 "Say \\"yes\\""', oLines);
    // the editor-load simulation: unescaping the on-disk value returns EXACTLY what the user typed
    const stored = tLines[0].match(/"(.*)"$/)[1];
    ok("editor load (unescape) returns the typed title", unescapeLocForEdit(stored) === title, unescapeLocForEdit(stored));

    // ── (3) version-less upsert dedup: a pre-existing VERSION-LESS loc line (the form MD ships 1.8M of)
    //        must be REPLACED by a save, not duplicated by append (the old :0-anchored matchers missed it) ──
    const locT = path.join(mod, "localisation/english/custom_technologies_l_english.yml");
    fs.mkdirSync(path.dirname(locT), { recursive: true });
    fs.writeFileSync(locT, "﻿l_english:\n vless_tech: \"Old Name\"\n", "utf8");
    const rt2 = await post("/api/technologies/save", { modPath: mod, tech: { id: "vless_tech", fileName: "custom_technologies.txt", folder: "infantry_folder", name: "New Name", year: 1936, extraScript: "" } });
    ok("tech save over version-less line ok", rt2.status < 400, rt2.body);
    const tl = (fs.readFileSync(locT, "utf8").match(/^\s*vless_tech:.*$/gm) || []);
    ok("tech: version-less line REPLACED not duplicated", tl.length === 1 && /New Name/.test(tl[0]), tl);

    const locI = path.join(mod, "localisation/english/custom_ideas_l_english.yml");
    fs.writeFileSync(locI, "﻿l_english:\n vless_spirit: \"Old Spirit\"\n", "utf8");
    const ri2 = await post("/api/ideas/upsert-definition", { modPath: mod, ideaId: "vless_spirit", targetRelativeFile: "custom_ideas.txt", targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml", name: "New Spirit", desc: "", picture: "militant_group_soldier", category: "country", mode: "create", selectedEffects: [] });
    ok("idea save over version-less line ok", ri2.status < 400, ri2.body);
    const il = (fs.readFileSync(locI, "utf8").match(/^\s*vless_spirit:.*$/gm) || []);
    ok("idea: version-less line REPLACED not duplicated", il.length === 1 && /New Spirit/.test(il[0]), il);
  } catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nLOC-EDIT-ROUNDTRIP: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
