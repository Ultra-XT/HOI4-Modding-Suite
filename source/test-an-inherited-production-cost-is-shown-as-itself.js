// ⛔ #equipment-inherited-stat-shown-as-default — THE EDITOR SHOWED A COST THE GAME DOES NOT CHARGE.
//
// `year` and `build_cost_ic` are the two stats the equipment parser invents a value for when a block omits
// them (1936 / 0.5). But a tier that omits them is not using 1936 and 0.5 — it inherits its archetype's,
// exactly as it inherits `picture` and `type`, and server.js has had a resolver for each of those sitting
// three lines away for as long as the defaults have been wrong. Measured over the install and every
// installed mod, counting only blocks whose archetype chain really does declare the key:
//
//     shown a build cost the game does not charge   254   ( 44 vanilla)
//     shown a year the game does not use             37   (  1 vanilla)
//
// `anti_tank_equipment_1` was shown at 0.5 IC where HOI4 charges 4. `convoy_1` was shown at 0.5 against
// 1500 — a 3,000x error, on the screen a modder balances production from. This is the overlay principle
// applied inside a single file: does this show what the GAME will show, or only what the block itself says?
//
// ⚠️ AND THE TRAP THAT MAKES IT INTERESTING. The save rebuilds a stat line from the model, so resolving an
// inherited value INTO the model would write all 254 of them back as explicit overrides — turning
// inheritance into copies, which is worse than showing the wrong number and is exactly what
// #mio-include-shown-as-empty had to be steered around one maker over. `authoredStats` still records that
// the block declared nothing, and the writer is gated on that map ALONE. Section 3 is that guard, and
// section 5 measures it over a real vanilla file.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53563;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqinh-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;
const SUB = path.join("common", "units", "equipment");

const EQ_STATS = ["softAttack", "hardAttack", "defense", "breakthrough", "apAttack", "airAttack", "reliability", "buildCostIc"];
const EQ_RESOURCES = ["steel", "aluminium", "tungsten", "rubber", "oil", "chromium"];
const numOrEmpty = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "" : String(v));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const show = (t) => String(t).slice(0, 300).replace(/\n/g, "|");

// A three-deep chain, a sibling that declares its own cost, and a loner with no archetype at all — so the
// "resolved" answer and the "defaulted" answer are different for every case the resolver has to tell apart.
const FIXTURE = `equipments = {
\tprobe_base = {
\t\tis_archetype = yes
\t\ttype = { infantry }
\t\tbuild_cost_ic = 4
\t\tyear = 1939
\t}
\tprobe_mid = {
\t\tarchetype = probe_base
\t\tsoft_attack = 5
\t}
\tprobe_tip = {
\t\tarchetype = probe_mid
\t\tsoft_attack = 9
\t}
\tprobe_own = {
\t\tarchetype = probe_base
\t\tbuild_cost_ic = 11
\t\tyear = 1944
\t}
\tprobe_loner = {
\t\ttype = { infantry }
\t\tsoft_attack = 1
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const makeMod = (text) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqinh-mod-"));
      made.push(mod);
      const dest = path.join(mod, SUB, "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Eq Inherit"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      return { mod, dest };
    };
    const list = async (mod) => {
      const j = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      return (j.equipment || []).filter((e) => e && e.isMod);
    };
    // Exactly what public/army.js posts, including the authoredStats map only it can build.
    const saveAll = async (mod, dest, override, only) => {
      const mine = (await list(mod)).filter((e) => (only ? only(e) : true));
      const errors = [];
      for (const eq of mine) {
        const body = { modPath: mod, id: eq.id, name: String(eq.name || eq.id), year: numOrEmpty(eq.year) };
        for (const k of EQ_STATS) body[k] = numOrEmpty(eq[k]);
        const res = {};
        for (const r of EQ_RESOURCES) { const v = parseInt((eq.resources || {})[r], 10); if (Number.isFinite(v) && v > 0) res[r] = v; }
        body.resources = res;
        Object.assign(body, (override && override[eq.id]) || {});
        const wasAuthored = (eq.authoredStats && typeof eq.authoredStats === "object") ? eq.authoredStats : {};
        const differs = (sent, loaded) => {
          const v = String(sent === undefined || sent === null ? "" : sent).trim();
          if (v === "") return false;
          const nv = Number(v);
          return Number.isFinite(nv) && loaded !== undefined && loaded !== null && loaded !== ""
            ? nv !== Number(loaded) : v !== String(loaded === undefined || loaded === null ? "" : loaded);
        };
        body.authoredStats = {
          year: !!wasAuthored.year || differs(body.year, eq.year),
          build_cost_ic: !!wasAuthored.build_cost_ic || differs(body.buildCostIc, eq.buildCostIc),
        };
        const r = await fetch(`${BASE}/api/equipment/save`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then((r) => r.json());
        if (!r || r.ok !== true) errors.push(`${eq.id}: ${String((r && r.error) || "?").slice(0, 70)}`);
      }
      return { after: fs.readFileSync(dest, "utf8"), errors, listed: mine };
    };

    console.log("1. The reader answers with what the GAME will use");
    {
      const { mod } = makeMod(FIXTURE);
      const by = new Map((await list(mod)).map((e) => [e.id, e]));
      rec("every fixture equipment is listed", by.size === 5, [...by.keys()].join(","));
      rec("⭐ a tier is shown its archetype's cost", Number((by.get("probe_mid") || {}).buildCostIc) === 4,
        JSON.stringify((by.get("probe_mid") || {}).buildCostIc));
      rec("⭐ …and its archetype's year", Number((by.get("probe_mid") || {}).year) === 1939,
        JSON.stringify((by.get("probe_mid") || {}).year));
      rec("⭐ …through TWO hops, not just one", Number((by.get("probe_tip") || {}).buildCostIc) === 4,
        JSON.stringify((by.get("probe_tip") || {}).buildCostIc));
      // ⚠️ CONTROLS. A resolver that simply overwrote everything with the archetype's value, or that
      // reported a number for a block with nothing to inherit, would pass the three stars above.
      rec("CONTROL: a block that declares its OWN cost keeps it", Number((by.get("probe_own") || {}).buildCostIc) === 11,
        JSON.stringify((by.get("probe_own") || {}).buildCostIc));
      rec("CONTROL: …and its own year", Number((by.get("probe_own") || {}).year) === 1944,
        JSON.stringify((by.get("probe_own") || {}).year));
      rec("CONTROL: with no archetype, the engine default still stands",
        Number((by.get("probe_loner") || {}).buildCostIc) === 0.5 && Number((by.get("probe_loner") || {}).year) === 1936,
        JSON.stringify({ c: (by.get("probe_loner") || {}).buildCostIc, y: (by.get("probe_loner") || {}).year }));
      rec("CONTROL: authoredStats still says the tier declared NEITHER — the writer's only gate",
        JSON.stringify((by.get("probe_mid") || {}).authoredStats) === JSON.stringify({ year: false, build_cost_ic: false }),
        JSON.stringify((by.get("probe_mid") || {}).authoredStats));
      rec("CONTROL: …and that the archetype declared both",
        JSON.stringify((by.get("probe_base") || {}).authoredStats) === JSON.stringify({ year: true, build_cost_ic: true }),
        JSON.stringify((by.get("probe_base") || {}).authoredStats));
    }

    console.log("\n2. …and a cycle in the chain does not hang the endpoint");
    {
      // A mod can write `archetype = ` pointing back at itself, or two blocks at each other. The list must
      // still answer — before the resolver existed there was nothing to loop.
      const { mod } = makeMod(`equipments = {
\tprobe_a = { archetype = probe_b soft_attack = 1 }
\tprobe_b = { archetype = probe_a soft_attack = 2 }
\tprobe_self = { archetype = probe_self soft_attack = 3 }
}
`);
      const by = new Map((await list(mod)).map((e) => [e.id, e]));
      rec("the list still answers", by.size === 3, [...by.keys()].join(","));
      rec("⭐ a cycle falls back to the engine default", Number((by.get("probe_a") || {}).buildCostIc) === 0.5,
        JSON.stringify((by.get("probe_a") || {}).buildCostIc));
      rec("⭐ …including a self-reference", Number((by.get("probe_self") || {}).buildCostIc) === 0.5,
        JSON.stringify((by.get("probe_self") || {}).buildCostIc));
    }

    console.log("\n3. THE TRAP: showing it must not WRITE it");
    {
      const { mod, dest } = makeMod(FIXTURE);
      const { after, errors } = await saveAll(mod, dest);
      rec("every equipment saved", errors.length === 0, errors[0]);
      const block = (id) => (after.match(new RegExp(`${id}\\s*=\\s*\\{[\\s\\S]*?\\n\\t\\}`)) || [""])[0];
      rec("⭐ the tier does not gain its archetype's cost", !/build_cost_ic/.test(block("probe_mid")), show(block("probe_mid")));
      rec("⭐ …nor its year", !/year/.test(block("probe_mid")), show(block("probe_mid")));
      rec("⭐ …and neither does the two-hop tier", !/build_cost_ic|year/.test(block("probe_tip")), show(block("probe_tip")));
      rec("CONTROL: the archetype's own 4 is untouched", /build_cost_ic = 4/.test(block("probe_base")), show(block("probe_base")));
      rec("CONTROL: …and the sibling's own 11", /build_cost_ic = 11/.test(block("probe_own")), show(block("probe_own")));
      rec("CONTROL: the loner gains nothing either", !/build_cost_ic|year/.test(block("probe_loner")), show(block("probe_loner")));
      rec("…and the stats that were declared survive", /soft_attack = 5/.test(after) && /soft_attack = 9/.test(after), show(after));
    }

    console.log("\n4. …while a value the modder TYPES is still written  (the other direction)");
    {
      const { mod, dest } = makeMod(FIXTURE);
      const { after, errors } = await saveAll(mod, dest, { probe_mid: { buildCostIc: "7", year: "1941" } });
      rec("the save was accepted", errors.length === 0, errors[0]);
      const block = (after.match(/probe_mid\s*=\s*\{[\s\S]*?\n\t\}/) || [""])[0];
      rec("⭐ the typed cost is written", /build_cost_ic = 7/.test(block), show(block));
      rec("⭐ …and the typed year", /year = 1941/.test(block), show(block));
    }

    console.log("\n5. Measured on the real corpus");
    {
      // ⚠️ DERIVE the file, and derive it by ASKING. Naming one picked infantry.txt, which has exactly one
      // inheriting tier. Scoring statically picked x_tank_chassis.txt, which looked richest — 69 lines
      // matching `archetype =` — and has NONE: most of those lines are inside variant sub-blocks, and all
      // 48 of its equipment declare their own cost. A static count of a line is not a count of the property.
      //
      // So copy the WHOLE directory in (inheritance crosses files — a tier's archetype often lives in
      // another one), list once, and let the endpoint say which file actually carries the shape.
      const EQ_DIR = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/units/equipment";
      let names = [];
      try { names = fs.readdirSync(EQ_DIR).filter((x) => /\.txt$/i.test(x)); } catch (_) { names = []; }
      if (!names.length) {
        rec("the vanilla equipment folder is installed", false, "cannot verify against the corpus");
      } else {
        const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqinh-corpus-"));
        made.push(mod);
        fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Eq Inherit Corpus"\nsupported_version="1.16.*"\n');
        fs.mkdirSync(path.join(mod, SUB), { recursive: true });
        for (const f of names) fs.copyFileSync(path.join(EQ_DIR, f), path.join(mod, SUB, f));
        const listed = await list(mod);
        const inheriting = listed.filter((e) => e.authoredStats && !e.authoredStats.build_cost_ic && Number(e.buildCostIc) !== 0.5);
        rec("CONTROL: the corpus carries the shape at all", inheriting.length > 0,
          `${inheriting.length} of ${listed.length} inherit a non-default cost: ` + inheriting.slice(0, 3).map((e) => `${e.id}=${e.buildCostIc}`).join(" "));
        // The file with the most of them is the one with the most chances to be wrong.
        const perFile = new Map();
        for (const e of inheriting) perFile.set(e.fileName, (perFile.get(e.fileName) || 0) + 1);
        const pick = [...perFile].sort((a, b) => b[1] - a[1])[0] || ["", 0];
        console.log(`   (corpus file: ${pick[0]} — ${pick[1]} inheriting tiers of ${listed.length} equipment across ${names.length} files)`);
        rec("CONTROL: …concentrated in one file we can round-trip", pick[1] > 1, `${pick[0]} has ${pick[1]}`);
        const dest = path.join(mod, SUB, pick[0]);
        const original = fs.readFileSync(dest, "utf8");
        const count = (t, re) => (t.match(re) || []).length;
        const before = { c: count(original, /(^|\n)\s*build_cost_ic\s*=/g), y: count(original, /(^|\n)\s*year\s*=/g) };
        // ⚠️ ONLY BLOCKS THE FILE ACTUALLY DECLARES. `x_tank_chassis.txt` reports 135 equipment against 48
        // blocks: HOI4's `duplicate_archetypes` makes the ENGINE generate a clone archetype and one tier per
        // source tier, and Nova synthesizes them so the designer can see them. They have no text in the
        // file, so "the file gains no line" is not a claim that can hold for them — saving one has to write
        // a block or persist nothing. Asserting otherwise measures the probe, not the writer.
        const declares = (id) => new RegExp(`(^|\\n)\\s*${id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=\\s*\\{`).test(original);
        const inFile = (e) => String(e.fileName || "").toLowerCase() === String(pick[0]).toLowerCase() && declares(e.id);
        const mine = listed.filter(inFile);
        rec("CONTROL: the declared blocks are a strict subset of what the file reports",
          mine.length > 0 && mine.length < listed.filter((e) => String(e.fileName || "").toLowerCase() === String(pick[0]).toLowerCase()).length,
          `${mine.length} declared of ${listed.filter((e) => String(e.fileName || "").toLowerCase() === String(pick[0]).toLowerCase()).length} reported`);
        const { after, errors } = await saveAll(mod, dest, null, inFile);
        rec("every equipment in it saved", errors.length === 0, `${mine.length} equipment; ${errors[0] || ""}`);
        rec("⭐ a whole-file no-edit save adds not one build_cost_ic line",
          count(after, /(^|\n)\s*build_cost_ic\s*=/g) === before.c,
          `${before.c} -> ${count(after, /(^|\n)\s*build_cost_ic\s*=/g)}`);
        rec("⭐ …and not one year line", count(after, /(^|\n)\s*year\s*=/g) === before.y,
          `${before.y} -> ${count(after, /(^|\n)\s*year\s*=/g)}`);
      }
    }

    console.log(`\n=== an inherited production cost is shown as itself: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
