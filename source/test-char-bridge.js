// End-to-end test of the character->country bridge: save a character, then recruit it for a
// country via set-startup (itemType:"character"), and assert recruit_character lands in that
// country's history file. Also tests status read + remove. Headless, no key needed.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

const PORT = 3489, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }
async function get(r) { const res = await fetch(BASE + r); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-charbridge-"));
  fs.mkdirSync(path.join(mod, "common", "characters"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Char Bridge Test"\n', "utf8");
  // a country history file so the bridge has somewhere to write
  fs.writeFileSync(path.join(mod, "history", "countries", "GER - Germany.txt"), "capital = 64\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const histPath = path.join(mod, "history", "countries", "GER - Germany.txt");
  try {
    // 1. save a character
    let r = await post("/api/characters/save", {
      modPath: mod, token: "GER_test_general", name: "Test General",
      file: "custom_characters.txt", roleGeneral: true, generalType: "corps_commander",
      genSkill: "4", generalTraits: "trait_engineer",
    });
    ok(r.json && r.json.ok && !r.json.error, "character saved", r.json);
    ok(fs.existsSync(path.join(mod, "common", "characters", "custom_characters.txt")), "character file written");

    // 2. status BEFORE recruiting -> not active
    r = await get(`/api/history/startup-status?tag=GER&itemId=GER_test_general&itemType=character&modPath=${encodeURIComponent(mod)}`);
    ok(r.json && r.json.active === false, "status before: not recruited", r.json);

    // 3. recruit for GER
    r = await post("/api/history/set-startup", { tag: "GER", itemId: "GER_test_general", itemType: "character", active: true, modPath: mod });
    ok(r.json && r.json.ok, "set-startup recruit returned ok", r.json);
    const after = fs.readFileSync(histPath, "utf8");
    ok(/recruit_character\s*=\s*GER_test_general\b/.test(after), "recruit_character written to GER history", after);

    // 4. status AFTER -> active
    r = await get(`/api/history/startup-status?tag=GER&itemId=GER_test_general&itemType=character&modPath=${encodeURIComponent(mod)}`);
    ok(r.json && r.json.active === true, "status after: recruited", r.json);

    // 5. remove
    r = await post("/api/history/set-startup", { tag: "GER", itemId: "GER_test_general", itemType: "character", active: false, modPath: mod });
    const removed = fs.readFileSync(histPath, "utf8");
    ok(!/recruit_character\s*=\s*GER_test_general\b/.test(removed), "recruit_character removed on toggle off", removed);

    // 6. idempotency: adding twice doesn't duplicate
    await post("/api/history/set-startup", { tag: "GER", itemId: "GER_test_general", itemType: "character", active: true, modPath: mod });
    await post("/api/history/set-startup", { tag: "GER", itemId: "GER_test_general", itemType: "character", active: true, modPath: mod });
    const twice = fs.readFileSync(histPath, "utf8");
    const count = (twice.match(/recruit_character\s*=\s*GER_test_general\b/g) || []).length;
    ok(count === 1, "recruiting twice writes only one line (no dupes)", { count });

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
  finally { process.exitCode = fail ? 1 : 0; try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} try { server.closeAllConnections(); } catch (_) {} server.close(); }
})();
