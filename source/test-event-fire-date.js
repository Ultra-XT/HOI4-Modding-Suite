// Fire-date round-trip: a self-firing event with a typed fire-date but NO owner country used to save
// the date into nobody's history and silently vanish. The fix bakes the date into the event's OWN
// trigger as `date > Y.M.D #nova_fire_date` (Nova-owned, marked) + fire_only_once + a short MTTH, so it
// fires globally on that date. This test covers BOTH halves:
//   A) the real client helpers (extract/inject) pulled straight out of public/events.js, and
//   B) the live /api/events/save → on-disk → /api/events/list parse-back, proving the #nova_fire_date
//      marker survives the write+parse so the date reloads into the date field instead of accumulating.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ── Part A: eval the REAL helper source from public/events.js (not a copy) ───────────────────────────
const evtSrc = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
const a = evtSrc.indexOf("const NOVA_FIRE_DATE_RE");
const b = evtSrc.indexOf("function eventFullId", a);
check("located the fire-date helpers in events.js", a !== -1 && b !== -1 && b > a, `a=${a} b=${b}`);
let extractManagedFireDate, injectManagedFireDate;
if (a !== -1 && b !== -1) {
  const helperSrc = evtSrc.slice(a, b);
  const made = new Function(helperSrc + "\nreturn { extractManagedFireDate, injectManagedFireDate };")();
  extractManagedFireDate = made.extractManagedFireDate;
  injectManagedFireDate = made.injectManagedFireDate;
}

if (injectManagedFireDate && extractManagedFireDate) {
  // inject into an empty trigger
  const inj0 = injectManagedFireDate("", { year: 1939, month: 1, day: 1 });
  check("inject(empty) makes one marked date line", inj0 === "date > 1939.1.1 #nova_fire_date", inj0);

  // extract it back
  const ex0 = extractManagedFireDate(inj0);
  check("extract reads the date back", ex0.fireDate && ex0.fireDate.year === 1939 && ex0.fireDate.month === 1 && ex0.fireDate.day === 1, JSON.stringify(ex0.fireDate));
  check("extract leaves an empty trigger when the date was the only line", ex0.trigger === "", JSON.stringify(ex0.trigger));

  // inject ABOVE a user's own conditions, then extract — user's conditions survive untouched
  const userTrig = "NSX = { exists = yes }";
  const inj1 = injectManagedFireDate(userTrig, { year: 1940, month: 6, day: 15 });
  check("inject keeps the date line first, user conditions after", inj1 === `date > 1940.6.15 #nova_fire_date\n${userTrig}`, inj1);
  const ex1 = extractManagedFireDate(inj1);
  check("extract pulls the new date", ex1.fireDate && ex1.fireDate.year === 1940 && ex1.fireDate.day === 15, JSON.stringify(ex1.fireDate));
  check("extract returns the user's conditions cleanly (no date line)", ex1.trigger === userTrig, JSON.stringify(ex1.trigger));

  // NO ACCUMULATION: re-injecting strips the old managed line first
  const reinj = injectManagedFireDate(inj1, { year: 1941, month: 12, day: 7 });
  check("re-inject leaves exactly one managed date line", (reinj.match(/#nova_fire_date/g) || []).length === 1, reinj);
  check("re-inject uses the NEW date", /date > 1941\.12\.7 #nova_fire_date/.test(reinj) && !/1940\.6\.15/.test(reinj), reinj);

  // a user's OWN `date > …` (no marker) must NOT be hijacked by extract
  const userDate = "date > 1937.1.1\nNSX = { exists = yes }";
  const exU = extractManagedFireDate(userDate);
  check("extract ignores an unmarked user date condition", exU.fireDate === null && exU.trigger === userDate, JSON.stringify(exU));
}

// ── Part B+C: live server save + parse-back ──────────────────────────────────────────────────────────
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-firedate-"));
fs.mkdirSync(path.join(mod, "events"), { recursive: true });

const app = createApp();
const server = http.createServer(app);

function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = body ? { "Content-Type": "application/json", "Content-Length": data.length } : {};
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method, headers }, (res) => {
      let out = ""; res.on("data", c => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    // Simulate exactly what the client sends for a self-firing, ownerless, dated event:
    // the date is already baked into the trigger as a marked line, fire_only_once = yes, a 7-day MTTH.
    const trigger = "date > 1939.1.1 #nova_fire_date\nNSX = { exists = yes }";
    const resp = await req("POST", "/api/events/save", {
      modPath: mod, namespace: "fd", id: "1", type: "news_event",
      title: "Dawn", description: "It begins", picture: "",
      triggeredOnly: "no", hidden: "no", fireOnce: "yes", major: "no", mtthDays: 7,
      trigger, immediate: "", options: [{ name: "fd.1.a", title: "OK", script: "" }],
    });
    check("save returned 200", resp.status === 200, resp.status + " " + resp.body);

    const evtFiles = fs.readdirSync(path.join(mod, "events")).filter(f => f.endsWith(".txt"));
    check("save wrote an events file", evtFiles.length >= 1, evtFiles.join(","));
    const evtFile = fs.readFileSync(path.join(mod, "events", evtFiles[0]), "utf8");
    check("on-disk: is_triggered_only = no", /is_triggered_only\s*=\s*no/.test(evtFile));
    check("on-disk: the date condition is written", /date\s*>\s*1939\.1\.1/.test(evtFile), evtFile);
    check("on-disk: the #nova_fire_date marker survived the write", /#\s*nova_fire_date/.test(evtFile), evtFile);
    check("on-disk: fire_only_once = yes", /fire_only_once\s*=\s*yes/.test(evtFile));
    check("on-disk: mean_time_to_happen days = 7", /mean_time_to_happen\s*=\s*\{[^}]*days\s*=\s*7/.test(evtFile), evtFile);
    check("on-disk: user's NSX condition preserved", /NSX\s*=\s*\{\s*exists\s*=\s*yes/.test(evtFile.replace(/\s+/g, " ")), evtFile);
    check("on-disk: brace-balanced", (() => { let d = 0; for (const c of evtFile) { if (c === "{") d++; else if (c === "}") { if (--d < 0) return false; } } return d === 0; })());

    // Parse-back (this is what feeds the client's load): the marker MUST come back in evt.trigger so
    // loadEventBridge can extract the date into the date field instead of showing a raw trigger.
    const list = JSON.parse((await req("GET", `/api/events/list?modPath=${encodeURIComponent(mod)}`)).body);
    const evt = (list.events || []).find(e => e.fullId === "fd.1");
    check("parse-back: event found", !!evt);
    check("parse-back: trigger still carries the #nova_fire_date marker", !!evt && /#\s*nova_fire_date/.test(evt.trigger), evt && evt.trigger);
    check("parse-back: date is on its own line for the multiline regex", !!evt && /^[ \t]*date\s*>\s*1939\.1\.1[^\n]*#\s*nova_fire_date/m.test(evt.trigger), evt && JSON.stringify(evt.trigger));
    check("parse-back: mtthDays round-trips to 7", !!evt && evt.mtthDays === 7, evt && evt.mtthDays);
    check("parse-back: fireOnce round-trips to yes", !!evt && evt.fireOnce === "yes", evt && evt.fireOnce);

    // And the client extract on that real parsed trigger yields the date + the clean user condition.
    if (extractManagedFireDate && evt) {
      const ex = extractManagedFireDate(evt.trigger);
      check("end-to-end: extract on the parsed trigger recovers 1939.1.1", ex.fireDate && ex.fireDate.year === 1939, JSON.stringify(ex.fireDate));
      check("end-to-end: cleaned trigger keeps NSX, drops the date line", /NSX/.test(ex.trigger) && !/#nova_fire_date/.test(ex.trigger), JSON.stringify(ex.trigger));
    }
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.stack || e);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    await new Promise(r => server.close(r));
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nEVENT-FIRE-DATE: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
});
