// Regression: /api/characters/list must show ONLY the active mod's own characters — not flood the
// sidebar with all of vanilla's characters when editing an add-on.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp, constants } = require("./server.js");
const PORT = 3611;
const g = (p) => new Promise((r) => http.get({ host: "127.0.0.1", port: PORT, path: p }, (x) => { let b = ""; x.on("data", (c) => (b += c)); x.on("end", () => { try { r(JSON.parse(b)); } catch (_) { r({}); } }); }));

(async () => {
  const s = createApp().listen(PORT, "127.0.0.1");
  await new Promise((r) => s.on("listening", r));
  let pass = 0, fail = 0;
  const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-charlist-"));
  try {
    fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Char List Test"\n', "utf8");
    const cdir = path.join(tmp, "common", "characters");
    fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, "mine.txt"), "characters = {\n\tmy_leader = { name = my_leader }\n\tmy_general = { name = my_general }\n}\n", "utf8");

    const addon = await g("/api/characters/list?modPath=" + encodeURIComponent(tmp));
    const tokens = (addon.files || []).flatMap((f) => f.characters.map((c) => c.token));
    check("add-on lists ONLY its own characters", tokens.length === 2 && tokens.includes("my_leader") && tokens.includes("my_general"), tokens.join(","));
    check("add-on does NOT include vanilla character files", (addon.files || []).every((f) => f.file === "mine.txt"), (addon.files || []).map((f) => f.file).join(","));

    // Vanilla-active should still list vanilla's own characters (modDir == vanilla's dir).
    const V = constants.resolveHoi4GameRoot();
    if (V && fs.existsSync(path.join(V, "common", "characters"))) {
      const van = await g("/api/characters/list?modPath=" + encodeURIComponent(V));
      check("vanilla-active still lists vanilla characters", (van.files || []).length > 10, "files=" + (van.files || []).length);
    } else {
      console.log("  (skip) vanilla characters dir not found");
    }
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    s.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCHAR-LIST-FILTER TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
