// #maker-idempotence — saving the SAME thing twice must leave the mod byte-identical.
//
// This is the invariant that produced three defects in the previous pass, all of the same shape: a writer
// that MERGES incoming content into an existing block, but appends where it meant to replace. The user sees
// it as a file that grows every time they press Save — duplicated modifiers, accumulating blank lines — and
// nothing reports an error, because each individual save "succeeded".
//
// It was only ever applied to the ideas writer and country history. Every maker that merges into an existing
// file is exposed to the same shape, so this drives them all through one check:
//
//     create it once  ->  snapshot every file in the mod  ->  save the IDENTICAL payload again
//     ->  every file must be byte-for-byte what it was
//
// A second save is not a strange thing to do: the editor re-saves on every field change, and the user who
// opens a thing, changes nothing and presses Save is doing exactly this.
//
// Localisation files are included in the snapshot on purpose — a duplicated loc line is the same defect.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-idem-"));
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

const MOD = path.join(ROOT, "idemmod");
for (const d of [
  ["common", "ideas"], ["common", "decisions"], ["common", "characters"],
  ["common", "units", "equipment"], ["common", "technologies"],
  ["common", "military_industrial_organization", "organizations"],
  ["events"], ["history", "countries"], ["localisation", "english"],
]) fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="IdemMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");

// Snapshot every file in the mod, so a writer that touches an unexpected file is caught too.
function snapshot() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      // See the note in test-maker-delete-inverse: a .tmp from safeModWrite can vanish between listing and
      // reading, which fails only under full-suite timing.
      if (/\.tmp$/i.test(e.name)) continue;
      let body;
      try { body = fs.readFileSync(p); } catch (err) { if (err && err.code === "ENOENT") continue; throw err; }
      out.set(path.relative(MOD, p), body);
    }
  };
  walk(MOD);
  return out;
}

function diff(before, after) {
  const changed = [];
  for (const [rel, buf] of after) {
    const prev = before.get(rel);
    if (!prev) { changed.push({ rel, how: "created by the SECOND save" }); continue; }
    if (!prev.equals(buf)) {
      const a = prev.toString("utf8").split(/\r?\n/);
      const b = buf.toString("utf8").split(/\r?\n/);
      let firstLine = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] !== b[i]) { firstLine = i + 1; break; } }
      changed.push({
        rel,
        how: `${prev.length}B/${a.length}L -> ${buf.length}B/${b.length}L, first differing line ${firstLine}`,
        was: (a[firstLine - 1] || "").slice(0, 80),
        now: (b[firstLine - 1] || "").slice(0, 80),
      });
    }
  }
  for (const rel of before.keys()) if (!after.has(rel)) changed.push({ rel, how: "DELETED by the second save" });
  return changed;
}

const PORT = 42251;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  // Each maker: a payload that is valid on its own, saved twice with no change between.
  const MAKERS = [
    {
      name: "event",
      route: "/api/events/save",
      payload: {
        modPath: MOD, namespace: "nua_ns", id: 1, type: "country_event",
        picture: "GFX_report_event_generic_factory", triggeredOnly: "yes", hidden: "no",
        fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
        title: "Nova Event", description: "d",
        options: [{ name: "nua_ns.1.a", title: "OK", script: "", aiChance: "", trigger: "" }],
      },
      edit: { title: "Nova Event Renamed", immediate: "set_country_flag = nua_flag" },
      editLanded: /nua_flag/,
    },
    {
      name: "decision",
      route: "/api/decisions/save",
      payload: {
        modPath: MOD, categoryId: "nua_decisions", id: "nua_decision", name: "Nova Decision",
        cost: 0, icon: "GFX_decision_generic_decision", days: 30, fireOnce: "no",
        available: "always = yes", modifier: "", effect: "add_political_power = 10",
        decisionType: "normal", scope: "country", cooldown: 0, targetTrigger: "",
        removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
        visible: "", allowed: "", aiWillDo: "", priority: 250, cancelIfNotVisible: "yes",
        customCostText: "", customCostTrigger: "",
      },
      edit: { effect: "add_political_power = 25", days: 45 },
      editLanded: /add_political_power = 25/,
    },
    {
      name: "character",
      route: "/api/characters/save",
      payload: {
        modPath: MOD, token: "NUA_character", name: "Nova Character", file: "nua_characters.txt",
        roleLeader: true, leaderIdeology: "conservatism", leaderExpire: "", leaderTraits: "",
        roleAdvisor: false, roleGeneral: false,
      },
      edit: { name: "Nova Character Renamed", leaderTraits: "nationalist" },
      editLanded: /nationalist/,
    },
    {
      name: "spirit",
      route: "/api/ideas/upsert-definition",
      payload: {
        modPath: MOD, ideaId: "nua_spirit", targetRelativeFile: "nua_spirits.txt",
        targetLocalizationPath: "localisation/english/nova_l_english.yml",
        name: "Nova Spirit", desc: "d", picture: "GFX_idea_generic_morale_bonus",
        selectedEffects: ["political_power_gain = 0.1"], mode: "create", category: "country",
        traits: [], cost: "", removalCost: "", ledger: "",
      },
      // A second "create" is not what the editor sends on re-save; it sends edit. Both must be idempotent.
      secondPayloadPatch: { mode: "edit" },
      edit: { mode: "edit", selectedEffects: ["political_power_gain = 0.25", "stability_factor = 0.05"] },
      editLanded: /stability_factor/,
    },
    {
      name: "technology",
      route: "/api/technologies/save",
      payload: {
        modPath: MOD,
        tech: { id: "nua_tech", fileName: "nua_technologies.txt", folder: "infantry_folder", name: "Nova Tech", year: 1936 },
      },
      edit: { tech: { id: "nua_tech", fileName: "nua_technologies.txt", folder: "infantry_folder", name: "Nova Tech II", year: 1939 } },
      editLanded: /1939/,
    },
    {
      name: "equipment archetype",
      route: "/api/equipment/save",
      payload: { modPath: MOD, id: "nua_equipment", statsAll: { build_cost_ic: 4, reliability: 0.8 } },
      edit: { statsAll: { build_cost_ic: 9, reliability: 0.6, armor_value: 12 } },
      editLanded: /armor_value\s*=\s*12/,
      // Equipment/save edits an existing archetype, so seed one first.
      seed: () => fs.writeFileSync(
        path.join(MOD, "common", "units", "equipment", "nua_equipment.txt"),
        "equipments = {\n\tnua_equipment = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\ttype = infantry\n\t\tbuild_cost_ic = 4\n\t\treliability = 0.8\n\t}\n}\n",
        "utf8"
      ),
    },
    {
      name: "military industrial organization",
      route: "/api/mio",
      payload: { modPath: MOD, id: "NUA_company", name: "Nova Company", equipmentType: ["mio_cat_eq_all_medium_tank"] },
      edit: { name: "Nova Company Renamed", equipmentType: ["mio_cat_eq_all_medium_tank", "mio_cat_eq_all_heavy_tank"] },
      editLanded: /heavy_tank/,
    },
  ];

  try {
    for (const m of MAKERS) {
      console.log(`\n[${m.name}] saving the same payload twice`);
      if (m.seed) m.seed();

      const first = await post(m.route, m.payload);
      const okFirst = first.status === 200 && first.body && first.body.ok !== false;
      rec(`the first save succeeded`, okFirst, first.body || first.status);
      if (!okFirst) continue; // a failed create makes the rest meaningless — don't report a vacuous pass

      const before = snapshot();
      rec(`…and it wrote something`, before.size > 2, before.size);

      const second = await post(m.route, { ...m.payload, ...(m.secondPayloadPatch || {}) });
      rec(`the second save succeeded`, second.status === 200 && second.body && second.body.ok !== false,
        second.body || second.status);

      const changed = diff(before, snapshot());
      rec(`the mod is byte-identical after the second save`, changed.length === 0, changed);

      // Phase 2 — the likelier place for drift. The first save writes from scratch; re-saving an UNCHANGED
      // payload merges into Nova's own fresh output. An EDIT merges into content that holds a DIFFERENT value
      // for the same key, which is exactly where append-instead-of-replace shows itself.
      if (!m.edit) continue;
      const editPayload = { ...m.payload, ...m.edit };
      const e1 = await post(m.route, editPayload);
      rec(`the edit saved`, e1.status === 200 && e1.body && e1.body.ok !== false, e1.body || e1.status);
      if (!(e1.status === 200 && e1.body && e1.body.ok !== false)) continue;

      // An edit that silently did nothing would make the idempotence check below trivially true.
      const afterEdit = snapshot();
      const landed = [...afterEdit.entries()].some(([, buf]) => m.editLanded.test(buf.toString("utf8")));
      rec(`…and the edit actually reached disk`, landed, m.editLanded.source);

      const e2 = await post(m.route, editPayload);
      rec(`the edit re-saved`, e2.status === 200 && e2.body && e2.body.ok !== false, e2.body || e2.status);
      const changed2 = diff(afterEdit, snapshot());
      rec(`the mod is byte-identical after re-saving the EDIT`, changed2.length === 0, changed2);

      // And a third, because some drift only appears once the file already carries Nova's merge output twice.
      await post(m.route, editPayload);
      const changed3 = diff(afterEdit, snapshot());
      rec(`…still identical after a third save`, changed3.length === 0, changed3);
    }

    console.log(`\n=== maker idempotence: ${checks} checks, ${fails.length} failed ===`);
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
