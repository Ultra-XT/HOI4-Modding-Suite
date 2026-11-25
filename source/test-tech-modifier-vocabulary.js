// #tech-modifier-crywolf — THE MODIFIER CHECK CALLED THE GAME'S OWN MODIFIERS INVENTED.
//
// The first version of this check treated data/hoi4-spec.json's 812 STATIC country modifiers as the whole
// vocabulary, and warned that anything else "makes HOI4 drop the whole technology". Measured against the
// corpora AFTERWARDS — which is the measurement that should have come first — that rule flags:
//
//   vanilla            62 occurrences, 11 distinct names   (xp_research_bonus, xp_boost_cost,
//                                                           local_resources_coal_factor, …)
//   Millennium Dawn   596 occurrences, 32 distinct names
//
// on those mods' OWN technologies. A warning that fires 596 times on working content is worse than no
// warning: it teaches the modder to ignore it.
//
// Two things a static list can never hold:
//   · DYNAMIC modifiers a mod declares for itself in common/modifiers — Millennium Dawn lives on these.
//   · Families generated per game object: production_speed_<building>_factor, one per building (55 in
//     vanilla). Vanilla spends those in IDEAS rather than technologies, so harvesting tech usage alone
//     still left four of them looking invented.
//
// The vocabulary is now the spec PLUS what the base game and the mod's dependencies actually use, PLUS what
// the mod itself DECLARES. Harvested from the other roots, never from the mod's own technology usage —
// reading the vocabulary off the thing under test would make the rule agree with any spelling shown twice.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modvocab-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-modvocab-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let seq = 0;
function mkMod(extra) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="m${seq}"\nsupported_version="1.19.*"\n`, "utf8");
  if (extra) extra(dir);
  return dir;
}
let PORT = 45400;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const mk = (id, modifiers) => ({ id, isMod: true, fileName: "t.txt", x: 1, y: 1, folder: "infantry_folder",
  researchCost: 1, startYear: 1936, prerequisites: [], subTechnologies: [], categories: ["infantry_tech"], modifiers });
const warnOf = (r) => { const w = String((r.b && r.b.refWarning) || ""); return /modifier/i.test(w) ? w : ""; };

// Every depth-0 `key = number` a root uses inside its OWN technology blocks — the names the rule must accept.
function usedInTechs(root) {
  const out = new Set();
  const dir = path.join(root, "common", "technologies");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { return out; }
  const TECHKEYS = new Set(["research_cost", "start_year", "priority", "cost", "doctrine", "visual_level",
    "year", "is_archetype", "is_buildable", "archetype", "show_effect_as_desc", "is_special_project_tech"]);
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    let depth = 0;
    for (const raw of t.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      const o = (line.match(/\{/g) || []).length, c = (line.match(/\}/g) || []).length;
      const atTechTop = depth === 2;
      depth += o - c;
      if (!atTechTop || !line) continue;
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*-?\d+(?:\.\d+)?$/.exec(line);
      if (m && !TECHKEYS.has(m[1])) out.add(m[1]);
    }
  }
  return out;
}

(async () => {
  let api = null;
  try {
    const haveGame = fs.existsSync(path.join(V, "common", "technologies"));
    console.log("\n[ground truth] names the game uses that the static spec list does not contain");
    let real = [];
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else {
      const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "hoi4-spec.json"), "utf8"));
      const list = spec.modifiers || [];
      const known = new Set((Array.isArray(list) ? list : Object.keys(list))
        .map((m) => (m && (m.name || m.id)) || m).filter((x) => typeof x === "string"));
      rec("the spec carries hundreds of static modifiers", known.size > 500, known.size);
      real = [...usedInTechs(V)].filter((n) => !known.has(n));
      rec("…and vanilla's own technologies use names it does not contain", real.length >= 8,
        { count: real.length, sample: real.slice(0, 6) });
      // The building family, which vanilla spends in IDEAS — so tech-usage harvesting alone misses it.
      const bmods = ["production_speed_industrial_complex_factor", "production_speed_infrastructure_factor",
        "production_speed_arms_factory_factor", "production_speed_dockyard_factor"];
      const usedAnywhere = bmods.filter((b) => {
        try { return fs.readdirSync(path.join(V, "common", "ideas")).some((f) =>
          f.endsWith(".txt") && fs.readFileSync(path.join(V, "common", "ideas", f), "utf8").includes(b)); } catch (_) { return false; }
      });
      rec("…and a per-building family the game spends elsewhere", usedAnywhere.length === 4, usedAnywhere);
      real = [...new Set([...real, ...bmods])];
    }

    api = await serve(createApp());

    console.log("\n[no cry-wolf] not one of them is called invented");
    if (haveGame) {
      const mod = mkMod();
      const flagged = [];
      for (const n of real) {
        const r = await api.post("/api/technologies/save", { modPath: mod, tech: mk("nua_" + n.slice(0, 24), `${n} = 0.05`), allTechs: [] });
        if (warnOf(r).includes(n)) flagged.push(n);
      }
      rec(`${real.length} names the game itself uses, flagged: ${flagged.length}`, flagged.length === 0, flagged.slice(0, 8));
    }

    console.log("\n[still catches the real thing] a name nothing defines");
    {
      const mod = mkMod();
      const r = await api.post("/api/technologies/save", { modPath: mod, tech: mk("nua_bogus", "communications_relay_bonus = 0.01"), allTechs: [] });
      const w = warnOf(r);
      rec("an invented modifier is still named", /communications_relay_bonus/.test(w), w || "(no warning)");
      rec("…and the tech is written anyway", r.s === 200 && r.b.ok, r.b);
    }

    console.log("\n[dynamic modifiers] a mod may declare its own, and they must be accepted");
    {
      const mod = mkMod((dir) => {
        fs.mkdirSync(path.join(dir, "common", "modifiers"), { recursive: true });
        fs.writeFileSync(path.join(dir, "common", "modifiers", "nova.txt"),
          "nua_my_own_modifier = {\n\ticon = generic\n\tcolor_type = good\n}\n", "utf8");
      });
      const r = await api.post("/api/technologies/save", { modPath: mod, tech: mk("nua_dyn", "nua_my_own_modifier = 0.1"), allTechs: [] });
      rec("a modifier the mod declares in common/modifiers is accepted", !warnOf(r).includes("nua_my_own_modifier"), warnOf(r));
      const r2 = await api.post("/api/technologies/save", { modPath: mod, tech: mk("nua_dyn2", "nua_never_declared = 0.1"), allTechs: [] });
      rec("…while an undeclared one beside it is still flagged", warnOf(r2).includes("nua_never_declared"), warnOf(r2));
    }

    console.log("\n[not self-taught] the mod's OWN technology usage must not become the vocabulary");
    {
      // Spelling a name twice in your own mod must not make it valid — otherwise the rule agrees with any
      // typo it is shown a second time, which is the failure mode that makes a validator useless.
      const mod = mkMod();
      await api.post("/api/technologies/save", { modPath: mod, tech: mk("nua_first", "nua_typo_modifier = 0.1"), allTechs: [] });
      const r = await api.post("/api/technologies/save", { modPath: mod, tech: mk("nua_second", "nua_typo_modifier = 0.2"), allTechs: [] });
      rec("a name used only by the mod's own techs is still flagged the second time",
        warnOf(r).includes("nua_typo_modifier"), warnOf(r) || "(no warning — the rule taught itself)");
    }
    api.stop(); api = null;

    console.log("\n[back-out] go back to the spec list alone");
    if (haveGame) {
      const built = controlApp("specOnly", [[
        "    const out = new Set(specOnlyModifiers());",
        "    const out = new Set(specOnlyModifiers()); if (out.size) return out;"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod();
        try {
          const flagged = [];
          for (const n of real.slice(0, 12)) {
            const r = await capi.post("/api/technologies/save", { modPath: cmod, tech: mk("nua_c" + n.slice(0, 22), `${n} = 0.05`), allTechs: [] });
            if (warnOf(r).includes(n)) flagged.push(n);
          }
          rec("…and the game's own modifiers are called invented again", flagged.length >= 8,
            { flagged: flagged.length, of: Math.min(12, real.length) });
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== tech modifier vocabulary: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
