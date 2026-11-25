// #keep-idea-at-vars — an advisor whose cost is an @variable must not have that variable replaced by a number.
//
// The chain that destroyed it was four links long:
//   1. the read regex accepted only digits, so `cost = @advisor_cost` did not match and the payload said ""
//   2. public/ideas.js does `editData.cost || "150"`, turning that into 150
//   3. public/ideas.html uses <input type="number">, which physically cannot hold "@advisor_cost" anyway
//   4. the writer takes req.body.cost as-is, so 150 landed on disk over the variable
//
// The fix is server-side on purpose: because of link 3, ANY fix that relies on the client carrying the token
// is dead on arrival. The read resolves the variable to its real number for display, and the writer puts the
// token back when that same number comes home unchanged.
//
// Both directions, since resurrecting a stale token over a deliberate edit is just as destructive:
//   unchanged -> the @variable survives
//   edited    -> the user's literal wins and the token is gone
//   literal   -> an ordinary numeric cost is completely unaffected
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideavar-"));
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

const MOD = path.join(ROOT, "ideavarmod");
const IDEAS_DIR = path.join(MOD, "common", "ideas");
fs.mkdirSync(IDEAS_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="IdeaVarMod"\nsupported_version="1.18.*"\n', "utf8");

const IDEAS_FILE = "nova_advisors.txt";
fs.writeFileSync(
  path.join(IDEAS_DIR, IDEAS_FILE),
  [
    "@advisor_cost = 100",
    "@advisor_removal = 25",
    "",
    "ideas = {",
    "\tpolitical_advisor = {",
    "",
    "\t\tnova_var_advisor = {",
    "\t\t\tcost = @advisor_cost",
    "\t\t\tremoval_cost = @advisor_removal",
    "\t\t\ttraits = { nova_trait_a }",
    "\t\t}",
    "",
    "\t\tnova_plain_advisor = {",
    "\t\t\tcost = 75",
    "\t\t\ttraits = { nova_trait_b }",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n"),
  "utf8"
);

const PORT = 42141;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const readFile = () => fs.readFileSync(path.join(IDEAS_DIR, IDEAS_FILE), "utf8");
  const blockOf = (id) => {
    const m = readFile().match(new RegExp(id + "\\s*=\\s*\\{[\\s\\S]*?\\n\\t\\t\\}"));
    return m ? m[0] : "";
  };
  const editPayload = async (ideaId) => {
    // definitionFile is resolved relative to the MOD ROOT, not the ideas directory.
    const rel = encodeURIComponent("common/ideas/" + IDEAS_FILE);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/edit-payload?modPath=${q}&ideaId=${ideaId}&definitionFile=${rel}`);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const save = async (payload) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        targetRelativeFile: IDEAS_FILE,
        category: "political_advisor",
        mode: "edit",
        ...payload,
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── READ: the variable must resolve to its real number, not vanish ───────────────────────────
    console.log("\n[read] an @variable cost resolves instead of reading as empty");
    const ep = await editPayload("nova_var_advisor");
    rec("the edit payload loads", ep.status === 200 && ep.body && ep.body.ok !== false, ep.body || ep.status);
    if (ep.body) {
      rec("cost reads as 100, not empty", String(ep.body.cost) === "100", ep.body.cost);
      rec("removal_cost reads as 25, not empty", String(ep.body.removalCost || ep.body.removal_cost) === "25",
        ep.body.removalCost !== undefined ? ep.body.removalCost : ep.body.removal_cost);
    }

    // ── SAVE UNCHANGED: exactly what the editor posts — the resolved number, no token ────────────
    console.log("\n[save unchanged] the @variable tokens survive");
    const unchanged = await save({ ideaId: "nova_var_advisor", name: "Nova Var Advisor", cost: "100", removalCost: "25", traits: "nova_trait_a" });
    rec("the save succeeded", unchanged.status === 200 && unchanged.body && unchanged.body.ok !== false,
      unchanged.body || unchanged.status);
    const varBlock = blockOf("nova_var_advisor");
    rec("cost is still @advisor_cost", /cost\s*=\s*@advisor_cost/.test(varBlock), varBlock.slice(0, 200));
    rec("removal_cost is still @advisor_removal", /removal_cost\s*=\s*@advisor_removal/.test(varBlock), varBlock.slice(0, 200));
    rec("the invented 150 was NOT written", !/cost\s*=\s*150/.test(varBlock), varBlock.slice(0, 200));
    rec("the @variable definitions survive in the file", /@advisor_cost\s*=\s*100/.test(readFile()), "definition lost");

    // ── SAVE EDITED: a real edit must win ────────────────────────────────────────────────────────
    console.log("\n[save edited] a changed number drops the token");
    const edited = await save({ ideaId: "nova_var_advisor", name: "Nova Var Advisor", cost: "250", removalCost: "25", traits: "nova_trait_a" });
    rec("the save succeeded", edited.status === 200 && edited.body && edited.body.ok !== false, edited.body || edited.status);
    const editedBlock = blockOf("nova_var_advisor");
    rec("cost is the literal 250", /cost\s*=\s*250/.test(editedBlock), editedBlock.slice(0, 200));
    rec("…and the stale token is gone", !/cost\s*=\s*@advisor_cost/.test(editedBlock), "token resurrected over the edit");
    rec("the UNedited removal_cost kept its token", /removal_cost\s*=\s*@advisor_removal/.test(editedBlock),
      editedBlock.slice(0, 200));

    // ── CONTROL: an ordinary numeric cost is untouched by any of this ────────────────────────────
    console.log("\n[control] an advisor with a plain numeric cost");
    const plain = await save({ ideaId: "nova_plain_advisor", name: "Nova Plain Advisor", cost: "75", traits: "nova_trait_b" });
    rec("the save succeeded", plain.status === 200 && plain.body && plain.body.ok !== false, plain.body || plain.status);
    const plainBlock = blockOf("nova_plain_advisor");
    rec("its literal cost round-trips as 75", /cost\s*=\s*75/.test(plainBlock), plainBlock.slice(0, 200));
    rec("no @variable was invented for it", !/cost\s*=\s*@/.test(plainBlock), plainBlock.slice(0, 200));

    console.log(`\n=== idea @variable cost: ${checks} checks, ${fails.length} failed ===`);
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
