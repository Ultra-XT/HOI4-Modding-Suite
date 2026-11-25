// #country-techs-merge-ignores-replaced-vanilla-file — THE RESEARCH TAB LISTED TECHS THE GAME WILL NOT GRANT,
// AND SAVE WROTE THEM INTO THE MOD.
//
// getCountryTechnologies() read the game's history file for the tag and merged its technologies into the
// country's list unconditionally. HOI4 does not work that way. It loads history/countries by FILENAME — "in
// case of files with the same name in the same location, the load order decides which one gets used" — and a
// descriptor's `replace_path = "history/countries"` drops the base game's copies of that directory outright.
//
// Millennium Dawn does BOTH: it declares that replace_path, and it ships 147 country files under vanilla's
// exact filenames. So the research tab showed Abkhazia 69 starting technologies when the mod grants 35, and
// pressing Save wrote all 69 back into MD's own file as unconditional top-level grants — gwtank,
// early_battleship and infantry_weapons1 handed to a modern-day total conversion. 184 of MD's 386 country
// files were rewritten by a save that changed nothing.
//
// The third shape is the one that must NOT change: MD also ships 48 files whose name differs from vanilla's
// for the same tag (`ALT - Altai.txt` beside `ALT - Altai Republic.txt`). Both of those load and both run, so
// the union really is what the country starts with. Nova still shows it — it just no longer copies the other
// file's grants into the mod's own file, because writing them changes nothing and removing them there cannot
// work. Those ids are reported as unmanaged instead.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ctinh-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VDIR = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/countries";
const MDDIR = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/history/countries";
const MDDESC = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/descriptor.mod";
const HAVE_VANILLA = fs.existsSync(VDIR);

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

// The tag is real so a vanilla file exists to inherit from; the mod's own grant is one of vanilla's so the
// difference between "inherited" and "declared here" is unambiguous.
const TAG = "ALB";
const VNAME = "ALB - Albania.txt";
const MODBLOCK = ["capital = 44", "", "# Starting tech", "set_technology = {", "\tinfantry_weapons = 1", "}", ""].join("\n");

function mkMod(name, fileName, replacePath) {
  const dir = path.join(ROOT, name);
  const hist = path.join(dir, "history", "countries");
  fs.mkdirSync(hist, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n` + (replacePath ? 'replace_path = "history/countries"\n' : ""), "utf8");
  fs.writeFileSync(path.join(hist, fileName), MODBLOCK, "utf8");
  return { dir, file: path.join(hist, fileName) };
}

// Ids granted by the `set_technology` blocks of a history file — NOT every `x = 1` line, which also picks up
// ideologies out of set_popularities.
function techIdsIn(text) {
  const out = [];
  const re = /set_technology\s*=\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = text.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") d += 1;
      else if (text[i] === "}") { d -= 1; if (!d) { close = i; break; } }
    }
    if (close === -1) break;
    for (const mm of text.slice(open + 1, close).matchAll(/([A-Za-z0-9_]+)\s*=\s*1\b/g)) out.push(mm[1]);
    re.lastIndex = close;
  }
  return [...new Set(out)];
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-ct-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43761;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  const api = await serve(createApp());
  try {
    console.log("\n[ground truth] how Millennium Dawn's country files sit against vanilla's");
    if (!HAVE_VANILLA || !fs.existsSync(MDDIR)) console.log("  (skipped — corpora not installed)");
    else {
      const desc = fs.readFileSync(MDDESC, "utf8");
      rec("MD's descriptor replace_path's history/countries",
        /replace_path\s*=\s*"history\/countries\/?"/.test(desc), desc.slice(0, 120));
      const vf = new Set(fs.readdirSync(VDIR));
      const vtag = new Set([...vf].map((f) => f.slice(0, 3).toUpperCase()));
      const mf = fs.readdirSync(MDDIR);
      let exact = 0, sameTagOtherName = 0;
      for (const f of mf) {
        if (vf.has(f)) exact++;
        else if (vtag.has(f.slice(0, 3).toUpperCase())) sameTagOtherName++;
      }
      // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn and the fresh copy ships a different count of
      // each shape than the 147 and 48 pinned here, so both checks failed while nothing in Nova had changed. The
      // fixtures below do not read MD; what this ground truth establishes is that a real total conversion ships
      // BOTH shapes. That is asserted, and the counts are printed rather than typed.
      console.log(`     MD: ${mf.length} country files — ${exact} under vanilla's exact filename, ${sameTagOtherName} under a vanilla tag with another filename`);
      rec("…some MD country files use vanilla's exact filename (the mod's copy replaces the game's)", exact > 0, exact);
      rec("…and some share a vanilla tag under a different filename (without replace_path both would load)",
        sameTagOtherName > 0, sameTagOtherName);
    }

    if (!HAVE_VANILLA) {
      console.log("\n(vanilla not installed — the behaviour sections need a real history file to inherit from)");
    } else {
      const vanillaIds = techIdsIn(fs.readFileSync(path.join(VDIR, VNAME), "utf8")).filter((id) => id !== "infantry_weapons");
      rec("vanilla's Albania grants technologies beyond the one the fixture declares", vanillaIds.length >= 3, vanillaIds);

      const shown = async (dir) => {
        const g = await api.get(`/api/technologies/country-techs?tag=${TAG}&modPath=${encodeURIComponent(dir)}`);
        return (g.b && g.b.techs) || [];
      };
      const leaked = (ids) => vanillaIds.filter((id) => ids.includes(id));

      console.log("\n[the bug] a mod file that SHADOWS vanilla's — vanilla's copy never loads");
      const same = mkMod("same", VNAME, false);
      let ids = await shown(same.dir);
      rec("only the mod's own grant is listed", ids.length === 1 && ids[0] === "infantry_weapons", ids);
      rec("…no vanilla technology leaks in", leaked(ids).length === 0, leaked(ids));
      let before = fs.readFileSync(same.file, "utf8");
      let r = await api.post("/api/technologies/save-country-techs", { modPath: same.dir, tag: TAG, techIds: ids });
      rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
      rec("…and wrote nothing", fs.readFileSync(same.file, "utf8") === before, fs.readFileSync(same.file, "utf8"));

      console.log("\n[the bug] a mod that replace_path's history/countries — the whole vanilla directory is dead");
      const rp = mkMod("rp", "ALB - Albania Reborn.txt", true);
      ids = await shown(rp.dir);
      rec("only the mod's own grant is listed", ids.length === 1 && ids[0] === "infantry_weapons", ids);
      rec("…even though the filename differs, because the directory itself is replaced", leaked(ids).length === 0, leaked(ids));

      console.log("\n[control] a DIFFERENT filename under the same tag — both files load, so both count");
      const diff = mkMod("diff", "ALB - Albania Reborn.txt", false);
      ids = await shown(diff.dir);
      rec("vanilla's technologies ARE still listed", leaked(ids).length === vanillaIds.length, { shown: ids, want: vanillaIds });
      before = fs.readFileSync(diff.file, "utf8");
      r = await api.post("/api/technologies/save-country-techs", { modPath: diff.dir, tag: TAG, techIds: ids });
      rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
      rec("…and did NOT copy the other file's grants into this one", fs.readFileSync(diff.file, "utf8") === before,
        fs.readFileSync(diff.file, "utf8"));
      r = await api.post("/api/technologies/save-country-techs", {
        modPath: diff.dir, tag: TAG, techIds: ids.filter((id) => id !== vanillaIds[0]),
      });
      rec("…and removing an inherited tech says so instead of claiming success silently",
        !!(r.b && (r.b.unmanagedTechs || []).includes(vanillaIds[0])), r.b);

      console.log("\n[control] a REAL edit to the mod's own block still lands");
      r = await api.post("/api/technologies/save-country-techs", { modPath: same.dir, tag: TAG, techIds: ["infantry_weapons", "tech_engineers"] });
      const t = fs.readFileSync(same.file, "utf8");
      rec("the added tech was written", /tech_engineers = 1/.test(t), t);
      rec("…under the comment that documents the block", /# Starting tech\nset_technology = \{/.test(t), t);
    }

    api.stop();

    // -----------------------------------------------------------------------------------------------
    console.log("\n[back-out] each guard, removed one at a time");
    if (!HAVE_VANILLA) console.log("  (skipped — needs vanilla)");
    else {
      const vanillaIds = techIdsIn(fs.readFileSync(path.join(VDIR, VNAME), "utf8")).filter((id) => id !== "infantry_weapons");
      const CONTROLS = [
        {
          label: "shadow",
          why: "back out the same-filename shadow test",
          pairs: [["        && path.basename(modOwn.path).toLowerCase() === path.basename(gameFile.path).toLowerCase());",
            "        && false);"]],
          dir: () => mkMod("ctl-shadow", VNAME, false).dir,
          note: "vanilla's techs are listed again for a file that replaces it",
        },
        {
          label: "replacepath",
          why: "back out the replace_path check",
          pairs: [["    if (gameRoot && !replacesHistory) {", "    if (gameRoot) {"]],
          dir: () => mkMod("ctl-rp", "ALB - Albania Reborn.txt", true).dir,
          note: "a replaced directory is read anyway",
        },
      ];
      for (const c of CONTROLS) {
        const built = controlApp(c.label, c.pairs);
        if (built.error) { rec(`the control patched cleanly (${c.label})`, false, built.error); continue; }
        const capi = await serve(built.createApp());
        try {
          const g = await capi.get(`/api/technologies/country-techs?tag=${TAG}&modPath=${encodeURIComponent(c.dir())}`);
          const ids = (g.b && g.b.techs) || [];
          rec(`[${c.label}] ${c.why} → ${c.note}`, vanillaIds.some((id) => ids.includes(id)), ids);
        } finally { capi.stop(); }
      }
      // The writer's half needs its own control: with it backed out, the echo is written back.
      const built = controlApp("inheritwrite", [[
        "    const sorted = requested.filter((id) => headOwned.has(id) || (!datedTechs.has(id) && !inherited.has(id))).sort();",
        "    const sorted = requested.filter((id) => headOwned.has(id) || !datedTechs.has(id)).sort();"]]);
      if (built.error) rec("the control patched cleanly (inheritwrite)", false, built.error);
      else {
        const m = mkMod("ctl-iw", "ALB - Albania Reborn.txt", false);
        const capi = await serve(built.createApp());
        try {
          const g = await capi.get(`/api/technologies/country-techs?tag=${TAG}&modPath=${encodeURIComponent(m.dir)}`);
          const ids = (g.b && g.b.techs) || [];
          await capi.post("/api/technologies/save-country-techs", { modPath: m.dir, tag: TAG, techIds: ids });
          const t = fs.readFileSync(m.file, "utf8");
          rec("[inheritwrite] back out the inherited-tech filter → the other file's grants are copied in",
            vanillaIds.some((id) => new RegExp(`\\b${id} = 1`).test(t)), t);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== country techs inherited file: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.rmSync(p, { force: true }); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
