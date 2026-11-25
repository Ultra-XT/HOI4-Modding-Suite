// #shadow-write-base-game — a save must never place a mod file at a BASE-GAME path.
//
// HOI4 replaces a file wholesale when a mod ships one at the same relative path. So writing a single character
// into `common/characters/GER.txt` does not add to vanilla's file — it REPLACES it, deleting every other
// character vanilla defined there. On Windows the collision is easier to hit than it looks, because NTFS
// treats `Serbia.txt` and `serbia.txt` as the same file.
//
// Nova already had a redirect guard, but at three sites it checked DEPENDENCY mods only and never the base
// game — and two of those used resolveModDependencyRoots, which resolves a workshop dependency such as
// Millennium Dawn to the wrong directory, so it did not even fire for the add-ons it was written to protect.
// All three now route through nonShadowingFileName, which checks the game root and uses the working resolver.
//
// Both directions are asserted. Redirecting too eagerly is its own bug: a name that collides with NOTHING
// must be honoured exactly as typed, or every save quietly lands somewhere the user did not choose.
//
// Fully hermetic: the "base game" here is a FAKE root under tmpdir (resolveHoi4GameRoot honours HOI4_ROOT when
// it contains hoi4.exe). The real install is never read, written or deleted, and the test does not depend on
// one being present.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shadow-"));

// A fake base game, so the collision filenames are ours to choose and the real install stays untouched.
const FAKE_GAME = path.join(ROOT, "fakegame");
fs.mkdirSync(path.join(FAKE_GAME, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(FAKE_GAME, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(FAKE_GAME, "events"), { recursive: true });
fs.writeFileSync(path.join(FAKE_GAME, "hoi4.exe"), "", "utf8"); // resolveHoi4GameRoot gates on this
fs.writeFileSync(path.join(FAKE_GAME, "common", "characters", "GER.txt"),
  "characters = {\n\tVANILLA_german_leader = {\n\t\tname = VANILLA_german_leader\n\t}\n}\n", "utf8");
fs.writeFileSync(path.join(FAKE_GAME, "events", "Germany.txt"),
  "add_namespace = Germany\n\ncountry_event = {\n\tid = Germany.1\n}\n", "utf8");
fs.writeFileSync(path.join(FAKE_GAME, "common", "ideas", "Egyptian.txt"),
  "ideas = {\n\tcountry = {\n\t\tvanilla_egy_spirit = { removal_cost = -1 }\n\t}\n}\n", "utf8");

process.env.HOI4_ROOT = FAKE_GAME;
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

const MOD = path.join(ROOT, "shadowmod");
["common/characters", "common/ideas", "events"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ShadowMod"\nsupported_version="1.18.*"\n', "utf8");

const PORT = 42145;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ls = (...rel) => { try { return fs.readdirSync(path.join(MOD, ...rel)).filter((f) => f.endsWith(".txt")); } catch (_) { return []; } };
  const has = (...rel) => fs.existsSync(path.join(MOD, ...rel));

  try {
    // ── CHARACTERS ───────────────────────────────────────────────────────────────────────────────
    console.log("\n[characters] saving into a vanilla file name");
    const c = await post("/api/characters/save", {
      modPath: MOD, file: "GER.txt", token: "NOVA_shadow_probe", name: "Nova Shadow Probe",
      countryTag: "GER", roleLeader: true, leaderIdeology: "despotism",
    });
    rec("the character saved", c.status === 200 && c.body && c.body.success !== false, c.body || c.status);
    rec("the mod did NOT create common/characters/GER.txt", !has("common", "characters", "GER.txt"),
      "a mod file now replaces vanilla's GER.txt and deletes its other characters");
    rec("…it was redirected to nova_GER.txt", has("common", "characters", "nova_GER.txt"), ls("common", "characters"));
    rec("vanilla's own file was not touched",
      fs.readFileSync(path.join(FAKE_GAME, "common", "characters", "GER.txt"), "utf8").includes("VANILLA_german_leader"),
      "the base-game file was modified");

    // ── EVENTS ───────────────────────────────────────────────────────────────────────────────────
    console.log("\n[events] a namespace matching a vanilla events file");
    const e = await post("/api/events/save", {
      modPath: MOD, namespace: "Germany", id: "77", type: "country_event",
      title: "Nova Shadow Event", description: "probe", options: [{ name: "OK", script: "" }],
    });
    rec("the event saved", e.status === 200 && e.body && e.body.success !== false, e.body || e.status);
    rec("the mod did NOT create events/Germany.txt", !has("events", "Germany.txt"),
      "a mod file now replaces vanilla's Germany.txt");
    rec("…it was redirected to nova_Germany.txt", has("events", "nova_Germany.txt"), ls("events"));

    // ── IDEAS ────────────────────────────────────────────────────────────────────────────────────
    console.log("\n[ideas] a target file matching a vanilla ideas file");
    const i = await post("/api/ideas/upsert-definition", {
      modPath: MOD, targetRelativeFile: "Egyptian.txt", ideaId: "nova_shadow_spirit",
      name: "Nova Shadow Spirit", category: "country", mode: "create",
    });
    rec("the spirit saved", i.status === 200 && i.body && i.body.ok !== false, i.body || i.status);
    rec("the mod did NOT create common/ideas/Egyptian.txt", !has("common", "ideas", "Egyptian.txt"),
      "a mod file now replaces vanilla's Egyptian.txt");
    rec("…it was redirected to custom_ideas.txt", has("common", "ideas", "custom_ideas.txt"), ls("common", "ideas"));

    // ── CONTROL: a name that collides with nothing must be honoured verbatim ─────────────────────
    console.log("\n[control] a non-colliding name is used exactly as given");
    const own = "my_own_characters.txt";
    const c2 = await post("/api/characters/save", {
      modPath: MOD, file: own, token: "NOVA_unique_probe", name: "Nova Unique Probe",
      countryTag: "GER", roleLeader: true, leaderIdeology: "despotism",
    });
    rec("the character saved", c2.status === 200 && c2.body && c2.body.success !== false, c2.body || c2.status);
    rec("the file was created under the name given", has("common", "characters", own), ls("common", "characters"));
    rec("…and was NOT redirected", !has("common", "characters", "nova_" + own),
      "a name that collided with nothing was still renamed");

    const own2 = "my_own_ideas.txt";
    const i2 = await post("/api/ideas/upsert-definition", {
      modPath: MOD, targetRelativeFile: own2, ideaId: "nova_unique_spirit",
      name: "Nova Unique Spirit", category: "country", mode: "create",
    });
    rec("the spirit saved", i2.status === 200 && i2.body && i2.body.ok !== false, i2.body || i2.status);
    rec("the ideas file was created under the name given", has("common", "ideas", own2), ls("common", "ideas"));

    console.log(`\n=== shadow write onto base-game paths: ${checks} checks, ${fails.length} failed ===`);
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
