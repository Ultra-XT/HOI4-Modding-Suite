// #replace-path-ideas — the ideas catalog must honour descriptor replace_path="common/ideas".
//
// `replace_path` means the game does not load VANILLA's copy of that folder AT ALL. Millennium Dawn
// replace_path's common/ideas, so for an MD add-on every vanilla spirit is content the game never sees —
// offering it in a picker is how a modder ends up referencing an idea that does not exist.
//
// The trap here is the OPPOSITE direction: dropping vanilla too eagerly would empty the picker for every mod
// that does NOT replace_path, which is the far more common case. So all three directions are asserted:
//   1. dependency replace_path's it     -> vanilla dropped, mod + dependency ideas kept
//   2. nobody replace_path's it         -> vanilla still offered   (the regression guard)
//   3. the ACTIVE mod replace_path's it -> vanilla dropped
//
// Hermetic: fake mods under tmpdir. No live mod, no real corpus, read-only on vanilla.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rp-ideas-"));
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

// A spirit every vanilla install ships in common/ideas. If the catalog offers these, vanilla was scanned.
const VANILLA_MARKERS = ["great_depression", "civilian_economy", "volunteer_only", "limited_conscription"];

function writeMod(dirName, { descriptor, ideaId }) {
  const dir = path.join(ROOT, dirName);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), descriptor, "utf8");
  if (ideaId) {
    // ⚠️ ONE FILENAME PER MOD. Every mod here used to write `ideas.txt`, which meant the add-on's file sat
    // at the same relative path as its dependency's — and HOI4 replaces a common/ file WHOLESALE at the same
    // relative path, so the dependency's spirit genuinely stopped existing. The catalogue now models that
    // (#catalog-offers-a-replaced-file), so the shared name was quietly asserting the opposite of the rule.
    // This test is about replace_path; the collision was never its subject. Real mods do this too — Nova's
    // own #no-shadow-write guard refuses to write at a dependency's path for exactly this reason.
    fs.writeFileSync(
      path.join(dir, "common", "ideas", dirName + "_ideas.txt"),
      "ideas = {\n\tcountry = {\n\t\t" + ideaId + " = { removal_cost = -1 }\n\t}\n}\n",
      "utf8"
    );
  }
  return dir;
}

// (1) base mod replace_path's common/ideas; the add-on depends on it.
const BASE = writeMod("basemod", {
  descriptor: 'name="BaseMod"\nsupported_version="1.18.*"\nreplace_path="common/ideas"\n',
  ideaId: "base_only_spirit",
});
const ADDON = writeMod("addon", {
  descriptor: 'name="AddOn"\nsupported_version="1.18.*"\ndependencies={\n\t"BaseMod"\n}\n',
  ideaId: "addon_spirit",
});

// (2) control — same shape, nobody replaces anything.
writeMod("basemod2", { descriptor: 'name="BaseMod2"\nsupported_version="1.18.*"\n', ideaId: "base2_spirit" });
const ADDON2 = writeMod("addon2", {
  descriptor: 'name="AddOn2"\nsupported_version="1.18.*"\ndependencies={\n\t"BaseMod2"\n}\n',
  ideaId: "addon2_spirit",
});

// (3) a standalone mod that replace_path's common/ideas itself, with no dependencies at all.
const SOLO = writeMod("solomod", {
  descriptor: 'name="SoloMod"\nsupported_version="1.18.*"\nreplace_path="common/ideas"\n',
  ideaId: "solo_spirit",
});

const PORT = 42131;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const idsFor = async (modDir) => {
      const q = encodeURIComponent(modDir);
      const r = await fetch(
        `http://127.0.0.1:${PORT}/api/ideas/catalog?includeVanilla=1&includeActiveMod=1&sourcePath=${q}&modPath=${q}`
      );
      const body = await r.json().catch(() => null);
      if (!r.ok || !body) throw new Error("catalog request failed: " + r.status);
      return ((body.items) || []).map((i) => i && i.ideaId).filter(Boolean);
    };

    // ── 2 first: the control must still see vanilla. Assert the picker WORKS before asserting it filters. ──
    console.log("\n[control] no replace_path anywhere — vanilla must still be offered");
    const ctrl = await idsFor(ADDON2);
    const ctrlVanilla = VANILLA_MARKERS.filter((v) => ctrl.includes(v));
    rec("the control catalog is non-empty", ctrl.length > 100, ctrl.length);
    rec("…vanilla ideas are still offered", ctrlVanilla.length === VANILLA_MARKERS.length, {
      missing: VANILLA_MARKERS.filter((v) => !ctrl.includes(v)),
    });
    rec("…the mod's own idea is offered", ctrl.includes("addon2_spirit"), "absent");
    rec("…the dependency's idea is offered", ctrl.includes("base2_spirit"), "absent");
    // Fixture guard: the previous check only means what it says while the two mods keep DIFFERENT filenames.
    // Share one and the add-on replaces the dependency's file wholesale, the dependency's spirit correctly
    // disappears, and this test would read that as a regression. #catalog-offers-a-replaced-file
    rec("…and the fixture is measuring replace_path, not a filename collision",
      fs.existsSync(path.join(ROOT, "addon2", "common", "ideas", "addon2_ideas.txt"))
      && fs.existsSync(path.join(ROOT, "basemod2", "common", "ideas", "basemod2_ideas.txt")),
      fs.readdirSync(path.join(ROOT, "addon2", "common", "ideas")));

    // ── 1: a DEPENDENCY replace_path's it (the Millennium Dawn add-on case) ──
    console.log("\n[dependency replace_path] vanilla must be dropped, the chain kept");
    const dep = await idsFor(ADDON);
    const depVanilla = VANILLA_MARKERS.filter((v) => dep.includes(v));
    rec("the mod's own idea survives", dep.includes("addon_spirit"), "absent — vanilla filtering ate the mod itself");
    rec("the dependency's idea survives", dep.includes("base_only_spirit"), "absent — replace_path dropped the wrong root");
    rec("VANILLA ideas are NOT offered", depVanilla.length === 0, { leaked: depVanilla });
    rec("…and the catalog shrank vs the control", dep.length < ctrl.length, { withReplace: dep.length, control: ctrl.length });

    // ── 3: the ACTIVE mod replace_path's it, no dependencies ──
    console.log("\n[own replace_path] a standalone mod replacing common/ideas");
    const solo = await idsFor(SOLO);
    const soloVanilla = VANILLA_MARKERS.filter((v) => solo.includes(v));
    rec("the mod's own idea survives", solo.includes("solo_spirit"), "absent");
    rec("VANILLA ideas are NOT offered", soloVanilla.length === 0, { leaked: soloVanilla });

    console.log(`\n=== replace_path ideas catalog: ${checks} checks, ${fails.length} failed ===`);
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
