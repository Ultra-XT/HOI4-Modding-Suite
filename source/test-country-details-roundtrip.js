// #country-details-negative-unreadable — a saved country detail must read back as what was saved.
//
// Two bugs met in one round-trip. The reader's capture had no optional sign, so a negative value on disk came
// back as null — and country-setup.js reloads immediately after saving, so the user watched the value they had
// just saved snap back to the greyed-out default while the bad number stayed in the file. Meanwhile the writer
// accepted values HOI4 has no meaning for: these are `set_*` effects, i.e. absolute, and stability/war support
// are fractions 0-1 while convoys and research slots cannot be negative.
//
// The editor really can send them: country-setup.js does parseFloat(value)/100 with no range check,
// #csStability's min="0" is never enforced because the code reads .value directly instead of calling
// checkValidity(), and #csConvoys has no min attribute at all.
//
// Both halves are tested. The reader must handle a negative even though the writer now refuses one — a file
// can contain anything, including something hand-edited or written by an older build, and a reader that
// cannot read it reports null and invites the editor to overwrite it.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cdetails-"));
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

const MOD = path.join(ROOT, "cdmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CdMod"\nsupported_version="1.18.*"\n', "utf8");
const HIST = path.join(MOD, "history", "countries", "NVJ - Probe.txt");
fs.writeFileSync(HIST, "capital = 709\n", "utf8");

const PORT = 42197;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (details) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/save-country-details`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: "NVJ", details }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/country-details?modPath=${encodeURIComponent(MOD)}&tag=NVJ`);
    const b = await r.json().catch(() => null);
    // The endpoint answers { details, defaults } — the values live under details.
    return b && b.details ? b.details : b;
  };

  try {
    console.log("\n[round trip] legitimate values come back as saved");
    const ok1 = await save({ researchSlots: 3, stability: 0.75, warSupport: 0.5, convoys: 50 });
    rec("the save succeeded", ok1.status === 200 && ok1.body && ok1.body.ok !== false, ok1.body || ok1.status);
    const back = await read();
    rec("researchSlots round-trips", back && back.researchSlots === 3, back);
    rec("stability round-trips", back && back.stability === 0.75, back);
    rec("warSupport round-trips", back && back.warSupport === 0.5, back);
    rec("convoys round-trips", back && back.convoys === 50, back);

    console.log("\n[out of range] the writer refuses what the game cannot use");
    const badStab = await save({ stability: -0.05 });
    rec("a negative stability is refused", !(badStab.body && badStab.body.ok === true), badStab.body || badStab.status);
    rec("…and says what shape it wants", /between 0 and 1/i.test(String((badStab.body && badStab.body.error) || "")),
      badStab.body);
    const badConv = await save({ convoys: -50 });
    rec("negative convoys are refused", !(badConv.body && badConv.body.ok === true), badConv.body || badConv.status);
    const overStab = await save({ stability: 5 });
    rec("a stability above 1 is refused", !(overStab.body && overStab.body.ok === true), overStab.body || overStab.status);

    rec("…and none of them changed the file",
      /set_stability = 0.75/.test(fs.readFileSync(HIST, "utf8")) && /set_convoys = 50/.test(fs.readFileSync(HIST, "utf8")),
      fs.readFileSync(HIST, "utf8"));

    console.log("\n[reader] a negative already on disk must still be READ, not reported as null");
    // Hand-write what an older build (or a text editor) could have left behind.
    fs.writeFileSync(HIST, "capital = 709\nset_stability = -0.05\nset_convoys = -50\n", "utf8");
    const neg = await read();
    rec("a negative stability is read back, not null", neg && neg.stability === -0.05, neg);
    rec("negative convoys are read back, not null", neg && neg.convoys === -50, neg);

    console.log("\n[boundaries] the edges of the allowed range are allowed");
    fs.writeFileSync(HIST, "capital = 709\n", "utf8");
    const edge = await save({ stability: 0, warSupport: 1, convoys: 0, researchSlots: 0 });
    rec("0 and 1 are accepted", edge.status === 200 && edge.body && edge.body.ok !== false, edge.body || edge.status);

    console.log(`\n=== country details round trip: ${checks} checks, ${fails.length} failed ===`);
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
