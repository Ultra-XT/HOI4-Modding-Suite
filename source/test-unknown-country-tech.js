// #unknown-tech-written-silently — /api/technologies/set-country-tech refuses a technology id that exists
// nowhere, because HOI4 logs "unknown technology" on load and the country silently starts without it. Its
// sibling /api/technologies/save-country-techs, backed by the SAME free-text "add tech" box on Country
// Setup, had no check at all and wrote whatever it was given with ok:true.
//
// Two things shape the fix, both measured across vanilla + Millennium Dawn rather than assumed:
//
//  * CASE. Of MD's 464 distinct history set_technology ids, SIX are absent from the vanilla+MD catalogue
//    case-sensitively — early_APC, Anti_Tank_0, CV_L_Strike_Fighter1, CV_L_Strike_Fighter2, nsb_Anti_air_0,
//    Anti_air_0 — and ZERO are absent case-insensitively. MD's own history disagrees with MD's own
//    definitions on case, so a case-SENSITIVE test rejects six ids the mod itself ships. The pre-existing
//    check on the sibling endpoint was case-sensitive, and knew nothing of dependencies either.
//  * SCOPE. The client posts back the entire list it read from the history file, so validating the whole
//    array would let a pre-existing oddity in a hand-authored file block a save in which the user changed
//    something else. Only ids this request ADDS are checked.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unktech-"));
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

const MOD = path.join(ROOT, "tekmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TekMod"\nsupported_version="1.18.*"\n', "utf8");

// The mod defines its own tech, with MIXED case in the definition — the shape that makes case matter.
fs.writeFileSync(path.join(MOD, "common", "technologies", "nova_techs.txt"), [
  "technologies = {",
  "\tNova_Custom_Tech = {",
  "\t\tresearch_cost = 1",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const TAG = "NVT";
const HIST = path.join(MOD, "history", "countries", `${TAG} - Techland.txt`);
// A pre-existing hand-authored id the catalogue does not know — must not block an unrelated save.
const SEED = [
  "capital = 1",
  "",
  "set_technology = {",
  "\tinfantry_weapons = 1",
  "\ta_hand_authored_legacy_id = 1",
  "}",
  "",
].join("\n");

const PORT = 42445;
const app = createApp();
const server = app.listen(PORT, async () => {
  const saveAll = async (techIds) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-country-techs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: TAG, techIds }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const setOne = async (techId, active) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/set-country-tech`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: TAG, techId, active }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(HIST, "utf8");

  try {
    console.log("\n[control] a REAL tech still saves");
    // First, so the guard cannot be "refuse everything".
    fs.writeFileSync(HIST, SEED, "utf8");
    let r = await saveAll(["infantry_weapons", "a_hand_authored_legacy_id", "interwar_antiair"]);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the real vanilla tech landed", /interwar_antiair\s*=\s*1/.test(read()), read());

    console.log("\n[pre-existing unknown id] must NOT block an unrelated save");
    // The client posts back everything it read, including the legacy id it did not author.
    rec("the hand-authored legacy id survived", /a_hand_authored_legacy_id\s*=\s*1/.test(read()), read());

    console.log("\n[adding an unknown id] must be refused");
    fs.writeFileSync(HIST, SEED, "utf8");
    const before = read();
    r = await saveAll(["infantry_weapons", "a_hand_authored_legacy_id", "totally_made_up_tech"]);
    rec("the save was refused", r.status === 400, r.body || r.status);
    rec("…and named the offending id", !!(r.body && /totally_made_up_tech/.test(String(r.body.error || ""))), r.body && r.body.error);
    rec("the file is untouched", read() === before, read());

    console.log("\n[the mod's OWN tech] must be accepted, whatever the case");
    // Nova_Custom_Tech is defined with mixed case; the history references it lower-cased, exactly as MD does.
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await saveAll(["infantry_weapons", "a_hand_authored_legacy_id", "nova_custom_tech"]);
    rec("a differently-cased mod tech was accepted", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and written", /nova_custom_tech\s*=\s*1/.test(read()), read());

    console.log("\n[the sibling endpoint] the same case rule must apply there");
    // The pre-existing check on set-country-tech was case-SENSITIVE, so it refused this.
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await setOne("nova_custom_tech", true);
    rec("set-country-tech accepts the differently-cased id", r.status === 200 && r.body && r.body.ok !== false,
      r.body || r.status);

    console.log("\n[the sibling endpoint] still refuses a genuinely unknown id");
    r = await setOne("definitely_not_a_tech", true);
    rec("set-country-tech refuses an unknown id", r.status === 400, r.body || r.status);

    console.log("\n[removal] removing an unknown id must still be allowed");
    // Otherwise a user could never clean a bad id out of their own file.
    fs.writeFileSync(HIST, SEED, "utf8");
    r = await saveAll(["infantry_weapons"]);   // drops the legacy id
    rec("dropping an unknown id is allowed", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and it is gone", !/a_hand_authored_legacy_id/.test(read()), read());

    console.log(`\n=== unknown country tech: ${checks} checks, ${fails.length} failed ===`);
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
