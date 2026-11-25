// Regression: start-setup must grant a spirit via a top-level `add_ideas = {}` block BEFORE the
// date block. A bare `ideas = {}` errors "Unknown effect-type: ideas"; and a base mod (Millennium
// Dawn) puts its own setup inside a `2000.1.1 = {}` start-date block, so the block must land before
// it. Verifies /api/history/set-startup (spirit) writes the correct effect in the correct place.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");
const PORT = 3581;

function post(p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ raw: b.slice(0, 120) }); } });
    });
    r.on("error", reject); r.write(data); r.end();
  });
}

(async () => {
  const s = createApp().listen(PORT, "127.0.0.1");
  await new Promise((r) => s.on("listening", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-hist-"));
  let pass = 0, fail = 0;
  const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
  try {
    fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Hist Test"\n', "utf8");
    // A date-block-only country history (like MD's GRE).
    const hc = path.join(tmp, "history", "countries");
    fs.mkdirSync(hc, { recursive: true });
    const file = path.join(hc, "GRE - Greece.txt");
    fs.writeFileSync(file, "capital = 141\n2000.1.1 = {\n\tset_country_flag = test\n\toob = \"GRE_2000\"\n}\n", "utf8");

    const res = await post("/api/history/set-startup", { tag: "GRE", active: true, modPath: tmp, itemType: "spirit", itemId: "my_spirit" });
    check("set-startup ok", res && res.ok === true, JSON.stringify(res).slice(0, 120));

    const out = fs.readFileSync(file, "utf8");
    const ideasIdx = out.indexOf("add_ideas = {");
    const dateIdx = out.search(/\d{4}\.\d{1,2}\.\d{1,2}\s*=\s*\{/);
    check("add_ideas block was added (valid effect, not bare 'ideas')", ideasIdx !== -1, "");
    check("uses add_ideas, never a bare 'ideas = {' effect", !/(^|\n)\s*ideas\s*=\s*\{/.test(out), "");
    check("add_ideas block is BEFORE the date block (not parsed as an effect)", ideasIdx !== -1 && dateIdx !== -1 && ideasIdx < dateIdx, `ideas@${ideasIdx} date@${dateIdx}`);
    check("add_ideas block contains the spirit", /add_ideas\s*=\s*\{[^}]*my_spirit/.test(out), "");
    // braces still balanced
    let d = 0, ok = true; for (const c of out) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) ok = false; } }
    check("history file still brace-balanced", ok && d === 0, "");
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    s.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nHISTORY-IDEAS TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
