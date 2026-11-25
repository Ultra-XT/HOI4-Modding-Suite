// #commented-option-resurrected — a deliberately disabled `#option = { … #}` came back as a live button.
//
// The option scan ran `/\boption\s*=\s*\{/g` over the RAW block text and then walked braces counting every
// `{` and `}`. `#option = {` matches — `#` is a non-word character, so the `\b` before `option` holds — and
// the walk closed the option on the commented `#}`. parseEventOptionParts skips comments properly, so the
// option came back with a `name` lifted out of the comment and an EMPTY script, and the writer emitted it as
// a real, effect-free button. It is written FIRST, so on an event with `timeout_days` it is the one the game
// auto-picks — and the commented-out source was deleted in the same save.
//
// This fires on a plain open-and-save of a stock vanilla file: china.100 in events/China.txt ships with a
// commented-out `#option = { #\tname = china.100.b #\t#Nothing #}`.
//
// Fix: mask comments before both the match and the brace walk. Quoted strings are tracked too — a `#` inside
// a string does not start a comment, and treating it as one would break the walk in the other direction.
//
// Driven through /api/events/list (the shipped read path) — parseEventsFromFile is not exported, and an
// undefined parser makes every "the bad option is absent" check pass for the wrong reason.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-commopt-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EV"\nsupported_version="1.18.*"\n');
const ev = (n, body) => fs.writeFileSync(path.join(MOD, "events", n), body, "utf8");

// vanilla's exact shape: one live option, one commented out
ev("probe.txt",
  "add_namespace = probe\n\ncountry_event = {\n\tid = probe.1\n\ttitle = probe.1.t\n\tdesc = probe.1.d\n\tis_triggered_only = yes\n\n" +
  "\toption = {\n\t\tname = probe.1.a\n\t\tadd_political_power = 50\n\t}\n" +
  "\t#option = {\n\t#\tname = probe.1.b\n\t#\t#Nothing\n\t#}\n}\n");
// a live option containing a commented brace must still close on its own `}`
ev("probe2.txt",
  "add_namespace = probe2\n\ncountry_event = {\n\tid = probe2.1\n\ttitle = probe2.1.t\n\tdesc = probe2.1.d\n\tis_triggered_only = yes\n" +
  "\toption = {\n\t\tname = probe2.1.a\n\t\t#if = { limit = { tag = GER }\n\t\t#}\n\t\tadd_political_power = 10\n\t}\n" +
  "\toption = {\n\t\tname = probe2.1.b\n\t\tadd_stability = 0.1\n\t}\n}\n");
// a # inside a quoted string is not a comment
ev("probe3.txt",
  "add_namespace = probe3\n\ncountry_event = {\n\tid = probe3.1\n\ttitle = probe3.1.t\n\tdesc = probe3.1.d\n\tis_triggered_only = yes\n" +
  '\toption = {\n\t\tname = probe3.1.a\n\t\tset_variable = { x = "a#b" }\n\t\tadd_political_power = 5\n\t}\n' +
  "\toption = {\n\t\tname = probe3.1.b\n\t\tadd_stability = 0.2\n\t}\n}\n");

const PORT = 39978, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    ok("the endpoint returned events", list && Array.isArray(list.events) && list.events.length === 3, JSON.stringify(list).slice(0, 200));
    const byId = {}; (list.events || []).forEach((e) => { byId[e.fullId] = e; });

    // ── the commented-out option must not exist ──────────────────────────────────────────────────
    const e1 = byId["probe.1"];
    ok("probe.1 parsed", !!e1, Object.keys(byId));
    ok("…with exactly ONE option, not two", e1 && (e1.options || []).length === 1, e1 && (e1.options || []).map((o) => o.name));
    ok("…and it is the live one", e1 && ((e1.options || [])[0] || {}).name === "probe.1.a", e1 && (e1.options || [])[0]);
    ok("…which kept its effect", e1 && /add_political_power\s*=\s*50/.test(((e1.options || [])[0] || {}).script || ""), e1 && (e1.options || [])[0]);
    ok("no option named probe.1.b exists", e1 && !(e1.options || []).some((o) => (o.name || "").endsWith(".b")), e1 && (e1.options || []).map((o) => o.name));
    ok("…and no option came back with an empty script", e1 && !(e1.options || []).some((o) => !String(o.script || "").trim()), e1 && (e1.options || []).map((o) => o.script));

    // ── a commented brace inside a live option must not swallow the next one ─────────────────────
    const e2 = byId["probe2.1"];
    ok("a commented `{` inside a live option does not swallow the next option", e2 && (e2.options || []).length === 2, e2 && (e2.options || []).map((o) => o.name));
    ok("…the first keeps its effect", e2 && /add_political_power\s*=\s*10/.test(((e2.options || [])[0] || {}).script || ""), e2 && (e2.options || [])[0]);
    ok("…and the second keeps its own", e2 && /add_stability/.test(((e2.options || [])[1] || {}).script || ""), e2 && (e2.options || [])[1]);

    // ── a # inside a quoted string is not a comment ──────────────────────────────────────────────
    const e3 = byId["probe3.1"];
    ok("a # inside a quoted string doesn't comment out the rest", e3 && (e3.options || []).length === 2, e3 && (e3.options || []).map((o) => o.name));
    ok("…and the string survives intact", e3 && /a#b/.test(((e3.options || [])[0] || {}).script || ""), e3 && (e3.options || [])[0]);

    // ── the real vanilla file, read-only ─────────────────────────────────────────────────────────
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const CHINA = path.join(VAN, "events", "China.txt");
    if (fs.existsSync(CHINA)) {
      ok("vanilla China.txt really does ship a commented-out option",
        /#\s*option\s*=\s*\{/.test(fs.readFileSync(CHINA, "utf8")), "shape changed — confirm the fix still matters");
      const vl = await fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(VAN)}`).then((r) => r.json());
      const c100 = (vl.events || []).find((e) => e.fullId === "china.100");
      if (c100) {
        ok("china.100 has no option named china.100.b", !(c100.options || []).some((o) => (o.name || "") === "china.100.b"), (c100.options || []).map((o) => o.name));
        ok("…and no option with an empty script", !(c100.options || []).some((o) => !String(o.script || "").trim()),
          (c100.options || []).map((o) => ({ n: o.name, len: String(o.script || "").trim().length })));
      } else { console.log("  --  china.100 not found; skipping"); }
      // Nothing under the vanilla install may be touched by a read.
      ok("the vanilla file is untouched by the read", fs.readFileSync(CHINA, "utf8").includes("#option"), "vanilla file changed");
    } else { console.log("  --  vanilla install not present; skipping the real-file check"); }

    // ── the mask itself ──────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const at = src.indexOf("const codeMask = new Uint8Array");
    const scan = src.slice(at, at + 1600);
    ok("the scanner builds a comment mask", at > 0, "mask gone");
    ok("…skips a commented-out option outright", /if \(!codeMask\[optStart\]\) continue;/.test(scan), scan.slice(0, 700));
    ok("…and skips commented braces during the walk", /if \(!codeMask\[j\]\) continue;/.test(scan), scan.slice(0, 900));
    ok("…tracking quoted strings so a # inside one is not a comment", /else if \(ch === '"'\) inStr = true;/.test(scan), scan.slice(0, 700));
    ok("…and it explains why", /#commented-option-resurrected/.test(src), "no marker comment");

    console.log("\ntest-event-commented-option: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 17 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
