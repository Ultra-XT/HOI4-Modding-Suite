// #capital-must-exist — every other field Save Details writes is range-checked, and `capital` had no check
// at all. It is also the one that is not merely a bad-NUMBER risk: setOrReplaceKey interpolates the value
// VERBATIM, so a string carrying a brace or a newline writes script the game cannot load — the same class the
// set_politics sanitiser twenty lines further down already guards against.
//
// The sibling /api/countries/create has gated on exactly this since #capital-must-exist was written there,
// using findStateFile across the mod, its dependencies and the base game. Save Details never adopted it.
//
// Not reachable from the shipped UI — Country Setup deliberately omits `capital` because the Map owns it —
// so this is API/add-on hardening, recorded as such rather than dressed up as a click-path bug.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capval-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "capmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
// The mod ships its OWN state, so the test does not depend on a HOI4 install to prove the accept path.
fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
fs.writeFileSync(path.join(MOD, "history", "states", "4242-Novaland.txt"),
  "state = {\n\tid = 4242\n\tname = \"STATE_4242\"\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CapMod"\nsupported_version="1.18.*"\n', "utf8");

const TAG = "NVC";
const HIST = path.join(MOD, "history", "countries", `${TAG} - Capland.txt`);
const SEED = "capital = 4242\nset_stability = 0.5\n";

const PORT = 42443;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (details) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/save-country-details`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: TAG, details }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(HIST, "utf8");

  try {
    console.log("\n[control] a REAL state id is accepted and written");
    // First, so the guard cannot be "refuse every capital".
    fs.writeFileSync(HIST, SEED, "utf8");
    let r = await save({ capital: 4242 });
    rec("a real state id was accepted", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and the capital is in the file", /capital\s*=\s*4242/.test(read()), read());

    console.log("\n[non-numeric] a string capital must be refused, not interpolated");
    for (const bad of ["not_a_number", "12 }\nset_stability = 9", "1.5", "-3", "0", "0x10"]) {
      fs.writeFileSync(HIST, SEED, "utf8");
      r = await save({ capital: bad });
      const refused = r.status === 400;
      rec(`refused: ${JSON.stringify(String(bad).slice(0, 24))}`, refused, r.body || r.status);
      rec("…and the file is untouched", read() === SEED, read());
    }

    console.log("\n[brace injection] the shape that would produce unloadable script");
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await save({ capital: "1 } capital = 2 {" });
    rec("the injection was refused", r.status === 400, r.body || r.status);
    rec("no stray brace reached the file", read() === SEED, read());

    console.log("\n[nonexistent state] a number that is not a real state is refused");
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await save({ capital: 987654321 });
    rec("a nonexistent state id was refused", r.status === 400, r.body || r.status);
    rec("…with a message naming the id", !!(r.body && /987654321/.test(String(r.body.error || ""))), r.body && r.body.error);
    rec("the file is untouched", read() === SEED, read());

    console.log("\n[control] other fields still save normally alongside");
    // Guards against the new guard rejecting a save that carries no capital at all.
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await save({ stability: 0.9 });
    rec("a save with NO capital is unaffected", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and it applied", /set_stability\s*=\s*0\.9/.test(read()), read());

    console.log("\n[control] an empty capital means 'leave it alone'");
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await save({ capital: "", stability: 0.7 });
    rec("an empty capital does not refuse the save", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…the existing capital is untouched", /capital\s*=\s*4242/.test(read()), read());

    console.log(`\n=== country capital validation: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
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
