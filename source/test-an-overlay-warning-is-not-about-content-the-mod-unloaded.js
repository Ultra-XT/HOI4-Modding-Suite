// ⛔ #a-validator-must-not-cry-wolf + #replace-path — THE OVERLAY WARNING FIRED FOR CONTENT THE MOD HAD
// UNLOADED.
//
// Saving a character whose token something below already uses warns: "yours REPLACES that character rather
// than adding a second one — and it carries only the fields Nova models, so anything else theirs had is
// gone." Correct, and worth saying — unless the mod declares replace_path = "common/characters", in which
// case the game never loads that copy, nothing is replaced, and the warning is simply false.
//
// inheritedCharacterRootsFor() hand-rolled [...dependencies, gameRoot] and so could not see the ACTIVE
// mod's own replace_path, while /api/characters/list 400 lines below already resolved the very same folder
// through getActiveRoots. The fix existed next door and this caller never adopted it.
//
// Reachable on the corpus, not in theory: Millennium Dawn, Old World Blues and Rise of Nations all declare
// replace_path = "common/characters", so anyone editing one of those directly hit it.
//
// CONTROL FIRST, as this bug class demands. "No warning" is also what a broken check looks like, so every
// silent case here is paired with a mod that differs ONLY in the replace_path line and must still warn.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ovw-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const TOKEN = "OVW_shared_token";

const mk = (name, { deps = [], replacePaths = [], token = null } = {}) => {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "characters"), { recursive: true });
  let d = `version="1"\nname="${name}"\nsupported_version="1.19.*"\n`;
  for (const p of replacePaths) d += `replace_path="${p}"\n`;
  if (deps.length) d += `dependencies={\n${deps.map((x) => `\t"${x}"`).join("\n")}\n}\n`;
  fs.writeFileSync(path.join(dir, "descriptor.mod"), d, "utf8");
  if (token) {
    fs.writeFileSync(path.join(dir, "common", "characters", "base_chars.txt"),
      `characters = {\n\t${token} = {\n\t\tname = "Base Person"\n\t\tcorps_commander = {\n\t\t\tskill = 4\n\t\t}\n\t}\n}\n`, "utf8");
  }
  return dir;
};

const BASE = mk("ovw_base", { token: TOKEN });
const PLAIN = mk("ovw_plain", { deps: ["ovw_base"] });
const REPL = mk("ovw_repl", { deps: ["ovw_base"], replacePaths: ["common/characters"] });
const OTHER = mk("ovw_other", { deps: ["ovw_base"], replacePaths: ["common/ideas"] });

const PORT = 42572;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    // Exactly what public/characters.js collect() sends, minus the fields the server defaults.
    const save = async (mod) => {
      const body = {
        modPath: mod, token: TOKEN, name: "Probe Person", gender: "", file: "probe_characters.txt",
        portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
        portraitNavyLarge: "", portraitNavySmall: "",
        roleLeader: false, leaderIdeology: "", leaderExpire: "", leaderTraits: "",
        roleAdvisor: false, roleGeneral: true, generalType: "corps_commander",
        generalSkill: 3, generalAttack: 1, generalDefense: 1, generalPlanning: 1, generalLogistics: 1,
        generalTraits: "",
      };
      const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      // ⚠️ THE WIRE NAME IS refWarning. The server's local variable is charRefWarning and the drain that
      // shows it to the user is in public/loading-overlay.js — reading the wrong key makes every real
      // warning look like silence, which is exactly the result this test is trying to distinguish.
      if (!r.ok || d.error) throw new Error(`save rejected (${r.status}): ${d.error || "?"}`);
      return String(d.refWarning || "");
    };

    console.log("\n-- CONTROL: the warning is real when the dependency's copy really does load --");
    {
      const w = await save(PLAIN);
      ok(w.includes(TOKEN), "saving over a dependency's character warns", w.slice(0, 160));
      ok(/depends on/i.test(w), "…and says it came from a mod this one depends on", w.slice(0, 160));
    }

    console.log("\n-- CONTROL: replacing a DIFFERENT folder does not change that --");
    {
      const w = await save(OTHER);
      ok(w.includes(TOKEN), "replace_path=\"common/ideas\" leaves the character warning alone", w.slice(0, 160));
    }

    console.log("\n-- ⭐ THE FIX: nothing is overridden when the mod unloaded the folder --");
    {
      const w = await save(REPL);
      ok(w === "", "a mod that replaces common/characters gets no overlay warning", w.slice(0, 240));
    }

    console.log("\n-- and the resolver does not hand-roll the chain again --");
    {
      // The guard that matters: written the obvious way, a future edit reintroduces the whole class
      // silently, because nothing at runtime complains about a warning that is merely wrong.
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const src = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      const at = src.indexOf("function inheritedCharacterRootsFor");
      ok(at !== -1, "the resolver is still called what this test thinks it is");
      if (at !== -1) {
        const body = src.slice(at, at + 600);
        const end = body.indexOf("\n  }");
        const fn = end === -1 ? body : body.slice(0, end);
        ok(fn.includes("getActiveRoots"), "it resolves through getActiveRoots", fn.slice(0, 200));
        ok(fn.includes("common/characters"), "…naming the folder it is about to read", fn.slice(0, 200));
        ok(!fn.includes("resolveDependencyRootsForAssets"), "…and no longer builds its own root chain", fn.slice(0, 200));
      }
    }

    console.log(`\n=== overlay warning is not about unloaded content: ${pass} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
  } catch (e) {
    console.log("THREW " + (e && e.stack ? e.stack : e));
    fails.push("threw");
  } finally {
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    process.exit(fails.length ? 1 : 0);
  }
});
