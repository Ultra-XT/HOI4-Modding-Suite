// /api/equipment/variant/update must write a name/icon containing `$` LITERALLY. It rewrites the name= line
// via String.replace; a replacement STRING interprets `$1` / `$&` / `$'` as backreferences, so a `$` the user
// typed spliced matched/file text into the block and corrupted the country history. The fix uses a replacement
// FUNCTION (its return is literal). Run: node test-variant-dollar-name.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dollar-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="dollar test"\n');
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), [
  "capital = 1", "",
  "create_equipment_variant = {", '\tname = "Original"', "\ttype = infantry_weapons1", "}", "",
  "1936.1.1 = {", "}", "",
].join("\n"));
const histPath = path.join(mod, "history", "countries", "TST - Test.txt");

(async () => {
  const PORT = 3984, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    const all = await fetch(`${BASE}/api/equipment/variants/all?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const v = (all.variants || []).find((x) => x.name === "Original");
    ok("fixture variant found", !!v, all.variants);
    const DOLLAR = "T-34 $& $1 $` $' $$ end"; // every replacement-special sequence
    const upd = await post("/api/equipment/variant/update", { modPath: mod, file: v.file, blockIdx: v.blockIdx, expect: { name: v.name, type: v.type }, set: { name: DOLLAR } });
    ok("update ok", upd && upd.ok === true, upd && upd.error);
    const txt = fs.readFileSync(histPath, "utf8");
    ok("the `$`-laden name is written LITERALLY (no backreference expansion)", txt.includes(`name = "${DOLLAR}"`), txt.slice(txt.indexOf("create_equipment_variant"), txt.indexOf("create_equipment_variant") + 120));
    ok("file stays brace-balanced", balanced(txt), txt);
    ok("no stray extra name= line was spliced in (exactly one)", (txt.match(/name\s*=/g) || []).length === 1, txt);
    ok("dated tail intact", /1936\.1\.1\s*=\s*\{/.test(txt), txt);
    // Icon path with a `$` too.
    const upd2 = await post("/api/equipment/variant/update", { modPath: mod, file: v.file, blockIdx: v.blockIdx, expect: { name: DOLLAR, type: v.type }, set: { icon: "gfx/$&/pic.dds" } });
    ok("icon update ok", upd2 && upd2.ok === true, upd2 && upd2.error);
    ok("the `$` icon path is literal", fs.readFileSync(histPath, "utf8").includes('icon = "gfx/$&/pic.dds"'), fs.readFileSync(histPath, "utf8"));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nVARIANT-DOLLAR-NAME: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
