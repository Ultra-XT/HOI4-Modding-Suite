// #loc-upsert-blanks-desc — sending only a name must not wipe the description.
//
// /api/localization/upsert emitted the `<key>_desc` line unconditionally, using "" when the payload carried
// no desc. That is exactly what its own caller sends: the continuous-focus panel posts
// `entries: { [focusId]: { name } }` on every save where the Name box is filled — so renaming a focus, or
// merely re-saving it after changing its icon, daily cost or a trigger, silently wiped that focus's in-game
// description. Both the in-file branch and the redirect branch (where the key already lives in a different
// loc file) had it.
//
// The rule is the distinction the old code missed: an ABSENT desc means "leave it alone", an EMPTY-STRING desc
// still means "clear it". Both are asserted, because collapsing them the other way would make it impossible to
// clear a description at all.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locdesc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "locmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocMod"\nsupported_version="1.18.*"\n', "utf8");

const REL = "localisation/english/nova_loc.yml";
const ABS = path.join(MOD, "localisation", "english", "nova_loc.yml");

const PORT = 42189;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const upsert = (entries, p = REL) => post("/api/localization/upsert", { modPath: MOD, path: p, entries });
  const valueOf = (key, file = ABS) => {
    if (!fs.existsSync(file)) return null;
    const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"([^]*?)"[ \\t]*$`, "m").exec(fs.readFileSync(file, "utf8"));
    return m ? m[1] : null;
  };

  try {
    await post("/api/localization/create", { modPath: MOD, path: REL });

    console.log("\n[setup] a key with both a name and a description");
    const made = await upsert({ nua_focus: { name: "Original Name", desc: "Original description." } });
    rec("the entry was written", made.status === 200 && made.body && made.body.ok !== false, made.body || made.status);
    rec("…name is set", valueOf("nua_focus") === "Original Name", valueOf("nua_focus"));
    rec("…description is set", valueOf("nua_focus_desc") === "Original description.", valueOf("nua_focus_desc"));

    console.log("\n[name only] the description must survive — this is what the panel sends");
    const renamed = await upsert({ nua_focus: { name: "Renamed Focus" } });
    rec("the rename succeeded", renamed.status === 200 && renamed.body && renamed.body.ok !== false,
      renamed.body || renamed.status);
    rec("the new name landed", valueOf("nua_focus") === "Renamed Focus", valueOf("nua_focus"));
    rec("…and the description is UNCHANGED", valueOf("nua_focus_desc") === "Original description.",
      valueOf("nua_focus_desc"));

    console.log("\n[repeatedly] a description must not erode over several name-only saves");
    for (let i = 0; i < 3; i++) await upsert({ nua_focus: { name: `Pass ${i}` } });
    rec("still intact after three more saves", valueOf("nua_focus_desc") === "Original description.",
      valueOf("nua_focus_desc"));

    console.log("\n[empty string] clearing must still be possible");
    const cleared = await upsert({ nua_focus: { name: "Renamed Focus", desc: "" } });
    rec("the save succeeded", cleared.status === 200 && cleared.body && cleared.body.ok !== false,
      cleared.body || cleared.status);
    rec("…and an explicit empty desc DOES clear it", valueOf("nua_focus_desc") === "", valueOf("nua_focus_desc"));

    console.log("\n[escaping] a preserved description is not re-escaped");
    await upsert({ nua_esc: { name: "Esc", desc: 'A "quoted" thing' } });
    const first = valueOf("nua_esc_desc");
    await upsert({ nua_esc: { name: "Esc Renamed" } });
    rec("the escaped description survives byte-for-byte", valueOf("nua_esc_desc") === first,
      { before: first, after: valueOf("nua_esc_desc") });

    console.log("\n[new key] a brand-new entry still gets its desc key");
    await upsert({ nua_fresh: { name: "Fresh" } });
    rec("a new key is created with an empty description", valueOf("nua_fresh_desc") === "",
      valueOf("nua_fresh_desc"));

    console.log(`\n=== loc upsert preserves desc: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
