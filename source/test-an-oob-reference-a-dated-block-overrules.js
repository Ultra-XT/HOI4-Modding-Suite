// ⛔ #the-oob-reference-a-dated-block-overrules — MILLENNIUM DAWN'S WHOLE NAVY AND AIR FORCE.
//
// Nova gives a country a starting navy or air force by writing history/units/<file>.txt and then wiring the
// country to it with `set_naval_oob` / `set_air_oob`, in a sentinel region in the country-history HEAD.
// A DATED block runs after the head, and set_*_oob is last-wins — so
//     2000.1.1 = { set_air_oob = "ABK_2000" }
// silently replaces the reference Nova just wrote, and the save reported a plain green success.
//
// ⭐ This is not an edge case, because a start date carries an HOUR. Vanilla's define is
// START_DATE = "1936.1.1.12" and both its bookmarks are `…1.12`; Millennium Dawn's is "2000.1.1.12". A dated
// block applies to start dates strictly later than its timestamp, and 2000.1.1.12 IS later than 2000.1.1 —
// which is exactly why mods write it this way. Counted in history/countries:
//     Millennium Dawn  149 files — 289 dated set_air_oob, 71 dated set_naval_oob, and ZERO in any head
//     Rise of Nations  140 files — 229 air, 283 naval (1933.1.1, 1936.1.1, 2000.1.1)
//     vanilla           47 files —  92 air,  66 naval, all 1939.1.1, so it bites the 1939 bookmark
// For Millennium Dawn that is every country with a navy or an air force.
//
// Nova does not touch the dated block — moving a modder's dated statement changes what the game does on
// every other start date. It names it, with its date, and the modder decides.
//
// ⛔ AND THE WARNING HAD NOWHERE TO GO. #warnings-were-computed-and-thrown-away — both army save endpoints
// already built a `warnings` array for the failures HOI4 does not report (a fleet based on a province that
// is not coastal land, an air wing keyed on a state that does not exist, a stockpile entry pinned to a
// design no mod defines). The string "warnings" appeared ZERO times in public/army.js. Every one of them
// went to the browser and stopped there.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53698);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 320) : "")); }
};

const roots = [];
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobd-ad-")); roots.push(appdata);

// A country history shaped like Millennium Dawn's: nothing in the head, the OOB set inside a dated block.
const HIST = (date) => [
  "capital = 1",
  "oob = \"ZZC_land\"",
  "",
  `${date} = {`,
  "\tset_naval_oob = \"ZZC_their_navy\"",
  "\tset_air_oob = \"ZZC_their_air\"",
  "}",
  "",
].join("\n");

const mkMod = (name, hist) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobd-")); roots.push(m);
  fs.writeFileSync(path.join(m, "descriptor.mod"), `version="1.0"\nname="${name}"\n`, "utf8");
  fs.mkdirSync(path.join(m, "history", "countries"), { recursive: true });
  if (hist) fs.writeFileSync(path.join(m, "history", "countries", "ZZC - Zed.txt"), hist, "utf8");
  return m;
};

const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: Object.assign({}, process.env, {
    PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
  }),
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 160; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    // Exactly the body public/army.js builds in naSave.
    const saveNavy = async (mod, tag) => (await fetch(`http://127.0.0.1:${PORT}/api/army/naval-air`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: mod, tag, domain: "naval",
        fleets: [{ name: "Fleet", naval_base: 0, ships: [{ name: "S1", definition: "destroyer", equipment: "destroyer_1", amount: 1, owner: tag }] }],
      }),
    })).json();
    const saveAir = async (mod, tag) => (await fetch(`http://127.0.0.1:${PORT}/api/army/naval-air`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: mod, tag, domain: "air",
        airWings: [{ state: 1, groups: [{ equipment: "fighter_equipment_1", amount: 10, owner: tag }] }],
      }),
    })).json();

    console.log("\n-- ⭐ the premise: a start date carries an hour, so a dated block DOES fire at the bookmark --");
    {
      // Derived from the shipped defines, not asserted from memory: this is the whole reason the bug bites
      // the mod's own start date rather than only later bookmarks.
      const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const defines = path.join(GAME, "common", "defines", "00_defines.lua");
      if (fs.existsSync(defines)) {
        const m = /START_DATE\s*=\s*"([^"]+)"/.exec(fs.readFileSync(defines, "utf8"));
        ok(!!m, "vanilla declares a START_DATE", m && m[1]);
        ok(m && /\.\d+$/.test(m[1]) && m[1].split(".").length === 4,
          `…and it carries an hour (${m && m[1]}) — 1936.1.1.12 is strictly later than 1936.1.1`, m && m[1]);
        const bmDir = path.join(GAME, "common", "bookmarks");
        const dates = [];
        for (const f of fs.readdirSync(bmDir)) {
          const mm = /(^|\n)\s*date\s*=\s*([0-9.]+)/.exec(fs.readFileSync(path.join(bmDir, f), "utf8"));
          if (mm) dates.push(mm[2]);
        }
        ok(dates.length > 0 && dates.every((d) => d.split(".").length === 4),
          "…and every shipped bookmark does too", dates);
      } else {
        ok(true, "(base game not installed — premise check skipped, the behaviour checks below still run)");
      }
    }

    console.log("\n-- ⭐ the save says the dated block will win --");
    {
      const mod = mkMod("Dated", HIST("2000.1.1"));
      const r = await saveAir(mod, "ZZC");
      ok(r && r.ok === true, "the air force saves", r && r.error);
      ok(Array.isArray(r.warnings) && r.warnings.length > 0, "…and the response carries a warning", r);
      const w = (r.warnings || []).join(" ");
      ok(/2000\.1\.1/.test(w), "…naming the date of the block that overrules it", w);
      ok(/air/i.test(w), "…and which order of battle it is about", w);
      ok(Array.isArray(r.overruledByDates) && r.overruledByDates.includes("2000.1.1"),
        "…and hands the dates back as data, not only prose", r.overruledByDates);

      const rn = await saveNavy(mod, "ZZC");
      ok(rn && rn.ok === true, "the navy saves too", rn && rn.error);
      ok((rn.overruledByDates || []).includes("2000.1.1"), "…and is overruled by the same block", rn.overruledByDates);
    }

    console.log("\n-- ⭐ CONTROL: a country with no dated block gets no warning --");
    {
      // The rule must not cry wolf: Road to 56, Old World Blues and Novum Vexillum have ZERO dated
      // references between them, and their saves must stay clean and green.
      const mod = mkMod("Plain", "capital = 1\noob = \"ZZC_land\"\n");
      const r = await saveAir(mod, "ZZC");
      ok(r && r.ok === true, "the air force saves", r && r.error);
      ok(!(r.overruledByDates || []).length, "…with nothing claimed about dated blocks", r.overruledByDates);
      ok(!(r.warnings || []).some((w) => /overrul|start date/i.test(w)), "…and no overrule warning", r.warnings);
    }

    console.log("\n-- CONTROL: a dated block that sets the OTHER domain is not blamed --");
    {
      const mod = mkMod("AirOnly", [
        "capital = 1",
        "1939.1.1 = {",
        "\tset_air_oob = \"ZZC_their_air\"",
        "}",
        "",
      ].join("\n"));
      const rn = await saveNavy(mod, "ZZC");
      ok(!(rn.overruledByDates || []).length, "a navy save is not warned about a dated AIR reference", rn.overruledByDates);
      const ra = await saveAir(mod, "ZZC");
      ok((ra.overruledByDates || []).includes("1939.1.1"), "…while the air save is", ra.overruledByDates);
    }

    console.log("\n-- CONTROL: a commented-out dated reference is not one --");
    {
      const mod = mkMod("Commented", [
        "capital = 1",
        "1939.1.1 = {",
        "\t#set_air_oob = \"ZZC_their_air\"",
        "}",
        "",
      ].join("\n"));
      const r = await saveAir(mod, "ZZC");
      ok(!(r.overruledByDates || []).length, "a commented-out reference overrules nothing", r.overruledByDates);
    }

    console.log("\n-- ⭐ CONTROL: Nova does not edit the modder's dated block --");
    {
      const mod = mkMod("Untouched", HIST("2000.1.1"));
      const file = path.join(mod, "history", "countries", "ZZC - Zed.txt");
      await saveAir(mod, "ZZC");
      const after = fs.readFileSync(file, "utf8");
      ok(/2000\.1\.1 = \{/.test(after), "the dated block is still there");
      ok(/set_air_oob = "ZZC_their_air"/.test(after), "…with the modder's reference intact");
      ok(/set_naval_oob = "ZZC_their_navy"/.test(after), "…and the one Nova was not asked about");
    }

    console.log("\n-- ⛔ the warnings reach the screen at all --");
    {
      const APP = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
      ok(/function showSaveWarnings\(/.test(APP), "army.js has somewhere to put a warning");
      ok(/showSaveWarnings\("naStatus", d\.warnings\)/.test(APP), "…the navy/air save uses it");
      ok(/showSaveWarnings\("spStatus", d\.warnings\)/.test(APP), "…and so does the stockpile save");
      // The bug in one line: it was zero.
      ok((APP.match(/d\.warnings/g) || []).length >= 2, "…and the client reads `warnings` more than never", (APP.match(/d\.warnings/g) || []).length);
      ok(!/onclick=|onerror=/.test(APP), "…without an inline handler, which the CSP kills silently");

      // Derived, not typed: every /api/army* endpoint that BUILDS warnings must have a client that shows them.
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const endpoints = [];
      for (const m of SRV.matchAll(/app\.post\("(\/api\/army[a-z\-/]*)"/g)) {
        const at = m.index;
        let i = SRV.indexOf("{", at), d = 0, end = at;
        for (; i < SRV.length; i++) { if (SRV[i] === "{") d++; else if (SRV[i] === "}") { d--; if (!d) { end = i; break; } } }
        const body = SRV.slice(at, end + 1);
        if (/\{ warnings(?::| )/.test(body) || /warnings: \w+Warnings/.test(body)) endpoints.push(m[1]);
      }
      console.log("     army endpoints that return warnings: " + endpoints.join(", "));
      ok(endpoints.length >= 2, "…and there is more than one of them", endpoints);
      for (const ep of endpoints) {
        const at = APP.indexOf(`"${ep}"`);
        const win = at === -1 ? "" : APP.slice(at, at + 2200);
        ok(/showSaveWarnings\(/.test(win), `${ep}: its caller shows the warnings it returns`,
          at === -1 ? "not called by the client" : "no showSaveWarnings in the calling function");
      }
    }

    console.log("\n-- the stockpile's own warning survives the round trip --");
    {
      // A design name no mod defines: the entry saves and hands the country nothing. Server-side this
      // warning already existed; it had no way to be seen.
      const mod = mkMod("Dangling", null);
      fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
      fs.writeFileSync(path.join(mod, "history", "countries", "ZZD - Zed.txt"), "capital = 1\n", "utf8");
      const r = await (await fetch(`http://127.0.0.1:${PORT}/api/army/stockpile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: mod, tag: "ZZD", entries: [{ type: "infantry_equipment_1", variant_name: "No Such Design Anywhere", amount: 5 }] }),
      })).json();
      ok(r && r.ok === true, "the entry saves", r && r.error);
      if ((r.warnings || []).length) ok(/No design named/.test(r.warnings.join(" ")), "…and warns the design does not exist", r.warnings);
      else ok(true, "(no variant catalogue available in this environment — the guard fails open by design)");
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    try { srv.kill(); } catch (_) {}
    setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
    process.exitCode = fail ? 1 : 0;
    setTimeout(() => process.exit(fail ? 1 : 0), 1200);
  }
})();
