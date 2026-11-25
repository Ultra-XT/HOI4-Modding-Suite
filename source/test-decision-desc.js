// Decision writer: the loc file must define BOTH <id> and <id>_desc, or HOI4 shows raw "[id]_desc"
// missing-text in the decision's tooltip. (No description field in the UI yet → empty desc is fine.)
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3494, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decdesc-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Dec Desc Test"\n', "utf8");
  try {
    const r = await post("/api/decisions/save", { modPath: mod, categoryId: "gre_cat", id: "gre_decision_one", name: "Do The Thing", icon: "GFX_decision_generic", cost: 0, available: "", effect: "", decisionType: "decision" });
    ok(r.json && (r.json.ok || r.json.success), "decision saved", r.json);
    const loc = fs.readFileSync(path.join(mod, "localisation", "english", "custom_decisions_l_english.yml"), "utf8");
    ok(/^\s*gre_decision_one:\d*\s*"Do The Thing"/m.test(loc), "title loc key written", loc);
    ok(/^\s*gre_decision_one_desc:\d*\s*"/m.test(loc), "desc loc key written (suppresses missing-text)", loc.split("\n").filter((l) => /gre_decision_one/.test(l)));
    // re-save must not duplicate keys
    await post("/api/decisions/save", { modPath: mod, categoryId: "gre_cat", id: "gre_decision_one", name: "Do The Thing 2", icon: "GFX_decision_generic", cost: 0, available: "", effect: "", decisionType: "decision" });
    const loc2 = fs.readFileSync(path.join(mod, "localisation", "english", "custom_decisions_l_english.yml"), "utf8");
    ok((loc2.match(/^\s*gre_decision_one:/mg) || []).length === 1, "re-save does not duplicate the title key", (loc2.match(/^\s*gre_decision_one:/mg) || []).length);
    ok((loc2.match(/^\s*gre_decision_one_desc:/mg) || []).length === 1, "re-save does not duplicate the desc key", (loc2.match(/^\s*gre_decision_one_desc:/mg) || []).length);
    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
