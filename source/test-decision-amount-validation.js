// #decision-amount-silently-discarded — typing a value the Decision maker didn't RECOGNISE deleted the one
// that was already there.
//
// pdxAmountValue returns "" for anything it cannot parse, and its callers read "" as "the user cleared this
// field". days_remove, days_re_enable and priority are managed keys, so the on-disk lines were removed and
// never re-emitted; cost fell through to a literal `cost = 0`. The boxes are type="text" with no client-side
// validation, so "0,5" — a decimal comma, the normal form across most of Europe — silently destroyed an
// authored `cost = 150 / days_remove = 365 / days_re_enable = 30 / priority = 50`, and the save reported
// success. "90 days", "10%", "5." and "+30" did the same.
//
// Separately "1e3" PASSED, through the variable branch of the regex (it matches [A-Za-z0-9_]+), and was
// written verbatim as a bareword HOI4 resolves as an undefined variable.
//
// Fix: normalize the forms whose intent is unambiguous (+N, N., decimal comma), and REFUSE the rest instead
// of discarding it. Refusing is the point — it leaves the authored value on disk. Validation runs before
// anything is written, so a refusal cannot leave a half-applied save.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-decamt-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="D"\nsupported_version="1.18.*"\n');
const F = path.join(MOD, "common", "decisions", "probe_cat.txt");
const FIXTURE = "probe_cat = {\n\tmy_decision = {\n\t\tcost = 150\n\t\tdays_remove = 365\n\t\tdays_re_enable = 30\n\t\tpriority = 50\n\t}\n}\n";

const PORT = 39999, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (v) => {
    fs.writeFileSync(F, FIXTURE, "utf8");
    return fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, categoryId: "probe_cat", id: "my_decision", name: "D", description: "", cost: v, days: v, cooldown: v, priority: v }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), text: fs.readFileSync(F, "utf8") }));
  };
  const val = (txt, key) => { const m = new RegExp(`${key}\\s*=\\s*(\\S+)`).exec(txt); return m ? m[1] : null; };
  try {
    // ── values whose intent is unambiguous must be repaired, not discarded ───────────────────────
    for (const [typed, want] of [["0,5", "0.5"], ["5.", "5"], ["+30", "30"], ["365", "365"], ["150.5", "150.5"]]) {
      const r = await save(typed);
      ok(`"${typed}" saves`, r.status === 200 && r.body && (r.body.ok || r.body.success), { typed, status: r.status, err: r.body && r.body.error });
      ok(`…as cost = ${want}`, val(r.text, "cost") === want, { typed, got: val(r.text, "cost") });
      ok(`…and days_remove = ${want}`, val(r.text, "days_remove") === want, { typed, got: val(r.text, "days_remove") });
    }
    // a real script variable must still work
    {
      const r = await save("@MY_COST");
      ok("a script variable still saves", r.status === 200 && val(r.text, "cost") === "@MY_COST", val(r.text, "cost"));
    }

    // ── values that cannot be written must be REFUSED, leaving the file alone ────────────────────
    for (const typed of ["10%", "90 days", "abc def", "1,2,3"]) {
      const r = await save(typed);
      ok(`"${typed}" is REFUSED`, r.status >= 400 && r.body && r.body.error, { typed, status: r.status });
      ok(`…and the file is byte-identical`, r.text === FIXTURE, { typed, text: r.text });
      ok(`…the message names the value`, (r.body.error || "").includes(typed), r.body.error);
      ok(`…and says nothing was saved`, /Nothing was saved/i.test(r.body.error || ""), r.body.error);
    }

    // ── scientific notation: used to be written as a bareword variable ───────────────────────────
    {
      const r = await save("1e3");
      ok('"1e3" is REFUSED rather than written as a bareword', r.status >= 400, { status: r.status, cost: val(r.text, "cost") });
      ok("…the message explains HOI4 has no scientific notation", /no scientific notation/i.test((r.body && r.body.error) || ""), r.body && r.body.error);
      ok("…and the authored values survive", r.text === FIXTURE, r.text);
      ok("…in particular days_remove is still 365", val(r.text, "days_remove") === "365", val(r.text, "days_remove"));
      ok("…and priority is still 50", val(r.text, "priority") === "50", val(r.text, "priority"));
    }

    // ── genuinely clearing a field must still clear it ───────────────────────────────────────────
    {
      const r = await save("");
      ok("an empty box still saves", r.status === 200, { status: r.status, err: r.body && r.body.error });
      ok("…and really does clear the managed keys", !/days_remove/.test(r.text) && !/priority/.test(r.text), r.text);
      ok("…leaving cost = 0", val(r.text, "cost") === "0", val(r.text, "cost"));
    }

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a normalizer", /function normalizePdxAmountInput\(v\)/.test(src), "missing");
    ok("…handling the decimal comma", /t\.replace\(",", "\."\)/.test(src), "no decimal-comma repair");
    ok("there is an asserting validator", /function assertPdxAmount\(label, raw\)/.test(src), "missing");
    ok("…and it explains why", /#decision-amount-silently-discarded/.test(src), "no marker comment");
    const h = src.slice(src.indexOf('app.post("/api/decisions/save"'), src.indexOf('app.post("/api/decisions/save"') + 3000);
    ok("all four boxes are validated up front", /const costN = assertPdxAmount\("Cost", cost\);/.test(h) && /const daysN = assertPdxAmount/.test(h) && /const cooldownN = assertPdxAmount/.test(h) && /const priorityN = assertPdxAmount/.test(h), h.slice(0, 900));
    ok("…and the emitters use the normalized values", !/pdxAmountValue\((?:days|cooldown|priority|cost),/.test(src), "an emitter still uses the raw value");

    console.log("\ntest-decision-amount-validation: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 35 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
