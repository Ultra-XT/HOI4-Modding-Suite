// #advisor-slot-hardcoded — the Characters maker's advisor Slot dropdown listed the BASE GAME's six slots
// regardless of the active mod, so on Millennium Dawn its own default was a slot the mod does not define.
//
// The <select> was static markup: political_advisor, army_chief, navy_chief, air_chief, high_command,
// theorist — vanilla's set, taken from common/idea_tags/00_idea.txt. Nothing in Nova read common/idea_tags at
// all, so the list was never reconciled with the mod, and both the client and the server default to
// political_advisor.
//
// Millennium Dawn ships its own common/idea_tags/00_idea.txt. Same basename, so HOI4 REPLACES vanilla's, and
// MD declares exactly four character_slots: army_chief, navy_chief, air_chief, high_command. political_advisor
// and theorist do not exist there — so the dropdown's default wrote the advisor into a slot the mod has no
// category for.
//
// Same basename-override rule as the ideology scan (#ideology-picker-ignores-override), and the same care
// about the other direction: a mod with no idea_tags file of its own must still get the base game's six,
// never an empty dropdown.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-advslot-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mk = (name, files) => {
  const M = path.join(ROOT, name);
  fs.mkdirSync(path.join(M, "common", "idea_tags"), { recursive: true });
  fs.writeFileSync(path.join(M, "descriptor.mod"), `name="${name}"\nsupported_version="1.18.*"\n`);
  Object.entries(files || {}).forEach(([f, body]) => fs.writeFileSync(path.join(M, "common", "idea_tags", f), body, "utf8"));
  return M;
};
const CAT = (slots) => "idea_categories = {\n" + slots.map((s, i) =>
  `\tcat_${i} = {\n\t\tcharacter_slot = ${s}\n\t\tcost = 150\n\t}\n`).join("") + "}\n";

// replaces vanilla's file by basename, declaring MD's four
const OVERRIDE = mk("overrider", { "00_idea.txt": CAT(["army_chief", "navy_chief", "air_chief", "high_command"]) });
const PLAIN = mk("plain", {});                                       // no idea_tags file at all
const EXTRA = mk("extra", { "zz_nova_idea.txt": CAT(["nova_envoy"]) }); // a NEW basename — adds

const PORT = 40003, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (mod) => fetch(`http://127.0.0.1:${PORT}/api/game/character-slots?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  try {
    // ── the override case ────────────────────────────────────────────────────────────────────────
    const over = await get(OVERRIDE);
    ok("the endpoint answers", over && over.ok, over);
    ok("…with the mod's own four slots", ["army_chief", "navy_chief", "air_chief", "high_command"].every((s) => over.slots.includes(s)), over.slots);
    ok("…and only those", over.slots.length === 4, over.slots);
    ok("…so political_advisor is NOT offered", !over.slots.includes("political_advisor"), over.slots);
    ok("…nor theorist", !over.slots.includes("theorist"), over.slots);
    ok("…and it is not reported as a fallback", over.fallback === false, over);

    // ── a mod with no idea_tags file must still get a usable list ────────────────────────────────
    const plain = await get(PLAIN);
    ok("a mod with no idea_tags file still gets slots", plain.slots.length > 0, plain);
    ok("…including political_advisor", plain.slots.includes("political_advisor"), plain.slots);
    ok("…and theorist", plain.slots.includes("theorist"), plain.slots);

    // ── a differently-named file adds ────────────────────────────────────────────────────────────
    const extra = await get(EXTRA);
    ok("a NEW basename adds its slot", extra.slots.includes("nova_envoy"), extra.slots);
    ok("…without dropping the base game's", extra.slots.includes("political_advisor"), extra.slots);

    // ── the real corpus, read-only ───────────────────────────────────────────────────────────────
    // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn, and the fresh copy's 00_idea.txt declares a
    // fifth slot — `political_advisor`, on a new `intelligence_staff` category — so "political_advisor is not
    // among them" failed on every commit while the override rule it guards still held. The expectation is now
    // READ OUT OF THE TWO FILES rather than typed: exactly the slots MD's own file declares, and none of the
    // ones only vanilla's file declares, which are the slots the same-basename replacement hides.
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    const MD_TAGS = path.join(MD, "common", "idea_tags", "00_idea.txt");
    const VANILLA_TAGS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/idea_tags/00_idea.txt";
    const slotsIn = (file) => [...new Set([...fs.readFileSync(file, "utf8").replace(/#[^\n]*/g, "")
      .matchAll(/\bcharacter_slot\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
    if (fs.existsSync(MD_TAGS) && fs.existsSync(VANILLA_TAGS)) {
      const mdOwn = slotsIn(MD_TAGS);
      const vanillaOnly = slotsIn(VANILLA_TAGS).filter((s) => !mdOwn.includes(s));
      console.log(`  ..  MD's file declares ${mdOwn.join(", ")}; only vanilla's declares ${vanillaOnly.join(", ") || "(nothing)"}`);
      const md = await get(MD);
      ok("Millennium Dawn's real slots are read", md.slots.length > 0, md.slots);
      ok(`…exactly the ${mdOwn.length} its own 00_idea.txt declares`,
        mdOwn.every((s) => md.slots.includes(s)) && md.slots.length === mdOwn.length, { got: md.slots, want: mdOwn });
      if (vanillaOnly.length) {
        ok(`…and none of the vanilla slots its file replaces (${vanillaOnly.join(", ")})`,
          !vanillaOnly.some((s) => md.slots.includes(s)), md.slots);
      } else {
        console.log("  --  MD's file now declares every vanilla slot; the replaced-slot half of the corpus check cannot run");
      }
    } else { console.log("  --  MD or vanilla not present; skipping the corpus check"); }

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a character-slot scan", /function scanCharacterSlots\(modRoot = null\)/.test(src), "missing");
    ok("…applying the basename-override rule", /const byBase = new Map\(\);[\s\S]{0,400}?common", "idea_tags"/.test(src) || /idea_tags[\s\S]{0,400}?byBase\.set/.test(src), "no override resolution");
    ok("…and it explains why", /#advisor-slot-hardcoded/.test(src), "no marker comment");

    const cli = fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8");
    ok("the client loads the slots at startup", /await loadAdvisorSlots\(\);/.test(cli), "not wired into init");
    ok("…rebuilding the dropdown from them", /sel\.innerHTML = slots\.map/.test(cli), "dropdown not rebuilt");
    ok("…keeping the user's selection when the mod still has it", /slots\.includes\(previous\) \? previous : slots\[0\]/.test(cli), "selection not preserved");
    ok("…and never blanking the control on failure", /if \(!slots\) return;/.test(cli), "could render an empty dropdown");
    ok("the cache version was bumped",
      // At least, not exactly — an exact pin turns every future bump of this file into a false failure.
      // The NUMBER is what carries the meaning, not the word before it: the label is renamed whenever the
      // reason for the bump changes (it is `portraitfield32` now), and pinning `advtok` failed a test about
      // advisor slots for a portrait fix. Same slip as test-research-year-objects-honesty.
      (() => { const m = /characters\.js\?v=[a-z]+(\d+)/i.exec(fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8")); return !!m && Number(m[1]) >= 29; })(), "stale cache version");

    console.log("\ntest-advisor-slot-from-mod: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 18 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
