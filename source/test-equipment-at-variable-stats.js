// #keep-equipment-stat-vars — an equipment stat authored as `@variable` must survive a save as that variable.
//
// Millennium Dawn defines 68 @variables and uses them on 463 equipment stat lines (`armor_value = @frigate_armor`).
// The writer knows how to put a token back, but only when handed a statVars map — and that map was built when
// the equipment was READ and never sent back by the client, so on every save it was empty:
//   - every @variable stat was flattened to the literal it happened to resolve to, detaching the weapon from
//     the balance constant the modder actually tunes
//   - `build_cost_ic = @var` was worse: the read regex accepted only digits, so the block counted as declaring
//     no build cost at all and the editor showed the invented default 0.5, which the save then wrote as the
//     weapon's real production cost
//
// Both directions are asserted, because the opposite failure (refusing to ever write a literal, or resurrecting
// a stale token after the user edits the number) is just as destructive:
//   unchanged  -> the @variable token is written back verbatim
//   edited     -> the user's new literal number wins and the token is dropped
//   plain file -> literal stats round-trip unchanged, and an absent build_cost_ic is not invented
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-atvar-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240));
  }
}

const MOD = path.join(ROOT, "atvarmod");
const EQ_DIR = path.join(MOD, "common", "units", "equipment");
fs.mkdirSync(EQ_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="AtVarMod"\nsupported_version="1.18.*"\n', "utf8");

const EQ_FILE = "nova_atvar.txt";
const ORIGINAL = [
  "@rifle_cost = 7.5",
  "@rifle_armor = 12",
  "",
  "equipments = {",
  "",
  "\tnova_atvar_rifle = {",
  "\t\tyear = 1936",
  "\t\tbuild_cost_ic = @rifle_cost",
  "\t\tarmor_value = @rifle_armor",
  "\t\tdefense = 21",
  "\t}",
  "",
  "\tnova_plain_rifle = {",
  "\t\tyear = 1936",
  "\t\tdefense = 9",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(EQ_DIR, EQ_FILE), ORIGINAL, "utf8");

const PORT = 42139;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const readFile = () => fs.readFileSync(path.join(EQ_DIR, EQ_FILE), "utf8");
  const list = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/list?modPath=${q}`);
    const b = await r.json().catch(() => null);
    const arr = Array.isArray(b) ? b : (b && (b.items || b.equipment)) || [];
    return { status: r.status, arr };
  };
  const save = async (payload) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, fileName: EQ_FILE, ...payload }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── READ: the @variable build cost must resolve, not fall through to the invented 0.5 ────────
    console.log("\n[read] an @variable build cost resolves to its real value");
    const l0 = await list();
    rec("the equipment list loads", l0.status === 200 && l0.arr.length > 0, l0.status);
    const rifle = l0.arr.find((e) => e && e.id === "nova_atvar_rifle");
    rec("the weapon is listed", !!rifle, l0.arr.map((e) => e && e.id).slice(0, 8));
    if (rifle) {
      rec("build_cost_ic reads as 7.5, not the invented 0.5", Number(rifle.buildCostIc) === 7.5, rifle.buildCostIc);
      // NOTE: statVars is deliberately NOT asserted on this payload. The fix recovers the tokens server-side
      // from the file being rewritten precisely BECAUSE the client never round-trips them, so requiring them
      // on the wire would be testing a contract that does not need to exist. The save assertions below are
      // what actually prove the tokens survive.
    }

    // ── SAVE UNCHANGED: the tokens must come back verbatim ───────────────────────────────────────
    console.log("\n[save unchanged] the @variable tokens survive");
    const unchanged = await save({
      id: "nova_atvar_rifle",
      year: 1936,
      // Exactly what the client posts: resolved numbers, and NO statVars (it never round-trips them).
      statsAll: { build_cost_ic: 7.5, armor_value: 12, defense: 21 },
    });
    rec("the save succeeded", unchanged.status === 200 && unchanged.body && unchanged.body.success !== false,
      unchanged.body || unchanged.status);
    const afterUnchanged = readFile();
    rec("build_cost_ic is still @rifle_cost", /build_cost_ic\s*=\s*@rifle_cost/.test(afterUnchanged),
      (afterUnchanged.match(/build_cost_ic[^\n]*/) || ["(absent)"])[0]);
    rec("armor_value is still @rifle_armor", /armor_value\s*=\s*@rifle_armor/.test(afterUnchanged),
      (afterUnchanged.match(/armor_value[^\n]*/) || ["(absent)"])[0]);
    rec("the production cost was NOT slammed to 0.5", !/build_cost_ic\s*=\s*0\.5/.test(afterUnchanged),
      (afterUnchanged.match(/build_cost_ic[^\n]*/) || [""])[0]);
    rec("the @variable definitions are still in the file", /@rifle_cost\s*=\s*7\.5/.test(afterUnchanged), "definition lost");
    rec("the plain literal stat survived", /defense\s*=\s*21/.test(afterUnchanged),
      (afterUnchanged.match(/defense[^\n]*/) || ["(absent)"])[0]);
    rec("the OTHER weapon in the file was not disturbed", /nova_plain_rifle\s*=\s*\{/.test(afterUnchanged), "sibling lost");

    // ── SAVE EDITED: a real user edit must WIN over the token ────────────────────────────────────
    console.log("\n[save edited] a changed number drops the token");
    const edited = await save({
      id: "nova_atvar_rifle",
      year: 1936,
      statsAll: { build_cost_ic: 99, armor_value: 12, defense: 21 },
    });
    rec("the save succeeded", edited.status === 200 && edited.body && edited.body.success !== false,
      edited.body || edited.status);
    const afterEdit = readFile();
    rec("the edited build cost is the literal 99", /build_cost_ic\s*=\s*99/.test(afterEdit),
      (afterEdit.match(/build_cost_ic[^\n]*/) || ["(absent)"])[0]);
    rec("…and the stale token is gone", !/build_cost_ic\s*=\s*@rifle_cost/.test(afterEdit), "token resurrected over the user's edit");
    rec("the UNedited @variable stat kept its token", /armor_value\s*=\s*@rifle_armor/.test(afterEdit),
      (afterEdit.match(/armor_value[^\n]*/) || ["(absent)"])[0]);

    // ── CONTROL: a weapon with no @variables anywhere must be untouched by all of this ───────────
    console.log("\n[control] a plain weapon with no variables");
    const plainSave = await save({ id: "nova_plain_rifle", year: 1936, statsAll: { defense: 9 } });
    rec("the save succeeded", plainSave.status === 200 && plainSave.body && plainSave.body.success !== false,
      plainSave.body || plainSave.status);
    const afterPlain = readFile();
    const plainBlock = (afterPlain.match(/nova_plain_rifle\s*=\s*\{[\s\S]*?\n\t\}/) || [""])[0];
    rec("its literal stat round-trips", /defense\s*=\s*9/.test(plainBlock), plainBlock.slice(0, 160));
    rec("no build_cost_ic was invented for it", !/build_cost_ic/.test(plainBlock), plainBlock.slice(0, 160));

    // The opposite direction, and the exact regression public/research.js warns about: a number the user
    // actually TYPED must be written even when it happens to equal the parser's invented default. Suppressing
    // it would silently discard a deliberate edit.
    console.log("\n[control] a typed value equal to the default is still written");
    const typedDefault = await save({ id: "nova_plain_rifle", year: 1936, buildCostIc: 0.5, statsAll: { defense: 9 } });
    rec("the save succeeded", typedDefault.status === 200 && typedDefault.body && typedDefault.body.success !== false,
      typedDefault.body || typedDefault.status);
    const afterTyped = readFile();
    const typedBlock = (afterTyped.match(/nova_plain_rifle\s*=\s*\{[\s\S]*?\n\t\}/) || [""])[0];
    rec("the typed 0.5 WAS written", /build_cost_ic\s*=\s*0\.5/.test(typedBlock), typedBlock.slice(0, 200));

    console.log(`\n=== equipment @variable stats: ${checks} checks, ${fails.length} failed ===`);
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
