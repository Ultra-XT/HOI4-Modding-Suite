// #upgrade-stat-vocabulary — AN INVENTED STAT NAME IS A PARSE ERROR, NOT AN IGNORED LINE.
//
// From HOI4's own error.log during the play-test, 36 times:
//   persistent.cpp: Error: "Unexpected token: ok_stat, near line: 25" in file:
//   "common/units/equipment/upgrades/nuaA_upgrades.txt" near line: 25
//
// The equipment-upgrade editor takes the stat name as free text — the datalist beside the box only suggests —
// and the endpoint accepted anything shaped like an identifier. HOI4's parser does not skip a name it doesn't
// recognise; it stops on it and names the file.
//
// The guard is a WARNING with a vocabulary that was MEASURED before it shipped, because the last validator
// added to this codebase cried wolf on 62 vanilla and 596 MD occurrences. An upgrade improves a stat, and the
// stat namespace is the one shared by equipment (common/units/equipment) and SUB-UNITS (common/units/*.txt) —
// MD's upgrades reach for `default_morale`, which no equipment declares and every sub-unit does. Harvested
// from vanilla that is ~232 names; this test re-measures the false-positive rate against both corpora on
// every run rather than trusting the number I wrote down.
//
// It warns rather than refuses, matching the sibling unknown-tag guard: writing the upgrade before the
// sub-unit that gives its stat meaning is a plausible order of work. The mod's own roots are harvested too,
// so a mod defining its own sub-unit stats is never told they are wrong.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upgstat-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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
const ARMY = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");

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
  const p = path.join(__dirname, `.ctl-upgstat-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";

function walkTxt(dir, out = []) {
  let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const f of e) { const p = path.join(dir, f.name); if (f.isDirectory()) walkTxt(p, out); else if (f.name.toLowerCase().endsWith(".txt")) out.push(p); }
  return out;
}
function matchBrace(t, i) { let d = 0; for (let k = i; k < t.length; k++) { if (t[k] === "{") d++; else if (t[k] === "}") { d--; if (!d) return k; } } return -1; }
// Every stat name a corpus actually uses inside an upgrade definition, with a use count.
function upgradeStatUses(root) {
  const keys = new Map();
  for (const f of walkTxt(path.join(root, "common", "units", "equipment", "upgrades"))) {
    let t = ""; try { t = fs.readFileSync(f, "utf8").replace(/#.*$/gm, ""); } catch (_) { continue; }
    const re = /(?:^|\n)\s*upgrades\s*=\s*\{/gi; let m;
    while ((m = re.exec(t)) !== null) {
      const o = t.indexOf("{", m.index), c = matchBrace(t, o); if (c === -1) break;
      const inner = t.slice(o + 1, c);
      const idRe = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g; let im;
      while ((im = idRe.exec(inner)) !== null) {
        const io = inner.indexOf("{", im.index), ic = matchBrace(inner, io); if (ic === -1) break;
        for (const km of inner.slice(io + 1, ic).matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?[\d.]+)\s/g)) keys.set(km[1], (keys.get(km[1]) || 0) + 1);
        idRe.lastIndex = ic + 1;
      }
      re.lastIndex = c + 1;
    }
  }
  return keys;
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}

let PORT = 46200;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    const mod = mkMod("m");
    api = await serve(createApp());
    const save = (id, stats, extra) => api.post("/api/equipment/upgrade",
      Object.assign({ modPath: mod, id, cost: "land", max_level: 3, stats }, extra || {}));

    console.log("\n[the invented name] is caught");
    const bad = await save("nua_bad", { ok_stat: -2 });
    rec("the save still succeeds — this warns, it does not refuse", bad.s === 200 && bad.b.ok === true, bad.b);
    rec("…and names the stat HOI4 will stop on", /"ok_stat"/.test(bad.b.statWarning || ""), bad.b.statWarning);
    rec("…listing it in a field the client can act on",
      Array.isArray(bad.b.unknownStats) && bad.b.unknownStats.join() === "ok_stat", bad.b.unknownStats);
    rec("…saying the parser STOPS rather than ignores the line",
      /stops on a name it doesn't recognise/.test(bad.b.statWarning || ""), bad.b.statWarning);
    rec("…quoting the token exactly as HOI4 reports it",
      /Unexpected token: ok_stat/.test(bad.b.statWarning || ""), bad.b.statWarning);
    rec("…and pointing at the file it lands in",
      /nova_custom_upgrades\.txt/.test(bad.b.statWarning || ""), bad.b.statWarning);
    rec("…and it does not claim the game will crash",
      !/crash/i.test(bad.b.statWarning || ""), bad.b.statWarning);

    console.log("\n[real stats] pass, including the one only sub-units declare");
    const ok1 = await save("nua_ok1", { armor_value: 1, reliability: 0.05 });
    rec("an equipment stat is accepted silently", ok1.b.ok && !ok1.b.statWarning, ok1.b.statWarning);
    const ok2 = await save("nua_ok2", { default_morale: 0.2 });
    rec("…and default_morale, which no equipment declares but every sub-unit does",
      ok2.b.ok && !ok2.b.statWarning, ok2.b.statWarning);
    const ok3 = await save("nua_ok3", { maximum_speed: 0.1, build_cost_ic: -0.05, soft_attack: 0.1 });
    rec("…and a mixed handful", ok3.b.ok && !ok3.b.statWarning, ok3.b.statWarning);
    rec("several unknowns are reported together, not one at a time",
      (await save("nua_bad2", { ok_stat: 1, nope_stat: 2, armor_value: 1 })).b.unknownStats.sort().join() === "nope_stat,ok_stat",
      "not batched");

    console.log("\n[it cannot vouch for its own typo] — the property this guard was missing");
    // Shipped without this, the guard switched itself off. The vocabulary read every `key = number` under
    // common/units/equipment, which includes the upgrades directory — the artifact under judgement. Write
    // `ok_stat` once and from the NEXT SERVER START it was in the vocabulary and the warning never fired
    // again. The in-process cache hid it, so a same-session re-save still warned and it only showed up cold.
    // That is why this block restarts the app rather than re-posting.
    {
      const selfMod = mkMod("self");
      const a1 = await api.post("/api/equipment/upgrade",
        { modPath: selfMod, id: "self1", cost: "land", max_level: 3, stats: { ok_stat: -2 } });
      rec("the first save warns", !!a1.b.statWarning, a1.b.statWarning);
      const a2 = await api.post("/api/equipment/upgrade",
        { modPath: selfMod, id: "self2", cost: "land", max_level: 3, stats: { ok_stat: -3 } });
      rec("…and so does the second, in the same session", !!a2.b.statWarning, a2.b.statWarning);
      const written = fs.readFileSync(path.join(selfMod, "common", "units", "equipment", "upgrades", "nova_custom_upgrades.txt"), "utf8");
      rec("…and the bad name really is on disk now, where the harvest would find it",
        (written.match(/ok_stat/g) || []).length >= 2, written.slice(0, 200));
      api.stop(); api = null;
      const cold = await serve(createApp()); // a fresh process-equivalent: nothing cached
      try {
        const a3 = await cold.post("/api/equipment/upgrade",
          { modPath: selfMod, id: "self3", cost: "land", max_level: 3, stats: { ok_stat: -4 } });
        rec("…and a COLD start still warns, rather than reading its own file back as proof",
          !!a3.b.statWarning, a3.b.statWarning || "(SILENT — the guard certified its own typo)");
      } finally { cold.stop(); }
      api = await serve(createApp());
    }

    console.log("\n[the mod's own vocabulary] counts too");
    const mod2 = mkMod("m2");
    fs.mkdirSync(path.join(mod2, "common", "units"), { recursive: true });
    fs.writeFileSync(path.join(mod2, "common", "units", "nua_unit.txt"),
      "sub_units = {\n\tnua_squad = {\n\t\tnua_invented_stat = 1.5\n\t\tdefault_morale = 0.3\n\t}\n}\n", "utf8");
    const own = await api.post("/api/equipment/upgrade",
      { modPath: mod2, id: "nua_own", cost: "land", max_level: 2, stats: { nua_invented_stat: 0.1 } });
    rec("a stat the mod itself declares is not called wrong", own.b.ok && !own.b.statWarning, own.b.statWarning);
    const ownBad = await api.post("/api/equipment/upgrade",
      { modPath: mod2, id: "nua_own2", cost: "land", max_level: 2, stats: { still_not_a_stat: 0.1 } });
    rec("…while a name nobody declares still is", /still_not_a_stat/.test(ownBad.b.statWarning || ""), ownBad.b.statWarning);

    console.log("\n[the write itself] is unchanged");
    const written = fs.readFileSync(path.join(mod, "common", "units", "equipment", "upgrades", "nova_custom_upgrades.txt"), "utf8");
    rec("the flagged upgrade was still written", /nua_bad\s*=\s*\{/.test(written), written.slice(0, 200));
    rec("…with the stat the author typed, not a silently corrected one", /ok_stat = -2/.test(written), written);
    rec("…and the good ones alongside it", /nua_ok1\s*=\s*\{/.test(written) && /default_morale = 0\.2/.test(written), written.slice(0, 400));
    api.stop(); api = null;

    console.log("\n[measured, not assumed] the false-positive rate against both corpora");
    for (const [name, root] of [["vanilla", VANILLA], ["Millennium Dawn", MD]]) {
      if (!fs.existsSync(path.join(root, "common", "units", "equipment", "upgrades"))) {
        console.log(`  --   ${name} not installed; skipping`);
        continue;
      }
      const uses = upgradeStatUses(root);
      const capi = await serve(createApp());
      const cmod = mkMod("corp-" + name.replace(/\W/g, ""));
      try {
        const names = [...uses.keys()];
        // One save carrying every stat name the corpus uses — whatever comes back flagged is the FP set.
        const stats = {}; for (const k of names) stats[k] = 0.1;
        const r = await capi.post("/api/equipment/upgrade",
          { modPath: cmod, id: "corpus_probe", cost: "land", max_level: 1, stats });
        const flagged = (r.b.unknownStats || []).filter((k) => k !== "max_level" && k !== "cost");
        const flaggedUses = flagged.reduce((a, k) => a + (uses.get(k) || 0), 0);
        const totalUses = [...uses.values()].reduce((a, b) => a + b, 0);
        rec(`${name}: none of its ${names.length} upgrade stat names over ${totalUses} uses are flagged`,
          flagged.length === 0, { flagged, flaggedUses });
        rec(`…and the corpus is big enough for that to mean something (${names.length} names)`,
          names.length >= 25, names.length);
      } finally { capi.stop(); }
    }

    console.log("\n[the client] surfaces it instead of closing over the top of it");
    // These check SHAPE as a proxy for behaviour, so they must be anchored on the part that carries the
    // behaviour and not on the exact `if` that happened to be there. #an-upgrade-attached-to-nothing added a
    // second reason to keep the editor open — an upgrade no equipment lists, which the game will never offer
    // and which is just as invisible as a stat HOI4 stops on — so the condition became
    //     if (r.statWarning || (r.notes || []).length)
    // and the status text a ternary. What must stay true is unchanged and is what is asserted: the warning is
    // read, it reaches the status line prefixed, and the editor is left open to correct it.
    rec("army.js reads the warning", /if \(r\.statWarning\b/.test(ARMY), "not read");
    rec("…shows it in the status line", /"⚠ " \+ r\.statWarning/.test(ARMY), "not shown");
    rec("…leaves the editor open so it can be corrected",
      /"⚠ " \+ r\.statWarning[\s\S]{0,300}?btn\.disabled = false;/.test(ARMY), "auto-closes");
    rec("…and still auto-closes on a clean save",
      /scheduleDsgClose\(ov, 900\)/.test(ARMY), "clean save no longer closes");
    rec("army.js parses", (() => { try { new Function(ARMY); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(ARMY); return "ok"; } catch (e) { return String(e.message); } })());
    rec("…and is versioned so the change ships",
      /army\.js\?v=\d+/.test(fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8")), "no version");

    console.log("\n[back-out] accept any identifier again");
    {
      const built = controlApp("novocab", [[
        "      const unknown = unknownUpgradeStats(stats, activeRoot);",
        "      const unknown = [];"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cmod = mkMod("ctl");
          const c = await capi.post("/api/equipment/upgrade",
            { modPath: cmod, id: "ctl_bad", cost: "land", max_level: 3, stats: { ok_stat: -2 } });
          rec("…the control still writes the upgrade", c.b.ok === true, c.b);
          rec("…and says nothing about the stat HOI4 will stop on", !c.b.statWarning, c.b.statWarning);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== upgrade stat vocabulary: ${checks} checks, ${fails.length} failed ===`);
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
