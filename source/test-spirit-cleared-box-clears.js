// #cleared-box-does-not-clear — emptying a field in the Spirit editor did not remove it from the file.
//
// Every other check in this suite asks whether Nova KEEPS what you did not touch. This is the inverse, and
// it is the classic failure of preserve-merge designs: the machinery that protects un-modelled fields also
// refuses to let you delete a modelled one. Clearing a spirit's `available` gate left the spirit gated in
// game while the editor showed the box empty.
//
// The strip was driven only by what the payload CONTAINS. Emptying a box makes the client stop sending that
// block, so nothing named it and the old one stayed. `modifier`, `research_bonus` and `equipment_bonus`
// escaped by accident — a different helper strips those unconditionally — which is why this went unnoticed:
// the field people clear most often happened to work.
//
// The eight sections treated as form-owned are exactly the ones public/ideas.js loads out of the block into a
// visible box on open and sends back on save. Because the user can SEE each of them, an empty box is an
// instruction to delete. Anything the form does not model travels through the extra-script passthrough and is
// deliberately left alone — deleting something the user was never shown would be a worse bug than this one.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spclear-"));
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

const MOD = path.join(ROOT, "spmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");

const ABS = path.join(MOD, "common", "ideas", "nua_sp.txt");
const BASE = {
  modPath: MOD, ideaId: "nua_sp", targetRelativeFile: "nua_sp.txt",
  targetLocalizationPath: "localisation/english/nova_l_english.yml",
  name: "Sp", desc: "d", picture: "GFX_idea_generic_morale_bonus",
  category: "country", traits: [], cost: "", removalCost: "", ledger: "",
};
// The client sends whole BLOCKS as strings, one per filled box. Clearing a box drops it from the array —
// that is the entire mechanism under test, so the fixture has to use that shape.
const B = {
  allowed: "allowed = {\n\talways = yes\n}",
  available: "available = {\n\thas_war = yes\n}",
  visible: "visible = {\n\thas_country_flag = nua_flag\n}",
  onAdd: "on_add = {\n\tadd_political_power = 5\n}",
  modifier: "modifier = {\n\tpolitical_power_gain = 0.1\n}",
  researchBonus: "research_bonus = {\n\tinfantry_weapons = 0.1\n}",
  // NOT modelled by the form — reaches the file through the extra-script passthrough.
  onRemove: "on_remove = {\n\tadd_stability = 0.1\n}",
};

const PORT = 42381;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (mode, effects) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({}, BASE, { mode, selectedEffects: effects })),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");
  const has = (t, key) => new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*\\{`).test(t);

  try {
    console.log("\n[setup] a spirit with every box filled");
    let r = await save("create", [B.allowed, B.available, B.visible, B.onAdd, B.modifier, B.researchBonus, B.onRemove]);
    rec("the spirit was created", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    let t = read();
    rec("every section is on disk",
      ["allowed", "available", "visible", "on_add", "modifier", "research_bonus", "on_remove"].every((k) => has(t, k)),
      t);

    console.log("\n[clear one box] only that section goes");
    r = await save("edit", [B.allowed, B.visible, B.onAdd, B.modifier, B.researchBonus, B.onRemove]);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("`available` is gone", !has(t, "available"), t);
    rec("…and every other section stayed",
      ["allowed", "visible", "on_add", "modifier", "research_bonus"].every((k) => has(t, k)), t);
    rec("…including the un-modelled on_remove", has(t, "on_remove"), t);

    console.log("\n[clear another] the fix is not one-shot");
    r = await save("edit", [B.allowed, B.onAdd, B.modifier, B.researchBonus, B.onRemove]);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("`visible` is gone too", !has(t, "visible"), t);
    rec("…and `allowed` / `on_add` / `modifier` are still there",
      ["allowed", "on_add", "modifier"].every((k) => has(t, k)), t);

    console.log("\n[clear every box] the all-empty payload takes a different branch and must behave the same");
    r = await save("edit", []);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    for (const k of ["allowed", "available", "visible", "on_add", "modifier", "research_bonus"]) {
      rec(`\`${k}\` is gone`, !has(t, k), t);
    }
    rec("the un-modelled on_remove SURVIVED — the user never saw it in a box", has(t, "on_remove"), t);
    rec("the spirit itself still exists", /nua_sp\s*=\s*\{/.test(t), t);
    rec("the file is brace-balanced",
      (t.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (t.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, t);

    console.log("\n[re-add] a cleared box can be filled again");
    r = await save("edit", [B.available]);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("`available` came back", has(t, "available"), t);
    rec("…exactly once", (t.match(/(^|\n)\s*available\s*=\s*\{/g) || []).length === 1,
      (t.match(/(^|\n)\s*available\s*=\s*\{/g) || []).length);

    console.log(`\n=== spirit cleared-box: ${checks} checks, ${fails.length} failed ===`);
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
