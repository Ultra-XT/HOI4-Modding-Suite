// #stdout-epipe-kills-the-app — A LOG LINE TOOK THE WHOLE APP DOWN, THEN WEDGED IT.
//
// Reported from a real session as Electron's fatal dialog:
//     A JavaScript error occurred in the main process
//     Uncaught Exception: Error: EPIPE: broken pipe, write
//         at console.log (node:internal/console/constructor:313:16)
//         at ServerResponse.<anonymous> (D:\Nova\server.js:10578:15)
//         at ServerResponse.emit … at onFinish …
//
// Nova logs `[API REQUEST] …` from inside `res.on("finish", …)` — on EVERY request. The packaged EXE's stdout
// is a pipe nobody reads; the comment on that very logger says so. When the reader goes away the write raises
// EPIPE, and because the write happens inside an emitter callback there is nothing to catch it: it becomes an
// uncaught exception in the Electron main process.
//
// The dialog is not the worst of it. stdout stays broken, so EVERY later response throws the same way — the
// server keeps accepting connections and never finishes one. A wedged instance measured exactly that: process
// alive, socket LISTENING, ZERO cpu, all 49 threads idle, connections piling up in CLOSE_WAIT.
//
// So the guard belongs at the STREAM, not at the one call site that happened to be on the stack — server.js
// makes 44 console.* calls and any of them can be reached from a callback.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-epipe-"));
const runChild = (body) => {
  const f = path.join(TMP, `child_${Math.abs(body.length)}_${checks}.js`);
  fs.writeFileSync(f, body, "utf8");
  return spawnSync(process.execPath, [f], { encoding: "utf8", timeout: 60000, killSignal: "SIGKILL" });
};

console.log("\n[1. the mechanism] an unheard 'error' on stdout IS a fatal uncaught exception");
{
  // Establish that the failure mode is real before asserting Nova survives it — otherwise a passing test
  // might only mean the simulation never fired.
  const r = runChild(`
    const e = Object.assign(new Error("EPIPE: broken pipe, write"), { code: "EPIPE", errno: -4047, syscall: "write" });
    process.stdout.emit("error", e);
    console.error("SURVIVED");
  `);
  const out = (r.stdout || "") + (r.stderr || "");
  console.log(`     bare node: exit=${r.status}, mentions EPIPE=${/EPIPE/.test(out)}`);
  rec("without a handler this kills the process", r.status !== 0 && /EPIPE/.test(out), { status: r.status, out: out.slice(-200) });
}

console.log("\n[2. requiring server.js] installs a guard, so the same event is survivable");
{
  const r = runChild(`
    require(${JSON.stringify(path.join(__dirname, "server.js").replace(/\\\\/g, "/"))});
    const e = Object.assign(new Error("EPIPE: broken pipe, write"), { code: "EPIPE", errno: -4047, syscall: "write" });
    process.stdout.emit("error", e);
    process.stderr.emit("error", e);
    console.error("SURVIVED");
  `);
  const out = (r.stdout || "") + (r.stderr || "");
  console.log(`     with server.js: exit=${r.status}, survived=${/SURVIVED/.test(out)}`);
  rec("the process does not die", r.status === 0, { status: r.status, out: out.slice(-300) });
  rec("…and it keeps running afterwards", /SURVIVED/.test(out), out.slice(-300));
  rec("…and stderr is guarded too, not just stdout", r.status === 0, { status: r.status });
}

console.log("\n[3. the real thing] a genuinely broken stdout, with requests flowing");
{
  // Not a simulated event: give the child a stdout PIPE and destroy the read end, then serve requests. Every
  // res.on("finish") logger then writes to a pipe with no reader — the reported crash, reproduced.
  const child = path.join(TMP, "serve.js");
  fs.writeFileSync(child, `
    const os = require("os"), fs = require("fs"), path = require("path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-epipe-srv-"));
    process.env.HOI4_MODS_ROOT = root;
    process.env.APPDATA = path.join(root, "appdata");
    fs.mkdirSync(process.env.APPDATA, { recursive: true });
    const { createApp } = require(${JSON.stringify(path.join(__dirname, "server.js").replace(/\\\\/g, "/"))});
    const srv = createApp().listen(0, "127.0.0.1", async () => {
      const port = srv.address().port;
      let ok = 0, err = 0;
      // Chatter first so the pipe is definitely written to after the reader is gone.
      for (let i = 0; i < 40; i++) console.log("filler line " + i + " " + "x".repeat(400));
      for (let i = 0; i < 25; i++) {
        try {
          const r = await fetch("http://127.0.0.1:" + port + "/api/debug/slow-requests");
          if (r.ok) { await r.json(); ok++; } else err++;
        } catch (_) { err++; }
      }
      fs.writeFileSync(path.join(root, "result.json"), JSON.stringify({ ok, err }));
      fs.writeFileSync(path.join(os.tmpdir(), "nova-epipe-result.json"), JSON.stringify({ ok, err }));
      srv.close(); process.exit(0);
    });
  `, "utf8");

  const { spawn } = require("child_process");
  const resultPath = path.join(os.tmpdir(), "nova-epipe-result.json");
  try { fs.rmSync(resultPath, { force: true }); } catch (_) {}
  const p = spawn(process.execPath, [child], { stdio: ["ignore", "pipe", "pipe"] });
  // Destroy the read end immediately: subsequent writes from the child hit a pipe with no reader.
  p.stdout.destroy();
  let stderr = "";
  p.stderr.on("data", (d) => { stderr += d.toString(); });
  const code = spawnSync(process.execPath, ["-e", `
    const { execSync } = require("child_process");
    const fs = require("fs");
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) { if (fs.existsSync(${JSON.stringify(resultPath.replace(/\\\\/g, "/"))})) break; }
  `], { timeout: 50000 });
  let result = null;
  try { result = JSON.parse(fs.readFileSync(resultPath, "utf8")); } catch (_) {}
  try { p.kill("SIGKILL"); } catch (_) {}
  console.log(`     with the read end destroyed: ${result ? `${result.ok} requests served, ${result.err} failed` : "(the child never finished)"}`);
  if (stderr.trim()) console.log(`     child stderr: ${stderr.trim().split("\n").slice(0, 3).join(" | ").slice(0, 260)}`);
  rec("the server survives a broken stdout", !!result, stderr.slice(-400) || "no result written");
  rec("…and keeps serving every request", result && result.ok === 25 && result.err === 0, result);
  rec("…without an uncaught EPIPE reaching the top", !/Uncaught|EPIPE: broken pipe/.test(stderr), stderr.slice(-400));
}

console.log("\n[4. the source] the guard is at the stream, and the hot logger is wrapped too");
{
  // ⚠️ STRIP COMMENTS BEFORE SEARCHING FOR CODE. Every fix in this file explains itself in prose directly
  // above the code, and prose contains the very strings a source check looks for — `res.on("finish"` appears
  // in the guard's own comment at the top of server.js, 290 bytes in, so an indexOf found the SENTENCE and
  // brace-walked through a comment. Third time this shape has bitten in one session.
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const sv = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  rec("stdout and stderr both carry an error handler", /process\.stdout[\s\S]{0,120}process\.stderr|\[process\.stdout, process\.stderr\]/.test(sv), "no stream-level guard");
  rec("…that recognises EPIPE", /EPIPE/.test(sv), "EPIPE not mentioned");
  // Defence in depth on the one path that runs for every single request.
  // Brace-match rather than guess a length: the handler grew when the guard and its comment went in, and a
  // {0,600} window silently stopped matching — reporting the logger as missing rather than as unguarded.
  const at = sv.indexOf('res.on("finish"');
  rec("the per-request logger is findable", at !== -1, "finish handler not found");
  if (at !== -1) {
    const open = sv.indexOf("{", sv.indexOf("=>", at));
    let d = 0, close = -1;
    for (let i = open; i < sv.length; i++) {
      if (sv[i] === "{") d++;
      else if (sv[i] === "}") { d--; if (!d) { close = i; break; } }
    }
    const body = close === -1 ? "" : sv.slice(open, close + 1);
    rec("…and its console.log cannot throw out of the callback",
      /try \{[\s\S]*?console\.log[\s\S]*?\} catch/.test(body), body.slice(0, 400));
  }
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== stdout EPIPE cannot kill: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
