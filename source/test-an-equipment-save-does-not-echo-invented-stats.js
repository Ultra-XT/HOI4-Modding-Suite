// ⛔ #no-invented-equipment-stats, the half that was missing — AN ECHO OF WHAT THE READER REPORTED IS NOT AN
// AUTHORED VALUE.
//
// `year` and `build_cost_ic` are the two stats the parser invents a value for when a block omits them (1936
// and 0.5). The save already had a guard for that, and it decided "authored" by asking whether the client
// SENT the field. But the editor fills its Year and Build-cost boxes from the list, and the list hands back
// the parser's invented number — so the client faithfully posts 1936 and 0.5, the guard sees a value, and the
// writer writes it. Counted over the 2,781 equipment blocks in the install and every installed mod:
//
//     no `year`           436   (  1 vanilla)  -> gained `year = 1936`
//     no `build_cost_ic`  319   ( 48 vanilla)  -> gained `build_cost_ic = 0.5`
//
// ⭐ The cost case is a real balance change, and the guard's own comment already describes it: "A weapon that
// inherited its production cost from its archetype came back with an explicit build_cost_ic = 0.5 after any
// save, which is a real balance change nobody asked for." It kept happening, because the fix trusted the
// round trip it says not to trust. An equipment inheriting 0.43 from its archetype is reported as 0.5 and
// was written as 0.5.
//
// ⛔ #equipment-custom-resource-dropped — and a mod that defines its own strategic resources lost them. The
// editor has a field for HOI4's six and sends the full set, because a blank one there means "drop that
// resource" — so anything the mod defines itself was never sent and the whole block was replaced without it.
// 290 equipment across the installed mods cost one: water ×240, metal ×152, energy ×147, circuitry ×99,
// composites ×86, advanced ×69. An entire total-conversion economy, on a save that changed nothing.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53562;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqinv-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;
const SUB = path.join("common", "units", "equipment");

// public/army.js — the editor's own model.
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
const show = (t) => String(t).slice(0, 320).replace(/\n/g, "|");

const FIXTURE = `equipments = {
\tprobe_eq_archetype = {
\t\tis_archetype = yes
\t\ttype = { infantry }
\t\tgroup_by = archetype
\t\tbuild_cost_ic = 0.43
\t\tresources = {
\t\t\tsteel = 2
\t\t\twater = 1
\t\t\tmetal = 3
\t\t}
\t}
\tprobe_eq_1 = {
\t\tarchetype = probe_eq_archetype
\t\tsoft_attack = 3
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // Sends exactly what public/army.js sends: its EQ_STATS loop, its six-resource grid, its statsAll grid.
    // `override` stands in for the modder typing into a box.
    const roundTrip = async (text, override) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqinv-mod-"));
      made.push(mod);
      const dest = path.join(mod, SUB, "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Eq Inv"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const mine = (list.equipment || []).filter((e) => e && e.isMod);
      const errors = [];
      for (const eq of mine) {
        const body = { modPath: mod, id: eq.id, name: String(eq.name || eq.id), year: numOrEmpty(eq.year) };
        for (const k of EQ_STATS) body[k] = numOrEmpty(eq[k]);
        const res = {};
        for (const r of EQ_RESOURCES) { const v = parseInt((eq.resources || {})[r], 10); if (Number.isFinite(v) && v > 0) res[r] = v; }
        body.resources = res;
        // ⚠️ The generic grid SKIPS the eight stats the main grid already owns (army.js `managedSnake`), so
        // the same value is never sent twice. Sending it in both made statsAll win over the box and my
        // "the modder typed 7" case silently kept the file's 3 — a probe fault, not Nova's.
        const MANAGED_SNAKE = new Set(["soft_attack", "hard_attack", "defense", "breakthrough", "ap_attack", "air_attack", "reliability", "build_cost_ic"]);
        const sa = {};
        for (const [k, v] of Object.entries(eq.statsAll || {})) {
          if (MANAGED_SNAKE.has(k)) continue;
          const n = Number(v);
          if (Number.isFinite(n)) sa[k] = n;
        }
        if (Object.keys(sa).length) body.statsAll = sa;
        Object.assign(body, (override && override[eq.id]) || {});
        // ⚠️ THE HALF THE SERVER CANNOT DO. An echoed 0.5 and a typed 0.5 are the same bytes, so the endpoint
        // treats any explicit value as authored — `test-equipment-at-variable-stats.js` pins that, and for an
        // API caller it is right. Only the CLIENT knows which it is, so `public/army.js` declares it, and this
        // probe mirrors that exactly: authored if the file already said so, or if what we send differs from
        // what the list gave us. Built AFTER the override, because the override IS the typed edit.
        // #equipment-echoed-default
        const wasAuthored = (eq.authoredStats && typeof eq.authoredStats === "object") ? eq.authoredStats : {};
        const differs = (sentVal, loadedVal) => {
          const v = String(sentVal === undefined || sentVal === null ? "" : sentVal).trim();
          if (v === "") return false;
          const n = Number(v);
          return Number.isFinite(n) && loadedVal !== undefined && loadedVal !== null && loadedVal !== ""
            ? n !== Number(loadedVal) : v !== String(loadedVal === undefined || loadedVal === null ? "" : loadedVal);
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

    console.log("1. A save that changes nothing invents no year and no build cost");
    {
      const { after, errors, listed } = await roundTrip(FIXTURE);
      rec("every equipment saved", errors.length === 0, errors[0]);
      // ⚠️ CONTROL: the reader really does hand back the invented values — that is what makes the echo happen
      // and what makes this test non-vacuous.
      const one = listed.find((e) => e.id === "probe_eq_1") || {};
      rec("CONTROL: the reader reports the parser's invented year", one.year === 1936, JSON.stringify(one.year));
      // ⚠️ This control used to assert the reader reports 0.5 here, "not the inherited 0.43" — it was
      // describing the reader's own defect back to itself. #equipment-inherited-stat-shown-as-default fixed
      // that, so the echo the writer must ignore is now the archetype's REAL 0.43. The property this test
      // needs is unchanged and is the one that matters: whatever the reader hands back, posting it verbatim
      // must not turn an inherited cost into a declared one.
      rec("CONTROL: the reader hands back the INHERITED cost, which is what gets echoed",
        Number(one.buildCostIc) === 0.43, JSON.stringify(one.buildCostIc));
      rec("⭐ no `year` is written", !/(^|\n)\s*year\s*=/.test(after), show(after));
      rec("⭐ no `build_cost_ic` is invented on the tier that inherits one",
        !/probe_eq_1[\s\S]*?build_cost_ic/.test(after), show(after));
      rec("…and the archetype's own 0.43 is untouched", /build_cost_ic = 0\.43/.test(after), show(after));
      rec("…and its soft_attack survives", /soft_attack = 3/.test(after), show(after));
    }

    console.log("\n2. …and a resource the editor has no field for is not treated as cleared");
    {
      const { after, errors } = await roundTrip(FIXTURE);
      rec("every equipment saved", errors.length === 0, errors[0]);
      rec("⭐ the mod's own `water` survives", /water = 1/.test(after), show(after));
      rec("⭐ …and `metal`", /metal = 3/.test(after), show(after));
      rec("…and the vanilla `steel` beside them", /steel = 2/.test(after), show(after));
    }

    console.log("\n3. …but a value the modder actually CHANGED is written  (the other direction)");
    for (const [label, over, probe] of [
      ["a year they typed", { probe_eq_1: { year: "1942" } }, /(^|\n)\s*year = 1942/],
      ["a build cost they typed", { probe_eq_1: { buildCostIc: "0.9" } }, /build_cost_ic = 0\.9/],
      ["a soft attack they typed", { probe_eq_1: { softAttack: "7" } }, /soft_attack = 7/],
      ["a steel cost they typed", { probe_eq_archetype: { resources: { steel: 5 } } }, /steel = 5/],
    ]) {
      const { after, errors } = await roundTrip(FIXTURE, over);
      rec(`${label} saved without error`, errors.length === 0, errors[0]);
      rec(`⭐ …and it is written`, probe.test(after), show(after));
    }

    console.log("\n4. …and clearing one of the SIX still drops it  (over-correction control)");
    {
      // ⚠️ The six the editor models keep "blank means drop" — the fix must not turn the resource grid into
      // something that can only ever add. Only a key the model cannot represent is protected.
      const { after, errors } = await roundTrip(FIXTURE, { probe_eq_archetype: { resources: {} } });
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the cleared `steel` is gone", !/steel\s*=/.test(after), show(after));
      rec("…while the unmodelled `water` and `metal` remain",
        /water = 1/.test(after) && /metal = 3/.test(after), show(after));
    }

    console.log("\n5. Measured on a vanilla file");
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/units/equipment/support.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's support.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      const count = (t, re) => (t.match(re) || []).length;
      const before = { y: count(original, /(^|\n)\s*year\s*=/g), c: count(original, /(^|\n)\s*build_cost_ic\s*=/g) };
      const { after, errors, listed } = await roundTrip(original);
      // ⚠️ Against the EQUIPMENT COUNT, not against zero. support.txt declares two and gives one of them a
      // build cost — the property is "fewer of these lines than equipment", and comparing to 0 asserted
      // something the file does not claim.
      rec("CONTROL: the fixture has the property — at least one equipment omits a build cost",
        before.c < listed.length, `${before.c} build_cost_ic lines, ${listed.length} equipment`);
      rec("every equipment in it saved", errors.length === 0, errors[0]);
      rec("⭐ it gains no year line", count(after, /(^|\n)\s*year\s*=/g) === before.y, `${before.y} -> ${count(after, /(^|\n)\s*year\s*=/g)}`);
      rec("⭐ …nor a build_cost_ic", count(after, /(^|\n)\s*build_cost_ic\s*=/g) === before.c,
        `${before.c} -> ${count(after, /(^|\n)\s*build_cost_ic\s*=/g)}`);
      // …and nothing was lost to buy it.
      const bag = (t) => {
        const m = new Map();
        const src = t.replace(/#[^\n]*/g, "");
        const re = /([A-Za-z_][A-Za-z0-9_.]*)\s*(=|<|>)\s*("[^"]*"|[^\s{}]+)/g;
        let x;
        while ((x = re.exec(src))) { const k = `${x[1]} ${x[2]} ${/^-?\d+(?:\.\d+)?$/.test(x[3]) ? Number(x[3]) : x[3]}`; m.set(k, (m.get(k) || 0) + 1); }
        return m;
      };
      const A = bag(original), B = bag(after);
      const lost = [...A].filter(([k, n]) => (B.get(k) || 0) < n).map(([k, n]) => `${k} (${n}->${B.get(k) || 0})`);
      rec("⭐ …and not one leaf assignment is lost", lost.length === 0, lost.slice(0, 4).join(" · "));
    }

    console.log("\n6. The SHIPPED editor sends the map  (without this, sections 1 and 5 test nobody)");
    {
      // ⚠️ Everything above posts what the editor posts, including a guard only the client can carry. If
      // `public/army.js` ever stops carrying it, every ⭐ above still passes while the real editor writes
      // 0.5 onto 319 weapons — a probe that mirrors a client which no longer exists. So check the source.
      const { stripJsComments } = require("./testlib-strip-comments.js");
      const src = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));
      const i = src.indexOf("async function saveEquip(");
      rec("saveEquip exists in public/army.js", i > 0, `indexOf -> ${i}`);
      const fn = src.slice(i, i + 4000);
      rec("⭐ it sends `authoredStats`", /body\.authoredStats\s*=/.test(fn), fn.slice(0, 120));
      rec("⭐ …built from what the LIST reported, not from the boxes alone",
        /authoredStats/.test(fn) && /S\.equip\.all/.test(fn), "no S.equip.all lookup in saveEquip");
      rec("⭐ …covering both stats the parser invents", /\byear\s*:/.test(fn) && /\bbuild_cost_ic\s*:/.test(fn), fn.slice(0, 200));
      // ⚠️ CONTROL: the stripper really did strip THIS file. saveEquip's own prose says "authoredStats" and
      // "build_cost_ic", so an inert stripper would pass all three ⭐ above on comments alone — which is
      // exactly what happened while testlib-strip-comments mis-scanned army.js:1610's nested template and
      // returned the file unchanged from there on. Pick a phrase that appears ONLY in the prose.
      rec("CONTROL: comments were stripped out of army.js",
        !/the two stats the PARSER invents a display value for/.test(src), "prose survived the strip");
      rec("CONTROL: …and that phrase really is in the file",
        /the two stats the PARSER invents a display value for/.test(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8")),
        "the control phrase is gone — update it");
    }

    console.log(`\n=== an equipment save does not echo invented stats: ${checks} checks, ${fails.length} failed ===`);
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
