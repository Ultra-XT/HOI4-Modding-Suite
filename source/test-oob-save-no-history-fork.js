// #oob-save-forks-country-history — MATERIALISE A FILE TO WRITE IT, NEVER TO READ IT.
//
// /api/army/save wants one thing from the country's history: to inject `oob = "…"` when the country loads no
// land OOB yet. It asked for the file with ensureCountryHistoryFileInMod BEFORE deciding whether it needed
// to write, and that helper COPIES the file into the active mod when the mod does not already own it.
//
// So every save forked the layer below — including the saves that then wrote nothing at all. history/countries
// loads BY FILENAME, so the copy shadows the original permanently: the country is frozen at whatever the base
// game or base mod said on the day the OOB was saved, and the response never mentions it.
//
// Measured by hand on an add-on: a no-edit save answers {"ok":true,…,"oobWired":true}; the add-on gains
// "history/countries/<TAG> - X.txt", byte-identical to the base mod's — zero content written. Change the base
// mod's capital from 10 to 42 afterwards and the add-on still reads 10, while an un-forked add-on reads 42.
//
// THIRD CALLER OF A GUARD THIS FILE ALREADY CARRIES TWICE. /api/history/save-country-details has a comment
// describing exactly this damage — "Opening Germany and pressing Save Details without touching a field
// answered {ok:true, unchanged:true} … while parking all 57,568 bytes of vanilla's GER - Germany.txt in the
// mod" — and it ends "The sibling below (set-startup) already refuses to materialise for a no-op, with a
// comment naming the same damage — but only on its remove path. Same guard, one caller short, again."
// This was the caller they were short.
//
// The write path is the half that must survive: a country with no OOB still has to get one, and that DOES
// mean taking ownership of the file. Most of the checks below are spent there.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobfork-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "OF" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const put = (dir, rel, txt) => {
  const p = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, txt, "utf8");
};
const histFiles = (dir) => {
  const d = path.join(dir, "history", "countries");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};

const OOB_TEXT = [
  "division_template = {",
  '\tname = "Test Div"',
  "\tregiments = { infantry = { x = 0 y = 0 } }",
  "}",
  "units = {",
  '\tdivision = { name = "1st" location = 1 division_template = "Test Div" start_experience_factor = 0.1 }',
  "}",
  "",
].join("\n");
const SAVE_BODY = {
  templates: [{ name: "Test Div", regiments: [{ type: "infantry", x: 0, y: 0 }] }],
  divisions: [{ name: "1st", location: 1, division_template: "Test Div" }],
};

let PORT = 49870;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      details: (mod, tag) => fetch("http://127.0.0.1:" + PORT + "/api/history/country-details?modPath=" + encodeURIComponent(mod) + "&tag=" + tag)
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      save: (b) => fetch("http://127.0.0.1:" + PORT + "/api/army/save", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[the corpus] how often a save has nothing to write");
    {
      const d = path.join(GAME, "history", "countries");
      if (fs.existsSync(d)) {
        const files = fs.readdirSync(d).filter((f) => f.endsWith(".txt"));
        let wired = 0;
        for (const f of files) {
          const t = fs.readFileSync(path.join(d, f), "latin1").replace(/#.*$/gm, "");
          if (/\boob\s*=\s*"/.test(t) || /\bset_oob\b/.test(t)) wired++;
        }
        console.log(`  ${wired} of vanilla's ${files.length} countries already load an OOB — for those, this save writes nothing and used to fork anyway`);
        // Not a majority of vanilla (my first version asserted that and was simply wrong), but it is the
        // shape that matters here: a base mod wires far more of them. Millennium Dawn, measured on the
        // installed copy, loads an OOB for 244 of its 386 countries — and an add-on over a total conversion
        // is exactly the case where the base already supplies both the OOB file and the history pointing at
        // it, which is the branch that writes nothing.
        rec("a large share of countries take the no-write path", wired > 100, { wired, total: files.length });
      } else console.log("  (no HOI4 install — corpus skipped)");
    }

    api = await serve(createApp());

    console.log("\n[an add-on whose base mod already wires the OOB] nothing is taken over");
    {
      const base = mkMod(null);
      put(base.dir, "common/country_tags/zz_tags.txt", 'OFA = "countries/OFA - Baseland.txt"\n');
      put(base.dir, "history/units/OFA_1936.txt", OOB_TEXT);
      put(base.dir, "history/countries/OFA - Baseland.txt", 'capital = 10\noob = "OFA_1936"\nset_popularities = { neutrality = 100 }\n');
      const addon = mkMod(base.name);

      const pre = await api.details(addon.dir, "OFA");
      rec("fixture: the add-on reads the base mod's country before any save",
        pre.details && pre.details.capital === 10 && pre.inMod === false, { capital: pre.details && pre.details.capital, inMod: pre.inMod });

      const r = await api.save(Object.assign({ modPath: addon.dir, tag: "OFA", file: "OFA_1936.txt" }, SAVE_BODY));
      rec("the save succeeds", r.ok === true, r);
      rec("…and reports the country as wired", r.oobWired === true, r);
      rec("…without taking over the country history", histFiles(addon.dir).length === 0, histFiles(addon.dir));
      rec("…and never writes to the base mod",
        fs.readFileSync(path.join(base.dir, "history", "countries", "OFA - Baseland.txt"), "utf8").includes("capital = 10"), "base changed");

      // The consequence, end to end: the base mod ships an update and the add-on must still see it.
      const bp = path.join(base.dir, "history", "countries", "OFA - Baseland.txt");
      fs.writeFileSync(bp, fs.readFileSync(bp, "utf8").replace("capital = 10", "capital = 42"), "utf8");
      const post = await api.details(addon.dir, "OFA");
      rec("…so a later base-mod change still reaches the add-on",
        post.details && post.details.capital === 42, { capital: post.details && post.details.capital, inMod: post.inMod });
    }

    console.log("\n[control] an add-on that HAS forked really is frozen — so the check above measures something");
    {
      const base = mkMod(null);
      put(base.dir, "common/country_tags/zz_tags.txt", 'OFB = "countries/OFB - Ctl.txt"\n');
      put(base.dir, "history/countries/OFB - Ctl.txt", 'capital = 10\noob = "OFB_1936"\n');
      const addon = mkMod(base.name);
      // Fork it by hand, exactly as the bug used to.
      put(addon.dir, "history/countries/OFB - Ctl.txt", 'capital = 10\noob = "OFB_1936"\n');
      const bp = path.join(base.dir, "history", "countries", "OFB - Ctl.txt");
      fs.writeFileSync(bp, fs.readFileSync(bp, "utf8").replace("capital = 10", "capital = 42"), "utf8");
      const d = await api.details(addon.dir, "OFB");
      rec("a hand-made fork DOES freeze the country at the old value",
        d.details && d.details.capital === 10, { capital: d.details && d.details.capital, inMod: d.inMod });
    }

    console.log("\n[the write path] a country with no OOB still gets one, and that DOES take ownership");
    {
      const base = mkMod(null);
      put(base.dir, "common/country_tags/zz_tags.txt", 'OFC = "countries/OFC - Fresh.txt"\n');
      put(base.dir, "history/countries/OFC - Fresh.txt", 'capital = 10\nset_popularities = { neutrality = 100 }\n');
      const addon = mkMod(base.name);

      const r = await api.save(Object.assign({ modPath: addon.dir, tag: "OFC", file: "OFC_1936.txt" }, SAVE_BODY));
      rec("the save succeeds", r.ok === true, r);
      rec("…and reports it wired", r.oobWired === true, r);
      rec("…materialising the history, because it genuinely wrote to it", histFiles(addon.dir).length === 1, histFiles(addon.dir));
      const txt = fs.readFileSync(path.join(addon.dir, "history", "countries", histFiles(addon.dir)[0]), "utf8");
      rec("…with the oob line actually in it", /oob = "OFC_1936"/.test(txt), txt.slice(0, 200));
      rec("…and everything the base mod had preserved", /capital = 10/.test(txt) && /neutrality = 100/.test(txt), txt.slice(0, 200));
      rec("…while the base mod is left alone",
        !/oob = /.test(fs.readFileSync(path.join(base.dir, "history", "countries", "OFC - Fresh.txt"), "utf8")), "base was written to");
    }

    console.log("\n[a standalone mod] unchanged in both directions");
    {
      const solo = mkMod(null);
      put(solo.dir, "common/country_tags/zz_tags.txt", 'OFD = "countries/OFD - Solo.txt"\n');
      put(solo.dir, "history/countries/OFD - Solo.txt", "capital = 10\n");
      const r = await api.save(Object.assign({ modPath: solo.dir, tag: "OFD", file: "OFD_1936.txt" }, SAVE_BODY));
      rec("the save succeeds", r.ok === true, r);
      rec("…and wires the oob into the mod's own file",
        /oob = "OFD_1936"/.test(fs.readFileSync(path.join(solo.dir, "history", "countries", "OFD - Solo.txt"), "utf8")), "not wired");

      const solo2 = mkMod(null);
      put(solo2.dir, "common/country_tags/zz_tags.txt", 'OFE = "countries/OFE - Solo2.txt"\n');
      put(solo2.dir, "history/countries/OFE - Solo2.txt", 'capital = 10\noob = "OFE_other"\n');
      const r2 = await api.save(Object.assign({ modPath: solo2.dir, tag: "OFE", file: "OFE_1936.txt" }, SAVE_BODY));
      rec("a country already loading a DIFFERENT oob is left alone", r2.ok === true && r2.oobWired !== true, r2);
      rec("…and told why", /already loads/.test(String(r2.oobNote || "")), r2.oobNote);
    }

    console.log("\n[an unknown tag] still minted, still explained");
    {
      const mod = mkMod(null);
      const r = await api.save(Object.assign({ modPath: mod.dir, tag: "OFZ", file: "OFZ_1936.txt" }, SAVE_BODY));
      rec("the save succeeds", r.ok === true, r);
      rec("…and says the tag is not in the tag list",
        /not a country in this mod|not in the tag list/.test(String(r.refWarning || "")), r.refWarning || "(none)");
    }

    api.stop(); api = null;
    console.log(`\n=== oob save no history fork: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
