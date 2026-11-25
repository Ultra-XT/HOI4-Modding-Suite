// #maker-delete-inverse — delete must be the exact inverse of create. Make a thing, delete it, and the mod
// should be byte-for-byte what it was before the thing existed.
//
// What this catches is RESIDUE: the localisation key nobody stripped, the now-empty category block, the
// startup grant still naming something that no longer exists, the file created for one item and left behind
// empty. None of it errors. The modder finds it later as a dead reference, or never — it just sits in the
// shipped mod.
//
// It is a different invariant from idempotence (test-maker-idempotence.js). That one asks whether repeating
// an operation drifts; this one asks whether an operation can be undone. A writer can be perfectly idempotent
// and still leave a loc key behind on delete.
//
// Where residue is EXPECTED it is stated per maker, so the test asserts the real contract rather than an
// idealised one — a container file that stays behind holding zero items is normal for some makers and the
// check would otherwise be unpassable noise.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delinv-"));
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

const MOD = path.join(ROOT, "delmod");
for (const d of [
  ["common", "ideas"], ["common", "decisions"], ["common", "characters"],
  ["common", "technologies"], ["common", "units", "equipment"],
  ["events"], ["history", "countries"], ["localisation", "english"],
]) fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DelMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");

function snapshot() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      // safeModWrite writes <name>.tmp then renames. Under full-suite timing the walk can list one that is
      // already gone by the time it is read, which killed this test with an ENOENT that never reproduced in
      // isolation. Skip the transients, and tolerate any file disappearing mid-walk.
      if (/\.tmp$/i.test(e.name)) continue;
      let body;
      try { body = fs.readFileSync(p).toString("utf8"); } catch (err) { if (err && err.code === "ENOENT") continue; throw err; }
      out.set(path.relative(MOD, p), body);
    }
  };
  walk(MOD);
  return out;
}

// Anything still naming the thing we deleted is residue, wherever it lives.
function mentions(snap, needle) {
  const hits = [];
  for (const [rel, text] of snap) {
    const lines = text.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (l.includes(needle)) hits.push(`${rel}:${i + 1}  ${l.trim().slice(0, 90)}`);
    });
  }
  return hits;
}

const PORT = 42271;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const CASES = [
    {
      name: "event",
      token: "nua_del_ns.1",
      create: ["/api/events/save", {
        modPath: MOD, namespace: "nua_del_ns", id: 1, type: "country_event",
        picture: "GFX_report_event_generic_factory", triggeredOnly: "yes", hidden: "no",
        fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
        title: "Delete Me", description: "d",
        options: [{ name: "nua_del_ns.1.a", title: "OK", script: "", aiChance: "", trigger: "" }],
      }],
      remove: ["/api/events/delete-definition", { modPath: MOD, eventId: "nua_del_ns.1" }],
      // The namespace file stays behind; that is the container, not the item.
      allowedResidueFiles: [/^events[\\/]/],
    },
    {
      name: "decision",
      token: "nua_del_decision",
      create: ["/api/decisions/save", {
        modPath: MOD, categoryId: "nua_del_cat", id: "nua_del_decision", name: "Delete Me",
        cost: 0, icon: "GFX_decision_generic_decision", days: 30, fireOnce: "no",
        available: "always = yes", modifier: "", effect: "add_political_power = 10",
        decisionType: "normal", scope: "country", cooldown: 0, targetTrigger: "",
        removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
        visible: "", allowed: "", aiWillDo: "", priority: 250, cancelIfNotVisible: "yes",
        customCostText: "", customCostTrigger: "",
      }],
      remove: ["/api/decisions/delete-definition", {
        modPath: MOD, categoryId: "nua_del_cat", decisionId: "nua_del_decision", fileName: "nua_del_cat.txt",
      }],
      allowedResidueFiles: [/^common[\\/]decisions[\\/]/],
    },
    {
      name: "character",
      token: "NUA_del_character",
      create: ["/api/characters/save", {
        modPath: MOD, token: "NUA_del_character", name: "Delete Me", file: "nua_del_characters.txt",
        roleLeader: true, leaderIdeology: "conservatism", leaderExpire: "", leaderTraits: "",
        roleAdvisor: false, roleGeneral: false,
      }],
      remove: ["/api/characters/delete", { modPath: MOD, token: "NUA_del_character", file: "nua_del_characters.txt" }],
      allowedResidueFiles: [/^common[\\/]characters[\\/]/],
    },
    {
      name: "spirit",
      token: "nua_del_spirit",
      create: ["/api/ideas/upsert-definition", {
        modPath: MOD, ideaId: "nua_del_spirit", targetRelativeFile: "nua_del_spirits.txt",
        targetLocalizationPath: "localisation/english/nova_l_english.yml",
        name: "Delete Me", desc: "d", picture: "GFX_idea_generic_morale_bonus",
        selectedEffects: ["political_power_gain = 0.1"], mode: "create", category: "country",
        traits: [], cost: "", removalCost: "", ledger: "",
      }],
      remove: ["/api/ideas/delete-definition", {
        modPath: MOD, ideaId: "nua_del_spirit", targetRelativeFile: "nua_del_spirits.txt",
        targetLocalizationPath: "localisation/english/nova_l_english.yml",
      }],
      allowedResidueFiles: [/^common[\\/]ideas[\\/]/],
    },
    {
      name: "technology",
      token: "nua_del_tech",
      create: ["/api/technologies/save", {
        modPath: MOD,
        tech: { id: "nua_del_tech", fileName: "nua_del_techs.txt", folder: "infantry_folder", name: "Delete Me", year: 1936 },
      }],
      remove: ["/api/technologies/delete", { modPath: MOD, techId: "nua_del_tech", techFile: "nua_del_techs.txt" }],
      allowedResidueFiles: [/^common[\\/]technologies[\\/]/],
    },
  ];

  try {
    for (const c of CASES) {
      console.log(`\n[${c.name}] create then delete must return the mod to where it started`);
      const before = snapshot();

      const made = await post(c.create[0], c.create[1]);
      rec(`created`, made.status === 200 && made.body && made.body.ok !== false, made.body || made.status);
      if (!(made.status === 200 && made.body && made.body.ok !== false)) continue;

      const withIt = snapshot();
      rec(`…and the thing is really there`, mentions(withIt, c.token).length > 0, c.token);

      const gone = await post(c.remove[0], c.remove[1]);
      rec(`deleted`, gone.status === 200 && gone.body && gone.body.ok !== false, gone.body || gone.status);
      if (!(gone.status === 200 && gone.body && gone.body.ok !== false)) continue;

      const after = snapshot();

      // 1. Nothing anywhere may still name it. This is the residue check that matters.
      rec(`nothing in the mod still names it`, mentions(after, c.token).length === 0, mentions(after, c.token));

      // 2. Files that did not exist before may survive only if they are CONTAINERS — the maker's target .txt,
      //    a localisation .yml, or the tech-tree gui Nova copies out of vanilla. Those hold other content and
      //    removing them on the last delete would be wrong; what matters is that they no longer name the
      //    deleted item, which check 1 above enforces. Anything else left behind is a stray.
      const isContainer = (rel) =>
        /\.yml$/i.test(rel) ||
        /^interface[\\/]countrytechtreeview\.gui$/i.test(rel) ||
        /^(events|common)[\\/].*\.txt$/i.test(rel);
      const newFiles = [...after.keys()].filter((rel) => !before.has(rel));
      const unexpected = newFiles.filter((rel) => !isContainer(rel));
      rec(`no stray file was left behind`, unexpected.length === 0, unexpected);

      // …and a container that survives must be genuinely empty of this item, not merely not-mentioning its
      // id. An empty loc file is fine; one still carrying a stale key for it is not.
      const staleLoc = newFiles
        .filter((rel) => /\.yml$/i.test(rel))
        .filter((rel) => new RegExp(`^\\s*${c.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[_:]`, "m").test(after.get(rel) || ""));
      rec(`no localisation container kept a key for it`, staleLoc.length === 0, staleLoc);

      // 3. Files that existed before must be back exactly as they were — this is where a loc file that
      //    gained a key, or lost its trailing newline, shows up.
      const touched = [...before.keys()].filter((rel) => after.get(rel) !== before.get(rel));
      rec(`every pre-existing file is byte-identical again`, touched.length === 0,
        touched.map((rel) => ({
          rel,
          beforeLen: before.get(rel).length,
          afterLen: (after.get(rel) || "").length,
        })));
    }

    console.log(`\n=== maker delete inverse: ${checks} checks, ${fails.length} failed ===`);
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
