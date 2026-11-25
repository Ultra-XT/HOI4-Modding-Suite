// #officer-corps-missing-glow — A SPIRIT IN air_force_academy_spirit BROKE THE OFFICER CORPS PANEL.
//
// Reported from play, with a screenshot of a mangled Officer Corps screen and a 31MB error.log in which
// 164,004 of 164,685 lines were one message repeating every frame:
//
//   countryofficercorpview.gui (line 1408): Could not find "air_force_academy_spirit_glow"
//   in window air_force_academy_spirit_entry
//
// The officer-corps screen draws one entry per spirit, and each entry template carries an iconType named
// <category>_glow that the game looks up BY NAME. Vanilla's gui defines nine *_spirit_entry templates and a
// matching *_spirit_glow for eight of them. air_force_academy_spirit_entry has no glow; Paradox left it out.
//
// It had never surfaced because vanilla puts ZERO ideas in that category, so the template is never
// instantiated. It is nonetheless a real category — declared in common/idea_tags/00_idea.txt — and Nova
// offers it, so the first spirit a modder puts there starts the per-frame error.
//
// I first told the user this was "vanilla's bug, not Nova's". That was the wrong call: nothing reaches the
// broken template unless Nova writes a spirit into that category, and Nova is the only thing positioned to
// supply what is missing. It now writes the element into the mod's own copy, modelled on the eight vanilla
// already ships.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ocg-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const VGUI = path.join(GAME, "interface", "countryofficercorpview.gui");
const VTAGS = path.join(GAME, "common", "idea_tags", "00_idea.txt");

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
  const p = path.join(__dirname, `.ctl-ocg-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const balanced = (t) => {
  const s = t.replace(/#[^\n]*/g, "");
  return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length;
};
function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}
const guiOf = (mod) => path.join(mod, "interface", "countryofficercorpview.gui");

let PORT = 44480;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const saveSpirit = (api, mod, id, category, effectId) => api.post("/api/ideas/upsert-definition", {
  modPath: mod, ideaId: id, name: id, mode: "create", category,
  targetRelativeFile: "common/ideas/nova_officer.txt",
  selectedEffects: [{ effectId, values: { value: 0.05 } }],
});

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(VGUI)) {
      console.log("\n  (skipped — vanilla not installed)");
      console.log(`\n=== officer corps glow: ${checks} checks, 0 failed ===`);
      return;
    }

    console.log("\n[ground truth] vanilla defines the category but not its glow");
    const vgui = fs.readFileSync(VGUI, "utf8");
    const names = new Set([...vgui.matchAll(/name\s*=\s*"([a-z_]+)"/g)].map((m) => m[1]));
    const entries = [...names].filter((n) => /_spirit_entry$/.test(n));
    rec("vanilla ships nine officer-corps spirit entries", entries.length === 9, entries.length);
    const noGlow = entries.map((e) => e.replace(/_entry$/, "")).filter((s) => !names.has(s + "_glow"));
    rec("exactly one of them has no glow", noGlow.length === 1, noGlow);
    rec("…and it is air_force_academy_spirit", noGlow[0] === "air_force_academy_spirit", noGlow);
    if (fs.existsSync(VTAGS)) {
      rec("…which is nonetheless a real idea category",
        /(^|\n)\s*air_force_academy_spirit\s*=\s*\{/.test(fs.readFileSync(VTAGS, "utf8")), "not declared");
    }

    api = await serve(createApp());

    console.log("\n[the fix] saving a spirit there supplies the missing element");
    const mod = mkMod("m");
    rec("the mod owns no officer-corps gui to begin with", !fs.existsSync(guiOf(mod)), "already present");
    const r = await saveSpirit(api, mod, "nova_weather_flying", "air_force_academy_spirit", "air_range_factor");
    rec("the spirit saves", r.s === 200 && r.b.ok, r.b);
    rec("…and the save says what it repaired", /officer-corps/i.test(String(r.b.guiRepair || "")), r.b.guiRepair);
    rec("the mod now owns a gui copy", fs.existsSync(guiOf(mod)), "no copy written");
    const g = fs.existsSync(guiOf(mod)) ? fs.readFileSync(guiOf(mod), "utf8") : "";
    rec("the missing glow is present", /name\s*=\s*"air_force_academy_spirit_glow"/.test(g), "absent");
    rec("…using the sprite the eight working ones use",
      /air_force_academy_spirit_glow[\s\S]{0,160}GFX_spirit_glow/.test(g), "wrong sprite");
    rec("…placed inside the entry, after its button",
      /"air_force_academy_spirit_entry"[\s\S]{0,600}?name = "button"[\s\S]{0,300}?air_force_academy_spirit_glow/.test(g),
      "not in the entry");
    rec("the file is brace-balanced", balanced(g), "unbalanced");
    rec("all nine categories now have a glow",
      [...g.matchAll(/name\s*=\s*"([a-z_]+_spirit_glow)"/g)].length === 9,
      [...g.matchAll(/name\s*=\s*"([a-z_]+_spirit_glow)"/g)].map((m) => m[1]));

    console.log("\n[idempotence] a second spirit in the same category adds nothing more");
    const r2 = await saveSpirit(api, mod, "nova_night_flying", "air_force_academy_spirit", "air_range_factor");
    const g2 = fs.readFileSync(guiOf(mod), "utf8");
    rec("the second save reports no repair", r2.s === 200 && !r2.b.guiRepair, r2.b.guiRepair);
    rec("…and the glow is still written exactly once",
      (g2.match(/air_force_academy_spirit_glow/g) || []).length === 1,
      (g2.match(/air_force_academy_spirit_glow/g) || []).length);
    rec("…and the file is still balanced", balanced(g2), "unbalanced");

    console.log("\n[no over-reach] a category that already has a glow is left alone");
    const mod2 = mkMod("m2");
    const r3 = await saveSpirit(api, mod2, "nova_army_thing", "army_spirit", "army_org_factor");
    rec("the spirit saves", r3.s === 200 && r3.b.ok, r3.b);
    rec("…with no repair reported", !r3.b.guiRepair, r3.b.guiRepair);
    rec("…and no gui copy dumped into the mod", !fs.existsSync(guiOf(mod2)), "a copy was written");

    console.log("\n[no over-reach] a plain country spirit touches nothing");
    const mod3 = mkMod("m3");
    const r4 = await saveSpirit(api, mod3, "nova_country_thing", "country", "army_org_factor");
    rec("the spirit saves", r4.s === 200 && r4.b.ok, r4.b);
    rec("…and no gui copy is written", !fs.existsSync(guiOf(mod3)), "a copy was written");
    api.stop(); api = null;

    console.log("\n[back-out] stop supplying the element");
    {
      const built = controlApp("noglow", [[
        "      try { guiFix = ensureOfficerCorpsSpiritGlow(activeRoot, category); } catch (_) {}",
        "      try { guiFix = null; } catch (_) {}"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const c = await saveSpirit(capi, cmod, "nova_weather_flying", "air_force_academy_spirit", "air_range_factor");
          rec("…and the spirit still saves", c.s === 200 && c.b.ok, c.b);
          rec("…but the officer-corps panel is left broken",
            !fs.existsSync(guiOf(cmod)) || !/air_force_academy_spirit_glow/.test(fs.readFileSync(guiOf(cmod), "utf8")),
            "the glow was written anyway");
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== officer corps glow: ${checks} checks, ${fails.length} failed ===`);
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
