// #preserve-comments-by-key — every preserve-merge in Nova works by KEY: keep the old top-level statements
// the regenerated block does not itself emit. A comment is not a statement, so all of them silently deleted
// the modder's annotations. This is the fourth site found in one sweep (after equipment, division templates
// and divisions), and the first fixed through the shared primitive rather than a local walk.
//
// splitTopLevelPdxStatements now carries `leadComment` — the whole-line comments directly above a statement.
// It is ADDITIVE: `text` is unchanged, so nothing that matches or re-emits statements behaves differently
// until a helper opts in. mergePreservedMioBlock opts in here.
//
// Two placements matter, as with the division templates: a comment above a field the serializer REBUILDS
// (injected above its new line) and one above a field merely carried through (emitted with it). Testing only
// the second would pass while half the real cases still broke.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miocmt-"));
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

const REL = path.join("common", "military_industrial_organization", "organizations");
const MOD = path.join(ROOT, "miomod");
fs.mkdirSync(path.join(MOD, REL), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MioMod"\nsupported_version="1.18.*"\n', "utf8");

const FILE = "nua_mio.txt";
const ABS = path.join(MOD, REL, FILE);
const SEED = [
  "NUA_company = {",
  "\ticon = GFX_idea_generic_morale_bonus",
  "\tallowed = { original_tag = NUA }",
  "\t# the state arsenal, nationalised in 1935",
  "\ttask_capacity = 12",
  "\t# only small arms for now",
  "\tequipment_type = { infantry_equipment }",
  "\tresearch_categories = { CAT_inf }",
  "\t# balance pass pending",
  "\tvisible = { always = yes }",
  "\tinitial_trait = {",
  "\t\tname = NUA_company_initial",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42343;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (u) => (await fetch(`http://127.0.0.1:${PORT}${u}`)).json();
  const post = async (r, b) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${r}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");
  const lineAbove = (txt, needle) => {
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex((l) => l.includes(needle));
    return i > 0 ? lines[i - 1].trim() : "";
  };

  try {
    console.log("\n[edit] annotations inside an organization survive");
    fs.writeFileSync(ABS, SEED, "utf8");

    // Read through /api/mio/detail, which is documented as shaped exactly like the POST input — the same
    // route the editor uses. Hand-building the payload is how a probe invents data loss that is not there.
    const d = await get(`/api/mio/detail?modPath=${encodeURIComponent(MOD)}&id=NUA_company`);
    const detail = d.mio || d.detail || d;
    rec("the organization was read", detail && detail.id === "NUA_company", detail && Object.keys(detail));

    const r = await post("/api/mio", Object.assign({}, detail, {
      modPath: MOD, id: "NUA_company", fileName: FILE, name: "Renamed Arsenal",
    }));
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);

    const txt = read();
    rec("a comment above a REBUILT field survived", /# only small arms for now/.test(txt), txt);
    rec("…directly above the equipment_type it annotates",
      lineAbove(txt, "equipment_type") === "# only small arms for now", lineAbove(txt, "equipment_type"));
    rec("a comment above an un-modelled field survived", /# balance pass pending/.test(txt), txt);
    rec("…and that un-modelled field is still there", /visible\s*=\s*\{/.test(txt), txt);
    rec("the third comment survived too", /# the state arsenal, nationalised in 1935/.test(txt), txt);
    rec("…above task_capacity, whose value is unchanged",
      /task_capacity\s*=\s*12/.test(txt), txt);
    rec("the organization is still brace-balanced",
      (txt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (txt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, txt);
    rec("the initial_trait survived", /initial_trait\s*=\s*\{/.test(txt), txt);

    console.log("\n[repeat] comments must not multiply");
    const d2 = await get(`/api/mio/detail?modPath=${encodeURIComponent(MOD)}&id=NUA_company`);
    const detail2 = d2.mio || d2.detail || d2;
    await post("/api/mio", Object.assign({}, detail2, { modPath: MOD, id: "NUA_company", fileName: FILE }));
    await post("/api/mio", Object.assign({}, detail2, { modPath: MOD, id: "NUA_company", fileName: FILE }));
    const txt2 = read();
    for (const c of ["# only small arms for now", "# balance pass pending", "# the state arsenal, nationalised in 1935"]) {
      const n = (txt2.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      rec(`"${c.slice(0, 28)}…" appears exactly once`, n === 1, n);
    }

    console.log(`\n=== MIO comment preservation: ${checks} checks, ${fails.length} failed ===`);
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
