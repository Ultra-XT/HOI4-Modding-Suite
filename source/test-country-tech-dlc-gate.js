// #dlc-gated-tech-destroyed — writeCountryTechnologies always meant to leave hand-authored, conditional
// set_technology alone: its own comment says "Only manage the TOP-LEVEL (unconditional) set_technology".
// It enforced that by splitting the file at the first DATE block, then stripping set_technology from the head
// with a regex that matched at ANY brace depth. A gate written above the first date —
//
//   if = { limit = { has_dlc = "Man the Guns" } set_technology = { ... } }
//
// which is the natural place for it, therefore sat in the "head" and was deleted on every save, leaving an
// empty husk, and the tech it granted was re-emitted UNCONDITIONALLY at top level. So the modder lost the
// gate AND every player without the DLC silently started with the tech. The response said nothing.
//
// Reachable from Country Setup → Starting Technologies with one click on any country whose history has such
// a gate, and from set-country-tech and save-batch, which call the same writer.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dlcgate-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "gatemod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="GateMod"\nsupported_version="1.18.*"\n', "utf8");

const TAG = "GAT";
const HIST = path.join(MOD, "history", "countries", `${TAG} - Gateland.txt`);

// The gate sits BEFORE any date block — the shape the old split mis-classified as "head".
const SEED = [
  "capital = 1",
  "",
  "set_technology = {",
  "\tinfantry_weapons = 1",
  "\tgw_artillery = 1",
  "}",
  "",
  "# DLC-gated starting tech - hand authored, must survive a Save",
  'if = {',
  '\tlimit = { has_dlc = "Man the Guns" }',
  "\tset_technology = {",
  "\t\tbasic_naval_mines = 1",
  "\t\tmtg_transport = 1",
  "\t}",
  "}",
  "",
  "1939.1.1 = {",
  "\tset_technology = {",
  "\t\tdated_tech_example = 1",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42421;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (techIds) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-country-techs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: TAG, techIds }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(HIST, "utf8");
  const countTopLevel = (text, id) => {
    // occurrences of the id inside a set_technology block that is NOT nested in a conditional
    let n = 0;
    const re = /\bset_technology\s*=\s*\{/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      let depth = 0, inQ = false;
      for (let i = 0; i < m.index; i += 1) {
        const c = text[i];
        if (c === '"') inQ = !inQ;
        else if (!inQ && c === "#") { const nl = text.indexOf("\n", i); if (nl === -1) break; i = nl; }
        else if (!inQ && c === "{") depth += 1;
        else if (!inQ && c === "}") depth -= 1;
      }
      if (depth !== 0) continue;
      const open = text.indexOf("{", m.index);
      let d = 0, end = -1;
      for (let i = open; i < text.length; i += 1) {
        if (text[i] === "{") d += 1;
        else if (text[i] === "}") { d -= 1; if (d === 0) { end = i; break; } }
      }
      if (end !== -1 && new RegExp(`\\b${id}\\s*=`).test(text.slice(open, end))) n += 1;
    }
    return n;
  };

  try {
    console.log("\n[save] a DLC gate above the first date block must survive untouched");
    fs.writeFileSync(HIST, SEED, "utf8");
    // The client sends back everything the reader showed it, which includes the gated and dated techs.
    let r = await save(["infantry_weapons", "gw_artillery", "basic_naval_mines", "mtg_transport", "dated_tech_example"]);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);

    let t = read();
    rec("the has_dlc gate is still present", /has_dlc\s*=\s*"Man the Guns"/.test(t), t);
    rec("…and still contains its set_technology", /has_dlc[\s\S]{0,80}set_technology\s*=\s*\{/.test(t), t.slice(0, 600));
    rec("both gated techs are still inside the gate",
      /basic_naval_mines\s*=\s*1/.test(t) && /mtg_transport\s*=\s*1/.test(t), t);
    rec("no empty `if` husk was left behind", !/if\s*=\s*\{\s*limit\s*=\s*\{[^}]*\}\s*\}/.test(t), t);

    rec("the gated tech was NOT re-emitted unconditionally", countTopLevel(t, "basic_naval_mines") === 0,
      { count: countTopLevel(t, "basic_naval_mines"), file: t });
    rec("…nor the other gated tech", countTopLevel(t, "mtg_transport") === 0, countTopLevel(t, "mtg_transport"));
    rec("the dated tech was NOT re-emitted unconditionally either", countTopLevel(t, "dated_tech_example") === 0,
      countTopLevel(t, "dated_tech_example"));

    rec("the gated techs are reported as unmanaged",
      Array.isArray(r.body && r.body.unmanaged)
        ? ["basic_naval_mines", "mtg_transport"].every((id) => r.body.unmanaged.includes(id))
        : true, // the field is optional in the response shape; the file assertions above are the real contract
      r.body && r.body.unmanaged);

    console.log("\n[control] the UNCONDITIONAL block is still managed");
    // Without this the fix could simply be "never strip anything", which would break removal entirely.
    r = await save(["infantry_weapons"]); // dropped gw_artillery
    rec("the removal save succeeded", r.status === 200, r.body || r.status);
    t = read();
    rec("the dropped top-level tech is gone", countTopLevel(t, "gw_artillery") === 0, countTopLevel(t, "gw_artillery"));
    rec("the kept top-level tech is still there", countTopLevel(t, "infantry_weapons") === 1, countTopLevel(t, "infantry_weapons"));
    rec("the gate STILL survived the removal save", /has_dlc\s*=\s*"Man the Guns"/.test(t) && /basic_naval_mines\s*=\s*1/.test(t), t);

    console.log("\n[control] adding a genuinely new tech still works");
    r = await save(["infantry_weapons", "interwar_antiair"]);
    t = read();
    rec("the added tech landed at top level", countTopLevel(t, "interwar_antiair") === 1, countTopLevel(t, "interwar_antiair"));
    rec("the gate survived that too", /basic_naval_mines\s*=\s*1/.test(t), t);

    console.log("\n[idempotence] saving the same list twice is byte-identical");
    const settled = read();
    await save(["infantry_weapons", "interwar_antiair"]);
    rec("a second identical save changes nothing", read() === settled,
      { before: settled.length, after: read().length });

    console.log(`\n=== country tech DLC gate: ${checks} checks, ${fails.length} failed ===`);
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
