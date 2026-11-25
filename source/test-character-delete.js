// Integration: deleting a character must remove ONLY that token's block — siblings in the same
// common/characters file stay intact, braces stay balanced, the `characters = { }` wrapper is preserved.
// (writeCharacterToFile edits in place; the delete path slices the token block out by brace-matching.)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const count = (s, re) => (s.match(re) || []).length;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chardel-"));
fs.mkdirSync(path.join(mod, "common", "characters"), { recursive: true });
const file = "custom_characters.txt";
const cp = path.join(mod, "common", "characters", file);
const ch = (tok) => `\t${tok} = {\n\t\tname = ${tok}\n\t\tcountry_leader = {\n\t\t\tideology = conservatism\n\t\t\ttraits = { nationalist }\n\t\t}\n\t}\n`;
fs.writeFileSync(cp, `characters = {\n${ch("CHAR_a")}\n${ch("CHAR_b")}\n${ch("CHAR_c")}\n}\n`, "utf8");

const app = createApp();
const server = http.createServer(app);
function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let out = ""; res.on("data", (c) => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    const r = await post("/api/characters/delete", { modPath: mod, token: "CHAR_b", file });
    check("delete returned 200", r.status === 200, r.status + " " + r.body);
    const txt = fs.readFileSync(cp, "utf8");
    check("deleted character (CHAR_b) is gone", !/\bCHAR_b\s*=\s*\{/.test(txt), txt);
    check("sibling CHAR_a survived", /\bCHAR_a\s*=\s*\{/.test(txt));
    check("sibling CHAR_c survived", /\bCHAR_c\s*=\s*\{/.test(txt));
    check("characters wrapper preserved", /characters\s*=\s*\{/.test(txt));
    check("exactly two character blocks remain", count(txt, /\bCHAR_[ac]\s*=\s*\{/g) === 2);
    check("file stays brace-balanced", balanced(txt), txt);

    // Deleting the LAST remaining-pattern (CHAR_c, at the tail) must not eat the wrapper's closing brace.
    const r2 = await post("/api/characters/delete", { modPath: mod, token: "CHAR_c", file });
    check("second delete returned 200", r2.status === 200);
    const txt2 = fs.readFileSync(cp, "utf8");
    check("CHAR_c gone, CHAR_a still here", !/\bCHAR_c\s*=/.test(txt2) && /\bCHAR_a\s*=\s*\{/.test(txt2), txt2);
    check("still brace-balanced after tail delete", balanced(txt2), txt2);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nCHARACTER-DELETE TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
