// Regression (bug-hunt #18 — LIVE e2e finding, only real-UI driving surfaced it):
//   The Event Maker's Duplicate button minted `<namespace>._copy` as the new id (e.g. e2efz.77_copy). HOI4
//   converts EVERYTHING after the last dot to an INTEGER (wiki, Event modding) — a non-numeric id becomes 0,
//   so every such event collapses into ONE event in-game + "Failed to create id" errors in the log. The id was
//   silently broken and the file saved 200 OK. Two guards now exist:
//     (1) client public/events.js uniqueEventLocalId() mints the next free NUMBER in the namespace, and the
//         Save handler auto-renumbers a hand-typed non-numeric id (with an nbAlert).
//     (2) server /api/events/save throws on a non-numeric id (mirrors the tech/equipment id guards) so no
//         API caller can write the broken form either.
// Run: node test-event-id-guard.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 200)) : ""); } };

// ── (1) extract the shipped client uniqueEventLocalId and drive it with a stub id-set ──
// It calls allEventFullIds() (module closure over `allEvents`); inject a stub of that name in the eval scope.
function extractClientFn(name) {
  const src = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8").split(/\r?\n/);
  const start = src.findIndex((l) => l.includes("function " + name));
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    for (const c of src[i]) { if (c === "{") depth++; else if (c === "}") depth--; }
    if (i > start && depth === 0) { end = i; break; }
  }
  return src.slice(start, end + 1).join("\n");
}
const uniqBody = extractClientFn("uniqueEventLocalId");
ok("events.js ships uniqueEventLocalId", !!uniqBody);
// build a callable that closes over a controllable id set (the extracted body calls allEventFullIds())
function callUniq(idArray, namespace, base) {
  const allEventFullIds = () => new Set(idArray); // referenced by the extracted fn body via closure
  // eslint-disable-next-line no-eval
  const uniqueEventLocalId = eval("(" + uniqBody + ")");
  return uniqueEventLocalId(namespace, base);
}

// mints next free NUMBER, never a `_copy`/non-numeric suffix
{
  const r1 = callUniq(["e2efz.77"], "e2efz", "77");
  ok("duplicate of e2efz.77 mints a NUMBER", /^\d+$/.test(r1), r1);
  ok("duplicate of e2efz.77 → 78 (max+1)", r1 === "78", r1);
  const r2 = callUniq(["ns.1", "ns.2", "ns.5"], "ns", "2");
  ok("mints max+1 across the namespace (→6)", r2 === "6", r2);
  const r3 = callUniq(["ns.3", "ns.4"], "other", "abc");
  ok("empty namespace history + non-numeric base → 1", r3 === "1", r3);
  const r4 = callUniq(["ns.3", "ns.4"], "ns", "");
  ok("blank base still mints numeric (→5)", /^\d+$/.test(r4) && r4 === "5", r4);
  // collision avoidance: max+1 already taken by a gap-filler
  const r5 = callUniq(["ns.1", "ns.3"], "ns", "1");
  ok("skips taken ids (max=3 → 4)", r5 === "4", r5);
}

// ── (2) server /api/events/save rejects a non-numeric id ──
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtid-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EvtId"\n');
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
    const base = { modPath: mod, namespace: "ns", type: "country_event", title: "T", description: "D", picture: "GFX_report_event_001", triggeredOnly: "yes", options: [] };
    const bad = await post("/api/events/save", { ...base, id: "77_copy" });
    ok("server REJECTS non-numeric id (77_copy)", bad.status >= 400, bad.status + " " + bad.body);
    ok("server rejection names the rule", /number after the namespace/i.test(bad.body), bad.body);
    const bad2 = await post("/api/events/save", { ...base, id: "abc" });
    ok("server REJECTS alpha id (abc)", bad2.status >= 400, bad2.status + " " + bad2.body);
    const good = await post("/api/events/save", { ...base, id: "7" });
    ok("server ACCEPTS numeric id (7)", good.status < 400, good.status + " " + good.body);
    // and the file got exactly one event with the real id
    const ev = fs.readFileSync(path.join(mod, "events", "ns.txt"), "utf8");
    ok("saved file has id = ns.7", /id\s*=\s*ns\.7\b/.test(ev), ev.slice(0, 200));
  } catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nEVENT-ID-GUARD: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
