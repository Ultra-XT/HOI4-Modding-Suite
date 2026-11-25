// #partial-batch-reported-as-nothing — a batch that fails part way must not claim nothing was written.
//
// /api/technologies/save-batch writes one technology at a time. A failure on the fifth left the first four
// already on disk, but the error that surfaced came from safeModWrite: "Nothing was changed." That sentence is
// true of the single file whose temp-then-rename failed and false of the save as a whole, so it sent the
// modder looking for a change that had in fact been made to every technology before the failing one.
//
// The request still fails — that part was right. What changes is that the message states what actually
// landed, and names the technology where the boundary is.
//
// Both directions: a batch where everything succeeds must stay silent and write everything.
//
// Hermetic: fake mod under tmpdir. Permissions are restored in a finally block so nothing is left locked.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-batchreport-"));
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

const MOD = path.join(ROOT, "batchmod");
const TECH_DIR = path.join(MOD, "common", "technologies");
fs.mkdirSync(TECH_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BatchMod"\nsupported_version="1.18.*"\n', "utf8");

// Two technologies, each in its own file, so one file can be locked without affecting the other.
const A_FILE = path.join(TECH_DIR, "nova_a.txt");
const B_FILE = path.join(TECH_DIR, "nova_b.txt");
fs.writeFileSync(A_FILE, "technologies = {\n\tnova_tech_a = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t}\n}\n", "utf8");
fs.writeFileSync(B_FILE, "technologies = {\n\tnova_tech_b = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t}\n}\n", "utf8");

const locked = [];
function lock(p) { fs.chmodSync(p, 0o444); locked.push(p); }
function unlockAll() {
  for (const p of locked) { try { fs.chmodSync(p, 0o666); } catch (_) {} }
  locked.length = 0;
}

const PORT = 42157;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const catalog = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${q}&modPath=${q}`);
    const b = await r.json().catch(() => null);
    return (b && b.technologies) || [];
  };
  const saveBatch = async (technologies) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    const techs = await catalog();
    const a = techs.find((t) => t.id === "nova_tech_a");
    const b = techs.find((t) => t.id === "nova_tech_b");
    rec("both technologies are in the catalog", !!a && !!b, techs.map((t) => t.id).slice(0, 6));
    if (!a || !b) throw new Error("fixture: catalog did not return the seeded technologies");

    // ── CONTROL FIRST: an all-writable batch must succeed silently ───────────────────────────────
    console.log("\n[control] a batch where every write succeeds");
    const okRes = await saveBatch([
      Object.assign({}, a, { researchCost: 2 }),
      Object.assign({}, b, { researchCost: 2 }),
    ]);
    rec("the batch succeeded", okRes.status === 200 && okRes.body && okRes.body.ok !== false,
      okRes.body || okRes.status);
    rec("…with no error text", !(okRes.body && okRes.body.error), okRes.body);

    // ── FAILURE PART WAY: the message must not claim nothing was written ─────────────────────────
    console.log("\n[partial] the second technology's file is locked");
    lock(B_FILE);
    const res = await saveBatch([
      Object.assign({}, a, { researchCost: 5 }),
      Object.assign({}, b, { researchCost: 5 }),
    ]);
    const err = String((res.body && res.body.error) || "");
    rec("the batch reported a failure", !!err || res.status >= 400, res.body || res.status);
    rec("the failing technology is named", /nova_tech_b/.test(err), err || res.body);
    rec("it does NOT claim nothing was changed",
      !/Nothing was changed\./i.test(err) || /already saved/i.test(err), err);
    rec("it says what actually landed", /already saved|nothing was written/i.test(err), err);

    // And the claim it makes must be TRUE: nova_tech_a really is on disk with the new value.
    const aText = fs.readFileSync(A_FILE, "utf8");
    const claimsSaved = /already saved/i.test(err);
    if (claimsSaved) {
      rec("…and that claim is true — the earlier tech really was written",
        /research_cost\s*=\s*5/.test(aText), aText);
    } else {
      rec("…and that claim is true — nothing was written for the earlier tech",
        !/research_cost\s*=\s*5/.test(aText), aText);
    }
    unlockAll();

    console.log(`\n=== partial batch report: ${checks} checks, ${fails.length} failed ===`);
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
