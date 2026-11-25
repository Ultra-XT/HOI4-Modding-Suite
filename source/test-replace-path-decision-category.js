// #replace-path-decision-category — saving a decision into a VANILLA category must still define that category
// when the mod chain replace_path's common/decisions/categories.
//
// ensureDecisionCategoryDefined skips writing a category definition when someone else already defines it.
// That is right only when the other definition actually LOADS. Millennium Dawn replace_path's
// common/decisions/categories, so vanilla's `political_actions` does not exist for an MD add-on — skipping
// there puts the decision in a category the game does not have, and the decision silently never appears.
//
// Both directions, because writing a redundant definition is its own bug (a duplicate category):
//   control (no replace_path) -> Nova writes NO category file; it relies on vanilla's
//   replace_path              -> Nova writes the category definition into the mod
//
// Also covers the asymmetry between the two roots: a DEPENDENCY replacing the path kills vanilla but not the
// dependency's own categories, so an add-on must still inherit the dependency's category without redefining it.
//
// Hermetic: fake mods under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rp-deccat-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220));
  }
}

// A category every vanilla install defines in common/decisions/categories.
const VANILLA_CATEGORY = "political_actions";

function makeMod(dirName, { replaces = false, dependsOn = null, definesCategory = null } = {}) {
  const dir = path.join(ROOT, dirName);
  fs.mkdirSync(path.join(dir, "common", "decisions", "categories"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "descriptor.mod"),
    'name="' + dirName + '"\nsupported_version="1.18.*"\n' +
      (replaces ? 'replace_path="common/decisions/categories"\n' : "") +
      (dependsOn ? "dependencies={\n\t\"" + dependsOn + "\"\n}\n" : ""),
    "utf8"
  );
  if (definesCategory) {
    fs.writeFileSync(
      path.join(dir, "common", "decisions", "categories", "dep_categories.txt"),
      definesCategory + " = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n",
      "utf8"
    );
  }
  return dir;
}

// Every category id this mod defines anywhere under common/decisions/categories.
function categoriesDefinedIn(modDir) {
  const dir = path.join(modDir, "common", "decisions", "categories");
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".txt")) continue;
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of txt.matchAll(/(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g)) out.push(m[1]);
  }
  return out;
}

const PORT = 42135;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const saveDecision = async (modDir, id) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: modDir,
          id,
          name: "Nova Test Decision",
          categoryId: VANILLA_CATEGORY,
          cost: 25,
          days: 30,
        }),
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    };

    // ── control: nobody replaces the path, so vanilla's category is real and must NOT be redefined ──
    console.log("\n[control] no replace_path — vanilla's category is live");
    const plain = makeMod("plain");
    const rc = await saveDecision(plain, "nova_ctrl_decision");
    // Assert the WRITE SUCCEEDED before asserting anything about its effects.
    rec("the decision saved", rc.status === 200 && rc.body && rc.body.success !== false, rc.body || rc.status);
    const ctrlCats = categoriesDefinedIn(plain);
    rec("…and the vanilla category was NOT redefined", !ctrlCats.includes(VANILLA_CATEGORY), ctrlCats);

    // ── the mod itself replaces the path: vanilla's category is dead, so it MUST be defined here ──
    console.log("\n[own replace_path] vanilla's category does not load");
    const own = makeMod("ownrepl", { replaces: true });
    const ro = await saveDecision(own, "nova_own_decision");
    rec("the decision saved", ro.status === 200 && ro.body && ro.body.success !== false, ro.body || ro.status);
    const ownCats = categoriesDefinedIn(own);
    rec("…and the category IS defined in the mod", ownCats.includes(VANILLA_CATEGORY), ownCats);

    // ── a DEPENDENCY replaces the path and defines the category itself ────────────────────────────
    // Vanilla is dead, but the dependency's own definition loads — so the add-on must inherit it, not
    // redefine it. This is the direction an over-eager fix gets wrong.
    console.log("\n[dependency replace_path, dependency defines it] the add-on must inherit, not redefine");
    makeMod("DepBase", { replaces: true, definesCategory: VANILLA_CATEGORY });
    const addon = makeMod("addon", { dependsOn: "DepBase" });
    const ra = await saveDecision(addon, "nova_addon_decision");
    rec("the decision saved", ra.status === 200 && ra.body && ra.body.success !== false, ra.body || ra.status);
    const addonCats = categoriesDefinedIn(addon);
    rec("…the add-on did NOT redefine the dependency's category", !addonCats.includes(VANILLA_CATEGORY), addonCats);

    // ── a DEPENDENCY replaces the path but does NOT define the category ───────────────────────────
    // Nothing anywhere defines it now, so the add-on must write it.
    console.log("\n[dependency replace_path, nobody defines it] the add-on must write it");
    makeMod("DepBare", { replaces: true });
    const addon2 = makeMod("addon2", { dependsOn: "DepBare" });
    const rb = await saveDecision(addon2, "nova_addon2_decision");
    rec("the decision saved", rb.status === 200 && rb.body && rb.body.success !== false, rb.body || rb.status);
    const addon2Cats = categoriesDefinedIn(addon2);
    rec("…and the category IS defined in the add-on", addon2Cats.includes(VANILLA_CATEGORY), addon2Cats);

    console.log(`\n=== replace_path decision categories: ${checks} checks, ${fails.length} failed ===`);
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
