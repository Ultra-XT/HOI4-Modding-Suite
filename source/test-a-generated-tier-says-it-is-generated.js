// ⛔ #generated-tier-listed-as-authored — NOVA LISTED EQUIPMENT THAT HAS NO BLOCK IN ANY FILE.
//
// HOI4's `duplicate_archetypes` makes the ENGINE generate a whole chassis family: a clone archetype plus one
// tier for every tier of the source (medium_tank_chassis_1 → medium_tank_destroyer_chassis_1). Millennium
// Dawn builds its entire SPAA / SP-arty / tank-destroyer / CAS line-up that way, vanilla uses it for tanks
// and airframes, and 4 installed mods ship it. Nova synthesizes those entries so the designer can see them,
// which is right — the alternative was variants of them showing "base not found".
//
// What it did not do is SAY SO. Vanilla's `x_tank_chassis.txt` reports 135 equipment against 69 real blocks,
// and the other 66 looked exactly like the modder's own. Measured through the real endpoints: opening one
// and pressing Save with no edit writes a real block, and an explicit definition WINS over the generated
// one — so a tier that tracked its source silently stops, and a whole-file pass wrote 50 build_cost_ic and
// 66 year lines that were not there before.
//
// The write is not the bug: overriding one generated tier is a legitimate thing to want, and refusing would
// take that away. Listing it as if it were already yours is the bug. This is the same answer
// #mio-include-shown-as-empty reached one maker over — show the inherited thing, name what it comes from,
// and let the modder decide.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53564;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gen-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");
const BASE = `http://127.0.0.1:${PORT}`;
const SUB = path.join("common", "units", "equipment");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// Vanilla's own shape: `duplicate_archetypes` is a TOP-LEVEL block, not a key inside an equipment.
const FIXTURE = `equipments = {
\tprobe_tank_chassis = {
\t\tis_archetype = yes
\t\ttype = { armor }
\t\tbuild_cost_ic = 12
\t\tyear = 1936
\t}
\tprobe_tank_chassis_1 = {
\t\tarchetype = probe_tank_chassis
\t\tsoft_attack = 4
\t}
\tprobe_tank_chassis_2 = {
\t\tarchetype = probe_tank_chassis
\t\tsoft_attack = 6
\t}
}

duplicate_archetypes = {
\tprobe_td_chassis = {
\t\tarchetype = probe_tank_chassis
\t\ttype = { armor }
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gen-mod-"));
    made.push(mod);
    const dest = path.join(mod, SUB, "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Gen Probe"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

    console.log("1. The endpoint says which entries the engine generates");
    const listed = ((await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json())).equipment || [])
      .filter((e) => e.isMod);
    const by = new Map(listed.map((e) => [e.id, e]));
    const declares = (id) => new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`).test(FIXTURE);
    const synth = listed.filter((e) => !declares(e.id));
    // ⚠️ CONTROL: the fixture reproduces the shape at all. Without synthesized entries every star below
    // would pass on a file that could not show the bug — my first fixture put duplicate_archetypes INSIDE
    // an equipment block and produced none, and read as a clean result.
    rec("CONTROL: the fixture really does generate entries", synth.length >= 2,
      `${synth.length} of ${listed.length} have no block: ` + synth.map((e) => e.id).join(" "));
    rec("⭐ every generated entry names what it came from",
      synth.length > 0 && synth.every((e) => !!e.generatedFrom), synth.map((e) => `${e.id}<-${e.generatedFrom || "(nothing)"}`).join(" "));
    rec("⭐ …and a tier points at the TIER it was copied from, not just the family",
      (by.get("probe_td_chassis_1") || {}).generatedFrom === "probe_tank_chassis_1",
      (by.get("probe_td_chassis_1") || {}).generatedFrom);
    rec("⭐ …while the clone archetype points at the source archetype",
      (by.get("probe_td_chassis") || {}).generatedFrom === "probe_tank_chassis",
      (by.get("probe_td_chassis") || {}).generatedFrom);
    // ⚠️ CONTROLS: a marker that is set on everything says nothing.
    rec("CONTROL: a block the file DECLARES is not marked",
      !(by.get("probe_tank_chassis_1") || {}).generatedFrom, (by.get("probe_tank_chassis_1") || {}).generatedFrom);
    rec("CONTROL: …nor is the archetype it declares",
      !(by.get("probe_tank_chassis") || {}).generatedFrom, (by.get("probe_tank_chassis") || {}).generatedFrom);

    console.log("\n2. …and the entries themselves still work  (the marker must not cost anything)");
    rec("a generated tier still carries its source's stats", Number((by.get("probe_td_chassis_1") || {}).softAttack) === 4,
      (by.get("probe_td_chassis_1") || {}).softAttack);
    rec("…and the cost it inherits from the family", Number((by.get("probe_td_chassis_1") || {}).buildCostIc) === 12,
      (by.get("probe_td_chassis_1") || {}).buildCostIc);
    rec("…and its archetype link points at the CLONE", (by.get("probe_td_chassis_1") || {}).archetype === "probe_td_chassis",
      (by.get("probe_td_chassis_1") || {}).archetype);

    console.log("\n3. The editor tells the modder before they press Save");
    {
      const src = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));
      rec("CONTROL: comments were stripped", src.indexOf("Say what the button will do before it does it") === -1, "prose survived");
      const i = src.indexOf("function eqGeneratedNote(");
      rec("the note exists", i > 0, `indexOf -> ${i}`);
      const fn = src.slice(i, i + 1400);
      rec("⭐ it keys on generatedFrom", /generatedFrom/.test(fn), fn.slice(0, 120));
      rec("⭐ …says nothing when the entry is the modder's own", /if \(!from\) return ""/.test(fn), fn.slice(0, 300));
      rec("⭐ …names the source in the message", /\$\{esc\(from\)\}/.test(fn), fn.slice(0, 300));
      rec("⭐ …and warns that saving stops it following", /stops following/.test(fn), fn.slice(0, 900));
      // It has to be RENDERED, not merely defined — a note nobody calls is not a note.
      rec("⭐ the editor renders it", /eqGeneratedNote\(eq\)/.test(src), "defined but never called");
      // ⚠️ CSP: no inline handlers anywhere in this codebase, and a note is exactly where one creeps in.
      rec("CONTROL: the note carries no inline event handler", !/on(click|error|load)\s*=/.test(fn), fn.slice(0, 400));
    }

    console.log(`\n=== a generated tier says it is generated: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
