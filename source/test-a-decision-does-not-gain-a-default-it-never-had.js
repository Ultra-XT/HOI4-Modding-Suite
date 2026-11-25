// ⛔ #no-invented-decision-defaults — A SAVE THAT CHANGED NOTHING ADDED FIVE THINGS THE AUTHOR NEVER WROTE.
//
// The decision writer emitted `icon`, `cost`, `fire_only_once` and the `available` / `complete_effect` blocks
// unconditionally, so opening an existing decision and changing something unrelated grew it by up to five
// entries. Counted over the 23,864 decision blocks in the install and every installed mod:
//
//     no `cost`             7,985   (1,268 vanilla)   -> gained `cost = 0`
//     no `fire_only_once`   9,357   (1,714 vanilla)   -> gained `fire_only_once = no`
//     no `icon`             3,840   (  509 vanilla)   -> gained `icon = GFX_decision_generic_decision`
//     no `available`        3,812   (  390 vanilla)   -> gained an empty `available = { }`
//     no `complete_effect`  6,960   (  938 vanilla)   -> gained an empty `complete_effect = { }`
//
// ⭐ THE RULE WAS ALREADY WRITTEN, IN THIS SAME FUNCTION, FOR `is_good`: "`no` is HOI4's default, so only
// write it when it means something: the user asked for `yes`, or the author had already written the key."
// Five siblings twenty lines away never adopted it — the dominant bug shape on this project, and the reason
// the first place to look for a fix is next door.
//
// ⚠️ ONLY THE "NEVER HAD IT" CASE IS SUPPRESSED. A real cost, a chosen icon, a filled Available box still
// writes the line whether or not the key was on disk; and an author who HAD an icon and clears the box still
// gets the default written, which is the existing behaviour and a different question. Sections 3 and 4 are
// those controls.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53554;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decdef-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const show = (t) => String(t).slice(0, 300).replace(/\n/g, "|");

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // Sends exactly what public/decisions.js sends: its load transforms, then its save reads.
    // `override` stands in for the modder changing a box.
    const roundTrip = async (text, override) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decdef-mod-"));
      made.push(mod);
      const dest = path.join(mod, "common", "decisions", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Dec Def"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/decisions/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const errors = [];
      let seen = 0;
      for (const cat of (list.categories || []).filter((c) => c && c.fileName === "probe.txt")) {
        for (const dec of (cat.decisions || [])) {
          if (!dec || !dec.id || dec.isDraft) continue;
          seen++;
          const isMission = (dec.decisionType || "normal") === "mission";
          const res = await fetch(`${BASE}/api/decisions/save`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modPath: mod, categoryId: cat.id, id: dec.id, fileName: cat.fileName || "",
              categoryIcon: "", previousId: dec.id, previousCategoryId: cat.id,
              name: String(dec.name || dec.id).trim(),
              cost: (dec.cost !== "" && dec.cost != null) ? String(dec.cost) : "0",
              icon: String(dec.icon || "").trim(),
              days: String(dec.days || "0"),
              fireOnce: dec.fireOnce === "yes" ? "yes" : "no",
              available: String(dec.available || "").trim(),
              modifier: String(dec.modifier || "").trim(),
              effect: String(dec.effect || "").trim(),
              decisionType: dec.decisionType || "normal",
              scope: dec.scope || "country",
              cooldown: String(dec.cooldown || "0"),
              targetTrigger: String(dec.targetTrigger || "").trim(),
              removeEffect: String(dec.removeEffect || "").trim(),
              activation: isMission ? String(dec.activation || "").trim() : "",
              cancelTrigger: String(dec.cancelTrigger || "").trim(),
              selectableMission: isMission ? (dec.selectableMission === "yes" ? "yes" : "no") : "",
              cancelEffect: String(dec.cancelEffect || "").trim(),
              targetRootTrigger: String(dec.targetRootTrigger || "").trim(),
              targetArray: String(dec.targetArray || "").trim(),
              aiHintPpCost: String(dec.aiHintPpCost || "").trim(),
              fixedRandomSeed: String(dec.fixedRandomSeed || "").trim(),
              targetNonExisting: String(dec.targetNonExisting || "").trim(),
              targetsDynamic: String(dec.targetsDynamic || "").trim(),
              isGood: isMission ? (dec.isGood === "yes" ? "yes" : "no") : "no",
              visible: String(dec.visible || "").trim(),
              allowed: String(dec.allowed || "").trim(),
              aiWillDo: String(dec.aiWillDo || "").trim(),
              priority: String(dec.priority || "").trim(),
              cancelIfNotVisible: dec.cancelIfNotVisible === "yes" ? "yes" : "",
              customCostText: String(dec.customCostText || "").trim(),
              customCostTrigger: String(dec.customCostTrigger || "").trim(),
              targetedModifier: String(dec.targetedModifier || "").trim(),
              removeTrigger: String(dec.removeTrigger || "").trim(),
              onMapMode: String(dec.onMapMode || "").trim(),
              highlightStates: String(dec.highlightStates || "").trim(),
              ...(override || {}),
            }),
          }).then((r) => r.json());
          if (res && res.error) errors.push(String(res.error).slice(0, 90));
        }
      }
      return { after: fs.readFileSync(dest, "utf8"), errors, seen };
    };

    // A decision as a modder actually writes a small one: no icon, no cost, no fire_only_once, no available.
    const BARE = `my_cat = {
\tmy_decision = {
\t\tcomplete_effect = {
\t\t\tadd_political_power = 10
\t\t}
\t}
}
`;

    console.log("1. A decision that never had them keeps not having them");
    {
      const { after, errors, seen } = await roundTrip(BARE);
      rec("the save was accepted", errors.length === 0 && seen === 1, errors[0] || `${seen} decisions seen`);
      for (const k of ["icon", "cost", "fire_only_once", "available"]) {
        rec(`⭐ no \`${k}\` is invented`, !new RegExp(`(^|\\n)\\s*${k}\\s*=`).test(after), show(after));
      }
      rec("…and the effect it DOES have survives", /add_political_power = 10/.test(after), show(after));
      rec("…and the block is brace-balanced", (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), show(after));
      rec("⭐ …and it round-trips byte-identically",
        after.replace(/\r/g, "").replace(/\s+$/, "") === BARE.replace(/\r/g, "").replace(/\s+$/, ""),
        JSON.stringify(after.slice(0, 160)));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save is stable", twice.replace(/\r/g, "") === after.replace(/\r/g, ""), show(twice));
    }

    console.log("\n2. …and a decision with no complete_effect does not gain an empty one");
    {
      const MODONLY = `my_cat = {
\tmy_decision = {
\t\tmodifier = {
\t\t\tpolitical_power_gain = 0.1
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(MODONLY);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ no empty `complete_effect` is invented", !/complete_effect/.test(after), show(after));
      rec("…and the modifier survives", /political_power_gain = 0\.1/.test(after), show(after));
    }

    console.log("\n3. …but a key the author DID write is kept  (preservation control)");
    for (const [label, line, probe] of [
      ["an explicit cost = 0", "\t\tcost = 0", /(^|\n)\s*cost\s*=\s*0/],
      ["an explicit fire_only_once = no", "\t\tfire_only_once = no", /(^|\n)\s*fire_only_once\s*=\s*no/],
      ["an explicit icon", "\t\ticon = GFX_decision_generic_decision", /(^|\n)\s*icon\s*=\s*GFX_decision_generic_decision/],
      ["a bare-token icon, the dominant idiom", "\t\ticon = generic_prepare_civil_war", /(^|\n)\s*icon\s*=\s*generic_prepare_civil_war/],
      ["an empty available block", "\t\tavailable = {\n\t\t}", /available\s*=\s*\{/],
      ["a cost that is a script variable", "\t\tcost = BUL_faction_interaction_cost_standard", /cost\s*=\s*BUL_faction_interaction_cost_standard/],
    ]) {
      const { after, errors } = await roundTrip(BARE.replace("\t\tcomplete_effect", `${line}\n\t\tcomplete_effect`));
      rec(`${label} was saved without error`, errors.length === 0, errors[0]);
      rec(`…and it survives`, probe.test(after), show(after));
    }

    console.log("\n4. …and a real value still writes the line  (the other direction)");
    for (const [label, override, probe] of [
      ["a cost the modder typed", { cost: "25" }, /(^|\n)\s*cost\s*=\s*25/],
      ["fire_only_once switched on", { fireOnce: "yes" }, /(^|\n)\s*fire_only_once\s*=\s*yes/],
      ["an icon the modder picked", { icon: "GFX_decision_generic_army" }, /(^|\n)\s*icon\s*=\s*GFX_decision_generic_army/],
      ["an Available condition typed in", { available: "has_war = no" }, /available\s*=\s*\{[\s\S]*has_war = no/],
    ]) {
      const { after, errors } = await roundTrip(BARE, override);
      rec(`${label} was saved without error`, errors.length === 0, errors[0]);
      rec(`⭐ …and the line is written`, probe.test(after), show(after));
    }

    console.log("\n5. …and the label on the decision's own line stays on that line");
    {
      // ⛔ #option-trailing-comment-dropped, in this writer too. From inside the braces the note is the first
      // line of the BODY, so it became the lead comment of whichever key came first and was re-emitted on its
      // own line above it — reading as a caption for `icon`. 1,365 decisions across the corpora label
      // themselves this way, 388 in VANILLA, and vanilla's anti_japan_infiltration.txt uses them as ID
      // NUMBERS (`#609`, `#610`, `#611`), which makes "a note about the icon" plainly wrong.
      const HEAD = `my_cat = {
\tmy_decision = { #609
\t\ticon = RNM_RUS
\t\tfire_only_once = yes
\t\tcomplete_effect = {
\t\t\tadd_political_power = 10
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(HEAD);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the label is still on the decision's own line",
        /my_decision[ \t]*=[ \t]*\{[ \t]*#609/.test(after), show(after));
      rec("…and appears exactly once", (after.match(/#609/g) || []).length === 1, show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save is stable", /my_decision[ \t]*=[ \t]*\{[ \t]*#609/.test(twice)
        && (twice.match(/#609/g) || []).length === 1, show(twice));
    }

    console.log("\n6. Measured on a vanilla file that writes decisions this way");
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/decisions/LIT.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's LIT.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      const count = (t, re) => (t.match(re) || []).length;
      const before = {
        icon: count(original, /(^|\n)\s*icon\s*=/g),
        cost: count(original, /(^|\n)\s*cost\s*=/g),
        fire: count(original, /(^|\n)\s*fire_only_once\s*=/g),
      };
      const { after, errors, seen } = await roundTrip(original);
      // ⚠️ Assert the fixture has the property: more decisions than icon lines, or this measures nothing.
      rec("the fixture HAS the property: fewer icon lines than decisions", before.icon < seen,
        `${before.icon} icons, ${seen} decisions`);
      rec("every decision in it saved without error", errors.length === 0, errors[0]);
      rec("⭐ the file gains no icon line it did not have", count(after, /(^|\n)\s*icon\s*=/g) === before.icon,
        `${before.icon} -> ${count(after, /(^|\n)\s*icon\s*=/g)}`);
      rec("⭐ …nor a cost", count(after, /(^|\n)\s*cost\s*=/g) === before.cost,
        `${before.cost} -> ${count(after, /(^|\n)\s*cost\s*=/g)}`);
      rec("⭐ …nor a fire_only_once", count(after, /(^|\n)\s*fire_only_once\s*=/g) === before.fire,
        `${before.fire} -> ${count(after, /(^|\n)\s*fire_only_once\s*=/g)}`);
      // …and nothing was lost to buy it, counted as leaf assignments over the whole file.
      const bag = (t) => {
        const m = new Map();
        const src = t.replace(/#[^\n]*/g, "");
        const re = /([A-Za-z_][A-Za-z0-9_.]*)\s*(=|<|>)\s*("[^"]*"|[^\s{}]+)/g;
        let x;
        while ((x = re.exec(src))) { const k = `${x[1]} ${x[2]} ${x[3]}`; m.set(k, (m.get(k) || 0) + 1); }
        return m;
      };
      const A = bag(original), B = bag(after);
      const lost = [...A].filter(([k, n]) => (B.get(k) || 0) < n).map(([k, n]) => `${k} (${n}->${B.get(k) || 0})`);
      rec("⭐ …and not one leaf assignment is lost", lost.length === 0, lost.slice(0, 4).join(" · "));
    }

    console.log("\n7. …and on the vanilla file that numbers its decisions in comments");
    const IDS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/decisions/anti_japan_infiltration.txt";
    if (!fs.existsSync(IDS)) {
      rec("vanilla's anti_japan_infiltration.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(IDS, "utf8");
      const headLabels = (t) => (t.match(/^\t[A-Za-z_][A-Za-z0-9_.]*[ \t]*=[ \t]*\{[ \t]*#/gm) || []).length;
      rec("the fixture HAS the property: it labels decisions on their own lines",
        headLabels(original) > 5, `${headLabels(original)} labelled decisions`);
      const { after, errors } = await roundTrip(original);
      rec("every decision in it saved without error", errors.length === 0, errors[0]);
      rec("⭐ every label is still on a decision's own line", headLabels(after) === headLabels(original),
        `${headLabels(original)} -> ${headLabels(after)}`);
    }

    console.log(`\n=== a decision does not gain a default it never had: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
