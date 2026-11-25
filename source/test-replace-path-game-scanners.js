// #replace-path — the /api/game/* key scanners must honour descriptor replace_path.
//
// Companion to test-ideas-catalog-replace-path.js, covering the scanners migrated onto
// getActiveRoots(modRoot, subpath): /api/game/equipment (common/units/equipment),
// /api/game/resources (common/resources) and /api/game/character-slots (common/idea_tags).
//
// Millennium Dawn replace_path's common/units/equipment, so for an MD add-on vanilla's `infantry_equipment`
// does not load in game — offering it in a picker means offering something that does not exist.
//
// Both directions are asserted for every scanner, because dropping vanilla too eagerly empties the picker for
// every mod that does NOT replace_path (the common case):
//   control (no replace_path) -> vanilla keys still offered
//   replace_path              -> vanilla keys gone, the mod's own key kept
//
// Hermetic: fake mods under tmpdir; vanilla is only ever read.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rp-scan-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 200));
  }
}

// Each case: the folder a descriptor can replace, the endpoint that scans it, a key the mod defines, and
// vanilla keys that must disappear once the folder is replaced.
const CASES = [
  {
    name: "equipment",
    folder: "common/units/equipment",
    route: "/api/game/equipment",
    file: "nova_eq.txt",
    body: "equipments = {\n\tnova_test_equipment = {\n\t\tyear = 1936\n\t}\n}\n",
    ownKey: "nova_test_equipment",
    vanillaKeys: ["infantry_equipment", "artillery_equipment"],
  },
  {
    name: "resources",
    folder: "common/resources",
    route: "/api/game/resources",
    file: "nova_res.txt",
    body: "resources = {\n\tnova_test_resource = {\n\t\ticon_frame = 1\n\t}\n}\n",
    ownKey: "nova_test_resource",
    vanillaKeys: ["oil", "steel", "rubber"],
  },
];

function writeMod(dirName, c, { replaces }) {
  const dir = path.join(ROOT, dirName);
  fs.mkdirSync(path.join(dir, ...c.folder.split("/")), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "descriptor.mod"),
    'name="' + dirName + '"\nsupported_version="1.18.*"\n' + (replaces ? 'replace_path="' + c.folder + '"\n' : ""),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, ...c.folder.split("/"), c.file), c.body, "utf8");
  return dir;
}

const PORT = 42133;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const keysFor = async (route, modDir) => {
      const q = encodeURIComponent(modDir);
      const r = await fetch(`http://127.0.0.1:${PORT}${route}?modPath=${q}`);
      const body = await r.json().catch(() => null);
      if (!r.ok || !body) throw new Error(route + " failed: " + r.status);
      const arr = Array.isArray(body) ? body : (body.items || body.keys || []);
      return arr.map((x) => (typeof x === "string" ? x : (x && (x.key || x.id || x.name)) || "")).filter(Boolean);
    };

    for (const c of CASES) {
      console.log("\n[" + c.name + "] " + c.route + "  (" + c.folder + ")");

      // Control FIRST — prove the scanner finds vanilla at all before asserting it hides it.
      const plain = writeMod("plain_" + c.name, c, { replaces: false });
      const ctrl = await keysFor(c.route, plain);
      const ctrlVanilla = c.vanillaKeys.filter((k) => ctrl.includes(k));
      rec("control: the scanner returns keys", ctrl.length > 5, ctrl.length);
      rec("control: vanilla keys ARE offered", ctrlVanilla.length === c.vanillaKeys.length, {
        missing: c.vanillaKeys.filter((k) => !ctrl.includes(k)),
      });
      rec("control: the mod's own key is offered", ctrl.includes(c.ownKey), "absent");

      // Now the same mod, but its descriptor replaces the folder.
      const repl = writeMod("repl_" + c.name, c, { replaces: true });
      const got = await keysFor(c.route, repl);
      const leaked = c.vanillaKeys.filter((k) => got.includes(k));
      rec("replace_path: the mod's own key survives", got.includes(c.ownKey), "absent — vanilla filtering ate the mod");
      rec("replace_path: vanilla keys are NOT offered", leaked.length === 0, { leaked });
      rec("replace_path: the list shrank vs the control", got.length < ctrl.length, { replaced: got.length, control: ctrl.length });
    }

    // ── character slots: common/idea_tags ────────────────────────────────────────────────────────
    console.log("\n[character slots] /api/game/character-slots  (common/idea_tags)");
    const slotCase = {
      folder: "common/idea_tags",
      file: "nova_tags.txt",
      body: "idea_tags = {\n\tnova_slot_test = {\n\t\tcharacter_slot = nova_slot_test\n\t}\n}\n",
    };
    const slotsFor = async (modDir) => {
      const q = encodeURIComponent(modDir);
      const r = await fetch(`http://127.0.0.1:${PORT}/api/game/character-slots?modPath=${q}`);
      const body = await r.json().catch(() => null);
      if (!r.ok || !body) throw new Error("character-slots failed: " + r.status);
      const arr = Array.isArray(body) ? body : (body.slots || body.items || []);
      return arr.map((x) => (typeof x === "string" ? x : (x && (x.slot || x.id || x.key)) || "")).filter(Boolean);
    };
    const plainSlots = await slotsFor(writeMod("plain_slots", slotCase, { replaces: false }));
    rec("control: slots are returned", plainSlots.length > 2, plainSlots.slice(0, 8));
    const VANILLA_SLOTS = ["army_chief", "high_command", "theorist"];
    const ctrlSlots = VANILLA_SLOTS.filter((s) => plainSlots.includes(s));
    rec("control: vanilla slots ARE offered", ctrlSlots.length > 0, plainSlots.slice(0, 10));

    const replSlots = await slotsFor(writeMod("repl_slots", slotCase, { replaces: true }));
    rec("replace_path: the mod's own slot survives", replSlots.includes("nova_slot_test"), replSlots.slice(0, 8));
    rec("replace_path: vanilla slots are NOT offered", VANILLA_SLOTS.every((s) => !replSlots.includes(s)), {
      leaked: VANILLA_SLOTS.filter((s) => replSlots.includes(s)),
    });

    console.log(`\n=== replace_path game scanners: ${checks} checks, ${fails.length} failed ===`);
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
