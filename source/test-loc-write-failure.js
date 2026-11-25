// #half-applied-write — an unwritable localisation file must not half-apply a save, and must not surface a
// raw Node error.
//
// A save writes the script file first and the localisation second. When the .yml was read-only the write threw
// out of a bare fs.writeFileSync, so the user saw Node's own message — "EPERM: operation not permitted,
// open 'C:\…'" — with an internal path and no indication of what to do. By then the script file was already
// written, leaving the entry defined with no name, which shows in game as its raw localisation key.
//
// Only one maker pre-flights its localisation files, so this had two fixes: the pre-flight now checks
// writability as well as encoding (a refusal before anything is written), and writeUtf8BomFile translates the
// error as a backstop for every maker that has no pre-flight.
//
// Both directions: an ordinary save with a writable .yml must still work and still write the name.
//
// Hermetic: fake mod under tmpdir. Permissions restored in a finally block.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locwrite-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}

const MOD = path.join(ROOT, "locmod");
const LOC_DIR = path.join(MOD, "localisation", "english");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.mkdirSync(LOC_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocMod"\nsupported_version="1.18.*"\n', "utf8");

// The mod already defines this decision's name here, so this is the file a save must rewrite.
const LOC_FILE = path.join(LOC_DIR, "nova_decisions_l_english.yml");
fs.writeFileSync(LOC_FILE, "\uFEFFl_english:\n nova_locked_decision:0 \"Original Name\"\n", "utf8");

const locked = [];
function lock(p) { fs.chmodSync(p, 0o444); locked.push(p); }
function unlockAll() {
  for (const p of locked) { try { fs.chmodSync(p, 0o666); } catch (_) {} }
  locked.length = 0;
}

const PORT = 42159;
const app = createApp();
const server = app.listen(PORT, async () => {
  const saveDecision = async (id, name) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, id, name, categoryId: "nova_cat", cost: 25, days: 30 }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const decisionOnDisk = (id) => {
    const dir = path.join(MOD, "common", "decisions");
    try {
      for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x))) {
        if (new RegExp(`\\b${id}\\s*=\\s*\\{`).test(fs.readFileSync(path.join(dir, f), "utf8"))) return true;
      }
    } catch (_) {}
    return false;
  };

  try {
    // ── CONTROL FIRST: a writable .yml must save normally ────────────────────────────────────────
    console.log("\n[control] an ordinary save with a writable localisation file");
    const ok = await saveDecision("nova_ok_decision", "Perfectly Fine");
    rec("the save succeeded", ok.status === 200 && ok.body && ok.body.success !== false, ok.body || ok.status);
    rec("the decision is on disk", decisionOnDisk("nova_ok_decision"), "absent");
    const locAll = fs.readdirSync(LOC_DIR).map((f) => fs.readFileSync(path.join(LOC_DIR, f), "utf8")).join("\n");
    rec("…and its name was written", /nova_ok_decision:\s*\d*\s*"Perfectly Fine"/.test(locAll), locAll.slice(0, 300));

    // ── LOCKED: the save must refuse, legibly, and not half-apply ────────────────────────────────
    console.log("\n[locked] the localisation file the save must rewrite is read-only");
    lock(LOC_FILE);
    const blocked = await saveDecision("nova_locked_decision", "Renamed While Locked");
    const err = String((blocked.body && blocked.body.error) || "");
    rec("the save did NOT report success", !(blocked.body && blocked.body.success === true), blocked.body || blocked.status);
    rec("the error is not a raw Node EPERM", !/^EPERM|operation not permitted/i.test(err), err);
    rec("…it names the localisation file", /nova_decisions_l_english\.yml/.test(err), err);
    rec("…and says what to do about it", /read-only|Hearts of Iron/i.test(err), err);

    // The point of the pre-flight: the script half must not have landed either.
    rec("the decision was NOT written without its name", !decisionOnDisk("nova_locked_decision"),
      "the script was written but the name could not be — the entry would show as its raw key in game");

    // The original name must be intact — a failed save must not have damaged what was there.
    rec("the existing localisation is undamaged",
      /nova_locked_decision:0 "Original Name"/.test(fs.readFileSync(LOC_FILE, "utf8")),
      fs.readFileSync(LOC_FILE, "utf8"));
    unlockAll();

    console.log(`\n=== localisation write failure: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    unlockAll();
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
