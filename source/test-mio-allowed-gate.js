// #mio-allowed-gate-flattened — a company's `allowed` gate must survive a save that did not touch it.
//
// The editor models `allowed` as ONE country tag, read by taking the first `original_tag` found anywhere in
// the block. Real companies are gated on more than that: an OR of several tags, a has_dlc check, a NOT. So
// saving an unrelated field (an icon, a trait) rewrote the whole gate as that single tag and threw the rest
// away — a Soviet design bureau came back Philippines-only because a nested tag was matched first.
//
// The gate is now recovered server-side from the file being rewritten and written back verbatim when the user
// did not change the tag. Server-side on purpose: the browser never has the block.
//
// Both directions, because never honouring the tag box would be just as wrong:
//   complex gate, tag untouched -> every condition survives
//   complex gate, tag CHANGED   -> the user's deliberate edit wins, gate becomes the single tag
//   simple gate                 -> behaves exactly as before
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioallow-"));
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

const MOD = path.join(ROOT, "miomod");
const ORG_DIR = path.join(MOD, "common", "military_industrial_organization", "organizations");
fs.mkdirSync(ORG_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MioMod"\nsupported_version="1.18.*"\n', "utf8");

const ORG_FILE = "nova_mio.txt";
const ORG_PATH = path.join(ORG_DIR, ORG_FILE);

// A gate shaped like real content: several tags OR'd together, plus a DLC condition. The FIRST original_tag
// the old reader matched is PHI, nested inside the OR — which is how a Soviet bureau became Philippines-only.
const COMPLEX = [
  "nova_complex_org = {",
  "\ticon = GFX_idea_generic_tank_manufacturer_1",
  "\tallowed = {",
  "\t\tOR = {",
  "\t\t\toriginal_tag = PHI",
  "\t\t\toriginal_tag = SOV",
  "\t\t\toriginal_tag = RUS",
  "\t\t}",
  "\t\tNOT = { has_dlc = \"No Step Back\" }",
  "\t}",
  "\tequipment_type = { armor }",
  "}",
  "",
  "nova_simple_org = {",
  "\ticon = GFX_idea_generic_tank_manufacturer_1",
  "\tallowed = { original_tag = GER }",
  "\tequipment_type = { armor }",
  "}",
  "",
].join("\n");

const PORT = 42153;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const detail = async (id) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mio/detail?modPath=${q}&id=${id}`);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const save = async (payload) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mio`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, fileName: ORG_FILE, ...payload }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ORG_PATH, "utf8");

  try {
    // ── UNCHANGED TAG: the whole gate must survive ───────────────────────────────────────────────
    console.log("\n[unchanged] a complex gate survives a save that did not touch it");
    fs.writeFileSync(ORG_PATH, COMPLEX, "utf8");
    const d = await detail("nova_complex_org");
    rec("the company detail loads", d.status === 200 && d.body && d.body.ok !== false, d.body || d.status);
    const readTag = d.body && d.body.allowedTag;
    rec("the editor shows a tag from the gate", !!readTag, readTag);

    // Save back exactly what the editor would send: the tag it displayed, unchanged.
    const s = await save({
      id: "nova_complex_org", icon: "GFX_idea_generic_tank_manufacturer_2",
      allowedTag: readTag, equipmentType: ["armor"],
    });
    rec("the save succeeded", s.status === 200 && s.body && s.body.ok !== false, s.body || s.status);

    const after = read();
    rec("all three tags survived", /original_tag\s*=\s*PHI/.test(after) && /original_tag\s*=\s*SOV/.test(after)
      && /original_tag\s*=\s*RUS/.test(after), after.slice(0, 400));
    rec("the OR wrapper survived", /OR\s*=\s*\{/.test(after), after.slice(0, 400));
    rec("the has_dlc condition survived", /has_dlc/.test(after), after.slice(0, 400));
    rec("the gate was NOT flattened to one tag",
      !/allowed\s*=\s*\{\s*original_tag\s*=\s*[A-Z]{3}\s*\}/.test(after.split("nova_simple_org")[0]),
      after.split("nova_simple_org")[0]);
    rec("the edit the user DID make landed",
      /icon\s*=\s*GFX_idea_generic_tank_manufacturer_2/.test(after), after.slice(0, 300));
    rec("the file is still brace-balanced",
      (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length,
      { open: (after.match(/\{/g) || []).length, close: (after.match(/\}/g) || []).length });

    // ── CHANGED TAG: the user's deliberate edit must win ─────────────────────────────────────────
    console.log("\n[changed] editing the tag box replaces the gate, as asked");
    fs.writeFileSync(ORG_PATH, COMPLEX, "utf8");
    const s2 = await save({
      id: "nova_complex_org", icon: "GFX_idea_generic_tank_manufacturer_1",
      allowedTag: "FRA", equipmentType: ["armor"],
    });
    rec("the save succeeded", s2.status === 200 && s2.body && s2.body.ok !== false, s2.body || s2.status);
    const after2 = read();
    rec("the gate is now the tag the user typed", /original_tag\s*=\s*FRA/.test(after2), after2.slice(0, 400));
    rec("…and the old conditions are gone", !/has_dlc/.test(after2.split("nova_simple_org")[0]),
      after2.split("nova_simple_org")[0]);

    // ── CONTROL: a simple gate behaves exactly as before ─────────────────────────────────────────
    console.log("\n[control] a company whose gate is a single tag");
    fs.writeFileSync(ORG_PATH, COMPLEX, "utf8");
    const s3 = await save({
      id: "nova_simple_org", icon: "GFX_idea_generic_tank_manufacturer_3",
      allowedTag: "GER", equipmentType: ["armor"],
    });
    rec("the save succeeded", s3.status === 200 && s3.body && s3.body.ok !== false, s3.body || s3.status);
    const after3 = read();
    const simpleBlock = after3.slice(after3.indexOf("nova_simple_org"));
    rec("its single-tag gate round-trips unchanged", /allowed\s*=\s*\{\s*original_tag\s*=\s*GER\s*\}/.test(simpleBlock),
      simpleBlock.slice(0, 250));

    console.log(`\n=== MIO allowed gate: ${checks} checks, ${fails.length} failed ===`);
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
