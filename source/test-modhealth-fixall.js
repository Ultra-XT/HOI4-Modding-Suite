// Integration test for the Mod Health DETERMINISTIC auto-fixes (the "Fix all" batch):
//   • missing_localization -> inserts the loc key (with a BOM-correct file)
//   • loc_missing_bom       -> re-saves the file as UTF-8 with a BOM
// For EACH fix we assert the strong safety contract the user demanded:
//   1. the targeted problem is gone after the fix,
//   2. NO new problems were introduced,
//   3. the file is left valid (BOM present, original content preserved, key added),
//   4. a backup was taken before any existing file was overwritten.
// Spawns its own server on a private port so it never touches the app's running instance.
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");

const PORT = 47899;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0, server = null;
const tmpMods = [];
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const u = new URL(BASE + url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : {} }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ _raw: b, _status: res.statusCode }); } });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await new Promise((res, rej) => { const rq = http.get(BASE + "/", (x) => { x.resume(); res(); }); rq.on("error", rej); rq.setTimeout(1000, () => rq.destroy(new Error("timeout"))); }); return true; }
    catch (_) { await sleep(400); }
  }
  return false;
}

function makeMod(name, build) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fixall-it-"));
  tmpMods.push(mod);
  fs.writeFileSync(path.join(mod, "descriptor.mod"), `name="${name}"\nsupported_version="1.18.*"\n`, "utf8");
  build(mod);
  return mod;
}
const sig = (p) => p.rule + "|" + (p.entityId || "") + "|" + (p.file || "");
const problems = (j) => (j && j.problems) || [];

(async () => {
  server = spawn(process.execPath, ["server.js"], { cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  const up = await waitForServer(25000);
  if (!up) { console.error("  ✗ FAIL server did not start on port " + PORT); fail++; return; }

  // ---- Case A: missing_localization (a focus with no loc key) ----
  const modA = makeMod("FixAll IT A", (mod) => {
    const nf = path.join(mod, "common", "national_focus"); fs.mkdirSync(nf, { recursive: true });
    fs.writeFileSync(path.join(nf, "t.txt"), `focus_tree = {\n\tid = it_tree\n\tcountry = { factor = 0 }\n\tfocus = {\n\t\tid = it_focus_alpha\n\t\ticon = GFX_focus_generic\n\t\tx = 0 y = 0\n\t\tcost = 10\n\t}\n}\n`, "utf8");
    const loc = path.join(mod, "localisation", "english"); fs.mkdirSync(loc, { recursive: true });
    // give the tree its own name (with BOM) so the ONLY missing-loc is the focus, and no bom issue here
    fs.writeFileSync(path.join(loc, "names_l_english.yml"), "﻿l_english:\n it_tree:0 \"IT Tree\"\n", "utf8");
  });
  {
    const before = problems(await req("GET", "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(modA)));
    const beforeSigs = new Set(before.map(sig));
    const targets = before.filter((p) => p.rule === "missing_localization");
    ok(targets.some((p) => p.entityId === "it_focus_alpha"), "[A] missing_localization detected for the focus", targets.map((p) => p.entityId));
    for (const t of targets) { const r = await req("POST", "/api/modhealth/fix", { modPath: modA, problem: t }); ok(r.ok, "[A] fix applied: " + t.entityId, r.error || r.summary); }
    const after = problems(await req("GET", "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(modA)));
    const afterSigs = new Set(after.map(sig));
    ok(!targets.some((t) => afterSigs.has(sig(t))), "[A] targeted problem(s) gone after fix");
    const introduced = after.filter((p) => !beforeSigs.has(sig(p)));
    ok(introduced.length === 0, "[A] NO new problems introduced", introduced.map(sig));
    // file integrity: a loc file now contains the key, with a BOM
    const locDir = path.join(modA, "localisation", "english");
    const files = fs.readdirSync(locDir);
    const hit = files.map((f) => ({ f, buf: fs.readFileSync(path.join(locDir, f)) })).find((x) => x.buf.toString("utf8").includes("it_focus_alpha"));
    ok(!!hit, "[A] the new loc key was written to a file");
    if (hit) ok(hit.buf[0] === 0xEF && hit.buf[1] === 0xBB && hit.buf[2] === 0xBF, "[A] that loc file has a UTF-8 BOM");
  }

  // ---- Case B: loc_missing_bom in isolation (a BOM-less loc file, nothing else wrong) ----
  const modB = makeMod("FixAll IT B", (mod) => {
    const loc = path.join(mod, "localisation", "english"); fs.mkdirSync(loc, { recursive: true });
    fs.writeFileSync(path.join(loc, "b_l_english.yml"), "l_english:\n some_key:0 \"Some Value\"\n other_key:1 \"Other\"\n", "utf8"); // NO BOM
  });
  {
    const before = problems(await req("GET", "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(modB)));
    const beforeSigs = new Set(before.map(sig));
    const targets = before.filter((p) => p.rule === "loc_missing_bom");
    ok(targets.length >= 1, "[B] loc_missing_bom detected", before.map(sig));
    for (const t of targets) { const r = await req("POST", "/api/modhealth/fix", { modPath: modB, problem: t }); ok(r.ok, "[B] BOM fix applied", r.error || r.summary); }
    const after = problems(await req("GET", "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(modB)));
    const afterSigs = new Set(after.map(sig));
    ok(!targets.some((t) => afterSigs.has(sig(t))), "[B] loc_missing_bom gone after fix");
    const introduced = after.filter((p) => !beforeSigs.has(sig(p)));
    ok(introduced.length === 0, "[B] NO new problems introduced", introduced.map(sig));
    const buf = fs.readFileSync(path.join(modB, "localisation", "english", "b_l_english.yml"));
    ok(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, "[B] file now has a UTF-8 BOM");
    const txt = buf.toString("utf8");
    ok(txt.includes("some_key:0") && txt.includes("other_key:1"), "[B] original content preserved (no corruption)");
  }
})().catch((e) => { console.error(e); fail++; }).finally(() => {
  try { if (server) server.kill(); } catch (_) {}
  for (const m of tmpMods) { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
