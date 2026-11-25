// #country-details-phantom-tag — /api/history/save-country-details passed any 3-character tag straight to
// ensureCountryHistoryFileInMod, which validates only the SHAPE of the tag and then mints
// "<TAG> - Custom.txt". Nothing declares that tag, so HOI4 ignores the file forever while the mod quietly
// accumulates dead history files.
//
// The same country list /api/countries/create already gates on, and the same list Country Setup's picker is
// built from, so every tag the shipped UI can offer still passes. Not reachable by clicking — this is API and
// add-on hardening, recorded as such.
//
// Measured before shipping: 0 of vanilla's 355 and 0 of Millennium Dawn's 386 country history files carry a
// tag that is not declared in country_tags, so the guard rejects nothing real.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-phantom-"));
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

const MOD = path.join(ROOT, "phantommod");
const HIST_DIR = path.join(MOD, "history", "countries");
fs.mkdirSync(HIST_DIR, { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "country_tags"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="PhantomMod"\nsupported_version="1.18.*"\n', "utf8");

// The mod declares ONE country of its own, so the accept path does not depend on a game install.
fs.writeFileSync(path.join(MOD, "common", "country_tags", "nova_tags.txt"),
  'NVL = "countries/Novaland.txt"\n', "utf8");

const PORT = 42455;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (tag, details) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/history/save-country-details`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag, details }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const histFiles = () => { try { return fs.readdirSync(HIST_DIR); } catch (_) { return []; } };

  try {
    console.log("\n[control] the mod's OWN declared country saves fine");
    // First, so the guard cannot be "refuse everything".
    let r = await save("NVL", { stability: 0.6 });
    rec("a declared tag was accepted", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and its history file exists", histFiles().some((f) => /^NVL/i.test(f)), histFiles());
    rec("…with NO note, since nothing is wrong with it",
      !(r.body && r.body.notes && r.body.notes.length), r.body && r.body.notes);

    console.log("\n[phantom] a tag that is not a country anywhere must be REPORTED, not refused");
    // Warn rather than block. A history file for an undeclared tag is inert clutter, not damage — HOI4
    // ignores it — and "write the history, declare the tag afterwards" is a plausible order of work. The
    // maker fuzz fixture does exactly that 100 times over, which is what showed the first version of this
    // guard was too strict. Same call as the stockpile design-name warning.
    r = await save("ZQX", { stability: 0.6 });
    rec("the save still succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…but it carries a note", !!(r.body && Array.isArray(r.body.notes) && r.body.notes.length), r.body);
    rec("…which names the tag", !!(r.body && (r.body.notes || []).some((n) => /ZQX/.test(n))), r.body && r.body.notes);
    rec("…and says the file is inert until the tag is declared",
      !!(r.body && (r.body.notes || []).some((n) => /ignore this history file|until the tag is declared/i.test(n))),
      r.body && r.body.notes);

    console.log("\n[legacy fallback] a tag with an EXISTING history file stays reachable");
    // An odd hand-authored file must not become uneditable just because its tag is declared oddly.
    fs.writeFileSync(path.join(HIST_DIR, "LGY - Legacyland.txt"), "capital = 1\nset_stability = 0.3\n", "utf8");
    r = await save("LGY", { stability: 0.8 });
    rec("the legacy tag was accepted", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and the edit landed",
      /set_stability\s*=\s*0\.8/.test(fs.readFileSync(path.join(HIST_DIR, "LGY - Legacyland.txt"), "utf8")),
      fs.readFileSync(path.join(HIST_DIR, "LGY - Legacyland.txt"), "utf8"));

    console.log("\n[control] a real BASE-GAME tag is accepted");
    // Guards against a guard that only knows the mod's own tags.
    r = await save("GER", { stability: 0.55 });
    rec("a vanilla tag was accepted", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);

    console.log(`\n=== country details phantom tag: ${checks} checks, ${fails.length} failed ===`);
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
